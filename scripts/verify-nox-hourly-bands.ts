/* verify:nox-hourly-bands — 時間帯の時給（2026-11-24 夕・相談役の便【9】・枝 hourly-bands-1124・旗 HOURLY_BANDS_ON＝false・DB を使わない純関数の検査）。
 *  決め：帯の額は基本の代わり（段・保証が上回れば段・保証）／額 0 は 0／体入の日は帯を使わない／上書きのある人は帯を使わない（collect）／shift_guarantee は打刻とシフトで切った額の高い方／
 *  不足の控除は開始・終了の時刻の帯の時給／重なりは画面で止める／開始日は持たない。帯の無い入力は今と 1 バイト同じ（キーを足さない）。 */
import { payOf, type PayInput, type CompPlan } from "../lib/nox/pay";
import { bandSegmentsOf, bandAmountAt, bandHourlyOf, hourlyBandRowsErrOf } from "../lib/nox/payroll/hourly-bands";
import { shortfallRowsOf } from "../lib/nox/payroll/shortfall";
import type { RateBand } from "../lib/nox/rules-0175/canon";
import { HOURLY_BANDS_ON } from "../lib/nox/rules-0175/flag";

let pass = 0; const fails: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${name}${detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 400)}`}`); };
const H = (h: number, m = 0) => h * 60 + m;
const B = (from: number, to: number, amount: number): RateBand => ({ target: "hourly", from_min: from, to_min: to, value_amount: amount, value_rate: null, priority: 100 });
const TORA = [B(H(16), H(20), 1500), B(H(20), H(48), 1800)]; // 例：16〜20 時 1,500・20 時以降 1,800

// (1) 区切り
check("(1) 旗は false（main に入れても今と同じ）", HOURLY_BANDS_ON === false);
check("(1) 境をまたぐ勤務 19:00〜23:30＝1,500 の 60 分と 1,800 の 210 分", JSON.stringify(bandSegmentsOf(H(19), H(23, 30), TORA)) === JSON.stringify([{ minutes: 60, amount: 1500 }, { minutes: 210, amount: 1800 }]));
check("(1) 日をまたぐ 23:00〜26:00（0〜47 時）＝1,800 の 180 分", JSON.stringify(bandSegmentsOf(H(23), H(26), TORA)) === JSON.stringify([{ minutes: 180, amount: 1800 }]));
check("(1) 境ちょうど 20:00 の入りは 20 時以降の帯（from ≦ t ＜ to）", bandAmountAt(TORA, H(20)) === 1800 && bandAmountAt(TORA, H(19, 59)) === 1500);
check("(1) 最初の帯より前は帯なし（基本）・帯の隙間は直前の帯", bandAmountAt(TORA, H(15)) === null && bandAmountAt([B(H(16), H(20), 1500), B(H(21), H(48), 1800)], H(20, 30)) === 1500);
check("(1) 帯が無い・区間が空", JSON.stringify(bandSegmentsOf(H(19), H(23), [])) === JSON.stringify([{ minutes: 240, amount: null }]) && bandSegmentsOf(H(20), H(20), TORA).length === 0);
check("(1) 額 0 は段や保証があっても 0・それ以外は max(段, 保証, 帯 ?? 基本)", bandHourlyOf(0, 5000, 1500, 3000) === 0 && bandHourlyOf(1800, 0, 1500, undefined) === 1800 && bandHourlyOf(1800, 2500, 1500, undefined) === 2500 && bandHourlyOf(1800, 0, 1500, 3000) === 3000 && bandHourlyOf(null, 0, 1500, undefined) === 1500);
check("(1) 画面の止め：重なり・範囲・額", hourlyBandRowsErrOf([{ from_min: H(16), to_min: H(20), value_amount: 1500 }, { from_min: H(19), to_min: H(24), value_amount: 1800 }])?.includes("重なって") === true
  && hourlyBandRowsErrOf([{ from_min: H(20), to_min: H(20), value_amount: 1 }]) !== null && hourlyBandRowsErrOf([{ from_min: 0, to_min: 2881, value_amount: 1 }]) !== null
  && hourlyBandRowsErrOf([{ from_min: 0, to_min: 60, value_amount: -1 }]) !== null && hourlyBandRowsErrOf(TORA.map((b) => ({ from_min: b.from_min, to_min: b.to_min, value_amount: b.value_amount }))) === null);

// (2) payOf
const plan: CompPlan = { id: "p", name: "見本", base: 1500, honBack: 0, jonaiBack: 0, dohanBack: 0, salesSlide: [], pointSlide: [] };
const baseInput = (over: Partial<PayInput> = {}): PayInput => ({
  cast: { hon: 0, jonai: 0, dohan: 0, days: 1, sales: 0 }, daily: [{ d: 1, hours: 4.5, sales: 0 }], plan, productBack: { drink: 0, champ: 0, bottle: 0 }, pointProducts: 0, customBackDefs: [], deductions: [],
  penalty: { fineAbsent: 0, fineLate: 0, hoursPerShift: 5 }, normConfig: { on: false, daysFlat: 0, daysPer: 0, dohanFlat: 0, dohanPer: 0 }, norm: { days: 0, dohan: 0 }, fine: { absentN: 0, lateN: 0 },
  arDeduct: 0, advanceDeduct: 0, okuriDeduct: 0, periodDays: 30, extrasTotal: 0, taxMode: "委託", ...over,
});
const seg1923 = bandSegmentsOf(H(19), H(23, 30), TORA);
const p0 = payOf(baseInput());
const p1 = payOf(baseInput({ hourlyBandsByDay: { 1: seg1923 } }));
check("(2) 帯の無い入力は今と同じ（時給 1,500 × 4.5h＝6,750・bands のキーなし）", p0.timePay === 6750 && !("bands" in p0) && !p0.wdays.some((w) => "bands" in w));
check("(2) 19:00〜23:30＝1,500×1h＋1,800×3.5h＝7,800・日の平均時給は表示用（1,733）・bands の内訳", p1.timePay === 7800 && p1.wHours === 4.5 && p1.wdays[0].hourly === 1733 && p1.bands?.pay === 7800 && p1.bands?.days === 1, { timePay: p1.timePay, w: p1.wdays[0], b: p1.bands });
const pSlide = payOf(baseInput({ plan: { ...plan, salesSlide: [{ at: 0, wage: 2000 }] }, hourlyBandsByDay: { 1: seg1923 } }));
check("(2) 段（2,000）が帯（1,500／1,800）を上回る時間は段＝2,000×4.5＝9,000", pSlide.timePay === 9000, pSlide.timePay);
const pGua = payOf(baseInput({ guaranteeByDay: { 1: 1700 }, guaranteeSpans: [{ from: "2026-11-01", to: null, base: 1700 }], hourlyBandsByDay: { 1: seg1923 } }));
check("(2) 保証（1,700）は帯の下限＝1,700×1h＋1,800×3.5h＝8,000", pGua.timePay === 8000, pGua.timePay);
const STOP = [B(H(20), H(24), 1800), B(H(24), H(48), 0)];
const pStop = payOf(baseInput({ plan: { ...plan, salesSlide: [{ at: 0, wage: 2500 }] }, daily: [{ d: 1, hours: 5, sales: 0 }], hourlyBandsByDay: { 1: bandSegmentsOf(H(22), H(27), STOP) } }));
check("(2) 額 0（24 時以降の時給停止）は段があっても 0＝2,500×2h＋0×3h＝5,000", pStop.timePay === 5000, pStop.timePay);
const pTrial = payOf(baseInput({ trialWageByDay: { 1: 3000 }, hourlyBandsByDay: { 1: seg1923 } }));
check("(2) 体入の日は帯を使わない（体入の時給 3,000×4.5＝13,500）", pTrial.timePay === 13500 && !pTrial.bands, pTrial.timePay);
const sg = { ...plan }; const shiftSeg = bandSegmentsOf(H(16), H(21), TORA);
const pSG = payOf(baseInput({ plan: sg, override: { pay_rule: "shift_guarantee" }, shiftHoursByDay: { 1: 5 }, hourlyBandsByDay: { 1: seg1923 }, hourlyBandsShiftByDay: { 1: shiftSeg }, employment: "雇用" }));
check("(2) shift_guarantee＝打刻で切った額（7,800）とシフト 16〜21 時で切った額（1,500×4＋1,800×1＝7,800）の高い方", pSG.timePay === 7800 && pSG.payRule?.rule === "shift_guarantee", { t: pSG.timePay });
const pSG2 = payOf(baseInput({ plan: sg, override: { pay_rule: "shift_guarantee" }, shiftHoursByDay: { 1: 6 }, hourlyBandsByDay: { 1: seg1923 }, hourlyBandsShiftByDay: { 1: bandSegmentsOf(H(19), H(25), TORA) }, employment: "雇用" }));
check("(2) shift_guarantee＝シフト 19〜25 時の方が高ければシフト（1,500＋1,800×5＝10,500）", pSG2.timePay === 10500, pSG2.timePay);
const pEdge = payOf(baseInput({ hourlyBandsByDay: { 1: seg1923 }, hourlyBandEdgesByDay: { 1: [1500, 1800] } }));
check("(2) 不足の控除の時給＝開始・終了の時刻の帯（[1,500, 1,800]）を日に持つ", JSON.stringify(pEdge.wdays[0].edgeRates) === JSON.stringify([1500, 1800]));

// (3) 不足の控除
const day = { bizDate: "2026-11-01", shiftId: "s", startHm: "19:00", endHm: "23:30", inHm: "19:30", outHm: "23:00" };
const sfOld = shortfallRowsOf({ days: [day], hourlyByDate: { "2026-11-01": 1733 }, lateGraceMin: 10 });
const sfNew = shortfallRowsOf({ days: [day], hourlyByDate: { "2026-11-01": 1733 }, lateGraceMin: 10, edgeRatesByDate: { "2026-11-01": [1500, 1800] } });
check("(3) 不足の控除＝遅刻 30 分×開始の時給 1,500＋早上がり 30 分×終了の時給 1,800＝1,650（帯が無い日は今の式）", sfNew[0]?.amount === 1650 && sfOld[0]?.amount === Math.round(1733 * 60 / 60), [sfOld[0]?.amount, sfNew[0]?.amount]);

if (fails.length) { console.log(`verify:nox-hourly-bands FAIL ${fails.length}（pass ${pass}）`); for (const f of fails) console.log(" - " + f); process.exit(1); }
console.log(`verify:nox-hourly-bands OK (${pass} checks)`);
