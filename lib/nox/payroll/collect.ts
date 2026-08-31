// 期間データの読み取り（給与確定サーバの権威読み）。
// 按分の DB 権威（D7a）を保つため get_cast_sales は「ユーザー文脈（manager）クライアント」で呼ぶ
//   （service キーは auth_org_id() null で forbidden＝admin では呼べない）。
// 他の生読み取り（会計バック・打刻・マスタ）は admin（service・RLS バイパス・検証済み store）で読む。
// 対象 cast（裁定C）= get_cast_sales の cast ∪ 窓内 punches の cast（is_active 不問・稼働ゼロは除外）。

import type { SupabaseClient } from "@supabase/supabase-js";
import { periodCalendarDays, type PayrollWindow } from "./window";
import type { CastRaw, StoreMasters } from "./assemble";
import type { CompPlan, PlanOverride, Deduction, BackDef, TaxMode } from "../pay";
import { buildMatchInput, dayWorkedHours, type PunchRow, type ShiftRow, type AttendanceRow } from "../punch-io";
import { matchPunches } from "../punch-match";
import { bizDateOf } from "../biz-date";

type SalesRow = { cast_id: string; biz_date: string; sales: number; hon: number; jonai: number; dohan: number };

// #32 出勤インセンティブ（published・当該期間の biz_date）
// E8-4（mig0095）: targetCastIds＝対象キャスト（null=全員=現行完全互換）・reason は表示専用
export type Incentive = {
  id: string; bizDate: string; amountMode: "per_head" | "pooled"; amount: number;
  targetCastIds: string[] | null; reason: string | null;
};

// F2e-1 売掛天引き（E9 対象＝open・deduct_from_cast・当該 period 帰属）。remaining=amount−deducted_amount。
export type Receivable = {
  id: string;
  castId: string;
  amount: number;
  deductedAmount: number;
  remaining: number;
  effPeriod: string; // coalesce(deduct_period, biz_date→'YYYY-MM')
  createdAt: string;
};

// F2e-2 前借り天引き（E9 同型・open・当該 period 帰属＝coalesce(deduct_period, advanced_on→'YYYY-MM')・繰越あり）。
export type Advance = {
  id: string;
  castId: string;
  amount: number;
  deductedAmount: number;
  remaining: number;
  effPeriod: string;
  createdAt: string;
};

// F2e-2 送り実費天引き（open・当該 period 帰属＝biz_date→'YYYY-MM'・繰越なし＝deduct_period 列を持たない）。
export type Transport = {
  id: string;
  castId: string;
  amount: number;
  deductedAmount: number;
  remaining: number;
  effPeriod: string; // biz_date→'YYYY-MM'（固定・繰越しない）
  bizDate: string; // 古い順ソート用（同一 period 内は日付順 FIFO）
  createdAt: string;
};

export type CollectResult = {
  casts: CastRaw[];
  masters: StoreMasters;
  incentives: Incentive[];
  // bizDate → 受給者 cast_id（final∈{ok,late}・cast_id 昇順＝pooled 端数 +1 の順序＝確認1）
  recipientsByDate: Map<string, string[]>;
  // cast_id → 当該 period の E9 対象 receivable（古い順）
  receivablesByCast: Map<string, Receivable[]>;
  // cast_id → 当該 period の前借り（古い順）／送り実費（biz_date 古い順・繰越なし）
  advancesByCast: Map<string, Advance[]>;
  transportByCast: Map<string, Transport[]>;
};

// 店共通マスタ＋cast 個別マスタ（plan/norm/tax）を1回読む。
// periodEnd は period_bounds 由来の 'YYYY-MM-DD'（win.periodEnd・写像単一ソース＝Date 非経由）。
async function loadMasters(admin: SupabaseClient, storeId: string, period: string, periodEnd: string) {
  const [plansR, castPlanR, penR, dedR, cbR, normR, taxR, compR] = await Promise.all([
    admin.from("comp_plans").select("id, name, base, hon_back, jonai_back, dohan_back, sales_slide, point_slide, hon_back_mode, hon_back_rate, jonai_back_mode, jonai_back_rate, dohan_back_mode, dohan_back_rate").eq("store_id", storeId),
    // ★裁定97: 適用行の選択は3段（期間と重なる行を全部読み、下の castPlanByCast 構築で選ぶ）。
    //   a) 期首（period-01）時点で有効な行があればそれ＝裁定96-④ 不変（期中変更は翌期から）。
    //   b) 無ければ期間内（期首 < valid_from ≤ 期末）で最も早い valid_from の行＝backfill 導入月の救済。日割りなし。
    //   c) どちらも無ければ plan なし＝no_plan blocker（従来どおり）。
    //   UI 系（comp-sections）の現在行読み（valid_to is null）は別経路＝不変。
    admin.from("cast_plan").select("cast_id, plan_id, overrides_json, valid_from").eq("store_id", storeId)
      .lte("valid_from", periodEnd)
      .or(`valid_to.is.null,valid_to.gte.${period}-01`),
    admin.from("penalty_config").select("*").eq("store_id", storeId).maybeSingle(),
    // ★裁定98: kind（sanction 分離）と basis_confirmed_at（表示用）を読む＝sim-data.ts:33 と二面鏡（片方だけ触らない）
    admin.from("deductions").select("id, name, amount, per, kind, basis_confirmed_at").eq("store_id", storeId).eq("is_active", true),
    admin.from("custom_back_defs").select("id, name, basis, value, cond_json").eq("store_id", storeId).eq("is_active", true),
    admin.from("cast_norms").select("cast_id, days_target, dohan_target, sales_target").eq("store_id", storeId).eq("period", period),
    admin.from("cast_tax_profiles").select("cast_id, mode").eq("store_id", storeId),
    // ★mig0114（読み経路段）: 行型コンポーネント（plan_id で束ねる・空なら旧式同値＝pay.ts 非参照）
    admin.from("comp_plan_components").select("plan_id, kind, mode, amount, rate, params, priority")
      .eq("store_id", storeId).eq("is_active", true).order("priority"),
  ]);
  for (const r of [plansR, castPlanR, penR, dedR, cbR, normR, taxR, compR]) {
    if (r.error) throw new Error(`マスタ読み取り: ${r.error.message}`);
  }
  const compsByPlan = new Map<string, CompPlan["components"]>();
  for (const r of (compR.data ?? []) as Record<string, unknown>[]) {
    const arr = compsByPlan.get(r.plan_id as string) ?? [];
    arr!.push({
      kind: r.kind as string, mode: r.mode as string,
      amount: (r.amount ?? null) as number | null, rate: (r.rate ?? null) as number | null,
      params: (r.params ?? {}) as Record<string, unknown>, priority: r.priority as number,
    });
    compsByPlan.set(r.plan_id as string, arr);
  }
  const plansById = new Map<string, CompPlan>();
  for (const p of (plansR.data ?? []) as Record<string, unknown>[]) {
    plansById.set(p.id as string, {
      id: p.id as string,
      name: p.name as string,
      base: p.base as number,
      honBack: p.hon_back as number,
      jonaiBack: p.jonai_back as number,
      dohanBack: p.dohan_back as number,
      salesSlide: (p.sales_slide ?? []) as CompPlan["salesSlide"],
      pointSlide: (p.point_slide ?? []) as CompPlan["pointSlide"],
      // mig0086: 指名バック方式（default 'per_count'＝既存プラン現行同値）
      honBackMode: (p.hon_back_mode ?? "per_count") as CompPlan["honBackMode"],
      honBackRate: (p.hon_back_rate ?? null) as number | null,
      jonaiBackMode: (p.jonai_back_mode ?? "per_count") as CompPlan["jonaiBackMode"],
      jonaiBackRate: (p.jonai_back_rate ?? null) as number | null,
      // ★mig0114: dohan 対称化＋components（読み経路段＝payOf 非参照・空配列が既定）
      dohanBackMode: (p.dohan_back_mode ?? "per_count") as CompPlan["dohanBackMode"],
      dohanBackRate: (p.dohan_back_rate ?? null) as number | null,
      components: compsByPlan.get(p.id as string) ?? [],
    });
  }
  // ★裁定97: cast 単位の適用行選択（上の query コメントの3段）。
  //   期首行は部分 unique＋set_cast_plan の区間検証で高々1行＝2行以上は不正データとして throw（黙って片方を採らない）。
  const periodStart = `${period}-01`;
  const castPlanByCast = new Map<string, { planId: string; override: PlanOverride }>();
  {
    const rowsByCast = new Map<string, { planId: string; override: PlanOverride; validFrom: string }[]>();
    for (const c of (castPlanR.data ?? []) as Record<string, unknown>[]) {
      const cid = c.cast_id as string;
      const row = { planId: c.plan_id as string, override: (c.overrides_json ?? {}) as PlanOverride, validFrom: c.valid_from as string };
      (rowsByCast.get(cid) ?? rowsByCast.set(cid, []).get(cid)!).push(row);
    }
    for (const [cid, rows] of rowsByCast) {
      const atStart = rows.filter((r) => r.validFrom <= periodStart);
      if (atStart.length >= 2) throw new Error(`cast_plan: 期首時点の有効行が複数（cast=${cid}・period=${period}）`);
      const pick = atStart[0]
        ?? rows.filter((r) => r.validFrom > periodStart).sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1))[0];
      if (pick) castPlanByCast.set(cid, { planId: pick.planId, override: pick.override });
    }
  }
  const pen = penR.data as Record<string, unknown> | null;
  const masters: StoreMasters = {
    penalty: {
      fineAbsent: (pen?.fine_absent as number) ?? 0,
      fineLate: (pen?.fine_late as number) ?? 0,
      hoursPerShift: Number(pen?.hours_per_shift ?? 5),
    },
    normConfig: {
      on: (pen?.norm_on as boolean) ?? false,
      daysFlat: (pen?.norm_days_flat as number) ?? 0,
      daysPer: (pen?.norm_days_per as number) ?? 0,
      dohanFlat: (pen?.norm_dohan_flat as number) ?? 0,
      dohanPer: (pen?.norm_dohan_per as number) ?? 0,
    },
    deductions: ((dedR.data ?? []) as Record<string, unknown>[]).map((d) => ({
      id: d.id as string, name: d.name as string, amount: d.amount as number, per: d.per as Deduction["per"],
      kind: d.kind as Deduction["kind"], basisConfirmedAt: (d.basis_confirmed_at ?? null) as string | null, // ★裁定98
    })),
    customBackDefs: ((cbR.data ?? []) as Record<string, unknown>[]).map((b) => ({
      id: b.id as string, name: b.name as string, basis: b.basis as BackDef["basis"], value: b.value as number,
      cond: (b.cond_json ?? undefined) as BackDef["cond"],
    })),
  };
  const normByCast = new Map<string, { days: number; dohan: number; salesTarget: number }>();
  for (const n of (normR.data ?? []) as Record<string, unknown>[]) {
    // ★裁定96-②: achievement_bonus の目標は cast_norms.sales_target 固定（0/行なし=不適用）
    normByCast.set(n.cast_id as string, { days: n.days_target as number, dohan: n.dohan_target as number,
      salesTarget: Number(n.sales_target ?? 0) });
  }
  const taxByCast = new Map<string, TaxMode>();
  for (const t of (taxR.data ?? []) as Record<string, unknown>[]) {
    taxByCast.set(t.cast_id as string, t.mode as TaxMode);
  }
  const lateGrace = (pen?.late_grace_min as number) ?? undefined;
  const earlyGrace = (pen?.early_grace_min as number) ?? undefined;
  const overGrace = (pen?.over_grace_min as number) ?? undefined;
  return { plansById, castPlanByCast, masters, normByCast, taxByCast, grace: { lateGrace, earlyGrace, overGrace } };
}

// 窓内 closed 非 void の会計から cast 別のバック・pt・champ/bottle 本数を集計。
// champ/bottle 判定は check_lines.kind ∈ {'champ','bottle'}（会計確定時スナップショット・商品マスタ属性でなく明細 kind が正）。
// 帰属は check_nominations（sales 按分と同じ在席集合）。本数は重み分割しない＝各在席 cast に満額計上。
// ★F3f: 承認済 drink_claims（自己申告バック・独立枠）を drink バックへ合流。
//   期間フィルタは「対象 check の started_at」＝check_cast_backs と同一の営業日基準（給与サイクル一致）。
//   close 非依存（申告は独立枠＝check_cast_backs を書かない）。承認済0件なら合流額0＝既存 payslip 不変。
//   ★close 非依存は維持（open 伝票の承認済 claim は当月給与に乗る）・void のみ除外（0047 裁定 2026-07-17）。
//     void 伝票の approved は行としては残置される（mig0047 が reject するのは pending のみ）ため、
//     給与から外す単一責任点がこの void フィルタ＝finalize 済み給与への遡及改変を構造的に回避する。
async function loadAccounting(admin: SupabaseClient, storeId: string, win: PayrollWindow) {
  const backByCast = new Map<string, { drink: number; champ: number; bottle: number; pt: number }>();
  const champBottleByCast = new Map<string, { champCnt: number; bottleCnt: number }>();

  // ★F3f: 承認済 drink_claims の back_amount を cast 別に drink バックへ合流（対象 check の営業日で期間フィルタ）
  const { data: claims, error: eDc } = await admin
    .from("drink_claims").select("cast_id, back_amount, checks!inner(started_at, status)")
    .eq("store_id", storeId).eq("status", "approved")
    .neq("checks.status", "void") // 0047: void 伝票の承認済 claim は給与に乗せない（closed 限定にはしない＝close 非依存の維持）
    .gte("checks.started_at", win.startTs).lt("checks.started_at", win.endTs);
  if (eDc) throw new Error(`drink_claims: ${eDc.message}`);
  for (const c of (claims ?? []) as Record<string, unknown>[]) {
    const cid = c.cast_id as string;
    const cur = backByCast.get(cid) ?? { drink: 0, champ: 0, bottle: 0, pt: 0 };
    cur.drink += c.back_amount as number;
    backByCast.set(cid, cur);
  }

  const { data: checks, error: eC } = await admin
    .from("checks").select("id").eq("store_id", storeId).eq("status", "closed")
    .gte("started_at", win.startTs).lt("started_at", win.endTs);
  if (eC) throw new Error(`checks: ${eC.message}`);
  const checkIds = ((checks ?? []) as { id: string }[]).map((c) => c.id);
  if (checkIds.length === 0) return { backByCast, champBottleByCast };  // ★drink_claims は既に合流済み

  const [nomsR, linesR, backsR] = await Promise.all([
    admin.from("check_nominations").select("check_id, cast_id").in("check_id", checkIds),
    admin.from("check_lines").select("check_id, kind, qty").in("check_id", checkIds),
    admin.from("check_cast_backs").select("cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc").in("check_id", checkIds),
  ]);
  for (const r of [nomsR, linesR, backsR]) if (r.error) throw new Error(`会計明細: ${r.error.message}`);

  for (const b of (backsR.data ?? []) as Record<string, unknown>[]) {
    const cid = b.cast_id as string;
    const cur = backByCast.get(cid) ?? { drink: 0, champ: 0, bottle: 0, pt: 0 };
    cur.drink += b.drink_back as number;
    cur.champ += b.champ_back as number;
    cur.bottle += b.bottle_back as number;
    cur.pt += b.hon_pt_alloc as number;
    backByCast.set(cid, cur);
  }
  // check_id → {champ,bottle} qty
  const qtyByCheck = new Map<string, { champ: number; bottle: number }>();
  for (const l of (linesR.data ?? []) as Record<string, unknown>[]) {
    const kind = l.kind as string;
    if (kind !== "champ" && kind !== "bottle") continue;
    const cur = qtyByCheck.get(l.check_id as string) ?? { champ: 0, bottle: 0 };
    if (kind === "champ") cur.champ += l.qty as number;
    else cur.bottle += l.qty as number;
    qtyByCheck.set(l.check_id as string, cur);
  }
  for (const n of (nomsR.data ?? []) as Record<string, unknown>[]) {
    const q = qtyByCheck.get(n.check_id as string);
    if (!q) continue;
    const cid = n.cast_id as string;
    const cur = champBottleByCast.get(cid) ?? { champCnt: 0, bottleCnt: 0 };
    cur.champCnt += q.champ;
    cur.bottleCnt += q.bottle;
    champBottleByCast.set(cid, cur);
  }
  return { backByCast, champBottleByCast };
}

// mig0086: 率バックの母数＝窓内の指名料行（check_lines）を cast 別に集計（率バック設計 v1 裁定iii/vi）。
//   fee_kind in ('hon_shimei','jonai_shimei') ∧ cast_id not null（0084 が凍結）・母数は line_total（サ料・丸め前）。
//   ★窓と除外の系列＝drink_claims と同じ 0047 系列: checks!inner join・started_at [startTs, endTs)・
//     neq checks.status 'void'＝close 非依存（open 伝票の指名料行も当月給与に乗る・void のみ除外）。
//     per_count 系（get_cast_sales の本数）とは帰属系統が異なる＝rate はレジで「指名料を追加」した行のみが対象（裁定vi）。
async function loadShimeiAmounts(admin: SupabaseClient, storeId: string, win: PayrollWindow) {
  const { data, error } = await admin
    .from("check_lines")
    .select("cast_id, fee_kind, line_total, checks!inner(started_at, status)")
    .eq("store_id", storeId)
    .in("fee_kind", ["hon_shimei", "jonai_shimei"])
    .not("cast_id", "is", null)
    .neq("checks.status", "void")
    .gte("checks.started_at", win.startTs)
    .lt("checks.started_at", win.endTs);
  if (error) throw new Error(`指名料行: ${error.message}`);
  const byCast = new Map<string, { hon: number; jonai: number }>();
  for (const r of (data ?? []) as { cast_id: string; fee_kind: string; line_total: number }[]) {
    const cur = byCast.get(r.cast_id) ?? { hon: 0, jonai: 0 };
    if (r.fee_kind === "hon_shimei") cur.hon += r.line_total;
    else cur.jonai += r.line_total;
    byCast.set(r.cast_id, cur);
  }
  return byCast;
}

// 窓内の shifts（確定）/attendance/punches を cast 別に読み、punch-io→matchPunches で days/lateN/absentN/日次hours を得る。
// export: /api/mine/norm-progress が同一定義（final∈{ok,late}）で days を再利用（SQL 再実装しない＝定義乖離防止）。
//   cast セッションの client を渡すと RLS パターン1 で自分の行のみ＝self スコープに自然に縮む。
export async function loadPunch(admin: SupabaseClient, storeId: string, win: PayrollWindow, grace: { lateGrace?: number; earlyGrace?: number; overGrace?: number }) {
  const [shiftsR, attR, punchR] = await Promise.all([
    // ★SD-4（2026-08-21・設計書 §1）: 給与分母は confirmed のみ＝この .eq は不変。
    //   mig0101 で status が 3値化（planned→proposed→confirmed）されたが、中間 status（proposed）は
    //   キャスト確認待ちの未確定＝給与の出勤分母に数えない。ここを広げる変更は SD-4 の再裁定が要る。
    admin.from("shifts").select("cast_id, date, start_hm, end_hm").eq("store_id", storeId).eq("status", "confirmed").gte("date", win.periodStart).lte("date", win.periodEnd),
    admin.from("attendance").select("cast_id, date, status").eq("store_id", storeId).gte("date", win.periodStart).lte("date", win.periodEnd),
    admin.from("punches").select("cast_id, punched_at, type").eq("store_id", storeId).gte("punched_at", win.startTs).lt("punched_at", win.endTs),
  ]);
  for (const r of [shiftsR, attR, punchR]) if (r.error) throw new Error(`打刻: ${r.error.message}`);
  const byCast = new Map<string, { shifts: ShiftRow[]; att: AttendanceRow[]; punches: PunchRow[] }>();
  const ensure = (cid: string) => {
    let e = byCast.get(cid);
    if (!e) { e = { shifts: [], att: [], punches: [] }; byCast.set(cid, e); }
    return e;
  };
  for (const s of (shiftsR.data ?? []) as Record<string, unknown>[]) ensure(s.cast_id as string).shifts.push({ date: s.date as string, start_hm: s.start_hm as string, end_hm: s.end_hm as string });
  for (const a of (attR.data ?? []) as Record<string, unknown>[]) ensure(a.cast_id as string).att.push({ date: a.date as string, status: a.status as AttendanceRow["status"] });
  for (const p of (punchR.data ?? []) as Record<string, unknown>[]) ensure(p.cast_id as string).punches.push({ punched_at: p.punched_at as string, type: p.type as "in" | "out" });

  const result = new Map<string, { days: number; lateN: number; absentN: number; anomalyCount: number; hoursByDate: Map<string, number> }>();
  // 受給者判定（確認1・裁定）: final∈{ok,late}（確定シフトがある日に出勤）＝raw のみ（no_shift/absent）は含めない。
  const recipientsByDate = new Map<string, string[]>();
  for (const [cid, raw] of byCast) {
    const built = buildMatchInput({ cutoffHm: win.cutoffHm, shifts: raw.shifts, attendance: raw.att, punches: raw.punches });
    const m = matchPunches({ ...built, config: { close: win.closeHm, lateGraceMin: grace.lateGrace, earlyGraceMin: grace.earlyGrace, overGraceMin: grace.overGrace } });
    const hoursByDate = new Map<string, number>();
    let days = 0;
    let anomalyCount = 0;
    for (const d of m.days) {
      hoursByDate.set(d.bizDate, dayWorkedHours(d));
      if (d.final.type === "ok" || d.final.type === "late") {
        days += 1;
        (recipientsByDate.get(d.bizDate) ?? recipientsByDate.set(d.bizDate, []).get(d.bizDate)!).push(cid);
      }
      const outAnom = d.raw.out.type === "noout" || d.raw.out.type === "early" || d.raw.out.type === "over";
      if (d.anomalies.length > 0 || outAnom) anomalyCount += 1;
    }
    result.set(cid, { days, lateN: m.lateN, absentN: m.absentN, anomalyCount, hoursByDate });
  }
  // pooled 端数 +1 の順序を確定させるため cast_id 昇順にソート
  for (const [d, list] of recipientsByDate) recipientsByDate.set(d, list.sort());
  return { byCast: result, recipientsByDate };
}

// F2e-1: E9 対象 receivable を cast 別・古い順で読む。
//   対象＝status='open' and deduct_from_cast=true で、当該 period P に帰属：
//     deduct_period = P  OR  (deduct_period is null and biz_date(started_at)→'YYYY-MM' = P)。
//   古い順＝coalesce(deduct_period, biz_date-period) asc, created_at asc, id asc。
//   remaining = amount − deducted_amount（open ゆえ >0）。deducted は #8 で status によりここで除外済み。
async function loadReceivables(admin: SupabaseClient, storeId: string, win: PayrollWindow): Promise<Map<string, Receivable[]>> {
  const { data, error } = await admin
    .from("receivables")
    .select("id, cast_id, amount, deducted_amount, deduct_period, created_at, check_id, checks(started_at)")
    .eq("store_id", storeId).eq("status", "open").eq("deduct_from_cast", true);
  if (error) throw new Error(`receivables: ${error.message}`);
  const rows: Receivable[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    if (r.cast_id == null) continue; // cast 未紐付けは天引き対象外
    const deductPeriod = (r.deduct_period as string | null) ?? null;
    // biz_date→period（started_at を cutoff 正規化・biz-date.ts が正本＝確認2 の started_at→biz_date 基準）
    const chk = r.checks as { started_at?: string } | null;
    const bizPeriod = chk?.started_at ? bizDateOf(chk.started_at, win.cutoffHm).slice(0, 7) : null;
    const effPeriod = deductPeriod ?? bizPeriod;
    if (effPeriod !== win.period) continue; // 当該 period 帰属のみ
    const amount = r.amount as number;
    const deductedAmount = (r.deducted_amount as number) ?? 0;
    rows.push({
      id: r.id as string, castId: r.cast_id as string, amount, deductedAmount,
      remaining: amount - deductedAmount, effPeriod, createdAt: r.created_at as string,
    });
  }
  // 古い順（effPeriod asc, created_at asc, id asc）
  rows.sort((a, b) =>
    a.effPeriod < b.effPeriod ? -1 : a.effPeriod > b.effPeriod ? 1 :
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 :
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const byCast = new Map<string, Receivable[]>();
  for (const r of rows) (byCast.get(r.castId) ?? byCast.set(r.castId, []).get(r.castId)!).push(r);
  return byCast;
}

// F2e-2: E9 同型で前借り（advances）を cast 別・古い順で読む（receivables の写し）。
//   対象＝status='open' で当該 period P に帰属：deduct_period = P OR (null and to_char(advanced_on,'YYYY-MM') = P)。
//   古い順＝coalesce(deduct_period, advanced_on-period) asc, created_at asc, id asc。remaining=amount−deducted_amount。
//   cast_id は not null（1 advance=1 cast）。繰越あり（finalize が partial 時に deduct_period=翌 period を設定）。
async function loadAdvances(admin: SupabaseClient, storeId: string, win: PayrollWindow): Promise<Map<string, Advance[]>> {
  const { data, error } = await admin
    .from("advances")
    .select("id, cast_id, amount, deducted_amount, deduct_period, advanced_on, created_at")
    .eq("store_id", storeId).eq("status", "open");
  if (error) throw new Error(`advances: ${error.message}`);
  const rows: Advance[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const deductPeriod = (r.deduct_period as string | null) ?? null;
    const advancedOn = r.advanced_on as string; // 'YYYY-MM-DD'（date・cutoff 非依存）
    const effPeriod = deductPeriod ?? advancedOn.slice(0, 7);
    if (effPeriod !== win.period) continue; // 当該 period 帰属のみ
    const amount = r.amount as number;
    const deductedAmount = (r.deducted_amount as number) ?? 0;
    rows.push({
      id: r.id as string, castId: r.cast_id as string, amount, deductedAmount,
      remaining: amount - deductedAmount, effPeriod, createdAt: r.created_at as string,
    });
  }
  rows.sort((a, b) =>
    a.effPeriod < b.effPeriod ? -1 : a.effPeriod > b.effPeriod ? 1 :
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 :
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const byCast = new Map<string, Advance[]>();
  for (const r of rows) (byCast.get(r.castId) ?? byCast.set(r.castId, []).get(r.castId)!).push(r);
  return byCast;
}

// F2e-2: 送り実費（transport）を cast 別・古い順（biz_date FIFO）で読む。繰越なし＝period は biz_date→'YYYY-MM' 固定。
//   対象＝status='open' で to_char(biz_date,'YYYY-MM') = P。古い順＝biz_date asc, created_at asc, id asc。
async function loadTransport(admin: SupabaseClient, storeId: string, win: PayrollWindow): Promise<Map<string, Transport[]>> {
  const { data, error } = await admin
    .from("transport")
    .select("id, cast_id, amount, deducted_amount, biz_date, created_at")
    .eq("store_id", storeId).eq("status", "open");
  if (error) throw new Error(`transport: ${error.message}`);
  const rows: Transport[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const bizDate = r.biz_date as string; // 'YYYY-MM-DD'（cutoff 正規化済み・繰越なし）
    const effPeriod = bizDate.slice(0, 7);
    if (effPeriod !== win.period) continue; // 当該 period 帰属のみ
    const amount = r.amount as number;
    const deductedAmount = (r.deducted_amount as number) ?? 0;
    rows.push({
      id: r.id as string, castId: r.cast_id as string, amount, deductedAmount,
      remaining: amount - deductedAmount, effPeriod, bizDate, createdAt: r.created_at as string,
    });
  }
  // 古い順（biz_date asc, created_at asc, id asc）＝送り実費の発生日 FIFO
  rows.sort((a, b) =>
    a.bizDate < b.bizDate ? -1 : a.bizDate > b.bizDate ? 1 :
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 :
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const byCast = new Map<string, Transport[]>();
  for (const r of rows) (byCast.get(r.castId) ?? byCast.set(r.castId, []).get(r.castId)!).push(r);
  return byCast;
}

// ★裁定98-C: 平均賃金（労基法12条の骨格）＝直近3確定期（finalized/paid・当期より前・period 降順）の
//   payslips 凍結値から cast 別に算出。原則 = floor(Σgross ÷ Σ暦日数)・最低保障 = floor(Σgross ÷ Σ出勤日数 × 0.6)
//   （0.6 は 3/5 の整数演算・Σ出勤日数=0 なら原則のみ）。採用値 = max(原則, 最低保障)。
//   確定期 0 本／本人 payslip 0 枚は Map 不在（=null）＝pay.ts 側の暫定式（provisional）に委ねる。
//   暦日数は periodDaysBetween/periodCalendarDays（core:periodDays と同一写像＝裁定23 の系列）。
async function loadAvgDailyWage(admin: SupabaseClient, storeId: string, period: string): Promise<Map<string, number>> {
  const byCast = new Map<string, number>();
  const { data: runs, error: eR } = await admin
    .from("payroll_runs").select("id, period")
    .eq("store_id", storeId).in("status", ["finalized", "paid"])
    .lt("period", period).order("period", { ascending: false }).limit(3);
  if (eR) throw new Error(`payroll_runs: ${eR.message}`);
  const runRows = (runs ?? []) as { id: string; period: string }[];
  if (runRows.length === 0) return byCast;
  const calDaysByRun = new Map<string, number>();
  for (const r of runRows) calDaysByRun.set(r.id, periodCalendarDays(r.period));
  const { data: slips, error: eS } = await admin
    .from("payslips").select("run_id, cast_id, breakdown_json")
    .in("run_id", runRows.map((r) => r.id));
  if (eS) throw new Error(`payslips(平均賃金): ${eS.message}`);
  const acc = new Map<string, { gross: number; cal: number; wdays: number }>();
  for (const s of (slips ?? []) as Record<string, unknown>[]) {
    const pay = (s.breakdown_json as Record<string, unknown> | null)?.pay as Record<string, unknown> | undefined;
    if (!pay || typeof pay.gross !== "number") continue; // 凍結形が読めない行は分母にも入れない
    const cid = s.cast_id as string;
    const cur = acc.get(cid) ?? { gross: 0, cal: 0, wdays: 0 };
    cur.gross += pay.gross as number;
    cur.cal += calDaysByRun.get(s.run_id as string) ?? 0;
    cur.wdays += Array.isArray(pay.wdays) ? (pay.wdays as unknown[]).length : 0;
    acc.set(cid, cur);
  }
  for (const [cid, a] of acc) {
    if (a.cal <= 0) continue;
    const principle = Math.floor(a.gross / a.cal);
    const floor60 = a.wdays > 0 ? Math.floor((a.gross * 3) / (a.wdays * 5)) : null;
    byCast.set(cid, floor60 === null ? principle : Math.max(principle, floor60));
  }
  return byCast;
}

// #32: published の attendance_incentives を biz_date∈[periodStart,periodEnd] で読む（確認2: biz_date 基準統一）。
async function loadIncentives(admin: SupabaseClient, storeId: string, win: PayrollWindow): Promise<Incentive[]> {
  const { data, error } = await admin
    .from("attendance_incentives")
    .select("id, biz_date, amount_mode, amount, target_cast_ids, reason")
    .eq("store_id", storeId).eq("status", "published")
    .gte("biz_date", win.periodStart).lte("biz_date", win.periodEnd);
  if (error) throw new Error(`attendance_incentives: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, bizDate: r.biz_date as string,
    amountMode: r.amount_mode as "per_head" | "pooled", amount: r.amount as number,
    // E8-4（mig0095）: null=全員（現行互換）。配列の交差は core 側＝ここは素通し。
    targetCastIds: (r.target_cast_ids as string[] | null) ?? null,
    reason: (r.reason as string | null) ?? null,
  }));
}

// 期間データ一括収集 → CastRaw[]（対象 cast 列挙・裁定C）。
export async function collectPeriod(
  admin: SupabaseClient,
  managerClient: SupabaseClient,
  storeId: string,
  win: PayrollWindow,
): Promise<CollectResult> {
  // 按分 DB 権威: get_cast_sales は manager クライアントで（D7a）。
  const { data: salesData, error: eS } = await managerClient.rpc("get_cast_sales", {
    p_store_id: storeId, p_from: win.periodStart, p_to: win.periodEnd,
  });
  if (eS) throw new Error(`get_cast_sales: ${eS.message}`);
  const salesRows = (salesData ?? []) as SalesRow[];

  const [{ plansById, castPlanByCast, masters, normByCast, taxByCast, grace }, acct, incentives, receivablesByCast, advancesByCast, transportByCast, shimeiAmtByCast, avgWageByCast] = await Promise.all([
    loadMasters(admin, storeId, win.period, win.periodEnd),
    loadAccounting(admin, storeId, win),
    loadIncentives(admin, storeId, win),
    loadReceivables(admin, storeId, win),
    loadAdvances(admin, storeId, win),
    loadTransport(admin, storeId, win),
    loadShimeiAmounts(admin, storeId, win), // mig0086: 率バック母数
    loadAvgDailyWage(admin, storeId, win.period), // ★裁定98-C: 平均賃金（直近3確定期）
  ]);
  const { byCast: punchByCast, recipientsByDate } = await loadPunch(admin, storeId, win, grace);

  // sales を cast 別に集計＋日次
  const salesByCast = new Map<string, { sales: number; hon: number; jonai: number; dohan: number; daily: Map<string, number> }>();
  for (const r of salesRows) {
    const cur = salesByCast.get(r.cast_id) ?? { sales: 0, hon: 0, jonai: 0, dohan: 0, daily: new Map() };
    cur.sales += r.sales; cur.hon += r.hon; cur.jonai += r.jonai; cur.dohan += r.dohan;
    cur.daily.set(r.biz_date, (cur.daily.get(r.biz_date) ?? 0) + r.sales);
    salesByCast.set(r.cast_id, cur);
  }

  // 対象 cast = sales ∪ punch（is_active 不問・稼働ゼロ除外）
  const targetIds = new Set<string>([...salesByCast.keys(), ...punchByCast.keys()]);
  if (targetIds.size === 0) return { casts: [], masters, incentives, recipientsByDate, receivablesByCast, advancesByCast, transportByCast };

  // cast 名＋employment（is_active 不問＝退職者含む。employment は裁定98 の二層分岐キー）
  const { data: castRows, error: eN } = await admin.from("casts").select("id, name, employment").in("id", [...targetIds]);
  if (eN) throw new Error(`casts: ${eN.message}`);
  const nameById = new Map<string, string>();
  const employmentById = new Map<string, "委託" | "雇用" | null>();
  for (const c of (castRows ?? []) as { id: string; name: string; employment: "委託" | "雇用" | null }[]) {
    nameById.set(c.id, c.name);
    employmentById.set(c.id, c.employment ?? null);
  }

  const casts: CastRaw[] = [];
  for (const cid of targetIds) {
    const s = salesByCast.get(cid);
    const p = punchByCast.get(cid);
    const back = acct.backByCast.get(cid) ?? { drink: 0, champ: 0, bottle: 0, pt: 0 };
    const cb = acct.champBottleByCast.get(cid) ?? { champCnt: 0, bottleCnt: 0 };
    const cp = castPlanByCast.get(cid);
    const plan = cp ? plansById.get(cp.planId) ?? null : null;
    // 日次 = sales 日 ∪ punch 日（hours>0 or sales>0）
    const dateSet = new Set<string>([...(s?.daily.keys() ?? []), ...(p?.hoursByDate.keys() ?? [])]);
    const daily = [...dateSet].sort().map((bizDate) => ({
      bizDate,
      sales: s?.daily.get(bizDate) ?? 0,
      hours: p?.hoursByDate.get(bizDate) ?? 0,
    })).filter((d) => d.sales > 0 || d.hours > 0);
    casts.push({
      castId: cid,
      castName: nameById.get(cid) ?? "(不明)",
      sales: s?.sales ?? 0,
      hon: s?.hon ?? 0,
      jonai: s?.jonai ?? 0,
      dohan: s?.dohan ?? 0,
      // mig0086: 率バック母数（指名料行なし=0＝rate プランでもバック0円が正・裁定vi）
      honShimeiAmt: shimeiAmtByCast.get(cid)?.hon ?? 0,
      jonaiShimeiAmt: shimeiAmtByCast.get(cid)?.jonai ?? 0,
      daily,
      productBack: { drink: back.drink, champ: back.champ, bottle: back.bottle },
      pointProducts: back.pt,
      champCnt: cb.champCnt,
      bottleCnt: cb.bottleCnt,
      days: p?.days ?? 0,
      lateN: p?.lateN ?? 0,
      absentN: p?.absentN ?? 0,
      anomalyCount: p?.anomalyCount ?? 0,
      plan,
      override: cp?.override,
      norm: normByCast.get(cid) ?? { days: 0, dohan: 0, salesTarget: 0 },
      taxProfileMode: taxByCast.get(cid) ?? null,
      employment: employmentById.get(cid) ?? null, // ★裁定98: 二層ガードの分岐キー
      avgDailyWage: avgWageByCast.get(cid) ?? null, // ★裁定98-C: null=暫定式（pay.ts 側）
    });
  }
  return { casts, masters, incentives, recipientsByDate, receivablesByCast, advancesByCast, transportByCast };
}
