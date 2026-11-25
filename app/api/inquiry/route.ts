// ★0212（窓口の段 1・相談役 11/25 の決め【D7】）: 店から運営へ問い合わせを送る（POST）。旗 MIG_0212_APPLIED の後ろ（false は 404）。
//   柵＝①セッション 401 ②入力 400 ③オーナーと店長だけ 403（真の防御は RPC inquiry_create＝店長は自店・2 店舗目はオーナー） ④デモの会社 403（RPC も 'forbidden (demo)'）。
//   送れたら運営へメール（宛先 support@noxapp.jp・中身は入れず種類・会社名・/ops へのリンクだけ・鍵が無ければ送らずに skipped）→ 結果を inquiry_mail_note で監査に 1 行。
//   メールが送れなくても問い合わせは送れたまま（運営は /ops の一覧で見る）。ログに宛先と本文を出さない。返事・既読は画面から RPC を直に呼ぶ（route を作らない）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoGuardErr } from "@/lib/nox/demo/guard";
import { mig0212On } from "@/lib/nox/rules-0175/flag";
import { sendNoxMail, type NoxMailResult } from "@/lib/nox/mail/send";
import { INQUIRY_KINDS, inquiryErrJa, opsInquiryMailOf, opsInquiryMailSkipOf, OPS_INQUIRY_MAIL_TO } from "@/lib/nox/inquiry/labels";

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

  // 運営へのメール（新しい問い合わせのときだけ・同じ鍵の再送で 2 通にしない＝記録が既にあれば送らない）
  let mail: NoxMailResult = { status: "skipped", reason: "replay" };
  try {
    const admin = createAdminClient();
    const [{ data: org }, { data: noted }] = await Promise.all([
      admin.from("orgs").select("name").eq("id", orgId as string).maybeSingle(),
      admin.from("audit_logs").select("id").eq("action", "inquiry_mail").eq("target", `ops_inquiries:${id}`).limit(1).maybeSingle(),
    ]);
    if (!noted) {
      const skip = opsInquiryMailSkipOf((org?.name as string | undefined) ?? null);
      mail = skip ? { status: "skipped", reason: skip } : await sendNoxMail({ to: OPS_INQUIRY_MAIL_TO, ...opsInquiryMailOf({ kind, orgName: String(org?.name ?? ""), inquiryId: id }) });
      const { error: ne } = await supabase.rpc("inquiry_mail_note", { p_inquiry: id, p_status: mail.status, p_reason: mail.reason ?? null });
      if (ne) console.error(`inquiry mail note: ${id} ${ne.message}`);
    }
  } catch (e) {
    console.error(`inquiry mail: ${id} ${e instanceof Error ? e.name : "error"}`);
    mail = { status: "failed", reason: "error" };
  }
  return NextResponse.json({ ok: true, id, mail: { status: mail.status } });
}
