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

// ★裁定342（便 P169・2026-10-13・起票101 の解決）: 未来日（営業日の今日より後）の確定シフトは、日数・当欠（absentN）・遅刻（lateN）・
//   シフト基準の時給（pay_time_basis 'shift'＝shiftHoursByDate）のいずれにも数えない。判定は営業日の終了時点まで（今日は含む）。
//   旧: matchPunches の absentN は「確定シフトあり＋in なし」を未来日でも +1＝プレビューの「当欠 N」に当月の先のシフトが全部積まれていた
//   （デモ MUSE 2026-10 で 21・本番 CLUB NOX で 47〜57）。RPC 不変・mig 不要＝X-13-27 と同じ経路（collect.ts が todayBiz を渡す）。
export type CountDay = { bizDate: string; finalType: string };
/** 営業日の今日までの日だけで days（final ok／late）・lateN・absentN を数える（未来日は 0） */
export function punchCountsUpToOf(days: readonly CountDay[], todayBiz: string): { days: number; lateN: number; absentN: number } {
  let n = 0, lateN = 0, absentN = 0;
  for (const d of days) {
    if (d.bizDate > todayBiz) continue;
    if (d.finalType === "ok") n += 1;
    else if (d.finalType === "late") { n += 1; lateN += 1; }
    else if (d.finalType === "absent") absentN += 1;
  }
  return { days: n, lateN, absentN };
}
/** 確定シフトの時間（bizDate→h）を営業日の今日までに絞る（'shift' 基準の時給の母数＝未来日は含めない） */
export function shiftHoursUpToOf(byDate: Record<string, number>, todayBiz: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [d, h] of Object.entries(byDate)) if (d <= todayBiz) out[d] = h;
  return out;
}
