// ★2026-11-18 夜（相談役 ⑥ B）: 店の端末の「スタッフでログイン（PIN）」＝端末のロック中（PIN だけの解除の失敗が続いた）の見せ方の純関数。DB・RPC・ロックの決まりは変えない。
//   ロック中＝数字のキーと「解除」を畳み、「名前を選んで入る」を主ボタンに（名前を選んだ入口は端末のロックを見ない＝0201g の作り直し）。
//   開いた時点のロック＝kiosk_unlock を PIN なし（p_pin null・p_membership_id null）で呼ぶ。0201g の本文は「端末のロックの確かめ」が「PIN の形の確かめ（bad_pin）」より前で、
//   bad_pin までに書込（失敗回数・ロック・監査）が無い＝ロック中なら device_locked と locked_until、そうでなければ bad_pin が返るだけ（数えない）。順は verify:nox-kiosk-lock1118 が mig の本文で pin。
import { lockRemainOf } from "../rules-0175/kiosk";

/** ロック中の案内（残りの分は locked_until があるときだけ・lockRemainOf＝「あと N 分で解除」・フラグに依らない＝残りは今の DB の返りにある） */
export function deviceLockNoteOf(lockedUntil: string | null | undefined, now: number = Date.now()): string {
  const remain = lockRemainOf(lockedUntil, now);
  return `PIN の失敗が続いたため、この端末は PIN だけでは入れません${remain ? `（${remain}）` : ""}。「名前を選んで入る」から、自分の名前と PIN で入れます。出退勤は今までどおり使えます。`;
}

/** ロックがまだ効いているか（locked_until が無い返り＝わからない＝ロック中のまま・過ぎていれば解けた） */
export function deviceLockActiveOf(lockedUntil: string | null | undefined, now: number = Date.now()): boolean {
  if (!lockedUntil) return true;
  const t = Date.parse(lockedUntil);
  return !Number.isFinite(t) || t > now;
}

/** 開いた時点の確かめ（PIN なしの kiosk_unlock）の返り → ロックの状態。device_locked 以外（bad_pin・エラー・形の違う返り）はロックしていない扱い＝今までの画面のまま */
export function deviceLockProbeOf(data: unknown): { locked: boolean; lockedUntil: string | null } {
  const r = (data ?? null) as { ok?: unknown; reason?: unknown; locked_until?: unknown } | null;
  if (r && r.ok === false && r.reason === "device_locked") return { locked: true, lockedUntil: typeof r.locked_until === "string" ? r.locked_until : null };
  return { locked: false, lockedUntil: null };
}

/** 開いた時点の確かめの引数（PIN と名前を渡さない＝端末のロックの確かめだけで返る） */
export const DEVICE_LOCK_PROBE_ARGS = { p_pin: null, p_membership_id: null } as const;
