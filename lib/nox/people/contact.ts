// ★便 ON-3（2026-10-26・0176 ★4＝400 の残り）: 本人の連絡先変更（set_my_contact＝users.contact_email／phone）と店の確認（contact_changes→contact_change_confirm）の純関数。
//   本人＝/mine「連絡先」カード（デモ org は RPC が 'forbidden'＝カードに案内）。店＝/casts・/staff の「連絡先の変更（未確認 N）」パネル＝確認済みにする。
export type ContactField = "contact_email" | "phone";
export const CONTACT_FIELD_LABEL: Record<ContactField, string> = { contact_email: "連絡用メール", phone: "電話番号" };
export type ContactForm = { contact_email: string; phone: string };
export type ContactChangeRow = { id: string; user_id: string; field: string; old_value: string | null; new_value: string | null; changed_at: string; confirmed_at: string | null };

/** RPC と同じ検査（set_my_contact: email 254 字＋形式・phone ^[0-9+\-() ]{6,20}$・空＝null） */
export function contactErrorOf(f: ContactForm): string | null {
  const e = f.contact_email.trim().toLowerCase();
  if (e && (e.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) return "連絡用メールの形式を確認してください";
  const p = f.phone.trim();
  if (p && !/^[0-9+\-() ]{6,20}$/.test(p)) return "電話番号は数字・+・-・( )・空白で 6〜20 文字にしてください";
  return null;
}
/** 変わった鍵だけの patch（空＝null）。変更なし＝null */
export function contactPatchOf(f: ContactForm, cur: { contact_email: string | null; phone: string | null }): Record<string, string | null> | null {
  const out: Record<string, string | null> = {};
  const e = f.contact_email.trim().toLowerCase() || null;
  const p = f.phone.trim() || null;
  if (e !== (cur.contact_email ?? null)) out.contact_email = e;
  if (p !== (cur.phone ?? null)) out.phone = p;
  return Object.keys(out).length === 0 ? null : out;
}
const whenJst = (iso: string): string => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
/** 「連絡用メール: a@x → b@y（10/26 14:30）」（空は「未設定」） */
export function contactChangeLineOf(r: Pick<ContactChangeRow, "field" | "old_value" | "new_value" | "changed_at">): string {
  const label = CONTACT_FIELD_LABEL[r.field as ContactField] ?? r.field;
  const v = (s: string | null) => (s ? s : "未設定");
  return `${label}: ${v(r.old_value)} → ${v(r.new_value)}（${whenJst(r.changed_at)}）`;
}
export const unconfirmedContactCountOf = (rows: readonly { confirmed_at: string | null }[]): number => rows.filter((r) => r.confirmed_at === null).length;
export const CONTACT_DEMO_NOTE = "デモ環境では連絡先を変更できません";
export const CONTACT_PANEL_TITLE = "連絡先の変更";
export const contactPanelTitleOf = (unconfirmed: number): string => (unconfirmed > 0 ? `${CONTACT_PANEL_TITLE}（未確認 ${unconfirmed}）` : CONTACT_PANEL_TITLE);
export const CONTACT_MINE_NOTE = "ログイン用のメールは変わりません。店からの連絡に使う宛先です（変更は店に通知され、店が確認します）。";
export function contactErrJa(msg: string): string {
  if (/bad email/.test(msg)) return "連絡用メールの形式を確認してください";
  if (/bad phone/.test(msg)) return "電話番号の形式を確認してください";
  if (/forbidden/.test(msg)) return CONTACT_DEMO_NOTE;
  if (/bad patch|bad key|bad type/.test(msg)) return "変更がありません";
  return msg;
}
