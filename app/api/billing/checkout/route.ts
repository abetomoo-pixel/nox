// Checkout（mode=subscription）セッション作成（owner 限定・設計書 v1 §1「Price 2本のみ・quantity=stores count」）。
//   ★プラン選択なし＝周期（monthly/yearly）のみ受ける（裁定7・単一プラン）。
//   数量＝店舗数（サーバ算出・min1・クライアント不信任）。customer は作成時に即 org_billing へ書込。
//   トライアル: DB トライアル（org_billing.trial_ends_at）の残りを subscription_data.trial_end で持ち越し
//     （Stripe 制約＝48時間以上先のみ・それ未満/過去/null はトライアルなし＝即課金）。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, stripePrices } from "@/lib/stripe/client";
import { computeTrialEnd } from "@/lib/billing/trial";
import { quantityOf, countStores } from "@/lib/billing/quantity";
import { requireOwner, ensureCustomer } from "../_owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await requireOwner();
  if (ctx instanceof NextResponse) return ctx;

  const body = (await req.json().catch(() => ({}))) as { cycle?: unknown };
  const cycle = body.cycle;
  if (cycle !== "monthly" && cycle !== "yearly") {
    return NextResponse.json({ error: "お支払い周期の指定が不正です" }, { status: 400 });
  }
  const prices = stripePrices();
  const priceId = cycle === "monthly" ? prices.monthly : prices.yearly;
  if (!priceId) return NextResponse.json({ error: `Stripe 未接続: Price が未設定です（${cycle}）` }, { status: 500 });

  const admin = createAdminClient();
  const quantity = quantityOf(await countStores(ctx.orgId));
  const customerId = await ensureCustomer(ctx.orgId, ctx.email);

  const { data: billing } = await admin
    .from("org_billing").select("trial_ends_at").eq("org_id", ctx.orgId).maybeSingle();
  const trialEnd = computeTrialEnd((billing?.trial_ends_at as string | null) ?? null);

  const origin = new URL(req.url).origin;
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity }],
    ...(trialEnd ? { subscription_data: { trial_end: trialEnd } } : {}),
    payment_method_collection: "always", // トライアルでもカード必須
    success_url: `${origin}/billing?status=success`,
    cancel_url: `${origin}/billing?status=cancel`,
  });
  return NextResponse.json({ ok: true, url: session.url });
}
