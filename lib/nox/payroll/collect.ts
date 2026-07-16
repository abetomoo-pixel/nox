// 期間データの読み取り（給与確定サーバの権威読み）。
// 按分の DB 権威（D7a）を保つため get_cast_sales は「ユーザー文脈（manager）クライアント」で呼ぶ
//   （service キーは auth_org_id() null で forbidden＝admin では呼べない）。
// 他の生読み取り（会計バック・打刻・マスタ）は admin（service・RLS バイパス・検証済み store）で読む。
// 対象 cast（裁定C）= get_cast_sales の cast ∪ 窓内 punches の cast（is_active 不問・稼働ゼロは除外）。

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayrollWindow } from "./window";
import type { CastRaw, StoreMasters } from "./assemble";
import type { CompPlan, PlanOverride, Deduction, BackDef, TaxMode } from "../pay";
import { buildMatchInput, dayWorkedHours, type PunchRow, type ShiftRow, type AttendanceRow } from "../punch-io";
import { matchPunches } from "../punch-match";
import { bizDateOf } from "../biz-date";

type SalesRow = { cast_id: string; biz_date: string; sales: number; hon: number; jonai: number; dohan: number };

// #32 出勤インセンティブ（published・当該期間の biz_date）
export type Incentive = { id: string; bizDate: string; amountMode: "per_head" | "pooled"; amount: number };

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
async function loadMasters(admin: SupabaseClient, storeId: string, period: string) {
  const [plansR, castPlanR, penR, dedR, cbR, normR, taxR] = await Promise.all([
    admin.from("comp_plans").select("id, name, base, hon_back, jonai_back, dohan_back, sales_slide, point_slide").eq("store_id", storeId),
    admin.from("cast_plan").select("cast_id, plan_id, overrides_json").eq("store_id", storeId),
    admin.from("penalty_config").select("*").eq("store_id", storeId).maybeSingle(),
    admin.from("deductions").select("id, name, amount, per").eq("store_id", storeId).eq("is_active", true),
    admin.from("custom_back_defs").select("id, name, basis, value, cond_json").eq("store_id", storeId).eq("is_active", true),
    admin.from("cast_norms").select("cast_id, days_target, dohan_target").eq("store_id", storeId).eq("period", period),
    admin.from("cast_tax_profiles").select("cast_id, mode").eq("store_id", storeId),
  ]);
  for (const r of [plansR, castPlanR, penR, dedR, cbR, normR, taxR]) {
    if (r.error) throw new Error(`マスタ読み取り: ${r.error.message}`);
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
    });
  }
  const castPlanByCast = new Map<string, { planId: string; override: PlanOverride }>();
  for (const c of (castPlanR.data ?? []) as Record<string, unknown>[]) {
    castPlanByCast.set(c.cast_id as string, { planId: c.plan_id as string, override: (c.overrides_json ?? {}) as PlanOverride });
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
    })),
    customBackDefs: ((cbR.data ?? []) as Record<string, unknown>[]).map((b) => ({
      id: b.id as string, name: b.name as string, basis: b.basis as BackDef["basis"], value: b.value as number,
      cond: (b.cond_json ?? undefined) as BackDef["cond"],
    })),
  };
  const normByCast = new Map<string, { days: number; dohan: number }>();
  for (const n of (normR.data ?? []) as Record<string, unknown>[]) {
    normByCast.set(n.cast_id as string, { days: n.days_target as number, dohan: n.dohan_target as number });
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
async function loadAccounting(admin: SupabaseClient, storeId: string, win: PayrollWindow) {
  const backByCast = new Map<string, { drink: number; champ: number; bottle: number; pt: number }>();
  const champBottleByCast = new Map<string, { champCnt: number; bottleCnt: number }>();

  // ★F3f: 承認済 drink_claims の back_amount を cast 別に drink バックへ合流（対象 check の営業日で期間フィルタ）
  const { data: claims, error: eDc } = await admin
    .from("drink_claims").select("cast_id, back_amount, checks!inner(started_at)")
    .eq("store_id", storeId).eq("status", "approved")
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

// 窓内の shifts（確定）/attendance/punches を cast 別に読み、punch-io→matchPunches で days/lateN/absentN/日次hours を得る。
// export: /api/mine/norm-progress が同一定義（final∈{ok,late}）で days を再利用（SQL 再実装しない＝定義乖離防止）。
//   cast セッションの client を渡すと RLS パターン1 で自分の行のみ＝self スコープに自然に縮む。
export async function loadPunch(admin: SupabaseClient, storeId: string, win: PayrollWindow, grace: { lateGrace?: number; earlyGrace?: number; overGrace?: number }) {
  const [shiftsR, attR, punchR] = await Promise.all([
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

// #32: published の attendance_incentives を biz_date∈[periodStart,periodEnd] で読む（確認2: biz_date 基準統一）。
async function loadIncentives(admin: SupabaseClient, storeId: string, win: PayrollWindow): Promise<Incentive[]> {
  const { data, error } = await admin
    .from("attendance_incentives")
    .select("id, biz_date, amount_mode, amount")
    .eq("store_id", storeId).eq("status", "published")
    .gte("biz_date", win.periodStart).lte("biz_date", win.periodEnd);
  if (error) throw new Error(`attendance_incentives: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, bizDate: r.biz_date as string,
    amountMode: r.amount_mode as "per_head" | "pooled", amount: r.amount as number,
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

  const [{ plansById, castPlanByCast, masters, normByCast, taxByCast, grace }, acct, incentives, receivablesByCast, advancesByCast, transportByCast] = await Promise.all([
    loadMasters(admin, storeId, win.period),
    loadAccounting(admin, storeId, win),
    loadIncentives(admin, storeId, win),
    loadReceivables(admin, storeId, win),
    loadAdvances(admin, storeId, win),
    loadTransport(admin, storeId, win),
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

  // cast 名（is_active 不問＝退職者含む）
  const { data: castRows, error: eN } = await admin.from("casts").select("id, name").in("id", [...targetIds]);
  if (eN) throw new Error(`casts: ${eN.message}`);
  const nameById = new Map<string, string>();
  for (const c of (castRows ?? []) as { id: string; name: string }[]) nameById.set(c.id, c.name);

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
      norm: normByCast.get(cid) ?? { days: 0, dohan: 0 },
      taxProfileMode: taxByCast.get(cid) ?? null,
    });
  }
  return { casts, masters, incentives, recipientsByDate, receivablesByCast, advancesByCast, transportByCast };
}
