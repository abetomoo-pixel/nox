// ★2026-11-22（相談役 14:10 の 3・裁定478）: シフト作成で臨時営業・臨時休業を前もって登録する＝DB を知らない純関数。
//   表は store_special_days（店×営業日で 1 行・closed＝臨時休業／open＝臨時営業＋時刻＋price_dow）。書込は既存の set_store_special_day／remove_store_special_day（owner／自店の manager）。
//   曜日は 0＝日..6＝土（store_business_hours.dow・staffing_needs.dow・price_dow と同じ）。
import type { BusinessHourRow } from "@/lib/nox/business-hours";

export type ShiftSpecialDay = { day: string; kind: string; price_dow?: number | null; open_hm?: string | null; close_hm?: string | null };

const dowOfYmd = (ymd: string): number => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

/** その日の休み＝臨時休業が先・臨時営業なら営業・無ければ曜日の定休（shift_is_closed_day と同じ順） */
export function closedEffOf(ymd: string, closedDows: ReadonlySet<number>, specials: readonly ShiftSpecialDay[]): boolean {
  const sp = specials.find((x) => x.day === ymd);
  if (sp) return sp.kind === "closed";
  return closedDows.has(dowOfYmd(ymd));
}

/** 必要人数を引く曜日＝臨時営業で曜日を選んだ日はその曜日・ほかはその日の曜日（裁定478「臨時営業は選んだ曜日の必要人数」） */
export function needDowOf(ymd: string, specials: readonly ShiftSpecialDay[]): number {
  const sp = specials.find((x) => x.day === ymd);
  return sp && sp.kind === "open" && typeof sp.price_dow === "number" && sp.price_dow >= 0 && sp.price_dow <= 6 ? sp.price_dow : dowOfYmd(ymd);
}

/** その日の営業時間の行（臨時営業の日はその時刻で営業の行に差し替える＝シフトを足すときの既定の時刻） */
export function bhRowsForDayOf(ymd: string, bhRows: readonly BusinessHourRow[], specials: readonly ShiftSpecialDay[]): BusinessHourRow[] {
  const sp = specials.find((x) => x.day === ymd);
  if (!sp || sp.kind !== "open" || !sp.open_hm || !sp.close_hm) return [...bhRows];
  const d = dowOfYmd(ymd);
  const row: BusinessHourRow = { dow: d, is_closed: false, open_hm: sp.open_hm.slice(0, 5), close_hm: sp.close_hm.slice(0, 5) };
  return bhRows.some((r) => r.dow === d) ? bhRows.map((r) => (r.dow === d ? row : r)) : [...bhRows, row];
}

/** 臨時営業で選べる曜日＝定休でない曜日（set_store_special_day の 'bad price dow' の鏡） */
export const openDowChoicesOf = (bhRows: readonly BusinessHourRow[]): number[] => [0, 1, 2, 3, 4, 5, 6].filter((d) => !bhRows.some((r) => r.dow === d && r.is_closed));

/** 選んだ曜日の営業時間（臨時営業の開店・閉店の既定）＝閉店が開店以前なら翌日（24 時超の形）。引けなければ null */
export function openHoursOfDow(dow: number, bhRows: readonly BusinessHourRow[]): { open: string; close: string } | null {
  const r = bhRows.find((x) => x.dow === dow && !x.is_closed && x.open_hm && x.close_hm);
  if (!r) return null;
  const o = r.open_hm!.slice(0, 5), c = r.close_hm!.slice(0, 5);
  const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  const cm = toMin(c) <= toMin(o) ? toMin(c) + 1440 : toMin(c);
  return { open: o, close: `${String(Math.floor(cm / 60)).padStart(2, "0")}:${String(cm % 60).padStart(2, "0")}` };
}

/** 日のモーダルで出すもの（店長以上・過去の日は変えない） */
export type SpecialDayAction =
  | { kind: "none" }
  | { kind: "make_open" }   // 定休日（曜日）＝「この日を臨時営業にする」
  | { kind: "make_closed" } // 営業日＝「この日を臨時休業にする」
  | { kind: "undo_open"; priceDow: number | null }
  | { kind: "undo_closed" };
export function specialDayActionOf(a: { ymd: string; bizToday: string; isManagerUp: boolean; weekdayClosed: boolean; special: ShiftSpecialDay | null }): SpecialDayAction {
  if (!a.isManagerUp || a.ymd < a.bizToday) return { kind: "none" };
  if (a.special?.kind === "open") return { kind: "undo_open", priceDow: typeof a.special.price_dow === "number" ? a.special.price_dow : null };
  if (a.special?.kind === "closed") return { kind: "undo_closed" };
  return a.weekdayClosed ? { kind: "make_open" } : { kind: "make_closed" };
}

/** 臨時休業にする前の確かめ（その日にシフトが入っているとき） */
export const closeConfirmOf = (ymd: string, shiftCount: number): string | null =>
  shiftCount > 0 ? `${ymd} には ${shiftCount} 人のシフトが入っています。臨時休業にしますか？（入っているシフトは消えません。必要なら外してください）` : null;
