// ★便 M2 M-16（Agoora 確定 10/27）: 必要人数の時間帯＝30 分刻みの選択肢（00:00〜24:00）。staffing_needs は from_min／to_min が 0〜1440（0095 の CHECK）＝翌表記（24:00 超）は 0189 で器を広げてから。
import { mig0189On } from "../rules-0175/flag"; // ★0189
export const HALF_HOUR_HMS: readonly string[] = Array.from({ length: 49 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
/** ★0189（M-16 の翌表記・MIG_0189_APPLIED の client）: 翌 24:00（2880 分）までの 30 分刻み（値は 26:00 の形・表示は「翌02:00」） */
export const HALF_HOUR_HMS_2DAY: readonly string[] = Array.from({ length: 97 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const hmToMin = (hm: string | null | undefined): number | null => { const m = /^(\d{1,2}):(\d{2})/.exec(hm ?? ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
/** 時間帯の表示＝24:00 を超えたら「翌02:00」（24:00 ちょうどは「24:00」のまま＝終日の終わり） */
export function bandHmLabelOf(hm: string): string { const m = hmToMin(hm); if (m === null || m <= 1440) return hm; return `翌${String(Math.floor(m / 60) - 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }
/** 分→表示（0189 後の一覧・2880 まで） */
export const bandMinLabelOf = (min: number): string => bandHmLabelOf(`${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);
/** ★便 M2 M-16（補遺）: 範囲＝店の営業時間（その曜日の open〜close・close が open 以下＝翌日またぎは 24:00 まで＝翌は 0189 の後）。定休日・行なし・読めない＝全範囲 */
export function bandOptionsOf(bh: readonly { dow: number; is_closed: boolean; open_hm: string | null; close_hm: string | null }[], dow: number, nextDay: boolean = mig0189On()): { from: string[]; to: string[] } {
  const r = bh.find((x) => x.dow === dow);
  const o = r && !r.is_closed ? hmToMin(r.open_hm) : null; const c = r && !r.is_closed ? hmToMin(r.close_hm) : null;
  // ★0189: 翌日またぎ（close ≤ open）は close＋24h まで（翌表記）・終了の選択肢は翌 24:00（2880）まで広げる（器＝staffing_needs の CHECK to_min ≤ 2880）
  const hi = o !== null && c !== null ? (c > o ? c : nextDay && c <= o ? c + 1440 : 1440) : nextDay ? 2880 : 1440; // 行なし・定休日＝全範囲（0189 後は翌 24:00 まで）
  const lo = o ?? 0;
  const all = nextDay ? HALF_HOUR_HMS_2DAY : HALF_HOUR_HMS;
  const inRange = all.filter((v) => { const m = hmToMin(v)!; return m >= lo && m <= hi; });
  return inRange.length >= 2 ? { from: inRange.slice(0, -1), to: inRange.slice(1) } : { from: all.slice(0, -1), to: all.slice(1) };
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

// ★便 A M-65（2026-11-04・Agoora 決定）: その日のキャストの状態＝4 段＝希望あり（青）／不可（赤＝基本の働き方のその曜日が不可、または希望が休み）／相談（黄＝基本の働き方が相談）／シフトなし（灰）。
//   判定は希望＞基本の働き方。(a) 割当ピッカー（day-add-panel）と (b) まとめて追加（shift-add-form）の 1 本の関数。avail は lib/nox/rules-0175/availability の Avail（ok／ng／ask）・無ければ null。
export type DayCastState = "wish" | "unavailable" | "consult" | "none";
export const DAY_CAST_STATE_LABEL: Record<DayCastState, string> = { wish: "希望あり", unavailable: "不可", consult: "相談", none: "シフトなし" };
export type DayCastJudge = { state: DayCastState; wish: { start_hm: string; end_hm: string } | null; /** 不可の理由＝休み希望／基本の働き方の曜日が不可 */ why: "wish_off" | "avail_ng" | null };
export function dayCastStateOf(wishesOfDay: readonly { start_hm: string; end_hm: string; kind?: string }[], avail: "ok" | "ng" | "ask" | null | undefined): DayCastJudge {
  if (wishesOfDay.some((w) => (w.kind ?? "work") === "off")) return { state: "unavailable", wish: null, why: "wish_off" };
  const w = wishesOfDay.find((x) => (x.kind ?? "work") !== "off");
  if (w) return { state: "wish", wish: { start_hm: w.start_hm, end_hm: w.end_hm }, why: null };
  if (avail === "ng") return { state: "unavailable", wish: null, why: "avail_ng" };
  if (avail === "ask") return { state: "consult", wish: null, why: null };
  return { state: "none", wish: null, why: null };
}
/** 不可の曜日の確認文（選択時に 1 回） */
export const availNgConfirmOf = (dowJa: string): string => `${dowJa}曜は不可の設定です。追加しますか`;

/** ★M-91（2026-11-05）: 基本の働き方の時刻の制限（from_min／to_min＝0〜2879 分）の表示。badge＝「23:00〜翌01:00」（割当モーダル）・cell＝「23:00〜01:00」（まとめて追加のセル＝翌を省く） */
export type AvailTime = { from: number; to: number };
export const availTimeBadgeOf = (t: AvailTime | null | undefined): string | null => (t ? `${bandMinLabelOf(t.from)}〜${bandMinLabelOf(t.to)}` : null);
export const availTimeCellOf = (t: AvailTime | null | undefined): string | null => (t ? `${bandMinLabelOf(t.from)}〜${bandMinLabelOf(t.to % 1440)}` : null);
/** 分 → 'HH:MM'（24 時以降はそのまま 25:00 の形＝シフトの start_hm／end_hm と同じ 0〜47 時） */
export const availHmOf = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
/** 選んだときの初期時間＝希望 → 基本の働き方の時刻 → 営業時間（preset）→ 既定 */
export function initialSpanOf(wish: { start_hm: string; end_hm: string } | null | undefined, avail: AvailTime | null | undefined, preset: readonly [string, string] | null | undefined, fallback: readonly [string, string]): { start: string; end: string } {
  if (wish) return { start: wish.start_hm.slice(0, 5), end: wish.end_hm.slice(0, 5) };
  if (avail) return { start: availHmOf(avail.from), end: availHmOf(avail.to) };
  if (preset) return { start: preset[0], end: preset[1] };
  return { start: fallback[0], end: fallback[1] };
}
