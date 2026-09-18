// ★便 T（2026-09-18）: シフトの計画期間（shift_periods）の「次の期間の既定日付」と「期間の重なり判定」＝純関数（DB を知らない）。
//   DB 側の重なりは shift_periods_no_overlap（EXCLUDE gist store_id, daterange(start,end,'[]') &&）＝両端含む閉区間。
//   ここはその判定を client で先回りするだけ（真実は DB・raise 'overlap'）。日付は 'YYYY-MM-DD' の文字列で受け渡す（<input type="date"> と同形）。
export type PeriodRange = { start_date: string; end_date: string };

const DAY = 86_400_000;
const toUtc = (ymd: string): number => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
};
export const ymdOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const addDays = (ymd: string, n: number): string => ymdOf(toUtc(ymd) + n * DAY);
/** 両端含む日数（'2026-09-15'〜'2026-09-30'＝16） */
export const spanDays = (r: PeriodRange): number => Math.round((toUtc(r.end_date) - toUtc(r.start_date)) / DAY) + 1;

/** 閉区間同士の重なり（DB の daterange '[]' && と同じ）。start>end の不正区間は重ならない扱い（DB は 'bad range' で先に落ちる） */
export function periodsOverlap(a: PeriodRange, b: PeriodRange): boolean {
  if (a.start_date > a.end_date || b.start_date > b.end_date) return false;
  return a.start_date <= b.end_date && b.start_date <= a.end_date;
}

/** 既存期間のうち [start,end] と重なるものを返す（表示用＝「既存の期間(M/D〜M/D)と重なっています」の材料） */
export function overlappingPeriods<T extends PeriodRange>(existing: readonly T[], start: string, end: string): T[] {
  if (!start || !end) return [];
  return existing.filter((p) => periodsOverlap(p, { start_date: start, end_date: end }));
}

/** M/D 表記（'2026-09-05' → '9/5'） */
export const mdOf = (ymd: string): string => { const [, m, d] = ymd.split("-"); return `${Number(m)}/${Number(d)}`; };

/**
 * 新規フォームの既定値（T-1）: 開始＝既存期間の最終日の翌日・終了＝開始＋既存の期間長（既存なし＝半月 15 日）・希望締切＝開始の前日。
 * 既存が無いときの開始は today の翌日（today は 'YYYY-MM-DD'・営業日は呼び出し側が渡す）。
 */
export function nextPeriodDefaults(existing: readonly PeriodRange[], today: string): { start: string; end: string; deadline: string } {
  const last = existing.length ? existing.reduce((a, p) => (p.end_date > a.end_date ? p : a)) : null;
  const start = last ? addDays(last.end_date, 1) : addDays(today, 1);
  const len = last ? spanDays(last) : 15;
  const end = addDays(start, len - 1);
  const deadline = addDays(start, -1);
  return { start, end, deadline };
}
