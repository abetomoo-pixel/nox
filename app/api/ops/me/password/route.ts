// ★【D8】起票155 の 2（2026-11-25・旗 MIG_0209_APPLIED の後ろ）: 自分のパスワードを変える（POST・管理者も担当も・本人だけ）＝{ current, password, password2 }。
//   順序：①requireOperatorApi（aal2 の運営者）②旗 ③欄の検査（8〜72 字・2 回一致・今と同じは不可）④今のパスワードを確かめる（使い捨ての client＝保存しない・
//   signInWithPassword が通ったら、その使い捨てのセッションだけ signOut（scope local＝今の画面のセッションは切らない））⑤ops_operator_password_logged（先に記録・via 'self'）
//   ⑥admin.auth.admin.updateUserById（本人だけ）。client は auth.updateUser を呼ばない（invite-accept と同じ考え）。パスワードは応答にもログにも出さない。
import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorApi } from "@/lib/nox/ops/require-operator";
import { mig0209On } from "@/lib/nox/rules-0175/flag";
import { OPS_PASSWORD_WRONG, opsOperatorErrJa, opsPasswordChangeErrOf } from "@/lib/nox/ops/operators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await requireOperatorApi();
  if (g.res) return g.res;
  if (!mig0209On()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { current?: unknown; password?: unknown; password2?: unknown };
  const f = { current: typeof body.current === "string" ? body.current : "", password: typeof body.password === "string" ? body.password : "", password2: typeof body.password2 === "string" ? body.password2 : "" };
  const fe = opsPasswordChangeErrOf(f);
  if (fe) return NextResponse.json({ error: fe }, { status: 400 });
  // 今のパスワードを確かめる（使い捨て＝cookie にも保存しない）
  const probe = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const si = await probe.auth.signInWithPassword({ email: g.op.email, password: f.current });
  if (si.error || !si.data.user || si.data.user.id !== g.op.authUserId) return NextResponse.json({ error: OPS_PASSWORD_WRONG }, { status: 400 });
  await probe.auth.signOut({ scope: "local" }).catch(() => undefined);   // 確かめのためにできたセッションだけ消す
  const admin = createAdminClient();
  const { error: le } = await admin.rpc("ops_operator_password_logged", { p_ops: g.op.authUserId, p_via: "self" });   // 先に記録
  if (le) return NextResponse.json({ error: opsOperatorErrJa(le.message) }, { status: 409 });
  const { error } = await admin.auth.admin.updateUserById(g.op.authUserId, { password: f.password });
  if (error) return NextResponse.json({ error: "パスワードを変えられませんでした（記録は残っています・時間をおいてもう一度）" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
