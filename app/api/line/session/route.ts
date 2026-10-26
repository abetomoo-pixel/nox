// ★便 ON-3（2026-10-26・0176 ★1＝401 LIFF ログイン）: LINE でログイン＝LIFF の id_token を LINE で確かめ（aud＝店のログインチャネル ID）→ line_links（org × line_user_id）→ subject → Auth ユーザー → セッション（magiclink をサーバ内で消費）。
//   セッション無し（id_token が信頼の境目）。紐付きが無ければ 404（LIFF 側が「お店から受け取ったリンクで紐付けてください」）。cookie nox_line_store（再ログインの店・400 日）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionForAuthUser, verifyLineIdToken } from "@/lib/nox/line/server";
import { LINE_STORE_COOKIE, UUID_RE, authUserOfSubject, lineStoreOf, lineStoreCookieOptions } from "@/lib/nox/line/subject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { storeId?: unknown; idToken?: unknown };
  const storeId = typeof body.storeId === "string" && UUID_RE.test(body.storeId) ? body.storeId : "";
  const idToken = typeof body.idToken === "string" ? body.idToken : "";
  if (!storeId || !idToken) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const admin = createAdminClient();
  const store = await lineStoreOf(admin, storeId);
  if (!store || !store.config.login_channel_id) return NextResponse.json({ error: "line not configured" }, { status: 503 });
  const v = await verifyLineIdToken(idToken, store.config.login_channel_id);
  if (!v) return NextResponse.json({ error: "bad id_token" }, { status: 401 });
  const { data: link } = await admin.from("line_links").select("subject_kind, subject_id").eq("org_id", store.orgId).eq("line_user_id", v.sub).maybeSingle();
  if (!link) return NextResponse.json({ error: "not linked" }, { status: 404 });
  const au = await authUserOfSubject(admin, link.subject_kind as "cast" | "membership", link.subject_id as string);
  if ("error" in au) return NextResponse.json({ error: au.error }, { status: au.error === "no_login" ? 409 : 404 });
  const supabase = await createClient();
  if (!(await createSessionForAuthUser(admin, supabase, au.authUserId))) return NextResponse.json({ error: "session failed" }, { status: 500 });
  const res = NextResponse.json({ ok: true, dest: au.dest });
  res.cookies.set(LINE_STORE_COOKIE, storeId, lineStoreCookieOptions(new URL(req.url).protocol === "https:"));
  return res;
}
