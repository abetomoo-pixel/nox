// ★0201i（裁定486＋追補・2026-11-13 画面の便 2）: お知らせの「確認しました」と出欠の純関数（DB を知らない）。
//   書くのは notice_ack／notice_rsvp（本人）・notice_set_rsvp（店長以上）・読むのは notice_responses（RLS＝本人の行／owner は org／manager は自店）と notice_response_status。
//   文は相談役の固定（■4 a）。自動の既読（notice_mark_read）はフラグ true でやめる。

export const NOTICE_ACK_BTN = "確認しました";
export const NOTICE_ACKED = "確認済み";
export const RSVP_YES = "参加";
export const RSVP_NO = "不参加";
export const RSVP_CLOSED = "締切を過ぎました";
export const RSVP_CREATE_LABEL = "出欠を取る";
export const RSVP_DUE_LABEL = "回答の締切";

export type RsvpAnswer = "yes" | "no";
export type NoticeRsvpCols = { rsvp?: boolean | null; rsvp_at?: string | null; rsvp_place?: string | null; rsvp_due?: string | null };
export type NoticeAudienceCols = { audience: string; cast_ids?: string[] | null; staff_ids?: string[] | null };
export type MyResponse = { acked_at: string | null; rsvp: RsvpAnswer | null } | null;

/** 宛先か（notice_audience_has の鏡＝表示だけ・権威は RPC）。キャスト＝all／cast は cast_ids が null か本人を含む・targets は cast_ids に本人。
 *  スタッフ＝all／staff・targets は staff_ids に本人。店長＝targets の staff_ids に本人のときだけ。owner は入れない。 */
export function noticeAudienceHasOf(n: NoticeAudienceCols, me: { kind: "cast"; castId: string } | { kind: "membership"; role: string; membershipId: string }): boolean {
  if (me.kind === "cast") {
    if (n.audience === "all" || n.audience === "cast") return n.cast_ids == null || n.cast_ids.includes(me.castId);
    if (n.audience === "targets") return !!n.cast_ids && n.cast_ids.includes(me.castId);
    return false;
  }
  if (me.role === "staff" && (n.audience === "all" || n.audience === "staff")) return true;
  if ((me.role === "staff" || me.role === "manager") && n.audience === "targets") return !!n.staff_ids && n.staff_ids.includes(me.membershipId);
  return false;
}

/** 回答の締切（無ければ開催の日時）を過ぎたか（notice_rsvp の 'rsvp closed' の鏡） */
export function rsvpClosedOf(n: NoticeRsvpCols, nowMs: number): boolean {
  if (!n.rsvp) return false;
  const lim = n.rsvp_due ?? n.rsvp_at;
  return !!lim && nowMs > Date.parse(lim);
}

/** 本人の「やること」があるか＝未確認、または出欠を取るのに未回答で締切前 */
export function noticePendingOf(n: NoticeRsvpCols, mine: MyResponse, nowMs: number): boolean {
  if (!mine || !mine.acked_at) return true;
  return !!n.rsvp && mine.rsvp === null && !rsvpClosedOf(n, nowMs);
}

/** ナビとホームの件数＝未確認・未回答のお知らせの数 */
export function noticePendingCountOf(notices: readonly (NoticeRsvpCols & { id: string })[], mine: ReadonlyMap<string, MyResponse>, nowMs: number): number {
  return notices.filter((n) => noticePendingOf(n, mine.get(n.id) ?? null, nowMs)).length;
}

const jst = (iso: string) => new Date(Date.parse(iso) + 9 * 3600_000);
const two = (x: number) => String(x).padStart(2, "0");
/** 「11/20（金）19:00」 */
export function rsvpWhenOf(iso: string): string {
  const d = jst(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${"日月火水木金土"[d.getUTCDay()]}）${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}
/** 出欠の行＝日時・場所・回答の締切 */
export function rsvpLinesOf(n: NoticeRsvpCols): string[] {
  if (!n.rsvp || !n.rsvp_at) return [];
  return [`日時 ${rsvpWhenOf(n.rsvp_at)}`, ...(n.rsvp_place ? [`場所 ${n.rsvp_place}`] : []), ...(n.rsvp_due ? [`${RSVP_DUE_LABEL} ${rsvpWhenOf(n.rsvp_due)}`] : [])];
}

export type ResponseStatusRow = { subject_kind: string; subject_id: string; name: string | null; is_active: boolean; acked_at: string | null; rsvp: string | null; rsvp_updated_at?: string | null };
/** 作る側の集計＝確認 n／m・参加 a・不参加 b・未回答 c（m＝宛先の人数＝notice_response_status の行数） */
export function responseSummaryOf(rows: readonly ResponseStatusRow[]): { acked: number; total: number; yes: number; no: number; none: number } {
  const acked = rows.filter((r) => r.acked_at).length, yes = rows.filter((r) => r.rsvp === "yes").length, no = rows.filter((r) => r.rsvp === "no").length;
  return { acked, total: rows.length, yes, no, none: rows.length - yes - no };
}
export const ackLineOf = (s: { acked: number; total: number }): string => `確認 ${s.acked}／${s.total}`;
export const rsvpCountLineOf = (s: { yes: number; no: number; none: number }): string => `${RSVP_YES} ${s.yes}・${RSVP_NO} ${s.no}・未回答 ${s.none}`;
/** 人ごとの 1 行の状態 */
export const personStateOf = (r: ResponseStatusRow, rsvp: boolean): string =>
  rsvp ? (r.rsvp === "yes" ? RSVP_YES : r.rsvp === "no" ? RSVP_NO : r.acked_at ? `${NOTICE_ACKED}・未回答` : "未確認") : (r.acked_at ? NOTICE_ACKED : "未確認");

/** 作る側の入力の検査（notice_set_rsvp の鏡＋作るときは未来の日時だけ）＝日時は必須・締切は日時以前・場所は 120 字まで。値は ISO（タイムゾーン付き） */
export function rsvpFormErrOf(v: { at: string; due: string; place: string }, nowMs: number): string | null {
  if (!v.at) return "出欠の日時を入れてください";
  const at = Date.parse(v.at);
  if (Number.isNaN(at)) return "出欠の日時が正しくありません";
  if (at <= nowMs) return "出欠の日時は今より後にしてください";
  if (v.due) { const due = Date.parse(v.due); if (Number.isNaN(due)) return "回答の締切が正しくありません"; if (due > at) return "回答の締切は出欠の日時より前にしてください"; }
  if (v.place.trim().length > 120) return "場所は 120 字までです";
  return null;
}
/** datetime-local（'2026-11-20T19:00'＝JST の壁時計）→ ISO（+09:00） */
export const jstLocalToIso = (v: string): string => (v ? `${v.length === 16 ? `${v}:00` : v}+09:00` : "");

/** 本人の予定（カレンダーの行）＝出欠を取るお知らせで日時が今日以降の月のもの */
export type RsvpEvent = { id: string; date: string; dow: string; time: string; title: string; answer: RsvpAnswer | null };
export function rsvpEventsOf(notices: readonly (NoticeRsvpCols & { id: string; title: string })[], mine: ReadonlyMap<string, MyResponse>, month: string, today: string): RsvpEvent[] {
  return notices.filter((n) => n.rsvp && n.rsvp_at).map((n) => {
    const d = jst(n.rsvp_at as string);
    const date = `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
    return { id: n.id, date, dow: "日月火水木金土"[d.getUTCDay()], time: `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`, title: n.title, answer: mine.get(n.id)?.rsvp ?? null };
  }).filter((e) => e.date.slice(0, 7) === month && e.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/** RPC の英字 → 和文（notice_ack／notice_rsvp／notice_set_rsvp） */
export function noticeRespErrJa(msg: string | null | undefined): string {
  const m = (msg ?? "").trim();
  if (m === "rsvp closed") return RSVP_CLOSED;
  if (m === "not rsvp") return "このお知らせは出欠を取っていません";
  if (m === "bad answer") return "参加か不参加を選んでください";
  if (m === "bad rsvp_at") return "出欠の日時を入れてください";
  if (m === "bad rsvp_due") return "回答の締切は出欠の日時より前にしてください";
  if (m === "bad rsvp_place") return "場所は 120 字までです";
  if (m === "bad audience") return "オーナー宛のお知らせでは出欠を取れません";
  if (m === "rsvp answered") return "回答があるため出欠をやめられません";
  if (m === "forbidden") return "このお知らせの宛先ではありません";
  return "";
}
