// ★2026-11-18 夜（相談役 ⑤・0201q の後）: LINE のリッチメニュー＝ensure（無ければ作る＝友だち全員の既定）／rebuild（作り直す）／remove（外す）。
//   柵＝①セッション 401 ②入力 400 ③owner＝org 内の店・manager＝自店（secret の route と同じ） ④デモ org 403 ⑤フラグ MIG_0201Q_APPLIED が false なら 404。
//   アクセストークンは Vault（admin の get_line_secret）からだけ読む＝レスポンスにもログにも出さない。メニューの ID の保存は利用者の client で set_store_line_extra（権限・課金ゲート・監査は RPC）。
//   メニューの失敗は設定の保存を止めない（画面は理由を 1 行で出す）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoGuardErr } from "@/lib/nox/demo/guard";
import { getLineSecret } from "@/lib/nox/line/server";
import { RICHMENU_ACTIONS, RICHMENU_ID_RE, type RichMenuAction } from "@/lib/nox/line/richmenu";
import { createDefaultRichMenu, removeRichMenu, richMenuExists } from "@/lib/nox/line/richmenu-server";
import { mig0201qOn } from "@/lib/nox/rules-0175/flag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!mig0201qOn()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { storeId?: unknown; action?: unknown };
  const storeId = typeof body.storeId === "string" ? body.storeId : "";
  const action = typeof body.action === "string" && (RICHMENU_ACTIONS as readonly string[]).includes(body.action) ? (body.action as RichMenuAction) : null;
  if (!storeId || !action) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const [{ data: authRole }, { data: authStoreId }, { data: orgId }] = await Promise.all([supabase.rpc("auth_role"), supabase.rpc("auth_store_id"), supabase.rpc("auth_org_id")]);
  if (!orgId || (authRole !== "owner" && authRole !== "manager")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (authRole === "manager" && storeId !== authStoreId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const demo = await demoGuardErr(orgId as string); if (demo) return NextResponse.json(demo.body, { status: demo.status });
  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("org_id, line_config").eq("id", storeId).maybeSingle();
  if (!store || store.org_id !== orgId) return NextResponse.json({ error: "forbidden store" }, { status: 403 });
  const cfg = (store.line_config ?? {}) as { liff_id?: string | null; richmenu_id_default?: string | null };
  const cur = cfg.richmenu_id_default && RICHMENU_ID_RE.test(cfg.richmenu_id_default) ? cfg.richmenu_id_default : null;

  const token = await getLineSecret(admin, storeId, "access_token");
  if (!token) return NextResponse.json({ ok: false, reason: "no_token" });
  const save = async (id: string | null): Promise<boolean> => {
    const { error } = await supabase.rpc("set_store_line_extra", { p_store_id: storeId, p_patch: { richmenu_id_default: id } });
    if (error) console.error(`line richmenu: save failed ${error.message}`);
    return !error;
  };

  if (action === "remove") {
    const r = await removeRichMenu(token, cur);
    if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason, detail: r.detail });
    if (cur && !(await save(null))) return NextResponse.json({ ok: false, reason: "save_failed" });
    return NextResponse.json({ ok: true, status: "removed" });
  }
  if (action === "ensure" && cur && (await richMenuExists(token, cur)) === true) return NextResponse.json({ ok: true, status: "exists" });
  if (!cfg.liff_id) return NextResponse.json({ ok: false, reason: "no_liff" });
  if (action === "rebuild" && cur) { const r = await removeRichMenu(token, cur); if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason, detail: r.detail }); }
  const made = await createDefaultRichMenu(token, cfg.liff_id);
  if (!made.ok) return NextResponse.json({ ok: false, reason: made.reason, detail: made.detail });
  if (!(await save(made.id))) { await removeRichMenu(token, made.id); return NextResponse.json({ ok: false, reason: "save_failed" }); }
  return NextResponse.json({ ok: true, status: "created" });
}
