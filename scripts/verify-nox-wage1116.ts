/*
 * verify:nox-wage1116 — キャスト管理のカードと本人の画面の時給の見込み（裁定501-7・2026-11-16 Agoora 確定・式は変えない）。DB 不触・env 不要。
 *   npm run verify:nox-wage1116。
 *  w(1) 段の時給の額を主に（pt 170 → 時給 ¥3,000（2 段））・次の段まで（あと 30 pt で ¥3,500）・いちばん上の段は出さない・段なし＝基本。
 *  w(2) 前の月で決める店＝来月の時給の見込み／当月で決める店＝今月の時給の見込み・売上で段を決める店も同じ形。
 *  w(3) 段を使わない人（体入・保証の間）・日ごと（daily）・段の無いプラン＝出さない（今の表示のまま）。
 *  w(4) カード・詳細・本人の画面（本人は給与を見せている店だけ＝payslip_visibility 'off' の節の中）。
 */
import fs from "node:fs";
import { wageForecastOf, currentWageOf } from "../lib/nox/cast/current-wage";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const ptPay = (pts: number) => ({ eplan: { base: 2500, salesSlide: [], pointSlide: [{ at: 100, wage: 3000 }, { at: 150, wage: 3200 }, { at: 200, wage: 3500 }] }, wdays: [{ d: 1, hours: 5, hourly: 3000, basis: "ポイント", pts: 10 }], slideBasis: { months: [{ month: "2026-11", sales: 0, pts }] } });
const f1 = wageForecastOf(ptPay(170), "monthly", "current", { skip: false });
check("w(1-1) pt 170（2 段）＝額を主に・次の段まで 30 pt で ¥3,500・当月で決める店＝今月", JSON.stringify(f1) === JSON.stringify({ label: "今月の時給の見込み", main: "pt 170 → 時給 ¥3,200（2 段）", next: "あと 30 pt で ¥3,500" }), f1);
const f2 = wageForecastOf(ptPay(250), "monthly", "next", { skip: false });
check("w(1-2) いちばん上の段＝次の段の行は出さない・前の月で決める店＝来月", f2?.next === null && f2?.label === "来月の時給の見込み" && f2?.main === "pt 250 → 時給 ¥3,500（3 段）", f2);
const f3 = wageForecastOf(ptPay(40), "monthly", "current", { skip: false });
check("w(1-3) 段なし＝時給 ¥2,500（基本）・あと 60 pt で ¥3,000", f3?.main === "pt 40 → 時給 ¥2,500（基本）" && f3?.next === "あと 60 pt で ¥3,000", f3);
const sPay = { eplan: { base: 2500, salesSlide: [{ at: 800000, wage: 3000 }, { at: 1200000, wage: 3500 }], pointSlide: [] }, wdays: [{ d: 1, hours: 5, hourly: 3000, basis: "売上", sales: 1 }], slideBasis: { months: [{ month: "2026-10", sales: 1000000, pts: 0 }] } };
const f4 = wageForecastOf(sPay, "monthly", "next", { skip: false });
check("w(2-1) 売上で段を決める店も同じ形（売上 ¥1,000,000 → 時給 ¥3,000（1 段）・あと ¥200,000 で ¥3,500）", f4?.main === "売上 ¥1,000,000 → 時給 ¥3,000（1 段）" && f4?.next === "あと ¥200,000 で ¥3,500" && f4.label === "来月の時給の見込み", f4);
check("w(3-1) 段を使わない人・日ごと・段の無いプラン＝null", wageForecastOf(sPay, "monthly", "next", { skip: true }) === null && wageForecastOf(sPay, "daily", "current", { skip: false }) === null && wageForecastOf({ eplan: { salesSlide: [], pointSlide: [] } }, "monthly", "current", { skip: false }) === null);
const cwTrial = currentWageOf({ ...sPay, trial: { days: 3 }, wdays: [{ d: 1, hours: 5, hourly: 2200, basis: "体入" }] }, { planName: "ACE Sales Slide", slidePeriod: "monthly", slideApply: "next", today: "2026-11-16" });
check("w(3-2) 体入の人（プラン名は既定のプラン）＝trial・見込みなし", cwTrial.trial === true && cwTrial.forecast === null);
const cb = fs.readFileSync("app/(manage)/casts/casts-board.tsx", "utf8"), mp = fs.readFileSync("app/mine/page.tsx", "utf8");
check("w(4-1) カードと詳細＝見込みがあれば額を主に（無ければ根拠 1 行）", (cb.match(/data-wage-forecast="1"/g) ?? []).length === 2 && (cb.match(/data-wage-forecast-next="1"/g) ?? []).length === 2);
check("w(4-2) 本人の画面＝同じ見込み・payslip_visibility 'off' の節の中", mp.includes('{mineWage && ms.payslip_visibility !== "off" && (') && mp.includes('<span data-wage-forecast="1"') && mp.indexOf('<span data-wage-forecast="1"') > mp.indexOf('{mineWage && ms.payslip_visibility !== "off" && ('));
if (fails.length) { console.error(`verify:nox-wage1116 FAIL ${fails.length} / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-wage1116 OK (${pass} checks)`);
console.log("時給の見込み（裁定501-7）: 額を主に・次の段まで・来月／今月・売上も同じ・段を使わない人は出さない・カード／詳細／本人");
