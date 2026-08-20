// 課金 status の単一定義（課金 app 設計書 v1 §2-1・donor lib/billing/status.ts の NOX 5値版）。
// ⚠ SQL の public.billing_writable_of()（mig0087）と必ず一致させること（ドリフト防止）。
//   - RLS/RPC ゲートは SQL 述語が正本（対象94本の冒頭挿入）。
//   - この JS 定数は「ユーザー文脈の無い admin 処理（数量同期・webhook）」と表示判定専用。
//
// ★NOX の org_billing CHECK は5値（trialing/active/past_due/canceled/inactive）＝BANZEN の7値
//   （incomplete/unpaid 込み）より狭い。Stripe から来る値の正規化は normalizeStatus（sync.ts）で行う。
export const BILLING_STATUSES = ["trialing", "active", "past_due", "canceled", "inactive"] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

/** 書込可（writable）の status 集合＝SQL 述語 billing_writable_of の第一条件と同値。 */
export const WRITABLE_STATUSES = ["trialing", "active", "past_due"] as const;

export function isWritableStatus(status: string | null | undefined): boolean {
  return !!status && (WRITABLE_STATUSES as readonly string[]).includes(status);
}

export function isBillingStatus(s: string | null | undefined): s is BillingStatus {
  return !!s && (BILLING_STATUSES as readonly string[]).includes(s);
}
