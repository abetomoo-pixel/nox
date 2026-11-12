// ★0201e（2026-11-12）: /mine の取り下げ（ドリンクの申告＝drink_claim_withdraw・予約の申請＝reservation_withdraw）。
//   出すのは承認前（status 'pending'）の本人の行だけ（RPC も本人・承認前だけ＝'forbidden'／'not pending'）。純関数（DB を知らない）。
import { mig0201eOn } from "@/lib/nox/rules-0175/flag";
import { RSV_REQ_CANCEL_NOTE } from "@/lib/nox/mine/reservation-request";

export const WITHDRAW_LABEL = "取り下げ";
export const DRINK_WITHDRAW_RPC = "drink_claim_withdraw";
export const RSV_WITHDRAW_RPC = "reservation_withdraw";
export const DRINK_WITHDRAW_CONFIRM = "この申告を取り下げますか？（取り下げた申告は元に戻せません）";
export const RSV_WITHDRAW_CONFIRM = "この予約の申請を取り下げますか？（取り下げた申請は元に戻せません）";
export const DRINK_WITHDRAW_DONE = "申告を取り下げました";
export const RSV_WITHDRAW_DONE = "申請を取り下げました";

/** 取り下げのボタンを出すか＝承認前（pending）だけ */
export function canWithdrawOf(status: string | null | undefined): boolean {
  return mig0201eOn() && status === "pending";
}

/** 予約の申請カードの注記（取り下げがあるときは承認前の取り下げを案内） */
export function rsvCancelNoteOf(): string {
  return mig0201eOn() ? "承認待ちの申請は「取り下げ」で取り消せます。承認後の変更は店にご連絡ください。人数や卓の希望も店で設定します" : RSV_REQ_CANCEL_NOTE;
}
