/*
 * verify:nox-431 — 裁定431（2026-10-26 確定・Agoora）源泉の直し。DB 不触（純関数＋逐語 grep＋0184 の形）。
 *  ① 委託の精算調整（source settlement＝遅刻・当欠・罰金・ノルマ未達）は源泉の後（行の before_withholding より優先）・雇用の懲戒減給／不就労は源泉前のまま・手入力は委託の既定が「源泉後」・明細の凍結も同じ関数
 *  ② 源泉＝整数（floor(課税額 × 1021 ÷ 10000)）・旧 × 0.1021 と 0〜200 万円で一致（golden 不変）・スタッフ委託も整数・SQL（0184）も同じ式
 *  ③ 固定控除の送り代＝送りが使える店では作れない・既存は警告
 *  ④ 文言 2 か所（pay.ts 冒頭・給与右パネル）　⑤ 日次精算の控除日数は現状維持（T17 待ち）　⑥ 雇用のシフト無し出勤は打刻の時間で時給（委託は従来どおり）
 *  逆テスト（手動・各 1 回）: effectiveAdjustmentsOf の委託分岐を外す→431(1-2) 赤／withholding1021Of を × 0.1021 に戻して 1 円ずれる値を足す→431(2-1) は同値のまま（golden 不変の根拠）。
 */
import fs from "node:fs";
import { payOf } from "../lib/nox/pay";
import { withholding1021Of } from "../lib/nox/money";
import { effectiveAdjustmentsOf, frozenAdjustmentsOf, type AdjustmentRow } from "../lib/nox/payroll/adjust";
import { staffPayOf } from "../lib/nox/staff/pay";
import { OKURI_DEDUCTION_BLOCK_MSG, isOkuriDeductionName, okuriDeductionBlockedOf, okuriDeductionWarnOf } from "../lib/nox/shift/okuri-mode";
import { noShiftSummaryOf } from "../lib/nox/payroll/view";
import { REINA_INPUT } from "./fixtures-pay";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// ① 源泉の前／後
const row = (source: string, before = true, amount = 10000): AdjustmentRow => ({ castId: "c", kind: "fixed", amount, rateBp: null, beforeWithholding: before, showDetail: true, reason: source, source } as AdjustmentRow);
const rows = [row("settlement"), row("sanction"), row("shortfall"), row("manual"), row("carryover", false)];
const con = effectiveAdjustmentsOf(rows, "委託").map((r) => [r.source, r.beforeWithholding]);
const emp = effectiveAdjustmentsOf(rows, "雇用").map((r) => [r.source, r.beforeWithholding]);
check("431(1-1) 委託＝settlement だけ源泉の後に（sanction／shortfall／manual は行の指定どおり）・雇用は全部行の指定どおり", JSON.stringify(con) === JSON.stringify([["settlement", false], ["sanction", true], ["shortfall", true], ["manual", true], ["carryover", false]]) && JSON.stringify(emp) === JSON.stringify([["settlement", true], ["sanction", true], ["shortfall", true], ["manual", true], ["carryover", false]]), { con, emp });
const base = { ...REINA_INPUT, taxMode: "委託" as const };
const p0 = payOf(base);
const pSet = payOf({ ...base, adjustments: [row("settlement", true, 10000)] });
const pMan = payOf({ ...base, adjustments: [row("manual", true, 10000)] });
check("431(1-2) 委託の精算調整 ¥10,000＝源泉は差し引く前の総額で（源泉は調整なしと同じ）・手取りは ¥10,000 減る／手入力の源泉前は従来どおり源泉が減る", pSet.withholding === p0.withholding && pSet.net === p0.net - 10000 && pMan.withholding < p0.withholding, { w0: p0.withholding, wSet: pSet.withholding, wMan: pMan.withholding, n0: p0.net, nSet: pSet.net });
const pEmp = payOf({ ...base, taxMode: "雇用" as const, adjustments: [row("sanction", true, 10000)] });
check("431(1-3) 雇用の懲戒減給は源泉前のまま（雇用の税額表は器なし＝源泉 0・計算の順序は従来どおり）", pEmp.withholding === payOf({ ...base, taxMode: "雇用" as const }).withholding && src("lib/nox/payroll/adjust.ts").includes('return taxMode === "委託" ? rows.map((r) => (r.source === "settlement" && r.beforeWithholding ? { ...r, beforeWithholding: false } : r)) : [...rows];'));
const fz = frozenAdjustmentsOf(effectiveAdjustmentsOf([row("settlement")], "委託"), 100000).shown[0];
check("431(1-4) 明細の凍結（源泉前／後の表示）も計算と同じ関数（core.ts）・手入力の調整控除の既定＝委託は源泉後", fz.before_withholding === false && src("lib/nox/payroll/core.ts").includes("frozenAdjustmentsOf(effectiveAdjustmentsOf(c.adjustments ?? [], taxMode), pay.gross)") && src("lib/nox/pay.ts").includes("const adj = adjustOf(effectiveAdjustmentsOf(input.adjustments ?? [], input.taxMode), gross);") && src("app/(manage)/payroll/payroll-board.tsx").includes('setAdjForm((f) => ({ ...f, before: tm !== "委託" }))') && src("lib/nox/payroll/collect.ts").includes('before_withholding, show_detail, reason, source")'));

// ② 整数
let same = true; let firstDiff: number | null = null;
for (let t = 0; t <= 2_000_000; t += 7) { if (withholding1021Of(t) !== Math.floor(t * 0.1021)) { same = false; firstDiff = t; break; } }
check("431(2-1) withholding1021Of＝floor(t×1021÷10000)（整数）・0〜200 万円（7 円刻み）で旧 floor(t×0.1021) と同値＝golden 不変・負は 0", same && withholding1021Of(15000) === 1531 && withholding1021Of(-5) === 0 && withholding1021Of(10000) === 1021, { firstDiff });
const sp = staffPayOf({ contract_kind: "contractor", hourly: 1500, fixed_allowance: 0, withholding_rate: 10.21, tax_class: null } as never, [{ date: "2026-10-01", minutes: 600 } as never]);
check("431(2-2) スタッフ委託の 10.21%＝整数（gross 15,000→1,531）・pay.ts／SQL（0184）とも × 1021 ÷ 10000", sp.withholding === 1531 && src("lib/nox/pay.ts").includes("? withholding1021Of(Math.max(0, gross - 5000 * periodDays))") && !src("lib/nox/pay.ts").includes("* 0.1021)") && src("supabase/migrations/0184_withholding_integer.sql").includes("v_wh := ((greatest(0, p_gross - 5000)::bigint * 1021) / 10000)::int;") && src("supabase/migrations/0184_withholding_integer.sql").includes("\nbegin;\nselect 'nox-project-proof', count(*) from public.orgs;"), sp);

// ③ 送り代の二重
check("431(3-1) 固定控除の送り代＝送りが使える店では作れない（送り／送迎／タクシー）・なしの店は作れる・既存は警告・DeductionTab に配線", isOkuriDeductionName("送り代") && isOkuriDeductionName("タクシー代") && !isOkuriDeductionName("ヘアメイク") && okuriDeductionBlockedOf("flat", "送り代") && !okuriDeductionBlockedOf("none", "送り代") && (okuriDeductionWarnOf("actual", ["送り代", "衣装"]) ?? "").includes("送り代") && okuriDeductionWarnOf("none", ["送り代"]) === null && src("app/(manage)/master/cast-comp/comp-sections.tsx").includes("if (okuriDeductionBlockedOf(okuriMode, name)) { setMsg(OKURI_DEDUCTION_BLOCK_MSG); return; }") && OKURI_DEDUCTION_BLOCK_MSG.includes("二重"));

// ④ 文言
check("431(4-1) 文言＝pay.ts 冒頭「計算期間の暦日数」（旧「出勤日数」なし）・給与右パネル「日次精算で支払済みの額は源泉の基礎から除きます」（旧「既徴収分を差し引きます」なし）", src("lib/nox/pay.ts").includes("源泉の日数 = 計算期間の暦日数") && !src("lib/nox/pay.ts").includes("源泉の日数 = 出勤日数") && src("app/(manage)/payroll/payroll-board.tsx").includes("日次精算で支払済みの額は源泉の基礎から除きます") && !src("app/(manage)/payroll/payroll-board.tsx").includes("源泉は既徴収分を差し引きます"));
// ⑤ 現状維持
check("431(5-1) 日次精算の 5,000 円×日数は現状維持（pay.ts の dailySettlement を基礎から除くだけ・既徴収の相殺なし）＝T17 待ち", src("lib/nox/pay.ts").includes("const taxBase = Math.max(0, gross - adj.before - dailySettlement);") && src("lib/nox/pay.ts").includes("withholdingOf(taxBase, input.periodDays, input.taxMode, input.taxClass);") && src("lib/nox/pay.ts").includes("税理士 T17 待ち"));
// ⑥ 雇用のシフト無し出勤
const ns = noShiftSummaryOf([{ castId: "a", castName: "雇用の人", noShiftDates: ["2026-10-04"], taxMode: "雇用" }, { castId: "b", castName: "委託の人", noShiftDates: ["2026-10-18"], taxMode: "委託" }]);
check("431(6-1) 雇用のシフト無し出勤＝打刻の時間で時給（collect が雇用だけ noShiftHours を日次の時間に）・勤怠一覧も雇用は時間を出す・要対応の文は雇用／委託で分岐", src("lib/nox/payroll/collect.ts").includes('const empNoShift = employmentById.get(cid) === "雇用" ? p?.noShiftHours ?? new Map<string, number>() : new Map<string, number>();') && src("lib/nox/payroll/collect.ts").includes("hours: (p?.hoursByDate.get(bizDate) ?? 0) + (empNoShift.get(bizDate) ?? 0),") && src("lib/nox/payroll/kintai-sheet.ts").includes('if ((c as { employment?: string | null }).employment === "雇用") for (const r of rows) if (!r.shift && r.inHm && r.outHm && r.hours === 0 && !r.cancelled)') && !!ns && ns.text === "シフト無し出勤 2 日（委託 1 日＝時給なし・当日追加配置で時給が付きます／雇用 1 日＝打刻の時間で時給を付けています）" && ns.items.find((i) => i.castId === "a")?.paid === true, ns);

if (fails.length) { console.error(`verify:nox-431 FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-431 OK ${pass} checks（裁定431 源泉の直し）`);
