// ★運営コンソール 版 1（夜便 2026-11-20 N5）: requireOperator＝getUser → aal2（MFA）→ ops_operators（有効）。画面と /api/ops/* の全部で使う（二重の柵の 1 枚目・2 枚目は関数の中の ops_operator_ok）。
//   旗 MIG_0202A_APPLIED が false の間は、画面は 404・API は 404（0202a が本番に無い）。
// ★【D8】起票155 の 2（2026-11-25・旗 MIG_0209_APPLIED の後ろ）:
//   ①毎回、今のセッションが使えるかを見る（opsSessionStaleOf）＝認証アプリのリセットの記録（ops_operators.mfa_reset_at）より前にログインしたセッション・
//     aal2 なのに確認済みの認証アプリが今無い（Admin API の deleteFactor の後）・6 桁を確かめた後にできたアプリしか無い、は relogin（画面は /ops/login・API は 401）。
//     getUser の user.factors は毎回 Auth のサーバから読む（今の登録）・AMR（ログインの方法と時刻）は getAuthenticatorAssuranceLevel が返すこのセッションのもの。
//   ②管理者だけの画面と route（運営者の管理）＝役が ops_admin のときだけ（担当は画面 404・API 403 'forbidden (role)'）。役も毎回 ops_operators から読む。
import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mig0202aOn, mig0209On } from "@/lib/nox/rules-0175/flag";
import { opsApiStatusOf, opsGateOf, type OpsGate } from "./labels";
import { isOpsAdminRole, opsSessionStaleOf, type OpsAmr } from "./operators";

export type Operator = { authUserId: string; email: string; name: string; role: string; /** ★0209: 認証アプリのリセットを記録した日時（旗 false の間は null） */ mfaResetAt?: string | null };

async function operatorOf(authUserId: string): Promise<Operator | null> {
  const admin = createAdminClient();
  const cols = mig0209On() ? "auth_user_id, email, name, role, is_active, mfa_reset_at" : "auth_user_id, email, name, role, is_active";   // 0209 の列は旗 true の後だけ読む
  const { data: raw } = await admin.from("ops_operators").select(cols).eq("auth_user_id", authUserId).maybeSingle();
  const data = raw as { auth_user_id: string; email: string; name: string; role: string; is_active: boolean; mfa_reset_at?: string | null } | null;
  if (!data || data.is_active !== true) return null;
  return { authUserId: data.auth_user_id, email: data.email, name: data.name, role: data.role, mfaResetAt: data.mfa_reset_at ?? null };
}

/** 今の人の入口の状態（画面と API で同じ） */
export async function operatorGate(): Promise<{ gate: OpsGate; op: Operator | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { gate: "login", op: null };
  const op = await operatorOf(user.id);
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const currentLevel = aal?.currentLevel ?? null;
  const stale = mig0209On() && !!op
    ? opsSessionStaleOf({ aal: currentLevel, amr: (aal?.currentAuthenticationMethods ?? []) as readonly OpsAmr[], factors: user.factors ?? [], mfaResetAt: op.mfaResetAt ?? null })
    : false;
  return { gate: opsGateOf({ hasUser: true, isOperator: !!op, aal: currentLevel, stale }), op };
}

/** 画面用：通らなければ redirect／404（MFA の画面自身は allowMfa で aal1 を通す） */
export async function requireOperatorPage(opts: { allowMfa?: boolean } = {}): Promise<Operator> {
  if (!mig0202aOn()) notFound();
  const { gate, op } = await operatorGate();
  if (gate === "login") redirect("/ops/login");
  if (gate === "relogin") redirect("/ops/login?again=1");   // ★0209: 今のセッションは使わせない（MFA の画面も通さない）
  if (gate === "notfound") notFound();
  if (gate === "mfa" && !opts.allowMfa) redirect("/ops/mfa");
  return op!;
}

/** API 用：通れば運営者・通らなければ返す応答（401／404／403） */
export async function requireOperatorApi(): Promise<{ op: Operator; res: null } | { op: null; res: NextResponse }> {
  if (!mig0202aOn()) return { op: null, res: NextResponse.json({ error: "not found" }, { status: 404 }) };
  const { gate, op } = await operatorGate();
  const st = opsApiStatusOf(gate);
  if (st !== null || !op) return { op: null, res: NextResponse.json({ error: gate }, { status: st ?? 404 }) };
  return { op, res: null };
}

/** ★0209: 管理者だけの画面（運営者の管理）。旗 false と担当は 404（担当には画面があることを出さない） */
export async function requireOperatorAdminPage(): Promise<Operator> {
  if (!mig0209On()) notFound();
  const op = await requireOperatorPage();
  if (!isOpsAdminRole(op.role)) notFound();
  return op;
}

/** ★0209: 管理者だけの route（requireOperatorApi を通った後に呼ぶ）。旗 false は 404・担当は 403 'forbidden (role)' */
export function opsAdminApiRes(op: Operator): NextResponse | null {
  if (!mig0209On()) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!isOpsAdminRole(op.role)) return NextResponse.json({ error: "forbidden (role)" }, { status: 403 });
  return null;
}
