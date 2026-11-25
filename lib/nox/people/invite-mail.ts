// ★0211（相談役 11/25 の便 D1・起票157 の続き）: スタッフの招待のメール＝純関数（DB を知らない）。
//   件名に店名は入れない（ひな形の決まり）・本文に店名・署名「NOX（株式会社レクソル）」・末尾「返信すると NOX のサポートに届きます（お店には届きません）」。
//   送らない＝鍵なし（no_key）・本番でない（not_production）・デモ（demo）・宛先がテスト用のドメイン（test_domain）。送らなくてもリンクは画面に出す。
import { inviteExpiryTextOf } from "./invite";

export type MailSkipReason = "no_key" | "not_production" | "demo" | "test_domain";
/** 送るかどうか（鍵は sendNoxMail の側でも見る＝二重） */
export function inviteMailDecisionOf(o: { hasKey: boolean; vercelEnv: string | undefined; isDemo: boolean; email: string }): { send: true } | { send: false; reason: MailSkipReason } {
  if (!o.hasKey) return { send: false, reason: "no_key" };
  if (o.vercelEnv !== "production") return { send: false, reason: "not_production" };
  if (o.isDemo) return { send: false, reason: "demo" };
  if (/@(example\.(com|org|net)|[^@]*\.(local|test|invalid|example))$/i.test(o.email.trim())) return { send: false, reason: "test_domain" };
  return { send: true };
}

export const INVITE_MAIL_SUBJECT = "【NOX】ご招待が届いています";
export const INVITE_MAIL_SIGNATURE = ["――――――――――", "NOX（株式会社レクソル）", "お問い合わせ：support@noxapp.jp", "返信すると NOX のサポートに届きます（お店には届きません）"] as const;

/** 件名と本文（text）。名前が空なら宛名の行を外す・店名が読めなければ「お店から、」 */
export function inviteMailOf(o: { name: string; storeName: string | null; url: string; expiresAt: string | null }): { subject: string; text: string } {
  const lines: string[] = [];
  if (o.name.trim()) lines.push(`${o.name.trim()} 様`, "");
  lines.push(`${o.storeName?.trim() ? o.storeName.trim() : "お店"}から、NOX への招待が届いています。`, "NOX は、シフトや勤怠などをお店と共有するためのサービスです。", "");
  lines.push("下のリンクから、パスワードを決めて利用を始めてください。", o.url, "");
  if (o.expiresAt) lines.push(`このリンクは ${inviteExpiryTextOf(o.expiresAt)}使えます。`);
  lines.push("期限が切れたときは、お店の方にもう一度招待を出してもらってください。", "お店が招待を出し直すと、このリンクは使えなくなります。", "");
  lines.push("このメールに心当たりがない場合は、何もせずに削除してください。", "リンクを開いてパスワードを決めないかぎり、アカウントは作られません。", "");
  lines.push(...INVITE_MAIL_SIGNATURE);
  return { subject: INVITE_MAIL_SUBJECT, text: lines.join("\n") };
}

/** 発行・送り直しの結果の 1 行（画面） */
export function inviteMailResultLineOf(r: { status: "sent" | "skipped" | "failed"; reason?: string } | null | undefined, who: { name: string; email: string }): { kind: "success" | "info" | "error"; text: string } | null {
  if (!r) return null;
  if (r.status === "sent") return { kind: "success", text: `${who.name}さん（${who.email}）に招待のメールを送りました。届かないときは下のリンクを本人に渡してください。` };
  if (r.status === "failed") return { kind: "error", text: "メールを送れませんでした。下のリンクをコピーして本人に送ってください。" };
  return { kind: "info", text: "メールは送っていません。下のリンクを本人に送ってください。" };
}

/** 出し直しの上限の文 */
export const INVITE_REISSUE_LIMIT = 5;
export const INVITE_REISSUE_NOTE = `出し直しとメールの送り直しは、1 つの招待につき 1 日 ${INVITE_REISSUE_LIMIT} 回までです。`;
/** 一覧に出す期限切れ（取り消していないもの）の日数 */
export const INVITE_EXPIRED_SHOWN_DAYS = 30;
