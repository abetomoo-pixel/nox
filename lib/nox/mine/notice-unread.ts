// ★裁定326-6（0160 cast_notice_reads・便 M2-3・2026-10-01）: お知らせ未読の純関数（DB を知らない）。
//   未読＝可視のお知らせ（RLS）− 自分の既読行。ナビの文言は「お知らせ（N）」・0 は「お知らせ」。開いたら既読＝notice_mark_read（冪等）。
export function unreadIdsOf(noticeIds: readonly string[], readIds: readonly string[]): string[] {
  const read = new Set(readIds);
  return noticeIds.filter((id) => !read.has(id));
}

export const unreadCountOf = (noticeIds: readonly string[], readIds: readonly string[]): number => unreadIdsOf(noticeIds, readIds).length;

/** ナビ項目の文言（326-6） */
export const noticeNavLabelOf = (unread: number): string => (unread > 0 ? `お知らせ（${unread}）` : "お知らせ");

export const NOTICE_NEW_BADGE = "新着";
