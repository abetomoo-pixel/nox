// ★裁定326-4／追補1-1・1-5／追補2-3（0160 reservation_request／reservation_decide・便 M3-2・2026-10-01）: cast の予約申請の純関数（DB を知らない）。
//   申請＝担当客（customers RLS＝cast_id が自分）から選ぶ・日付・来店予定時刻・区分（本指名／同伴）→ reservation_request(p_store_id, p_customer_id, p_at, p_kind)＝4 引数。
//   人数・備考は RPC の引数に無い＝送らない（店が予約を整える・仮決め）。取消の RPC も無い＝「店にご連絡ください」（仮決め）。
//   自分の申請一覧＝reservations の requested_by_cast が自分の行（RLS で cast_id＝自分の行だけ見える）。status: pending（承認待ち）／booked（承認＝通常の予約）／rejected（却下＋理由）。

export const RSV_KIND_OPTIONS: ReadonlyArray<readonly [string, string]> = [["hon", "本指名"], ["dohan", "同伴"]];
export const RSV_REQ_STATUS_LABEL: Record<string, string> = { pending: "承認待ち", booked: "承認", rejected: "却下", visited: "来店済", no_show: "不来店", cancelled: "取消" };
export const RSV_REQ_STATUS_COLOR: Record<string, string> = { pending: "var(--champ)", booked: "var(--ok)", rejected: "var(--bad)", visited: "var(--sub)", no_show: "var(--sub)", cancelled: "var(--sub)" };
export const RSV_REQ_SENT = "申請しました（店の承認をお待ちください）";
export const RSV_REQ_CANCEL_NOTE = "申請の取消・承認後の変更は店にご連絡ください。人数や卓の希望も店で設定します";
export const RSV_REQ_EMPTY = "担当客がいないため申請できません（担当客は店が登録します）";

export type RsvRequestArgs = { p_store_id: string; p_customer_id: string; p_at: string; p_kind: "hon" | "dohan" };

/** 入力 → reservation_request の 4 引数。来店日時は JST（+09:00）の ISO・今より後だけ */
export function rsvRequestArgsOf(input: { storeId: string; customerId: string; date: string; time: string; kind: string; now?: Date }): { ok: true; args: RsvRequestArgs } | { ok: false; err: string } {
  if (!input.storeId) return { ok: false, err: "店舗が特定できません" };
  if (!input.customerId) return { ok: false, err: "担当客を選んでください" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, err: "来店日を選んでください" };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) return { ok: false, err: "来店予定時刻を入力してください（00:00〜23:59）" };
  if (input.kind !== "hon" && input.kind !== "dohan") return { ok: false, err: "区分は本指名か同伴から選んでください" };
  const at = `${input.date}T${input.time}:00+09:00`;
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) return { ok: false, err: "来店日時が正しくありません" };
  if (ms <= (input.now ?? new Date()).getTime()) return { ok: false, err: "来店日時は今より後にしてください" };
  return { ok: true, args: { p_store_id: input.storeId, p_customer_id: input.customerId, p_at: at, p_kind: input.kind } };
}

export type RsvRequestRow = { id: string; reserved_at: string; nom_type: string | null; status: string; rejected_reason: string | null; customers: { name: string } | { name: string }[] | null };

/** 自分の申請一覧の並び＝承認待ちを先・あとは来店日時の新しい順・最大 limit 件 */
export function rsvRequestRowsOf<T extends Pick<RsvRequestRow, "status" | "reserved_at">>(rows: readonly T[], limit = 20): T[] {
  const rank = (s: string) => (s === "pending" ? 0 : 1);
  return [...rows].sort((a, b) => rank(a.status) - rank(b.status) || (a.reserved_at < b.reserved_at ? 1 : a.reserved_at > b.reserved_at ? -1 : 0)).slice(0, limit);
}

/** 「M/D HH:MM」（JST） */
export const rsvWhenLabelOf = (iso: string): string =>
  new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** customers embed（1 件／配列／null）→ 名前（取れないときは fallback） */
export function rsvCustomerNameOf(customers: RsvRequestRow["customers"], fallback = "お客様"): string {
  const c = Array.isArray(customers) ? customers[0] : customers;
  return c?.name ? `${c.name} 様` : fallback;
}
