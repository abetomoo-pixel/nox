// ★夜間便 N7-4（裁定276-5・277・2026-09-18）→ ★裁定328 追補1 ①（便 D1・2026-10-02）: デモ org の日次リセット（毎日 06:05 JST）。
//   起動＝0163 の pg_cron → pg_net → 本 route（GET＋Authorization: Bearer CRON_SECRET・URL と秘密は Vault）。店ごとに 1 job（?org=<店コード>）・
//   30 分後の再試行 job（?retry=1＝その日の営業日にまだ reset されていない org だけ）。org 指定なし＝is_demo の全 org を名前順に。
//   ★vercel.json の crons には足さない（裁定276-5＝Hobby の上限 2 本）。手動起動は同ヘッダで GET。
//   失敗は audit 'demo.reset.failed'（audit_log_write_service・service）に残す＝再試行の材料（reset_design §4 ★3）。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bizDateOf } from "@/lib/nox/biz-date";
import { afterResetHooks, buildPayload, demoOrgName, isDemoStore, runDemoReset } from "@/lib/nox/demo/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("not configured", { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const onlyRaw = url.searchParams.get("org"); // 店コード（muse…nest）
  const retry = url.searchParams.get("retry") === "1";
  if (onlyRaw && !isDemoStore(onlyRaw)) return new NextResponse("bad org", { status: 400 });
  const only = onlyRaw && isDemoStore(onlyRaw) ? onlyRaw : null;

  const admin = createAdminClient();
  let qb = admin.from("orgs").select("id, name, demo_reset_at").eq("is_demo", true).order("name");
  if (only) qb = qb.eq("name", demoOrgName(only));
  const { data: orgs, error } = await qb;
  if (error) { console.error(`cron demo-reset: orgs 読取失敗 ${error.message}`); return new NextResponse("error", { status: 500 }); }
  const results: { org: string; ok: boolean; mode?: string; chunks?: number; skipped?: string; error?: string }[] = [];
  for (const o of orgs ?? []) {
    const orgId = o.id as string;
    const { data: store } = await admin.from("stores").select("settings_json").eq("org_id", orgId).order("name").limit(1).maybeSingle();
    const cutoff = ((store?.settings_json as Record<string, unknown> | null)?.biz_cutoff_hm as string | undefined) || "06:00";
    const bizDate = bizDateOf(new Date().toISOString(), cutoff);
    // 再試行＝その営業日に reset 済みの org は飛ばす（demo_reset_at の営業日が今日なら済み）
    if (retry && o.demo_reset_at && bizDateOf(new Date(o.demo_reset_at as string).toISOString(), cutoff) === bizDate) { results.push({ org: o.name as string, ok: true, skipped: "already reset today" }); continue; }
    const built = await buildPayload(admin, orgId, bizDate);
    if (!built.ok) { await markFailed(admin, orgId, built.error); results.push({ org: o.name as string, ok: false, error: built.error }); continue; }
    const r = await runDemoReset(admin, orgId, built.payload);
    if (!r.ok) { console.error(`cron demo-reset: ${o.name} ${r.error}`); await markFailed(admin, orgId, r.error); results.push({ org: o.name as string, ok: false, error: "reset failed" }); continue; }
    await afterResetHooks(admin, orgId, bizDate);
    results.push({ org: o.name as string, ok: true, mode: r.mode, chunks: r.chunks });
  }
  return NextResponse.json({ ok: results.every((r) => r.ok), count: results.length, retry, results });
}

/** 失敗の記録（audit 'demo.reset.failed'・service 専用 RPC・無ければ console のみ） */
async function markFailed(admin: ReturnType<typeof createAdminClient>, orgId: string, reason: string): Promise<void> {
  try {
    const { error } = await admin.rpc("audit_log_write_service", { p_org_id: orgId, p_actor: null, p_action: "demo.reset.failed", p_target: `orgs:${orgId}`, p_before: null, p_after: { reason: reason.slice(0, 200) }, p_store_id: null, p_reason: null });
    if (error) console.error(`cron demo-reset: audit failed ${error.message}`);
  } catch (e) { console.error(`cron demo-reset: audit ${e instanceof Error ? e.message : String(e)}`); }
}
