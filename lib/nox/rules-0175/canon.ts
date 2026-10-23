// ★便 P175-prep P-5（裁定418 CANON 型①〜⑰・0175 v2 ★11〜★16）: レジ・給与の計算の純関数。DB を知らない・フラグ false では一切呼ばれない。
//   時間帯セット単価は pricing_rules（既存）＝ここでは扱わない。ここ＝卓種別サービス率／現金割引／時間帯テーブル（同伴・本指名・場内・ドリンク・時給）／
//   バック単位（組・時・30 分・延長・セット・当日時給加算・固定＋率）／席種別の額率／報酬率軸のスライド（UP 累積・倍率・支給率・連続 N 期・規定の比例・未達は UP 側のみ停止・
//   提案→適用／除外）／日数区分×給率の支給可否／新人免除期間／日払い上限／イベント加算／予約バック。
import { roundYen, roundPt1 } from "@/lib/nox/money";

// ── ② 卓種別サービス率 ──
export function serviceRateOf(store: { service_rate: number; service_rate_by_seat?: Record<string, number> | null }, seatKind: string | null | undefined): number {
  const m = store.service_rate_by_seat ?? {};
  return seatKind && typeof m[seatKind] === "number" ? m[seatKind] : store.service_rate;
}
// ── ③ 支払方法による割引（残額に対する率・1 円未満四捨五入）＝check_pay v2 と同じ式（表示の先出し） ──
export function payDiscountOf(rates: Record<string, number> | null | undefined, method: "cash" | "card" | "emoney" | "other", remaining: number): number {
  const r = rates?.[method] ?? 0;
  return r > 0 && remaining > 0 ? Math.round(remaining * r / 100) : 0;
}
// ── ⑯ 時間帯テーブル（分・翌日またぎ 1440+・隙間は直前の帯を引き継ぐ＝相談役案） ──
export type RateBand = { target: string; from_min: number; to_min: number; value_amount: number | null; value_rate: number | null; priority?: number };
export function bandValueOf(bands: readonly RateBand[], target: string, minuteOfDay: number): { amount: number | null; rate: number | null } | null {
  const list = bands.filter((b) => b.target === target).sort((a, b) => a.from_min - b.from_min || (a.priority ?? 100) - (b.priority ?? 100));
  if (list.length === 0) return null;
  const hit = list.find((b) => b.from_min <= minuteOfDay && minuteOfDay < b.to_min);
  if (hit) return { amount: hit.value_amount, rate: hit.value_rate };
  const before = [...list].reverse().find((b) => b.to_min <= minuteOfDay);   // 隙間＝直前の帯を引き継ぐ
  return before ? { amount: before.value_amount, rate: before.value_rate } : null;
}
/** 時給の時間帯（額 0＝時給停止）＝その時刻の時給（無ければ base） */
export const hourlyAtOf = (bands: readonly RateBand[], minuteOfDay: number, base: number): number => { const v = bandValueOf(bands, "hourly", minuteOfDay); return v && v.amount !== null ? v.amount : base; };

// ── ⑭ バックの単位（組／時／30 分／延長ごと／セットごと／当日時給加算）＋固定＋率の併用 ──
export type BackUnit = "per_check" | "per_hour" | "per_30min" | "per_extension" | "per_set" | "hourly_add";
export type BackUnitInput = { amount: number; rate: number | null; unit: BackUnit; checks: number; seatedMinutes: number; extensions: number; sets: number; subtotal: number };
/** 固定額の部分（単位ごと）＋率の部分（小計×率）＝併用。hourly_add は 0（時給側に加算＝hourlyAddOf） */
export function backOf(i: BackUnitInput): { fixed: number; rated: number; total: number } {
  const n = i.unit === "per_check" ? i.checks : i.unit === "per_hour" ? Math.floor(i.seatedMinutes / 60) : i.unit === "per_30min" ? Math.floor(i.seatedMinutes / 30) : i.unit === "per_extension" ? i.extensions : i.unit === "per_set" ? i.sets : 0;
  const fixed = i.amount * n;
  const rated = i.rate !== null && i.rate > 0 ? roundYen(i.subtotal * i.rate / 100) : 0;
  return { fixed, rated, total: fixed + rated };
}
/** hourly_add＝その日の時給に件数×額を加算（BELLEZZA 本指名 1 件で当日 +200 円） */
export const hourlyAddOf = (amount: number, unit: BackUnit, countOnDay: number): number => (unit === "hourly_add" ? amount * countOnDay : 0);

// ── ⑮ 席種別の額率（商品バック） ──
export type SeatKindKey = "free" | "hon" | "jonai" | "vip";
export function productBackBySeatOf(plan: { product_back_rate_by_kind?: Record<string, number> | null; product_back_fixed_vip?: number | null; product_back_rate_vip?: number | null; product_back_fixed_hon?: number | null; product_back_fixed_jonai?: number | null; product_back_fixed_free?: number | null }, kind: SeatKindKey, lineTotal: number, qty: number): number {
  if (kind === "vip") { if (typeof plan.product_back_rate_vip === "number") return roundYen(lineTotal * plan.product_back_rate_vip / 100); if (typeof plan.product_back_fixed_vip === "number") return plan.product_back_fixed_vip * qty; }
  const r = plan.product_back_rate_by_kind?.[kind];
  if (typeof r === "number") return roundYen(lineTotal * r / 100);
  const f = kind === "hon" ? plan.product_back_fixed_hon : kind === "jonai" ? plan.product_back_fixed_jonai : plan.product_back_fixed_free;
  return typeof f === "number" ? f * qty : 0;
}

// ── ⑥⑦⑪⑫⑬⑰ 報酬率軸のスライド ──
export type PayRateTier = { at_pct: number; up_amount?: number; down_amount?: number; back_mult?: number; pay_pct?: number; wage_cut_pct?: number; hon_back_rate?: number; bonus_pct?: number; days_min?: number; back_gate_pct?: number };
/** 報酬率＝時給分の報酬（バックを含めない）÷ 売上小計（⑩の範囲）＝%・小数 1 桁。小計 0 は null（判定しない） */
export const payRatePctOf = (timePay: number, salesSubtotal: number): number | null => (salesSubtotal > 0 ? roundPt1(timePay / salesSubtotal * 100) : null);
/** 段＝at_pct 以上の最大（昇順）。null＝段なし */
export function payRateTierOf(tiers: readonly PayRateTier[], pct: number | null): { idx: number; tier: PayRateTier } | null {
  if (pct === null) return null;
  let hit: { idx: number; tier: PayRateTier } | null = null;
  tiers.forEach((t, idx) => { if (pct >= t.at_pct) hit = { idx, tier: t }; });
  return hit;
}
export type SlideDirection = "up" | "hold" | "assess";
/** 方向＝UP（up_amount>0 か back_mult 100）／査定（pay_pct<100 か wage_cut か down_amount）／据え置き */
export function directionOf(t: PayRateTier | null): SlideDirection {
  if (!t) return "hold";
  if ((t.pay_pct !== undefined && t.pay_pct < 100) || (t.wage_cut_pct ?? 0) > 0 || (t.down_amount ?? 0) > 0) return "assess";
  if ((t.up_amount ?? 0) > 0 || (t.back_mult ?? 0) >= 100 || (t.bonus_pct ?? 0) > 0) return "up";
  return "hold";
}
/** ⑦ 連続 N 期＝直前の期ログの方向と同じなら streak+1・違えば 1（途切れたら 0 から）。成立＝streak ≥ N */
export function streakOf(prev: { direction: SlideDirection; streak: number } | null, dir: SlideDirection): number { return prev && prev.direction === dir ? prev.streak + 1 : 1; }
export const streakMetOf = (streak: number, n: number): boolean => streak >= Math.max(1, n);

// ⑤⑪ 規定（日数・時間）＝週の目安の区分別・期の長さに比例（端数は切上）
export type NormTier = { week_days_min: number; week_days_max: number; days_required: number; hours_required: number };
export function normTierOf(tiers: readonly NormTier[], weekTarget: number | null): NormTier | null {
  if (weekTarget === null) return null;
  return tiers.find((t) => t.week_days_min <= weekTarget && weekTarget <= t.week_days_max) ?? null;
}
export function normRequiredOf(t: NormTier, periodDays: number, monthDays = 30): { days: number; hours: number } {
  return { days: Math.ceil((t.days_required * periodDays) / monthDays), hours: Math.ceil((t.hours_required * periodDays) / monthDays) }; // 整数の積→商（60×31/30＝62 を浮動小数で 63 にしない）
}
export const normMetOf = (req: { days: number; hours: number } | null, actual: { days: number; hours: number }): boolean => !req || (actual.days >= req.days && actual.hours >= req.hours);

// ⑰(b)(c) 支給可否＝日数区分×給率閾値・新人免除
export function backGateOf(tier: PayRateTier | null, days: number, pct: number | null): boolean {
  if (!tier || tier.days_min === undefined || tier.back_gate_pct === undefined || pct === null) return true;
  return days >= tier.days_min ? pct <= tier.back_gate_pct : false;
}
export function graceOf(joinedOn: string | null | undefined, graceMonths: number, periodEnd: string): boolean {
  if (!joinedOn || graceMonths <= 0) return false;
  const j = new Date(`${joinedOn}T00:00:00Z`); j.setUTCMonth(j.getUTCMonth() + graceMonths);
  return periodEnd < j.toISOString().slice(0, 10);
}

export type CanonCtx = {
  tiers: PayRateTier[]; streakN: number; prevLog: { direction: SlideDirection; streak: number } | null;
  salesSubtotal: number; normTiers: NormTier[]; weekTarget: number | null; periodDays: number; actual: { days: number; hours: number };
  joinedOn?: string | null; graceMonths: number; periodEnd: string;
  decided?: "apply" | "exclude" | null;   // ⑬ 提案→店が適用／除外（未決は適用しない＝提案のまま）
};
export type CanonOutcome = {
  pct: number | null; tierIdx: number | null; direction: SlideDirection; streak: number; met: boolean; normMet: boolean; grace: boolean;
  windowN: number;   // ⑦ 移動窓の N（判定ログ＝窓の N 期の率・帯・適用した処理は slide_decisions.detail に＝P175 client）
  upAmount: number; downAmount: number; backMult: number; payPct: number; wageCutPct: number; honBackRate: number | null; bonusPct: number; backGate: boolean;
  applied: boolean;   // 店が「適用」したときだけ金額に効く（⑬）
};
/** CANON 型の判定（金額に掛ける前の決定）。⑦（裁定418 差し替え 10/23）＝直前 N 期（既定 2）の移動窓＝N 期すべてが同じ帯のときだけ今期に適用＝連続カウント streak ≥ N と同値（窓は 1 期ずつずれる＝連続すれば毎期発動）・不成立の期は前期の決定時給のまま。
 *  ⑫（差し替え）＝UP は +額を決定時給に加算して以後も続く（累積＝cast_rate_history の slide_up）・査定は決定時給を変えず今期の総報酬（時給分＋バック）に支給率を掛け、バック倍率は今期のバックに掛ける＝減率（wage_cut）は使わない。
 *  ⑪（Agoora 確定 10/23）＝規定未達は UP 側（up_amount・back_mult 100・bonus）だけ停止・査定側は適用。⑰(c) 免除＝査定を止める */
export function canonOutcomeOf(c: CanonCtx, timePay: number): CanonOutcome {
  const pct = payRatePctOf(timePay, c.salesSubtotal);
  const hit = payRateTierOf(c.tiers, pct);
  const dir = directionOf(hit?.tier ?? null);
  const streak = streakOf(c.prevLog, dir);
  const met = streakMetOf(streak, c.streakN);
  const nt = normTierOf(c.normTiers, c.weekTarget);
  const normMet = normMetOf(nt ? normRequiredOf(nt, c.periodDays) : null, c.actual);
  const grace = graceOf(c.joinedOn, c.graceMonths, c.periodEnd);
  const t = hit?.tier ?? null;
  const applied = met && c.decided === "apply";
  const upOk = applied && dir === "up" && normMet;          // ⑪ 未達は UP 側だけ停止
  const assessOk = applied && dir === "assess" && !grace;    // ⑰(c) 免除中は査定なし
  return {
    pct, tierIdx: hit?.idx ?? null, direction: dir, streak, met, normMet, grace, windowN: Math.max(1, c.streakN),
    upAmount: upOk ? (t?.up_amount ?? 0) : 0, downAmount: assessOk ? (t?.down_amount ?? 0) : 0,
    backMult: upOk ? (t?.back_mult ?? 100) : (assessOk && t?.back_mult !== undefined ? t.back_mult : 100),
    payPct: assessOk ? (t?.pay_pct ?? 100) : 100, wageCutPct: 0,   // ⑫ 差し替え: 査定は決定時給を変えない（減率は使わない＝常に 0）
    honBackRate: assessOk && t?.hon_back_rate !== undefined ? t.hon_back_rate : null, bonusPct: upOk ? (t?.bonus_pct ?? 0) : 0,
    backGate: backGateOf(t, c.actual.days, pct), applied,
  };
}
/** 金額への適用＝バック×倍率・支給率（総報酬に掛ける＝決定時給は変えない・⑫）・時給の減率・支給可否（⑰(b)）。戻り＝差分（gross に足す／引く額） */
export function canonApplyOf(o: CanonOutcome, base: { timePay: number; backsTotal: number; gross: number; salesSubtotal: number }): { backsDelta: number; timeDelta: number; bonus: number; payPctDelta: number; gross: number } {
  const backsAfterGate = o.backGate ? base.backsTotal : 0;
  const backsAfterMult = roundYen(backsAfterGate * o.backMult / 100);
  const backsDelta = backsAfterMult - base.backsTotal;
  const timeDelta = -roundYen(base.timePay * o.wageCutPct / 100);
  const bonus = roundYen(base.salesSubtotal * o.bonusPct / 100);
  const gross1 = base.gross + backsDelta + timeDelta + bonus;
  const payPctDelta = roundYen(gross1 * o.payPct / 100) - gross1;
  return { backsDelta, timeDelta, bonus, payPctDelta, gross: gross1 + payPctDelta };
}

// ── ⑳ 日払いの上限・イベント加算・予約バック ──
export function dailyPayCapOf(tiers: readonly { hours_min: number; cap: number }[] | null | undefined, workedHours: number | null): number | null {
  if (!tiers || tiers.length === 0 || workedHours === null) return null;
  const hit = [...tiers].sort((a, b) => a.hours_min - b.hours_min).filter((t) => t.hours_min <= workedHours).pop();
  return hit ? hit.cap : null;
}
export type EventBonus = { kind: "birthday" | "date_range"; day_from: number | null; day_to: number | null; target: "hon" | "jonai" | "dohan" | "drink" | "all"; add_rate: number | null; add_amount: number | null };
export function eventBonusOf(events: readonly EventBonus[], ymd: string, birthday: string | null | undefined, target: EventBonus["target"], subtotal: number): number {
  const d = Number(ymd.slice(8, 10)); const md = ymd.slice(5);
  let add = 0;
  for (const e of events) {
    if (e.target !== "all" && e.target !== target) continue;
    const on = e.kind === "birthday" ? !!birthday && birthday.slice(5) === md : (e.day_from !== null && e.day_to !== null && e.day_from <= d && d <= e.day_to);
    if (!on) continue;
    add += e.add_amount ?? (e.add_rate !== null ? roundYen(subtotal * e.add_rate / 100) : 0);
  }
  return add;
}
export function reservationBackOf(tiers: readonly { at: number; rate: number }[] | null | undefined, subtotal: number): number {
  if (!tiers || tiers.length === 0) return 0;
  const hit = [...tiers].sort((a, b) => a.at - b.at).filter((t) => subtotal >= t.at).pop();
  return hit ? roundYen(subtotal * hit.rate / 100) : 0;
}
/** 売上小計帯→バック率（SCANDAL＝back_rate_tiers.hon） */
export function backRateByTierOf(tiers: readonly { at: number; rate: number }[] | null | undefined, subtotal: number, fallbackRate: number | null): number | null {
  if (!tiers || tiers.length === 0) return fallbackRate;
  const hit = [...tiers].sort((a, b) => a.at - b.at).filter((t) => subtotal >= t.at).pop();
  return hit ? hit.rate : fallbackRate;
}
