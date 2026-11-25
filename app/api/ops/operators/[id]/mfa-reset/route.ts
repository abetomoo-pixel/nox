// ★【D8】起票155 の 2（2026-11-25・旗 MIG_0209_APPLIED の後ろ）: 運営者の認証アプリのリセット（POST・管理者だけ・自分は不可・理由は必ず）＝{ reason: string }。
//   案 B（相談役 11/25）：auth の内部の表を関数で直に消さない＝Supabase の Admin API（auth.admin.mfa.listFactors → deleteFactor）で消す。
//   順序：①役 ②理由 ③自分は不可 ④ops_operator_mfa_reset_logged（先に記録＋mfa_reset_at・登録が無ければ 'op no factor'）⑤listFactors → 全部の登録を deleteFactor。
//   リセットの後、その人の今のセッションは requireOperator が通さない（mfa_reset_at より前のログイン・確認済みのアプリが無い aal2＝relogin）＝ログインし直して /ops/mfa で登録し直す。
//   消すのが途中で落ちたら 502（記録と mfa_reset_at は残る＝古いセッションはもう使えない・もう一度押せば残りを消す）。
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
  const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
  const reason = typeof body.reason === "string" ? body.reason : "";
  const re = opsReasonErrOf(reason, true);
  if (re) return NextResponse.json({ error: re }, { status: 400 });
  if (id === g.op.authUserId) return NextResponse.json({ error: opsOperatorErrJa("op self") }, { status: 409 });
  const admin = createAdminClient();
  const { error } = await admin.rpc("ops_operator_mfa_reset_logged", { p_ops: g.op.authUserId, p_target: id, p_reason: reason.trim() });
  if (error) return NextResponse.json({ error: opsOperatorErrJa(error.message) }, { status: 409 });
  const lf = await admin.auth.admin.mfa.listFactors({ userId: id });
  if (lf.error) return NextResponse.json({ error: "登録を読めませんでした（記録は残っています・古いログインはもう使えません・もう一度押してください）" }, { status: 502 });
  let deleted = 0;
  for (const f of lf.data?.factors ?? []) {
    const d = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: id });
    if (d.error) return NextResponse.json({ error: "登録を消しきれませんでした（記録は残っています・古いログインはもう使えません・もう一度押してください）", deleted }, { status: 502 });
    deleted++;
  }
  return NextResponse.json({ ok: true, deleted });
}
