/*
 * verify:nox-trial490 — 裁定490（体入の式・12 点）の結線（0201l の後・2026-11-16）。DB 不触・env 不要＝純関数と逐語 pin。
 *   npm run verify:nox-trial490。
 *  t(1) 体入の期間（trialRangeOf）＝開始 trial_started_on → joined_on → created_at（JST）・終わる日 trial_ends_on・null＋体入＋在籍＝続く・null＋体入でない＝無い・終わる日 < 開始＝無い。
 *  t(2) 体入の時給（trialWageOf）＝本人＞店・どちらも無い＝null（＝体入の式を当てない＝12 点の 5・未設定の注意＝12 点の 2）。
 *  t(3) 体入の材料（trialRawOf）＝体入の時給の日は出勤した日だけ（(c)）・バック「なし」の除外は体入の期間の営業日の分（出勤の有無を問わない）・「同じ」は除外なし。
 *  t(4) buildPayInput＝trial が無い raw は従来と 1 バイト同値（キーを足さない）・有れば trialWageByDay（日番号）と trialBackExclude。
 *  t(5) (d) 当月で段を決める店（slide_apply current）＝月の累計（monthly）なら体入の日の売上が本採用の日の段に入る（12 点の 11）・日ごと（daily）ならその日の売上だけ。
 *  t(6) 結線の逐語 pin（collect・assemble・core・rules-0175-collect・画面・デモの種）。
 *  逆テスト（手動・1 回）: trialRawOf の `d.hours > 0 &&` を外す→t(3-2) 赤・戻して緑。
 */
import fs from "node:fs";
import { trialRangeOf, trialStartOf, trialWageOf, trialRawOf, trialTouchesOf, jstDateOf } from "../lib/nox/payroll/trial";
import { buildPayInput, type CastRaw, type StoreMasters } from "../lib/nox/payroll/assemble";
import { payOf, type CompPlan } from "../lib/nox/pay";
import { wageDayKindOf } from "../lib/nox/payroll/wage-spans";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: unknown) { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

// t(1)
check("t(1-1) 開始日＝trial_started_on → joined_on → created_at（JST）", trialStartOf({ trial_started_on: "2026-10-05", joined_on: "2026-10-03", created_at: "2026-09-30T16:00:00Z" }) === "2026-10-05"
  && trialStartOf({ joined_on: "2026-10-03", created_at: "2026-09-30T16:00:00Z" }) === "2026-10-03" && trialStartOf({ created_at: "2026-09-30T16:00:00Z" }) === "2026-10-01" && jstDateOf("2026-09-30T14:59:59Z") === "2026-09-30");
check("t(1-2) 終わる日 null・区分 体入・在籍＝続いている", JSON.stringify(trialRangeOf({ kind: "体入", is_active: true, created_at: "2026-09-30T16:00:00Z", trial_ends_on: null })) === JSON.stringify({ start: "2026-10-01", end: null }));
check("t(1-3) 終わる日 null・区分 体入でない＝無い", trialRangeOf({ kind: "キャスト", is_active: true, created_at: "2026-09-30T16:00:00Z" }) === null);
check("t(1-4) 本採用（区分 キャスト・終わる日あり）＝開始〜終わる日", JSON.stringify(trialRangeOf({ kind: "キャスト", is_active: true, trial_started_on: "2026-10-01", trial_ends_on: "2026-10-10" })) === JSON.stringify({ start: "2026-10-01", end: "2026-10-10" }));
check("t(1-5) 見送り（体入・在籍でない・終わる日＝判断の日）＝開始〜判断の日", JSON.stringify(trialRangeOf({ kind: "体入", is_active: false, trial_started_on: "2026-10-01", trial_ends_on: "2026-10-03" })) === JSON.stringify({ start: "2026-10-01", end: "2026-10-03" }));
check("t(1-6) 終わる日が開始日より前＝無い（今日から本採用で前日＝開始の前日）", trialRangeOf({ kind: "キャスト", is_active: true, trial_started_on: "2026-10-05", trial_ends_on: "2026-10-04" }) === null);
check("t(1-7) 終わる日 null・体入・在籍でない・退店日も無い＝無い（従来の式）", trialRangeOf({ kind: "体入", is_active: false, trial_started_on: "2026-10-01", trial_ends_on: null }) === null);
check("t(1-8) ★B2-2（2026-11-16）: 「退店」で外した体入（終わる日 null・在籍でない・退店日あり）＝開始日〜退店日・退店日が開始日より前は無い", JSON.stringify(trialRangeOf({ kind: "体入", is_active: false, trial_started_on: "2026-10-01", trial_ends_on: null, left_on: "2026-10-12" })) === JSON.stringify({ start: "2026-10-01", end: "2026-10-12" })
  && trialRangeOf({ kind: "体入", is_active: false, trial_started_on: "2026-10-05", left_on: "2026-10-01" }) === null && trialRangeOf({ kind: "キャスト", is_active: false, trial_started_on: "2026-10-01", left_on: "2026-10-12" }) === null);

// t(2)
check("t(2-1) 本人＞店", trialWageOf(2400, 2000) === 2400 && trialWageOf(null, 2000) === 2000 && trialWageOf(undefined, undefined) === null && trialWageOf(0, 2000) === 0);

// t(3)
const daily = [
  { bizDate: "2026-10-01", hours: 5, sales: 100000 }, { bizDate: "2026-10-02", hours: 0, sales: 50000 },
  { bizDate: "2026-10-03", hours: 5, sales: 0 }, { bizDate: "2026-10-04", hours: 5, sales: 200000 },
];
const srcDays = {
  sales: [
    { bizDate: "2026-10-01", sales: 100000, hon: 2, jonai: 1, dohan: 1 }, { bizDate: "2026-10-02", sales: 50000, hon: 1, jonai: 0, dohan: 0 },
    { bizDate: "2026-10-04", sales: 200000, hon: 3, jonai: 2, dohan: 1 },
  ],
  shimeiAmt: new Map([["2026-10-01", { hon: 6000, jonai: 2000 }], ["2026-10-04", { hon: 9000, jonai: 4000 }]]),
  backs: new Map([["2026-10-02", { drink: 500, champ: 0, bottle: 1000, pt: 2, calc: 300 }], ["2026-10-04", { drink: 700, champ: 800, bottle: 0, pt: 1, calc: 0 }]]),
  champBottle: new Map([["2026-10-02", { champCnt: 0, bottleCnt: 1 }]]),
};
const range = { start: "2026-10-01", end: "2026-10-03" };
check("t(3-1) 体入の時給が無い＝null（式を当てない）", trialRawOf(range, null, "none", daily, srcDays) === null);
const tSame = trialRawOf(range, 2200, "same", daily, srcDays);
check("t(3-2) (c) 体入の時給の日＝期間の中で出勤した日だけ（10/2 は実働 0＝数えない）・「同じ」は除外なし", JSON.stringify(tSame) === JSON.stringify({ wage: 2200, dates: ["2026-10-01", "2026-10-03"] }), tSame);
const tNone = trialRawOf(range, 2200, "none", daily, srcDays);
check("t(3-3) 「なし」の除外＝期間の営業日の分（実働 0 の 10/2 の売上・指名・商品も入る・10/4 は入らない）",
  !!tNone?.exclude && tNone.exclude.hon === 3 && tNone.exclude.jonai === 1 && tNone.exclude.dohan === 1 && tNone.exclude.sales === 150000
  && tNone.exclude.honShimeiAmt === 6000 && tNone.exclude.jonaiShimeiAmt === 2000 && tNone.exclude.drink === 500 && tNone.exclude.bottle === 1000 && tNone.exclude.calculated === 300
  && tNone.exclude.metrics?.pt === 2 && tNone.exclude.metrics?.bottleCnt === 1 && tNone.exclude.metrics?.days === 2, tNone);
check("t(3-4) 期間が期に掛からない＝null", trialRawOf({ start: "2026-11-01", end: null }, 2200, "none", daily, srcDays) === null);
check("t(3-5) 未設定の注意の判定＝期間が営業日（実働か売上）に掛かる", trialTouchesOf(range, daily) && !trialTouchesOf({ start: "2026-11-01", end: null }, daily) && !trialTouchesOf(null, daily));

// t(4)
const plan: CompPlan = { id: "p", name: "P", base: 2500, honBack: 1000, jonaiBack: 500, dohanBack: 1500, salesSlide: [{ at: 800000, wage: 3000 }], pointSlide: [], honBackMode: "per_count", honBackRate: null, jonaiBackMode: "per_count", jonaiBackRate: null, dohanBackMode: "per_count", dohanBackRate: null, components: [] } as CompPlan;
const masters: StoreMasters = { penalty: { fineAbsent: 0, fineLate: 0, hoursPerShift: 5 }, normConfig: { on: false, daysFlat: 0, daysPer: 0, dohanFlat: 0, dohanPer: 0 }, deductions: [], customBackDefs: [] };
const rawOf = (over: Partial<CastRaw> = {}): CastRaw => ({ castId: "c", castName: "C", sales: 350000, hon: 6, jonai: 3, dohan: 2, honShimeiAmt: 0, jonaiShimeiAmt: 0, daily: daily.map((d) => ({ ...d })), productBack: { drink: 0, champ: 0, bottle: 0 }, calculatedBack: 0, pointProducts: 0, champCnt: 0, bottleCnt: 0, days: 3, lateN: 0, absentN: 0, anomalyCount: 0, plan, norm: { days: 0, dohan: 0 }, taxProfileMode: "委託", employment: "委託", avgDailyWage: null, ...over });
const in0 = buildPayInput(rawOf(), "委託", masters, 31, 0);
check("t(4-1) trial なし＝trialWageByDay・trialBackExclude のキーを持たない", !("trialWageByDay" in in0) && !("trialBackExclude" in in0));
const in1 = buildPayInput(rawOf({ trial: tNone! }), "委託", masters, 31, 0);
check("t(4-2) trial あり＝日番号の体入の時給・除外をそのまま", JSON.stringify(in1.trialWageByDay) === JSON.stringify({ 1: 2200, 3: 2200 }) && in1.trialBackExclude?.hon === 3);
const p1 = payOf(in1);
check("t(4-3) 内訳の体入の日数＝出勤した日だけ（2）", p1.trial?.days === 2 && p1.trial?.backNone === true, p1.trial);
const in1s = buildPayInput(rawOf({ trial: tSame! }), "委託", masters, 31, 0);
check("t(4-4) 「同じ」＝除外のキーを持たない", !("trialBackExclude" in in1s) && payOf(in1s).trial?.backNone === false);

// t(5) (d) 当月で段を決める店
const dailyD = [{ bizDate: "2026-10-01", hours: 5, sales: 500000 }, { bizDate: "2026-10-02", hours: 5, sales: 500000 }, { bizDate: "2026-10-03", hours: 5, sales: 0 }, { bizDate: "2026-10-04", hours: 5, sales: 0 }];
const trialD = { wage: 2000, dates: ["2026-10-01", "2026-10-02"] };
const monthly = payOf(buildPayInput(rawOf({ daily: dailyD, sales: 1000000, trial: trialD, slidePeriod: "monthly", slideTotals: { "2026-10": { sales: 1000000, pts: 0 } } }), "委託", masters, 31, 0));
const hm = monthly.wdays?.map((w) => `${w.d}:${w.hourly}:${w.basis}`).join(",");
check("t(5-1) monthly・current＝体入の日は 2,000（体入）・本採用の日は月の累計 1,000,000（体入の日の売上を含む）で段 3,000", hm === "1:2000:体入,2:2000:体入,3:3000:売上,4:3000:売上", hm);
const dailyApply = payOf(buildPayInput(rawOf({ daily: dailyD, sales: 1000000, trial: trialD }), "委託", masters, 31, 0));
const hd = dailyApply.wdays?.map((w) => `${w.d}:${w.hourly}:${w.basis}`).join(",");
check("t(5-2) daily・current＝本採用の日はその日の売上だけ（0）で基本 2,500・体入の日の売上 500,000 は段に効かない（体入の時給）", hd === "1:2000:体入,2:2000:体入,3:2500:保証,4:2500:保証", hd);
check("t(5-3) 区間の区分＝体入の日は「体入」（保証より先）", wageDayKindOf({ basis: "体入", gua: true }) === "体入" && wageDayKindOf({ basis: "保証", gua: true }) === "保証" && wageDayKindOf({ basis: "売上" }) === "売上段");

// t(6) 結線の逐語 pin
const co = src("lib/nox/payroll/collect.ts"), as = src("lib/nox/payroll/assemble.ts"), cr = src("lib/nox/payroll/core.ts"), r175 = src("lib/nox/payroll/rules-0175-collect.ts");
check("t(6-1) collect＝フラグ 0201l のときだけ casts の体入の列を読む（false＝従来の select）", co.includes("mig0201lOn() ? \", kind, is_active, created_at, trial_wage, trial_started_on, trial_ends_on\" : \"\""));
check("t(6-2) collect＝trialRangeOf・trialWageOf（本人＞店）・trialRawOf（店の trial_back）", co.includes("trialRawOf(range, wage, masters0201l.trialBack, daily,") && co.includes("trialWageOf(tr.trial_wage, masters0201l.trialWage)"));
check("t(6-3) (b) 同伴の時間帯のバック＝集める側で体入の日の同伴を除く（バック「なし」の cast だけ）", r175.includes("dohanBandBackOf(bandsByPlan.get(c.planId)!, (dohanItemsByCast.get(c.castId) ?? []).filter((it) => !opts?.excludeDohan?.(c.castId, it.startedAt)))"));
check("t(6-4) assemble＝trial があるときだけキーを足す", as.includes("...(raw.trial && raw.trial.dates.length ? { trialWageByDay: Object.fromEntries(raw.trial.dates.map((d) => [dayNum(d), raw.trial!.wage])) } : {}),") && as.includes("...(raw.trial?.exclude ? { trialBackExclude: raw.trial.exclude } : {}),"));
check("t(6-5) core＝体入の時給が未設定の注意（確定は止めない＝warnings）", cr.includes('if (c.trialWageUnset) warnings.push({ castId: c.castId, castName: c.castName, kind: "trial_wage_unset", detail: TRIAL_WAGE_UNSET_DETAIL });'));
const ui = src("lib/nox/payroll/ui-calc.ts");
check("t(6-6) 注意の見出し＝「体入の時給が未設定」", ui.includes('trial_wage_unset: "体入の時給が未設定"'));
const cb = src("app/(manage)/casts/casts-board.tsx"), tp = src("app/(manage)/master/trial-terms-panel.tsx"), tt = src("lib/nox/cast/trial-terms.ts");
check("t(6-7) 体入の時給の欄の注記を外した（2 か所・定数も）", !cb.includes("TRIAL_WAGE_NOT_IN_PAY_NOTE") && !tp.includes("TRIAL_WAGE_NOT_IN_PAY_NOTE") && !tt.includes("TRIAL_WAGE_NOT_IN_PAY_NOTE") && !cb.includes("data-trial-wage-note") && !tp.includes("data-trial-wage-note"));
check("t(6-8) 本採用の画面＝「新しいプランは次の給与期から」（12 点の 9）", cb.includes("{TRIAL_HIRE_NEXT_PERIOD_NOTE}") && tt.includes('export const TRIAL_HIRE_NEXT_PERIOD_NOTE = "新しいプランは次の給与期から";'));
check("t(6-9) 既定のプランが無く候補も無い店＝「先にプランを作ってください」（12 点の 12・本採用のボタンを出さない）", cb.includes("cands.length === 0 ? (") && cb.includes("{TRIAL_HIRE_NO_PLAN_NOTE}") && tt.includes('export const TRIAL_HIRE_NO_PLAN_NOTE = "先にプランを作ってください";'));
const tf = src("lib/nox/cast/trial-flow.ts");
check("t(6-10) 体入タブ＝フラグ 0201c のときは区分で見る（体入の間は店の既定のプランを持つ＝12 点の 1）", tf.includes("if (mig0201cOn()) return c.is_active && c.kind === TRIAL_KIND;"));
check("t(6-12) ★B2-1（12 点の 1・6・8）: 「体入を追加」＝店の既定のプラン（体験入店は割り当てない）・開始日を set_cast_trial で必ず記録・保証の行は作らない・既定が無い店はプランを選ばせる",
  cb.includes("const planId = trialPlanOf(sid) ?? trialAdd.planId;") && cb.includes('const tr = await supabase.rpc(SET_CAST_TRIAL_RPC, { p_cast_id: castId, p_wage: null, p_days: null, p_started_on: trialAdd.start });')
  && cb.includes('p_plan_id: planId, p_overrides: {}, p_valid_from: trialAdd.start });') && !cb.slice(cb.indexOf("async function addTrialCast("), cb.indexOf("async function addTrialCast(") + 3000).includes("set_cast_guarantee") && cb.includes('data-trial-add-plan="pick"') && cb.includes('data-trial-add-plan="none">{TRIAL_HIRE_NO_PLAN_NOTE}'));
const gd = src("scripts/demo/gen-demo.mjs");
check("t(6-11) (a) デモの体入のキャストの待遇プラン＝店の既定のプラン（3 行とも）・店の体入の時給＝今までの体験入店の基本", (gd.match(/plan_id: trialHoldPlanId,/g) ?? []).length === 3 && gd.includes("trial_wage: TRIAL[code]?.base"));

if (fails.length) {
  console.error(`verify:nox-trial490 FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-trial490 OK (${pass} checks)`);
console.log("裁定490 の結線: 体入の期間・体入の時給（本人＞店）・出勤した日だけ・バック「なし」の除外・当月で段を決める店・画面の 4 点・デモの種");
