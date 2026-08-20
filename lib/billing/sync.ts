// Stripe → org_billing の写像（webhook 専用・service key）。課金 app 設計書 v1 §2 の4差分を適用。
//   donor lib/billing/sync.ts からの改修移植:
//     §2-1 normalizeStatus を **NOX 5値**へ（org_billing CHECK と一致）
//     §2-2 interval（month/year）を BillingFields へ追加＝NOX 列がある
//     §2-3 cancel_at_period_end は mig0100 で列追加済み＝donor と同形
//     §2-4 ★recordPayment / jstMonthStart は移植しない（billing_payments を作らない＝v1 スコープ外）
//     ★resolvePlan / applyPlanFlags / BanzenPlan も移植しない（プラン軸＝裁定7・単一プラン）
//   共通の機械置換: tenant_billing→org_billing・tenant_id→org_id・createAdminClient は NOX 流儀。
import { createAdminClient } from "@/lib/supabase/admin";
import { BILLING_STATUSES, type BillingStatus } from "./status";

// Stripe の subscription.status（7値＋未知）を org_billing の許容5値へ正規化（設計書 §2-1 の写像表）。
//   incomplete → inactive（未開始＝書けない）
//   incomplete_expired / unpaid / 未知 → canceled（安全側＝read-only 失効）
//   paused → past_due（支払い待ち相当＝writable 側に残す＝BANZEN と同じ寄せ方）
//   5値内はそのまま。
export function normalizeStatus(s: string | null | undefined): BillingStatus {
  if (s && (BILLING_STATUSES as readonly string[]).includes(s)) return s as BillingStatus;
  if (s === "incomplete") return "inactive";
  if (s === "incomplete_expired") return "canceled";
  if (s === "unpaid") return "canceled";
  if (s === "paused") return "past_due";
  return "canceled"; // 未知は安全側（読取専用へ倒す）
}

// Stripe price.recurring.interval を org_billing.interval（month/year・null 可）へ正規化（§2-2）。
export function normalizeInterval(i: string | null | undefined): "month" | "year" | null {
  return i === "month" || i === "year" ? i : null;
}

export type BillingFields = {
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status: BillingStatus;
  interval: "month" | "year" | null; // ★§2-2: NOX 追加
  current_period_end: string | null;
  cancel_at_period_end: boolean; // ★§2-3: mig0100 で列追加
  quantity: number;
  trial_ends_at: null; // Stripe 由来の upsert は常に null＝DB トライアルの残置期限をクリア
  collection_method: "charge_automatically" | "send_invoice"; // BT: レーン種別を Stripe に追随
};

// org_billing を upsert（webhook 専用・最新勝ち）。PK=org_id なので冪等（Stripe 再送に安全）。
// trial_ends_at=null 固定: Stripe 契約が立った時点で DB トライアルの期限管理は Stripe 側へ移る
//   （「Stripe trialing なのに writable=false」の構造的防止・expire-trials cron の対象からも自然に外れる）。
export async function upsertBilling(orgId: string, f: BillingFields): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("org_billing").upsert({
    org_id: orgId,
    stripe_customer_id: f.stripe_customer_id,
    stripe_subscription_id: f.stripe_subscription_id,
    status: f.status,
    interval: f.interval,
    current_period_end: f.current_period_end,
    cancel_at_period_end: f.cancel_at_period_end,
    quantity: f.quantity,
    trial_ends_at: f.trial_ends_at,
    collection_method: f.collection_method,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`org_billing upsert 失敗: ${error.message}`);
}

// status だけを倒す（customer.subscription.deleted＝canceled へ・§3 写像表）。
//   ★upsert ではなく update＝既存行の他列（customer id 等）を消さない。行が無い org は何もしない。
export async function markBillingStatus(orgId: string, status: BillingStatus): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("org_billing")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("org_id", orgId);
  if (error) throw new Error(`org_billing status 更新 失敗: ${error.message}`);
}

// stripe_customer_id から org をローカル解決（無ければ null → webhook が customer.metadata で補完＝§3）。
export async function localOrgByCustomer(customerId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("org_billing")
    .select("org_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return (data?.org_id as string) ?? null;
}

// Stripe subscription（SDK 型に依存しない構造型）から BillingFields を組む純関数（段57 の単体対象）。
//   ★純関数＝Stripe 実呼びなしでテストできる形に切り出す（donor は webhook route 内にインラインだった）。
export function billingFieldsFromSubscription(
  sub: {
    id?: string | null;
    status?: string | null;
    current_period_end?: number | null; // 旧形状（v22 以降は item 側・下で両対応）
    cancel_at_period_end?: boolean | null;
    collection_method?: string | null;
    items?: {
      data?: Array<{
        quantity?: number | null;
        current_period_end?: number | null; // ★Stripe 2025: 課金期間は item 単位（donor 実測）
        price?: { recurring?: { interval?: string | null } | null } | null;
      }> | null;
    } | null;
  } | null | undefined,
  customerId: string,
): BillingFields {
  const item = sub?.items?.data?.[0];
  // ★donor 実測: Stripe v22/basil は current_period_end が item 側にある。item 優先で両対応。
  const cpe = item?.current_period_end ?? sub?.current_period_end;
  return {
    stripe_customer_id: customerId,
    stripe_subscription_id: sub?.id ?? null,
    status: normalizeStatus(sub?.status),
    interval: normalizeInterval(item?.price?.recurring?.interval),
    current_period_end: typeof cpe === "number" && Number.isFinite(cpe) ? new Date(cpe * 1000).toISOString() : null,
    cancel_at_period_end: sub?.cancel_at_period_end === true,
    quantity: Math.max(1, typeof item?.quantity === "number" ? item.quantity : 1),
    trial_ends_at: null,
    collection_method: sub?.collection_method === "send_invoice" ? "send_invoice" : "charge_automatically",
  };
}
