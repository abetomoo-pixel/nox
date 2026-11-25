// ★0211 の便（相談役 11/25 D1）: 本人がパスワードを変える（POST { current, next }）＝初回の変更（初期パスワードで入った人）と、メール無しの人がいつでも変える道。
//   柵＝①セッション 401 ②入力 400 ③デモ 403（デモの auth とデモ org＝共用のパスワードを変えさせない）④今のパスワードを、cookie を書かない別のクライアントの signInWithPassword で確かめる（違えば 400）
//   ⑤admin.updateUserById（本人だけ・新しいパスワードと app_metadata.must_change_password=false を同じ 1 回）。パスワードはレスポンスにもログにも出さない。本人の変更は DB の監査に残さない（相談役の決め）。
import { NextResponse } from "next/server";
import { createClient as createJsClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoGuardErr } from "@/lib/nox/demo/guard";
import { isDemoAuthUserId } from "@/lib/nox/demo/session";
import { MUST_CHANGE_CLEAR, newPasswordErrOf } from "@/lib/nox/auth/must-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { current?: unknown; next?: unknown };
  const current = typeof body.current === "string" ? body.current : "";
  const next = typeof body.next === "string" ? body.next : "";
  const v = newPasswordErrOf(current, next, next);
  if (v) return NextResponse.json({ error: v }, { status: 400 });
  if (isDemoAuthUserId(process.env.DEMO_USERS, user.id)) return NextResponse.json({ error: "forbidden (demo)" }, { status: 403 });
  const { data: orgId } = await supabase.rpc("auth_org_id");
  if (orgId) { const demo = await demoGuardErr(orgId as string); if (demo) return NextResponse.json(demo.body, { status: demo.status }); }
  // 今のパスワードの確かめ＝cookie を持たない別のクライアント（本人のセッションには触れない）
  const probe = createJsClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: eCur } = await probe.auth.signInWithPassword({ email: user.email, password: current });
  if (eCur) return NextResponse.json({ error: "今のパスワードが違います" }, { status: 400 });
  await probe.auth.signOut({ scope: "local" }).catch(() => undefined); // local だけ（既定の global は本人のほかのセッションも切る）
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, { password: next, app_metadata: MUST_CHANGE_CLEAR }); // GoTrue は app_metadata を足し合わせる（provider などは消えない）
  if (error) return NextResponse.json({ error: "パスワードを変えられませんでした（時間をおいてもう一度）" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
