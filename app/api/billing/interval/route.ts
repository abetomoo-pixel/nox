// お支払い周期の切替（月↔年・owner 限定）＝donor `api/billing/change-plan` の**縮退移植**。
//   ★NOX は単一プラン（裁定7）＝donor の「機能軸（shift↔pos）× 周期軸」2軸から**周期軸だけ**を残す。
//     Price は env 2本（monthly/yearly）のみ＝checkout と同じ解決方式。
//   既存 subscription の price を差し替える（subscriptions.update・create_prorations＝差額を即時比例配分）。
//   ★org_billing.interval は route で直接更新しない＝webhook の subscription.updated → upsertBilling が
//     単一の書込経路（設計書 §3・二重更新の回避）。ここは Stripe を変えるだけ。
//   ★数量は現状維持（omit＝Stripe が既存 quantity を保持）＝店舗数は周期変更で変わらないため再計算しない。
//   ★銀行振込（send_invoice）は self-serve 対象外＝403（donor A案を踏襲・運営者代行）。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, stripePrices } from "@/lib/stripe/client";
import { WRITABLE_STATUSES } from "@/lib/billing/status";
import { requireOwner } from "../_owner";

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
  const newPriceId = cycle === "monthly" ? prices.monthly : prices.yearly;
  if (!newPriceId) return NextResponse.json({ error: `Stripe 未接続: Price が未設定です（${cycle}）` }, { status: 500 });

  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("org_billing")
    .select("stripe_subscription_id, status, collection_method")
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!billing?.stripe_subscription_id) {
    return NextResponse.json({ error: "変更できるご契約がありません。先にご契約ください。" }, { status: 400 });
  }
  // 生存 status（trialing/active/past_due）＝writable 集合と同語彙。canceled/inactive は新規契約へ。
  if (!(WRITABLE_STATUSES as readonly string[]).includes((billing.status as string) ?? "")) {
    return NextResponse.json({ error: "現在のご契約では変更できません。ご契約を選び直してください。" }, { status: 400 });
  }
  if (billing.collection_method === "send_invoice") {
    return NextResponse.json({ error: "銀行振込でご契約中の周期変更はお問い合わせください（運営者が承ります）。" }, { status: 403 });
  }

  const stripe = getStripe();
  try {
    const sub = await stripe.subscriptions.retrieve(billing.stripe_subscription_id as string);
    const item = sub.items.data[0];
    if (!item) return NextResponse.json({ error: "ご契約の明細が見つかりません。" }, { status: 400 });
    // 既に同一 price なら no-op（冪等・二重変更防止）。
    if (item.price.id === newPriceId) return NextResponse.json({ ok: true, unchanged: true });

    await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, price: newPriceId }],
      proration_behavior: "create_prorations",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Stripe 失敗は 502（秘密情報は載せない）。org_billing は不変＝次の webhook で整合。
    const msg = e instanceof Error ? e.message : "Stripe API エラー";
    console.error("billing interval: Stripe 失敗", msg);
    return NextResponse.json({ error: `周期の変更に失敗しました: ${msg}` }, { status: 502 });
  }
}
