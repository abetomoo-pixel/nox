// ★便 ON-3（2026-10-26・0176 ★5 (b)）: 希望の締切（wish_deadline）を過ぎた募集中（open）の期間を配置中（closed）へ＝shift_periods_auto_close（service_role 専用 RPC・audit は org ごと）。
//   起動＝pg_cron → pg_net → 本 route（GET＋Authorization: Bearer CRON_SECRET＝shift-auto-confirm と同型・毎日 JST 06:10 の見込み＝cron の登録 SQL は docs/demo/cron_shift_periods_close.sql＝Agoora 手貼り）。
//   表示の実効段（effectiveStageOf＝period-stage.ts）は従来どおり＝DB の status が追いつく形。0 件なら何も書かない。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("not configured", { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("unauthorized", { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("shift_periods_auto_close");
  if (error) { console.error(`cron shift-periods-close: ${error.message}`); return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); }
  return NextResponse.json({ ok: true, at: new Date().toISOString(), closed: typeof data === "number" ? data : Number(data ?? 0) });
}
