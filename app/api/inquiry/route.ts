// ★0212（窓口の段 1・相談役 11/25 の決め【D7】）: 店から運営へ問い合わせを送る（POST）。旗 MIG_0212_APPLIED の後ろ（false は 404）。
//   柵＝①セッション 401 ②入力 400 ③オーナーと店長だけ 403（真の防御は RPC inquiry_create＝店長は自店・店舗の追加の依頼はオーナー） ④デモの会社 403（RPC も 'forbidden (demo)'）。
//   送れたら運営へメール（中身は入れず会社名・種類・件名・/ops へのリンクだけ・鍵が無ければ送らずに skipped）→ 結果を inquiry_mail_note で監査に 1 行。
//   メールが送れなくても問い合わせは送れたまま（運営は /ops の一覧で見る）。ログに宛先と本文を出さない。既読は画面から RPC を直に呼ぶ。
//   ★F1（相談役 11/25）: 店の返事（action: "reply"）もこの route＝inquiry_reply の後に運営へメール（同じ鍵の再送は送らない）。
//   ★相談役 11/26 の便 M2-5: 宛先は有効な運営者の全員（lib/nox/inquiry/ops-mail-server.ts）・運営者ごとの結果を ops_audit_logs に 1 行＝店の返事のメールの結果も残る（起票163 を閉じる）。
//     送る・記録するの中は投げない（notifyOperatorsOfInquiry は失敗を語で返す）＋ここでも try で包む＝問い合わせの応答は必ず ok。
//   送る部品は main の sendNoxMail（Idempotency-Key・1 回のやり直し・8 秒）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoGuardErr } from "@/lib/nox/demo/guard";
import { mig0212On } from "@/lib/nox/rules-0175/flag";
import { INQUIRY_KINDS, inquiryErrJa } from "@/lib/nox/inquiry/labels";
import { notifyOperatorsOfInquiry, type OpsMailOutcome } from "@/lib/nox/inquiry/ops-mail-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(req: Request) {
  if (!mig0212On()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.action === "reply") return replyPost(supabase, b);
  const kind = typeof b.kind === "string" && (INQUIRY_KINDS as readonly string[]).includes(b.kind) ? b.kind : "";
  const storeId = typeof b.storeId === "string" && UUID_RE.test(b.storeId) ? b.storeId : "";
  const idemKey = typeof b.idemKey === "string" && UUID_RE.test(b.idemKey) ? b.idemKey : "";
  const subject = typeof b.subject === "string" ? b.subject : "";
  const text = typeof b.body === "string" ? b.body : "";
  const storeAdd = kind === "store_add" && b.storeAdd && typeof b.storeAdd === "object" && !Array.isArray(b.storeAdd) ? (b.storeAdd as Record<string, unknown>) : null;
  if (!kind || !storeId || !idemKey) return NextResponse.json({ error: "入力が足りません" }, { status: 400 });

  const [{ data: role }, { data: orgId }] = await Promise.all([supabase.rpc("auth_role"), supabase.rpc("auth_org_id")]);
  if (role !== "owner" && role !== "manager") return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  if (!orgId) return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  const demo = await demoGuardErr(orgId as string); if (demo) return NextResponse.json(demo.body, { status: demo.status });

  const { data: id, error } = await supabase.rpc("inquiry_create", { p_store_id: storeId, p_kind: kind, p_subject: subject, p_body: text, p_store_add: storeAdd, p_idem_key: idemKey });
  if (error || typeof id !== "string") {
    const m = error?.message ?? "";
    return NextResponse.json({ error: inquiryErrJa(m) }, { status: /forbidden/.test(m) ? 403 : /too many open/.test(m) ? 429 : 400 });
  }

  // 運営へのメール（新しい問い合わせのときだけ・同じ鍵の再送で 2 通にしない＝記録が既にあれば送らない）。ここから先の失敗は応答に響かせない。
  let mail: Pick<OpsMailOutcome, "status"> = { status: "skipped" };
  try {
    const admin = createAdminClient();
    const { data: noted } = await admin.from("audit_logs").select("id").eq("action", "inquiry_mail").eq("target", `ops_inquiries:${id}`).limit(1).maybeSingle();
    if (!noted) {
      const r = await notifyOperatorsOfInquiry(admin, { event: "create", inquiryId: id, orgId: orgId as string });
      mail = r;
      const { error: ne } = await supabase.rpc("inquiry_mail_note", { p_inquiry: id, p_status: r.status, p_reason: r.reason });
      if (ne) console.error(`inquiry mail note: ${id} ${ne.message}`);
    }
  } catch (e) {
    console.error(`inquiry mail: ${id} ${e instanceof Error ? e.name : "error"}`);
    mail = { status: "failed" };
  }
  return NextResponse.json({ ok: true, id, mail: { status: mail.status } });
}

/** ★F1（相談役 11/25）: 店の返事＝inquiry_reply（真の防御は RPC）→ 新しい行のときだけ運営へメール（★M2-5: 有効な運営者の全員・結果は ops_audit_logs） */
async function replyPost(supabase: Awaited<ReturnType<typeof createClient>>, b: Record<string, unknown>) {
  const inquiryId = typeof b.inquiryId === "string" && UUID_RE.test(b.inquiryId) ? b.inquiryId : "";
  const idemKey = typeof b.idemKey === "string" && UUID_RE.test(b.idemKey) ? b.idemKey : "";
  const text = typeof b.body === "string" ? b.body : "";
  if (!inquiryId || !idemKey) return NextResponse.json({ error: "入力が足りません" }, { status: 400 });
  const [{ data: role }, { data: orgId }] = await Promise.all([supabase.rpc("auth_role"), supabase.rpc("auth_org_id")]);
  if ((role !== "owner" && role !== "manager") || !orgId) return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  const demo = await demoGuardErr(orgId as string); if (demo) return NextResponse.json(demo.body, { status: demo.status });
  const admin = createAdminClient();
  const { data: seen } = await admin.from("ops_inquiry_messages").select("id").eq("inquiry_id", inquiryId).eq("idem_key", idemKey).maybeSingle();
  const { data: mid, error } = await supabase.rpc("inquiry_reply", { p_inquiry: inquiryId, p_body: text, p_idem_key: idemKey });
  if (error || typeof mid !== "string") {
    const m = error?.message ?? "";
    return NextResponse.json({ error: inquiryErrJa(m) }, { status: /forbidden/.test(m) ? 403 : /not found/.test(m) ? 404 : 400 });
  }
  let mail: Pick<OpsMailOutcome, "status"> = { status: "skipped" };
  if (!seen) {
    try {
      mail = await notifyOperatorsOfInquiry(admin, { event: "reply", inquiryId, orgId: orgId as string, messageId: mid });
    } catch (e) {
      console.error(`inquiry reply mail: ${inquiryId} ${e instanceof Error ? e.name : "error"}`);
      mail = { status: "failed" };
    }
  }
  return NextResponse.json({ ok: true, id: mid, mail: { status: mail.status } });
}
