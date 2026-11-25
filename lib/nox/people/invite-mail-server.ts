// ★0211（相談役 11/25 の便 D1）: 招待のメールを送って結果を監査に 1 行（server 専用）。発行（create）と送り直し（reissue）で同じ道。
//   デモの判定は「読めなかったら送らない」側（isDemoOrg は失敗で false＝本番を止めない側なので使わない）。結果は staff_invite_mail_note（本人のセッション）で監査に残す。
//   送れなくても招待は成功のまま（リンクは画面に出す）。ログに宛先・トークン・リンクは出さない。
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNoxMail, type MailResult } from "@/lib/nox/mail/send";
import { inviteMailDecisionOf, inviteMailOf } from "./invite-mail";

export async function sendInviteMail(admin: SupabaseClient, userClient: SupabaseClient, o: { inviteId: string; kind: "create" | "reissue"; orgId: string; email: string; name: string; storeName: string | null; url: string; expiresAt: string | null; idemKey: string }): Promise<MailResult> {
  let isDemo = true;
  try { const { data, error } = await admin.from("orgs").select("is_demo").eq("id", o.orgId).maybeSingle(); isDemo = !!error || !data || data.is_demo === true; } catch { isDemo = true; }
  const d = inviteMailDecisionOf({ hasKey: !!(process.env.RESEND_API_KEY ?? "").trim(), vercelEnv: process.env.VERCEL_ENV, isDemo, email: o.email });
  const res: MailResult = d.send ? await sendNoxMail({ to: o.email, ...inviteMailOf({ name: o.name, storeName: o.storeName, url: o.url, expiresAt: o.expiresAt }), idemKey: o.idemKey }) : { status: "skipped", reason: d.reason };
  const { error } = await userClient.rpc("staff_invite_mail_note", { p_invite_id: o.inviteId, p_kind: o.kind, p_status: res.status, p_reason: res.reason ?? null });
  if (error) console.error(`[invite-mail] note failed ${o.inviteId} ${error.message.slice(0, 60)}`);
  return res;
}
