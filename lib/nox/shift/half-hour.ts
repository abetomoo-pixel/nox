// ★便 M2 M-16（Agoora 確定 10/27）: 必要人数の時間帯＝30 分刻みの選択肢（00:00〜24:00）。staffing_needs は from_min／to_min が 0〜1440（0095 の CHECK）＝翌表記（24:00 超）は 0189 で器を広げてから。
export const HALF_HOUR_HMS: readonly string[] = Array.from({ length: 49 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const hmToMin = (hm: string | null | undefined): number | null => { const m = /^(\d{1,2}):(\d{2})/.exec(hm ?? ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
/** ★便 M2 M-16（補遺）: 範囲＝店の営業時間（その曜日の open〜close・close が open 以下＝翌日またぎは 24:00 まで＝翌は 0189 の後）。定休日・行なし・読めない＝全範囲 */
export function bandOptionsOf(bh: readonly { dow: number; is_closed: boolean; open_hm: string | null; close_hm: string | null }[], dow: number): { from: string[]; to: string[] } {
  const r = bh.find((x) => x.dow === dow);
  const o = r && !r.is_closed ? hmToMin(r.open_hm) : null; const c = r && !r.is_closed ? hmToMin(r.close_hm) : null;
  const lo = o ?? 0; const hi = o !== null && c !== null && c > o ? c : 1440;
  const inRange = HALF_HOUR_HMS.filter((v) => { const m = hmToMin(v)!; return m >= lo && m <= hi; });
  return inRange.length >= 2 ? { from: inRange.slice(0, -1), to: inRange.slice(1) } : { from: HALF_HOUR_HMS.slice(0, -1), to: HALF_HOUR_HMS.slice(1) };
}
/** ★便 M2 M-16（補遺）: M-3 の「その他」（遅刻の見込み）＝30 分刻みの選択肢（開始から 6 時間ぶん・24 時を超えたら「翌」表記・値は 25:30 の形） */
export function etaOptionsOf(startHm: string | null | undefined): { value: string; label: string }[] {
  const s = hmToMin(startHm) ?? 18 * 60; const base = s - (s % 30);
  return Array.from({ length: 13 }, (_, i) => base + i * 30).filter((m) => m <= 47 * 60 + 30).map((m) => {
    const v = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    return { value: v, label: m >= 1440 ? `翌${String(Math.floor(m / 60) - 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}` : v };
  });
}
/** ★便 M2 M-16（補遺）: 期間一覧の短い表記「10/26〜11/1・締切 10/21」（締切なしは「締切 —」） */
export const periodShortOf = (start: string, end: string, deadline: string | null | undefined): string => {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return `${md(start)}〜${md(end)}・締切 ${deadline ? md(deadline) : "—"}`;
};
/** ★便 M2 M-19: シフトの時刻の選択肢（30 分刻み・開始は 00:00〜23:30・終了は 00:30〜翌23:30＝24 時を超えたら「翌」表記・値は 25:30 の形） */
export function shiftHmOptionsOf(isStart: boolean): { value: string; label: string }[] {
  const maxMin = isStart ? 23 * 60 + 30 : 47 * 60 + 30; const minMin = isStart ? 0 : 30;
  const out: { value: string; label: string }[] = [];
  for (let m = minMin; m <= maxMin; m += 30) {
    const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, "0");
    out.push({ value: `${String(h).padStart(2, "0")}:${mm}`, label: h >= 24 ? `翌${String(h - 24).padStart(2, "0")}:${mm}` : `${String(h).padStart(2, "0")}:${mm}` });
  }
  return out;
}
/** ★便 M2 M-19: 日モーダルの追加シートの状態＝希望あり（出勤の希望）／シフトなし／出勤不可（休みの希望） */
export type DayAddState = "wish" | "none" | "unavailable";
export const DAY_ADD_STATE_LABEL: Record<DayAddState, string> = { wish: "希望あり", none: "シフトなし", unavailable: "出勤不可" };
export function dayAddStateOf(wishesOfDay: readonly { start_hm: string; end_hm: string; kind?: string }[]): { state: DayAddState; wish: { start_hm: string; end_hm: string } | null } {
  if (wishesOfDay.some((w) => (w.kind ?? "work") === "off")) return { state: "unavailable", wish: null };
  const w = wishesOfDay.find((x) => (x.kind ?? "work") !== "off");
  return w ? { state: "wish", wish: { start_hm: w.start_hm, end_hm: w.end_hm } } : { state: "none", wish: null };
}
