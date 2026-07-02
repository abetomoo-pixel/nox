// payOf 純関数（NOX の給与計算の心臓部）。
// 実装元: docs/NOX_payOf_精密仕様_モック抽出.md（正本）＋ mock/nox-nightwork-app.html の
//         te（assembler）/ Py（スライド時給）/ fp（階段関数）/ Vy（自由バック）/ uS（売上率）/ vS（商品バック）。
// 原則:
//  - DB を知らない純関数（入力は集計済み plain object・シミュレーターと給与確定が同じ payOf を呼ぶ）。
//  - お金は整数（円）。丸めは money.ts の roundYen/roundPt1 に集約（floor 差替は1箇所）。
//  - 打刻照合（遅刻/当欠の回数算出）は payOf の外＝回数を入力で受ける。
// モック忠実で実装し F2 ゲートで差し替える点（精密仕様 §7）:
//  - 源泉の日数 = 出勤日数（暦日数か否かは税理士確認）
//  - 送り実費 vs 一律送り代の二重控除ガード = 無し（モック両取り忠実・F2 で仕様決定。
//    okuriDeduct と deductions は分離入力なのでガード追加は payOf 内1箇所で済む）
//  - 売上バック率テーブル = モック値をデフォルト引数に（店設定化は F2 判断）

import { roundYen, roundPt1 } from "./money";

// ── 型 ────────────────────────────────────────────────────────

export type Slide = { at: number; wage: number };

export type CompPlan = {
  id: string;
  name: string;
  base: number; // 保証時給
  honBack: number; // 円/本
  jonaiBack: number;
  dohanBack: number;
  salesSlide: Slide[]; // 日次売上→時給（3段・昇順・最後にマッチした段が有効）
  pointSlide: Slide[]; // 日次pt→時給
};

export type PlanOverride = Partial<
  Pick<CompPlan, "base" | "honBack" | "jonaiBack" | "dohanBack">
>;

export type DailyRecord = { d: number; hours: number; sales: number };

export type WageBasis = "売上" | "ポイント" | "保証";

export type WageDay = {
  d: number;
  sales: number;
  pts: number;
  hours: number;
  hourly: number;
  basis: WageBasis;
};

export type WageDetail = {
  wage: number; // 加重平均時給
  timePay: number; // roundYen(Σ 日時給×hours)
  wHours: number; // roundPt1(Σ hours)
  wbasis: Partial<Record<WageBasis, number>>; // 採用日数の内訳
  wdays: WageDay[]; // 日次内訳（明細表示用）
};

export type MetricKey =
  | "hon"
  | "jonai"
  | "dohan"
  | "days"
  | "sales"
  | "pt"
  | "champCnt"
  | "bottleCnt";

export type Metrics = Record<MetricKey, number>;

export type BackDef = {
  id: string;
  name: string;
  basis: MetricKey | "flat";
  value: number;
  cond?: { metric: MetricKey; min: number };
};

export type CBack = {
  id: string;
  name: string;
  basis: BackDef["basis"];
  amount: number;
  met: boolean;
  cond: { metric: MetricKey; min: number } | null;
};

export type Deduction = {
  id: string;
  name: string;
  amount: number;
  per: "day" | "month" | "rate"; // rate は売上に対する %
};

export type PenaltyConfig = {
  fineAbsent: number; // 当欠罰金/回
  fineLate: number; // 遅刻罰金/回
  hoursPerShift: number; // シミュレーター用 1シフト時間
};

export type NormPenaltyConfig = {
  on: boolean;
  daysFlat: number;
  daysPer: number;
  dohanFlat: number;
  dohanPer: number;
};

export type TaxMode = "委託" | "雇用";

export type SalesBackStep = { at: number; rate: number };

// モックの uS（ハードコード率）をデフォルトに（店設定化は F2 判断）
export const DEFAULT_SALES_BACK_TABLE: SalesBackStep[] = [
  { at: 1_500_000, rate: 0.1 },
  { at: 800_000, rate: 0.07 },
  { at: 400_000, rate: 0.05 },
  { at: 0, rate: 0.03 },
];

export type NomType = "hon" | "jonai" | "dohan" | "free";

export type Product = {
  id: string;
  name: string;
  price: number;
  rate: number; // rate モード時の %
  backMode: "rate" | "unit4";
  unit4: Record<NomType, number>;
  honPt?: number; // 本指名時の商品pt
  type: "drink" | "champ" | "bottle";
};

export type PayInput = {
  cast: { hon: number; jonai: number; dohan: number; days: number; sales: number };
  daily: DailyRecord[]; // 日次（本番は実 punch＋実売上）
  plan: CompPlan;
  override?: PlanOverride; // cast_plan.overrides_json
  productBack: { drink: number; champ: number; bottle: number }; // 会計から集計済み
  pointProducts: number; // 本指名商品pt（モック Ci 相当）
  customBackDefs: BackDef[]; // バック種別マスタ
  metrics?: Partial<Metrics>; // champCnt/bottleCnt 等の補助集計（未指定キーは cast/pointProducts から補完）
  deductions: Deduction[]; // 控除マスタ
  penalty: PenaltyConfig;
  normConfig: NormPenaltyConfig;
  norm: { days: number; dohan: number }; // キャスト×期間ノルマ
  fine: { absentN: number; lateN: number }; // 打刻照合の結果（回数）
  arDeduct: number; // 売掛天引き（集計済み）
  advanceDeduct: number; // 前借り天引き
  okuriDeduct: number; // 送り実費天引き
  taxMode: TaxMode; // cast_tax_profiles.mode
  salesBackTable?: SalesBackStep[];
  sim?: { days?: number; dohan?: number }; // シミュレーター上書き（days は timePay を変えない）
};

export type PayResult = {
  plan: CompPlan;
  eplan: CompPlan;
  hasOv: boolean;
  wage: number;
  timePay: number;
  wHours: number;
  wbasis: Partial<Record<WageBasis, number>>;
  wdays: WageDay[];
  honBack: number;
  jonaiBack: number;
  dohanBack: number;
  drinkBack: number;
  champBack: number;
  bottleBack: number;
  sRate: number;
  salesBack: number;
  cbacks: CBack[];
  customTotal: number;
  gross: number;
  fixedDed: number;
  fine: number;
  withholding: number;
  arDeduct: number;
  advanceDeduct: number;
  okuriDeduct: number;
  normPenalty: number;
  net: number;
  lateN: number;
  absentN: number;
};

// ── 部品関数 ──────────────────────────────────────────────────

/** 階段関数（モック fp）: at 以上で段の wage・最後にマッチした段が有効・無マッチは 0 */
export function slideAt(slides: Slide[] | undefined, value: number): number {
  let w = 0;
  for (const s of slides ?? []) {
    if (value >= s.at) w = s.wage;
  }
  return w;
}

/** override 反映（モック te 冒頭）: base/各バック単価のみ上書き可 */
export function applyOverride(
  plan: CompPlan,
  override?: PlanOverride,
): { eplan: CompPlan; hasOv: boolean } {
  const ov = override ?? {};
  const eplan: CompPlan = {
    ...plan,
    base: ov.base ?? plan.base,
    honBack: ov.honBack ?? plan.honBack,
    jonaiBack: ov.jonaiBack ?? plan.jonaiBack,
    dohanBack: ov.dohanBack ?? plan.dohanBack,
  };
  return { eplan, hasOv: Object.keys(ov).length > 0 };
}

/**
 * スライド時給の加重平均（モック Py・精密仕様 §0.1）。
 * 月の総pt を日次売上比で按分し、各日で max(売上スライド, ポイントスライド, 保証) を採用、
 * 労働時間で加重平均する。日次データが空なら wage=base・timePay=0。
 */
export function wageDetail(
  daily: DailyRecord[],
  eplan: CompPlan,
  pts: number,
  fallbackSales: number,
): WageDetail {
  const totalSales =
    daily.reduce((sum, r) => sum + r.sales, 0) || fallbackSales || 1;
  let weighted = 0; // Σ 日時給×hours
  let hours = 0; // Σ hours
  const wdays: WageDay[] = [];
  const wbasis: Partial<Record<WageBasis, number>> = {};
  for (const r of daily) {
    const dayPts = roundPt1(pts * (r.sales / totalSales));
    const bySales = slideAt(eplan.salesSlide, r.sales);
    const byPts = slideAt(eplan.pointSlide, dayPts);
    const base = eplan.base || 0;
    const hourly = Math.max(bySales, byPts, base);
    // 同値時の優先: 売上 > ポイント > 保証（モックの判定式そのまま）
    const basis: WageBasis =
      hourly === bySales && bySales >= byPts && bySales >= base
        ? "売上"
        : hourly === byPts && byPts >= base
          ? "ポイント"
          : "保証";
    weighted += hourly * r.hours;
    hours += r.hours;
    wbasis[basis] = (wbasis[basis] || 0) + 1;
    wdays.push({ d: r.d, sales: r.sales, pts: dayPts, hours: r.hours, hourly, basis });
  }
  return {
    wage: hours > 0 ? roundYen(weighted / hours) : eplan.base || 0,
    timePay: roundYen(weighted),
    wHours: roundPt1(hours),
    wbasis,
    wdays,
  };
}

/** 商品バック単価×数量（モック vS の単品版・F1b 会計確定時の配分にも使う） */
export function productBackOf(p: Product, nom: NomType, qty: number): number {
  if (p.backMode === "rate") return roundYen((p.price * p.rate) / 100) * qty;
  return (p.unit4[nom] ?? 0) * qty;
}

/**
 * 数量の最大剰余法分配（精密仕様 §2.2.1・会計時のキャスト別バック分配の正本）。
 * 床 = floor(qty×w_i/Σw)。残数は整数剰余 (qty×w_i) mod Σw の降順・同値は先頭（position 昇順）へ配布。
 * 浮動小数を使わない＝DB 側（check_close）と決定的に同一結果。Σ返り値 = qty が恒等的に成立。
 */
export function allocateQty(qty: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sumW = weights.reduce((a, b) => a + b, 0);
  const alloc = weights.map((w) => Math.floor((qty * w) / sumW));
  const rem = weights.map((w) => (qty * w) % sumW);
  let rest = qty - alloc.reduce((a, b) => a + b, 0);
  const used = new Array<boolean>(n).fill(false);
  while (rest > 0) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (!used[i] && (best === -1 || rem[i] > rem[best])) best = i;
    }
    used[best] = true;
    alloc[best] += 1;
    rest--;
  }
  return alloc;
}

/** 売上バック率（モック uS）: 降順テーブルの最初のマッチ */
export function salesRateOf(
  sales: number,
  table: SalesBackStep[] = DEFAULT_SALES_BACK_TABLE,
): number {
  for (const step of table) {
    if (sales >= step.at) return step.rate;
  }
  return 0;
}

/** 自由設計バック（モック Vy）: cond 未達は amount=0（met=false） */
export function customBacks(defs: BackDef[], metrics: Metrics): CBack[] {
  return defs.map((d) => {
    const met = !d.cond || metrics[d.cond.metric] >= d.cond.min;
    const amount =
      d.basis === "sales"
        ? roundYen((metrics.sales * d.value) / 100)
        : d.basis === "flat"
          ? d.value
          : metrics[d.basis] * d.value;
    return {
      id: d.id,
      name: d.name,
      basis: d.basis,
      amount: met ? amount : 0,
      met,
      cond: d.cond ?? null,
    };
  });
}

/** 控除マスタの合算（モック te 内 qa）: per=day→×日数 / rate→売上% / month→定額 */
export function fixedDedOf(
  deductions: Deduction[],
  days: number,
  sales: number,
): number {
  return deductions.reduce(
    (sum, d) =>
      sum +
      (d.per === "day"
        ? d.amount * days
        : d.per === "rate"
          ? roundYen(((sales || 0) * d.amount) / 100)
          : d.amount),
    0,
  );
}

/** 源泉（精密仕様 §0.3）: 委託のみ・days は出勤日数（暦日数か否かは税理士確認＝F2） */
export function withholdingOf(
  gross: number,
  days: number,
  taxMode: TaxMode,
): number {
  return taxMode === "委託"
    ? Math.max(0, roundYen((gross - 5000 * days) * 0.1021))
    : 0;
}

/** ノルマ未達ペナルティ（精密仕様 §3）: on 時のみ・達成で 0 */
export function normPenaltyOf(
  cfg: NormPenaltyConfig,
  norm: { days: number; dohan: number },
  days: number,
  dohan: number,
): number {
  if (!cfg.on) return 0;
  let p = 0;
  if (norm.days > 0 && days < norm.days) {
    p += cfg.daysFlat + (norm.days - days) * cfg.daysPer;
  }
  if (norm.dohan > 0 && dohan < norm.dohan) {
    p += cfg.dohanFlat + (norm.dohan - dohan) * cfg.dohanPer;
  }
  return p;
}

/**
 * シミュレーターの追加出勤加算（精密仕様 §0.2）。
 * 係数はハードコード 0.8979 ではなく 1−源泉率（委託）/ 1.0（雇用）として実装。
 */
export function simAddedPay(
  wage: number,
  hoursPerShift: number,
  simDays: number,
  taxMode: TaxMode,
): number {
  const coef = taxMode === "委託" ? 1 - 0.1021 : 1.0;
  return simDays * roundYen(wage * hoursPerShift * coef);
}

// ── assembler（モック te の翻訳） ─────────────────────────────

export function payOf(input: PayInput): PayResult {
  const { cast } = input;
  // sim 上書き: days/dohan のみ（days 上書きは timePay を変えない＝Py は実 daily で計算）
  const effDays = input.sim?.days ?? cast.days;
  const effDohan = input.sim?.dohan ?? cast.dohan;

  const { eplan, hasOv } = applyOverride(input.plan, input.override);

  const wd = wageDetail(input.daily, eplan, castPts(cast, input.pointProducts), cast.sales);

  // 指名バック（hon/jonai は実績・dohan は sim 上書き可＝モック te と同一）
  const honBack = cast.hon * eplan.honBack;
  const jonaiBack = cast.jonai * eplan.jonaiBack;
  const dohanBack = effDohan * eplan.dohanBack;

  // 商品バック（会計確定時に配分・集計済みの値を読む）
  const drinkBack = input.productBack.drink || 0;
  const champBack = input.productBack.champ || 0;
  const bottleBack = input.productBack.bottle || 0;

  // 売上バック
  const sRate = salesRateOf(cast.sales, input.salesBackTable);
  const salesBack = roundYen(cast.sales * sRate);

  // 自由設計バック（metrics は cast 実績＋pointProducts で補完・sim 上書きは反映しない＝モック Vy(u) と同一）
  const metrics: Metrics = {
    hon: cast.hon,
    jonai: cast.jonai,
    dohan: cast.dohan,
    days: cast.days,
    sales: cast.sales,
    pt: input.pointProducts,
    champCnt: input.metrics?.champCnt ?? 0,
    bottleCnt: input.metrics?.bottleCnt ?? 0,
    ...stripUndefined(input.metrics),
  };
  const cbacks = customBacks(input.customBackDefs, metrics);
  const customTotal = cbacks.reduce((sum, c) => sum + c.amount, 0);

  // 総支給
  const gross =
    wd.timePay +
    honBack +
    jonaiBack +
    dohanBack +
    drinkBack +
    champBack +
    bottleBack +
    salesBack +
    customTotal;

  // 控除
  const fixedDed = fixedDedOf(input.deductions, effDays, cast.sales);
  const fine =
    input.fine.absentN * input.penalty.fineAbsent +
    input.fine.lateN * input.penalty.fineLate;
  const withholding = withholdingOf(gross, effDays, input.taxMode);
  const normPenalty = normPenaltyOf(input.normConfig, input.norm, effDays, effDohan);

  const net =
    gross -
    fixedDed -
    fine -
    withholding -
    input.arDeduct -
    input.advanceDeduct -
    input.okuriDeduct -
    normPenalty;

  return {
    plan: input.plan,
    eplan,
    hasOv,
    wage: wd.wage,
    timePay: wd.timePay,
    wHours: wd.wHours,
    wbasis: wd.wbasis,
    wdays: wd.wdays,
    honBack,
    jonaiBack,
    dohanBack,
    drinkBack,
    champBack,
    bottleBack,
    sRate,
    salesBack,
    cbacks,
    customTotal,
    gross,
    fixedDed,
    fine,
    withholding,
    arDeduct: input.arDeduct,
    advanceDeduct: input.advanceDeduct,
    okuriDeduct: input.okuriDeduct,
    normPenalty,
    net,
    lateN: input.fine.lateN,
    absentN: input.fine.absentN,
  };
}

/** 月の総pt（精密仕様 §0.1）: 本指名3・同伴2・場内1 ＋ 本指名商品pt */
export function castPts(
  cast: { hon: number; jonai: number; dohan: number },
  pointProducts: number,
): number {
  return cast.hon * 3 + cast.jonai * 1 + cast.dohan * 2 + pointProducts;
}

function stripUndefined<T extends object>(obj?: T): Partial<T> {
  if (!obj) return {};
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
