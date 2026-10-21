// ★便 X13-H H-17（2026-10-21）: /mine「遅刻・当欠の連絡」（attendance_set_self＝attendance の 1 行・source 'self'）を今日タブと /mine で読む純関数。
//   保存先は attendance（cast×日付で 1 行の upsert・status／eta／reason／source／updated_at）。店が記録すると source は 'manager' 等に変わる。
//   「確認済み」の列・同日の複数の連絡の履歴は無い（0176）＝本便は「連絡（source 'self'）」と「店が記録済み（source が self 以外）」の 2 状態だけ。
export type AttLike = { cast_id: string; date: string; status: string; eta: string | null; reason?: string | null; source?: string | null; updated_at?: string | null };
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
/** /mine の連絡の状態（今日の自分の attendance 行） */
export function mineReportStateOf(a: AttLike | null | undefined): string | null {
  if (!a || (a.status !== "late" && a.status !== "absent")) return null;
  const k = a.status === "late" ? "遅刻" : "当欠";
  return a.source === "self" ? `${k}の連絡は店に届きました（店の記録待ち）` : `店が${k}として記録しました`;
}
