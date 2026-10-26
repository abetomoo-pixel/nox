// ★裁定345（便 N1013b・2026-10-13）: シフト希望の表示状態＝シフトの状態から導く 4 段（審査中／採用・確認待ち／採用・確定／見送り）。
//   /mine 希望（app/mine/wishes）・/mine 直近のシフト（app/mine/page）・管理側（app/(manage)/shift/shift-board）の 3 画面が
//   同じ純関数（wishStateOf）から語を出す＝希望側が独自の状態を持たない。
//   DB の実体は 2 列だけ: shift_wishes.status（pending／accepted／rejected／withdrawn）と shifts.status（planned／proposed／confirmed）。
//   ★裁定380（GV-B W-9・2026-10-15）: 店設定 shift_cast_confirm は UI から廃止＝3 本道（希望どおり採用＝採用直後に shift_confirm_bulk で即確定／調整して確定＝shift_set confirmed／
//     調整して送り返す＝shift_set planned→shift_propose＝キャスト確認待ち）。castConfirm 引数は常に true で呼ぶ（proposed＝「キャスト確認待ち」）。
//     ラベルは常に shifts.status から導く（OFF の店の planned／proposed 残存行を「確定」と呼ばない＝給与の分母は confirmed のみ）。
//   管理側の確定ボタンは「代行確定」（manager 以上・shift_confirm_bulk＝audit action は既存を流用）。
export type WishStateKey = "pending" | "accepted_wait" | "accepted_fixed" | "rejected" | "withdrawn";

export const WISH_STATE_LABEL: Record<WishStateKey, string> = {
  pending: "審査中",
  accepted_wait: "採用・確認待ち",
  accepted_fixed: "採用・確定",
  rejected: "見送り",
  withdrawn: "取下げ",
};

/** 表示色（theme のトークン名）＝3 画面で同じ */
export const WISH_STATE_COLOR: Record<WishStateKey, string> = {
  pending: "var(--champ)",
  accepted_wait: "var(--gold)",
  accepted_fixed: "var(--ok)",
  rejected: "var(--sub)",
  withdrawn: "var(--sub)",
};

export type ShiftStatusLike = "planned" | "proposed" | "confirmed" | null | undefined;
export type WishStatusLike = "pending" | "accepted" | "rejected" | "withdrawn" | null | undefined;

/**
 * 希望の status と（あれば）対応する shifts.status から 4 段を決める。
 *   - 希望 pending → 審査中／rejected → 見送り／withdrawn → 取下げ
 *   - 希望 accepted または希望なし（手動のシフト）: shifts confirmed → 採用・確定／planned・proposed → 採用・確認待ち
 *   - accepted なのに shifts が無い（削除済み等）→ 採用・確認待ち（店の操作待ち）
 */
export function wishStateOf(wish: WishStatusLike, shift: ShiftStatusLike): WishStateKey {
  if (wish === "pending") return "pending";
  if (wish === "rejected") return "rejected";
  if (wish === "withdrawn") return "withdrawn";
  if (shift === "confirmed") return "accepted_fixed";
  return "accepted_wait";
}

/** 採用・確認待ちの内訳（管理側の段の印）: planned＝管理者確認／proposed＝キャスト確認待ち（ON）or 店の確定待ち（OFF）。他は null */
export function wishStateDetailOf(key: WishStateKey, shift: ShiftStatusLike, castConfirm: boolean): string | null {
  if (key !== "accepted_wait") return null;
  if (shift === "proposed") return castConfirm ? "キャスト確認待ち" : "店の確定待ち";
  if (shift === "planned") return "管理者確認";
  return "店の操作待ち";
}

/** ラベル＋内訳（内訳があれば「採用・確認待ち（キャスト確認待ち）」） */
export function wishStateTextOf(wish: WishStatusLike, shift: ShiftStatusLike, castConfirm: boolean): string {
  const k = wishStateOf(wish, shift);
  const d = wishStateDetailOf(k, shift, castConfirm);
  return d ? `${WISH_STATE_LABEL[k]}（${d}）` : WISH_STATE_LABEL[k];
}

/** 管理側の確定ボタンの語（裁定345）＝「代行確定」。キャスト本人の確定（shift_cast_confirm）は「確認する」のまま */
export const PROXY_CONFIRM_LABEL = "確定"; // ★便 M-12（裁定430 提案中）: 「代行確定」と管理者確認の確定を 1 つに＝「確定」

/** /mine 直近のシフトの件数上限（裁定345: 7→14・残りは「すべて見る」） */
export const MINE_RECENT_SHIFT_LIMIT = 14;
