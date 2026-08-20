import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import { isStripeConfigured, getStripe } from "@/lib/stripe/client";
import { contractAmountFromItem, contractAmountLabel } from "@/lib/billing/amount";
import BillingBoard, { type BillingView } from "./billing-board";

export const dynamic = "force-dynamic";

// ご契約（課金 app 設計書 v1 §6）。**owner 限定**＝org_billing の RLS SELECT も owner 限定（mig0087）で二重。
//   ★プラン選択 UI は出さない（裁定7・単一プラン×周期のみ）。
//   ★契約金額は Stripe Price を真実とする＝ここでサーバ側で1回だけ retrieve し、
//     未接続/失敗/明細欠落は amount.ts の degrade ラベル（"—"）に落とす（画面は必ず出る）。
//   ★billingGate は噛ませない＝失効中でも復帰できる必要がある（route 側 _owner.ts と同じ理由）。
export default async function BillingPage() {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role !== "owner") redirect("/dashboard");

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("org_billing")
    .select("status, interval, quantity, current_period_end, cancel_at_period_end, collection_method, trial_ends_at, stripe_subscription_id")
    .maybeSingle();

  const configured = isStripeConfigured();
  const subId = (row?.stripe_subscription_id as string | null) ?? null;

  // 契約金額（任意表示）: Stripe 未接続・sub 無し・失敗はすべて degrade（例外を投げない）。
  let amountLabel = contractAmountLabel(false, null);
  if (configured && subId) {
    try {
      const sub = await getStripe().subscriptions.retrieve(subId);
      amountLabel = contractAmountLabel(true, contractAmountFromItem(sub.items.data[0] ?? null));
    } catch {
      amountLabel = contractAmountLabel(true, null); // "—"
    }
  }

  const view: BillingView = {
    status: (row?.status as string | null) ?? null,
    interval: (row?.interval as "month" | "year" | null) ?? null,
    quantity: (row?.quantity as number | null) ?? null,
    currentPeriodEnd: (row?.current_period_end as string | null) ?? null,
    cancelAtPeriodEnd: row?.cancel_at_period_end === true,
    collectionMethod: (row?.collection_method as string | null) ?? null,
    trialEndsAt: (row?.trial_ends_at as string | null) ?? null,
    hasSubscription: !!subId,
    amountLabel,
    stripeConfigured: configured,
  };
  return <BillingBoard view={view} />;
}
