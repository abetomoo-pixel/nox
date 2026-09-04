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

import { roundYen, roundPt1, floorYen } from "./money";

// ── 型 ────────────────────────────────────────────────────────

export type Slide = { at: number; wage: number };

/** 指名バック方式（mig0086・率バック設計 v1）。undefined は per_count と同義＝既存 fixture 無改変。 */
export type BackMode = "per_count" | "rate";

export type CompPlan = {
  id: string;
  name: string;
  base: number; // 保証時給
  honBack: number; // 円/本（mode='rate' でも保持＝裁定v・切替往復で値が消えない）
  jonaiBack: number;
  dohanBack: number;
  salesSlide: Slide[]; // 日次売上→時給（3段・昇順・最後にマッチした段が有効）
  pointSlide: Slide[]; // 日次pt→時給
  // mig0086: 指名バック方式（hon/jonai 独立＝裁定ii・dohan は円/本据え置き＝裁定i）。
  //   optional＝未指定は per_count（既存プラン・既存テスト fixture が1バイト不変で通る）。
  honBackMode?: BackMode;
  honBackRate?: number | null; // %（0-100）。mode='rate' のとき非 null（RPC/CHECK が保証）
  jonaiBackMode?: BackMode;
  jonaiBackRate?: number | null;
  // mig0114（C1-1 読み経路段）: dohan の対称化＋行型コンポーネント。
  //   ★本段は「読めるようにする」まで＝payOf は一切参照しない（挙動段の v2 で結線）。
  //   optional＋既定 per_count/[]＝既存 fixture・golden（玲奈 5931/125802）が1バイト不変で通る。
  dohanBackMode?: BackMode;
  dohanBackRate?: number | null;
  components?: CompComponent[];
  // ★裁定113（mig0132）＋裁定123（mig0133）: 商品販売バック3方式。optional＝未指定は product_rule（既存 fixture・golden 不変）。
  //   方式判定は close 側（check_close が確定スナップへ凍結）＝**給与側は凍結値 Σ のみ**（方式判定を持ち込まない・例外なし）。
  //   3項は読取保持（UI 表示・sim 用）で payOf はどれも参照しない。
  productBackMode?: "product_rule" | "plan_rate" | "plan_fixed";
  productBackRate?: number | null;  // %（plan_rate のとき非 null）
  productBackFixed?: number | null; // 円／販売数1点あたり（plan_fixed のとき非 null・杯・品も同一計算＝close が Σ数量×固定額を凍結）
};

/** mig0114: comp_plan_components の行型（v2.0 kind 2種・読み経路段では素通しの器）。 */
export type CompComponent = {
  kind: "guarantee_min" | "achievement_bonus" | string;
  mode: "amount" | "rate" | string;
  amount: number | null;
  rate: number | null;
  params: Record<string, unknown>;
  priority: number;
  is_active?: boolean; // collect は true のみ渡す。payOf 直呼び fixture 用に false は payOf 側でも除外
};

export type PlanOverride = Partial<
  Pick<CompPlan,
    "base" | "honBack" | "jonaiBack" | "dohanBack"
    | "honBackMode" | "honBackRate" | "jonaiBackMode" | "jonaiBackRate">
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

// ★裁定98（mig0115/0117）: 控除種別の固定語彙6値。
export type DeductionKind =
  | "unworked" | "sanction" | "statutory" | "agreed_cost" | "store_receivable" | "advance_settlement";

export type Deduction = {
  id: string;
  name: string;
  amount: number;
  per: "day" | "month" | "rate"; // rate は売上に対する %
  // ★裁定98: kind 未指定は非 sanction 扱い（既存 fixture・旧呼び出しと1バイト互換）。
  kind?: DeductionKind;
  basisConfirmedAt?: string | null; // sanction の根拠確認日時（表示用・計算には使わない）
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
  cast: {
    hon: number; jonai: number; dohan: number; days: number; sales: number;
    // mig0086: 率バックの母数＝窓内 Σcheck_lines.line_total（fee_kind 別・cast_id=本人・裁定iii/vi）。
    //   per_count 経路では読まれない。未指定（既存呼び出し・fixture）は 0 扱い。
    honShimeiAmt?: number; jonaiShimeiAmt?: number;
  };
  daily: DailyRecord[]; // 日次（本番は実 punch＋実売上）
  plan: CompPlan;
  override?: PlanOverride; // cast_plan.overrides_json
  productBack: { drink: number; champ: number; bottle: number }; // 会計から集計済み
  // ★裁定113/123: plan_rate・plan_fixed の凍結値 Σcheck_cast_backs.calculated_back_amount（null=0＝旧行フォールバック）。
  //   optional＝既存呼び出し・fixture は 0 扱い。再計算しない（凍結値の単純Σ）。
  calculatedBack?: number;
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
  // ★裁定96-②（挙動段）: achievement_bonus の目標（cast_norms.sales_target）。0/未指定=不適用。
  salesTarget?: number | null;
  periodDays: number; // ★源泉の 5,000円×日数 に使う「計算期間の日数」（暦日数・両端含む）。出勤日数ではない（裁定23）
  extrasTotal: number; // ★出勤ボーナス等の加算合計（源泉対象＝gross に含める・裁定23-b ①）
  // ★裁定98: sanction 二層ガードの文脈。employment 未設定（null/undefined）で sanction 行がある cast は
  //   core が 'no_employment' blocker で先に止める＝payOf がここで null を見るのは sim 経路のみ（現行式同値で計算）。
  employment?: "委託" | "雇用" | null; // casts.employment
  avgDailyWage?: number | null; // 裁定98-C 平均賃金（直近3確定期）。null=暫定式（provisional）
  taxMode: TaxMode; // cast_tax_profiles.mode
  salesBackTable?: SalesBackStep[];
  sim?: { days?: number; dohan?: number }; // シミュレーター上書き（days は timePay を変えない）
};

// ★裁定98: sanction（制裁控除）の二層ガード結果。
//   雇用＝労基法91条（1回=平均賃金の半日分・総額=一賃金支払期の賃金総額の1/10）をシステム強制。
//   委託＝上限なし（現行式）・警告は core 側（sanction_contractor）。
export type SanctionResult = {
  original: number; // 現行式どおりの sanction 控除合計（cap 前）
  applied: number; // 実際に控除した額（雇用=cap 後／委託=original）
  capEach: number | null; // 雇用: floor(平均賃金/2)。委託・未設定は null
  capTotal: number | null; // 雇用: floor(gross/10)。委託・未設定は null
  avgDailyWage: number; // 採用した平均賃金（暫定式含む・委託は未使用=入力値または0）
  provisional: boolean; // 平均賃金が暫定式（確定期 0 本）か
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
  // ★裁定113/123: 商品販売バックの plan 方式分＝凍結値の Σ（plan_rate／plan_fixed とも・product_rule では 0＝従来と同値）
  calculatedBack: number;
  sRate: number;
  salesBack: number;
  cbacks: CBack[];
  customTotal: number;
  // ★裁定96（挙動段）: components の結線結果
  achievementBonus: number;
  guaranteeAdd: number;
  compSkipped: string[];
  gross: number;
  fixedDed: number;
  // ★裁定98: sanction 二層ガードの明細（sanction 行が無ければ null＝既存 payslips 凍結と互換）
  sanction: SanctionResult | null;
  fine: number;
  withholding: number;
  arDeduct: number;
  advanceDeduct: number;
  okuriDeduct: number;
  normPenalty: number;
  net: number;
  lateN: number;
  absentN: number;
  // ★裁定28: 税区分を PayResult に載せ、payslips.breakdown_json->'pay' へ凍結する。
  //   納付書は 委託（報酬・料金）／雇用（給与）で様式が別＝集計は凍結値のみを根拠にする
  //   （cast_tax_profiles.mode は現在値で履歴を持たず、後から過去月の集計が動くため使わない）。
  taxMode: TaxMode;
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
  // mig0086: 方式はペア原子で適用（RPC の原子性検証と同輪郭＝TS 側でも片側合成を作らない）。
  //   mode='rate' は rate が override に揃うときだけ・mode='per_count' は対の円/本値が揃うときだけ
  //   反映し、揃わない不正 override は方式上書きごと無視（plan の方式のまま＝安全側）。
  //   rate 単独（mode なし）も反映しない＝「mode だけ plan・値だけ override」の合成が生まれない。
  if (ov.honBackMode === "rate" && typeof ov.honBackRate === "number") {
    eplan.honBackMode = "rate";
    eplan.honBackRate = ov.honBackRate;
  } else if (ov.honBackMode === "per_count" && typeof ov.honBack === "number") {
    eplan.honBackMode = "per_count";
    eplan.honBackRate = null;
  }
  if (ov.jonaiBackMode === "rate" && typeof ov.jonaiBackRate === "number") {
    eplan.jonaiBackMode = "rate";
    eplan.jonaiBackRate = ov.jonaiBackRate;
  } else if (ov.jonaiBackMode === "per_count" && typeof ov.jonaiBack === "number") {
    eplan.jonaiBackMode = "per_count";
    eplan.jonaiBackRate = null;
  }
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

/** 源泉（精密仕様 §0.3・裁定23/23-b で確定）: 委託のみ。
 *  ★日数 = **計算期間の日数**（暦日数・両端含む）。営業日数でも出勤日数でもない
 *    （タックスアンサー No.2807 の例示・最判平成22年3月2日で決着）。
 *  ★丸め = **円未満切捨**（同ページ注記）＝floorYen。roundYen は使わない。
 *  ★課税ベース = 報酬総額（時給・各種バック・売上バック・出勤ボーナスの合算＝payOf の gross）。 */
export function withholdingOf(
  gross: number,
  periodDays: number,
  taxMode: TaxMode,
): number {
  return taxMode === "委託"
    ? floorYen(Math.max(0, gross - 5000 * periodDays) * 0.1021)
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
  // mig0086: mode='rate' は Σ指名料行×%（母数=check_lines・裁定iii/vi・丸めは Σ後 roundYen 1回=裁定iv）。
  //   ★per_count 側の式は従来と1バイト不変（玲奈 golden 5170/5931 の経路）。dohan は円/本のみ（裁定i）。
  const honBack = eplan.honBackMode === "rate"
    ? roundYen(((cast.honShimeiAmt ?? 0) * (eplan.honBackRate ?? 0)) / 100)
    : cast.hon * eplan.honBack;
  const jonaiBack = eplan.jonaiBackMode === "rate"
    ? roundYen(((cast.jonaiShimeiAmt ?? 0) * (eplan.jonaiBackRate ?? 0)) / 100)
    : cast.jonai * eplan.jonaiBack;
  const dohanBack = effDohan * eplan.dohanBack;

  // 商品バック（会計確定時に配分・集計済みの値を読む）
  const drinkBack = input.productBack.drink || 0;
  const champBack = input.productBack.champ || 0;
  const bottleBack = input.productBack.bottle || 0;
  // ★裁定113（設計書 v1.1 §4）＋裁定123: plan_rate／plan_fixed とも凍結値（check_cast_backs.calculated_back_amount）の
  //   単純Σ・再計算しない（plan_fixed は close が Σ按分数量×固定額を凍結＝0132 の「期間固定・payOf 側加算」は 0133 で廃止）。
  //   product_rule／未指定＝0（従来 grossBase と1バイト同値＝golden 5931/125802 の構造保証）。丸め不要（整数の Σ）。
  const calculatedBack = input.calculatedBack ?? 0;

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

  // ── ★C1/C2 挙動段（裁定96 ①②③・mig0114/0115）: 行型コンポーネントの結線 ──
  //   適用順＝バック・歩合（上の各項）→ achievement_bonus（priority 順）→ guarantee_min（最後）→ 控除。
  //   amount モードのみ結線。rate モードは v2.0 では**明示スキップ**（compSkipped に記録＝黙殺しない）。
  //   components 空＋salesTarget 未指定なら加算 0＝従来 gross と1バイト同値（golden 5931/125802 の構造保証）。
  const comps = (input.plan.components ?? [])
    .filter((c) => c.is_active !== false)
    .slice()
    .sort((x, y) => x.priority - y.priority);
  const compSkipped = comps.filter((c) => c.mode !== "amount" || c.amount === null).map((c) => `${c.kind}:${c.mode}`);
  const amountComps = comps.filter((c) => c.mode === "amount" && c.amount !== null);
  // ② achievement_bonus: 目標 = cast_norms.sales_target（0/なし=不適用）・実績 = 期間売上（cast.sales）。
  //   しきい値は params.thresholds[0].pct（UI 仮置き＝1段・省略時 100%）。加算額は amount（=UI の add と同値）。
  const salesTarget = input.salesTarget ?? 0;
  let achievementBonus = 0;
  if (salesTarget > 0) {
    for (const c of amountComps) {
      if (c.kind !== "achievement_bonus") continue;
      const th = (c.params?.thresholds as Array<{ pct?: number }> | undefined)?.[0];
      const pct = typeof th?.pct === "number" ? th.pct : 100;
      if (cast.sales >= (salesTarget * pct) / 100) achievementBonus += c.amount as number;
    }
  }

  // 総支給（★extrasTotal＝出勤ボーナス等の報奨金も役務提供の対価＝報酬総額に含める・裁定23-b ①）
  const grossBase =
    wd.timePay +
    honBack +
    jonaiBack +
    dohanBack +
    drinkBack +
    champBack +
    bottleBack +
    calculatedBack +    // ★裁定113/123 plan_rate・plan_fixed（凍結Σ一本）
    salesBack +
    customTotal +
    input.extrasTotal;

  // ③ achievement を足した総額に ① guarantee_min が**最後に床を張る**（差額補填・priority 順＝逐次適用は max と同値）
  let guaranteeAdd = 0;
  for (const c of amountComps) {
    if (c.kind !== "guarantee_min") continue;
    const cur = grossBase + achievementBonus + guaranteeAdd;
    if (cur < (c.amount as number)) guaranteeAdd += (c.amount as number) - cur;
  }
  const gross = grossBase + achievementBonus + guaranteeAdd; // ①=控除前総支給への床（控除はこの後）

  // 控除 ── ★裁定98: sanction（制裁）を他の kind から分離（二層ガード）。非 sanction は現行式と1バイト同値。
  const sanctionRows = (input.deductions ?? []).filter((d) => d.kind === "sanction");
  const otherDeds = sanctionRows.length ? input.deductions.filter((d) => d.kind !== "sanction") : input.deductions;
  const fixedDedBase = fixedDedOf(otherDeds, effDays, cast.sales);
  let sanction: SanctionResult | null = null;
  if (sanctionRows.length > 0) {
    const original = fixedDedOf(sanctionRows, effDays, cast.sales); // 現行式（cap 前）
    if (input.employment === "雇用") {
      // 労基法91条: 1回 = 平均賃金の半日分・総額 = 一賃金支払期の賃金総額（=gross）の 1/10。
      // 平均賃金 null は暫定式 = max(floor(gross/暦日数), floor(gross/出勤日数×0.6))（整数演算・effDays=0 は前者のみ）。
      const provisional = input.avgDailyWage == null;
      const principle = Math.floor(gross / input.periodDays);
      const avg = input.avgDailyWage
        ?? (effDays > 0 ? Math.max(principle, Math.floor((gross * 3) / (effDays * 5))) : principle);
      const capEach = Math.floor(avg / 2);
      const capTotal = Math.floor(gross / 10);
      let subtotal = 0;
      for (const d of sanctionRows) {
        // 1回あたりの額は現行式（rate は売上%）。回数: day=effDays / month=1 / rate=1。
        const eachRaw = d.per === "rate" ? roundYen(((cast.sales || 0) * d.amount) / 100) : d.amount;
        const count = d.per === "day" ? effDays : 1;
        subtotal += Math.min(eachRaw, capEach) * count;
      }
      const applied = Math.min(subtotal, capTotal);
      sanction = { original, applied, capEach, capTotal, avgDailyWage: avg, provisional };
    } else {
      // 委託＝上限なし（現行式そのまま）。employment 未設定は core が blocker 化済み＝ここは sim 経路のみ（同値計算）。
      sanction = { original, applied: original, capEach: null, capTotal: null,
        avgDailyWage: input.avgDailyWage ?? 0, provisional: false };
    }
  }
  const fixedDed = fixedDedBase + (sanction?.applied ?? 0);
  const fine =
    input.fine.absentN * input.penalty.fineAbsent +
    input.fine.lateN * input.penalty.fineLate;
  // ★源泉のみ periodDays（計算期間の暦日数）。fixedDedOf / normPenaltyOf は実出勤日数 effDays のまま（裁定23 #3）。
  const withholding = withholdingOf(gross, input.periodDays, input.taxMode);
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
    calculatedBack,   // ★裁定113/123 凍結Σ
    sRate,
    salesBack,
    cbacks,
    customTotal,
    achievementBonus, // ★裁定96-②
    guaranteeAdd,     // ★裁定96-①
    compSkipped,      // ★rate モード等の明示スキップ（黙殺しない）
    gross,
    fixedDed,
    sanction, // ★裁定98
    fine,
    withholding,
    arDeduct: input.arDeduct,
    advanceDeduct: input.advanceDeduct,
    okuriDeduct: input.okuriDeduct,
    normPenalty,
    net,
    lateN: input.fine.lateN,
    absentN: input.fine.absentN,
    taxMode: input.taxMode, // ★凍結（供給源は buildPayInput の input.taxMode）
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
