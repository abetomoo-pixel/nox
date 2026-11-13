// ★0201f（案 1）: サーバー（app/api の route）だけから呼ぶ＝鍵を読む（Vercel の Production の env＝NOX_MYNUMBER_KEYS・NOX_MYNUMBER_KEY_CURRENT・docs/tmp/env_mynumber_keys.md）。
//   鍵の値はログにもエラーの文にも出さない。純関数は ./cipher.ts（verify から呼ぶ）。
import { decryptMynumber, encryptMynumber, mynumberKeysOf, type MynumberKeys } from "./cipher";

export function mynumberKeysFromEnv(): MynumberKeys | null {
  return mynumberKeysOf(process.env.NOX_MYNUMBER_KEYS, process.env.NOX_MYNUMBER_KEY_CURRENT);
}
export function encryptMynumberEnv(plain: string, castId: string): string {
  const k = mynumberKeysFromEnv(); if (!k) throw new Error("mynumber key missing");
  return encryptMynumber(plain, castId, k);
}
export function decryptMynumberEnv(enc: string, castId: string): string {
  const k = mynumberKeysFromEnv(); if (!k) throw new Error("mynumber key missing");
  return decryptMynumber(enc, castId, k);
}
