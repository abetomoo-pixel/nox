// ★運営コンソール 版 1（夜便 2026-11-20 N5）: 導入完了にする（POST）＝ops_onboarding_set(…, 'done')。完了から導入中には戻さない（関数が 'cannot reopen'＝相談役 18:05 ①）。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorApi } from "@/lib/nox/ops/require-operator";
import { opsErrJa } from "@/lib/nox/ops/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireOperatorApi();
  if (g.res) return g.res;
  const { id } = await ctx.params;
  const { error } = await createAdminClient().rpc("ops_onboarding_set", { p_ops: g.op.authUserId, p_org_id: id, p_state: "done" });
  if (error) return NextResponse.json({ error: opsErrJa(error.message) }, { status: 409 });
  return NextResponse.json({ ok: true });
}
