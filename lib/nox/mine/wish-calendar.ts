// ★便 AX（裁定290・2026-09-24）: キャスト側 希望シフトのカレンダー化＝純関数（DB を知らない）。
//   活性日＝募集中（open）の期間に含まれる日（lib/nox/shift/open-periods.isDateSelectable）で、定休日でも提出済み（pending／accepted）でもない日。
//   時間＝一括既定（店の営業時間は cast から読めない＝RLS パターン2・未設定なら 20:00〜26:00）＋日別の上書き。提出＝選択日を昇順に逐次 shift_wish_submit（非原子）。
import { isDateSelectable, type OpenPeriod } from "../shift/open-periods";

export const DEFAULT_START = "20:00";
export const DEFAULT_END = "26:00";
export type WishStatus = "pending" | "accepted" | "rejected" | "withdrawn";
export type WishLike = { id: string; date: string; start_hm: string; end_hm: string; status: string };
export type Times = { start: string; end: string };
/** 選択＝日付→日別上書き（null＝一括既定を使う） */
export type Selection = Record<string, Times | null>;

/** 'YYYY-MM' の月グリッド（先頭は日曜・空きは null） */
export function monthCellsOf(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: first.getUTCDay() }, () => null);
  for (let d = 1; d <= n; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  return cells;
}
export function monthAfterOf(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 最初に開く月＝募集中の期間のうち today 以降に終わる最初の期間の開始月・無ければ today の月 */
export function initialMonthOf(periods: readonly OpenPeriod[] | null, today: string): string {
  const p = [...(periods ?? [])].filter((x) => x.end_date >= today).sort((a, b) => (a.start_date < b.start_date ? -1 : 1))[0];
  return (p ? (p.start_date > today ? p.start_date : today) : today).slice(0, 7);
}

/** 生きている希望（1 日 1 枠＝DB の部分 unique と同じ範囲） */
export const isLiveWish = (status: string): boolean => status === "pending" || status === "accepted";

/** 提出済みの印: 審査中／承認／却下（取下げは印なし） */
export function wishMarkOf(status: string | null | undefined): string | null {
  if (status === "pending") return "審査中";
  if (status === "accepted") return "承認";
  if (status === "rejected") return "却下";
  return null;
}

/** 活性日: 募集中の期間内 ∧ 定休日でない ∧ 生きている希望が無い ∧ today 以降（過去日は提出できない） */
export function activeDaysOf(input: { periods: readonly OpenPeriod[] | null; cells: readonly (string | null)[]; wishes: readonly WishLike[]; closedDates: ReadonlySet<string>; today: string }): Set<string> {
  const out = new Set<string>();
  if (!input.periods) return out;
  const live = new Set(input.wishes.filter((w) => isLiveWish(w.status)).map((w) => w.date));
  for (const ymd of input.cells) {
    if (!ymd || ymd < input.today) continue;
    if (!isDateSelectable(input.periods, ymd)) continue;
    if (input.closedDates.has(ymd) || live.has(ymd)) continue;
    out.add(ymd);
  }
  return out;
}

/** タップ＝選択／解除（上書きは解除で捨てる） */
export function toggleDay(sel: Selection, ymd: string): Selection {
  const next: Selection = { ...sel };
  if (ymd in next) delete next[ymd]; else next[ymd] = null;
  return next;
}

/** 日別の上書きを置く（null＝一括に戻す） */
export function setOverride(sel: Selection, ymd: string, times: Times | null): Selection {
  if (!(ymd in sel)) return sel;
  return { ...sel, [ymd]: times };
}

/** 提出する行＝選択日を昇順に・時間は日別上書き > 一括既定 */
export function composeSubmissions(sel: Selection, defaults: Times): { date: string; start_hm: string; end_hm: string }[] {
  return Object.keys(sel).sort().map((date) => {
    const o = sel[date];
    return { date, start_hm: o?.start || defaults.start, end_hm: o?.end || defaults.end };
  });
}

/** 時刻の形式（RPC の 'bad time' と同じ射程＝開始 00:00〜23:59・終了 00:00〜47:59） */
export const HM_START = /^([01]\d|2[0-3]):[0-5]\d$/;
export const HM_END = /^([0-3]\d|4[0-7]):[0-5]\d$/;
export const timesValid = (t: Times): boolean => HM_START.test(t.start) && HM_END.test(t.end);

export type SubmitResult = { date: string; ok: true } | { date: string; ok: false; err: string };
/** 集計「n/m 件を提出しました」・失敗日 */
export function summarizeResults(results: readonly SubmitResult[]): { ok: number; total: number; failed: { date: string; err: string }[]; text: string; kind: "success" | "warn" | "error" } {
  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r): r is { date: string; ok: false; err: string } => !r.ok).map((r) => ({ date: r.date, err: r.err }));
  const total = results.length;
  const text = failed.length === 0 ? `${ok}/${total} 件を提出しました` : `${ok}/${total} 件を提出しました（${failed.length} 件は提出できませんでした・赤い日を確認して再提出できます）`;
  return { ok, total, failed, text, kind: failed.length === 0 ? "success" : ok > 0 ? "warn" : "error" };
}

/** 提出後の選択＝成功日を外し失敗日を残す */
export function selectionAfterSubmit(sel: Selection, results: readonly SubmitResult[]): Selection {
  const next: Selection = { ...sel };
  for (const r of results) if (r.ok) delete next[r.date];
  return next;
}
