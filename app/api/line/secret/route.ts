// ★便 ON-3（2026-10-26・0176 ★1＝401）: LINE のシークレット（channel_secret／access_token）を Vault へ＝set_line_secret（service_role だけ）を、owner／自店 manager を検査してから admin client で呼ぶ。
//   柵＝①セッション 401 ②入力 400 ③owner＝org 内の店・manager＝自店 ④デモ org 403（LINE 設定はデモ内で完結しない＝裁定273-6 の分類 A）。値はレスポンスにもログにも出さない。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoGuardErr } from "@/lib/nox/demo/guard";
import { LINE_SECRET_KINDS } from "@/lib/nox/line/liff-endpoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { storeId?: unknown; kind?: unknown; secret?: unknown };
  const storeId = typeof body.storeId === "string" ? body.storeId : "";
  const kind = typeof body.kind === "string" && (LINE_SECRET_KINDS as readonly string[]).includes(body.kind) ? body.kind : "";
  const secret = typeof body.secret === "string" ? body.secret.trim() : "";
  if (!storeId || !kind) return NextResponse.json({ error: "bad input" }, { status: 400 });
  if (!secret || secret.length > 1000) return NextResponse.json({ error: "bad secret" }, { status: 400 });

  const [{ data: authRole }, { data: authStoreId }, { data: orgId }] = await Promise.all([supabase.rpc("auth_role"), supabase.rpc("auth_store_id"), supabase.rpc("auth_org_id")]);
  if (!orgId || (authRole !== "owner" && authRole !== "manager")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (authRole === "manager" && storeId !== authStoreId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const demo = await demoGuardErr(orgId as string); if (demo) return NextResponse.json(demo.body, { status: demo.status });
  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("org_id").eq("id", storeId).maybeSingle();
  if (!store || store.org_id !== orgId) return NextResponse.json({ error: "forbidden store" }, { status: 403 });

  const { error } = await admin.rpc("set_line_secret", { p_store_id: storeId, p_kind: kind, p_secret: secret });
  if (error) { console.error(`line secret: save failed (${kind})`); return NextResponse.json({ error: "save failed" }, { status: 500 }); }
  return NextResponse.json({ ok: true, kind });
}
