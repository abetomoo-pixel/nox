// ★裁定317（2026-09-29・便 X-9-3）: 退勤の「送り」金額ダイアログの既定値。
//   順に ①店設定 okuri_base_amount（正の整数）②同じ cast の直近の transport 額 ③なし（空欄＝入力必須）。
//   純関数＝DB を知らない。読取（stores.settings_json／transport）と RPC は呼び出し側。
export type OkuriDefault = { amount: number | null; source: "store" | "last" | null };

const posInt = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

export function okuriDefaultAmountOf(baseAmount: unknown, lastTransportAmount: unknown): OkuriDefault {
  const base = posInt(baseAmount);
  if (base !== null) return { amount: base, source: "store" };
  const last = posInt(lastTransportAmount);
  if (last !== null) return { amount: last, source: "last" };
  return { amount: null, source: null };
}

export const okuriDefaultNoteOf = (d: OkuriDefault): string =>
  d.source === "store" ? "既定＝店の送りベース額（変更できます）"
    : d.source === "last" ? "既定＝このキャストの前回の送り額（変更できます）"
      : "既定の金額がありません。金額を入力してください";

/** 入力（文字列）→ 正の整数。不正は null */
export function okuriAmountOf(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}
