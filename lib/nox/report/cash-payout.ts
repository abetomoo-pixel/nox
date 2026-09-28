// ★裁定311-②／④（2026-09-28・便 Y-4）: 日報「現金支払（送り・日払い等）」の client 集計プレフィルと内訳 4 行。
//   純関数＝DB を知らない。読取（transport／advances／daily_pays／payment_records の直読・既存 RLS）と表示は report-board。
//   合計＝既定値。手入力で変えたら「集計 ¥n と差 ¥m」の注記。保存は現行どおり daily_report_close の p_cash_payout（入力値）。
export type CashPayoutParts = {
  /** 送り実費（transport・当日 biz_date・actual 店の発行分・cancelled 除外） */
  okuri: number;
  /** 前借り（advances.advanced_on＝当日・cancelled 除外） */
  advance: number;
  /** 日払い（daily_pays.net＝渡した額・当日 biz_date） */
  daily: number;
  /** 給与支払（payment_records.method='cash'・paid_at＝当日） */
  salary: number;
};
export const CASH_PAYOUT_LABELS: Record<keyof CashPayoutParts, string> = {
  okuri: "送り実費", advance: "前借り", daily: "日払い", salary: "給与支払（現金）",
};
export const cashPayoutTotalOf = (p: CashPayoutParts): number => p.okuri + p.advance + p.daily + p.salary;
export const cashPayoutRowsOf = (p: CashPayoutParts): { key: keyof CashPayoutParts; label: string; amount: number }[] =>
  (["okuri", "advance", "daily", "salary"] as const).map((key) => ({ key, label: CASH_PAYOUT_LABELS[key], amount: p[key] }));

const yen = (n: number) => `¥${Math.abs(n).toLocaleString()}`;
/** 入力値が集計と違うときだけ注記（同じなら null）。差＝入力 − 集計（符号つき）。 */
export function payoutDiffNoteOf(total: number, input: number): string | null {
  const diff = input - total;
  if (diff === 0) return null;
  return `集計 ${yen(total)} と差 ${diff > 0 ? "+" : "−"}${yen(diff)}`;
}
