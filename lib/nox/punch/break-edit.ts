// ★0214（起票158 の 2・相談役 11/25 の D5）: 店の休憩の直し（break_set の行）を作る純関数（DB を知らない）。本人の修正の申請は作らない（店だけ）。
//   行は 0〜47 時の 'HH:MM'（翌は 24 時以上）。終わりは始まりより後・重ならない・10 行まで。勤務の外はサーバーが 'outside work' で断る。
import { isoOfBizHm } from "../payroll/attendance-sheet";

export type BreakEditRow = { start: string; end: string };
const hmOk = (s: string) => /^([0-3]?\d|4[0-7]):[0-5]\d$/.test(s.trim());
const m = (s: string) => { const [h, mm] = s.trim().split(":").map(Number); return h * 60 + mm; };

/** 画面の止め（null＝通る） */
export function breakEditErrOf(rows: readonly BreakEditRow[], reason: string): string | null {
  if (rows.length > 10) return "休憩は 10 回まで入れられます";
  for (const r of rows) {
    if (!hmOk(r.start) || !hmOk(r.end)) return "休憩の時刻を 20:30 の形で入れてください（翌は 25:30 のように 24 時より後）";
    if (m(r.end) <= m(r.start)) return "休憩の終わりは始まりより後にしてください";
  }
  const s = [...rows].sort((a, b) => m(a.start) - m(b.start));
  for (let i = 1; i < s.length; i++) if (m(s[i].start) < m(s[i - 1].end)) return "休憩の時間が重なっています";
  if (!reason.trim()) return "直す理由を入れてください";
  return null;
}
/** break_set の p_rows（ISO・JST） */
export const breakSetRowsOf = (bizDate: string, rows: readonly BreakEditRow[]): { started_at: string; ended_at: string }[] =>
  rows.map((r) => ({ started_at: isoOfBizHm(bizDate, r.start.trim()) as string, ended_at: isoOfBizHm(bizDate, r.end.trim()) as string }));
/** 初期値（勤怠の表の行の休憩・終了なしは空） */
export const breakEditRowsOf = (spans: readonly [string, string | null][] | undefined): BreakEditRow[] => (spans ?? []).map(([s, e]) => ({ start: s, end: e ?? "" }));
