// ★0214（起票158 の 2 休憩の打刻・相談役 11/25 の D5）: 店舗設定「休憩の打刻を使う」の文と選択肢（DB を知らない）。
export const BREAK_PUNCH_OPTIONS = [["off", "使わない"], ["on", "使う"]] as const;
export const BREAK_PUNCH_NOTE = "使うと、出勤中に「休憩」が押せます（休憩中は「休憩終了」だけ）。休憩の時間は勤務の時間から引きます。休憩中もレジは使えます。休憩中は退勤できません（先に「休憩終了」）。";
export const BREAK_PUNCH_NOT_APPLIED_NOTE = "この店は勤務時間を確定シフトで決めている（または打刻しない）ので、休憩を押しても時間は変わりません。";
export function breakPunchErrJa(m: string): string {
  if (m.includes("forbidden")) return "この設定はオーナーだけが変更できます";
  if (m.includes("billing locked")) return "ご契約の状態により保存できません";
  if (m.includes("not found")) return "店が見つかりません";
  return "保存できませんでした";
}
