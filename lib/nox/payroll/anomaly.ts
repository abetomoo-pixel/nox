// ★X-13-27（便 X-13d-2a・2026-10-09）: 給与プレビューの「打刻の不整合」の数え方（純関数・collect.ts が呼ぶ）。
//   未来日（営業日の今日より後）の確定シフトは打刻が無いのが当然＝不整合に数えない（旧: shift あり＋in なし→rawOut noout→不整合 +1 で、
//   当月の先の確定シフトが全部「不整合」に積まれていた＝デモ MUSE 2026-10 で 25 件）。退勤なし（missingOut）も同じく今日までだけ。
//   本番 CLUB NOX も同じ経路（lib・RPC 不変・mig 不要）。
export type AnomalyDay = { bizDate: string; anomalies: readonly string[]; rawOutType: string; finalType: string };

export function anomalyFlagsOf(d: AnomalyDay, todayBiz: string): { counted: boolean; missingOut: boolean } {
  if (d.bizDate > todayBiz) return { counted: false, missingOut: false };
  const outAnom = d.rawOutType === "noout" || d.rawOutType === "early" || d.rawOutType === "over";
  return { counted: d.anomalies.length > 0 || outAnom, missingOut: d.rawOutType === "noout" && (d.finalType === "ok" || d.finalType === "late") };
}
