// 印刷ジョブ簡易照会（F4b-3・owner/manager）。print_jobs/printer_config は deny-all のため
// ★211（裁定519-i・0247 と同じ線・2026-11-28）: printer_enabled はレジの許可のあるスタッフ・段階 2（会計まで）のキャスト・店の端末の腕（操作中の人が段階 2 未満のキャストでない）にも答える（jobs は空）。直近ジョブの表は今までどおり owner/manager だけ。
// この route が管理用の唯一の読み口（kiosk provision GET と同型）。
// 返すのは表示用の最小列のみ＝★print_token / printer_serial / store_token は返さない。
// レジは printer_enabled でボタンの出し分け（fail-closed）・master は直近ジョブ表に使う。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { assertNotDemo } from "@/lib/nox/demo/guard"; // ★N7-1（裁定273-6）: デモ org は 403
import { castRegisterLevelOf } from "@/lib/nox/rules-0175/cast-register"; // ★211: 店のレジ使用の段階（0 OFF／1 注文のみ／2 会計まで）
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 20;

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    const [{ data: role }, { data: authOrg }, { data: myStoreId }, { data: staffReg }, { data: castReg }, { data: kioskStore }, { data: kioskOp }, { data: kioskOrg }] = await Promise.all([
      supabase.rpc("auth_role"), supabase.rpc("auth_org_id"), supabase.rpc("auth_store_id"),
      supabase.rpc("auth_staff_can_register"), supabase.rpc("auth_cast_can_register"),
      supabase.rpc("auth_kiosk_register_store_id"), supabase.rpc("auth_kiosk_operator"), supabase.rpc("auth_kiosk_org_id"),
    ]);
    const admin = createAdminClient();
    const isMgr = role === "owner" || role === "manager";
    const kioskArm = !role && typeof kioskStore === "string" && typeof kioskOp === "string";
    const levelStore = role === "cast" ? (myStoreId as string | null) : kioskArm ? (kioskStore as string) : null;   // 段階を読む店
    const level = levelStore ? castRegisterLevelOf(((await admin.from("stores").select("settings_json").eq("id", levelStore).maybeSingle()).data?.settings_json ?? null) as Record<string, unknown> | null) : 0;
    const opIsCast = kioskArm ? ((await admin.from("memberships").select("role").eq("user_id", kioskOp as string).eq("store_id", kioskStore as string).eq("is_active", true).maybeSingle()).data?.role === "cast") : false;
    // ★211（裁定519-i・0247 と同じ線）: キャスト（本人のログイン・端末で操作中）は段階 2（会計まで）以上だけ
    const canPrint = isMgr || (role === "staff" && staffReg === true) || (role === "cast" && castReg === true && level >= 2) || (kioskArm && (!opIsCast || level >= 2));
    const orgId = ((authOrg as string | null) ?? (kioskArm ? (kioskOrg as string | null) : null));
    if (!canPrint || !orgId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const demo = await assertNotDemo(orgId as string); if (demo) return demo; // ★N7-1: デモ org は印刷ジョブ不可（poll／result は上流で止まる）

    // store はサーバ導出が既定。owner のみ query で org 内の他店を指定可（manager は自店固定）。
    const url = new URL(req.url);
    const qs = url.searchParams.get("store_id");
    let storeId = kioskArm ? (kioskStore as string) : ((myStoreId as string | null) ?? null); // ★211: 端末の腕は端末の店
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
      jobs: isMgr ? (jobs ?? []) : [], // ★211: スタッフ・キャスト・端末の腕には直近ジョブの表を返さない
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
