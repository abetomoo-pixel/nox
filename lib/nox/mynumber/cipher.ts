// ★0201f（案 1・裁定497-3／499-9・2026-11-13）: マイナンバーをアプリ（サーバー）で暗号化する純関数（鍵は引数＝env を読まない・verify から呼べる）。
//   AES-256-GCM・96 bit の nonce（毎回乱数）・AAD＝cast_id（他人の行に写しても戻らない）。
//   出力＝`nox1:<版>:<base64(nonce 12 ‖ 暗号文 ‖ tag 16)>`（12 桁なら 40 バイト＝DB の検査 29〜128 バイト・CHECK cast_sensitive_mynumber_enc_form_check と同じ形）。
//   鍵＝{ 版: base64 の 32 バイト }。暗号化は今の版（current）・復号は暗号文の版の鍵（版の入れ替えに耐える）。
import crypto from "node:crypto";

export type MynumberKeys = { keys: Record<string, string>; current: string };
export const MYNUMBER_PREFIX = "nox1";
export const MYNUMBER_FORM_RE = /^nox1:[a-z0-9]{1,16}:[A-Za-z0-9+/]+={0,2}$/;

/** 平文（空白とハイフンは除く）が 12 桁の数字か */
export function mynumberPlainOf(raw: string): string | null {
  const s = raw.replace(/[\s-]/g, "");
  return /^\d{12}$/.test(s) ? s : null;
}

function keyOf(k: MynumberKeys, ver: string): Buffer {
  const b64 = k.keys[ver];
  if (!b64) throw new Error("mynumber key missing");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("mynumber key bad length");
  return key;
}

export function encryptMynumber(plain: string, castId: string, k: MynumberKeys): string {
  const p = mynumberPlainOf(plain);
  if (!p) throw new Error("bad mynumber");
  if (!/^[a-z0-9]{1,16}$/.test(k.current)) throw new Error("mynumber key bad version");
  const key = keyOf(k, k.current);
  const nonce = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, nonce);
  c.setAAD(Buffer.from(castId, "utf8"));
  const body = Buffer.concat([c.update(p, "utf8"), c.final()]);
  return `${MYNUMBER_PREFIX}:${k.current}:${Buffer.concat([nonce, body, c.getAuthTag()]).toString("base64")}`;
}

export function decryptMynumber(enc: string, castId: string, k: MynumberKeys): string {
  if (!MYNUMBER_FORM_RE.test(enc)) throw new Error("bad ciphertext");
  const [, ver, b64] = enc.split(":");
  const raw = Buffer.from(b64, "base64");
  if (raw.length < 29) throw new Error("bad ciphertext");
  const key = keyOf(k, ver);
  const d = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  d.setAAD(Buffer.from(castId, "utf8"));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString("utf8");
}

/** 末尾 4 桁だけの表示（********1234） */
export function mynumberMaskedOf(plain: string): string {
  return "********" + plain.slice(-4);
}

/** env の文字列 → 鍵（読めなければ null＝route は 503） */
export function mynumberKeysOf(keysJson: string | undefined, current: string | undefined): MynumberKeys | null {
  if (!keysJson || !current) return null;
  try {
    const keys = JSON.parse(keysJson) as Record<string, string>;
    if (!keys || typeof keys !== "object" || typeof keys[current] !== "string") return null;
    return { keys, current };
  } catch { return null; }
}
