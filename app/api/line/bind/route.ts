// ★便 ON-3（2026-10-26・0176 ★1＝401 紐付け）: 招待リンク（?t=<token>&m=bind）から＝id_token を確かめ → bind_line（service_role＝未使用・期限内・同じ LINE が org に無い → line_links 1 行＋使用済み）→ セッション。
//   セッション無し（トークン＋id_token が信頼の境目）。'line already linked'＝409（この LINE は別の人に紐付いている）。cast で user_id が無い（未招待）＝409 no_login（LINE からの初回作成は 0182 起草）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionForAuthUser, verifyLineIdToken } from "@/lib/nox/line/server";
import { LINE_STORE_COOKIE, UUID_RE, authUserOfSubject, lineStoreOf, lineStoreCookieOptions } from "@/lib/nox/line/subject";
import { INVITE_TOKEN_RE } from "@/lib/nox/people/invite";
import { tokenHashOf } from "@/lib/nox/people/invite-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { storeId?: unknown; idToken?: unknown; token?: unknown };
  const storeId = typeof body.storeId === "string" && UUID_RE.test(body.storeId) ? body.storeId : "";
  const idToken = typeof body.idToken === "string" ? body.idToken : "";
  const token = typeof body.token === "string" && INVITE_TOKEN_RE.test(body.token) ? body.token : "";
  if (!storeId || !idToken || !token) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const admin = createAdminClient();
  const store = await lineStoreOf(admin, storeId);
  if (!store || !store.config.login_channel_id) return NextResponse.json({ error: "line not configured" }, { status: 503 });
  const v = await verifyLineIdToken(idToken, store.config.login_channel_id);
  if (!v) return NextResponse.json({ error: "bad id_token" }, { status: 401 });
  const { data, error } = await admin.rpc("bind_line", { p_token_hash: tokenHashOf(token), p_line_user_id: v.sub });
  if (error) {
    const m = error.message;
    return NextResponse.json({ error: /already linked/.test(m) ? "line already linked" : /bad token/.test(m) ? "bad token" : "bind failed" }, { status: /already linked/.test(m) ? 409 : /bad token/.test(m) ? 410 : 500 });
  }
  const r = (data ?? {}) as { subject_kind?: string; subject_id?: string; org_id?: string };
  if (!r.subject_kind || !r.subject_id || r.org_id !== store.orgId) return NextResponse.json({ error: "bind failed" }, { status: 500 });
  const au = await authUserOfSubject(admin, r.subject_kind as "cast" | "membership", r.subject_id);
  if ("error" in au) return NextResponse.json({ ok: true, linked: true, error: au.error }, { status: 409 }); // 紐付けは済み・ログインは招待待ち
  const supabase = await createClient();
  if (!(await createSessionForAuthUser(admin, supabase, au.authUserId))) return NextResponse.json({ error: "session failed" }, { status: 500 });
  const res = NextResponse.json({ ok: true, linked: true, dest: au.dest });
  res.cookies.set(LINE_STORE_COOKIE, storeId, lineStoreCookieOptions(new URL(req.url).protocol === "https:"));
  return res;
}
