// 銀行振込（send_invoice）→ カード自動引き落とし（charge_automatically）への切替（owner 限定・BIL-8）。
//   カードが無いため Checkout mode='setup' で**課金せず**カードを収集し、完了処理（return route）で
//   collection_method を切り替える。donor `api/billing/switch-to-card` の逐語移植（機械置換のみ）。
//   ★逆方向（カード→銀行振込）は self-serve に出さない＝運営者管理を維持（donor 方針Y）。
//   ★プラン/数量には一切触れない＝この操作は決済方式の変更のみ。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { WRITABLE_STATUSES } from "@/lib/billing/status";
import { requireOwner } from "../_owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await requireOwner();
  if (ctx instanceof NextResponse) return ctx;

  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("org_billing")
    .select("stripe_customer_id, stripe_subscription_id, status, collection_method")
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!billing?.stripe_customer_id || !billing?.stripe_subscription_id) {
    return NextResponse.json({ error: "切り替えできるご契約がありません。" }, { status: 400 });
  }
  if (!(WRITABLE_STATUSES as readonly string[]).includes((billing.status as string) ?? "")) {
    return NextResponse.json({ error: "現在のご契約では切り替えできません。" }, { status: 400 });
  }
  // 振込レーンのみが対象＝既にカード決済なら冪等 no-op（400＋code で UI が区別できる形）。
  if (billing.collection_method !== "send_invoice") {
    return NextResponse.json({ error: "既にカード決済でご契約中です。", code: "already_card" }, { status: 400 });
  }

  const stripe = getStripe();
  try {
    const origin = new URL(req.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "setup", // SetupIntent＝課金せずカードだけ保存
      customer: billing.stripe_customer_id as string,
      payment_method_types: ["card"],
      success_url: `${origin}/api/billing/switch-to-card/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?switch=cancel`,
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Stripe API エラー";
    console.error("billing switch-to-card: Stripe 失敗", msg);
    return NextResponse.json({ error: `カード切替の開始に失敗しました: ${msg}` }, { status: 502 });
  }
}
