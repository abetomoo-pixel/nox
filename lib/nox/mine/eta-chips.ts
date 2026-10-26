// ★便 M-3（2026-10-26・Agoora 確定 10/26 ④）: /mine 遅刻連絡の見込み時刻＝予定開始からのチップ「＋15／＋30／＋45／＋60／＋90 分」＋「その他」（時刻入力）。DB を知らない。
//   予定開始＝今日の確定シフトの start_hm（無ければチップを出さず時刻入力だけ）。見込みは HH:MM（0〜47 時＝深夜は 24 時超え）で attendance_set_self の p_eta へ。
export const ETA_CHIP_MINUTES = [15, 30, 45, 60, 90] as const;
export type EtaChoice = { kind: "chip"; minutes: number } | { kind: "other" };

const toMin = (hm: string): number | null => { const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const toHm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** 予定開始＋n 分＝見込み（47:59 を超えない）。開始が読めなければ null */
export function etaOfChip(startHm: string | null | undefined, minutes: number): string | null {
  if (!startHm) return null;
  const s = toMin(startHm); if (s === null) return null;
  return toHm(Math.min(47 * 60 + 59, s + minutes));
}
/** チップの文言「＋15 分（20:15）」 */
export const etaChipLabelOf = (startHm: string | null | undefined, minutes: number): string => {
  const e = etaOfChip(startHm, minutes);
  return e ? `＋${minutes} 分（${e}）` : `＋${minutes} 分`;
};
/** 最終打刻が前日分（営業日の切替前）か＝打刻の営業日 < 今日の営業日 */
export const lastPunchPrevDayOf = (punchBizDate: string | null | undefined, bizToday: string): boolean => !!punchBizDate && punchBizDate < bizToday;
export const LAST_PUNCH_PREV_NOTE = "（前日分）";
