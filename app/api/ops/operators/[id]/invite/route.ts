// ★【D8】起票155 の 2（2026-11-25・旗 MIG_0209_APPLIED の後ろ）: 招待中の運営者に招待をもう一度送る（POST・管理者だけ）。
//   ops_operator_reinvite_logged（先に記録・受諾済みは 'op accepted'・止めた人は 'op stopped'）→ inviteUserByEmail（app/api/ops/orgs/[id]/invite と同じ型）。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { opsAdminApiRes, requireOperatorApi } from "@/lib/nox/ops/require-operator";
import { opsOperatorErrJa } from "@/lib/nox/ops/operators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireOperatorApi();
  if (g.res) return g.res;
  const ng = opsAdminApiRes(g.op);
  if (ng) return ng;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: opsOperatorErrJa("op not found") }, { status: 404 });
  const admin = createAdminClient();
  const { data: email, error } = await admin.rpc("ops_operator_reinvite_logged", { p_ops: g.op.authUserId, p_target: id });
  if (error || typeof email !== "string") return NextResponse.json({ error: opsOperatorErrJa(error?.message) }, { status: 409 });
  const origin = new URL(req.url).origin;
  const inv = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/auth/set-password`, data: { role: "operator" } });
  if (inv.error) return NextResponse.json({ error: "招待を送れませんでした（記録は残っています・時間をおいてもう一度）" }, { status: 502 });
  return NextResponse.json({ ok: true, email });
}
