// ★導入の代行 版 2（2026-11-21 夜・枝 night1121-ops-v2・旗 MIG_0202B_APPLIED の後ろ＝false の間は 404）: 運営者が会社の導入を代行する（POST {action, …}）。
//   行い手は運営者（requireOperatorApi＝getUser→ops_operators→aal2）だけ＝'ops' と運営者の id を渡す。代理店（'agency'）を渡す route は作らない（入口は未裁定＝相談役 18:40 の 4f）。
//   書けるかの判定は関数（onb_can_write＝導入中か、オーナーのサポート許可の間）。シークレットとトークンは応答にもログにも出さない。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorApi } from "@/lib/nox/ops/require-operator";
import { mig0202bOn } from "@/lib/nox/rules-0175/flag";
import { assistErrJa, LINE_VERIFY_LATER_NOTE, LINE_VERIFY_READY } from "@/lib/nox/ops/assist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { action?: string; step?: number; data?: unknown; expected_at?: string | null; patch?: Record<string, unknown>; kind?: string; secret?: string; name?: string; plan_id?: string | null; note?: string | null; id?: string };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!mig0202bOn()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const g = await requireOperatorApi();
  if (g.res) return g.res;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("id").eq("org_id", id).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!store) return NextResponse.json({ error: "not found" }, { status: 404 });
  const who = { p_kind: "ops", p_ref: g.op.authUserId };
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(fn, { ...who, ...args });
    if (error) return NextResponse.json({ error: assistErrJa(error.message), stale: /stale/.test(error.message) }, { status: 409 });
    return NextResponse.json({ ok: true, result: data ?? null });
  };
  switch (b.action) {
    case "draft": return call("onb_setup_draft_set", { p_store_id: store.id, p_step: b.step, p_data: b.data, p_expected_at: b.expected_at ?? null });
    case "line": {
      const p = b.patch ?? {};
      const pub = { login_channel_id: String(p.login_channel_id ?? "").trim(), liff_id: String(p.liff_id ?? "").trim(), bot_basic_id: String(p.bot_basic_id ?? "").trim() };   // 公開の値だけ（シークレットの鍵はこの窓口で受けない）
      return call("onb_line_set", { p_store_id: store.id, p_patch: pub });
    }
    case "line_secret": {
      if (b.kind !== "channel_secret" && b.kind !== "access_token") return NextResponse.json({ error: assistErrJa("bad kind") }, { status: 400 });
      const { error } = await admin.rpc("onb_line_secret_set", { ...who, p_store_id: store.id, p_secret_kind: b.kind, p_secret: String(b.secret ?? "") });
      if (error) return NextResponse.json({ error: assistErrJa(error.message) }, { status: 409 });
      return NextResponse.json({ ok: true });   // 値は返さない
    }
    case "line_verify": if (!LINE_VERIFY_READY) return NextResponse.json({ error: LINE_VERIFY_LATER_NOTE }, { status: 409 }); return call("onb_line_verify", { p_store_id: store.id });   // ★0202e まで止める（今の関数は「つながった人 1 人以上」で見る＝相談役 22:10 ■2）
    case "provisional_add": return call("onb_cast_provisional_add", { p_store_id: store.id, p_name: String(b.name ?? "").trim(), p_plan_id: b.plan_id ?? null, p_note: b.note ?? null });
    case "provisional_cancel": return call("onb_cast_provisional_cancel", { p_id: b.id });
    default: return NextResponse.json({ error: "bad action" }, { status: 400 });
  }
}
