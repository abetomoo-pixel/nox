// ★M-158／M-159（2026-11-11・裁定472）: 「レジ」を出すか＝サイドメニュー・下の固定ナビ・ホームのクイック操作・/register の入口で 1 つの判定。
//   純関数（DB を知らない）＝verify:nox-m158 が役割×許可×出勤の全組み合わせで確かめる。データの取り方は register-visibility-server.ts。
//   決まり（裁定472）＝店長以上（owner／manager／admin）は常時・スタッフは can_register ∧ 出勤中（打刻する店＝店の端末で出勤・打刻しない店＝確定シフトの時間内）。
//   キャストは /mine 側（cast-entry-server.ts）＝ここは (manage) の役割だけ。
export type RegisterAccess = { allowed?: boolean; reason?: string | null } | null;
export type RegisterVisibility = { show: boolean; note: string | null };

export const REGISTER_OFF_DUTY_NOTE_PUNCH = "店の端末で出勤するとレジが使えます";
export const REGISTER_OFF_DUTY_NOTE_STORE = "確定シフトの時間内にレジが使えます";

export function registerVisibilityOf(i: {
  role: string | null | undefined;
  canRegister: boolean;          // スタッフの会計の権限（auth_staff_can_register）。店長以上は見ない
  access: RegisterAccess;        // auth_register_access の返り（MIG_0200 の前は null）
  gateOn: boolean;               // MIG_0200（裁定472）が本番に入っているか
  punchMode: string | null | undefined; // 店の punch_mode（'store'＝打刻しない店）
}): RegisterVisibility {
  const r = i.role ?? "";
  if (r === "owner" || r === "manager" || r === "admin") return { show: true, note: null };
  if (r !== "staff") return { show: false, note: null };
  if (!i.canRegister) return { show: false, note: null };              // 許可されていない人には案内も出さない
  if (!i.gateOn) return { show: true, note: null };
  if (i.access?.allowed === true) return { show: true, note: null };
  if (i.access?.reason === "off_duty") return { show: false, note: i.punchMode === "store" ? REGISTER_OFF_DUTY_NOTE_STORE : REGISTER_OFF_DUTY_NOTE_PUNCH };
  return { show: false, note: null };
}
