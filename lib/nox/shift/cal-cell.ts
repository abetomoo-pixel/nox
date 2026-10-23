// ★便 SH-UI-c2 C2-19（2026-10-23・B2-1 を上書き）: シフト月カレンダーの日セルの表現（純関数・DB を知らない）。③④・確定シフトタブで共通。
//   ①地色＝充足状況だけ（充足＝緑／やや不足（−1）＝黄／不足（−2 以上）＝赤／未設定＝灰・暗めの地で文字が読める）
//   ②右上バッジ＝進行状況（作成中＝ティール／募集中＝青／配置中＝シアン／公開済み＝明緑／期間なし＝灰）
//   ③中央＝「確定/必要」と「あと N 名」（充足なら「充足」・未設定なら「未設定」のみ）。確認待ち（調整中）の人数は「3/4（確認待ち 1）」の小字
//   ④「手修正」「手3」「●＝確定 ◐＝確認待ち」「枠色は自動／手修正」は出さない（自動配置は無い）
//   ⑥不足日＝期間のある日だけ数える。色は CSS 変数（globals.css --cal-*／--stg-*）＝E-23 追補1 のコントラスト 3 以上。
import type { PeriodCellStage } from "./period-cell";

export type Fill = "none" | "ok" | "warn" | "ng";
export type CellStat = { assigned: number; confirmed: number; proposed: number; planned: number; required: number };

/** 充足＝必要 0 は未設定・assigned ≥ required は充足・不足 1 はやや不足・2 以上は不足（S-1 と同じ規則） */
export const fillOf = (assigned: number, required: number): Fill => (required <= 0 ? "none" : assigned >= required ? "ok" : required - assigned === 1 ? "warn" : "ng");
export const FILL_WORD: Record<Fill, string> = { none: "未設定", ok: "充足", warn: "やや不足", ng: "不足" };
export const STAGE_WORD: Record<PeriodCellStage, string> = { draft: "作成中", open: "募集中", closed: "配置中", published: "公開済み", none: "期間なし" };
/** 凡例＝進行状況 5 つ／充足状況 4 つ（カレンダー上部に 2 列・390px は 2 段） */
export const LEGEND_STAGE: ReadonlyArray<readonly [PeriodCellStage, string]> = [["draft", "作成中"], ["open", "募集中"], ["closed", "配置中"], ["published", "公開済み"], ["none", "期間なし"]];
export const LEGEND_FILL: ReadonlyArray<readonly [Fill, string]> = [["ok", "充足"], ["warn", "やや不足（−1）"], ["ng", "不足（−2 以上）"], ["none", "未設定"]];

export type CellText = { fill: Fill; center: string; sub: string | null; pending: string | null };
/** セルの文字＝中央「確定/必要」・下「あと N 名」（充足／未設定）・小字「確認待ち n」（proposed＋planned） */
export function cellTextOf(st: CellStat): CellText {
  const fill = fillOf(st.assigned, st.required);
  if (st.required <= 0) return { fill, center: "未設定", sub: null, pending: null };
  const pend = st.proposed + st.planned;
  const shortage = Math.max(0, st.required - st.assigned);
  return { fill, center: `${st.confirmed}/${st.required}`, sub: shortage > 0 ? `あと ${shortage} 名` : "充足", pending: pend > 0 ? `確認待ち ${pend}` : null };
}
/** 不足日＝期間のある日（stage ≠ none）のうち、必要人数があり配置が足りない日（今日以降） */
export function shortDaysInPeriodsOf(days: readonly string[], stageOf: (ymd: string) => PeriodCellStage, statOf: (ymd: string) => CellStat, isPast: (ymd: string) => boolean): number {
  return days.filter((ymd) => !isPast(ymd) && stageOf(ymd) !== "none").filter((ymd) => { const st = statOf(ymd); return st.required > 0 && st.assigned < st.required; }).length;
}
/** ④の見出し＝期間の実日付から（同じ月＝「2026年10月」・月をまたぐ＝「10/30〜11/5」） */
export function periodMonthLabelOf(start: string, end: string): string {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return start.slice(0, 7) === end.slice(0, 7) ? `${Number(start.slice(0, 4))}年${Number(start.slice(5, 7))}月` : `${md(start)}〜${md(end)}`;
}
/** 承認待ちの見出し＝「承認待ち 13 件（希望どおり 7・要調整 0・確認待ち 14）」・未処理 0 は「承認待ちなし」 */
export function queueHeadTextOf(n: { pending: number; asIs: number; adjust: number; waiting: number }): string {
  return n.pending === 0 ? "承認待ちなし" : `承認待ち ${n.pending} 件（希望どおり ${n.asIs}・要調整 ${n.adjust}・確認待ち ${n.waiting}）`;
}
/** 右端の合計＝「合計 27 件（未処理 13＋確認待ち 14）」 */
export const queueTotalTextOf = (pending: number, waiting: number): string => `合計 ${pending + waiting} 件（未処理 ${pending}＋確認待ち ${waiting}）`;
/** ⑤③の上段＝配置中の期間が無く、締切前の期間があるとき */
export function noPlacingTextOf(recruiting: readonly { start_date: string; end_date: string; wish_deadline: string | null }[]): string | null {
  if (recruiting.length === 0) return null;
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const p = recruiting[0];
  return `締切前の期間が ${recruiting.length} つ（${md(p.start_date)}〜${md(p.end_date)}・締切 ${p.wish_deadline ? md(p.wish_deadline) : "なし"}）。締め切ると配置に移ります`;
}
