/*
 * verify:nox-338 — 裁定338＋追補1（0168・便 P168・2026-10-09）: スライドの判定期間（monthly／half／daily）の純関数と配線、X-13-28（PeriodSelect）、裁定341（無効チェック）の pin。
 *   npm run verify:nox-338。f0 100 段目（DB 不触・env 不要）。
 *  sp(1) slide.ts: periodKeyOf／periodRangeOfKey／prevPeriodKeyOf／periodKeysInRange／periodLabelOf／slideDescOf（「翌日以降」なし）
 *  sp(2) monthly: 月中に段が上がっても slideInputOf＋wageDetail（pay.ts 不変）で月初の勤務にも新段の時給＝全日同じ hourly／half: H1／H2 で独立／daily: slideByDay なし＝従来
 *  sp(3) 配線: collect（slidePeriodByPlan・期間累計・provisional）・assemble（slidePeriod 優先）・core（slideBasisForPeriodOf）・breakdown-lines（期間ラベル・暫定）
 *  sp(4) UI: plan-editor 3 択（monthly 既定）・p_slide_period・ピル・説明文 3 種・「翌日以降」0／SlideInput period
 *  ps(1) X-13-28: PeriodSelect（select・もっと前…・確定の印）＝給与・分析・月報・ノルマの 4 箇所・period-picker 撤去
 *  r341(1) レジ: 場内のとき店長以上に無効チェック「既出ドリンクも本指名の率にする（準備中）」
 */
import fs from "node:fs";
import { periodKeyOf, periodRangeOfKey, prevPeriodKeyOf, periodKeysInRange, periodLabelOf, slideDescOf, slidePillOf, slideAtLabelOf, slideBasisForPeriodOf } from "../lib/nox/payroll/slide";
import { slideInputOf } from "../lib/nox/payroll/assemble";
import { wageDetail, type CompPlan } from "../lib/nox/pay";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

// sp(1)
{
  check("sp(1-1) periodKeyOf: monthly 'YYYY-MM'・half H1（1〜15）／H2（16〜末）・daily 日", periodKeyOf("2026-10-09", "monthly") === "2026-10" && periodKeyOf("2026-10-15", "half") === "2026-10-H1" && periodKeyOf("2026-10-16", "half") === "2026-10-H2" && periodKeyOf("2026-10-09", "daily") === "2026-10-09");
  check("sp(1-2) periodRangeOfKey: 月＝1〜末・H1＝1〜15・H2＝16〜末（2 月も）", JSON.stringify(periodRangeOfKey("2026-02")) === JSON.stringify({ start: "2026-02-01", end: "2026-02-28" }) && JSON.stringify(periodRangeOfKey("2026-10-H1")) === JSON.stringify({ start: "2026-10-01", end: "2026-10-15" }) && JSON.stringify(periodRangeOfKey("2026-10-H2")) === JSON.stringify({ start: "2026-10-16", end: "2026-10-31" }));
  check("sp(1-3) prevPeriodKeyOf: 月→前月・H1→前月 H2・H2→同月 H1・年またぎ", prevPeriodKeyOf("2026-10") === "2026-09" && prevPeriodKeyOf("2026-10-H1") === "2026-09-H2" && prevPeriodKeyOf("2026-10-H2") === "2026-10-H1" && prevPeriodKeyOf("2026-01-H1") === "2025-12-H2" && prevPeriodKeyOf("2026-01") === "2025-12");
  check("sp(1-4) periodKeysInRange: 10 月＝monthly 1・half 2（H1,H2）・daily 31", periodKeysInRange("2026-10-01", "2026-10-31", "monthly").length === 1 && JSON.stringify(periodKeysInRange("2026-10-01", "2026-10-31", "half")) === JSON.stringify(["2026-10-H1", "2026-10-H2"]) && periodKeysInRange("2026-10-01", "2026-10-31", "daily").length === 31);
  check("sp(1-5) ラベルと説明文: 10月／10月前半（1〜15日）／10月後半（16〜末日）・説明文 3 種に「翌日以降」なし・ピル・単位", periodLabelOf("2026-10") === "10月" && periodLabelOf("2026-10-H1") === "10月前半（1〜15日）" && periodLabelOf("2026-10-H2") === "10月後半（16〜末日）" && !/翌日/.test([slideDescOf("monthly", "yen", false), slideDescOf("half", "pt", false), slideDescOf("daily", "yen", false), slideDescOf("monthly", "yen", true)].join()) && slideDescOf("monthly", "yen", false).includes("月の累計売上（按分後）") && slideDescOf("half", "yen", false).includes("1〜15 日・16〜末日の累計") && slideDescOf("daily", "yen", false).includes("その日の売上（按分後）") && slidePillOf("monthly", false).startsWith("判定期間: 月次") && slideAtLabelOf("half", "yen") === "以上（半月の累計売上）");
}
// sp(2) 純関数で段の当たり方
{
  const plan: CompPlan = { id: "p", name: "月次", base: 2000, honBack: 0, jonaiBack: 0, dohanBack: 0, salesSlide: [{ at: 300000, wage: 3000 }, { at: 600000, wage: 4000 }], pointSlide: [], honBackMode: "per_count", honBackRate: null, jonaiBackMode: "per_count", jonaiBackRate: null, dohanBackMode: "per_count", dohanBackRate: null, components: [] } as unknown as CompPlan;
  const daily = [{ bizDate: "2026-10-01", sales: 100000, hours: 5 }, { bizDate: "2026-10-10", sales: 250000, hours: 5 }, { bizDate: "2026-10-20", sales: 300000, hours: 5 }]; // 累計 650,000＝2 段目（4000）
  const dRows = daily.map((x) => ({ d: Number(x.bizDate.slice(8, 10)), sales: x.sales, hours: x.hours }));
  const monthly = slideInputOf({ daily, slidePeriod: "monthly", slideTotals: { "2026-10": { sales: 650000, pts: 0 } } });
  const wdM = wageDetail(dRows, plan, 0, 650000, undefined, undefined, monthly.slideByDay);
  check("sp(2-1) monthly: 月中に段が上がっても月初（10/1）の勤務にも新段 4,000 が当たる＝全日 hourly 4,000・加重平均 4,000", wdM.wdays.every((w) => w.hourly === 4000) && wdM.wage === 4000, JSON.stringify(wdM.wdays.map((w) => w.hourly)));
  const half = slideInputOf({ daily, slidePeriod: "half", slideTotals: { "2026-10-H1": { sales: 350000, pts: 0 }, "2026-10-H2": { sales: 300000, pts: 0 } } });
  const wdH = wageDetail(dRows, plan, 0, 650000, undefined, undefined, half.slideByDay);
  check("sp(2-2) half: H1（累計 350,000＝1 段目 3,000）と H2（300,000＝1 段目 3,000・独立）＝10/1・10/10 は 3,000・10/20 は 3,000・H2 を 700,000 にすると 10/20 だけ 4,000", wdH.wdays.map((w) => w.hourly).join() === "3000,3000,3000" && wageDetail(dRows, plan, 0, 650000, undefined, undefined, slideInputOf({ daily, slidePeriod: "half", slideTotals: { "2026-10-H1": { sales: 350000, pts: 0 }, "2026-10-H2": { sales: 700000, pts: 0 } } }).slideByDay).wdays.map((w) => w.hourly).join() === "3000,3000,4000");
  const dailyIn = slideInputOf({ daily });
  const wdD = wageDetail(dRows, plan, 0, 650000);
  check("sp(2-3) daily: slideByDay なし＝その日の売上で段（10/1 100,000→2,000 base・10/10 250,000→2,000・10/20 300,000→3,000）＝従来どおり", !("slideByDay" in dailyIn) && wdD.wdays.map((w) => w.hourly).join() === "2000,2000,3000");
  const sb = slideBasisForPeriodOf({ months: [{ month: "2026-10-H1", prevMonth: "2026-09", sales: 1, pts: 0, salesWage: 3000, ptsWage: 0 }] }, "half", true, false);
  check("sp(2-4) slideBasisForPeriodOf: apply＝期間・provisional・prevMonth＝元キー（'next' なら前の期間）", sb.apply === "half" && sb.provisional === true && sb.months[0].prevMonth === "2026-10-H1" && slideBasisForPeriodOf({ months: sb.months }, "half", false, true).months[0].prevMonth === "2026-09-H2");
}
// sp(3)／sp(4)／ps／r341 配線
{
  const co = src("lib/nox/payroll/collect.ts"), asm = src("lib/nox/payroll/assemble.ts"), core = src("lib/nox/payroll/core.ts"), bl = src("lib/nox/payroll/breakdown-lines.ts");
  check("sp(3-1) collect: comp_plans の select に slide_period・slidePeriodByPlan・期間累計（get_cast_sales／loadAccounting を窓ごと）・'next'＝前の期間・provisional", co.includes(", slide_period\")") && co.includes("slidePeriodByPlan.set(p.id as string, slidePeriodOf(p.slide_period));") && co.includes("rec[k] = { sales: a.sales, pts: castPts(a, a.pt) };") && co.includes('const src = win.slideApply === "next" ? prevPeriodKeyOf(k) : k;') && co.includes("slideProvisional: slideProvisionalOf("));
  check("sp(3-2) assemble／core／breakdown: slideInputOf は slidePeriod 優先・core が slideBasisForPeriodOf で凍結形へ・明細に期間ラベルと「暫定（期首〜今日）」", asm.includes('if (raw.slidePeriod === "monthly" || raw.slidePeriod === "half") {') && core.includes("slideBasisForPeriodOf(pay.slideBasis, c.slidePeriod, !!c.slideProvisional, win.slideApply === \"next\")") && bl.includes('if (ap === "monthly" || ap === "half") push(') && bl.includes("暫定（期首〜今日）"));
  const pe = src("app/(manage)/master/cast-comp/plan/plan-editor.tsx"), cs = src("app/(manage)/master/cast-comp/comp-sections.tsx");
  check("sp(4-1) plan-editor: 3 択 select（monthly 既定・owner）・p_slide_period・ピル slidePillOf・説明文 slideDescOf・SlideInput period・「翌日以降」0", pe.includes('aria-label="スライドの判定期間"') && pe.includes('<option value="monthly">月次（既定）</option><option value="half">半月</option><option value="daily">日次</option>') && pe.includes("p_slide_period: draft.slidePeriod,") && pe.includes('slidePeriod: "monthly", // ★裁定338: 新規プランの初期値＝月次') && pe.includes("slidePillOf(draft.slidePeriod, slideApplyOf(settings) === \"next\")") && pe.includes('slideDescOf(draft.slidePeriod, "yen", slideApplyOf(settings) === "next")') && pe.includes("period={draft.slidePeriod}") && !pe.includes("翌日以降") && !cs.includes("翌日以降") && cs.includes("const atLabel = period ? slideAtLabelOf(period, basis) :"));
  const pb = src("app/(manage)/payroll/payroll-board.tsx"), an = src("app/(manage)/analytics/analytics-board.tsx"), mr = src("app/(manage)/report/month-report.tsx"), ps = src("components/nox/period-select.tsx");
  check("ps(1-1) X-13-28: PeriodSelect（select・periodCandidatesOf・確定の印・もっと前…）＝給与（finalized）・分析・月報・ノルマの 4 箇所・period-picker 撤去・type=\"month\" 0", ps.includes('<option value={PERIOD_MORE}>もっと前…</option>') && ps.includes("periodCandidatesOf(current, [...runPeriods, value].filter(Boolean), back)") && pb.includes("<PeriodSelect value={period} onChange={setPeriod} finalized={finalizedPeriodsOf(runPeriods)}") && an.includes('<PeriodSelect value={period} onChange={setPeriod} ariaLabel="対象月" />') && mr.includes('<PeriodSelect value={period} onChange={setPeriod} ariaLabel="対象月" />') && cs.includes('<PeriodSelect value={period} onChange={(v) => setPeriod(v)} ariaLabel="ノルマの期間（月）" />') && !fs.existsSync("components/nox/period-picker.tsx") && ![pb, an, mr, cs].some((x) => x.includes('type="month"')));
  const rb = src("app/(manage)/register/register-board.tsx");
  check("r341(1-1) レジ: 場内のとき店長以上に無効チェック（既出ドリンクも本指名の率にする（準備中））・既定は非遡及＝0169 待ち", rb.includes('{kind === "jonai" && isManagerUp && (') && rb.includes('<input type="checkbox" disabled aria-label="この伝票の既出ドリンクも本指名の率にする（準備中）" />'));
}

if (fails.length) {
  console.error(`verify:nox-338 FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-338 OK (${pass} checks)`);
console.log("裁定338（0168）: 期間キー・monthly は月初にも新段・half は H1/H2 独立・daily 従来／UI 3 択・ピル・説明文／X-13-28 PeriodSelect 4 箇所／341 無効チェック");
