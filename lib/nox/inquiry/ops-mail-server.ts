// ★相談役 11/26 の便 M2-5（起票163 を閉じる）: 店からの問い合わせ（新しい問い合わせ・店の返事）を有効な運営者の全員へメールで知らせる（server 専用）。
//   呼ぶのは /api/inquiry（RPC inquiry_create／inquiry_reply が通った後＝問い合わせは保存済み）。ここは何があっても投げない（失敗は結果の語で返す）＝問い合わせ自体は止めない。
//   柵：問い合わせの行を admin で読み、呼んだ人の会社（auth_org_id）と同じ会社の行のときだけ送る（RPC の柵の後の二重の確かめ）。
//   中身：会社名・種類・件名・/ops の問い合わせへのリンクだけ（やりとりの本文は載せない）。送らない＝確かめ用の会社・鍵なし・本番でない（invite-mail と同じ線）。
//   記録：運営者ごとに ops_audit_logs に 1 行（action＝ops.inquiry.mail・ops_user_id＝宛先の運営者・after＝event／status／reason／message_id）。
//     service_role は ops_audit_logs に INSERT を持つ（0202a・2026-11-26 に本番の grant を読むだけで確かめた）＝mig は要らない。0212 の inquiry_mail_note（店の側の監査・1 件に 1 回）は新しい問い合わせのときだけ今のまま呼ぶ（route の側）。
//   ログに宛先・本文・リンクは出さない。
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNoxMail, type MailResult } from "@/lib/nox/mail/send";
import { mailReasonOf, OPS_INQUIRY_MAIL_ACTION, OPS_INQUIRY_MAIL_TO, opsInquiryMailOf, opsInquiryReplyMailOf, opsMailAggregateOf, opsMailSkipReasonOf, type OpsMailStatus } from "./labels";

export type OpsMailEvent = "create" | "reply";
export type OpsMailOutcome = { status: OpsMailStatus; reason: string | null; sent: number; total: number };

/** 送って記録する。投げない。 */
export async function notifyOperatorsOfInquiry(admin: SupabaseClient, o: { event: OpsMailEvent; inquiryId: string; orgId: string; messageId?: string | null }): Promise<OpsMailOutcome> {
  try {
    const { data: inq } = await admin.from("ops_inquiries").select("id, org_id, kind, subject").eq("id", o.inquiryId).maybeSingle();
    const row = inq as { id: string; org_id: string; kind: string; subject: string } | null;
    if (!row || row.org_id !== o.orgId) return { status: "skipped", reason: "not_found", sent: 0, total: 0 };   // 呼んだ人の会社の行でなければ送らない
    const [{ data: org }, { data: ops }] = await Promise.all([
      admin.from("orgs").select("name").eq("id", o.orgId).maybeSingle(),
      admin.from("ops_operators").select("auth_user_id, email").eq("is_active", true),
    ]);
    const orgName = (org?.name as string | undefined) ?? null;
    const seen = new Set<string>();
    const to = ((ops ?? []) as { auth_user_id: string; email: string | null }[]).filter((x) => {
      const e = (x.email ?? "").trim().toLowerCase();
      if (!e || seen.has(e)) return false;
      seen.add(e); return true;
    });
    const mail = (o.event === "reply" ? opsInquiryReplyMailOf : opsInquiryMailOf)({ kind: row.kind, orgName: orgName ?? "", inquiryId: row.id, subject: row.subject });
    const skip = opsMailSkipReasonOf({ orgName, hasKey: !!(process.env.RESEND_API_KEY ?? "").trim(), vercelEnv: process.env.VERCEL_ENV });
    const key = o.event === "reply" ? `inquiry-reply-${o.messageId ?? row.id}` : `inquiry-${row.id}`;
    if (to.length === 0) {
      // 有効な運営者が 0 人＝今までの宛先（support@noxapp.jp）にだけ送る（運営者の行が無いので ops_audit_logs には書けない＝結果は返すだけ）
      const r: MailResult = skip ? { status: "skipped", reason: skip } : await sendNoxMail({ to: OPS_INQUIRY_MAIL_TO, ...mail, idemKey: key });
      return { status: r.status, reason: mailReasonOf(r.reason ?? null), sent: r.status === "sent" ? 1 : 0, total: 1 };
    }
    const results: MailResult[] = await Promise.all(to.map(async (x) => {
      if (skip) return { status: "skipped", reason: skip } as MailResult;
      try { return await sendNoxMail({ to: x.email as string, ...mail, idemKey: `${key}-${x.auth_user_id}` }); }
      catch (e) { return { status: "failed", reason: e instanceof Error && e.name === "AbortError" ? "timeout" : "error" } as MailResult; }
    }));
    try {
      const { error } = await admin.from("ops_audit_logs").insert(to.map((x, i) => ({
        ops_user_id: x.auth_user_id, org_id: o.orgId, action: OPS_INQUIRY_MAIL_ACTION, target: `ops_inquiries:${row.id}`, before_json: null,
        after_json: { event: o.event, status: results[i].status, reason: mailReasonOf(results[i].reason ?? null), message_id: o.messageId ?? null },
      })));
      if (error) console.error(`[ops-mail] log failed ${row.id} ${error.message.slice(0, 60)}`);
    } catch (e) { console.error(`[ops-mail] log failed ${row.id} ${e instanceof Error ? e.name : "error"}`); }
    const agg = opsMailAggregateOf(results.map((r) => ({ status: r.status, reason: r.reason })));
    const failed = results.filter((r) => r.status === "failed").length;
    if (failed > 0) console.error(`[ops-mail] ${o.event} ${row.id} failed ${failed}/${results.length}`);
    return { ...agg, sent: results.filter((r) => r.status === "sent").length, total: results.length };
  } catch (e) {
    console.error(`[ops-mail] ${o.event} ${o.inquiryId} ${e instanceof Error ? e.name : "error"}`);
    return { status: "failed", reason: "error", sent: 0, total: 0 };
  }
}
