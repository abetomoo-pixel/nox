// PayInput 組み立て（純関数・DB を知らない＝verify で直接叩ける）。
// collect.ts が読んだ cast 1人分の raw ＋ 店共通マスタ → payOf の入力 object を作る。
// 天引き3種（arDeduct/advanceDeduct/okuriDeduct）は二段 payOf の確定天引き額（F2e-1 で ar・F2e-2 で adv/okuri を結線）。
// net = pay.net（B: サーバが net の責務）。★extras は gross に内在化され源泉対象＝外側加算は行わない（裁定26）。

import type {
  PayInput,
  CompPlan,
  PlanOverride,
  Deduction,
  PenaltyConfig,
  NormPenaltyConfig,
  BackDef,
  TaxMode,
} from "../pay";
import type { AdjustmentRow } from "./adjust"; // 裁定258／264

// breakdown_json の器: { pay: PayResult, extras: Extra[] }。
// #32 出勤インセンティブは extras に {kind:'attendance_bonus', amount, label, source:incentive行id} を乗せる。
export type Extra = { kind: string; amount: number; label?: string; source?: string };

// cast 1人分の集計済み raw（collect.ts が組む）。taxMode は core が解決して別引数で渡す。
export type CastRaw = {
  castId: string;
  castName: string;
  sales: number;
  hon: number;
  jonai: number;
  dohan: number;
  // mig0086: 率バックの母数＝窓内 Σcheck_lines.line_total（fee_kind 別・cast_id=本人・裁定iii/vi）。
  //   collect.ts が 0 埋めで必ず格納（per_count プランでは payOf が読まない）。
  honShimeiAmt: number;
  jonaiShimeiAmt: number;
  daily: { bizDate: string; sales: number; hours: number }[];
  productBack: { drink: number; champ: number; bottle: number };
  calculatedBack: number; // ★裁定113: Σ check_cast_backs.calculated_back_amount（null=0・collect が必ず格納）
  pointProducts: number;
  champCnt: number;
  bottleCnt: number;
  days: number; // punch-match final ∈ {ok,late} の営業日数
  lateN: number;
  absentN: number;
  anomalyCount: number; // out 欠損等 S8 anomaly のある日数（表示のみ・論点3）
  missingOutDates?: string[]; // ★N3 AV-4（2026-09-24）: 退勤の記録が無い勤務の営業日（in あり・out なし・final ok|late）。表示のみ・fixture は省略＝従来と同値
  plan: CompPlan | null; // cast_plan 未設定なら null（core が blocker 化）
  override?: PlanOverride;
  // ★夜間便 N3（裁定287-5）: 期と重なる保証行（cast_plan.overrides_json.guarantee=true）。collect が格納・fixture は省略＝従来と同値
  guarantees?: { validFrom: string; validTo: string | null; base: number }[];
  // ★夜間便 N3b（裁定288）: slide_apply と「営業日の暦月→その前月の合計」。'next' の店でだけ collect が格納（'current'／fixture は無し＝従来と同値）
  slideApply?: "next" | "current";
  prevMonthTotals?: Record<string, { sales: number; pts: number }>; // key＝営業日が属する暦月 'YYYY-MM'（値＝その前月の合計）
  norm: { days: number; dohan: number; salesTarget?: number }; // ★裁定96-②: salesTarget=achievement の目標（0/なし=不適用）
  taxProfileMode: TaxMode | null; // cast_tax_profiles 未登録なら null（core が gate）
  employment: "委託" | "雇用" | null; // ★裁定98: casts.employment（null＋sanction 行ありは core が no_employment blocker）
  avgDailyWage: number | null; // ★裁定98-C: 平均賃金（直近3確定期）。null=payOf の暫定式
  // ★裁定258／264: run 別調整控除（payroll_adjustments・当該 cast 分）。optional＝collect の結線は次レーン（未結線は []）。
  //   二段 payOf（core 187／205）の両方へ同じ行が入る＝調整が先に引かれ available が減る（裁定258 配分順序）。
  adjustments?: AdjustmentRow[];
  // ★0154 D2／D6（裁定291 追補1 B・294-8）: 報酬型の入力と計算期間。collect が格納・fixture は省略＝従来と同値
  shiftHoursByDate?: Record<string, number>; // 確定シフトの時間（bizDate→h・shift_guarantee 用）
  attendanceDays?: number;                   // 出勤区分（shukkin／late／dohan）の回数（per_shift 用）
  calcPeriod?: { start: string; end: string }; // 計算期間（入店日／退店日で run の期間を切る・payslips.calc_period_* へ凍結）
};

// 店共通マスタ（loadStoreMasters が組む）。
export type StoreMasters = {
  penalty: PenaltyConfig;
  normConfig: NormPenaltyConfig;
  deductions: Deduction[];
  customBackDefs: BackDef[];
};

// 'YYYY-MM-DD' → 日（payOf の DailyRecord.d は日次表示用の識別子・期間は単月なので日で一意）。
function dayNum(bizDate: string): number {
  return Number.parseInt(bizDate.slice(8, 10), 10);
}

// 二段 payOf の確定天引き額を注入（1回目 全0 で available 算出→送り→前借り→売掛の順に共通 budget 消費→
//   確定額で再計算）。arDeduct=F2e-1・advanceDeduct/okuriDeduct=F2e-2。positional 追加＝既存4引数呼び出しと後方互換。
// ★periodDays / extrasTotal は必須（既定値を置かない＝呼び出し側が必ず明示する）。
//   periodDays は「計算期間の暦日数（両端含む）」＝源泉の 5,000円×日数 の日数（裁定23）。
//   extrasTotal は出勤ボーナス等の加算合計＝gross に入り源泉対象になる（裁定23-b ①）。
/** ★N3: 保証行（valid_from〜valid_to）を営業日ごとの base に写す。保証行が期の日に 1 日も掛からなければ {}（キーを足さない） */
export function guaranteeInputOf(raw: Pick<CastRaw, "daily" | "guarantees">): Pick<PayInput, "guaranteeByDay" | "guaranteeSpans"> {
  const gs = raw.guarantees ?? [];
  if (gs.length === 0) return {};
  const byDay: Record<number, number> = {};
  for (const d of raw.daily) {
    const g = gs.find((x) => x.validFrom <= d.bizDate && (x.validTo === null || d.bizDate <= x.validTo));
    if (g) byDay[dayNum(d.bizDate)] = g.base;
  }
  if (Object.keys(byDay).length === 0) return {};
  return { guaranteeByDay: byDay, guaranteeSpans: gs.map((g) => ({ from: g.validFrom, to: g.validTo, base: g.base })) };
}

/** ★N3b: 'next' の店の営業日ごとに「その暦月の前月の合計」を写す。'current'／欠損・前月データ無し＝{}（キーを足さない） */
export function slideInputOf(raw: Pick<CastRaw, "daily" | "slideApply" | "prevMonthTotals">): Pick<PayInput, "slideByDay"> {
  if (raw.slideApply !== "next") return {};
  const byDay: Record<number, { month: string; sales: number; pts: number }> = {};
  for (const d of raw.daily) {
    const month = d.bizDate.slice(0, 7);
    const t = raw.prevMonthTotals?.[month] ?? { sales: 0, pts: 0 }; // 前月の実績が無い＝0＝最下段（288-3）
    byDay[dayNum(d.bizDate)] = { month, sales: t.sales, pts: t.pts };
  }
  return Object.keys(byDay).length ? { slideByDay: byDay } : {};
}

/** 計算期間の暦日数（両端含む・UTC 差分＝window.periodDaysBetween と同式） */
export function calcDaysOf(p: { start: string; end: string }): number {
  return Math.round((Date.parse(p.end + "T00:00:00Z") - Date.parse(p.start + "T00:00:00Z")) / 86_400_000) + 1;
}
/** ★0154 D6（裁定294-8／税理士 T1）: 計算期間＝run の期間を入店日（joined_on）／退店日（left_on）で切る。両方 null なら run の期間 */
export function calcPeriodOf(win: { periodStart: string; periodEnd: string }, joinedOn: string | null | undefined, leftOn: string | null | undefined): { start: string; end: string } {
  const start = joinedOn && joinedOn > win.periodStart ? joinedOn : win.periodStart;
  const end = leftOn && leftOn < win.periodEnd ? leftOn : win.periodEnd;
  return { start, end: end < start ? start : end };
}
export function buildPayInput(
  raw: CastRaw,
  taxMode: TaxMode,
  masters: StoreMasters,
  periodDays: number,
  extrasTotal: number,
  arDeduct = 0,
  advanceDeduct = 0,
  okuriDeduct = 0,
): PayInput {
  if (!raw.plan) throw new Error(`buildPayInput: plan 未設定（cast ${raw.castId}）`);
  return {
    cast: {
      hon: raw.hon, jonai: raw.jonai, dohan: raw.dohan, days: raw.days, sales: raw.sales,
      honShimeiAmt: raw.honShimeiAmt, jonaiShimeiAmt: raw.jonaiShimeiAmt, // mig0086
    },
    daily: raw.daily.map((d) => ({ d: dayNum(d.bizDate), hours: d.hours, sales: d.sales })),
    plan: raw.plan,
    override: raw.override,
    ...guaranteeInputOf(raw), // ★N3: 保証行が無ければ何も足さない（キー自体を持たない＝従来と 1 バイト同値）
    ...slideInputOf(raw), // ★N3b: 'next' でなければ何も足さない
    productBack: raw.productBack,
    calculatedBack: raw.calculatedBack, // ★裁定113
    pointProducts: raw.pointProducts,
    customBackDefs: masters.customBackDefs,
    metrics: { champCnt: raw.champCnt, bottleCnt: raw.bottleCnt }, // 論点1: check_lines kind から集計
    deductions: masters.deductions,
    penalty: masters.penalty,
    normConfig: masters.normConfig,
    norm: raw.norm,
    // ★裁定96-②③: components（plan 由来）は payOf が input.plan.components を読む。
    //   achievement の目標だけ PayInput へ明示で渡す（norm ペナルティの days/dohan とは別用途）。
    salesTarget: raw.norm.salesTarget ?? 0,
    fine: { absentN: raw.absentN, lateN: raw.lateN },
    arDeduct, // 売掛天引き（E9 で算出した確定額）
    advanceDeduct, // 前借り天引き（F2e-2・E9 同型）
    okuriDeduct, // 送り実費天引き（F2e-2・繰越なし）
    periodDays: raw.calcPeriod ? calcDaysOf(raw.calcPeriod) : periodDays, // ★計算期間の暦日数（源泉専用・出勤日数 raw.days とは別物）。★0154 D6: 計算期間があればその暦日数（欠損は従来）
    extrasTotal, // ★加算合計（gross に入る＝源泉対象）
    // ★0154 D2: 報酬型の入力（未指定キーは足さない＝従来と 1 バイト同値）
    ...(raw.shiftHoursByDate ? { shiftHoursByDay: Object.fromEntries(Object.entries(raw.shiftHoursByDate).map(([d, h]) => [dayNum(d), h])) } : {}),
    ...(raw.attendanceDays !== undefined ? { attendanceDays: raw.attendanceDays } : {}),
    ...(raw.calcPeriod ? { calcPeriodDays: calcDaysOf(raw.calcPeriod), periodDays } : {}),
    employment: raw.employment, // ★裁定98: sanction 二層ガードの分岐キー
    avgDailyWage: raw.avgDailyWage, // ★裁定98-C: null=暫定式
    taxMode,
    adjustments: raw.adjustments ?? [], // ★裁定258／264: 行のまま渡す（率の分母 gross は payOf 内で確定）
  };
}

// ★computeNet は削除した（裁定26・①実施）。extras は payOf の gross に内在化され源泉対象になったため、
//   「pay.net に extras を外側で足す」関数は二重加算の罠にしかならない。net は常に payOf の結果そのもの。
