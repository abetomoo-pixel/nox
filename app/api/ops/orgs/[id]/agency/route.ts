// ★運営コンソール 版 1（夜便 2026-11-20 N5）: 経路（紹介コード）を入れる／直す／外す（POST {code: string|null, reason?}）＝ops_org_set_agency_code（監査は運営の監査だけ・Yuiba へは送らない）。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorApi } from "@/lib/nox/ops/require-operator";
import { opsErrJa } from "@/lib/nox/ops/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireOperatorApi();
  if (g.res) return g.res;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { code?: string | null; reason?: string };
  if (!("code" in body)) return NextResponse.json({ error: "紹介コードの値がありません" }, { status: 400 });   // 外すときも null を明示
  const code = body.code === null ? null : String(body.code ?? "");
  const { error } = await createAdminClient().rpc("ops_org_set_agency_code", { p_ops: g.op.authUserId, p_org_id: id, p_code: code === "" ? null : code, p_reason: body.reason ?? null });
  if (error) return NextResponse.json({ error: opsErrJa(error.message) }, { status: 409 });
  return NextResponse.json({ ok: true });
}
