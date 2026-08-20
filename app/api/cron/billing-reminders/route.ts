// BT レーン（銀行振込＝collection_method='send_invoice'）のお支払い期日リマインド（設計書 v1 §4・BIL-8）。
// 起動＝Vercel Cron（vercel.json・`0 20 * * *`＝JST 5:00＝expire-trials と非衝突）。
// 保護＝Authorization: Bearer CRON_SECRET（expire-trials と同型）。
//
// 【重複防止＝新テーブルなし】日次実行 × 残日数が閾値に一致した日だけ送る＝1 org 1閾値につき1日1通に
//   自然収束する（送信履歴を持たない）。閾値判定は lib/billing/reminders の純関数（段57 の単体対象）。
// 【1 org の失敗で全体を落とさない】Stripe の失敗は握りつぶして failed に計上（donor 同流儀）。
// 【degrade】対象0件なら Stripe を呼ばず return＝STRIPE_SECRET_KEY 未設定環境でも 500 にしない。
//
// ★NOX 適応（donor からの差分・未解消の残件あり＝申告①）:
//   donor は `lib/mail`（sendMail/mailConfigured＝Resend）で本文を送るが、**NOX に mail 基盤が無い**。
//   よって本 route は「誰に・残り何日で送るべきか」までを確定し、**送信は行わず eligible に計上**する
//   （mail_disabled: true を返す）。送信手段が入った時点で eligible のループ内に送信1行を足せば完成する形。
//   宛先も本文もここでは組まない＝無い基盤に合わせて偽の実装を置かないため。
//   donor の resolvePlan（プラン名解決）は NOX では不要（単一プラン＝裁定7）。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { reminderDayFor } from "@/lib/billing/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Stripe API を org 数ぶん呼ぶため既定では不足しうる（donor 同型）

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("not configured", { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  // 対象＝振込レーンの全 org。
  const { data: rows, error } = await admin
    .from("org_billing")
    .select("org_id, stripe_customer_id, stripe_subscription_id")
    .eq("collection_method", "send_invoice");
  if (error) {
    console.error(`cron billing-reminders: 対象取得失敗 ${error.message}`);
    return new NextResponse("error", { status: 500 });
  }

  const checked = rows?.length ?? 0;
  if (checked === 0 || !isStripeConfigured()) {
    // 対象なし／Stripe 未接続はどちらも「何もしないのが正しい」＝200 で返す（cron を赤くしない）。
    console.log(`cron billing-reminders: checked=${checked} eligible=0 skipped=${checked} (対象なし または Stripe 未接続)`);
    return NextResponse.json({ ok: true, checked, eligible: 0, skipped: checked, failed: 0, mail_disabled: true });
  }

  const stripe = getStripe();
  const now = new Date();
  let eligible = 0;
  let skipped = 0;
  let failed = 0;

  for (const r of rows ?? []) {
    const orgId = r.org_id as string;
    try {
      const customerId = r.stripe_customer_id as string | null;
      const subscriptionId = r.stripe_subscription_id as string | null;
      if (!customerId || !subscriptionId) {
        skipped++;
        continue;
      }

      // 未払いの請求書（subscription 紐付き・最新1件）。draft/paid/void は対象外。
      const list = await stripe.invoices.list({
        customer: customerId,
        subscription: subscriptionId,
        status: "open",
        limit: 1,
      });
      const inv = list.data[0];
      if (!inv?.due_date) {
        skipped++;
        continue;
      }

      // 閾値外の日（期日超過の負値もここ＝督促は billing 述語による停止に委ねる）。
      const days = reminderDayFor(inv.due_date, now);
      if (days === null) {
        skipped++;
        continue;
      }

      // ★ここに送信が入る（申告①: mail 基盤が入るまでは計上のみ）。
      eligible++;
    } catch (e) {
      failed++;
      console.error(`cron billing-reminders: org=${orgId} 失敗`, (e as Error).message);
    }
  }

  console.log(
    `cron billing-reminders: checked=${checked} eligible=${eligible} skipped=${skipped} failed=${failed} (mail 未構成=送信なし)`,
  );
  return NextResponse.json({ ok: true, checked, eligible, skipped, failed, mail_disabled: true });
}
