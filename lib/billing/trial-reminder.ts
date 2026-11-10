// ★裁定475 追補1 の 2（2026-11-10 Agoora 確定）: お試しはカード登録なしで開始・終了の 7 日前と前日に画面（今）とメール（SMTP の後）で案内・
//   未登録なら閲覧だけ（データは消さない＝書き込みの柵は billing_writable_of＝RPC が本線）。純関数（verify:nox-billing479 の単体対象）。
export type TrialRow = { status?: string | null; trial_ends_at?: string | null; stripe_subscription_id?: string | null } | null | undefined;
export type TrialReminder = { kind: "week" | "last"; daysLeft: number; endsOn: string } | null;

const DAY = 86_400_000;
/** お試しの案内＝契約（subscription）が無い trialing で、終了まで 7 日以内（前日・当日は "last"）。終了後は失効の帯（BillingBanner）。 */
export function trialReminderOf(row: TrialRow, now: Date = new Date()): TrialReminder {
  if (!row || row.status !== "trialing" || row.stripe_subscription_id || !row.trial_ends_at) return null;
  const end = new Date(row.trial_ends_at).getTime();
  if (!Number.isFinite(end) || end <= now.getTime()) return null;
  const daysLeft = Math.ceil((end - now.getTime()) / DAY);
  if (daysLeft > 7) return null;
  const jst = new Date(end + 9 * 3600_000);
  const endsOn = `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}`;
  return { kind: daysLeft <= 1 ? "last" : "week", daysLeft, endsOn };
}
export function trialReminderTextOf(r: NonNullable<TrialReminder>): string {
  return r.kind === "last"
    ? `無料のお試しは明日（${r.endsOn}）までです。続けて使うには、ご契約の手続きをしてください（終了後は閲覧と出力だけになります。データは消えません）。`
    : `無料のお試しは ${r.endsOn} まで（あと ${r.daysLeft} 日）です。続けて使うには、ご契約の手続きをしてください。`;
}
/** 失効後の文言（お試しが終わって契約が無い＝閲覧だけ）。 */
export const TRIAL_ENDED_MSG = "無料のお試しが終わりました。閲覧と出力はできます。続けて使うには、ご契約の手続きをしてください（データは消えません）。";

/** メールの送り手の口（SMTP＝Resend の設定の後に結線）。今は送らずに理由を返す。 */
export async function sendTrialReminderMail(_to: string, _r: NonNullable<TrialReminder>): Promise<{ sent: false; reason: "smtp_not_configured" }> {
  return { sent: false, reason: "smtp_not_configured" };
}
