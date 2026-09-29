// ★裁定301（2026-09-25）: picker の折りたたみ型の純関数（DOM を知らない）。components/nox/picker.tsx が使う。
//   301-1: 候補が PICKER_COLLAPSE_AT（9）件以上なら既定で折りたたむ＝選択中の 1 行＋検索欄。開いたリストは最大 PICKER_OPEN_MAX（8）行＋「他 n 名・絞り込んでください」。
//   301-3: 閾値は定数（prop 追加なし）。8 件以下は従来どおり全展開（limit 30・先頭 n 件の注記）。
// ★便 X-11-8（2026-09-29）: 検索候補の共通化＝部分一致・全件（10 件＋「さらに表示」で +10）・キーボード ↑↓ で選択。
//   開いたリストの上限を 8 → 10 に・「他 n 名・絞り込んでください」（絞り込まないと届かない）を「さらに表示（残り n 件）」（押せば出る）に置き換え。
export const PICKER_COLLAPSE_AT = 9;
export const PICKER_OPEN_MAX = 10;
export const PICKER_PAGE = 10;

/** 折りたたみ型にするか＝候補（全件・絞り込み前）が閾値以上 */
export function collapsedOf(itemCount: number): boolean {
  return itemCount >= PICKER_COLLAPSE_AT;
}

/** 開いたリストに出す行＝先頭 count 件（既定 PICKER_OPEN_MAX＝10・「さらに表示」で +PICKER_PAGE）・残りは more（絞り込み後の件数に対して） */
export function openSliceOf<T>(shown: readonly T[], count: number = PICKER_OPEN_MAX): { rows: T[]; more: number } {
  const rows = shown.slice(0, Math.max(PICKER_OPEN_MAX, count));
  return { rows, more: Math.max(0, shown.length - rows.length) };
}

/** 「さらに表示（残り n 件）」の文言（0 なら null＝出さない） */
export function moreLabelOf(more: number): string | null {
  return more > 0 ? `さらに表示（残り ${more} 件）` : null;
}

/** ↑↓ の移動＝端で止まる（-1＝未選択から ↓ で先頭・↑ で末尾）。行が無ければ -1 */
export function nextActiveOf(active: number, delta: 1 | -1, rowCount: number): number {
  if (rowCount <= 0) return -1;
  if (active < 0) return delta > 0 ? 0 : rowCount - 1;
  return Math.min(rowCount - 1, Math.max(0, active + delta));
}
