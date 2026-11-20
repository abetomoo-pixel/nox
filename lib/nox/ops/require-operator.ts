// ★運営コンソール 版 1（夜便 2026-11-20 N5）: requireOperator＝getUser → aal2（MFA）→ ops_operators（有効）。画面と /api/ops/* の全部で使う（二重の柵の 1 枚目・2 枚目は関数の中の ops_operator_ok）。
//   旗 MIG_0202A_APPLIED が false の間は、画面は 404・API は 404（0202a が本番に無い）。
import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mig0202aOn } from "@/lib/nox/rules-0175/flag";
import { opsApiStatusOf, opsGateOf, type OpsGate } from "./labels";

export type Operator = { authUserId: string; email: string; name: string; role: string };

async function operatorOf(authUserId: string): Promise<Operator | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("ops_operators").select("auth_user_id, email, name, role, is_active").eq("auth_user_id", authUserId).maybeSingle();
  if (!data || data.is_active !== true) return null;
  return { authUserId: data.auth_user_id as string, email: data.email as string, name: data.name as string, role: data.role as string };
}

/** 今の人の入口の状態（画面と API で同じ） */
export async function operatorGate(): Promise<{ gate: OpsGate; op: Operator | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { gate: "login", op: null };
  const op = await operatorOf(user.id);
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return { gate: opsGateOf({ hasUser: true, isOperator: !!op, aal: aal?.currentLevel ?? null }), op };
}

/** 画面用：通らなければ redirect／404（MFA の画面自身は allowMfa で aal1 を通す） */
export async function requireOperatorPage(opts: { allowMfa?: boolean } = {}): Promise<Operator> {
  if (!mig0202aOn()) notFound();
  const { gate, op } = await operatorGate();
  if (gate === "login") redirect("/ops/login");
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
