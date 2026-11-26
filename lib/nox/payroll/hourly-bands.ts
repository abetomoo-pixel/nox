// ★時間帯の時給（2026-11-24 夕・相談役の便【9】＝docs/tmp/hourly_1124/plan.md の A・枝 hourly-bands-1124・旗 HOURLY_BANDS_ON＝false）。DB を知らない純関数。
//   器＝0175 v2 の plan_rate_bands（target 'hourly'・from_min／to_min＝営業日の分 0〜2880・value_amount＝時給）＝新しい表は作らない・mig なし。
//   決め（相談役 11/24 夕）：帯の額は基本時給の代わり（段・保証が上回れば段・保証）／額 0 の時間は段や保証があっても 0／体入の日は今のまま（帯を使わない）／
//     個別の時給の上書きがある人は上書きが勝つ（帯を使わない）／shift_guarantee は打刻で切った額とシフトで切った額の高い方／不足の控除は開始・終了の時刻の帯の時給／
//     帯の重なりは画面で止める（mig なし）／書けるのは owner だけ／開始日は持たせない。
//   帯の境は営業日の中の時刻（0〜47 時・締めより前は +24 時間＝打刻とシフトと同じ軸）。帯は from ≦ t ＜ to。帯の隙間は直前の帯を引き継ぐ（canon.ts の bandValueOf と同じ）。最初の帯より前は帯なし＝基本。
import { bandValueOf, type RateBand } from "../rules-0175/canon";

/** 帯で切った 1 区切り（minutes 分・amount＝帯の時給・null＝帯なし＝基本時給） */
export type BandSeg = { minutes: number; amount: number | null };

/** 時給の帯だけ（target 'hourly'・額のある行） */
export const hourlyBandsOf = (bands: readonly RateBand[]): RateBand[] => bands.filter((b) => b.target === "hourly" && b.value_amount !== null);

/** 働いた区間（営業日の分 [fromMin, toMin)）を帯の境で切る。区間が空・逆なら []。帯が無ければ 1 つの区切り（amount null） */
export function bandSegmentsOf(fromMin: number, toMin: number, bands: readonly RateBand[]): BandSeg[] {
  if (!(toMin > fromMin)) return [];
  const hb = hourlyBandsOf(bands);
  if (hb.length === 0) return [{ minutes: toMin - fromMin, amount: null }];
  const cuts = new Set<number>([fromMin, toMin]);
  for (const b of hb) for (const x of [b.from_min, b.to_min]) if (x > fromMin && x < toMin) cuts.add(x);
  const pts = [...cuts].sort((a, b) => a - b);
  const segs: BandSeg[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const v = bandValueOf(hb, "hourly", pts[i]);
    const amount = v && v.amount !== null ? v.amount : null;
    const last = segs[segs.length - 1];
    if (last && last.amount === amount) last.minutes += pts[i + 1] - pts[i]; else segs.push({ minutes: pts[i + 1] - pts[i], amount });
  }
  return segs;
}

/** ★0214（休憩・相談役 11/25 の D5）: 休憩で割った区間の並び（日の窓 dayWindowOf の segs）を帯で切って 1 つの並びに（隣の同じ額はまとめる）。区間が 1 つなら bandSegmentsOf と同じ */
export function bandSegmentsOfSpans(spans: readonly (readonly [number, number])[], bands: readonly RateBand[]): BandSeg[] {
  const out: BandSeg[] = [];
  for (const [a, b] of spans) for (const s of bandSegmentsOf(a, b, bands)) { const last = out[out.length - 1]; if (last && last.amount === s.amount) last.minutes += s.minutes; else out.push({ ...s }); }
  return out;
}

/** ★2026-11-25（相談役 M4 ア）: その日を帯で切る区間＝pay.ts がその日の時間に使う区間と同じ物（区間の長さ＝今の勤務時間）。
 *  打刻しない店の日（確定シフトで時間を決めた日）＝シフト／勤務時間の基準が shift で、今日までの確定シフトの時間がある日＝シフト（無ければ null＝帯で切らない＝今の時給のまま）／
 *  それ以外＝打刻（最初の in〜最後の out）か、シフトの無い日の打刻。区間が取れない日は null（ウ＝帯なしの時給で計算＝今と同じ）。 */
export function bandWindowOf(w: { punch?: [number, number]; shift?: [number, number]; noShift?: [number, number] }, o: { storeShift: boolean; shiftBasis: boolean; shiftHoursDefined: boolean }): [number, number] | null {
  if (o.storeShift) return w.shift ?? null;
  if (o.shiftBasis && o.shiftHoursDefined) return w.shift ?? null;   // pay.ts の dailyBase＝確定シフトの時間に置き換える日（"02:00" の書き方＝時間 0＝区間なし）
  return w.punch ?? w.noShift ?? null;
}

/** その分の帯の時給（無ければ null＝基本） */
export const bandAmountAt = (bands: readonly RateBand[], minuteOfDay: number): number | null => {
  const v = bandValueOf(hourlyBandsOf(bands), "hourly", minuteOfDay);
  return v && v.amount !== null ? v.amount : null;
};

/** 帯の時給を当てた 1 時間あたりの額＝額 0 は 0（段・保証があっても）・それ以外は max(段, 保証, 帯の額 ?? 基本) */
export const bandHourlyOf = (amount: number | null, slideMax: number, base: number, gBase: number | undefined): number =>
  amount === 0 ? 0 : Math.max(slideMax, gBase !== undefined ? Math.max(gBase, amount ?? base) : (amount ?? base));

/** 画面の止め（帯の重なり・範囲・額）。null＝通る。plan_rate_band_set は重なりを断らない＝画面で止める（mig なし） */
export function hourlyBandRowsErrOf(rows: readonly { from_min: number; to_min: number; value_amount: number | null }[]): string | null {
  for (const r of rows) {
    if (!Number.isInteger(r.from_min) || !Number.isInteger(r.to_min) || r.from_min < 0 || r.to_min > 2880 || r.to_min <= r.from_min) return "時間帯の始まりと終わりを確かめてください（終わりは始まりより後・翌 24 時まで）";
    if (r.value_amount === null || !Number.isInteger(r.value_amount) || r.value_amount < 0 || r.value_amount > 100000) return "時給は 0〜100,000 円の整数で入れてください（0＝その時間は時給なし）";
  }
  const s = [...rows].sort((a, b) => a.from_min - b.from_min);
  for (let i = 1; i < s.length; i++) if (s[i].from_min < s[i - 1].to_min) return "時間帯が重なっています（重ならないように直してください）";
  return null;
}

/** ★相談役 11/26 の便 L2: 新しいプラン（保存の前）は時間帯の時給の枠が見えない＝「基本・保証」の枠に出す一言 */
export const HOURLY_AFTER_SAVE_JA = "保存すると、時間帯の時給を設定できます";
