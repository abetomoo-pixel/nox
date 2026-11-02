// ★便 M5 M-49（2026-10-30・相談役）: キオスクのタイル画面に「本人でログイン」＝店長以上がパスワードで本体画面を開く入口。
//   開いたセッションは店設定の無操作 N 分（kiosk_person_idle_minutes・既定 10 分）で自動ログアウトし、端末のセッションを復元してキオスク画面へ戻る。
//   裁定435 のタイル構成（5 タイル）は変えない（タイルの下の小さな入口）。DB 変更 0＝キーの編集口（set_store_profile の白名単）は 0192 に同乗＝それまで既定 10 分。
//   純関数（DB・ブラウザを知らない）。ブラウザ側＝person-login-client.ts。
export const KIOSK_PERSON_MARK = "nox.kiosk.person"; // localStorage: { at: ISO }＝本人ログイン中の印（本体画面の guard が見る）
export const KIOSK_DEVICE_SESSION = "nox.kiosk.device_session"; // localStorage: { access_token, refresh_token }＝端末のセッション（戻るときに setSession）
export const KIOSK_PERSON_IDLE_DEFAULT_MIN = 10;
export const KIOSK_PERSON_ROLES = ["owner", "admin", "manager"] as const; // 店長以上

/** 店設定 kiosk_person_idle_minutes（1〜120 の整数）・無ければ既定 10 */
export function kioskPersonIdleMinutesOf(settings: unknown): number {
  const v = ((settings ?? {}) as Record<string, unknown>).kiosk_person_idle_minutes;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 120 ? n : KIOSK_PERSON_IDLE_DEFAULT_MIN;
}
/** 本人でログインできる役割＝店長以上（staff／cast はキオスクへ戻す） */
export const kioskPersonAllowedOf = (role: string | null | undefined): boolean => (KIOSK_PERSON_ROLES as readonly string[]).includes(role ?? "");
/** 無操作が N 分を超えたか */
export const idleExpiredOf = (lastActiveMs: number, nowMs: number, minutes: number): boolean => nowMs - lastActiveMs >= minutes * 60_000;
export const KIOSK_PERSON_LINK = "本人でログイン（店長以上）";
export const kioskPersonNoteOf = (minutes: number): string => `キオスクから本人でログイン中。無操作 ${minutes} 分でログアウトしてキオスク画面へ戻ります`;
export const KIOSK_PERSON_DENY = "本人でログインできるのは店長以上です（キオスク画面へ戻ります）";
