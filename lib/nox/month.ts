// ★便 X13-H H-9（2026-10-21）: 暦月 'YYYY-MM' の日付の組み立てを 1 か所に（純関数・DB を知らない）。
//   月末を 31 固定にした文字列（`${ym}-31`）は 30 日の月・2 月で不正な日付＝Postgres 22008 → 集計が黙って 0 件になる（#66・821dbbf）。
//   月末は「その月の日数」で作る。翌月 0 日（new Date(y, m, 0)）の書き方も各所でばらばらだったため本ファイルに寄せる（UTC で算出＝TZ に依らない）。
const pad2 = (n: number) => String(n).padStart(2, "0");

/** 'YYYY-MM' の日数（28〜31） */
export function daysInMonthOf(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** 'YYYY-MM' の末日 'YYYY-MM-DD' */
export const monthLastDayOf = (ym: string): string => `${ym.slice(0, 7)}-${pad2(daysInMonthOf(ym))}`;
/** 'YYYY-MM' の翌月 'YYYY-MM' */
export function monthAfterOf(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`;
}
/** 'YYYY-MM' の暦月の範囲（from＝1 日・to＝末日・next＝翌月 1 日） */
export function monthRangeOf(ym: string): { from: string; to: string; next: string } {
  const k = ym.slice(0, 7);
  return { from: `${k}-01`, to: monthLastDayOf(k), next: `${monthAfterOf(k)}-01` };
}
