// ★0207（相談役 11/25 朝の便 M3）: 運営がオーナーにサポート許可を頼む・取り下げる（POST）。運営者の確かめ（requireOperatorApi）→ admin で service 専用の関数。
//   body＝{ action: "ask", message?: string } か { action: "withdraw" }。頼みは会社に 1 つ（くり返し押しても重ねて届かない＝関数が同じ行を返す）・デモと導入中と許可の間は関数が断る。
//   押しただけで許可にはしない（オーナーが日数を選んで出す）。旗 MIG_0207_APPLIED の後ろ。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorApi } from "@/lib/nox/ops/require-operator";
import { mig0207On } from "@/lib/nox/rules-0175/flag";
import { supportAskErrJa, supportAskMessageErrOf } from "@/lib/nox/support/support-ask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireOperatorApi();
  if (g.res) return g.res;
  if (!mig0207On()) return NextResponse.json({ error: "まだ使えません" }, { status: 404 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "会社が見つかりません" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; message?: unknown };
  const admin = createAdminClient();
  if (body.action === "withdraw") {
    const { data, error } = await admin.rpc("ops_support_request_withdraw", { p_ops: g.op.authUserId, p_org: id });
    if (error) return NextResponse.json({ error: supportAskErrJa(error.message) }, { status: 409 });
    return NextResponse.json({ ok: true, closed: data === true });
  }
  if (body.action !== "ask") return NextResponse.json({ error: "操作が違います" }, { status: 400 });
  const message = typeof body.message === "string" ? body.message : "";
  const v = supportAskMessageErrOf(message);
  if (v) return NextResponse.json({ error: v }, { status: 400 });
  const { data, error } = await admin.rpc("ops_support_request", { p_ops: g.op.authUserId, p_org: id, p_message: message.trim() || null });
  if (error) return NextResponse.json({ error: supportAskErrJa(error.message) }, { status: 409 });
  return NextResponse.json({ ok: true, id: data });
}
