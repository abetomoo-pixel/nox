// ★運営コンソール 版 1（夜便 2026-11-20 N5）: 未受諾のオーナーに招待をもう一度送る（POST）。ops_invite_logged（受諾済みは 'accepted'＝出し直さない・監査）→ inviteUserByEmail。
//   「リンクを出す」は版 1 に入れない（相談役 18:05 判断 8＝リンクはログインそのもの）。
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
  const admin = createAdminClient();
  const { data: email, error } = await admin.rpc("ops_invite_logged", { p_ops: g.op.authUserId, p_org_id: id, p_kind: "email" });
  if (error || typeof email !== "string") return NextResponse.json({ error: opsErrJa(error?.message) }, { status: 409 });
  const origin = new URL(req.url).origin;
  const inv = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/auth/set-password`, data: { role: "owner" } });
  if (inv.error) return NextResponse.json({ error: "招待を送れませんでした（記録は残っています・時間をおいてもう一度）" }, { status: 502 });
  return NextResponse.json({ ok: true, email });
}
