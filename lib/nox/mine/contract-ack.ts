// ★0162 ★4（裁定326 追補7-6・便 M5-2・2026-10-01）: cast の契約確認（/mine 初回表示）の純関数（DB を知らない）。
//   店の contract_ack が ON（店設定・料金マスタで記録）かつ contract_ack_rev の記録が本人に無いとき＝cast_contract_ack_needed() が true のときだけ確認画面を出す。
//   「確認しました」＝cast_contract_ack_self()（冪等）→ 以後は出さない。店が OFF→ON をやり直すと rev が進み再表示（追補7-5 の手動再確認と整合）。
//   文面＝料金マスタの契約文（pricing-board の既存文面を逐語）＋ cast 向けの 1 行。新しい契約語は作らない（相談役の追認で改稿）。

export const CONTRACT_ACK_TITLE = "契約内容の確認";

/** 料金マスタ（pricing-board）の既存文面＝逐語 */
export const CONTRACT_ACK_STORE_TEXT = "加盟店契約でカード手数料の転嫁が禁止・制限されている場合があります。契約上の可否を確認してください";

export const CONTRACT_ACK_LINES: readonly string[] = [
  CONTRACT_ACK_STORE_TEXT,
  "この店の料金・手数料の取り扱い（カード手数料の転嫁を含む）について、店から説明を受けて確認しました。",
];

export const CONTRACT_ACK_BUTTON = "確認しました";
export const CONTRACT_ACK_NOTE = "確認の記録は本人と店が見られます。内容が改定されたときは再度表示されます。";
export const CONTRACT_ACK_DONE = "確認を記録しました";

/** 確認画面を出すか＝店が ON（contract_ack）かつ RPC が「未記録」（needed=true）。RPC が読めない（null）ときは出さない（止めない）。 */
export function contractAckGateOf(storeContractAck: boolean, needed: boolean | null | undefined): boolean {
  return storeContractAck === true && needed === true;
}

/** RPC の拒否語 → 和文（rpc-err の写像と同じ語） */
export const CONTRACT_ACK_ERR_JA: Record<string, string> = {
  "not required": "この店では契約確認は不要です",
  "no cast for caller": "キャストの登録が見つかりません",
};
