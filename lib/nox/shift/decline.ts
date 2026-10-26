// ★便 ON-3（2026-10-26・0176 ★5 (c)・裁定406「辞退で戻る」）: 本人の辞退（shift_cast_decline＝proposed→planned・declined_at／decline_reason）の純関数。
//   /mine＝「確認待ち（あなた）」の行に「辞退」（理由は任意・200 字）。店＝承認待ちの行に「辞退あり 10/26『理由』」の印（planned に戻っている＝再調整して送り返す）。
export const DECLINE_REASON_MAX = 200;
export function declineReasonErrorOf(reason: string): string | null {
  return reason.length > DECLINE_REASON_MAX ? `理由は ${DECLINE_REASON_MAX} 文字までです` : null;
}
const mdJst = (iso: string): string => { const d = new Date(new Date(iso).getTime() + 9 * 3600_000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
/** 店側の印（planned で declined_at があるときだけ） */
export function declineTextOf(s: { status: string; declined_at?: string | null; decline_reason?: string | null }): string | null {
  if (s.status !== "planned" || !s.declined_at) return null;
  return `辞退あり ${mdJst(s.declined_at)}${s.decline_reason ? `『${s.decline_reason}』` : ""}`;
}
export const DECLINE_BUTTON = "辞退";
export const DECLINE_CONFIRM = "このシフト案を辞退します。店が再調整して、また確認のお願いが届くことがあります。";
export const DECLINE_DONE = "辞退しました（店に戻りました）";
export function declineErrJa(msg: string): string {
  if (/not proposed/.test(msg)) return "このシフトは辞退できない状態です（更新してください）";
  if (/billing locked/.test(msg)) return "現在このお店では操作できません（責任者にご確認ください）";
  if (/forbidden/.test(msg)) return "権限がありません";
  if (/bad reason/.test(msg)) return `理由は ${DECLINE_REASON_MAX} 文字までです`;
  return msg;
}
