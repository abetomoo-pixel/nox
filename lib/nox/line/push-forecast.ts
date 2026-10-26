// ★便 ON-3（2026-10-26・0176 ★1＝401）: LINE 送信数の月末見込みと状態（BANZEN push-forecast.ts の写し・JST の暦月）。DB を知らない。
//   見込み＝ceil(送信数 ÷ 今日までの日数 × その月の日数)。状態＝送信数 ≥ 上限 'over'／JST 3 日目以降で見込み > 上限 'near'／ほか 'normal'。
import { daysInMonthOf } from "@/lib/nox/month";

export type LineStatus = "normal" | "near" | "over";
export type LineMonthRow = { store_id: string; sent: number; rejected_429: number; monthly_limit: number };

/** JST の今日（'YYYY-MM-DD'）と月初（'YYYY-MM-01'）・日数 */
export function jstMonthOf(nowMs: number): { today: string; month: string; dayOfMonth: number; daysInMonth: number } {
  const d = new Date(nowMs + 9 * 3600_000);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const daysInMonth = daysInMonthOf(`${y}-${p2(m)}`); // ★x13h(1-2): 暦月の日数は lib/nox/month に寄せる（「翌月 0 日」の組み立てを書かない）
  return { today: `${y}-${p2(m)}-${p2(day)}`, month: `${y}-${p2(m)}-01`, dayOfMonth: day, daysInMonth };
}
export function lineForecastOf(sent: number, dayOfMonth: number, daysInMonth: number): number {
  if (dayOfMonth <= 0) return sent;
  return Math.ceil((sent / dayOfMonth) * daysInMonth);
}
export function lineStatusOf(sent: number, limit: number, forecast: number, dayOfMonth: number): LineStatus {
  if (sent >= limit) return "over";
  if (dayOfMonth >= 3 && forecast > limit) return "near";
  return "normal";
}
export function lineStatusTextOf(st: LineStatus, limit: number, rejected429: number): string {
  const base = st === "over" ? `今月の上限（${limit.toLocaleString()} 通）に達しました。月末まで LINE の通知は届きません（アプリの画面では確認できます）。`
    : st === "near" ? `今のペースだと月末に上限（${limit.toLocaleString()} 通）を超えます。` : "";
  const r = rejected429 > 0 ? `LINE から上限に達したと返されました（${rejected429} 件）。` : "";
  return [base, r].filter(Boolean).join(" ");
}
export const LINE_STATUS_LABEL: Record<LineStatus, string> = { normal: "通常", near: "上限に近い", over: "上限超え" };
/** カードの 1 行＝「今月 12 通・着地見込み 40 通／200 通」 */
export function lineMonthLineOf(r: LineMonthRow, dayOfMonth: number, daysInMonth: number): string {
  const f = lineForecastOf(r.sent, dayOfMonth, daysInMonth);
  return `今月 ${r.sent.toLocaleString()} 通・着地見込み ${f.toLocaleString()} 通／${r.monthly_limit.toLocaleString()} 通`;
}
