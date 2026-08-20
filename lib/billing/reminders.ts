// BT レーン（銀行振込・send_invoice）リマインドの残日数/閾値ロジック（純関数・Stripe SDK 非依存＝テスト可能）。
//  billing-reminders cron（BT-4）から抽出。日次実行 × 残日数が閾値に一致した日だけ送る＝1 org 1閾値で
//  1日1通に自然収束（送信履歴テーブル不要）。JST 暦日ベース（時刻を切り捨て「あと何日」の直感と一致）。
//  ★donor lib/billing/reminders.ts と逐語同値（純関数＝NOX 適応差分なし・設計書 §1「移植」）。

// 送信する残日数の閾値（発行〜期日 days_until_due:14 前提）。0=当日・負値=期日超過（対象外＝停止は述語に委ねる）。
export const REMINDER_DAYS = [14, 7, 3, 2, 1, 0];

// JST 暦日 "YYYY-MM-DD"
const jstYmd = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// 支払期日までの残日数（JST 暦日ベース）。負値＝期日超過。
export function daysUntilDueJst(dueEpochSec: number, now: Date): number {
  const due = Date.parse(`${jstYmd(new Date(dueEpochSec * 1000))}T00:00:00Z`);
  const today = Date.parse(`${jstYmd(now)}T00:00:00Z`);
  return Math.round((due - today) / 86400000);
}

// 送信対象の閾値（一致すればその残日数・非該当は null）。route の `REMINDER_DAYS.includes(days)` と同値。
export function reminderDayFor(dueEpochSec: number, now: Date): number | null {
  const days = daysUntilDueJst(dueEpochSec, now);
  return REMINDER_DAYS.includes(days) ? days : null;
}
