// ★0172（裁定380・便 P172・2026-10-16）: シフトの自動確定（15 分間隔）。店設定 shift_auto_confirm_hours（0172 ★3）が 1〜168 の店だけ、
//   送り返し（status 'proposed'）のまま updated_at がその時間より古い shifts を 'confirmed' にする（キャストが確認しないまま放置された分＝裁定380「自動確定は店設定キー」）。
//   起動＝pg_cron → pg_net → 本 route（GET＋Authorization: Bearer CRON_SECRET＝demo-reset と同型・URL は Vault の nox_demo_reset_url の置換＝cron_setup.md §6）。
//   書込＝service role の直 UPDATE（RPC shift_confirm_bulk は JWT 前提＝cron からは呼べない）＋店ごとに audit 'shift.auto_confirm'（audit_log_write_service・件数と id）。
//   0 件の店は何も書かない（audit も残さない）。失敗は console と戻りに残す。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoConfirmCutoffOf, autoConfirmHoursOf } from "@/lib/nox/shift/auto-confirm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("not configured", { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("unauthorized", { status: 401 });

  const admin = createAdminClient();
  const { data: stores, error } = await admin.from("stores").select("id, org_id, name, settings_json").order("name");
  if (error) { console.error(`cron shift-auto-confirm: stores 読取失敗 ${error.message}`); return new NextResponse("error", { status: 500 }); }
  const now = new Date();
  const results: { store: string; hours: number; confirmed: number; error?: string }[] = [];
  for (const s of stores ?? []) {
    const hours = autoConfirmHoursOf((s.settings_json ?? null) as Record<string, unknown> | null);
    const cutoff = autoConfirmCutoffOf(now, hours);
    if (!cutoff) continue;
    const { data: rows, error: eU } = await admin.from("shifts")
      .update({ status: "confirmed" })
      .eq("store_id", s.id as string).eq("status", "proposed").lt("updated_at", cutoff)
      .select("id");
    if (eU) { console.error(`cron shift-auto-confirm: ${s.name} ${eU.message}`); results.push({ store: s.name as string, hours, confirmed: 0, error: eU.message }); continue; }
    const ids = (rows ?? []).map((r) => r.id as string);
    if (ids.length > 0) {
      const { error: eA } = await admin.rpc("audit_log_write_service", {
        p_org_id: s.org_id as string, p_actor: null, p_action: "shift.auto_confirm", p_target: "shifts:bulk", p_before: null,
        p_after: { store_id: s.id, hours, cutoff, count: ids.length, ids }, p_store_id: s.id as string,
      });
      if (eA) console.error(`cron shift-auto-confirm: audit failed ${eA.message}`);
    }
    results.push({ store: s.name as string, hours, confirmed: ids.length });
  }
  return NextResponse.json({ ok: results.every((r) => !r.error), at: now.toISOString(), count: results.length, results });
}
