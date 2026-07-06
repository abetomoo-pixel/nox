// PayInput 組み立て（純関数・DB を知らない＝verify で直接叩ける）。
// collect.ts が読んだ cast 1人分の raw ＋ 店共通マスタ → payOf の入力 object を作る。
// 天引き3種（arDeduct/advanceDeduct/okuriDeduct）は F2c では 0（供給元の消し込みは F2e で結線）。
// net = pay.net + Σ extras.amount（B: サーバが net の責務・F2c は extras 空＝net===pay.net）。

import type {
  PayInput,
  PayResult,
  CompPlan,
  PlanOverride,
  Deduction,
  PenaltyConfig,
  NormPenaltyConfig,
  BackDef,
  TaxMode,
} from "../pay";

// breakdown_json の器: { pay: PayResult, extras: Extra[] }。extras は F2c では常に空。
export type Extra = { kind: string; amount: number; label?: string };

// cast 1人分の集計済み raw（collect.ts が組む）。taxMode は core が解決して別引数で渡す。
export type CastRaw = {
  castId: string;
  castName: string;
  sales: number;
  hon: number;
  jonai: number;
  dohan: number;
  daily: { bizDate: string; sales: number; hours: number }[];
  productBack: { drink: number; champ: number; bottle: number };
  pointProducts: number;
  champCnt: number;
  bottleCnt: number;
  days: number; // punch-match final ∈ {ok,late} の営業日数
  lateN: number;
  absentN: number;
  anomalyCount: number; // out 欠損等 S8 anomaly のある日数（表示のみ・論点3）
  plan: CompPlan | null; // cast_plan 未設定なら null（core が blocker 化）
  override?: PlanOverride;
  norm: { days: number; dohan: number };
  taxProfileMode: TaxMode | null; // cast_tax_profiles 未登録なら null（core が gate）
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

export function buildPayInput(raw: CastRaw, taxMode: TaxMode, masters: StoreMasters): PayInput {
  if (!raw.plan) throw new Error(`buildPayInput: plan 未設定（cast ${raw.castId}）`);
  return {
    cast: { hon: raw.hon, jonai: raw.jonai, dohan: raw.dohan, days: raw.days, sales: raw.sales },
    daily: raw.daily.map((d) => ({ d: dayNum(d.bizDate), hours: d.hours, sales: d.sales })),
    plan: raw.plan,
    override: raw.override,
    productBack: raw.productBack,
    pointProducts: raw.pointProducts,
    customBackDefs: masters.customBackDefs,
    metrics: { champCnt: raw.champCnt, bottleCnt: raw.bottleCnt }, // 論点1: check_lines kind から集計
    deductions: masters.deductions,
    penalty: masters.penalty,
    normConfig: masters.normConfig,
    norm: raw.norm,
    fine: { absentN: raw.absentN, lateN: raw.lateN },
    arDeduct: 0, // F2e で結線
    advanceDeduct: 0,
    okuriDeduct: 0,
    taxMode,
  };
}

// net 恒等（B）: サーバが net = pay.net + Σ extras.amount を算出。F2c は extras=[] ⇒ net===pay.net。
export function computeNet(pay: PayResult, extras: Extra[]): number {
  return pay.net + extras.reduce((s, e) => s + e.amount, 0);
}
