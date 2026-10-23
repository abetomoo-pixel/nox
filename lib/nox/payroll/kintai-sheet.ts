// ★便 SH-UI-c2 C2-2／C2-3／C2-6（2026-10-23）: 勤怠一覧の組み立て（サーバ専用・DB 書込なし）。
//   /api/attendance/sheet（店長・オーナー＝全員）と /mine（本人＝castId で絞る）が同じ関数＝合計表・1 人 1 か月の行・日別の算定給与・月のまとめが
//   給与画面（computePayrollDraft＝preview と同じ）と同じ値になる（別計算を書かない）。
//   日別の材料＝get_cast_sales（営業日ごとの本数＝managerClient：店長は自店・本人は自分の行だけ）・指名料行（rate バックの母数・check_lines）・
//   商品バック（check_cast_backs の凍結値＋承認済み drink_claims）・罰金（payroll_adjustments の sanction／settlement／shortfall＝target_shift_id／biz_date・月の行は月のまとめ）。
//   確定済みの月＝payslips の凍結値（wdays・gross・net）を出す（確定時の値のまま）。
import type { SupabaseClient } from "@supabase/supabase-js";
import { computePayrollDraft, type PreviewRow } from "./core";
import { resolvePayrollWindow } from "./window";
import { bizDateOf } from "../biz-date";
import { attendanceDayRowsOf, attendanceSummaryOf, type AttendanceDayRow, type AttendanceSummary, type SheetAttendance } from "./attendance-sheet";
import { castPayTotalsOf, dailyBacksOf, dailyFinesOf, dailyPayRowsOf, dailyWageOf, monthSummaryOf, type CastPayTotals, type DailyBackInput, type DailyPayRow, type MonthSummary } from "./daily-pay";
import type { PayResult } from "../pay";

export type KintaiCast = {
  castId: string; castName: string; active: boolean;
  payroll: { hours: number; days: number; lateN: number; absentN: number; missingOutN: number; taxMode: string } | null;
  summary: AttendanceSummary;
  rows: AttendanceDayRow[];
  /** 日別の算定給与＝給与画面と同じ draft（確定済みは凍結値）。draft に無い cast（稼働 0）は null */
  pay: { net: number; gross: number; frozen: boolean; month: MonthSummary; totals: CastPayTotals } | null;
};
export type KintaiSheet = { period: string; storeId: string; storeName: string; cutoffHm: string; basis: "punch" | "shift"; todayBiz: string; finalized: boolean; runStatus: string | null; periodStart: string; periodEnd: string; casts: KintaiCast[] };

type Rec = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);

export async function buildKintaiSheet(admin: SupabaseClient, managerClient: SupabaseClient, storeId: string, period: string, opts: { castId?: string } = {}): Promise<KintaiSheet> {
  const win = await resolvePayrollWindow(admin, storeId, period);
  const draft = await computePayrollDraft(admin, managerClient, storeId, period, { previewDefaults: true });
  const basis: "punch" | "shift" = draft.payTimeBasis === "shift" ? "shift" : "punch";
  const todayBiz = bizDateOf(new Date().toISOString(), win.cutoffHm);
  const castQ = admin.from("casts").select("id, name, is_active").eq("store_id", storeId).order("name");
  const [castsR, shiftsR, attR, punchR, corrR, trR, penR, storeR, runR, salesR, shimeiR, backsR, claimsR] = await Promise.all([
    opts.castId ? castQ.eq("id", opts.castId) : castQ,
    admin.from("shifts").select("id, cast_id, date, start_hm, end_hm").eq("store_id", storeId).eq("status", "confirmed").gte("date", win.periodStart).lte("date", win.periodEnd),
    admin.from("attendance").select("cast_id, date, status, eta, reason, source, updated_at").eq("store_id", storeId).gte("date", win.periodStart).lte("date", win.periodEnd),
    admin.from("punches").select("id, cast_id, punched_at, type, source, okuri").eq("store_id", storeId).gte("punched_at", win.startTs).lt("punched_at", win.endTs),
    admin.from("punch_corrections").select("cast_id, punch_id, biz_date, kind, before_at, after_at, reason, decision, decided_by, decided_at").eq("store_id", storeId).eq("decision", "approved").gte("biz_date", win.periodStart).lte("biz_date", win.periodEnd),
    admin.from("transport").select("*").eq("store_id", storeId).gte("biz_date", win.periodStart).lte("biz_date", win.periodEnd),
    admin.from("penalty_config").select("late_grace_min, early_grace_min, over_grace_min").eq("store_id", storeId).maybeSingle(),
    admin.from("stores").select("name").eq("id", storeId).maybeSingle(),
    admin.from("payroll_runs").select("id, status").eq("store_id", storeId).eq("period", period).maybeSingle(),
    managerClient.rpc("get_cast_sales", { p_store_id: storeId, p_from: win.periodStart, p_to: win.periodEnd }),
    admin.from("check_lines").select("cast_id, fee_kind, line_total, checks!inner(started_at, status)").eq("store_id", storeId).in("fee_kind", ["hon_shimei", "jonai_shimei"]).not("cast_id", "is", null).not("checks.status", "in", "(void,merged)").gte("checks.started_at", win.startTs).lt("checks.started_at", win.endTs),
    admin.from("check_cast_backs").select("cast_id, drink_back, champ_back, bottle_back, calculated_back_amount, checks!inner(started_at, status)").eq("store_id", storeId).eq("checks.status", "closed").gte("checks.started_at", win.startTs).lt("checks.started_at", win.endTs),
    admin.from("drink_claims").select("cast_id, back_amount, checks!inner(started_at, status)").eq("store_id", storeId).eq("status", "approved").not("checks.status", "in", "(void,merged)").gte("checks.started_at", win.startTs).lt("checks.started_at", win.endTs),
  ]);
  for (const r of [castsR, shiftsR, attR, punchR, corrR, trR, salesR, shimeiR, backsR, claimsR]) if (r.error) throw new Error(r.error.message);
  const run = (runR.data ?? null) as { id: string; status: string } | null;
  const finalized = !!run && (run.status === "finalized" || run.status === "paid");
  // 罰金・減額＝この期の run の adjustments（sanction／shortfall）＝日に紐づく行だけ日別へ（残りは月のまとめ）
  const adjR = run ? await admin.from("payroll_adjustments").select("cast_id, amount, reason, source, biz_date, target_shift_id, mode").eq("run_id", run.id).in("source", ["sanction", "settlement", "shortfall"]) : { data: [] as Rec[], error: null };
  if (adjR.error) throw new Error(adjR.error.message);
  // 確定済み＝payslips の凍結値（wdays・gross・net）
  const slipR = finalized && run ? await admin.from("payslips").select("cast_id, net, breakdown_json").eq("run_id", run.id) : { data: [] as Rec[], error: null };
  if (slipR.error) throw new Error(slipR.error.message);
  const frozenByCast = new Map<string, { net: number; pay: Partial<PayResult> }>();
  for (const s of (slipR.data ?? []) as Rec[]) frozenByCast.set(s.cast_id as string, { net: num(s.net), pay: (((s.breakdown_json as Rec | null)?.pay ?? {}) as Partial<PayResult>) });

  const corrRows = (corrR.data ?? []) as Rec[];
  const byIds = [...new Set(corrRows.map((c) => c.decided_by as string | null).filter((x): x is string => !!x))];
  const { data: users } = byIds.length > 0 ? await admin.from("users").select("id, name").in("id", byIds) : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map(((users ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]));
  const grace = { lateGrace: (penR.data?.late_grace_min as number | undefined) ?? undefined, earlyGrace: (penR.data?.early_grace_min as number | undefined) ?? undefined, overGrace: (penR.data?.over_grace_min as number | undefined) ?? undefined };
  const draftByCast = new Map<string, PreviewRow>(draft.rows.map((r) => [r.castId, r]));
  const shiftDateById = new Map<string, string>(((shiftsR.data ?? []) as Rec[]).map((s) => [s.id as string, s.date as string]));
  const bd = (x: Rec): string | null => { const ck = Array.isArray(x.checks) ? (x.checks as Rec[])[0] : (x.checks as Rec | null); return ck?.started_at ? bizDateOf(ck.started_at as string, win.cutoffHm) : null; };
  // 日別の材料（cast × 営業日）
  const backInput = new Map<string, Map<string, DailyBackInput>>();
  const ensure = (cid: string, d: string): DailyBackInput => { const m = backInput.get(cid) ?? backInput.set(cid, new Map()).get(cid)!; return m.get(d) ?? m.set(d, { bizDate: d, hon: 0, jonai: 0, dohan: 0, honAmt: 0, jonaiAmt: 0, drink: 0, champ: 0, bottle: 0, calc: 0 }).get(d)!; };
  for (const r of (salesR.data ?? []) as Rec[]) { const x = ensure(r.cast_id as string, String(r.biz_date)); x.hon += num(r.hon); x.jonai += num(r.jonai); x.dohan += num(r.dohan); }
  for (const r of (shimeiR.data ?? []) as Rec[]) { const d = bd(r); if (!d) continue; const x = ensure(r.cast_id as string, d); if (r.fee_kind === "hon_shimei") x.honAmt += num(r.line_total); else x.jonaiAmt += num(r.line_total); }
  for (const r of (backsR.data ?? []) as Rec[]) { const d = bd(r); if (!d) continue; const x = ensure(r.cast_id as string, d); x.drink += num(r.drink_back); x.champ += num(r.champ_back); x.bottle += num(r.bottle_back); x.calc += num(r.calculated_back_amount); }
  for (const r of (claimsR.data ?? []) as Rec[]) { const d = bd(r); if (!d) continue; const x = ensure(r.cast_id as string, d); x.drink += num(r.back_amount); }

  const casts: KintaiCast[] = ((castsR.data ?? []) as { id: string; name: string; is_active: boolean | null }[]).map((c) => {
    const rows = attendanceDayRowsOf({
      punches: ((punchR.data ?? []) as Rec[]).filter((p) => p.cast_id === c.id).map((p) => ({ id: p.id as string, punched_at: p.punched_at as string, type: p.type as "in" | "out", source: p.source as string, okuri: p.okuri as boolean | null })),
      shifts: ((shiftsR.data ?? []) as Rec[]).filter((s) => s.cast_id === c.id).map((s) => ({ id: s.id as string, date: s.date as string, start_hm: s.start_hm as string, end_hm: s.end_hm as string })),
      attendance: ((attR.data ?? []) as Rec[]).filter((a) => a.cast_id === c.id).map((a) => ({ date: a.date as string, status: a.status as SheetAttendance["status"], eta: a.eta as string | null, reason: a.reason as string | null, source: a.source as string | null, updated_at: a.updated_at as string | null })),
      corrections: corrRows.filter((x) => x.cast_id === c.id).map((x) => ({ punch_id: x.punch_id as string | null, biz_date: x.biz_date as string, kind: x.kind as "in" | "out", before_at: x.before_at as string | null, after_at: x.after_at as string | null, reason: x.reason as string, decision: x.decision as string, decided_at: x.decided_at as string | null, decided_by_name: x.decided_by ? nameOf.get(x.decided_by as string) ?? null : null })),
      transports: ((trR.data ?? []) as Rec[]).filter((t) => t.cast_id === c.id).map((t) => ({ biz_date: t.biz_date as string, amount: t.amount as number, mode: (t.mode as string | null | undefined) ?? null, status: t.status as string })),
      cutoffHm: win.cutoffHm, closeHm: win.closeHm, grace, payTimeBasis: basis, todayBiz, periodStart: win.periodStart, periodEnd: win.periodEnd,
    });
    const summary = attendanceSummaryOf(rows, todayBiz);
    const d = draftByCast.get(c.id);
    const frozen = frozenByCast.get(c.id) ?? null;
    const payroll = d ? { hours: d.pay.wHours, days: Array.isArray(d.pay.wdays) ? d.pay.wdays.length : 0, lateN: d.pay.lateN ?? 0, absentN: d.pay.absentN ?? 0, missingOutN: d.missingOutDates.length, taxMode: d.taxMode } : null;
    let pay: KintaiCast["pay"] = null;
    const src = frozen ? { wdays: frozen.pay.wdays ?? [], gross: num(frozen.pay.gross), net: frozen.net, plan: frozen.pay.eplan ?? frozen.pay.plan ?? null } : d ? { wdays: d.pay.wdays, gross: d.pay.gross, net: d.net, plan: d.pay.eplan ?? d.pay.plan } : null;
    if (src) {
      const wage = dailyWageOf(src.wdays, period);
      const backs = dailyBacksOf(src.plan ? { honBack: src.plan.honBack, jonaiBack: src.plan.jonaiBack, dohanBack: src.plan.dohanBack, honBackMode: src.plan.honBackMode, honBackRate: src.plan.honBackRate, jonaiBackMode: src.plan.jonaiBackMode, jonaiBackRate: src.plan.jonaiBackRate } : null, [...(backInput.get(c.id)?.values() ?? [])]);
      const fines = dailyFinesOf(((adjR.data ?? []) as Rec[]).filter((a) => a.cast_id === c.id && a.mode === "fixed").map((a) => ({ amount: num(a.amount), reason: String(a.reason ?? ""), source: String(a.source ?? ""), biz_date: (a.biz_date as string | null) ?? null, target_shift_id: (a.target_shift_id as string | null) ?? null })), shiftDateById);
      const dailyRows: DailyPayRow[] = dailyPayRowsOf({ dates: rows.filter((r) => !r.future).map((r) => r.bizDate), wage, backs, fines });
      const byDate = new Map(dailyRows.map((r) => [r.bizDate, r]));
      for (const r of rows) { const p = byDate.get(r.bizDate); if (p) r.pay = p; }
      const month = monthSummaryOf({ gross: src.gross, net: src.net, rows: dailyRows, frozen: !!frozen });
      pay = { net: src.net, gross: src.gross, frozen: !!frozen, month, totals: castPayTotalsOf(dailyRows, src.net, !!frozen) };
    }
    return { castId: c.id, castName: c.name, active: c.is_active !== false, payroll, summary, rows, pay };
  }).filter((c) => c.active || c.rows.some((r) => r.inHm || r.shift));
  return { period, storeId, storeName: (storeR.data?.name as string | undefined) ?? "", cutoffHm: win.cutoffHm, basis, todayBiz, finalized, runStatus: run?.status ?? null, periodStart: win.periodStart, periodEnd: win.periodEnd, casts };
}
