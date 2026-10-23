/*
 * verify:nox-pr1 — 便 PR-1（2026-10-23）: 時給の日付解決（裁定416・R-2）・同伴の正本化（裁定417・R-4）・390px 税務・出力（R-5）の係留（純関数＋逐語 grep・DB 不触）。
 *   npm run verify:nox-pr1（env 不要）。
 *  (1) wageSpansOf: ①保証中の日は保証・期限翌日から基本（2 区間）②区間の h の和＝合計 h・Σ pay＝timePay ③時給が変わらない月は 1 区間（＝従来の 1 行）④半月判定＝16 日を境に 2 区間（同じ時給でも）
 *  (2) breakdownLinesOf: 区間 2 つ＝「時給 ¥3,200/h × 70.2h（10/1〜10/24・保証）」「時給 ¥2,200/h × 18.7h（10/25〜10/31・基本）」の 2 行・「うち保証」補助行なし／1 区間＝従来の 1 行＋補助行
 *  (3) dohan-mark: ⑤伝票で同伴 ON→印「同伴（A2）」・遅刻免除（出勤記録は実時刻のまま・注記）／OFF→印が消え遅刻に戻る・attendanceWithDohanOf＝その日の status を 'dohan'（punch-match の applyAttendance で late を打ち消す）
 *  (4) 逐語: collect.loadPunch が check_nominations（is_dohan・checks!inner）を読み attendanceWithDohanOf を通す／今日タブに 'dohan' のボタンが無い（ATT_OPTIONS 4 値）／同伴本数は cast_sales_aggregate（伝票）だけ＝collect に attendance の 'dohan' 数え上げが無い
 *  (5) R-5: payroll-board の税務・出力カード 2 枚＋invoice-panel の支払調書 CSV が .nox-taxcard・見出しの再読込が .nox-taxhead・インボイス表が .nox-invtable＋data-label・CSS（≤600px 中央・カード型）
 *  逆テスト（手動・1 回）: wageSpansOf の `last.kind === kind` を外す→pr1(1-1) 赤。
 */
import fs from "node:fs";
import { wageSpansOf, wageSpanLabelOf, wageDayKindOf } from "../lib/nox/payroll/wage-spans";
import { breakdownLinesOf, timeLinesOf } from "../lib/nox/payroll/breakdown-lines";
import { dohanSeatsOf, dohanMarkTextOf, lateExemptByDohanOf, attendanceWithDohanOf, DOHAN_LATE_EXEMPT_NOTE } from "../lib/nox/shift/dohan-mark";
import { matchPunches } from "../lib/nox/punch-match";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: string) => { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// (1) 区間
const day = (d: number, hours: number, hourly: number, gua?: boolean) => ({ d, hours, hourly, basis: gua ? "保証" : "保証", ...(gua ? { gua: true } : {}) });
const octo = [...Array.from({ length: 24 }, (_, i) => day(i + 1, 2.925, 3200, true)), ...Array.from({ length: 7 }, (_, i) => day(25 + i, 2.671, 2200))];
const spans = wageSpansOf(octo, { timePay: Math.round(3200 * 70.2 + 2200 * 18.7) });
check("pr1(1-1) 保証中（10/1〜10/24）は保証 ¥3,200・期限翌日（10/25〜）から基本 ¥2,200＝2 区間", spans.length === 2 && spans[0].fromD === 1 && spans[0].toD === 24 && spans[0].hourly === 3200 && spans[0].kind === "保証" && spans[1].fromD === 25 && spans[1].toD === 31 && spans[1].hourly === 2200 && spans[1].kind === "基本", JSON.stringify(spans));
check("pr1(1-2) 区間の h の和＝合計 h（70.2＋18.7＝88.9）・Σ pay＝timePay（端数は最後の区間）", Math.round((spans[0].hours + spans[1].hours) * 10) / 10 === 88.9 && spans[0].pay + spans[1].pay === Math.round(3200 * 70.2 + 2200 * 18.7), `${spans[0].hours}+${spans[1].hours} / ${spans[0].pay}+${spans[1].pay}`);
const sep = wageSpansOf(Array.from({ length: 20 }, (_, i) => day(i + 1, 4, 2200)), { timePay: 2200 * 80 });
check("pr1(1-3) 時給が変わらない月＝1 区間（9 月は 1 行のまま）・0h の日は区間に含めない", sep.length === 1 && sep[0].hours === 80 && wageSpansOf([day(1, 0, 3000, true), day(2, 5, 2200)]).length === 1);
const half = wageSpansOf(Array.from({ length: 30 }, (_, i) => day(i + 1, 3, 2500)), { splitAtD: [16] });
check("pr1(1-4) 半月判定＝16 日を境に 2 区間（同じ時給でも判定日で切る）・途中の 0h の日をまたいでも 16 を含めば切る", half.length === 2 && half[0].toD === 15 && half[1].fromD === 16 && wageSpansOf([day(14, 3, 2500), day(18, 3, 2500)], { splitAtD: [16] }).length === 2);
check("pr1(1-5) 区分＝gua→保証／basis 売上→売上段／ポイント→pt 段／他→基本・ラベル「時給 ¥3,200/h × 70.2h（10/1〜10/24・保証）」", wageDayKindOf({ basis: "保証", gua: true }) === "保証" && wageDayKindOf({ basis: "売上" }) === "売上段" && wageDayKindOf({ basis: "ポイント" }) === "pt 段" && wageDayKindOf({ basis: "保証" }) === "基本"
  && wageSpanLabelOf(spans[0], "2026-10", false) === "時給 ¥3,200/h × 70.2h（10/1〜10/24・保証）" && wageSpanLabelOf(spans[1], "2026-10", false) === "時給 ¥2,200/h × 18.7h（10/25〜10/31・基本）" && wageSpanLabelOf(sep[0], "2026-09", true) === "時給 ¥2,200/h × 80h");
// (2) 明細の行
const pay2 = { wage: 3000, wHours: 88.9, timePay: Math.round(3200 * 70.2 + 2200 * 18.7), wdays: octo, guarantee: { spans: [{ from: "2026-10-01", to: "2026-10-24", base: 3200 }], baseHours: 18.7, basePay: 41140, guaHours: 70.2, guaPay: 224640 }, gross: 265780 };
const bd2 = breakdownLinesOf({ pay: pay2, period: "2026-10" });
check("pr1(2-1) 区間 2 つ＝支給の先頭 2 行が区間行・「うち保証」の補助行は出ない・Σ 2 行＝timePay", bd2.earn[0].label === "時給 ¥3,200/h × 70.2h（10/1〜10/24・保証）" && bd2.earn[1].label === "時給 ¥2,200/h × 18.7h（10/25〜10/31・基本）" && !bd2.earn.some((l) => l.label.includes("うち保証")) && bd2.earn[0].amount + bd2.earn[1].amount === pay2.timePay, JSON.stringify(bd2.earn.slice(0, 3)));
const pay1 = { wage: 2200, wHours: 80, timePay: 176000, wdays: Array.from({ length: 20 }, (_, i) => day(i + 1, 4, 2200)), gross: 176000 };
const bd1 = breakdownLinesOf({ pay: pay1, period: "2026-09" });
check("pr1(2-2) 1 区間＝従来の 1 行「時給 ¥2,200/h × 80h」（日付なし）・timeLinesOf は wdays 無し／fixed でも 1 行", bd1.earn[0].label === "時給 ¥2,200/h × 80h" && timeLinesOf({ wage: 2200, wHours: 10, timePay: 22000 }).length === 1 && timeLinesOf({ ...pay2, payRule: { rule: "fixed", fixedAmount: 300000 } }).length === 1);
// (3) 同伴
const seats = dohanSeatsOf([{ cast_id: "reina", seat_name: "A2", check_status: "open" }, { cast_id: "reina", seat_name: "A2", check_status: "closed" }, { cast_id: "mei", seat_name: "B1", check_status: "void" }]);
check("pr1(3-1) 伝票で同伴 ON＝印「同伴（A2）」（同じ卓は 1 つ・void は除く）・OFF（行なし）＝印なし", dohanMarkTextOf(seats.get("reina")) === "同伴（A2）" && !seats.has("mei") && dohanMarkTextOf(undefined) === "同伴");
check("pr1(3-2) 遅刻免除＝同伴の日は late false＋注記「同伴のため遅刻扱いなし」（遅刻分があるときだけ）・同伴なしは遅刻のまま", JSON.stringify(lateExemptByDohanOf(25, true)) === JSON.stringify({ late: false, note: DOHAN_LATE_EXEMPT_NOTE }) && JSON.stringify(lateExemptByDohanOf(0, true)) === JSON.stringify({ late: false, note: null }) && JSON.stringify(lateExemptByDohanOf(25, false)) === JSON.stringify({ late: true, note: null }));
const att = attendanceWithDohanOf([{ date: "2026-10-02", status: "late" }, { date: "2026-10-03", status: "absent" }], new Set(["2026-10-02", "2026-10-03", "2026-10-05"]), (date) => ({ date, status: "shukkin" }));
check("pr1(3-3) attendanceWithDohanOf＝late→dohan・absent は据え置き・行の無い日は dohan で追加", JSON.stringify(att) === JSON.stringify([{ date: "2026-10-02", status: "dohan" }, { date: "2026-10-03", status: "absent" }, { date: "2026-10-05", status: "dohan" }]), JSON.stringify(att));
const m = matchPunches({ shifts: [{ bizDate: "2026-10-02", start: "20:00", end: "26:00" }], punches: { "2026-10-02": [{ kind: "in", at: "20:30" }, { kind: "out", at: "26:00" }] }, attendance: [{ bizDate: "2026-10-02", status: "dohan" }], config: { close: "26:00" } });
check("pr1(3-4) punch-match: 同伴の日（status dohan）は 30 分遅れの in でも final ok（遅刻 0）・出勤記録は実時刻のまま", m.lateN === 0 && m.days[0]?.final.type === "ok");
// (4) 逐語
const col = src("lib/nox/payroll/collect.ts"), sb = src("app/(manage)/shift/shift-board.tsx");
check("pr1(4-1) collect.loadPunch＝check_nominations（is_dohan・checks!inner・void 除く）を読み attendanceWithDohanOf を通す", col.includes('admin.from("check_nominations").select("cast_id, checks!inner(started_at, status, store_id)").eq("is_dohan", true)') && col.includes("const attWithDohan = attendanceWithDohanOf(raw.att, dohanDatesByCast.get(cid)") && col.includes("attendance: attWithDohan, punches: raw.punches"));
check("pr1(4-2) 今日タブ＝出勤記録のボタンに「同伴」が無い（4 値）・同伴の印は伝票（dohanSeatsOf／dohanMarkTextOf）・遅刻免除の注記", !sb.includes('["dohan", "同伴"]') && !sb.includes('"dohan")}>{dh.set ? "同伴を外す" : "同伴"}') && sb.includes("dohanMarkTextOf(") && sb.includes("lateExemptByDohanOf(") && sb.includes('from("check_nominations")'));
check("pr1(4-3) 同伴本数＝伝票（cast_sales_aggregate）だけ＝collect に attendance の 'dohan' の数え上げ（dohanN／dohanCount）は無い", !/att\.filter\(\(a\) => a\.status === "dohan"\)/.test(col) && col.includes("attendanceWithDohanOf"));
// (5) R-5
const pb = src("app/(manage)/payroll/payroll-board.tsx"), ip = src("app/(manage)/payroll/invoice-panel.tsx"), tp = src("app/(manage)/payroll/payment-tax-panel.tsx"), css = src("app/globals.css");
check("pr1(5-1) 税務・出力＝給与明細CSV／報酬明細のカードが .nox-taxcard・支払調書CSV の行も .nox-taxcard・見出しの再読込（インボイス／納付管理）が .nox-taxhead", pb.includes('className="nox-cardtop nox-taxcard"') && pb.includes('className="nox-noprint nox-taxcard"') && ip.includes('className="nox-taxcard nox-taxcsv"') && ip.includes('className="nox-taxhead"') && tp.includes('className="nox-taxhead"'));
check("pr1(5-2) インボイス表＝.nox-tablewrap の器＋.nox-invtable・td に data-label 8 種・空の任意列は inv-empty・3 択は横 1 行（inv-seg）", ip.includes('className="nox-tablewrap plain nox-invwrap"') && ip.includes('className="nox-invtable"') && ["キャスト", "源泉", "区分", "インボイス", "登録番号", "登録の効力発生日", "失効日", "登録通知受領日"].every((l) => ip.includes(`data-label="${l}"`)) && ip.includes('"inv-opt inv-empty"') && ip.includes('className="inv-seg"'));
check("pr1(5-3) CSS＝≤600px で .nox-taxcard 縦・button 100%・.nox-taxhead の button 100%・.nox-invtable はカード型（thead 非表示・td::before data-label・inv-empty 非表示）・リンク .nox-wraplink 折り返し", css.includes(".nox-taxcard { flex-direction: column; align-items: stretch; }") && css.includes(".nox-taxhead > button { width: 100%; margin-left: 0 !important; justify-content: center; }") && css.includes(".nox-invtable thead { display: none; }") && css.includes(".nox-invtable td::before { content: attr(data-label);") && css.includes(".nox-invtable td.inv-opt.inv-empty { display: none; }") && css.includes(".nox-wraplink { white-space: normal; overflow-wrap: anywhere; }") && pb.includes('className="nox-link nox-wraplink"'));
check("pr1(5-4) 明細の区間行＝右パネル（period・半月は splitAtD [16]）と PayslipSlip（slip.period）が同じ引数で breakdownLinesOf を呼ぶ", pb.includes("period, splitAtD: (pay.slideBasis as { apply?: string } | undefined)?.apply === \"half\" ? [16] : undefined") && src("components/payslip-slip.tsx").includes("period: slip.period, splitAtD:"));

if (fails.length) { console.error(`verify:nox-pr1 FAIL (${fails.length})\n- ${fails.join("\n- ")}`); process.exit(1); }
console.log(`verify:nox-pr1 OK (${pass} checks)\n便 PR-1: 時給の区間行（裁定416）・同伴の正本＝伝票（裁定417）・390px 税務・出力`);
