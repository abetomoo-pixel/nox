// ★裁定303（2026-09-25）: 玲奈ゴールデン fixture の共有版（verify-nox-pay.ts の REINA_INPUT と同値＝mockDaily／P_HI／REINA を逐語で写す）。
//   payroll-view の「行合計＝net」を golden（wage 5931／withholding 125802／net 1208848）で係留するために export する。
//   ★verify-nox-pay.ts 側の定義は触らない（同じ値の複製＝pin は pay 側が正・ここが乖離したら pv(6-3) が赤になる）。
import type { CompPlan, DailyRecord, PayInput } from "../lib/nox/pay";

export function mockDaily(cast: { days: number; sales: number }, hoursPerShift = 5): DailyRecord[] {
  const t = [1.4, 1, 0.6, 1.1, 0.8, 1.2];
  const s = [1, 1.1, 0.85, 1, 0.9, 1.15];
  const o = cast.days;
  if (o <= 0) return [];
  let n = 0;
  const f: number[] = [];
  for (let L = 0; L < o; L++) { f.push(t[L % t.length]); n += t[L % t.length]; }
  const out: DailyRecord[] = [];
  let p = 0;
  for (let L = 0; L < o; L++) {
    let M = Math.round((cast.sales * f[L]) / n);
    if (L === o - 1) M = Math.max(0, cast.sales - p);
    p += M;
    const w = Math.round(hoursPerShift * s[L % s.length] * 10) / 10;
    out.push({ d: L + 1, hours: w, sales: M });
  }
  return out;
}

export const P_HI: CompPlan = {
  id: "p_hi", name: "特別待遇（高）", base: 5000, honBack: 4000, jonaiBack: 1500, dohanBack: 4000,
  salesSlide: [{ at: 80_000, wage: 4000 }, { at: 150_000, wage: 5500 }, { at: 250_000, wage: 7000 }],
  pointSlide: [{ at: 5, wage: 4000 }, { at: 10, wage: 5500 }, { at: 16, wage: 7000 }],
};

export const REINA = { hon: 48, jonai: 30, dohan: 12, days: 22, sales: 1_850_000 };
export const REINA_INPUT: PayInput = {
  periodDays: 31,
  extrasTotal: 0,
  cast: REINA,
  daily: mockDaily(REINA, 5),
  plan: P_HI,
  productBack: { drink: 122_500, champ: 68_000, bottle: 0 },
  pointProducts: 110,
  customBackDefs: [
    { id: "cb_kaikin", name: "皆勤手当", basis: "days", value: 300 },
    { id: "cb_champ", name: "シャンパン8本ボーナス", basis: "flat", value: 30_000, cond: { metric: "champCnt", min: 8 } },
    { id: "cb_sales", name: "売上150万達成2%", basis: "sales", value: 2, cond: { metric: "sales", min: 1_500_000 } },
  ],
  metrics: { champCnt: 9, bottleCnt: 0 },
  deductions: [
    { id: "send", name: "送り代", amount: 2000, per: "day" },
    { id: "kousei", name: "厚生費", amount: 5000, per: "month" },
  ],
  penalty: { fineAbsent: 10_000, fineLate: 3000, hoursPerShift: 5 },
  normConfig: { on: true, daysFlat: 5000, daysPer: 2000, dohanFlat: 3000, dohanPer: 1500 },
  norm: { days: 24, dohan: 15 },
  fine: { absentN: 0, lateN: 0 },
  arDeduct: 0,
  advanceDeduct: 0,
  okuriDeduct: 3500,
  taxMode: "委託",
};
