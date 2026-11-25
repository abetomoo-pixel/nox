// ★【D8】起票155 の 2（2026-11-25・旗 MIG_0209_APPLIED の後ろ）: 運営者の役を変える（POST・管理者だけ）＝{ role: 'ops_admin' | 'ops_support' }。
//   自分の役は変えない（'op self'）・最後の管理者を担当にしない（'op last admin'＋DB の柵）。値は DB のまま・画面は 管理者／担当。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { opsAdminApiRes, requireOperatorApi } from "@/lib/nox/ops/require-operator";
import { isOpsRole, opsOperatorErrJa } from "@/lib/nox/ops/operators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireOperatorApi();
  if (g.res) return g.res;
  const ng = opsAdminApiRes(g.op);
  if (ng) return ng;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: opsOperatorErrJa("op not found") }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { role?: unknown };
  if (!isOpsRole(body.role)) return NextResponse.json({ error: opsOperatorErrJa("op bad role") }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.rpc("ops_operator_set_role", { p_ops: g.op.authUserId, p_target: id, p_role: body.role });
  if (error) return NextResponse.json({ error: opsOperatorErrJa(error.message) }, { status: 409 });
  return NextResponse.json({ ok: true, role: body.role });
}
