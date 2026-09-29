// ★便 X-11-6（2026-09-29）: 金額入力の共通化（純関数・DB を知らない）。値は整数（円）の数字列・表示は 3 桁区切り。
//   全角の数字は半角へ・数字以外（カンマ・円・空白・マイナス）は落とす・先頭の 0 は 1 つまで。
export const MONEY_MAX_DIGITS = 9;

export function moneyDigitsOf(raw: string | number | null | undefined, maxDigits = MONEY_MAX_DIGITS): string {
  const s = String(raw ?? "").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\D/g, "");
  if (s === "") return "";
  const t = s.replace(/^0+(?=\d)/, "");
  return t.slice(0, maxDigits);
}

/** 表示形（3 桁区切り）。空は空のまま */
export function moneyDisplayOf(value: string | number | null | undefined): string {
  const d = moneyDigitsOf(value);
  return d === "" ? "" : Number(d).toLocaleString("en-US");
}

/** 数字列 → 整数（空・不正は null） */
export function moneyValueOf(value: string | number | null | undefined): number | null {
  const d = moneyDigitsOf(value);
  return d === "" ? null : Number(d);
}
