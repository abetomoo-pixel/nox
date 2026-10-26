// ★便 W-10 #21（2026-10-26）: お知らせの LINE 配信の純関数（DB を知らない）。
/** お知らせの対象 → line_links の subject_kind（all＝キャストとスタッフ） */
export function noticeLineSubjectKindsOf(audience: string): ("cast" | "membership")[] {
  if (audience === "cast") return ["cast"];
  if (audience === "staff") return ["membership"];
  return ["cast", "membership"];
}
/** LINE の本文＝「【店名】タイトル」＋本文（5,000 字で切る＝push の上限） */
export function noticeLineTextOf(n: { storeName: string; title: string; body: string }): string {
  const head = `【${n.storeName || "お店"}】${n.title.trim()}`;
  const t = n.body.trim() ? `${head}\n\n${n.body.trim()}` : head;
  return t.slice(0, 5000);
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
