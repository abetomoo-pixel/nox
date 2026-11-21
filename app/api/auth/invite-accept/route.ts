// ★便 OB-2 ⑧（2026-10-29）: 招待リンクで入った本人（オーナー）がログイン用パスワードを決める route＝POST {password}。
//   柵 A（裁定273-6・demo-guard dg(6-1)）: デモの auth ユーザー（env DEMO_USERS）とデモ org は 403＝共用パスワードを変えさせない。client は auth.updateUser を呼ばない（この route が admin.updateUserById）。
//   順序: ①セッション 401 ②入力 400（8〜72 字） ③デモ 403 ④admin.auth.admin.updateUserById（本人のみ・パスワードはレスポンスにもログにも出さない）。
// ★2026-11-21 夕（相談役 16:15 の 4）: 決めた後の行き先（dest）をサーバで決める＝運営者（ops_operators の有効な行）は /ops/login・それ以外は今までどおり /dashboard。
//   判定は本人のセッションの後だけ＝応答を受けるのは本人だけ（/login・/auth/forgot の応答は変えない＝運営者かどうかを外から見分けられない）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoGuardErr } from "@/lib/nox/demo/guard";
import { isDemoAuthUserId } from "@/lib/nox/demo/session";
import { invitePasswordErrorOf } from "@/lib/nox/people/invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  const pwErr = invitePasswordErrorOf(password, password);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });
  if (isDemoAuthUserId(process.env.DEMO_USERS, user.id)) return NextResponse.json({ error: "forbidden (demo)" }, { status: 403 });
  const { data: orgId } = await supabase.rpc("auth_org_id");
  if (orgId) { const demo = await demoGuardErr(orgId as string); if (demo) return NextResponse.json(demo.body, { status: demo.status }); }
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: op } = await admin.from("ops_operators").select("auth_user_id").eq("auth_user_id", user.id).eq("is_active", true).maybeSingle();
  return NextResponse.json({ ok: true, dest: op ? "/ops/login" : "/dashboard" });
}
