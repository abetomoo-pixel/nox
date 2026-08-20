// 店舗数 → Stripe subscription quantity を同期（donor lib/billing/quantity.ts の改修移植）。
//   ★NOX 適応（設計書 §1・裁定8）: quantity = **count(stores) の min 1**。
//     BANZEN は stores.status='active' で絞っていたが、**NOX の stores に status 列は無い**
//     （store 休止概念を作らない＝post-launch 裁定）＝org の全店を数える。
//   - 数量はサーバが算出（クライアント不信任）。
//   - 未契約/失効はスキップ。失敗してもローカル status は保持（webhook で整合）。
//   - 日割りは Stripe 既定（create_prorations）。
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { isWritableStatus } from "./status";

/** 純関数: 店舗数 → 課金数量（min 1・0店 org も 1 で課金＝番兵）。段57 の単体対象。 */
export function quantityOf(storeCount: number | null | undefined): number {
  const n = typeof storeCount === "number" && Number.isFinite(storeCount) ? Math.floor(storeCount) : 0;
  return Math.max(1, n);
}

/** org の店舗数を数える（service key・RLS バイパス＝webhook/admin 文脈用）。 */
export async function countStores(orgId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  return count ?? 0;
}

export async function syncStripeQuantity(orgId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("org_billing")
    .select("status, stripe_subscription_id")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!billing?.stripe_subscription_id || !isWritableStatus(billing.status as string)) return;

  const quantity = quantityOf(await countStores(orgId));

  try {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(billing.stripe_subscription_id as string);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) return;
    await stripe.subscriptions.update(billing.stripe_subscription_id as string, {
      items: [{ id: itemId, quantity }],
      proration_behavior: "create_prorations", // Stripe 既定の日割り
    });
  } catch {
    // 失敗は握りつぶす: ローカル status は保持し、次回 webhook で整合（donor 同流儀）。
  }
}
