// ★便 X13-H H-17（2026-10-21）: /mine「遅刻・当欠の連絡」（attendance_set_self＝attendance の 1 行・source 'self'）を今日タブと /mine で読む純関数。
//   保存先は attendance（cast×日付で 1 行の upsert・status／eta／reason／source／updated_at）。店が記録すると source は 'manager' 等に変わる。
//   「確認済み」の列・同日の複数の連絡の履歴は無い（0176）＝本便は「連絡（source 'self'）」と「店が記録済み（source が self 以外）」の 2 状態だけ。
//   ★便 ON-3（2026-10-26・0176 ★3 I-4）: 「確認済み」（attendance.ack_at／ack_by＝attendance_ack）と同日の複数連絡の履歴（attendance_contacts＝attendance_contact_log）を足した。
//     連絡の chip＝「連絡 n 件（未確認 m）」（m＝ack_at が無い本人連絡）・行＝確認済みボタン／履歴の行・/mine＝「店が確認しました」。
export type AttLike = { id?: string; cast_id: string; date: string; status: string; eta: string | null; reason?: string | null; source?: string | null; updated_at?: string | null; ack_at?: string | null; ack_by?: string | null };
export type ContactLike = { kind: string; eta: string | null; reason: string | null; source: string; created_at: string };
export type CastReport = { kind: "late" | "absent"; at: string; eta: string | null; reason: string | null };

const hmJst = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
/** キャスト本人からの連絡（source 'self' の遅刻／当欠）。それ以外は null */
export function castReportOf(a: AttLike | null | undefined): CastReport | null {
  if (!a || a.source !== "self" || (a.status !== "late" && a.status !== "absent")) return null;
  return { kind: a.status, at: hmJst(a.updated_at), eta: a.status === "late" ? a.eta : null, reason: a.reason ?? null };
}
/** 「遅刻の連絡 15:42・見込み 21:30『電車遅延』」／「当欠の連絡 15:42『体調不良』」 */
export function castReportLineOf(r: CastReport): string {
  const head = r.kind === "late" ? "遅刻の連絡" : "当欠の連絡";
  return `${head}${r.at ? ` ${r.at}` : ""}${r.eta ? `・見込み ${r.eta}` : ""}${r.reason ? `『${r.reason}』` : ""}`;
}
/** 店が記録するときに本人の連絡（見込み・理由）を残す引数（遅刻／当欠の記録で・前の行が本人の連絡のときだけ） */
export function keepReportArgsOf(prev: AttLike | null | undefined, status: string): { p_eta: string | null; p_reason: string | null } {
  const r = castReportOf(prev);
  if (!r || (status !== "late" && status !== "absent")) return { p_eta: null, p_reason: null };
  return { p_eta: status === "late" ? r.eta : null, p_reason: r.reason };
}
/** /mine の連絡の状態（今日の自分の attendance 行）。★便 ON-3: 確認済み（ack_at）なら「店が確認しました」 */
export function mineReportStateOf(a: AttLike | null | undefined): string | null {
  if (!a || (a.status !== "late" && a.status !== "absent")) return null;
  const k = a.status === "late" ? "遅刻" : "当欠";
  if (a.source === "self") return a.ack_at ? `${k}の連絡を店が確認しました（${hmJst(a.ack_at)}）` : `${k}の連絡は店に届きました（店の確認待ち）`;
  return `店が${k}として記録しました`;
}
/** ★便 ON-3（I-4）: 本人の連絡の確認状態＝null（連絡でない）／'unacked'／'acked' */
export function reportAckStateOf(a: AttLike | null | undefined): "unacked" | "acked" | null {
  const r = castReportOf(a);
  if (!r) return null;
  return a?.ack_at ? "acked" : "unacked";
}
/** 今日タブの chip＝「連絡 n 件（未確認 m）」 */
export const reportChipTextOf = (n: number, unacked: number): string => `連絡 ${n} 件（未確認 ${unacked}）`;
export const ACK_BUTTON = "確認済みにする";
/** 「確認済み 15:50」 */
export const ackLineOf = (ackAt: string | null | undefined): string | null => (ackAt ? `確認済み ${hmJst(ackAt)}` : null);
/** 履歴の 1 行＝「15:42 本人 遅刻・見込み 21:30『電車遅延』」／「16:10 店 当欠」 */
export function contactHistoryLineOf(c: ContactLike): string {
  const k = c.kind === "late" ? "遅刻" : "当欠";
  const who = c.source === "self" ? "本人" : "店";
  return `${hmJst(c.created_at)} ${who} ${k}${c.kind === "late" && c.eta ? `・見込み ${c.eta}` : ""}${c.reason ? `『${c.reason}』` : ""}`;
}
/** 履歴の見出し＝「連絡 2 回」（1 回は出さない） */
export const contactHistoryHeadOf = (n: number): string | null => (n >= 2 ? `連絡 ${n} 回` : null);
