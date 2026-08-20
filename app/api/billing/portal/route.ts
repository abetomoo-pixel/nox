// Stripe カスタマーポータル（owner 限定・支払方法/請求書/解約はポータル側で完結）。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { requireOwner } from "../_owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await requireOwner();
  if (ctx instanceof NextResponse) return ctx;

  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("org_billing").select("stripe_customer_id").eq("org_id", ctx.orgId).maybeSingle();
  const customerId = billing?.stripe_customer_id as string | null | undefined;
  if (!customerId) return NextResponse.json({ error: "まだご契約がありません" }, { status: 400 });

  const origin = new URL(req.url).origin;
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/billing`,
  });
  return NextResponse.json({ ok: true, url: session.url });
}
