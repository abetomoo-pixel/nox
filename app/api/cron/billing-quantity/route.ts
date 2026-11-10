// ★裁定475 承認（2026-11-10）: 店舗数と Stripe の数量（subscription quantity）の毎日の突き合わせ。ずれたら直して運営に知らせる（ログ＋応答に一覧）。
//   起動＝Vercel Cron（vercel.json・`30 20 * * *`＝JST 5:30＝billing-reminders の後）。保護＝Authorization: Bearer CRON_SECRET（expire-trials と同型）。
//   対象＝契約（stripe_subscription_id）があり書込可（trialing・active・past_due）の org だけ。日割りは Stripe 既定（create_prorations）。
//   ★Stripe 未接続（STRIPE_SECRET_KEY なし）なら Stripe を呼ばずに 200（skipped）。1 org の失敗で全体を落とさない。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { countStores, quantityOf } from "@/lib/billing/quantity";
import { WRITABLE_STATUSES } from "@/lib/billing/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("not configured", { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("unauthorized", { status: 401 });
  if (!isStripeConfigured()) return NextResponse.json({ ok: true, skipped: "stripe_not_configured" });

  const admin = createAdminClient();
  const { data, error } = await admin.from("org_billing").select("org_id, status, stripe_subscription_id").not("stripe_subscription_id", "is", null);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const stripe = getStripe();
  const fixed: { org_id: string; from: number; to: number }[] = []; const failed: { org_id: string; error: string }[] = [];
  for (const b of (data ?? []) as { org_id: string; status: string; stripe_subscription_id: string }[]) {
    if (!(WRITABLE_STATUSES as readonly string[]).includes(b.status)) continue;
    try {
      const want = quantityOf(await countStores(b.org_id));
      const sub = await stripe.subscriptions.retrieve(b.stripe_subscription_id);
      const item = sub.items.data[0];
      if (!item) continue;
      if (item.quantity !== want) {
        await stripe.subscriptions.update(sub.id, { items: [{ id: item.id, quantity: want }], proration_behavior: "create_prorations" });
        fixed.push({ org_id: b.org_id, from: item.quantity ?? 0, to: want });
      }
    } catch (e) {
      failed.push({ org_id: b.org_id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (fixed.length || failed.length) console.error("billing-quantity: 運営に知らせる", JSON.stringify({ fixed, failed })); // 運営への知らせ＝ログ（運営コンソール 0202 で一覧に）
  return NextResponse.json({ ok: true, fixed, failed });
}
