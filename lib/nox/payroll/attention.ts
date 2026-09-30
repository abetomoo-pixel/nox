// ★裁定315（0158・便 AB-2）: 確定後の打刻修正の「要対応」（payroll_attentions）を給与画面に出すための純関数（DB を知らない）。
//   行の文言・翌期（YYYY-MM）・翌期の調整入力の prefill（種別と備考）・未解決／解決済みの仕分け。読取と解決は RPC（payroll_attentions_of／payroll_attention_resolve）。
import { hmOnBizOf, KIND_LABEL, type PunchKind } from "../shift/punch-correction";
import { mdLabelOf } from "./finalize-guard";

export type AttentionRow = {
  id: string; cast_id: string; cast_name: string; kind: string;
  detail: { before?: string | null; after?: string | null; biz_date?: string | null; punch_kind?: string | null; punch_id?: string | null; correction_id?: string | null; punched_at?: string | null; noticed_at?: string | null } | null;
  created_at: string; resolved_at: string | null; resolved_by: string | null;
};

// ★0161（裁定327＋追補1・便 M1-5）: kind 2 種＝確定後の打刻修正（0158）／未閉鎖の出勤（前営業日以前・0161 punch_seq_check が積む・run 未作成でも payroll_attentions_of が期間で拾う）
export const ATTENTION_KIND_LABEL: Record<string, string> = { post_finalize_punch: "確定後の打刻修正", open_punch: "未閉鎖の出勤（前営業日以前）" };
export const attentionKindLabelOf = (kind: string): string => ATTENTION_KIND_LABEL[kind] ?? "要対応";
/** 「翌期の調整へ」は確定後の打刻修正だけ（open_punch は差額の話ではない＝修正申請で閉じて解決） */
export const attentionCanCarry = (row: Pick<AttentionRow, "kind">): boolean => row.kind === "post_finalize_punch";

const kindLabelOf = (k: string | null | undefined): string => (k === "in" || k === "out" ? KIND_LABEL[k as PunchKind] : "打刻");
const hmOf = (iso: string | null | undefined, biz: string | null | undefined): string => (iso ? hmOnBizOf(iso, biz) : "なし");

/** 「出勤 20:00→20:30」（打刻の追加は「なし→20:00」・削除は「20:00→なし」）。時刻は営業日基準（翌 2:00 は 26:00） */
export function attentionChangeOf(row: AttentionRow): string {
  const d = row.detail ?? {};
  return `${kindLabelOf(d.punch_kind)} ${hmOf(d.before, d.biz_date)}→${hmOf(d.after, d.biz_date)}`;
}

/** 一覧の 1 行: 「確定後の打刻修正: 玲奈・9/10・出勤 20:00→20:30」／★0161「未閉鎖の出勤（前営業日以前）: 玲奈・9/29・出勤 20:00（退勤なし）」 */
export function attentionLineOf(row: AttentionRow): string {
  const biz = row.detail?.biz_date;
  const day = biz ? mdLabelOf(biz) : "日付なし";
  if (row.kind === "open_punch") return `${ATTENTION_KIND_LABEL.open_punch}: ${row.cast_name}・${day}・出勤 ${hmOf(row.detail?.punched_at, biz)}（退勤なし）`;
  return `確定後の打刻修正: ${row.cast_name}・${day}・${attentionChangeOf(row)}`;
}

/** 'YYYY-MM' の翌月 */
export function nextPeriodOf(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export type AttentionCarry = { period: string; castId: string; castName: string; kind: "fixed"; reason: string };
/** 「翌期の調整へ」: 翌期の当該 cast の調整入力に入れる種別（定額）と備考。金額は人が決める（凍結給与との差額は自動計算しない） */
export function attentionCarryOf(row: AttentionRow, runPeriod: string): AttentionCarry {
  const biz = row.detail?.biz_date;
  const reason = `${runPeriod} 確定後の打刻修正（${biz ? mdLabelOf(biz) : "日付なし"} ${attentionChangeOf(row)}）の差額`.slice(0, 200);
  return { period: nextPeriodOf(runPeriod), castId: row.cast_id, castName: row.cast_name, kind: "fixed", reason };
}

/** 未解決（RPC の並びのまま）と解決済み（折りたたみ）に分ける */
export function splitAttentions(rows: AttentionRow[]): { open: AttentionRow[]; resolved: AttentionRow[] } {
  return { open: rows.filter((r) => !r.resolved_at), resolved: rows.filter((r) => !!r.resolved_at) };
}

/** その営業日の月が確定済み（finalized／paid）の期に入るか。periods＝確定済みの 'YYYY-MM' の一覧 */
export const isFinalizedDay = (biz: string, periods: readonly string[]): boolean => /^\d{4}-\d{2}-\d{2}$/.test(biz) && periods.includes(biz.slice(0, 7));

/** 確定済み期の打刻修正に添える注記（裁定315・店側モーダル／今日タブ／本人の申請で同文） */
export const POST_FINALIZE_NOTE = "この日の給与は確定済みです。修正は記録され、差額は翌期の調整で扱います";
