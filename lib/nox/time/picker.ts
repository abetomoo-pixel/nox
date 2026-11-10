// ★M-145（2026-11-10 夜便・Agoora 要望）: 時刻の選択（components/ui/time-input.tsx）の純関数。verify:nox-night1110 の単体対象。
//   時の列＝営業日の順（切替時刻 dayStart の時から 23 時・翌 0 時〜切替の前の時）・分の列＝15 分刻み（00／15／30／45）。
//   値＝保存形式は今のまま（翌は 24 時以降＝26:00）。「翌」の時を選んだら、maxHour が 24 以上なら +24 時で返す・そうでなければ従来の規則（hmPickOf＝after より前なら翌日）。
import { hmPickOf } from "./hhmm";

export const TIME_PICKER_MINUTES = [0, 15, 30, 45] as const;

/** 時の列（営業日の順）。next＝翌（切替の時より前の時）。maxHour が 23 の欄（当日だけ）は「翌」を付けない（0〜23 を切替から並べるだけ）。 */
export function timePickerHoursOf(dayStart: string, maxHour = 47): { h: number; next: boolean }[] {
  const m = /^(\d{1,2}):/.exec(dayStart ?? ""); const s = m ? Number(m[1]) % 24 : 6;
  const out: { h: number; next: boolean }[] = [];
  for (let i = 0; i < 24; i++) { const h = (s + i) % 24; out.push({ h, next: maxHour >= 24 && h < s }); }
  return out;
}

/** 選んだ時（0〜23）と分 → 保存する値。翌（切替の時より前）の時は maxHour が 24 以上なら +24 時。 */
export function timePickerValueOf(h: number, m: number, after: string | null, maxHour = 47, dayStart = "06:00"): string {
  const ds = /^(\d{1,2}):/.exec(dayStart ?? ""); const s = ds ? Number(ds[1]) % 24 : 6;
  if (maxHour >= 24 && h < s && h + 24 <= maxHour) return `${String(h + 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return hmPickOf(h, m, after, maxHour);
}
