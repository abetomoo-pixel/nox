// ★【D8】起票155 の 2（2026-11-25・旗 MIG_0209_APPLIED の後ろ）: 運営者を止める・戻す（POST・管理者だけ）＝{ active: boolean, reason?: string }。
//   active は boolean を必ず（原則 7＝無ければ 400）・理由は任意（200 字まで）。自分と最後の管理者は関数が止める（'op self'・'op last admin'＋DB の柵）。
//   止めた人の auth のユーザーは ban しない（requireOperator が毎回 is_active を見る＝次の画面と API で 404・関数は forbidden）。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { opsAdminApiRes, requireOperatorApi } from "@/lib/nox/ops/require-operator";
import { opsOperatorErrJa, opsReasonErrOf } from "@/lib/nox/ops/operators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireOperatorApi();
  if (g.res) return g.res;
  const ng = opsAdminApiRes(g.op);
  if (ng) return ng;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: opsOperatorErrJa("op not found") }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { active?: unknown; reason?: unknown };
  if (typeof body.active !== "boolean") return NextResponse.json({ error: opsOperatorErrJa("op bad active") }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason : "";
  const re = opsReasonErrOf(reason, false);
  if (re) return NextResponse.json({ error: re }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.rpc("ops_operator_set_active", { p_ops: g.op.authUserId, p_target: id, p_active: body.active, p_reason: reason.trim() || null });
  if (error) return NextResponse.json({ error: opsOperatorErrJa(error.message) }, { status: 409 });
  return NextResponse.json({ ok: true, active: body.active });
}
