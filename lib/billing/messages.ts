// 課金ゲート由来の文言（単一定義・設計書 v1 §5）。
//   DB は英字トークン 'billing locked' を raise する（対象94本の共通形）。UI/route はこの定数へ寄せる。
//   ★既存7箇所（register 3・kiosk 1・receipts/analytics/shift 3）を本定数へ置換＝新規は定数参照のみ。
export const BILLING_LOCKED_MSG = "ご利用プランの制限で更新できません（管理者にご確認ください）";

/** kiosk（店頭端末）向け＝宛先が「管理者」ではなく現場の「責任者」になる（現行文言を維持）。 */
export const BILLING_LOCKED_MSG_KIOSK = "ご利用プランの制限で更新できません（責任者にご確認ください）";

/** route 側 402 のエラーコード（client の分岐に使う・BANZEN 同型）。 */
export const BILLING_LOCKED_CODE = "billing_read_only";

/** RPC の error.message が課金ゲート由来かの判定（単一ソース）。 */
export function isBillingLocked(message: string | null | undefined): boolean {
  return !!message && message.includes("billing locked");
}
