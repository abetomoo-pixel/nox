// ★便 ON-3（2026-10-26・0176 ★5 (d)・裁定413 の「相手に通知」・SH-UI-b 0176 行き）: キャスト 1 人あての通知（cast_notifications）の文面と未読の純関数。DB を知らない。
//   kind 6 種＝0176 の CHECK と 1 字一致（shift_added／shift_removed／shift_changed／shift_proposed／availability_changed／other）。
//   作る側＝店（owner／manager／staff）が cast_notification_create を呼ぶ（lib/nox/people/notify.ts）。読む側＝/mine（お知らせの上に「あなたへの通知」・開いたら既読＝cast_notification_read）。
//   ナビの未読＝お知らせの未読（326-6）＋通知の未読（本便）。宛先つきお知らせ（notices.cast_ids）は本人を含む行だけ可視（noticeVisibleToCastOf）。
import { fmtWin } from "@/lib/nox/shift-time";

export type CastNotifKind = "shift_added" | "shift_removed" | "shift_changed" | "shift_proposed" | "availability_changed" | "other";
export const CAST_NOTIF_KINDS: readonly CastNotifKind[] = ["shift_added", "shift_removed", "shift_changed", "shift_proposed", "availability_changed", "other"];
export const CAST_NOTIF_KIND_LABEL: Record<CastNotifKind, string> = {
  shift_added: "シフト追加", shift_removed: "シフト取消", shift_changed: "シフト変更", shift_proposed: "確認のお願い", availability_changed: "基本の働き方", other: "お知らせ",
};
export const CAST_NOTIF_BODY_MAX = 500;

const DOW = ["日", "月", "火", "水", "木", "金", "土"];
/** 'YYYY-MM-DD' → '10/28（水）'（UTC で曜日を解く＝shift-board の dowOf と同じ） */
export function mdDowOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}（${dow}）`;
}
const win = (start: string, end: string) => fmtWin(start, end); // ★便 ON-3 live: 「26:00」でなく「翌02:00」（他の画面と同じ表記）

/** 確定シフトの追加（shift_set で confirmed・一括確定）＝「10/28（水）20:00〜01:00 のシフトが確定しました」 */
export const shiftAddedBody = (date: string, start: string, end: string): string => `${mdDowOf(date)} ${win(start, end)} のシフトが確定しました`;
/** 確定シフトの取消（shift_remove） */
export const shiftRemovedBody = (date: string, start: string, end: string): string => `${mdDowOf(date)} ${win(start, end)} のシフトが取り消されました`;
/** 確定シフトの時間変更（shift_set で時間だけ変更） */
export const shiftChangedBody = (date: string, before: { start: string; end: string }, after: { start: string; end: string }): string =>
  `${mdDowOf(date)} のシフトが ${win(before.start, before.end)} → ${win(after.start, after.end)} に変わりました`;
/** 送り返し（shift_propose）＝本人の確認待ち */
export const shiftProposedBody = (date: string, start: string, end: string): string => `${mdDowOf(date)} ${win(start, end)} のシフト案が届きました。マイページで「確認する」か「辞退」を選んでください`;
/** 店が基本の働き方を更新（availability_set・店側）＝裁定413「相手に通知」 */
export const AVAILABILITY_CHANGED_BODY = "店が「基本の働き方」を更新しました。マイページで内容を確認してください";
/** 催促（C2-13）＝募集中の期間の希望が未提出 */
export function remindWishBody(p: { start_date: string; end_date: string; wish_deadline: string | null }): string {
  const md = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
  return `シフト希望（${md(p.start_date)}〜${md(p.end_date)}）の提出をお願いします${p.wish_deadline ? `。締切 ${md(p.wish_deadline)}` : ""}`;
}
/** ref＝「表:id」（120 字まで＝RPC が left(120)） */
export const notifRefOf = (table: "shifts" | "shift_periods" | "availability", id: string): string => `${table}:${id}`;

export type CastNotifRow = { id: string; kind: string; body: string; ref: string | null; read_at: string | null; created_at: string };
export const unreadNotifCountOf = (rows: readonly { read_at: string | null }[]): number => rows.filter((r) => r.read_at === null).length;
/** ナビ「お知らせ（N）」の N＝お知らせの未読＋通知の未読 */
export const mineNavUnreadOf = (noticeUnread: number, notifUnread: number): number => Math.max(0, noticeUnread) + Math.max(0, notifUnread);
/** 宛先つきお知らせ（notices.cast_ids・0176 ★5 (e)）: null＝従来の全員・配列＝本人を含むときだけ */
export const noticeVisibleToCastOf = (castIds: readonly string[] | null | undefined, myCastId: string | null): boolean =>
  castIds == null || castIds.length === 0 ? true : myCastId !== null && castIds.includes(myCastId);
/** 通知の時刻（JST・'10/26 14:30'） */
export function notifWhenOf(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
export const NOTIF_SECTION_TITLE = "あなたへの通知";
export const NOTIF_EMPTY = "通知はありません。";
export const NOTIF_NEW_BADGE = "新着";
/** 未提出者への一括お知らせ（notice_create_targets）の既定文 */
export function remindNoticeDefaultOf(p: { start_date: string; end_date: string; wish_deadline: string | null }): { title: string; body: string } {
  return { title: "シフト希望の提出のお願い", body: remindWishBody(p) };
}
