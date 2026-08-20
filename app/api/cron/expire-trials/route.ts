// DB トライアル期限切れの表示用 status 整備（設計書 v1 §4・実装順序④）。
// 起動＝Vercel Cron（vercel.json・`0 18 * * *`＝JST 3:00）。
// 保護＝Authorization: Bearer CRON_SECRET（Vercel は CRON_SECRET env があると同ヘッダを自動付与）。
//
// ★NOX 適応（donor からの差分）: donor は BANZEN 0071 の service 専用 RPC `expire_trials` を呼ぶが、
//   **NOX に同 RPC は無い**（mig0087 は述語2本のみ・本レーンの DB 変更は mig0100 だけ＝設計書 §8）。
//   よって同じ意味論を admin クライアントの直 update で実装する。
//
// ★これは「表示用」であって判定ではない（設計書 §4「writable 判定は述語一本＝非依存」）。
//   billing_writable_of は `status='trialing' かつ trial_ends_at > now()` を**述語内で**見るため
//   （mig0087 B・行 55-56）、本 cron が動かなくても期限切れトライアルは既に writable=false。
//   本 cron は org_billing.status の見た目を inactive へ揃えるだけ＝落ちても課金判定は無傷。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("not configured", { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  // trialing のまま期限を過ぎた org を inactive へ。Stripe 契約が立った org は upsert 時に
  // trial_ends_at=null 固定（lib/billing/sync.ts）なので、この条件に自然に掛からない。
  const { data, error } = await admin
    .from("org_billing")
    .update({ status: "inactive", updated_at: new Date().toISOString() })
    .eq("status", "trialing")
    .lt("trial_ends_at", new Date().toISOString())
    .select("org_id");
  if (error) {
    console.error(`cron expire-trials: 更新失敗 ${error.message}`);
    return new NextResponse("error", { status: 500 });
  }

  const expired = data?.length ?? 0;
  console.log(`cron expire-trials: ${expired} org(s) downgraded`);
  return NextResponse.json({ ok: true, expired });
}
