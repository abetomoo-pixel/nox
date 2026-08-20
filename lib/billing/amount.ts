// 契約金額（税込・per_unit × 数量）の算出/整形。Stripe Price を真実とする。
//  Stripe の unit_amount は tax_behavior='inclusive'（税込）・per_unit（quantity=店舗数）。
//  合計 = unit_amount × quantity。表示は「合計/月（単価 × N店舗）」。純関数（Stripe SDK 非依存＝テスト可能）。
//  ★donor lib/billing/amount.ts と同値。donor にプラン分岐は無く（Price を真実とする形）、
//    NOX の単一プラン裁定でも構造は不変＝そのまま移植（設計書 §1「プラン分岐があれば単一化」＝該当なし）。

export type ContractAmount = {
  total: number; // unit_amount × quantity（円・税込）
  unitAmount: number; // 1店舗あたり（円・税込）
  quantity: number;
  interval: "month" | "year";
};

// sub 無し（契約前）／取得失敗・算出不能（degrade）の表示ラベル（単一ソース）。
export const CONTRACT_AMOUNT_NONE = "—（契約前）";
export const CONTRACT_AMOUNT_UNKNOWN = "—";

// Stripe subscription item から契約金額を算出。unit_amount / quantity(整数≥1) / interval(month|year) が
// 揃わなければ null（＝呼び出し側は degrade 表示）。SDK 型に依存しない構造型で受ける（純関数・テスト容易）。
export function contractAmountFromItem(
  item:
    | {
        quantity?: number | null;
        price?: { unit_amount?: number | null; recurring?: { interval?: string | null } | null } | null;
      }
    | null
    | undefined,
): ContractAmount | null {
  const unitAmount = item?.price?.unit_amount;
  const quantity = item?.quantity;
  const interval = item?.price?.recurring?.interval;
  if (typeof unitAmount !== "number" || !Number.isFinite(unitAmount) || unitAmount < 0) return null;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) return null;
  if (interval !== "month" && interval !== "year") return null;
  return { total: unitAmount * quantity, unitAmount, quantity, interval };
}

const yen = (n: number) => "¥" + n.toLocaleString("ja-JP");

// 例: "¥46,800/月（¥7,800 × 6店舗）"。unit_amount は税込（tax_behavior=inclusive）＝そのまま税込表示。
export function formatContractAmount(a: ContractAmount): string {
  const per = a.interval === "month" ? "月" : "年";
  return `${yen(a.total)}/${per}（${yen(a.unitAmount)} × ${a.quantity}店舗）`;
}

// 表示ラベルの単一判定（純関数）。
//  - sub 無し（契約前）→ CONTRACT_AMOUNT_NONE
//  - sub 有り & 算出可 → 合計/内訳
//  - sub 有り & 算出不能（retrieve 失敗 or unit_amount 欠落）→ CONTRACT_AMOUNT_UNKNOWN（degrade "—"）
export function contractAmountLabel(hasSub: boolean, amount: ContractAmount | null): string {
  if (!hasSub) return CONTRACT_AMOUNT_NONE;
  return amount ? formatContractAmount(amount) : CONTRACT_AMOUNT_UNKNOWN;
}
