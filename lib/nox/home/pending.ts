// ★便 SH-UI-c2 C2-13（2026-10-23）: HOME の「要承認」カードとベル（純関数・DB を知らない）。
//   種別＝①割引・無料の申請（approvals pending）②シフト希望の未処理（shift_wishes pending＝期間ごとの件数）③ノルマ未達の減額の提案（給与 preview の normProposal）
//   ④退勤記録なし（in はあるが out が無い営業日＝今日より前）。ベルの数＝カードの見出しの N＝①＋②＋④（③は提案＝給与画面で確認・数えない）。
//   スタッフ＝自分の申請の状態（承認待ち／承認／却下）だけ 1 行。
import { bizDateOf } from "../biz-date";

export type PendingApproval = { id: string; checkId: string; seatName: string | null; payGroup: string; type: string; amount: number; reason: string | null; requestedBy: string | null; createdAt: string; status?: string };
export type PendingWishGroup = { key: string; label: string; n: number; href: string; periodId: string | null };
export type PendingProposal = { castId: string; castName: string; amount: number; text: string };
export type PendingMissingOut = { castId: string; castName: string; bizDate: string };
/** ★M-117（2026-11-06・便 F）: 予約の承認待ち（reservations.status='pending'＝キャストの申請）＝要承認の先頭・ベルの数に含める・今日タブの担当キャストの行にも同じ取得で出す */
export type PendingReservation = { id: string; storeId: string; castId: string | null; castName: string | null; customerName: string | null; guestName: string | null; reservedAt: string; partySize: number | null; nomType: string | null; status: string; memo: string | null; requestedByCast: boolean };
export type PendingSummary = {
  approvals: PendingApproval[]; wishes: PendingWishGroup[]; proposals: PendingProposal[]; missingOut: PendingMissingOut[];
  /** ★M-117: 予約の承認待ち（来店時刻の近い順・時刻超過が先頭） */
  reservations?: PendingReservation[];
  /** スタッフ＝自分の申請（最新 5 件） */
  mine?: PendingApproval[];
  total: number;
};

/** 見出しの N＝予約の承認待ち（★M-117）＋割引・無料の申請＋シフト希望の未処理＋退勤記録なし（提案は数えない） */
export const pendingTotalOf = (s: Pick<PendingSummary, "approvals" | "wishes" | "missingOut"> & { reservations?: readonly unknown[] }): number => (s.reservations?.length ?? 0) + s.approvals.length + s.wishes.reduce((a, w) => a + w.n, 0) + s.missingOut.length;

// ★M-117: 予約の承認待ちの純関数（表示の語・並び・時刻超過の印）
export const RESERVATION_NOM_LABEL: Record<string, string> = { hon: "本指名", jonai: "場内", dohan: "同伴", free: "フリー" };
export const reservationHmOf = (iso: string): string => new Date(iso).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });
const mdOf = (iso: string): string => { const d = new Date(new Date(iso).getTime() + 9 * 3600_000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
export const reservationCustomerOf = (r: Pick<PendingReservation, "customerName" | "guestName">): string => r.customerName ?? r.guestName ?? "（名前未設定）";
/** 時刻超過＝来店予定時刻を過ぎた承認待ち（印をつけて先頭） */
export const reservationOverdueOf = (r: Pick<PendingReservation, "reservedAt">, now: number = Date.now()): boolean => new Date(r.reservedAt).getTime() < now;
/** 来店時刻の近い順（時刻超過＝過去＝自然に先頭） */
export const sortPendingReservations = <T extends Pick<PendingReservation, "reservedAt" | "id">>(rows: readonly T[]): T[] => [...rows].sort((a, b) => a.reservedAt.localeCompare(b.reservedAt) || a.id.localeCompare(b.id));
/** ホームの 1 行＝種別・日時・客名・人数・担当・申請元（375 は l1／l2 の 2 行に折れる） */
export function reservationLineOf(r: PendingReservation, now: number = Date.now()): { head: string; sub: string; overdue: boolean } {
  const kind = r.nomType ? RESERVATION_NOM_LABEL[r.nomType] ?? r.nomType : "予約";
  const head = `${kind} ${mdOf(r.reservedAt)} ${reservationHmOf(r.reservedAt)} ${reservationCustomerOf(r)}${r.partySize ? ` ${r.partySize}名` : ""}`;
  const sub = [r.castName ? `担当 ${r.castName}` : null, r.requestedByCast ? "申請 キャスト" : "申請 店", r.memo ? r.memo : null].filter(Boolean).join("・");
  return { head, sub, overdue: reservationOverdueOf(r, now) };
}
/** 今日タブ＝担当キャストの名前の下の 1 行＝「同伴の申請 20:00 R様 2名」／承認済みの緑チップ「同伴 20:00 R様」 */
export const reservationTodayLineOf = (r: PendingReservation): string => `${r.nomType ? RESERVATION_NOM_LABEL[r.nomType] ?? r.nomType : "予約"}の申請 ${reservationHmOf(r.reservedAt)} ${reservationCustomerOf(r)}${r.partySize ? ` ${r.partySize}名` : ""}`;
export const reservationBookedChipOf = (r: PendingReservation): string => `${r.nomType ? RESERVATION_NOM_LABEL[r.nomType] ?? r.nomType : "予約"} ${reservationHmOf(r.reservedAt)} ${reservationCustomerOf(r)}`;
export const RESERVATION_OVERDUE_MARK = "時刻超過";
export const RESERVATION_OPEN_REGISTER = "レジの予約で開く ›";

/** 経過分（申請から今まで） */
export const elapsedMinOf = (createdAt: string, now: number = Date.now()): number => Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60_000));
export const elapsedTextOf = (min: number): string => (min < 60 ? `${min} 分前` : min < 60 * 24 ? `${Math.floor(min / 60)} 時間前` : `${Math.floor(min / 1440)} 日前`);

/** 申請の 1 行目＝「割引 ¥10,000・A3（伝票 A）」・2 行目＝理由・申請者・経過 */
export function approvalLineOf(a: PendingApproval, now: number = Date.now()): { head: string; sub: string } {
  const kind = a.type === "free" ? "無料" : "割引";
  const head = `${kind} ¥${a.amount.toLocaleString("en-US")}・${a.seatName ?? "卓"}（伝票 ${a.payGroup}）`;
  const sub = [a.reason ? a.reason : null, a.requestedBy ? `申請 ${a.requestedBy}` : null, elapsedTextOf(elapsedMinOf(a.createdAt, now))].filter(Boolean).join("・");
  return { head, sub };
}

/** シフト希望の未処理＝期間（start〜end）ごとの件数。期間に入らない希望は「期間なし（月）」 */
export function wishGroupsOf(wishes: readonly { date: string }[], periods: readonly { id: string; start_date: string; end_date: string }[], storeId: string): PendingWishGroup[] {
  const m = new Map<string, PendingWishGroup>();
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  for (const w of wishes) {
    const p = periods.find((x) => w.date >= x.start_date && w.date <= x.end_date) ?? null;
    const key = p ? p.id : w.date.slice(0, 7);
    const cur = m.get(key) ?? { key, label: p ? `${md(p.start_date)}〜${md(p.end_date)}` : `${Number(w.date.slice(5, 7))}月（期間なし）`, n: 0, href: `/shift?store=${storeId}&date=${p ? p.start_date : w.date}&tab=queue`, periodId: p ? p.id : null };
    cur.n += 1; m.set(key, cur);
  }
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "ja"));
}

/** 退勤記録なし＝営業日ごとに in はあるが out が無い（今日より前の営業日だけ） */
export function missingOutOf(punches: readonly { cast_id: string; type: string; punched_at: string }[], cutoffHm: string, todayBiz: string, nameOf: (castId: string) => string): PendingMissingOut[] {
  const byKey = new Map<string, { castId: string; bizDate: string; in: boolean; out: boolean }>();
  for (const p of punches) {
    const bd = bizDateOf(p.punched_at, cutoffHm);
    if (bd >= todayBiz) continue;
    const k = `${p.cast_id}|${bd}`;
    const cur = byKey.get(k) ?? { castId: p.cast_id, bizDate: bd, in: false, out: false };
    if (p.type === "in") cur.in = true; else if (p.type === "out") cur.out = true;
    byKey.set(k, cur);
  }
  return [...byKey.values()].filter((x) => x.in && !x.out).sort((a, b) => a.bizDate.localeCompare(b.bizDate) || a.castId.localeCompare(b.castId)).map((x) => ({ castId: x.castId, castName: nameOf(x.castId), bizDate: x.bizDate }));
}

/** ベル＝未処理の合計（0 は印なし） */
export const bellLabelOf = (n: number): string => (n > 0 ? `要承認 ${n} 件` : "要承認なし");
export const APPROVAL_STATUS_LABEL: Record<string, string> = { pending: "承認待ち", approved: "承認", rejected: "却下" };
/** 却下の理由（必須・1〜200 字）。RPC approval_decide には理由の引数が無い＝画面で確認して記録は audit なし（0175 行き） */
export const rejectReasonOkOf = (s: string | null | undefined): boolean => { const v = (s ?? "").trim(); return v.length >= 1 && v.length <= 200; };
