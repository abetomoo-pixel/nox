// 在庫理由の定数（④d-2・裁定N）。手動記録の reason 文字列はここが唯一の定義＝
//   棚卸し（/master/stock）と入荷（商品一覧の行モーダル）の両方がここを参照する。
// ★DB に CHECK は足さない（stock_logs.reason は自由テキストのまま・運用規約としての一元化）。
//   トリガ経由（mig0061）の 'sale' / 'sale_remove' / 'void_recredit' は DB 側の文字列＝ここでは表示名だけ持つ。

/** 入荷（商品一覧の行「入荷」モーダルが既定で記録する理由） */
export const STOCK_REASON_RESTOCK = "入荷";

/** 棚卸し（/master/stock の棚卸しフォームが記録する理由＝実数−現在庫の差分） */
export const STOCK_REASON_STOCKTAKE = "棚卸し";

/**
 * 履歴表示用ラベル。トリガ経由の英字 reason を日本語にする。
 * 未知の reason はそのまま返す（自由テキスト時代の既存行・将来の追加を消さない）。
 */
export function stockReasonLabel(reason: string | null): string {
  if (!reason) return "—";
  switch (reason) {
    case "sale": return "販売";
    case "sale_remove": return "注文取消";
    case "void_recredit": return "伝票取消（戻し）";
    default: return reason;
  }
}
