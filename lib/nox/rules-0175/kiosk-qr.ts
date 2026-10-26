// ★QR 便（2026-10-26・裁定423 変更＝Agoora 確定 10/26 ⑫・0185 起草）: キオスクの QR の純関数。向き＝キオスクが QR を出す→本人がログイン済みのスマホで読む→そのキオスクが本人の権限で開く。
//   QR の中身＝URL（origin + '/kq#' + トークン）＝スマホの標準カメラで読んでも NOX が開く（トークンは # の後＝サーバのログに残らない）。
//   トークン＝'noxq:' + device_id + '.' + TOTP 6 桁（端末の秘密鍵 kiosk_qr_secret・30 秒・RFC 6238）。照合は kiosk_qr_claim（±1 窓・端末×counter で 1 回限り・失敗 5 回で 10 分ロック）。
//   旧向き（スマホに QR・キオスクのカメラで読む＝'noxk:'・my_qr_secret／kiosk_unlock_qr）は撤去（0185 で retired）。PIN（4〜6 桁）は基本の入口として維持。
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
/** Web Crypto で TOTP（キオスク端末）。secretHex＝kiosk_qr_secret の secret_hex */
export async function totpCodeOf(secretHex: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", hexToBytes(secretHex) as unknown as BufferSource, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytesOf(counter) as unknown as BufferSource));
  return totpCodeFromHmac(sig);
}
/** トークンの有効判定（RPC の鏡）＝counter が今・1 つ前・1 つ後のどれか */
export const tokenWindowOkOf = (tokenCounter: number, nowCounter: number): boolean => Math.abs(tokenCounter - nowCounter) <= 1;
/** ロック＝失敗 5 回で 10 分（本人単位） */
export const qrLockOf = (failCount: number): { locked: boolean; minutes: number } => ({ locked: failCount >= 5, minutes: 10 });

/** キオスクのトークン */
export const kioskQrTokenOf = (deviceId: string, code: string): string => `noxq:${deviceId}.${code}`;
export function parseKioskQrToken(s: string): { deviceId: string; code: string } | null {
  const m = /^noxq:([0-9a-f-]{36})\.([0-9]{6})$/.exec(s.trim());
  return m ? { deviceId: m[1], code: m[2] } : null;
}
/** QR の中身＝URL（# の後にトークン） */
export const kioskQrUrlOf = (origin: string, token: string): string => `${origin.replace(/\/+$/, "")}/kq#${token}`;
/** 読み取った文字列（URL でも生のトークンでも）→トークン。キオスク用でなければ null */
export function kioskQrTokenFromScanOf(text: string): string | null {
  const s = text.trim();
  const i = s.indexOf("#");
  const tok = i >= 0 ? decodeURIComponent(s.slice(i + 1)) : s;
  return parseKioskQrToken(tok) ? tok.trim() : null;
}
/** 表示する counter＝読まれた（使用済みの）counter の次から。同じ QR は 1 回限り＝ロックで戻った直後に同じ QR を出さない */
export const kioskQrDisplayCounterOf = (nowCounter: number, usedCounter: number | null): number => (usedCounter !== null && usedCounter >= nowCounter ? usedCounter + 1 : nowCounter);

/** QR で開いた解除の無操作＝3 分（店設定がそれより短ければ店設定）・PIN は従来どおり */
export const KIOSK_QR_IDLE_SEC = 180;
export function kioskIdleMsOf(unlockMethod: string | null | undefined, storeIdleSec: number | null | undefined, pinFallbackSec = 900): number {
  const store = typeof storeIdleSec === "number" && storeIdleSec > 0 ? Math.trunc(storeIdleSec) : pinFallbackSec;
  return (unlockMethod === "qr" ? Math.min(KIOSK_QR_IDLE_SEC, store) : store) * 1000;
}

/** スマホ側の結果→文言（kiosk_qr_claim の reason） */
export function kioskQrClaimMessageOf(r: { ok: boolean; reason?: string; store_name?: string | null; name?: string | null }): { kind: "success" | "error" | "warn"; text: string } {
  if (r.ok) return { kind: "success", text: `キオスクを開きました（${r.store_name ?? "店"}・${r.name ?? "あなた"}）。キオスクの画面で操作してください。3 分操作がないと戻ります` };
  switch (r.reason) {
    case "used": return { kind: "warn", text: "この QR は使用済みです。キオスクに出ている新しい QR を読んでください" };
    case "wrong_token": return { kind: "error", text: "QR の期限が切れたか、この店のキオスクではありません。キオスクに出ている新しい QR を読んでください" };
    case "bad_token": return { kind: "error", text: "この QR はキオスク用ではありません" };
    case "locked": return { kind: "error", text: "失敗が続いたため 10 分ロックしています。しばらくしてから読んでください" };
    case "punch_only": return { kind: "warn", text: "この店ではキャストのレジ操作が OFF です。打刻は出退勤の端末（PIN）かスマホの打刻で" };
    case "no_permission": return { kind: "error", text: "レジを操作する権限がありません（店長に確認してください）" };
    case "other_store": return { kind: "error", text: "別の店のキオスクです（所属の店のキオスクで読んでください）" };
    default: return { kind: "error", text: "キオスクを開けませんでした（店に確認してください）" };
  }
}
