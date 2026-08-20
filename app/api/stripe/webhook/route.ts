// Stripe Webhook（raw body・署名検証必須）＝**org_billing への唯一の書込経路**（設計書 v1 §3・BIL-2/BIL-3）。
//   冪等＋順不同対応: subscription を再取得して現在値を upsert（最新勝ち・PK=org_id）。
//   ★NOX 適応（donor からの差分）:
//     - billing_payments は作らない（§2-4）＝invoice.paid でも org_billing の更新のみ
//     - プラン軸（resolvePlan/applyPlanFlags）は移植しない（裁定7・単一プラン）
//     - Yuiba 連携は NOX に無い＝移植しない
//   ★billingGate は噛ませない（Stripe→自分の経路・ユーザー文脈なし）。
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import {
  upsertBilling, markBillingStatus, localOrgByCustomer, billingFieldsFromSubscription,
} from "@/lib/billing/sync";
// ★純関数（HANDLED / resolveSubscriptionId）は lib/billing/webhook.ts に置く。
//   route.ts はハンドラ以外を export できない（next build の型検査で落ちる）＝分離の理由は同ファイル冒頭に記載。
import { HANDLED, resolveSubscriptionId } from "@/lib/billing/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text(); // 署名検証は raw body で
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return new NextResponse("not configured", { status: 500 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return new NextResponse("invalid signature", { status: 400 });
  }

  // 非 HANDLED は 200 素通し（Stripe に再送させない）
  if (!HANDLED.has(event.type)) return NextResponse.json({ received: true });

  try {
    const obj = event.data.object as unknown as Record<string, unknown>;
    const customerId = typeof obj.customer === "string" ? obj.customer : null;
    if (!customerId) return NextResponse.json({ received: true });

    // org 解決（§3・2経路）: ローカル（checkout 作成時に即書込）→ 無ければ customer.metadata.org_id
    let orgId = await localOrgByCustomer(customerId);
    if (!orgId) {
      const cust = await stripe.customers.retrieve(customerId);
      if (!(cust as Stripe.DeletedCustomer).deleted) {
        const md = (cust as Stripe.Customer).metadata ?? {};
        orgId = typeof md.org_id === "string" ? md.org_id : null;
      }
    }
    if (!orgId) return NextResponse.json({ received: true }); // 解決不能は無視（後続イベントで整合）

    // subscription.deleted は status だけ倒す（§3 写像表）
    if (event.type === "customer.subscription.deleted") {
      await markBillingStatus(orgId, "canceled");
      return NextResponse.json({ received: true });
    }

    const subscriptionId = resolveSubscriptionId(event.type, obj);
    if (!subscriptionId) return NextResponse.json({ received: true });

    // subscription を再取得して現在値で upsert（順不同・再送に強い）
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    await upsertBilling(orgId, billingFieldsFromSubscription(sub as unknown as Parameters<typeof billingFieldsFromSubscription>[0], customerId));

    return NextResponse.json({ received: true });
  } catch (e) {
    // 処理失敗は 500＝Stripe 再送に委ねる（upsert は PK org_id で冪等ゆえ再送安全）
    console.error("stripe webhook 失敗:", e);
    return new NextResponse("handler error", { status: 500 });
  }
}
