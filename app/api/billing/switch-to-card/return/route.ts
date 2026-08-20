// switch-to-card の完了処理。Checkout(mode='setup') 成功後に Stripe がこの GET へブラウザを戻す
//   （success_url・session_id 付き）。保存されたカードを顧客の既定支払方法にセットし、subscription の
//   collection_method を charge_automatically へ切り替える。donor の逐語移植（機械置換のみ）。
//   ★冪等: 既に charge_automatically なら切替をスキップして done へ（return が二重に踏まれた等）。
//   ★安全: session の customer が認証中 org の customer と一致することを検証（他人の session_id 悪用を遮断）。
//   ★org_billing.collection_method は subscriptions.update が発火する subscription.updated webhook が
//     同期するが、UI 即時性のため本 route でも即書込する（二重でも冪等＝同じ値）。
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { requireOwner } from "../../_owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(req: Request, param: string) {
  return NextResponse.redirect(new URL(`/billing?switch=${param}`, req.url));
}

export async function GET(req: Request) {
  // ★ここはブラウザ遷移の着地点＝JSON ではなく /billing への redirect で返す。
  //   requireOwner は 401/403 を JSON で返すため、その場合も画面へ戻す（error 表示）。
  const ctx = await requireOwner();
  if (ctx instanceof NextResponse) {
    return ctx.status === 401 ? NextResponse.redirect(new URL("/login", req.url)) : back(req, "error");
  }

  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!sessionId) return back(req, "error");

  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("org_billing")
    .select("stripe_customer_id, stripe_subscription_id, collection_method")
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!billing?.stripe_customer_id || !billing?.stripe_subscription_id) return back(req, "error");

  // 既にカード決済なら冪等 no-op。
  if (billing.collection_method !== "send_invoice") return back(req, "done");

  const stripe = getStripe();
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["setup_intent"] });
    const sessCustomer = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
    if (session.mode !== "setup" || session.status !== "complete" || sessCustomer !== billing.stripe_customer_id) {
      return back(req, "error");
    }

    const si = session.setup_intent as Stripe.SetupIntent | null;
    const pm = si && typeof si.payment_method === "string"
      ? si.payment_method
      : (si?.payment_method as Stripe.PaymentMethod | null)?.id ?? null;
    if (!pm) return back(req, "error");

    // ① 顧客の既定支払方法にセット（今後の自動請求はこのカードを使う）。
    await stripe.customers.update(billing.stripe_customer_id as string, {
      invoice_settings: { default_payment_method: pm },
    });
    // ② collection_method を切替（発行済みの open 請求書は据え置き＝サプライズ課金なし・次回請求から自動引落）。
    await stripe.subscriptions.update(billing.stripe_subscription_id as string, {
      collection_method: "charge_automatically",
      default_payment_method: pm,
    });
    // ③ UI 即時性のため org_billing を即書込（webhook でも整合＝二重でも冪等）。
    await admin
      .from("org_billing")
      .update({ collection_method: "charge_automatically", updated_at: new Date().toISOString() })
      .eq("org_id", ctx.orgId);

    return back(req, "done");
  } catch (e) {
    // Stripe 失敗は done にせず error（秘密情報は出さない）。DB は不変で一貫（未切替のまま）。
    const msg = e instanceof Error ? e.message : "Stripe API エラー";
    console.error("billing switch-to-card return: Stripe 失敗", msg);
    return back(req, "error");
  }
}
