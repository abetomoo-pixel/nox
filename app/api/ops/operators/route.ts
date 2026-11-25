// ★【D8】起票155 の 2（2026-11-25・旗 MIG_0209_APPLIED の後ろ）: 運営者を足す（POST・管理者だけ）＝招待 → ops_operator_add。
//   requireOperatorApi（getUser → ops_operators → aal2）→ 役（管理者だけ）→ 欄の検査（役は必ず選ぶ）→ 店のユーザー・運営者に同じメールがあれば止める →
//   招待（inviteUserByEmail・件名は今の招待のテンプレのまま）→ ops_operator_add（関数の中でも管理者と auth のメールの一致を確かめる）→ 失敗したら今回できた auth だけ消す（app/api/ops/orgs と同じ型）。
//   招待の後の流れ＝/auth/set-password → invite-accept（運営者は /ops/login へ）→ /ops/mfa で認証アプリを登録。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { opsAdminApiRes, requireOperatorApi } from "@/lib/nox/ops/require-operator";
import { newOperatorFormErrOf, opsOperatorErrJa, type NewOperatorForm } from "@/lib/nox/ops/operators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await requireOperatorApi();
  if (g.res) return g.res;
  const ng = opsAdminApiRes(g.op);
  if (ng) return ng;
  const body = (await req.json().catch(() => ({}))) as Partial<NewOperatorForm>;
  const f: NewOperatorForm = { email: String(body.email ?? "").trim().toLowerCase(), name: String(body.name ?? "").trim(), role: String(body.role ?? "") };
  const fe = newOperatorFormErrOf(f);
  if (fe) return NextResponse.json({ error: fe }, { status: 400 });
  const admin = createAdminClient();
  const { data: dupU } = await admin.from("users").select("id").ilike("email", f.email).limit(1);
  if (dupU && dupU.length) return NextResponse.json({ error: opsOperatorErrJa("op store user") }, { status: 409 });
  const { data: dupO } = await admin.from("ops_operators").select("auth_user_id").ilike("email", f.email).limit(1);
  if (dupO && dupO.length) return NextResponse.json({ error: opsOperatorErrJa("op dup") }, { status: 409 });

  const t0 = Date.now();
  const origin = new URL(req.url).origin;
  const inv = await admin.auth.admin.inviteUserByEmail(f.email, { redirectTo: `${origin}/auth/set-password`, data: { role: "operator" } });
  if (inv.error || !inv.data.user) {
    const already = /already|exists|registered/i.test(inv.error?.message ?? "");
    return NextResponse.json({ error: already ? "このメールは以前の作成の途中で残っています（管理者が Supabase で確かめてください）" : opsOperatorErrJa("op bad auth") }, { status: already ? 409 : 502 });
  }
  const authUser = inv.data.user;
  const fresh = Date.parse(authUser.created_at) >= t0 - 5_000;   // 今回の招待で新しくできた auth のユーザー
  const { data, error } = await admin.rpc("ops_operator_add", { p_ops: g.op.authUserId, p_auth_user_id: authUser.id, p_email: f.email, p_name: f.name, p_role: f.role });
  if (error) {
    if (fresh) await admin.auth.admin.deleteUser(authUser.id).catch(() => undefined);   // 足せなかった＝今回できた auth だけ消す（孤児を残さない）
    return NextResponse.json({ error: opsOperatorErrJa(error.message) }, { status: 409 });
  }
  const j = data as { auth_user_id: string; email: string; role: string };
  return NextResponse.json({ ok: true, id: j.auth_user_id, email: j.email });
}
