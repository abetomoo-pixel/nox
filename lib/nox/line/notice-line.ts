// ★便 W-10 #21（2026-10-26）: お知らせの LINE 配信の純関数（DB を知らない）。
/** お知らせの対象 → line_links の subject_kind（all＝キャストとスタッフ） */
export function noticeLineSubjectKindsOf(audience: string): ("cast" | "membership")[] {
  if (audience === "cast") return ["cast"];
  if (audience === "staff") return ["membership"];
  return ["cast", "membership"];
}
/** ★2026-11-18 夜（相談役 ⑥ C-1）: 出欠を取るお知らせの LINE の最後の 1 行 */
export const NOTICE_LINE_RSVP_TAIL = "参加・不参加は NOX のお知らせから回答してください。";
/** LINE の本文＝「【店名】タイトル」＋本文（5,000 字で切る＝push の上限）。★C-1: 出欠つき＝件名 → 日時・場所 → 本文 → 参加／不参加の案内（rsvpLines が空なら今までと 1 文字も同じ） */
export function noticeLineTextOf(n: { storeName: string; title: string; body: string; rsvpLines?: readonly string[] }): string {
  const head = `【${n.storeName || "お店"}】${n.title.trim()}`;
  const rs = n.rsvpLines?.length ? n.rsvpLines.join("\n") : null;
  const parts = [head, ...(rs ? [rs] : []), ...(n.body.trim() ? [n.body.trim()] : []), ...(rs ? [NOTICE_LINE_RSVP_TAIL] : [])];
  return parts.join("\n\n").slice(0, 5000);
}
/** 結果の文言（送った人数・送れなかった人数・デモ） */
export function noticeLineResultOf(r: { recipients: number; sent: number; failed: number; skipped: number; demo?: boolean }): string {
  if (r.demo) return `デモのため LINE は送っていません（連携 ${r.recipients} 人）`;
  if (r.recipients === 0) return "LINE を連携している人がいません（掲載だけしました）";
  if (r.skipped === r.recipients) return "LINE の設定（アクセストークン）が未登録のため送れませんでした（店舗設定 › LINE 連携）";
  return `LINE を ${r.sent} 人に送りました${r.failed ? `（${r.failed} 人は送れませんでした）` : ""}`;
}
/** KPI＝連携している人数／未連携（在籍のキャスト＋スタッフのうち line_links が無い人） */
export function lineLinkKpiOf(activeCastIds: readonly string[], activeMemberIds: readonly string[], links: readonly { subject_kind: string; subject_id: string }[]): { linked: number; unlinked: number } {
  const c = new Set(links.filter((l) => l.subject_kind === "cast").map((l) => l.subject_id));
  const m = new Set(links.filter((l) => l.subject_kind === "membership").map((l) => l.subject_id));
  const linked = activeCastIds.filter((id) => c.has(id)).length + activeMemberIds.filter((id) => m.has(id)).length;
  return { linked, unlinked: activeCastIds.length + activeMemberIds.length - linked };
}
