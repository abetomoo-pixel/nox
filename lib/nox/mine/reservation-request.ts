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

// ★便 M-4（2026-10-26・Agoora 確定 10/26 ⑤）: 新規のお客様の予約申請＝仮の呼び名＋人数（reservation_request_guest＝0183・フラグ MIG_0183_APPLIED）。
//   来店時（レジの予約→来店）に顧客カルテを作って紐づけ＝申請したキャストの担当客に自動登録（DB 側）。切替の語はスタッフ側（レジ→予約→新規予約）と同じ「フリー入力／既存客から」。
export type RsvCustomerMode = "existing" | "guest";
export const RSV_CUSTOMER_MODE_OPTIONS = [["existing", "既存客から"], ["guest", "フリー入力"]] as const;
export type RsvGuestArgs = { p_store_id: string; p_guest_name: string; p_party_size: number; p_at: string; p_kind: string };
export function rsvGuestArgsOf(input: { storeId: string; guestName: string; partySize: string; date: string; time: string; kind: string; now?: Date }): { ok: true; args: RsvGuestArgs } | { ok: false; err: string } {
  const name = input.guestName.trim();
  if (!name) return { ok: false, err: "お客様の呼び名を入力してください（例: 田中様）" };
  if (name.length > 40) return { ok: false, err: "呼び名は 40 文字までです" };
  const n = Number(input.partySize);
  if (!Number.isInteger(n) || n < 1 || n > 20) return { ok: false, err: "人数は 1〜20 で入力してください" };
  const base = rsvRequestArgsOf({ storeId: input.storeId, customerId: "guest", date: input.date, time: input.time, kind: input.kind, now: input.now });
  if (!base.ok) return base;
  return { ok: true, args: { p_store_id: input.storeId, p_guest_name: name, p_party_size: n, p_at: base.args.p_at, p_kind: input.kind } };
}
/** 一覧の名前＝顧客カルテ→呼び名（新規）→「お客様」 */
export function rsvRowNameOf(r: { customers: RsvRequestRow["customers"]; guest_name?: string | null }): { name: string; isNew: boolean } {
  const c = Array.isArray(r.customers) ? r.customers[0] : r.customers;
  if (c?.name) return { name: /様$/.test(c.name) ? c.name : `${c.name} 様`, isNew: false };
  if (r.guest_name) return { name: /様$/.test(r.guest_name) ? r.guest_name : `${r.guest_name} 様`, isNew: true };
  return { name: "お客様", isNew: false };
}
export const RSV_NEW_BADGE = "新規";
