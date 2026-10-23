// ★追補 2 同乗 R-7 の QR 解除（裁定423 候補・0175 v2 ★27）: キオスク用 QR＝TOTP（RFC 6238・30 秒・6 桁）の純関数。
//   トークン＝'noxk:' + membership_id + '.' + 6 桁。RPC kiosk_unlock_qr は ±1 窓で照合・同じトークンは 1 回だけ（kiosk_sessions.token_hash）・失敗 5 回で 10 分ロック。
//   HMAC-SHA1 は Web Crypto（client）／node:crypto（suite）で計算し、切り出し（RFC 4226）はここの純関数。
export const TOTP_STEP_SEC = 30;
export const totpCounterOf = (nowMs: number, step = TOTP_STEP_SEC): number => Math.floor(nowMs / 1000 / step);
/** 次に値が変わるまでの秒（リングの残り） */
export const totpRemainSecOf = (nowMs: number, step = TOTP_STEP_SEC): number => step - (Math.floor(nowMs / 1000) % step);
/** RFC 4226 の動的切り出し＝HMAC-SHA1 の 20 byte → 6 桁 */
export function totpCodeFromHmac(h: Uint8Array): string {
  const off = h[19] & 15;
  const code = (((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]) % 1_000_000;
  return String(code).padStart(6, "0");
}
/** counter → 8 byte big-endian */
export function counterBytesOf(counter: number): Uint8Array {
  const b = new Uint8Array(8); let c = counter;
  for (let i = 7; i >= 0; i--) { b[i] = c & 0xff; c = Math.floor(c / 256); }
  return b;
}
export const hexToBytes = (hex: string): Uint8Array => new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((x) => parseInt(x, 16)));
/** Web Crypto で TOTP（client）。secretHex＝my_qr_secret の secret_hex */
export async function totpCodeOf(secretHex: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", hexToBytes(secretHex) as unknown as BufferSource, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytesOf(counter) as unknown as BufferSource));
  return totpCodeFromHmac(sig);
}
export const qrTokenOf = (membershipId: string, code: string): string => `noxk:${membershipId}.${code}`;
export function parseQrToken(s: string): { membershipId: string; code: string } | null {
  const m = /^noxk:([0-9a-f-]{36})\.([0-9]{6})$/.exec(s.trim());
  return m ? { membershipId: m[1], code: m[2] } : null;
}
/** トークンの有効判定（RPC の鏡）＝counter が今・1 つ前・1 つ後のどれか */
export const tokenWindowOkOf = (tokenCounter: number, nowCounter: number): boolean => Math.abs(tokenCounter - nowCounter) <= 1;
/** 使い回し判定（RPC の鏡）＝同じトークン（hash）が 5 分以内に使われていたら拒否 */
export const replayOf = (usedAtMs: number | null, nowMs: number): boolean => usedAtMs !== null && nowMs - usedAtMs < 5 * 60 * 1000;
/** ロック＝失敗 5 回で 10 分 */
export const qrLockOf = (failCount: number): { locked: boolean; minutes: number } => ({ locked: failCount >= 5, minutes: 10 });
/** 「QR で解除」タブを出す端末＝カメラ API がある（BarcodeDetector か getUserMedia＝jsQR のフォールバック） */
export const qrTabAvailableOf = (env: { hasBarcodeDetector: boolean; hasMediaDevices: boolean }): boolean => env.hasMediaDevices && (env.hasBarcodeDetector || true);
