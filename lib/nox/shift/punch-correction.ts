// ★0154 D1（2026-09-24・裁定291 追補1 D／294-1〜4／295-1）: 打刻の修正申請の純関数（DB を知らない）。
//   店側（今日タブ「修正」＝owner／manager の申請＝確定）と本人側（/mine の申請フォーム・申請一覧・確認／異議）で共有。
//   用語＝casts.employment で「労働時間」（雇用）／「稼働実績」（委託・null）を出し分け（291 追補1 A）。
export type PunchKind = "in" | "out";
export type Decision = "pending" | "approved" | "rejected";
export type Ack = "unconfirmed" | "confirmed" | "disputed";
export type CorrectionRow = {
  id: string; cast_id: string; punch_id: string | null; biz_date: string; kind: string;
  before_at: string | null; after_at: string | null; reason: string;
  decision: string; decide_reason: string | null; ack: string; ack_at: string | null; requested_at: string; decided_at: string | null;
};

/** 用語: 雇用＝労働時間／委託（null 含む）＝稼働実績 */
export const termOf = (employment: string | null | undefined): string => (employment === "雇用" ? "労働時間" : "稼働実績");
export const KIND_LABEL: Record<PunchKind, string> = { in: "出勤", out: "退勤" };
export const HM_30 = /^([0-3]\d|4[0-7]):[0-5]\d$/;

/** 営業日＋'HH:MM'（0-47 域＝翌日は 24 以上）→ ISO（+09:00 基準の瞬間）。形が違えば null */
export function jstIsoOf(biz: string, hm: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(biz) || !HM_30.test(hm)) return null;
  const [h, m] = hm.split(":").map(Number);
  const base = Date.parse(biz + "T00:00:00+09:00");
  if (Number.isNaN(base)) return null;
  return new Date(base + (h * 60 + m) * 60_000).toISOString();
}

/** ISO → 営業日基準の 'HH:MM'（営業日の 0:00 JST からの経過＝翌 2:00 は '26:00'）。営業日が無ければ JST の HH:MM */
export function hmOnBizOf(iso: string, biz?: string | null): string {
  const t = Date.parse(iso);
  if (biz) {
    const base = Date.parse(biz + "T00:00:00+09:00");
    const min = Math.round((t - base) / 60_000);
    if (min >= 0 && min < 48 * 60) return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  }
  const d = new Date(t + 9 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** 申請の初期値: 既存の打刻があれば「その打刻を直す」（punch_id・時刻＝現在値）、無ければ「打刻を追加」（時刻＝確定シフトの開始／終了・無ければ空） */
export function requestInitOf(input: { kind: PunchKind; biz: string; punchId?: string | null; punchAtIso?: string | null; shiftStartHm?: string | null; shiftEndHm?: string | null }): { mode: "update" | "insert"; punchId: string | null; hm: string } {
  if (input.punchId && input.punchAtIso) return { mode: "update", punchId: input.punchId, hm: hmOnBizOf(input.punchAtIso, input.biz) };
  const hm = input.kind === "in" ? input.shiftStartHm ?? "" : input.shiftEndHm ?? "";
  return { mode: "insert", punchId: null, hm: HM_30.test(hm) ? hm : "" };
}

export type RequestArgs = { p_cast_id: string; p_punch_id: string | null; p_biz_date: string; p_kind: PunchKind; p_after_at: string; p_reason: string };
/** RPC 引数の組み立て＝時刻の形（0-47 域）と理由（1〜200 字）を先に検査（二層目は RPC の 'bad type'／'reason required'） */
export function requestArgsOf(input: { castId: string; punchId: string | null; biz: string; kind: PunchKind; hm: string; reason: string }): { ok: true; args: RequestArgs } | { ok: false; err: string } {
  const reason = input.reason.trim();
  if (reason.length === 0) return { ok: false, err: "理由を入力してください" };
  if (reason.length > 200) return { ok: false, err: "理由は 200 字までです" };
  const iso = jstIsoOf(input.biz, input.hm.trim());
  if (!iso) return { ok: false, err: "時刻は HH:MM（00:00〜47:59）で入力してください" };
  return { ok: true, args: { p_cast_id: input.castId, p_punch_id: input.punchId, p_biz_date: input.biz, p_kind: input.kind, p_after_at: iso, p_reason: reason } };
}

export const decisionLabelOf = (d: string): string => (d === "pending" ? "審査中" : d === "approved" ? "承認" : d === "rejected" ? "却下" : d);
export const ackLabelOf = (a: string): string => (a === "confirmed" ? "確認済み" : a === "disputed" ? "異議あり" : "未確認");

/** 本人が押せる確認の選択肢＝approved の行だけ（pending は 'not decided'・rejected は確認の対象外＝表示のみ） */
export function ackOptionsOf(row: Pick<CorrectionRow, "decision">): Ack[] {
  return row.decision === "approved" ? ["confirmed", "disputed"] : [];
}

/** 店側の warn＝approved かつ 異議あり */
export function disputedOf<T extends Pick<CorrectionRow, "decision" | "ack">>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.decision === "approved" && r.ack === "disputed");
}

/** 一覧の 1 行の要約: 「出勤 9/22 20:00 → 20:30」／削除は「→ 取消」／新規は「（追加）」 */
export function correctionSummaryOf(row: Pick<CorrectionRow, "kind" | "biz_date" | "before_at" | "after_at">): string {
  const md = (() => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(row.biz_date); return m ? `${Number(m[1])}/${Number(m[2])}` : row.biz_date; })();
  const k = KIND_LABEL[row.kind as PunchKind] ?? row.kind;
  const b = row.before_at ? hmOnBizOf(row.before_at, row.biz_date) : null;
  const a = row.after_at ? hmOnBizOf(row.after_at, row.biz_date) : null;
  if (b && a) return `${k} ${md} ${b} → ${a}`;
  if (b && !a) return `${k} ${md} ${b} → 取消`;
  return `${k} ${md} ${a ?? "—"}（追加）`;
}
