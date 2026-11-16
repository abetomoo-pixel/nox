/*
 * verify:nox-noshift1116 — 委託のシフト無し出勤の時間給（裁定501-8・2026-11-16 Agoora 確定）。DB 不触・env 不要＝純関数と逐語 pin。
 *   npm run verify:nox-noshift1116。
 *  n(1) シフト無しの日＝打刻の最初の出勤〜最後の退勤（休憩は引かない＝シフトのある日と同じ読み方）。退勤が無い日・出勤より前の退勤だけの日は時間を付けない。
 *  n(2) シフトのある日＝照合（punch-match）の実働のまま（この直しで 1 円も変わらない）。
 *  n(3) 委託も雇用も同じ（collect・勤怠一覧）・給与の画面の印と文。
 *  n(4) 給与の式：シフト無しの日の時間が委託の時間給に入る（assemble→payOf）・その日がシフトのある日なら従来どおり。
 *  逆テスト（手動・1 回）: collect.ts の empNoShift を雇用だけに戻す→n(3-1) 赤・戻して緑。
 */
import fs from "node:fs";
import { noShiftHoursOf } from "../lib/nox/payroll/no-shift";
import { buildMatchInput, dayWorkedHours } from "../lib/nox/punch-io";
import { matchPunches } from "../lib/nox/punch-match";
import { noShiftSummaryOf } from "../lib/nox/payroll/view";
import { buildPayInput, type CastRaw, type StoreMasters } from "../lib/nox/payroll/assemble";
import { payOf, type CompPlan } from "../lib/nox/pay";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: unknown) { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");
const P = (iso: string, type: "in" | "out") => ({ punched_at: iso, type });

// n(1)
const punches = [
  P("2026-10-04T19:40:00+09:00", "in"), P("2026-10-05T01:55:00+09:00", "out"),          // 10/4（シフト無し）＝6h15m
  P("2026-10-11T20:00:00+09:00", "in"),                                                 // 10/11（シフト無し）＝退勤なし
  P("2026-10-18T21:00:00+09:00", "in"), P("2026-10-18T22:00:00+09:00", "out"), P("2026-10-18T22:30:00+09:00", "in"), P("2026-10-19T02:00:00+09:00", "out"), // 10/18＝中抜けあり＝最初の in〜最後の out＝5h
];
const m = noShiftHoursOf(punches, ["2026-10-04", "2026-10-11", "2026-10-18"], "06:00");
check("n(1-1) シフト無しの日＝最初の出勤〜最後の退勤（6.25h）", m.get("2026-10-04") === 6.25, [...m]);
check("n(1-2) 退勤の打刻が無い日は時間を付けない（Map に無い）", !m.has("2026-10-11"));
check("n(1-3) 中抜け（in→out→in→out）は最初の in〜最後の out＝休憩を引かない（シフトのある日と同じ）＝5h", m.get("2026-10-18") === 5);
check("n(1-4) 出勤より前の退勤だけの日は付けない", !noShiftHoursOf([P("2026-10-20T01:00:00+09:00", "out"), P("2026-10-20T20:00:00+09:00", "in")], ["2026-10-20"], "06:00").has("2026-10-20"));

// n(2) シフトのある日の実働＝照合の実働（同じ打刻・同じ読み方）
const built = buildMatchInput({ cutoffHm: "06:00", shifts: [{ date: "2026-10-04", start_hm: "20:00", end_hm: "26:00" }], attendance: [], punches: [P("2026-10-04T19:40:00+09:00", "in"), P("2026-10-05T01:55:00+09:00", "out")] });
const day = matchPunches({ ...built, config: { close: "26:00" } }).days.find((d) => d.bizDate === "2026-10-04")!;
check("n(2-1) シフトのある日の実働＝照合（最初の in〜最後の out・早く来た分も付く）＝6.25h＝シフト無しの日と同じ読み方", dayWorkedHours(day) === 6.25 && dayWorkedHours(day) === m.get("2026-10-04"));

// n(3)
const co = src("lib/nox/payroll/collect.ts"), ks = src("lib/nox/payroll/kintai-sheet.ts");
check("n(3-1) collect＝委託も雇用も noShiftHours を日の時間に（雇用だけの条件は無い）", co.includes("const empNoShift = p?.noShiftHours ?? new Map<string, number>();") && !co.includes('employmentById.get(cid) === "雇用" ? p?.noShiftHours') && co.includes("hours: (p?.hoursByDate.get(bizDate) ?? 0) + (empNoShift.get(bizDate) ?? 0),") && co.includes("const noShiftHours = noShiftHoursOf(raw.punches, noShiftDates, win.cutoffHm);"));
check("n(3-2) 勤怠一覧も委託・雇用とも打刻の時間", !ks.includes('employment === "雇用") for (const r of rows) if (!r.shift'));
const ns = noShiftSummaryOf([{ castId: "a", castName: "委託の人", noShiftDates: ["2026-10-04"], taxMode: "委託" }]);
check("n(3-3) 給与の画面の印＝「シフト無し出勤 n 日」＋行（当日追加配置のリンク）・委託も時給を付けている文", ns?.text === "シフト無し出勤 1 日（打刻の出勤〜退勤の時間で時給を付けています・退勤の打刻が無い日は時間なし）" && ns.items[0].paid === true && src("app/(manage)/payroll/payroll-board.tsx").includes("data-no-shift={ns.count}"));

// n(4) 給与の式
const plan = { id: "p", name: "P", base: 2500, honBack: 0, jonaiBack: 0, dohanBack: 0, salesSlide: [], pointSlide: [], components: [] } as unknown as CompPlan;
const masters: StoreMasters = { penalty: { fineAbsent: 0, fineLate: 0, hoursPerShift: 5 }, normConfig: { on: false, daysFlat: 0, daysPer: 0, dohanFlat: 0, dohanPer: 0 }, deductions: [], customBackDefs: [] };
const raw = (daily: { bizDate: string; hours: number; sales: number }[]): CastRaw => ({ castId: "c", castName: "C", sales: 0, hon: 0, jonai: 0, dohan: 0, honShimeiAmt: 0, jonaiShimeiAmt: 0, daily, productBack: { drink: 0, champ: 0, bottle: 0 }, calculatedBack: 0, pointProducts: 0, champCnt: 0, bottleCnt: 0, days: 1, lateN: 0, absentN: 0, anomalyCount: 0, plan, norm: { days: 0, dohan: 0 }, taxProfileMode: "委託", employment: "委託", avgDailyWage: null });
const withShift = payOf(buildPayInput(raw([{ bizDate: "2026-10-03", hours: 6, sales: 0 }]), "委託", masters, 31, 0));
const plusNoShift = payOf(buildPayInput(raw([{ bizDate: "2026-10-03", hours: 6, sales: 0 }, { bizDate: "2026-10-04", hours: m.get("2026-10-04")!, sales: 0 }]), "委託", masters, 31, 0));
check("n(4-1) シフトのある日 6h＝15,000（従来）・シフト無しの日 6.25h が足されて 30,625（＝15,000＋2,500×6.25）", withShift.timePay === 15000 && plusNoShift.timePay === 30625, [withShift.timePay, plusNoShift.timePay]);

if (fails.length) {
  console.error(`verify:nox-noshift1116 FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-noshift1116 OK (${pass} checks)`);
console.log("委託のシフト無し出勤（裁定501-8）: 最初の出勤〜最後の退勤・退勤なしは時間なし・シフトのある日は不変・委託も雇用も同じ・給与の画面の印");
