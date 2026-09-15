// 裁定258／264: run 別調整控除（payroll_adjustments）の純関数。DB を知らない（core／UI が行を渡す）。
//  - 258-2 率の分母は gross（各バック＋customTotal＋extras＋achievement＋guarantee 床。fixedDed・fine・withholding を引く前）。
//    率行が複数でも全て同じ gross に掛け、逐次適用しない＝入力順・並べ替えで金額が動かない。
//  - 258-3 before_withholding=true は源泉の前（gross から引き源泉対象額が減る）／false は源泉の後（net 式で引く）。
//  - 格納形は rate_bp（整数ベーシスポイント 0..10000・20%=2000）。丸めは money.ts の roundYen（新定義しない）。
//  - 264-3 控除計の式は totalDeductionsOf 1 本に集約（slip／右パネル／CSV／board の各自式を置換・新キーはここにだけ足す）。
//  - 264-11 net 0 床の超過額は PayResult.adjustOverflow（pay.ts）＝恒等式 net = gross − totalDeductionsOf(pay) + adjustOverflow。

import { roundYen } from "../money";

export type AdjustmentKind = "fixed" | "rate"; // = payroll_adjustments.mode

/** payroll_adjustments 1 行（mode→kind・rate_bp→rateBp・before_withholding→beforeWithholding・show_detail→showDetail）。 */
export type AdjustmentRow = {
  castId: string;
  kind: AdjustmentKind;
  amount: number | null; // fixed: 円（整数・0 以上）。rate では null
  rateBp: number | null; // rate: bp（整数 0..10000）。fixed では null
  beforeWithholding: boolean; // true=源泉の前に gross から引く／false=源泉の後に引く
  showDetail: boolean; // 明細に理由付きで 1 行ずつ出すか（false は控除計に合算・理由を出さない＝258-5）
  reason: string;
};

/** 行に確定額（applied）を付けたもの。rate は同一 gross に対する roundYen 1 回。 */
export type AppliedAdjustment = AdjustmentRow & { applied: number };

export type AdjustResult = {
  before: number; // beforeWithholding=true の確定額合計（源泉対象額から引く）
  after: number; // beforeWithholding=false の確定額合計（源泉の後に引く）
  rows: AppliedAdjustment[]; // 入力順のまま
};

function isInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n);
}

/** 1 行の確定額。fixed=amount そのまま／rate=roundYen(gross × rate_bp ÷ 10000)（他行の適用結果は見ない＝258-2）。 */
export function adjustAmountOf(row: AdjustmentRow, gross: number): number {
  if (row.kind === "fixed") {
    if (!isInt(row.amount) || row.amount < 0) throw new Error(`bad adjustment: fixed amount ${String(row.amount)}`);
    return row.amount;
  }
  if (row.kind === "rate") {
    if (!isInt(row.rateBp) || row.rateBp < 0 || row.rateBp > 10000) throw new Error(`bad adjustment: rate_bp ${String(row.rateBp)}`);
    return roundYen((gross * row.rateBp) / 10000);
  }
  throw new Error(`bad adjustment: kind ${String((row as { kind: unknown }).kind)}`);
}

/** 調整行の確定（before 合計・after 合計・行別確定額）。全率行が同じ gross を見る（逐次適用しない）。 */
export function adjustOf(rows: AdjustmentRow[], gross: number): AdjustResult {
  let before = 0;
  let after = 0;
  const out: AppliedAdjustment[] = [];
  for (const r of rows) {
    const applied = adjustAmountOf(r, gross);
    if (r.beforeWithholding) before += applied;
    else after += applied;
    out.push({ ...r, applied });
  }
  return { before, after, rows: out };
}

/** 控除計の入力＝凍結 breakdown_json.pay／preview pay の部分集合。欠落キーは 0 円扱い（2026-07-28 既定）。 */
export type DeductionParts = {
  fixedDed?: number;
  fine?: number;
  withholding?: number;
  arDeduct?: number;
  advanceDeduct?: number;
  okuriDeduct?: number;
  normPenalty?: number;
  // 裁定264-3: 新キーはここにだけ足す（旧 payslip は欠落＝0）
  adjBefore?: number;
  adjAfter?: number;
};

/** 控除計（264-3 集約）＝ fixedDed + fine + withholding + arDeduct + advanceDeduct + okuriDeduct + normPenalty + adjBefore + adjAfter。
 *  ★率計算も丸め直しも整合補正もしない（欠落キーは 0）。恒等: net = gross − totalDeductionsOf(pay) + adjustOverflow。 */
export function totalDeductionsOf(p: DeductionParts): number {
  const z = (v: number | undefined) => v ?? 0;
  return z(p.fixedDed) + z(p.fine) + z(p.withholding) + z(p.arDeduct)
    + z(p.advanceDeduct) + z(p.okuriDeduct) + z(p.normPenalty)
    + z(p.adjBefore) + z(p.adjAfter);
}
