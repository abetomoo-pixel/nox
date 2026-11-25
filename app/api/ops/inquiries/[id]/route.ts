// ★0212（窓口の段 1・相談役 11/25 の決め【D7】）: 運営が問い合わせに返事・状態・ポイント・取り消し・2 店目を足す（POST）。旗 MIG_0212_APPLIED の後ろ（false は 404）。
//   運営者の確かめ（requireOperatorApi）→ admin で service 専用の関数（第 1 引数に運営者の auth の id＝関数の中でも ops_operator_ok）。運営者の役では分けない（相談役 11/25）。
//   body＝{ action: "reply", body, idemKey } | { action: "status", status, reason? } | { action: "points", points, reason? } | { action: "revoke", reason } | { action: "store_add", name, bizType, copyFrom?, parts? }
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorApi } from "@/lib/nox/ops/require-operator";
import { mig0212On } from "@/lib/nox/rules-0175/flag";
import { opsInquiryErrJa, INQUIRY_STATUSES, inquiryDeclineMessageOf } from "@/lib/nox/inquiry/labels";
import { randomUUID } from "node:crypto";
import { STORE_COPY_PARTS, storeAddErrJa } from "@/lib/nox/ops/store-add";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireOperatorApi();
  if (g.res) return g.res;
  if (!mig0212On()) return NextResponse.json({ error: "まだ使えません" }, { status: 404 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "問い合わせが見つかりません" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const admin = createAdminClient();
  const p_ops = g.op.authUserId;
  let r: { data: unknown; error: { message: string } | null };
  switch (b.action) {
    case "reply":
      if (!UUID_RE.test(s(b.idemKey))) return NextResponse.json({ error: "入力が足りません" }, { status: 400 });
      r = await admin.rpc("ops_inquiry_reply", { p_ops, p_inquiry: id, p_body: s(b.body), p_idem_key: s(b.idemKey) });
      break;
    case "status":
      if (!(INQUIRY_STATUSES as readonly string[]).includes(s(b.status))) return NextResponse.json({ error: "状態の値が違います" }, { status: 400 });
      r = await admin.rpc("ops_inquiry_set_status", { p_ops, p_inquiry: id, p_status: s(b.status), p_reason: s(b.reason) || null });
      // ★F1（相談役 11/25）: 見送りの理由は運営の発言として店にも見せる＝状態が変わった時だけ（同じ値の再送は false＝書かない）やりとりに 1 行（返事と同じ関数・店の未読とベルに出る）
      if (!r.error && r.data === true && s(b.status) === "declined") {
        const m = await admin.rpc("ops_inquiry_reply", { p_ops, p_inquiry: id, p_body: inquiryDeclineMessageOf(s(b.reason)), p_idem_key: randomUUID() });
        if (m.error) return NextResponse.json({ error: "見送りにしましたが、理由を店に見せる 1 行を書けませんでした。返事の欄から理由を送ってください" }, { status: 409 });
      }
      break;
    case "points":
      if (!Number.isInteger(b.points)) return NextResponse.json({ error: "ポイントの数が違います" }, { status: 400 });
      r = await admin.rpc("ops_inquiry_point_grant", { p_ops, p_inquiry: id, p_points: b.points as number, p_reason: s(b.reason) || null });
      break;
    case "revoke":
      r = await admin.rpc("ops_inquiry_point_revoke", { p_ops, p_inquiry: id, p_reason: s(b.reason) || null });
      break;
    case "store_add": {
      const parts = Array.isArray(b.parts) ? b.parts.filter((p): p is string => typeof p === "string" && (STORE_COPY_PARTS as readonly string[]).includes(p)) : [];
      const copyFrom = UUID_RE.test(s(b.copyFrom)) && parts.length > 0 ? s(b.copyFrom) : null;
      r = await admin.rpc("ops_inquiry_store_add", { p_ops, p_inquiry: id, p_store_name: s(b.name), p_biz_type: s(b.bizType), p_copy_from: copyFrom, p_copy_parts: copyFrom ? parts : null });
      break;
    }
    default:
      return NextResponse.json({ error: "操作が違います" }, { status: 400 });
  }
  if (r.error) return NextResponse.json({ error: b.action === "store_add" && !/not store add|closed|not found/.test(r.error.message) ? storeAddErrJa(r.error.message) : opsInquiryErrJa(r.error.message) }, { status: 409 });
  return NextResponse.json({ ok: true, result: r.data });
}
