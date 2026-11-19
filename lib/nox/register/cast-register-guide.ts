// ★2026-11-19 昼（相談役 ②）: キャストがレジを使えないときに、卓の一覧（「使用中 0／6卓」と空席の並び）の代わりに出す案内。純関数（DB を知らない）。
//   今まで：店の端末の本人セッションの cast は /register を無条件に通し、RLS が伝票を隠すため、出勤前は黙って空の卓が並んだ（Agoora の実機・ACE ひなの・11/19 06:49）。
//   締めの許可だけのキャストも端末の「日報」のタイルが /register へ回され（裁定466＝端末の cast はレジだけ）、同じく空で出た。
//   ★権限の判定は変えない＝auth_register_access（0200）の返り（allowed／reason）をそのまま読み、表示だけを差し替える。
export const CAST_REGISTER_OFF_DUTY_GUIDE = "出勤の打刻をしてから、レジを使えます";
export const CAST_REGISTER_STORE_WINDOW_GUIDE = "確定シフトの時間内にレジが使えます"; // 打刻しない店（punch_mode＝'store'）＝出勤中＝確定シフトの窓（register-visibility の REGISTER_OFF_DUTY_NOTE_STORE と同じ文）
export const CAST_REGISTER_NOT_ALLOWED_GUIDE = "レジの許可がないため、この画面は使えません";
export const CAST_REGISTER_GUIDE_BACK = "打刻の画面へ戻る";
export const CAST_REGISTER_GUIDE_BACK_STORE = "戻る"; // 打刻しない店＝戻り先に打刻の画面が無い

export type CastRegisterGuide = { kind: "off_duty" | "not_allowed"; text: string; back: string };

/** allowed＝true なら null（卓の一覧をそのまま出す）。off_duty＝打刻の案内（打刻しない店はシフトの窓の案内）。ほかの理由＝許可が無い案内。 */
export function castRegisterGuideOf(i: { allowed: boolean; reason: string | null | undefined; storeDecidesPunch: boolean }): CastRegisterGuide | null {
  if (i.allowed) return null;
  const back = i.storeDecidesPunch ? CAST_REGISTER_GUIDE_BACK_STORE : CAST_REGISTER_GUIDE_BACK;
  if (i.reason === "off_duty") return { kind: "off_duty", text: i.storeDecidesPunch ? CAST_REGISTER_STORE_WINDOW_GUIDE : CAST_REGISTER_OFF_DUTY_GUIDE, back };
  return { kind: "not_allowed", text: CAST_REGISTER_NOT_ALLOWED_GUIDE, back };
}
