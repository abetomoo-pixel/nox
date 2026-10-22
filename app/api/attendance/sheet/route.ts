// ★便 SH-UI-c C-2（2026-10-22）: 勤怠一覧（店長・オーナー）。POST { storeId, period } → 人ごとの合計表と 1 人 1 か月の行。
//   実働 h・日数・遅刻／当欠・退勤記録なしは **給与と同じ計算**＝computePayrollDraft（preview と同じ）の pay.wHours／wdays／lateN／absentN／missingOutDates を
//   そのまま合計表に使う（別計算を書かない）。行＝lib/nox/payroll/attendance-sheet（同じ関数の列）。読取は利用者の client（RLS）＝owner 全店／manager 自店。
//   DB 書込なし。audit なし（CSV の出力記録は client から呼べる RPC が無い＝0175 行き）。
import { NextResponse } from "next/server";
import { guardPayroll } from "@/lib/nox/payroll/route-guard";
import { computePayrollDraft } from "@/lib/nox/payroll/core";
import { resolvePayrollWindow } from "@/lib/nox/payroll/window";
import { bizDateOf } from "@/lib/nox/biz-date";
import { attendanceDayRowsOf, attendanceSummaryOf, type SheetAttendance, type SheetCorrection, type SheetPunch, type SheetTransport } from "@/lib/nox/payroll/attendance-sheet";

export async function POST(req: Request) {
  const g = await guardPayroll(req);
  if (!g.ok) return NextResponse.json(g.body, { status: g.status });
  try {
    const win = await resolvePayrollWindow(g.admin, g.storeId, g.period);
    const draft = await computePayrollDraft(g.admin, g.supabase, g.storeId, g.period, { previewDefaults: true });
    const basis: "punch" | "shift" = draft.payTimeBasis === "shift" ? "shift" : "punch";
    const todayBiz = bizDateOf(new Date().toISOString(), win.cutoffHm);
    const sb = g.supabase;
    const [castsR, shiftsR, attR, punchR, corrR, trR, penR, storeR] = await Promise.all([
      sb.from("casts").select("id, name, is_active").eq("store_id", g.storeId).order("name"),
      sb.from("shifts").select("cast_id, date, start_hm, end_hm").eq("store_id", g.storeId).eq("status", "confirmed").gte("date", win.periodStart).lte("date", win.periodEnd),
      sb.from("attendance").select("cast_id, date, status, eta, reason, source, updated_at").eq("store_id", g.storeId).gte("date", win.periodStart).lte("date", win.periodEnd),
      sb.from("punches").select("id, cast_id, punched_at, type, source, okuri").eq("store_id", g.storeId).gte("punched_at", win.startTs).lt("punched_at", win.endTs),
      sb.from("punch_corrections").select("cast_id, punch_id, biz_date, kind, before_at, after_at, reason, decision, decided_by, decided_at").eq("store_id", g.storeId).eq("decision", "approved").gte("biz_date", win.periodStart).lte("biz_date", win.periodEnd),
      sb.from("transport").select("*").eq("store_id", g.storeId).gte("biz_date", win.periodStart).lte("biz_date", win.periodEnd),
      sb.from("penalty_config").select("late_grace_min, early_grace_min, over_grace_min").eq("store_id", g.storeId).maybeSingle(),
      sb.from("stores").select("name").eq("id", g.storeId).maybeSingle(),
    ]);
    for (const r of [castsR, shiftsR, attR, punchR, corrR, trR]) if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
    const corrRows = (corrR.data ?? []) as Record<string, unknown>[];
    const byIds = [...new Set(corrRows.map((c) => c.decided_by as string | null).filter((x): x is string => !!x))];
    const { data: users } = byIds.length > 0 ? await sb.from("users").select("id, name").in("id", byIds) : { data: [] as { id: string; name: string }[] };
    const nameOf = new Map(((users ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]));
    const grace = { lateGrace: (penR.data?.late_grace_min as number | undefined) ?? undefined, earlyGrace: (penR.data?.early_grace_min as number | undefined) ?? undefined, overGrace: (penR.data?.over_grace_min as number | undefined) ?? undefined };
    const draftByCast = new Map(draft.rows.map((r) => [r.castId, r]));
    const casts = ((castsR.data ?? []) as { id: string; name: string; is_active: boolean | null }[]).map((c) => {
      const rows = attendanceDayRowsOf({
        punches: ((punchR.data ?? []) as Record<string, unknown>[]).filter((p) => p.cast_id === c.id).map((p) => ({ id: p.id as string, punched_at: p.punched_at as string, type: p.type as "in" | "out", source: p.source as string, okuri: p.okuri as boolean | null })) as SheetPunch[],
        shifts: ((shiftsR.data ?? []) as Record<string, unknown>[]).filter((s) => s.cast_id === c.id).map((s) => ({ date: s.date as string, start_hm: s.start_hm as string, end_hm: s.end_hm as string })),
        attendance: ((attR.data ?? []) as Record<string, unknown>[]).filter((a) => a.cast_id === c.id).map((a) => ({ date: a.date as string, status: a.status as SheetAttendance["status"], eta: a.eta as string | null, reason: a.reason as string | null, source: a.source as string | null, updated_at: a.updated_at as string | null })),
        corrections: corrRows.filter((x) => x.cast_id === c.id).map((x) => ({ punch_id: x.punch_id as string | null, biz_date: x.biz_date as string, kind: x.kind as "in" | "out", before_at: x.before_at as string | null, after_at: x.after_at as string | null, reason: x.reason as string, decision: x.decision as string, decided_at: x.decided_at as string | null, decided_by_name: nameOf.get(x.decided_by as string) ?? null })) as SheetCorrection[],
        transports: ((trR.data ?? []) as Record<string, unknown>[]).filter((t) => t.cast_id === c.id).map((t) => ({ biz_date: t.biz_date as string, amount: t.amount as number, mode: (t.mode as string | null | undefined) ?? null, status: t.status as string })) as SheetTransport[],
        cutoffHm: win.cutoffHm, closeHm: win.closeHm, grace, payTimeBasis: basis, todayBiz, periodStart: win.periodStart, periodEnd: win.periodEnd,
      });
      const summary = attendanceSummaryOf(rows, todayBiz);
      const d = draftByCast.get(c.id);
      const payroll = d ? { hours: d.pay.wHours, days: Array.isArray(d.pay.wdays) ? d.pay.wdays.length : 0, lateN: d.pay.lateN ?? 0, absentN: d.pay.absentN ?? 0, missingOutN: d.missingOutDates.length, taxMode: d.taxMode } : null;
      return { castId: c.id, castName: c.name, active: c.is_active !== false, payroll, summary, rows };
    }).filter((c) => c.active || c.rows.some((r) => r.inHm || r.shift));
    return NextResponse.json({ period: g.period, storeId: g.storeId, storeName: (storeR.data?.name as string | undefined) ?? "", cutoffHm: win.cutoffHm, basis, todayBiz, casts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
