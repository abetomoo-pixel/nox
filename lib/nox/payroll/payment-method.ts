// ★裁定311-①（2026-09-28・便 Y-2）: 支払記録の method は選択式。列は text のまま（DB 変更 0）・値は 'cash'／'transfer'／'other'。
//   表示は写像＝既存の null（列挙前の記録）は「その他」。列挙外の旧自由入力（live に 0 行）はそのまま出す（情報を落とさない）。
//   純関数＝DB を知らない。UI（payment-panel・履歴）と route の入力検証が同じ配列を使う。
export const PAYMENT_METHODS = [
  ["cash", "現金"],
  ["transfer", "振込"],
  ["other", "その他"],
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number][0];
export const PAYMENT_METHOD_VALUES: readonly string[] = PAYMENT_METHODS.map(([v]) => v);
export const isPaymentMethod = (v: unknown): v is PaymentMethod => typeof v === "string" && PAYMENT_METHOD_VALUES.includes(v);

export function paymentMethodLabelOf(method: string | null | undefined): string {
  if (method == null || method.trim() === "" || method === "other") return "その他";
  const hit = PAYMENT_METHODS.find(([v]) => v === method);
  return hit ? hit[1] : method;
}
