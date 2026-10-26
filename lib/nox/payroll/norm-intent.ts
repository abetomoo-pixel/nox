// ★便 M-7（2026-10-26・Agoora 確定 10/26 ⑥）: ノルマ未達の減額＝意思（適用／除外）の表示と、確定時の再計算の純関数（DB を知らない）。
//   意思＝norm_shortfall_intents（0183・run × cast）。金額は確定時（finalize route）に最新の提案額で精算調整に書く＝適用後に罰金等で提案額が変わっても再適用は要らない。
export type NormIntent = { cast_id: string; action: "apply" | "exclude"; reason: string | null; detail: { amount?: number; proposed?: number } | null; decided_at: string };
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
/** バッジ＝「適用する（現在 ¥n）」／「除外（理由）」 */
export const normIntentBadgeOf = (i: NormIntent, currentProposed: number): string => (i.action === "apply" ? `適用する（現在 ${yen(currentProposed)}）` : `除外（${i.reason ?? "理由なし"}）`);
/** 適用後に額が変わった＝「提案額が変わりました ¥旧→¥新」（確認のみ・再適用不要）。変わっていなければ null */
export function normIntentChangedOf(i: NormIntent, currentProposed: number): string | null {
  if (i.action !== "apply") return null;
  const was = Number(i.detail?.proposed ?? NaN);
  return Number.isFinite(was) && was !== currentProposed ? `提案額が変わりました ${yen(was)}→${yen(currentProposed)}（確定時に最新の額で入ります）` : null;
}
/** 確定の前の最終確認＝「未達減額 n 名・合計 ¥m（最新）を精算調整に入れます」（適用の意思があり、まだ調整の行が無い分） */
export function normFinalizeNoteOf(rows: readonly { castId: string; normProposal?: { proposed: number; applied?: number } }[], intents: ReadonlyMap<string, NormIntent>): { n: number; sum: number; text: string } | null {
  const xs = rows.filter((r) => r.normProposal && !r.normProposal.applied && intents.get(r.castId)?.action === "apply" && r.normProposal.proposed > 0);
  if (xs.length === 0) return null;
  const sum = xs.reduce((a, r) => a + (r.normProposal?.proposed ?? 0), 0);
  return { n: xs.length, sum, text: `未達減額 ${xs.length} 名・合計 ${yen(sum)}（最新）を精算調整に入れます` };
}
