// ★夜間便 N7-4（裁定276・277・2026-09-18）: デモ org の手動リセット（POST・demo org のセッションからのみ）。
//   orgs.demo_reset_at から RESET_INTERVAL_MIN 分未満なら 429（残り分数）。lib/nox/demo/seed.ts の buildPayload（録画なし＝503）→
//   service role で demo_org_reset('all') を 1 回（8 秒超は 'wipe'→'load' の 2 回呼び）→ afterResetHooks（TODO の形だけ）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bizDateOf } from "@/lib/nox/biz-date";
import { afterResetHooks, buildPayload, RESET_INTERVAL_MIN, runDemoReset } from "@/lib/nox/demo/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { data: orgId } = await supabase.rpc("auth_org_id");
  if (typeof orgId !== "string" || !orgId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { data: org } = await admin.from("orgs").select("is_demo, demo_reset_at").eq("id", orgId).maybeSingle();
  if (org?.is_demo !== true) return NextResponse.json({ error: "デモ環境のみ実行できます" }, { status: 403 });
  if (org.demo_reset_at) {
    const elapsedMin = (Date.now() - Date.parse(org.demo_reset_at as string)) / 60_000;
    if (elapsedMin < RESET_INTERVAL_MIN) {
      const remainingMinutes = Math.max(1, Math.ceil(RESET_INTERVAL_MIN - elapsedMin));
      return NextResponse.json({ error: `初期化は ${remainingMinutes} 分後に実行できます`, remainingMinutes }, { status: 429 });
    }
  }
  const { data: store } = await admin.from("stores").select("settings_json").eq("org_id", orgId).order("name").limit(1).maybeSingle();
  const cutoff = ((store?.settings_json as Record<string, unknown> | null)?.biz_cutoff_hm as string | undefined) || "06:00";
  const bizDate = bizDateOf(new Date().toISOString(), cutoff);

  const built = await buildPayload(admin, orgId, bizDate);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: built.status });
  const r = await runDemoReset(admin, orgId, built.payload);
  if (!r.ok) { console.error(`demo reset: ${r.error}`); return NextResponse.json({ error: "初期化に失敗しました" }, { status: 500 }); }
  const hooks = await afterResetHooks(admin, orgId, bizDate);
  return NextResponse.json({ ok: true, mode: r.mode, bizDate, tables: built.tables, rows: built.rows, hooks });
}
