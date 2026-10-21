// ★裁定311-②／④（2026-09-28・便 Y-4）: 日報「現金支払（送り・日払い等）」の client 集計プレフィルと内訳 4 行。
//   純関数＝DB を知らない。読取（transport／advances／daily_pays／payment_records の直読・既存 RLS）と表示は report-board。
//   合計＝既定値。手入力で変えたら「集計 ¥n と差 ¥m」の注記。保存は現行どおり daily_report_close の p_cash_payout（入力値）。
export type CashPayoutParts = {
  /** 送り立替（transport・当日 biz_date・mode='actual' の記録分・cancelled 除外）＝★裁定414: 定額（flat）は現金が動かない・店負担（store）は諸経費へ */
  okuri: number;
  /** 前借り（advances.advanced_on＝当日・cancelled 除外） */
  advance: number;
  /** 日払い（daily_pays.net＝渡した額・当日 biz_date） */
  daily: number;
  /** 給与支払（payment_records.method='cash'・paid_at＝当日） */
  salary: number;
};
export const CASH_PAYOUT_LABELS: Record<keyof CashPayoutParts, string> = {
  okuri: "送り立替", advance: "前借り", daily: "日払い", salary: "給与支払（現金）", // ★裁定414（S-4）: 現金支払の行名＝「送り立替」（mode='actual' の当日分だけ）
};
export const cashPayoutTotalOf = (p: CashPayoutParts): number => p.okuri + p.advance + p.daily + p.salary;
export const cashPayoutRowsOf = (p: CashPayoutParts): { key: keyof CashPayoutParts; label: string; amount: number }[] =>
  (["okuri", "advance", "daily", "salary"] as const).map((key) => ({ key, label: CASH_PAYOUT_LABELS[key], amount: p[key] }));

const yen = (n: number) => `¥${Math.abs(n).toLocaleString()}`;
/** ★便 X13-G W-24 ①: 現金支払＝内訳の合計＋その他の現金支払（手入力はその他だけ） */
export const cashPayoutWithOtherOf = (p: CashPayoutParts, other: number): number => cashPayoutTotalOf(p) + Math.max(0, Math.trunc(other || 0));
/** ★W-24 ①: その他の現金支払はメモ必須（金額 0 はメモ不要） */
export const otherPayoutMemoMissing = (other: number, memo: string): boolean => (other || 0) > 0 && memo.trim() === "";
/** ★W-24 ①: その他の現金支払を日報のメモへ残す（新しい列は作らない＝daily_reports.note の先頭に 1 行） */
export function noteWithOtherPayoutOf(note: string, other: number, memo: string): string | null {
  const o = Math.max(0, Math.trunc(other || 0));
  const head = o > 0 ? `【その他の現金支払 ${yen(o)}：${memo.trim()}】` : "";
  const body = note.replace(/^【その他の現金支払 [^】]*】\s?/, "");
  const out = head ? (body ? `${head} ${body}` : head) : body;
  return out === "" ? null : out;
}
/** ★W-24 ①: 再締めで日報のメモから「その他の現金支払」を取り出す（無ければ 0） */
export function otherPayoutFromNoteOf(note: string | null | undefined): { amount: number; memo: string; rest: string } {
  const m = /^【その他の現金支払 ¥([0-9,]+)：([^】]*)】\s?([\s\S]*)$/.exec(note ?? "");
  return m ? { amount: Number(m[1].replace(/,/g, "")), memo: m[2], rest: m[3] } : { amount: 0, memo: "", rest: note ?? "" };
}
/** ★W-24 ④: 既存の手入力（締め済みの日報の現金支払）と内訳＋その他が違えば 1 行（同じなら null）。内訳が優先 */
export function manualPayoutDiffLineOf(stored: number | null | undefined, computed: number): string | null {
  if (stored == null || stored === computed) return null;
  const d = stored - computed;
  return `手入力との差 ${d > 0 ? "+" : "−"}${yen(d)}`;
}
/** 入力値が集計と違うときだけ注記（同じなら null）。差＝入力 − 集計（符号つき）。 */
export function payoutDiffNoteOf(total: number, input: number): string | null {
  const diff = input - total;
  if (diff === 0) return null;
  return `集計 ${yen(total)} と差 ${diff > 0 ? "+" : "−"}${yen(diff)}`;
}
