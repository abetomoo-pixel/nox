// 印刷ジョブ簡易照会（F4b-3・owner/manager）。print_jobs/printer_config は deny-all のため
// この route が管理用の唯一の読み口（kiosk provision GET と同型）。
// 返すのは表示用の最小列のみ＝★print_token / printer_serial / store_token は返さない。
// レジは printer_enabled でボタンの出し分け（fail-closed）・master は直近ジョブ表に使う。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 20;

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    const [{ data: role }, { data: orgId }, { data: myStoreId }] = await Promise.all([
      supabase.rpc("auth_role"),
      supabase.rpc("auth_org_id"),
      supabase.rpc("auth_store_id"),
    ]);
    if ((role !== "owner" && role !== "manager") || !orgId)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });

    // store はサーバ導出が既定。owner のみ query で org 内の他店を指定可（manager は自店固定）。
    const url = new URL(req.url);
    const qs = url.searchParams.get("store_id");
    let storeId = (myStoreId as string | null) ?? null;
    const admin = createAdminClient();
    if (qs && UUID_RE.test(qs)) {
      if (role !== "owner" && qs !== storeId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const { data: st } = await admin.from("stores").select("org_id").eq("id", qs).single();
      if (!st || st.org_id !== orgId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      storeId = qs;
    }
    if (!storeId) return NextResponse.json({ error: "no store" }, { status: 400 });

    const [{ data: cfg }, { data: jobs, error: eJobs }] = await Promise.all([
      admin.from("printer_config").select("printer_enabled").eq("store_id", storeId).maybeSingle(),
      admin.from("print_jobs")
        .select("id, check_id, pay_group, status, is_reprint, error_code, created_at, printed_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(LIMIT),
    ]);
    if (eJobs) return NextResponse.json({ error: eJobs.message }, { status: 500 });
    return NextResponse.json({
      printer_enabled: cfg?.printer_enabled === true,
      jobs: jobs ?? [],
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
