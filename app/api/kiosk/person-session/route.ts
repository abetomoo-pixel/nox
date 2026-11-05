// ★便 E（2026-11-05・0196 用＝裁定448 B 方式）: キオスクの「スタッフでログイン（PIN）」＝端末の解除（kiosk_login／kiosk_unlock）の後に、その操作担当の本人 auth セッションを作る。
//   呼び手＝端末アカウントのセッション（app/kiosk の PIN の入口）。① 端末の uid を読む（client 申告は使わない）→ ② kiosk_person_claim（service_role＝束縛・有効な解除・役割 manager／staff を RPC が判定）
//   → ③ createSessionForAuthUser（LINE ログインと同じ magiclink→verifyOtp＝パスワードなし・cookie は @supabase/ssr が載せ替え）→ ④ cookie nox_kiosk_person（httpOnly・1 日）→ {ok, dest}。
//   端末のセッション（access／refresh）は client が localStorage に控えてから呼ぶ（M-49 の型）。MIG_0196_APPLIED が false の間は 409（入口も出さない）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionForAuthUser } from "@/lib/nox/line/server";
import { mig0196On } from "@/lib/nox/rules-0175/flag";
import { KIOSK_PERSON_COOKIE, KIOSK_PERSON_COOKIE_MAX_AGE_SEC, kioskPersonCookieValueOf, kioskPersonSessionAllowedOf } from "@/lib/nox/kiosk/person-session";

export async function POST(req: Request) {
  if (!mig0196On()) return NextResponse.json({ error: "not available" }, { status: 409 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let body: { device_fp?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const fp = typeof body.device_fp === "string" && body.device_fp.length > 0 && body.device_fp.length <= 200 ? body.device_fp : null;
  if (!fp) return NextResponse.json({ error: "bad device_fp" }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("kiosk_person_claim", { p_device_auth_user: user.id, p_device_fp: fp });
  if (error) {
    const m = error.message;
    const status = /forbidden/.test(m) ? 403 : /not bound|device bound|no session/.test(m) ? 409 : 500;
    return NextResponse.json({ error: m }, { status });
  }
  const j = (data ?? null) as { ok?: boolean; session_id?: string; auth_user_id?: string; membership_id?: string; role?: string; store_id?: string; device_id?: string; idle_minutes?: number } | null;
  if (!j?.ok || !j.session_id || !j.auth_user_id || !j.device_id || !kioskPersonSessionAllowedOf(j.role)) return NextResponse.json({ error: "claim failed" }, { status: 500 });
  const ok = await createSessionForAuthUser(admin, supabase, j.auth_user_id);
  if (!ok) { await admin.rpc("kiosk_person_end", { p_session_id: j.session_id, p_reason: "manual" }).then(() => undefined, () => undefined); return NextResponse.json({ error: "session failed" }, { status: 500 }); }
  const { data: u } = await admin.from("users").select("name").eq("auth_user_id", j.auth_user_id).maybeSingle();
  const res = NextResponse.json({ ok: true, dest: "/register", role: j.role, idle_minutes: j.idle_minutes ?? 10, name: (u?.name as string | null) ?? null });
  res.cookies.set(KIOSK_PERSON_COOKIE, kioskPersonCookieValueOf({ sessionId: j.session_id, deviceId: j.device_id, role: j.role }), {
    httpOnly: true, sameSite: "lax", secure: new URL(req.url).protocol === "https:", path: "/", maxAge: KIOSK_PERSON_COOKIE_MAX_AGE_SEC,
  });
  return res;
}
