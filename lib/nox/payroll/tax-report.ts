// ★裁定482・税理士の回答（2026-11-11・docs/expert/tax_nenbun_mynumber_20261111.md）: 支払調書の作成用データの純関数（DB を知らない）。
//   年分＝報酬の対象期間の締め日を「支払いが確定した日」として数える（payroll_runs.period の年）。
//   源泉徴収税額＝月末の源泉（pay.withholding）＋日次精算で引いた源泉（pay.dailyWithheld＝給与の確定で凍結・キーが無い古い行は 0）＝日払いの源泉もその報酬の対象期間の年分に入れる（回答 ⑥）。
//   提出対象＝年分の合計の支払金額が 50 万円を超える人（50 万円ちょうどは対象外・回答 ⑥）。
export const TAX_REPORT_THRESHOLD_YEN = 500_000;
export const TAX_REPORT_NOTE_BASIS = "報酬は対象期間の締め日に確定したものとして集計しています。契約が異なる場合は税理士にご確認ください";

export type SlipPay = { gross?: number; withholding?: number; dailyWithheld?: number };
export type TaxSum = { gross: number; withholding: number; dailyWithheld: number };

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** 1 人分の明細（凍結の pay）を合算＝源泉は月末＋日次精算 */
export function taxSumOf(pays: readonly SlipPay[]): TaxSum {
  return pays.reduce<TaxSum>((a, p) => ({ gross: a.gross + n(p.gross), withholding: a.withholding + n(p.withholding) + n(p.dailyWithheld), dailyWithheld: a.dailyWithheld + n(p.dailyWithheld) }), { gross: 0, withholding: 0, dailyWithheld: 0 });
}

/** 提出対象（年 50 万円超）か */
export const isTaxReportTarget = (grossYear: number): boolean => grossYear > TAX_REPORT_THRESHOLD_YEN;
