/*
 * verify:nox-payroll-view — 夜間便 N3（2026-09-24・週末バックログ 4＝給与の表示・文言）lib/nox/payroll/view.ts の係留（DB 不触・env 不要）。
 *   npm run verify:nox-payroll-view。f0 70 段目。
 *
 *  (1) fmtPeriodYM: 'YYYY-MM'→'YYYY/M'・形が違えばそのまま・空は '—'
 *  (2) fmtMD: 'YYYY-MM-DD'→'M/D'（timestamp 先頭も可）・形が違えばそのまま・空は '—'
 *  (3) missingOutSummaryOf: 0 件は null・件数と文言「退勤の記録が無い勤務が n 件」・一覧は日付昇順→名前
 *  (4) frozenRowsOf: 凍結値をそのまま写す（net／pay／extras／控除の 3 天引き／凍結調整）・凍結名が 1 行でも欠ければ null・空は null
 *  (5) 配線（逐語 grep）: payroll-board が missingOutSummaryOf／frozenRowsOf を通す・list／tax が fmtPeriodYM／fmtMD・「差引支給(net)」「anomaly」の表示語が残っていない・
 *      collect が missingOutDates（noout ∧ final ok|late）を積み preview route が返す
 *  逆テスト 1 本（手動・1 回）: frozenRowsOf の cast_name 欠け判定を外す→pv(4-3) 赤・戻して緑。
 */
import fs from "node:fs";
import { payOf } from "../lib/nox/pay";
import { breakdownLinesOf, hoursCellOf, timeLineOf } from "../lib/nox/payroll/breakdown-lines"; // ★裁定303
import { REINA_INPUT } from "./fixtures-pay";
import { fmtMD, fmtPeriodYM, frozenRowsOf, missingOutSummaryOf } from "../lib/nox/payroll/view";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

// (1)
check("pv(1-1) fmtPeriodYM: 2026-09→2026/9・2026-12→2026/12", fmtPeriodYM("2026-09") === "2026/9" && fmtPeriodYM("2026-12") === "2026/12");
check("pv(1-2) fmtPeriodYM: 形が違えばそのまま・null／''→—", fmtPeriodYM("2026/09") === "2026/09" && fmtPeriodYM(null) === "—" && fmtPeriodYM("") === "—");
// (2)
check("pv(2-1) fmtMD: 2026-10-10→10/10・2026-01-05→1/5・timestamp 先頭も可", fmtMD("2026-10-10") === "10/10" && fmtMD("2026-01-05") === "1/5" && fmtMD("2026-01-05T00:00:00Z") === "1/5");
check("pv(2-2) fmtMD: 形が違えばそのまま・null→—", fmtMD("10/10") === "10/10" && fmtMD(undefined) === "—");
// (3)
check("pv(3-1) missingOutSummaryOf: 0 件（空・欠損キー）＝null", missingOutSummaryOf([]) === null && missingOutSummaryOf([{ castName: "a" }, { castName: "b", missingOutDates: [] }]) === null);
const mo = missingOutSummaryOf([{ castName: "りな", missingOutDates: ["2026-09-22", "2026-09-03"] }, { castName: "あい", missingOutDates: ["2026-09-22"] }]);
check("pv(3-2) missingOutSummaryOf: 3 件・文言・一覧は日付昇順→名前（ja）", mo?.count === 3 && mo.text === "退勤の記録が無い勤務が 3 件" && JSON.stringify(mo.items.map((i) => `${i.castName} ${i.md}`)) === JSON.stringify(["りな 9/3", "あい 9/22", "りな 9/22"]), JSON.stringify(mo));
// (4)
const pay = { gross: 100000, fixedDed: 0, fine: 0, withholding: 9000, arDeduct: 1000, advanceDeduct: 2000, okuriDeduct: 300, normPenalty: 0, net: 87700, taxMode: "委託" } as unknown as Parameters<typeof frozenRowsOf>[0][number]["breakdown_json"]["pay"];
const slipA = { cast_id: "c1", net: 87700, breakdown_json: { pay, extras: [{ amount: 500 }], cast_name: "りな", adjustments: [{ reason: "遅刻精算", amount: 3000, before_withholding: true }], adjustments_hidden: 200 } };
const slipB = { cast_id: "c2", net: 0, breakdown_json: { pay: { net: 0 } as unknown as typeof pay, cast_name: "あい" } };
const fr = frozenRowsOf([slipA, slipB]);
check("pv(4-1) frozenRowsOf: 2 行・net／castName／taxMode／pay／extras をそのまま写す・frozen=true・anomalyCount 0", fr?.length === 2 && fr[0].castId === "c1" && fr[0].castName === "りな" && fr[0].net === 87700 && fr[0].taxMode === "委託" && fr[0].breakdown.pay === pay && fr[0].breakdown.extras[0].amount === 500 && fr[0].frozen === true && fr[0].anomalyCount === 0 && fr[1].castName === "あい" && fr[1].taxMode === "" && fr[1].breakdown.extras.length === 0, JSON.stringify(fr));
check("pv(4-2) frozenRowsOf: 天引き 3 種＝pay.arDeduct／advanceDeduct／okuriDeduct・凍結調整＝adjustments（before→after 順）と hidden", fr?.[0].arDeductTotal === 1000 && fr[0].advDeductTotal === 2000 && fr[0].okuriDeductTotal === 300 && fr[0].adjustmentsShown?.length === 1 && fr[0].adjustmentsShown[0].reason === "遅刻精算" && fr[0].adjustmentsHiddenTotal === 200 && fr[1].adjustmentsShown?.length === 0);
check("pv(4-3) frozenRowsOf: 凍結名が 1 行でも欠ければ null（旧 payslip＝従来どおりプレビュー・fetch を増やさない）・空配列も null", frozenRowsOf([slipA, { cast_id: "c3", net: 1, breakdown_json: { pay } }]) === null && frozenRowsOf([]) === null);
// (5)
const pb = fs.readFileSync("app/(manage)/payroll/payroll-board.tsx", "utf8");
const pl = fs.readFileSync("app/(manage)/payroll/payroll-list.tsx", "utf8");
const pt = fs.readFileSync("app/(manage)/payroll/payment-tax-panel.tsx", "utf8");
const pp = fs.readFileSync("app/(manage)/payroll/payment-panel.tsx", "utf8");
const co = fs.readFileSync("lib/nox/payroll/collect.ts", "utf8");
const rt = fs.readFileSync("app/api/payroll/preview/route.ts", "utf8");
check("pv(5-1) payroll-board: 確定済み run は frozenRowsOf（loadRun 内・payslips を写すだけ）・警告は missingOutSummaryOf（一覧＋出勤板リンク）", /const fr = frozenRowsOf\(slips/.test(pb) && /if \(fr\) \{ setRows\(fr as Row\[\]\);/.test(pb) && /missingOutSummaryOf\(rows\)/.test(pb) && /href="\/shift" className="nox-link"/.test(pb) && /退勤の記録が無い勤務/.test(fs.readFileSync("lib/nox/payroll/view.ts", "utf8")));
check("pv(5-2) 表示語: 「差引支給(net)」「anomaly」「（draft）」が payroll の tsx に残っていない・見出しは「差引支給」「不整合」", ![pb, pl, pt, pp].some((s) => /差引支給\(net\)|>anomaly<|（draft）|\(net\)を超え/.test(s)) && /打刻の不整合（退勤の記録が無い等）/.test(pb) && />不整合<\/th>/.test(pb));
check("pv(5-3) list／tax: 期は fmtPeriodYM・日付は fmtMD（title に元の値）・支払状況／納付状態／期限の td は nowrap", /fmtPeriodYM\(r\.period\)/.test(pl) && /title=\{r\.period\}/.test(pl) && /fmtPeriodYM\(r\.target_month\)/.test(pt) && /fmtMD\(r\.deadline\)/.test(pt) && /title=\{r\.deadline\}/.test(pt) && /fmtMD\(r\.paid_on\)/.test(pt) && (pl.match(/whiteSpace: "nowrap"/g) || []).length >= 5 && (pt.match(/whiteSpace: "nowrap"/g) || []).length >= 3);
check("pv(5-4) collect: missingOutDates＝raw.out 'noout' ∧ final ok|late の bizDate・route が返す・assemble／core は表示専用（fixture 省略可）", /missingOutDates\.push\(d\.bizDate\)/.test(co) && /d\.raw\.out\.type === "noout" && \(d\.final\.type === "ok" \|\| d\.final\.type === "late"\)/.test(co) && /missingOutDates: r\.missingOutDates/.test(rt) && /missingOutDates\?: string\[\];/.test(fs.readFileSync("lib/nox/payroll/assemble.ts", "utf8")));

// (6) ★裁定303（2026-09-25）: 支給内訳の単一関数・0h の時間行・雇用の常時表示・行合計＝net・「打乱なし」
{
  const reina = payOf(REINA_INPUT);
  const koyo = payOf({ ...REINA_INPUT, taxMode: "雇用" });
  const fixed = payOf({ ...REINA_INPUT, plan: { ...REINA_INPUT.plan, base: 3000 }, override: { pay_rule: "fixed", fixed_amount: 300_000 }, calcPeriodDays: 31 });
  const bdR = breakdownLinesOf({ pay: reina }), bdK = breakdownLinesOf({ pay: koyo }), bdF = breakdownLinesOf({ pay: fixed });
  check("pv(6-1) 行合計＝net（玲奈 golden: wage 5931／withholding 125802／net 1208848・雇用版・固定給版の 3 fixture）", reina.wage === 5931 && reina.withholding === 125802 && reina.net === 1208848 && bdR.net === reina.net && bdK.net === koyo.net && bdF.net === fixed.net && bdR.earnTotal === reina.gross && bdK.earnTotal === koyo.gross && bdF.earnTotal === fixed.gross, `R ${bdR.net}/${reina.net} K ${bdK.net}/${koyo.net} F ${bdF.net}/${fixed.net}`);
  const zero = payOf({ ...REINA_INPUT, daily: [], cast: { ...REINA_INPUT.cast, days: 0 } });
  const tl = timeLineOf(zero);
  check("pv(6-2) 303-2: 0h の時給行＝「時給 ¥n/h × 0h」を出す（amount 0・earn の先頭）・fixed は「固定給」・per_shift は「1稼働 ¥n × k回」", tl.key === "timePay" && /^時給 ¥[\d,]+\/h × 0h$/.test(tl.label) && tl.amount === 0 && breakdownLinesOf({ pay: zero }).earn[0].key === "timePay" && timeLineOf({ payRule: { rule: "fixed", fixedAmount: 300000, calcDays: 31, periodDays: 31 }, timePay: 300000 }).label.startsWith("固定給") && timeLineOf({ payRule: { rule: "per_shift", perShiftAmount: 8000, shiftCount: 12 }, timePay: 96000 }).label === "1稼働 ¥8,000 × 12回", tl.label);
  check("pv(6-3) 残り物の行なし: 「その他」を含むラベル 0・extras は行として出るが合計は gross（二重加算なし）", [...bdR.earn, ...bdR.ded].every((l) => !l.label.includes("その他")) && breakdownLinesOf({ pay: { ...reina, gross: reina.gross + 1000 }, extras: [{ kind: "attendance_bonus", amount: 1000 }] }).earnTotal === reina.gross + 1000 && breakdownLinesOf({ pay: reina, extras: [{ kind: "attendance_bonus", amount: 1000 }] }).earn.some((l) => l.label === "出勤ボーナス" && l.amount === 1000));
  const hc = hoursCellOf(0, 3), hc2 = hoursCellOf(12.5, 3), hc3 = hoursCellOf(0, 0), hc4 = hoursCellOf(undefined, 2);
  check("pv(6-4) 303-3 hoursCellOf: 0h かつ日数>0＝「打刻なし」・値は変えない・0h/0 日は注記なし・hours 無しは '-'", hc.text === "0h" && hc.note === "打刻なし" && hc2.note === null && hc2.text === "12.5h" && hc3.note === null && hc4.text === "-" && hc4.note === null);
  const pbSrc = fs.readFileSync("app/(manage)/payroll/payroll-board.tsx", "utf8");
  const psSrc = fs.readFileSync("components/payslip-slip.tsx", "utf8");
  check("pv(6-5) 配線: payroll-board と payslip-slip が同じ関数（breakdownLinesOf）を import・「その他バック」「その他」の行なし・旧 earnRows／nominBack／prodBack なし・一覧は hoursCellOf", pbSrc.includes('from "@/lib/nox/payroll/breakdown-lines"') && psSrc.includes('from "@/lib/nox/payroll/breakdown-lines"') && pbSrc.includes("bd.earn.map(") && psSrc.includes("bd.earn.map(") && !pbSrc.includes("その他バック") && !pbSrc.includes("earnRows") && !psSrc.includes("nominBack") && !psSrc.includes("prodBack") && pbSrc.includes("hoursCellOf(pay?.wHours"));
}

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-payroll-view OK (${pass} checks)`);
