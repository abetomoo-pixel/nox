// ★裁定317（2026-09-29・便 X-9-3）: 退勤の「送り」金額ダイアログの既定値。
//   順に ①店設定 okuri_base_amount（正の整数）②同じ cast の直近の transport 額 ③なし（空欄＝入力必須）。
//   純関数＝DB を知らない。読取（stores.settings_json／transport）と RPC は呼び出し側。
export type OkuriDefault = { amount: number | null; source: "store" | "last" | "tier" | "tier0" | null };   // ★0236（#64）: "tier"＝キャストの送り区分の額・"tier0"＝区分の額が 0 円（送りの行を作らない＝Agoora の決め 11/26 22:50）

const posInt = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

export function okuriDefaultAmountOf(baseAmount: unknown, lastTransportAmount: unknown): OkuriDefault {
  const base = posInt(baseAmount);
  if (base !== null) return { amount: base, source: "store" };
  const last = posInt(lastTransportAmount);
  if (last !== null) return { amount: last, source: "last" };
  return { amount: null, source: null };
}

/** ★0236（#64・重大 R15）: キャストの送り区分の額（店の okuri_flat_tiers の code 一致・額 > 0）を先に。無ければ okuriDefaultAmountOf と同じ（店のベース額 → 前回 → 空）。
 *  本人の退勤・店の端末の記録（0236 の transport_issue_self／kiosk_transport_issue）と同じ引き方。額 0 の区分＝空欄（tier0）＝その人の送りは記録しない（本人・端末は行を作らない・Agoora の決め 11/26 22:50）。 */
export function okuriDefaultForCastOf(baseAmount: unknown, tiers: readonly { code: string; amount: number }[], castTier: string | null | undefined, lastTransportAmount: unknown): OkuriDefault {
  const t = castTier ? tiers.find((x) => x.code === castTier) : undefined;
  if (t && t.amount === 0) return { amount: null, source: "tier0" };   // ★0236: 額 0 の区分＝既定なし（記録するときだけ額を入れる）
  const ta = t ? posInt(t.amount) : null;
  if (ta !== null) return { amount: ta, source: "tier" };
  return okuriDefaultAmountOf(baseAmount, lastTransportAmount);
}

export const okuriDefaultNoteOf = (d: OkuriDefault): string =>
  d.source === "tier" ? "既定＝このキャストの送り区分の額（変更できます）"
    : d.source === "tier0" ? "このキャストの送り区分は 0 円です（送りは記録しません。記録するときだけ金額を入れてください）"
    : d.source === "store" ? "既定＝店の送りベース額（変更できます）"
    : d.source === "last" ? "既定＝このキャストの前回の送り額（変更できます）"
      : "既定の金額がありません。金額を入力してください";

/** 入力（文字列）→ 正の整数。不正は null */
export function okuriAmountOf(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}
