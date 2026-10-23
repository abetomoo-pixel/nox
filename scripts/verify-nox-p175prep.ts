/*
 * verify:nox-p175prep — 便 P175-prep（2026-10-23・連続便 3）: 0175 v2（CANON 型ほか）の client を RULES_0175_APPLIED=false で眠らせた先行実装の係留（純関数＋逐語 grep・DB 不触）。
 *   npm run verify:nox-p175prep（env 不要）。
 *  (1) フラグ＝flag.ts と scripts/demo/rules-0175-flag.mjs が同値・本便は両方 false・本番コードは rules0175On()／okuri4wayOn() を通す（眠らせた箇所の一覧＝ファイル数を出力）
 *  (2) false で従来と 1 バイト同値＝payOf（玲奈 golden 5170／5931・源泉 117241／125802）に rules0175 キーが無いと canon が出ない・rateInputOf は履歴なしで guaranteeInputOf と deep-equal・
 *      payload 6 店は gen-demo の CANON 差し替えが null（profiles.canonOf／okuriModeOf が従来値）・collect／UI の gate が rules0175On() で閉じている（逐語）
 *  (3) true の client 段＝fixture（DB 段は SKIP）: P-1 時給の履歴（基本＋段の累積・保証・手動）／P-2 取消済み（除外・ラベル）／P-3 店設定（ドリンクバック OFF・売上小計・支払サイクル・プランの軸）／
 *      P-4 基本の働き方（既定値・固定休の印・雇用の時間帯）／P-5 CANON 40％・75％・120％ の 3 ケース＋連続 2 期の発動／不発動・規定未達は UP だけ止まる・免除は査定を止める／P-6 fixture 6 店／P-7 0177 の送り 4 方式
 */
import fs from "node:fs";
import { payOf, type PayInput } from "../lib/nox/pay";
import { RULES_0175_APPLIED, OKURI_4WAY_APPLIED, rules0175On, okuri4wayOn, __setRules0175ForTest, __setOkuri4wayForTest } from "../lib/nox/rules-0175/flag";
import { rateHistoryInputOf, baseRateOnDayOf, guaranteeOnDayOf, dayRatesOf, type RateHistoryRow } from "../lib/nox/rules-0175/rate-history";
import { activeRowsOf, cancelledLabelOf, isCancelledOf, activeCountOf, DAILY_PAY_KIND_LABEL } from "../lib/nox/rules-0175/cancelled";
import { drinkCountBackOn, salesSubtotalModeOf, payCycleOf, payCycleTextOf, planRewardAxisOf, planRewardAxisPatchOf, salesSplitOf, bonusTierModeOf } from "../lib/nox/rules-0175/settings";
import { availFormOf, availPatchOf, wishDefaultOf, fixedOffConflictOf, canEditTimeOf, availChipsOf, emptyAvailForm } from "../lib/nox/rules-0175/availability";
import { canonOutcomeOf, canonApplyOf, payRatePctOf, payRateTierOf, directionOf, streakOf, streakMetOf, normTierOf, normRequiredOf, graceOf, dailyPayCapOf, serviceRateOf, payDiscountOf, backOf, hourlyAtOf, type CanonCtx, type PayRateTier } from "../lib/nox/rules-0175/canon";
import { rateInputOf, guaranteeInputOf } from "../lib/nox/payroll/assemble";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: string) => { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = (x: unknown) => JSON.stringify(x);

// ── (1) フラグ ──
const flagTs = src("lib/nox/rules-0175/flag.ts"), flagMjs = src("scripts/demo/rules-0175-flag.mjs");
const rx = (name: string, s: string) => { const m = new RegExp(`export const ${name} = (true|false);`).exec(s); return m ? m[1] : null; };
check("p175(1-1) RULES_0175_APPLIED＝flag.ts と rules-0175-flag.mjs が同値・本便は false", rx("RULES_0175_APPLIED", flagTs) === String(RULES_0175_APPLIED) && rx("RULES_0175_APPLIED", flagMjs) === String(RULES_0175_APPLIED) && RULES_0175_APPLIED === false);
check("p175(1-2) OKURI_4WAY_APPLIED＝同値・本便は false", rx("OKURI_4WAY_APPLIED", flagTs) === String(OKURI_4WAY_APPLIED) && rx("OKURI_4WAY_APPLIED", flagMjs) === String(OKURI_4WAY_APPLIED) && OKURI_4WAY_APPLIED === false);
check("p175(1-3) 読み口＝rules0175On()／okuri4wayOn() は定数を返し、テスト用の上書きが効く", rules0175On() === false && okuri4wayOn() === false && (__setRules0175ForTest(true), rules0175On() === true) && (__setRules0175ForTest(null), rules0175On() === false));
const GATED_FILES = [
  "lib/nox/payroll/collect.ts", "app/(manage)/master/cast-comp/systems/systems-board.tsx", "app/(manage)/master/cast-comp/plan/plan-editor.tsx", "app/(manage)/casts/casts-board.tsx",
  "app/mine/page.tsx", "app/mine/wishes/wish-form.tsx", "app/(manage)/report/report-board.tsx", "app/(manage)/payroll/payroll-board.tsx", "components/nox/daily-pay-form.tsx", "app/(manage)/master/deduction-panel.tsx",
];
const gateCount = GATED_FILES.map((p) => ({ p, n: (src(p).match(/rules0175On\(\)|okuri4wayOn\(\)/g) ?? []).length }));
check("p175(1-4) 眠らせた箇所＝10 ファイル全部に rules0175On()／okuri4wayOn() がある・直書きの RULES_0175_APPLIED／OKURI_4WAY_APPLIED は flag.ts と鏡だけ", gateCount.every((g) => g.n > 0) && !GATED_FILES.some((p) => /const (RULES_0175_APPLIED|OKURI_4WAY_APPLIED) =/.test(src(p))), J(gateCount));
console.log(`眠らせた箇所: ${gateCount.length} ファイル／${gateCount.reduce((a, g) => a + g.n, 0)} 箇所 = ${gateCount.map((g) => `${g.p.split("/").pop()} ${g.n}`).join("・")}`);

// ── (2) false＝従来と 1 バイト同値 ──
const P_HI = { base: 2000, honBack: 1500, jonaiBack: 500, dohanBack: 1000, salesSlide: [{ at: 80_000, wage: 4000 }, { at: 150_000, wage: 5500 }, { at: 250_000, wage: 7000 }], pointSlide: [{ at: 5, wage: 4000 }, { at: 10, wage: 5500 }, { at: 16, wage: 7000 }] };
const REINA = { hon: 48, jonai: 30, dohan: 12, days: 22, sales: 1_850_000 };
const mockDaily = (c: typeof REINA, h: number) => Array.from({ length: c.days }, (_, i) => ({ d: i + 1, hours: h + (i % 3 === 0 ? 0.5 : 0) - (i % 7 === 6 ? 0.4 : 0), sales: Math.round(c.sales / c.days) }));
const REINA_INPUT: PayInput = {
  periodDays: 31, extrasTotal: 0, cast: REINA, daily: mockDaily(REINA, 5), plan: P_HI as unknown as PayInput["plan"],
  productBack: { drink: 122_500, champ: 68_000, bottle: 0 }, pointProducts: 110,
  customBackDefs: [{ id: "cb_kaikin", name: "皆勤手当", basis: "days", value: 300 }], metrics: { champCnt: 9, bottleCnt: 0 },
  deductions: [{ id: "send", name: "送り代", amount: 2000, per: "day" }], penalty: { fineAbsent: 10_000, fineLate: 3000, hoursPerShift: 5 },
  normConfig: { on: true, daysFlat: 5000, daysPer: 2000, dohanFlat: 3000, dohanPer: 1500 }, norm: { days: 24, dohan: 15 }, fine: { absentN: 0, lateN: 0 },
  arDeduct: 0, advanceDeduct: 0, okuriDeduct: 3500, taxMode: "委託",
} as unknown as PayInput;
const r0 = payOf(REINA_INPUT); const r1 = payOf({ ...REINA_INPUT }); // rules0175 キーなし
check("p175(2-1) payOf＝rules0175 キーが無ければ結果に canon が無く、2 回の結果が同一（1 バイト同値）", !("canon" in r0) && J(r0) === J(r1) && r0.gross > 0);
const canonCtx: CanonCtx = { tiers: [{ at_pct: 0, up_amount: 500 }], streakN: 1, prevLog: null, salesSubtotal: 1_000_000, normTiers: [], weekTarget: null, periodDays: 31, actual: { days: 22, hours: 110 }, joinedOn: null, graceMonths: 0, periodEnd: "2026-10-31", decided: "apply" };
const r2 = payOf({ ...REINA_INPUT, rules0175: canonCtx });
check("p175(2-2) rules0175 を渡したときだけ canon が付く・UP（up_amount は時給履歴側）は gross を変えない（backsDelta 0・bonus 0）", !!r2.canon && r2.canon.direction === "up" && r2.canon.applied && r2.gross === r0.gross && r2.canon.backsDelta === 0);
const daily = [{ bizDate: "2026-10-01", hours: 5, sales: 0 }, { bizDate: "2026-10-16", hours: 5, sales: 0 }];
const g3 = guaranteeInputOf({ daily, guarantees: [{ validFrom: "2026-10-01", validTo: "2026-10-10", base: 2300 }] } as never);
const rI = rateInputOf({ daily, guarantees: [{ validFrom: "2026-10-01", validTo: "2026-10-10", base: 2300 }], plan: { base: 1500 } } as never);
check("p175(2-3) rateInputOf＝履歴が無ければ guaranteeInputOf と deep-equal（従来の保証 3 行形）", J(rI) === J(g3) && J(rateInputOf({ daily, plan: { base: 1500 } } as never)) === J(guaranteeInputOf({ daily } as never)));
const col = src("lib/nox/payroll/collect.ts");
check("p175(2-4) collect＝0175 の表（cast_rate_history／plan_norm_tiers／slide_decisions／availability_terms）は rules-0175-collect に隔離・collect 本体は if (rules0175On()) の中でだけ呼ぶ・cancelled_at は三項で", /if \(rules0175On\(\)\) \{[\s\S]*loadRules0175Store\(admin, storeId\)/.test(col) && (col.match(/rules0175On\(\) \? q0\.is\("cancelled_at", null\) : q0/g) ?? []).length === 2 && !/from\("cast_rate_history"\)/.test(col));
const payS = src("lib/nox/pay.ts");
check("p175(2-5) pay.ts＝if (input.rules0175) の中だけで canonOutcomeOf／canonApplyOf・結果は ...(canon ? { canon } : {})", /if \(input\.rules0175\) \{[\s\S]*canonOutcomeOf\(input\.rules0175, timePayRule\)[\s\S]*canonApplyOf\(/.test(payS) && payS.includes("...(canon ? { canon } : {})"));
check("p175(2-6) UI の gate＝店設定パネル・プランの軸・キャスト詳細・/mine・希望の既定値・日払い取消ボタン・取消済み印は rules0175On() && で包む（false＝DOM 差分 0）",
  src("app/(manage)/master/cast-comp/systems/systems-board.tsx").includes("{rules0175On() && <StoreRules0175Panel") && src("app/(manage)/master/cast-comp/plan/plan-editor.tsx").includes("{rules0175On() && draft.id && (")
  && src("app/(manage)/casts/casts-board.tsx").includes("{rules0175On() && (") && src("app/mine/page.tsx").includes("{rules0175On() && meCast?.id && myStore && (")
  && src("app/mine/wishes/wish-form.tsx").includes("if (!rules0175On()) return;") && src("components/nox/daily-pay-form.tsx").includes("{rules0175On() && !isCancelledOf(p) && <button")
  && src("app/(manage)/payroll/payroll-board.tsx").includes("{rules0175On() && cancelledLabelOf(a as CancellableRow) &&") && src("app/(manage)/report/report-board.tsx").includes('rules0175On() ? q.is("cancelled_at", null) : q'));
check("p175(2-7) 就業規則チェック＝WAGE_CUT_RULE_APPLIED は rules0175On()・deduction-panel の 0177 定数は flag.ts の okuri4wayOn()・給与の送り見出しは okuri4wayOn() で分岐",
  src("app/(manage)/master/cast-comp/systems/systems-board.tsx").includes("const WAGE_CUT_RULE_APPLIED = rules0175On();") && src("app/(manage)/master/deduction-panel.tsx").includes("okuriModeSelectableOf(m, okuri4wayOn())")
  && src("app/(manage)/payroll/payroll-board.tsx").includes('{okuri4wayOn() ? OKURI_HEAD[okuriModeOf(storeSettings)] : "送り"}'));
const prof = src("scripts/demo/profiles.mjs"), gen = src("scripts/demo/gen-demo.mjs");
check("p175(2-8) payload＝profiles.canonOf は RULES_0175_APPLIED=false で null・okuriModeOf は OKURI_4WAY_APPLIED=false で PROFILES の値・gen-demo は CANON ? … : {} で畳む（6 店の payload は不変）",
  prof.includes("if (!RULES_0175_APPLIED || code !== \"muse\") return null;") && prof.includes("if (OKURI_4WAY_APPLIED) { if (code === \"lily\") return \"store\"; if (code === \"noir\") return \"none\"; }")
  && (gen.match(/\.\.\.\(CANON \? \{/g) ?? []).length === 2);

// ── (3) true の client 段（fixture） ──
__setRules0175ForTest(true); __setOkuri4wayForTest(true);
check("p175(3-0) DB 段＝SKIP（0175／0176／0177 は未適用・手貼りは Agoora）", rules0175On() && okuri4wayOn());
// P-1 時給の履歴
const hist: RateHistoryRow[] = [
  { kind: "base", rate: 1500, valid_from: "2026-01-01", valid_to: null },
  { kind: "guarantee", rate: 2300, valid_from: "2026-10-01", valid_to: "2026-10-10" },
  { kind: "slide_up", rate: 300, valid_from: "2026-10-16", valid_to: null },
  { kind: "slide_up", rate: 200, valid_from: "2026-11-01", valid_to: null },
  { kind: "manual", rate: 2500, valid_from: "2026-12-01", valid_to: "2026-12-31" },
];
const bu = (ymd: string) => { const b = baseRateOnDayOf(hist, ymd, 0); return b.base + b.up; };
check("p175(3-1a) P-1 baseRateOnDayOf＝基本 1500・10/16 から段 +300＝1800・11/1 から累積 +500＝2000・12 月は手動 2500（＋段 500＝3000）が基本に優先", bu("2026-10-05") === 1500 && bu("2026-10-20") === 1800 && bu("2026-11-05") === 2000 && baseRateOnDayOf(hist, "2026-12-05", 0).base === 2500 && baseRateOnDayOf(hist, "2026-12-05", 0).manual);
check("p175(3-1b) P-1 guaranteeOnDayOf＝10/1〜10/10 は 2300・10/11 は null", guaranteeOnDayOf(hist, "2026-10-10") === 2300 && guaranteeOnDayOf(hist, "2026-10-11") === null);
const dr = dayRatesOf(hist, ["2026-10-05", "2026-10-20"], 1500);
check("p175(3-1c) P-1 dayRatesOf＝10/5 保証 2300（kind 保証）・10/20 段 1800（kind 段）", dr[0].rate === 2300 && dr[0].kind === "保証" && dr[1].rate === 1800 && dr[1].kind === "段", J(dr));
const dayNum = (ymd: string) => Number(ymd.slice(8, 10));
const rh = rateHistoryInputOf(hist, ["2026-10-05", "2026-10-20"], 1500, dayNum);
check("p175(3-1d) P-1 rateHistoryInputOf＝baseByDay {20:1800}（基本と同額の日は書かない）・guaranteeByDay {5:2300}", J(rh.baseByDay) === J({ 20: 1800 }) && J(rh.guaranteeByDay) === J({ 5: 2300 }), J(rh));
const rI2 = rateInputOf({ daily: [{ bizDate: "2026-10-05", hours: 5, sales: 0 }, { bizDate: "2026-10-20", hours: 5, sales: 0 }], rateHistory: hist, plan: { base: 1500 } } as never);
check("p175(3-1e) P-1 rateInputOf（履歴あり）＝guaranteeByDay {5:2300, 20:1800}（基本と同額の日は床を作らない）・guaranteeSpans に履歴の保証行", J(rI2.guaranteeByDay) === J({ 5: 2300, 20: 1800 }) && (rI2.guaranteeSpans ?? []).some((s) => s.base === 2300 && s.from === "2026-10-01"), J(rI2));
// P-2 取消済み
const adj = [{ id: "a", cancelled_at: null, kind: "late" }, { id: "b", cancelled_at: "2026-10-23T00:00:00Z", kind: "late" }, { id: "c", cancelled_at: "2026-10-23T00:00:00Z", kind: "other", cancel_reason: "誤登録" }];
check("p175(3-2a) P-2 activeRowsOf＝取消済みを除く（1 件）・activeCountOf 1・isCancelledOf", activeRowsOf(adj).length === 1 && activeCountOf(adj) === 1 && isCancelledOf(adj[1]) && !isCancelledOf(adj[0]));
check("p175(3-2b) P-2 I-3 表示＝「取消済み（遅刻）」「取消済み（その他）」・未取消は null・日払いは「取消済み（日次精算）」", cancelledLabelOf(adj[1]) === "取消済み（遅刻）" && cancelledLabelOf(adj[2]) === "取消済み（その他）" && cancelledLabelOf(adj[0]) === null && cancelledLabelOf({ cancelled_at: "x", kind: "settlement" }, DAILY_PAY_KIND_LABEL) === "取消済み（日次精算）");
// P-3 店設定
check("p175(3-3a) P-3 ドリンクバック＝未設定 ON・false で OFF／売上小計＝未設定 due・pre_tax_service／sales_split equal／bonus_tier_mode sum", drinkCountBackOn(null) && !drinkCountBackOn({ sys_drink_count_back: false }) && salesSubtotalModeOf(null) === "due" && salesSubtotalModeOf({ sales_subtotal_mode: "pre_tax_service" }) === "pre_tax_service" && salesSplitOf({ sales_split: "equal" }) === "equal" && bonusTierModeOf({ bonus_tier_mode: "sum" }) === "sum");
const wk = payCycleOf({ settlement_cycle: "weekly", settlement_week_close_dow: 0, settlement_pay_days_after: 3 }, null);
check("p175(3-3b) P-3 支払サイクル＝週払い「毎週 日曜締め・3 日後払い」・月払い「毎月 25 日払い」", payCycleTextOf(wk) === "毎週 日曜締め・3 日後払い" && payCycleTextOf(payCycleOf(null, 25)) === "毎月 25 日払い", payCycleTextOf(wk));
check("p175(3-3c) P-3 プランの軸＝reward_axis null は店の軸（pts 店なら pts）・'pt'→pts・'pay_rate'・patch は pts→'pt'／null", planRewardAxisOf({ reward_axis: null }, { sys_points: true, sys_sales_rate: false, sys_backs: true, sys_point_slide: true, sys_sales_slide: false } as never) === "pts" && planRewardAxisOf({ reward_axis: "pt" }, null) === "pts" && planRewardAxisOf({ reward_axis: "pay_rate" }, null) === "pay_rate" && J(planRewardAxisPatchOf("pts")) === J({ reward_axis: "pt" }) && J(planRewardAxisPatchOf(null)) === J({ reward_axis: null }));
// P-4 基本の働き方
const af = availFormOf([{ dow: 1, avail: "ok", from_min: 19 * 60, to_min: 25 * 60 }, { dow: 3, avail: "ask", from_min: null, to_min: null }], { week_days_target: 4, fixed_off_dows: [0], effective_from: "2026-11-01" });
check("p175(3-4a) P-4 availFormOf＝7 行・固定休 日曜は不可・月曜 19:00〜25:00・週 4・適用 11/1", af.rows.length === 7 && af.rows[0].avail === "ng" && af.rows[1].from_min === 1140 && af.terms.week_days_target === 4 && af.terms.effective_from === "2026-11-01");
check("p175(3-4b) P-4 希望の既定値＝月曜は 19:00〜25:00・水曜（相談・時間なし）は一括既定・日曜（不可）は null", J(wishDefaultOf(af, 1, { start: "20:00", end: "26:00" })) === J({ start: "19:00", end: "25:00" }) && J(wishDefaultOf(af, 3, { start: "20:00", end: "26:00" })) === J({ start: "20:00", end: "26:00" }) && wishDefaultOf(af, 0, { start: "20:00", end: "26:00" }) === null);
check("p175(3-4c) P-4 固定休と矛盾する希望の印＝2026-10-25（日）は注意・10/26（月）は null・雇用の時間帯は本人不可／店は可・チップ文", fixedOffConflictOf(af, "2026-10-25") === "日曜は基本の働き方で「不可（固定休）」です" && fixedOffConflictOf(af, "2026-10-26") === null && !canEditTimeOf("雇用", true) && canEditTimeOf("雇用", false) && canEditTimeOf("委託", true) && availChipsOf(af) === "月火木金土 可／水 相談／日 不可", availChipsOf(af));
const patch = availPatchOf(af);
check("p175(3-4d) P-4 availPatchOf＝p_rows 7 行・不可の曜日は時間 null・p_terms.fixed_off_dows は不可の曜日 [0]", patch.p_rows.length === 7 && patch.p_rows[0].from_min === null && J(patch.p_terms.fixed_off_dows) === J([0]) && J(availPatchOf(emptyAvailForm()).p_terms.fixed_off_dows) === "[]");
// P-5 CANON 型（fixture）
const FX = JSON.parse(src("docs/demo/fixtures/canon_stores.json")) as { stores: { code: string; pay_rate_tiers: PayRateTier[]; slide_streak_n: number; norm_tiers?: { week_days_min: number; week_days_max: number; days_required: number; hours_required: number }[]; assess_grace_months?: number }[] };
const CANON = FX.stores.find((s) => s.code === "CANON")!;
check("p175(3-6a) P-6 fixture＝6 店（CANON／CLUB G／CLASS／BELLEZZA／Premier／NECT）・CANON は報酬率表 10 段・連続 N＝2・W 別規定 3 段・免除 3 か月・未確定の注記あり", FX.stores.length === 6 && CANON.pay_rate_tiers.length === 10 && CANON.slide_streak_n === 2 && CANON.norm_tiers?.length === 3 && CANON.assess_grace_months === 3 && FX.stores.filter((s) => s.code !== "CANON").every((s) => J(s).includes("未確定")));
const ctxOf = (pct: number, over: Partial<CanonCtx> = {}): CanonCtx => ({ tiers: CANON.pay_rate_tiers, streakN: CANON.slide_streak_n, prevLog: null, salesSubtotal: 1_000_000, normTiers: CANON.norm_tiers!, weekTarget: 4, periodDays: 31, actual: { days: 14, hours: 70 }, joinedOn: "2026-01-10", graceMonths: CANON.assess_grace_months!, periodEnd: "2026-10-31", decided: "apply", ...over });
// timePay＝報酬率 pct の時給分（売上小計 100 万）
const tp = (pct: number) => pct * 10_000;
check("p175(3-5a) P-5 報酬率＝時給分÷売上小計（40％・75％・120％）・段の当たり（40→idx1 UP・75→idx4 査定・120→idx9 査定）", payRatePctOf(tp(40), 1_000_000) === 40 && payRatePctOf(tp(75), 1_000_000) === 75 && payRatePctOf(tp(120), 1_000_000) === 120 && payRateTierOf(CANON.pay_rate_tiers, 40)?.idx === 1 && payRateTierOf(CANON.pay_rate_tiers, 75)?.idx === 4 && payRateTierOf(CANON.pay_rate_tiers, 120)?.idx === 9 && payRatePctOf(100, 0) === null);
check("p175(3-5b) P-5 方向＝up_amount>0 は up・down/pay_pct の段は assess・up 0 の段は hold", directionOf(CANON.pay_rate_tiers[1]) === "up" && directionOf(CANON.pay_rate_tiers[2]) === "hold" && directionOf(CANON.pay_rate_tiers[4]) === "assess" && directionOf(null) === "hold");
const o40a = canonOutcomeOf(ctxOf(40), tp(40));
const o40b = canonOutcomeOf(ctxOf(40, { prevLog: { direction: "up", streak: 1 } }), tp(40));
check("p175(3-5c) P-5 連続 2 期＝1 期目（prevLog なし）は streak 1 で不発動（applied false・upAmount 0）・2 期目（前期 up 1）は streak 2 で発動（upAmount 300）", o40a.direction === "up" && o40a.streak === 1 && !o40a.met && !o40a.applied && o40a.upAmount === 0 && o40b.streak === 2 && o40b.met && o40b.applied && o40b.upAmount === 300, J({ o40a, o40b }));
const o40c = canonOutcomeOf(ctxOf(40, { prevLog: { direction: "hold", streak: 3 } }), tp(40));
check("p175(3-5d) P-5 方向が変わると streak は 1 から（前期 hold 3 → 今期 up 1＝不発動）・streakMetOf(2,2)", o40c.streak === 1 && !o40c.met && streakMetOf(2, 2) && !streakMetOf(1, 2) && streakOf({ direction: "up", streak: 1 }, "up") === 2);
const o75 = canonOutcomeOf(ctxOf(75, { prevLog: { direction: "assess", streak: 1 } }), tp(75));
check("p175(3-5e) P-5 75％＝査定（down 100・支給率 100・減率 0）・連続 2 期で applied", o75.direction === "assess" && o75.applied && o75.downAmount === 100 && o75.payPct === 100 && o75.wageCutPct === 0, J(o75));
const o120 = canonOutcomeOf(ctxOf(120, { prevLog: { direction: "assess", streak: 1 } }), tp(120));
check("p175(3-5f) P-5 120％＝査定（down 500・支給率 70・減率 10）", o120.direction === "assess" && o120.applied && o120.downAmount === 500 && o120.payPct === 70 && o120.wageCutPct === 10, J(o120));
const ap120 = canonApplyOf(o120, { timePay: tp(120), backsTotal: 50_000, gross: 1_250_000, salesSubtotal: 1_000_000 });
check("p175(3-5g) P-5 金額への適用（120％）＝減率 10％→timeDelta −120,000・支給率 70％→gross 1,130,000×0.7＝791,000・整数", ap120.timeDelta === -120_000 && ap120.bonus === 0 && ap120.backsDelta === 0 && ap120.gross === 791_000 && ap120.payPctDelta === 791_000 - 1_130_000 && Number.isInteger(ap120.gross), J(ap120));
const ap40 = canonApplyOf(o40b, { timePay: tp(40), backsTotal: 50_000, gross: 450_000, salesSubtotal: 1_000_000 });
check("p175(3-5h) P-5 UP（40％・発動）＝gross 不変（up_amount は時給の履歴に積む＝ここでは 0 差分）・倍率 100", ap40.gross === 450_000 && ap40.backsDelta === 0 && o40b.backMult === 100);
const oNorm = canonOutcomeOf(ctxOf(40, { prevLog: { direction: "up", streak: 1 }, actual: { days: 5, hours: 20 } }), tp(40));
check("p175(3-5i) P-5 ⑪ 規定未達（週 4 目安→12 日／60h・実績 5 日）は UP だけ止まる（upAmount 0・applied は true・normMet false）", oNorm.applied && !oNorm.normMet && oNorm.upAmount === 0 && oNorm.bonusPct === 0, J(oNorm));
const oGrace = canonOutcomeOf(ctxOf(120, { prevLog: { direction: "assess", streak: 1 }, joinedOn: "2026-09-01" }), tp(120));
check("p175(3-5j) P-5 ⑰(c) 免除（入店 3 か月以内）＝査定を止める（down 0・支給率 100・減率 0・grace true）", oGrace.grace && oGrace.downAmount === 0 && oGrace.payPct === 100 && oGrace.wageCutPct === 0 && graceOf("2026-09-01", 3, "2026-10-31") && !graceOf("2026-01-10", 3, "2026-10-31"), J(oGrace));
const oUndecided = canonOutcomeOf(ctxOf(120, { prevLog: { direction: "assess", streak: 1 }, decided: null }), tp(120));
check("p175(3-5k) P-5 ⑬ 店が未決（提案のまま）＝金額に効かない（applied false・down 0・支給率 100）・除外も同じ", !oUndecided.applied && oUndecided.downAmount === 0 && oUndecided.payPct === 100 && !canonOutcomeOf(ctxOf(120, { prevLog: { direction: "assess", streak: 1 }, decided: "exclude" }), tp(120)).applied);
const nt = normTierOf(CANON.norm_tiers!, 4);
check("p175(3-5l) P-5 W 別規定＝週 4 目安→3〜4 日の段（12 日／60h・31 日の期は ×31/30＝13 日／62h）", nt?.days_required === 12 && J(normRequiredOf(nt!, 31)) === J({ days: 13, hours: 62 }) && J(normRequiredOf(nt!, 30)) === J({ days: 12, hours: 60 }), J(normRequiredOf(nt!, 31)));
check("p175(3-5m) P-5 CANON の器＝サ料 30／VIP 35・現金 10％ OFF（残額 10,000→1,000）・日払い上限（6h 以上 15,000）・時給帯（帯の外は基本）", serviceRateOf({ service_rate: 30, service_rate_by_seat: { vip: 35 } }, "vip") === 35 && serviceRateOf({ service_rate: 30, service_rate_by_seat: { vip: 35 } }, "free") === 30 && payDiscountOf({ cash: 10 }, "cash", 10_000) === 1000 && payDiscountOf({ cash: 10 }, "card", 10_000) === 0 && dailyPayCapOf([{ hours_min: 0, cap: 10_000 }, { hours_min: 6, cap: 15_000 }], 6.5) === 15_000 && hourlyAtOf([{ target: "hourly", from_min: 20 * 60, to_min: 22 * 60, value_amount: 2500, value_rate: null }], 21 * 60, 2000) === 2500 && hourlyAtOf([], 21 * 60, 2000) === 2000);
check("p175(3-5n) P-5 バック単位＝per_check 500×3＝1,500・per_30min 300×（90 分→3）＝900・hourly_add は固定 0（時給加算側）", backOf({ amount: 500, rate: null, unit: "per_check", checks: 3, seatedMinutes: 0, extensions: 0, sets: 0, subtotal: 0 }).total === 1500 && backOf({ amount: 300, rate: null, unit: "per_30min", checks: 0, seatedMinutes: 90, extensions: 0, sets: 0, subtotal: 0 }).total === 900 && backOf({ amount: 300, rate: null, unit: "hourly_add", checks: 0, seatedMinutes: 0, extensions: 0, sets: 0, subtotal: 0 }).total === 0);
// P-7 0177 の送り 4 方式（フラグ true のとき）
check("p175(3-7) P-7 0177 後＝deduction-panel は 'store'／'none' を okuri4wayOn() で選べる・payload は profiles.okuriModeOf（LILY 'store'／NOIR 'none'）＝フラグで眠る", src("lib/nox/shift/okuri-mode.ts").includes("export const okuriModeSelectableOf = (mode: OkuriMode, applied: boolean): boolean => applied || mode === \"actual\" || mode === \"flat\";") && prof.includes("export function okuriModeOf(code)"));
__setRules0175ForTest(null); __setOkuri4wayForTest(null);
check("p175(3-9) 上書きを戻す＝false", !rules0175On() && !okuri4wayOn());

if (fails.length) { console.error(`verify:nox-p175prep FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-p175prep OK ${pass} checks（DB 段 SKIP＝0175／0176／0177 未適用）`);
