// ★夜間便 N7-4（裁定276-5・277・2026-09-18）: デモ org の日次リセット（毎朝 5 時 JST 想定）。
//   保護＝既存 cron と同じ Authorization: Bearer CRON_SECRET。orgs.is_demo=true の org を名前順に 1 つずつ demo_org_reset（seed.ts 共用）。
//   ★vercel.json の crons には足さない（裁定276-5＝Hobby の上限 2 本・Pro 移行後に追加）。手動起動は同ヘッダで GET。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bizDateOf } from "@/lib/nox/biz-date";
import { afterResetHooks, buildPayload, runDemoReset } from "@/lib/nox/demo/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("not configured", { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  const { data: orgs, error } = await admin.from("orgs").select("id, name").eq("is_demo", true).order("name");
  if (error) { console.error(`cron demo-reset: orgs 読取失敗 ${error.message}`); return new NextResponse("error", { status: 500 }); }
  const results: { org: string; ok: boolean; mode?: string; error?: string }[] = [];
  for (const o of orgs ?? []) {
    const orgId = o.id as string;
    const { data: store } = await admin.from("stores").select("settings_json").eq("org_id", orgId).order("name").limit(1).maybeSingle();
    const cutoff = ((store?.settings_json as Record<string, unknown> | null)?.biz_cutoff_hm as string | undefined) || "06:00";
    const bizDate = bizDateOf(new Date().toISOString(), cutoff);
    const built = await buildPayload(admin, orgId, bizDate);
    if (!built.ok) { results.push({ org: o.name as string, ok: false, error: built.error }); continue; }
    const r = await runDemoReset(admin, orgId, built.payload);
    if (!r.ok) { console.error(`cron demo-reset: ${o.name} ${r.error}`); results.push({ org: o.name as string, ok: false, error: "reset failed" }); continue; }
    await afterResetHooks(admin, orgId, bizDate);
    results.push({ org: o.name as string, ok: true, mode: r.mode });
  }
  return NextResponse.json({ ok: true, count: results.length, results });
}
