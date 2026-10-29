/*
 * verify:nox-432 — 裁定432（2026-10-26 確定・Agoora）源泉区分と控除の入れ方。DB 不触（純関数＋逐語 grep＋0183 ★4 の形）。
 *  ① 区分＝hostess（委託キャスト・10.21%・5,000 円×暦日数）／other_fee（委託スタッフ・10.21% 定率・控除なし＝T11 待ちの仮置き）／manual（社員）／none・既定は taxMode／契約区分から
 *  ② 委託は自動額＋その期だけの指定額（effectiveWithholdingOf・audit は RPC）
 *  ③ 社員は NOX が税額を計算しない＝控除 4 欄（社会保険料／源泉所得税／住民税／その他＝名前付き複数行）を入れた分だけ支給後に引く・前月と同じ・確定時に未入力の人数を 1 回だけ知らせる・明細／CSV は入れた項目だけ・税額表の自動計算は撤去
 *  ④ 注記「区分と額は顧問税理士・社労士にご確認ください」
 *  区分を渡さない（フラグ false）＝従来と同値（golden 不変）。
 */
import fs from "node:fs";
import { payOf, withholdingOf } from "../lib/nox/pay";
import { withholding1021Of } from "../lib/nox/money";
import {
  WITHHOLDING_ADVICE_NOTE, autoWithholdingOf, copyPrevDeductionsOf, defaultWithholdingKindOf, effectiveWithholdingOf, employeeDeductionFormOf, employeeDeductionLinesOf, employeeDeductionRowsOfForm,
  employeeDeductionsTotalOf, missingEmployeeDeductionsOf, overrideLineOf, prevPeriodOf, withholdingKindOf,
} from "../lib/nox/payroll/withholding-kind";
import { breakdownLinesOf, whLabel432Of, type BreakdownPayLike } from "../lib/nox/payroll/breakdown-lines";
import { buildPayrollCsv } from "../lib/nox/payroll/csv";
import { totalDeductionsOf } from "../lib/nox/payroll/adjust";
import { staffPayOf } from "../lib/nox/staff/pay";
import { REINA_INPUT } from "./fixtures-pay";
import { mig0188On } from "../lib/nox/rules-0175/flag"; // ★0188

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;

// ① 区分
check("432(1-1) 既定＝cast 委託→hostess・雇用→manual／staff contractor→other_fee・employee／parttime→manual・保存値があればそれ（不正は既定）",
  defaultWithholdingKindOf({ subject: "cast", taxMode: "委託" }) === "hostess" && defaultWithholdingKindOf({ subject: "cast", taxMode: "雇用" }) === "manual" && defaultWithholdingKindOf({ subject: "staff", contractKind: "contractor" }) === (mig0188On() ? "none" : "other_fee") /* ★0188（裁定434 ②）: 委託スタッフの既定 none */
  && defaultWithholdingKindOf({ subject: "staff", contractKind: "parttime" }) === "manual" && withholdingKindOf("none", "hostess") === "none" && withholdingKindOf("table", "hostess") === "hostess" && withholdingKindOf(null, "manual") === "manual");
check("432(1-2) 自動額＝hostess は従来の委託と同じ（5,000×日数を引いて 1021÷10000）・other_fee は定率（控除なし）・manual／none は 0",
  autoWithholdingOf("hostess", 300000, 31) === withholdingOf(300000, 31, "委託") && autoWithholdingOf("other_fee", 100000, 31) === withholding1021Of(100000) && autoWithholdingOf("other_fee", 100000, 31) === 10210 && autoWithholdingOf("manual", 300000, 31) === 0 && autoWithholdingOf("none", 300000, 31) === 0);
// payOf：区分なし＝従来・hostess＝同値・other_fee・manual
const base = { ...REINA_INPUT, taxMode: "委託" as const };
const p0 = payOf(base);
const pH = payOf({ ...base, withholdingKind: "hostess" });
const pO = payOf({ ...base, withholdingKind: "other_fee" });
check("432(1-3) payOf＝区分なしは従来どおりキーなし（golden 不変）・hostess は同じ源泉と手取り（キーに区分と自動額）・other_fee は定率",
  p0.withholdingKind === undefined && p0.withholding === 125802 && pH.withholding === p0.withholding && pH.net === p0.net && pH.withholdingKind === "hostess" && pH.withholdingAuto === p0.withholding && pH.withholdingOverride === undefined
  && pO.withholding === withholding1021Of(p0.gross), { p0: p0.withholding, pH: pH.withholding, pO: pO.withholding, gross: p0.gross });
// ② 指定額
const pV = payOf({ ...base, withholdingKind: "hostess", withholdingOverride: 100000 });
check("432(2-1) 指定額＝その期だけ源泉を置き換え（手取りも従う）・自動額は残る・manual には効かない・負は無効",
  pV.withholding === 100000 && pV.withholdingAuto === p0.withholding && pV.withholdingOverride === 100000 && pV.net === p0.net + (p0.withholding - 100000)
  && effectiveWithholdingOf("manual", 0, 5000) === 0 && effectiveWithholdingOf("hostess", 1234, -1) === 1234 && effectiveWithholdingOf("other_fee", 1234, 0) === 0
  && overrideLineOf(12345, 10000, true) === "自動 ¥12,345 → 指定 ¥10,000（税理士確認済み）" && overrideLineOf(1, null, false) === null, { w: pV.withholding, net: pV.net, n0: p0.net });
// ③ 社員
const emp = { ...REINA_INPUT, taxMode: "雇用" as const };
const e0 = payOf(emp);
const ded = [{ kind: "social_insurance" as const, amount: 15000 }, { kind: "resident_tax" as const, amount: 8000 }, { kind: "income_tax" as const, amount: 0 }, { kind: "other" as const, name: "寮費", amount: 20000 }];
const eM = payOf({ ...emp, withholdingKind: "manual", employeeDeductions: ded });
check("432(3-1) 社員（manual）＝源泉は 0（税額表の自動計算は撤去）・控除は入れた分だけ支給後に引く（0 の欄は出さない）・既定は空＝0",
  e0.withholding === 0 && eM.withholding === 0 && eM.employeeDeductionTotal === 43000 && eM.net === e0.net - 43000 && J(eM.employeeDeductions?.map((l) => l.label)) === J(["社会保険料", "住民税", "寮費"])
  && payOf({ ...emp, withholdingKind: "manual" }).net === e0.net && payOf({ ...emp, withholdingKind: "manual" }).employeeDeductions === undefined && !src("lib/nox/pay.ts").includes("employeeWithholdingOf") && !src("lib/nox/pay.ts").includes("EMPLOYEE_TAX_TABLE_READY"), { net: eM.net, n0: e0.net, t: eM.employeeDeductionTotal });
const form = employeeDeductionFormOf([{ kind: "income_tax", amount: 3000 }, { kind: "other", name: "制服", amount: 1000 }]);
const back = employeeDeductionRowsOfForm([...form.map((f) => ({ ...f })), { kind: "other", name: "", amount: "" }]);
check("432(3-2) 入力欄＝3 欄（空欄）＋その他（名前付き）・空欄は保存しない・不正は止める・前月と同じ＝前期の行（0 は除く）・前月＝前の暦月",
  J(form.map((f) => [f.kind, f.amount])) === J([["social_insurance", ""], ["income_tax", "3000"], ["resident_tax", ""], ["other", "1000"]]) && back.error === null && J(back.rows) === J([{ kind: "income_tax", name: null, amount: 3000 }, { kind: "other", name: "制服", amount: 1000 }])
  && employeeDeductionRowsOfForm([{ kind: "social_insurance", name: "", amount: "1.5" }]).error !== null && employeeDeductionRowsOfForm([{ kind: "social_insurance", name: "", amount: "12,000円" }]).rows[0]?.amount === 12000
  && J(copyPrevDeductionsOf([{ kind: "resident_tax", amount: 8000 }, { kind: "income_tax", amount: 0 }, { kind: "other", name: "寮費", amount: 2 }])) === J([{ kind: "resident_tax", name: null, amount: 8000 }, { kind: "other", name: "寮費", amount: 2 }])
  && prevPeriodOf("2026-01") === "2025-12" && prevPeriodOf("2026-10") === "2026-09" && employeeDeductionsTotalOf(ded) === 43000 && employeeDeductionLinesOf(null).length === 0, { form, back });
const mm = missingEmployeeDeductionsOf([{ kind: "manual", rows: [] }, { kind: "manual", rows: [{ kind: "income_tax", amount: 1 }] }, { kind: "hostess", rows: [] }, { kind: "manual", rows: [{ kind: "other", amount: 0 }] }]);
check("432(3-3) 確定の前＝社員で控除が未入力の人数を 1 回だけ（止めない）「社員 n 名の控除が未入力です」・社員がいなければ出ない", mm.count === 2 && mm.message === "社員 2 名の控除が未入力です" && missingEmployeeDeductionsOf([{ kind: "hostess", rows: [] }]).message === null);
// 明細・CSV
const bd = breakdownLinesOf({ pay: eM as unknown as BreakdownPayLike, extras: [] });
const bdV = breakdownLinesOf({ pay: pV as unknown as BreakdownPayLike, extras: [] });
check("432(3-4) 明細＝社員の控除は入れた項目だけ行に（PDF・/mine も同じ関数）・源泉のラベル＝ホステス報酬／報酬・料金／指定額・区分なしは従来",
  J(bd.ded.filter((l) => l.key.startsWith("empDed-")).map((l) => [l.label, l.amount])) === J([["社会保険料", 15000], ["住民税", 8000], ["寮費", 20000]]) && bd.net === eM.net
  && whLabel432Of({ withholdingKind: "hostess" }) === "源泉（ホステス報酬）" && whLabel432Of({ withholdingKind: "other_fee", withholdingOverride: 1 }) === "源泉（報酬・料金・指定額）" && whLabel432Of({ taxMode: "委託" }) === "源泉（報酬・料金）"
  && bdV.ded.find((l) => l.key === "withholding")?.label === "源泉（ホステス報酬・指定額）" && totalDeductionsOf(eM) === totalDeductionsOf(e0) + 43000, { bdNet: bd.net, net: eM.net });
const csvRow = (pay: object, name: string) => ({ castName: name, taxMode: "雇用", period: "2026-10", pay: pay as never, extrasTotal: 0, net: 0, paidTotal: 0 });
const csv1 = buildPayrollCsv([csvRow(e0, "A")]), csv2 = buildPayrollCsv([csvRow(e0, "A"), csvRow(eM, "B")]);
check("432(3-5) 給与 CSV＝社員の控除が 1 人も無ければ列を足さない（従来と同値）・あれば「社員の控除」列に入れた項目だけ", !csv1.includes("社員の控除") && csv2.split("\r\n")[0].endsWith(",社員の控除") && csv2.includes("社会保険料 ¥15000／住民税 ¥8000／寮費 ¥20000"));
// スタッフ
const sc = { membership_id: "m", contract_kind: "contractor" as const, hourly: 1500, fixed_allowance: 0, tax_class: null, withholding_rate: 0 };
const se = { ...sc, contract_kind: "employee" as const };
const days = [{ bizDate: "2026-10-01", minutes: 600, open: false }];
const s0 = staffPayOf(sc, days), sO = staffPayOf(sc, days, { kind: "other_fee" }), sV = staffPayOf(sc, days, { kind: "other_fee", override: 1000 }), sM = staffPayOf(se, days, { kind: "manual", deductions: [{ kind: "social_insurance", amount: 2000 }] });
check("432(3-6) スタッフ＝委託 other_fee は従来の 10.21% と同値・指定額・社員（manual）は源泉 0＋控除を引く・区分なしは従来", sO.withholding === s0.withholding && sO.withholding === 1531 && sV.withholding === 1000 && sV.net === 15000 - 1000 && sM.withholding === 0 && sM.net === 15000 - 2000 && sM.employeeDeductionTotal === 2000 && s0.withholdingKind === undefined, { s0, sV, sM });
// 配線（フラグ配下）
const col = src("lib/nox/payroll/collect.ts"), asm = src("lib/nox/payroll/assemble.ts"), pb = src("app/(manage)/payroll/payroll-board.tsx"), tax = src("app/(manage)/master/sensitive-tax-panel.tsx"), swp = src("app/(manage)/staff/staff-work-panel.tsx"), panel = src("components/nox/withholding-432-panel.tsx");
check("432(4-1) 配線＝collect はフラグ true のときだけ区分・指定額・控除を読む・assemble が payOf へ・給与の右パネル（額を指定／控除 4 欄／前月と同じ）・確定前の確認・キャスト詳細の区分・スタッフの勤怠・報酬・注記",
  col.includes("if (mig0183On()) {") && col.includes('admin.from("payroll_withholding_overrides").select("subject_id, amount").eq("store_id", storeId).eq("period", win.period).eq("subject_kind", "cast")') && asm.includes("...(raw.w432 ? { withholdingKind: withholdingKindOf(raw.w432.stored, defaultWithholdingKindOf({ subject: \"cast\", taxMode })), withholdingOverride: raw.w432.override, employeeDeductions: raw.w432.deductions } : {})")
  && pb.includes("<Withholding432Panel key={`${r.castId}-${period}`}") && pb.includes("missingEmployeeDeductionsOf(") && tax.includes('rpc("set_withholding_kind", { p_subject_kind: "cast"') && swp.includes('subjectKind="staff"') && panel.includes('rpc("payroll_withholding_override_set"') && panel.includes('rpc("payroll_employee_deductions_set"') && panel.includes("前月と同じ")
  && panel.includes("{WITHHOLDING_ADVICE_NOTE}") && WITHHOLDING_ADVICE_NOTE === "区分と額は顧問税理士・社労士にご確認ください");
// 0183 ★4
const m183 = fs.existsSync("supabase/migrations/0183_shift_staff_reservation_guest_norm_intent.sql") ? src("supabase/migrations/0183_shift_staff_reservation_guest_norm_intent.sql") : "";
check("432(5-1) 0183 ★4（起草のみ・起草ファイルがあるときだけ）＝区分の列 2 本・表 2 本（RLS select＋revoke all＋select だけ）・RPC 3 本（authenticated）＋内部 2 本（4 ロール revoke）・確定済みの期は period finalized・audit", m183 === "" || (
  m183.includes("alter table public.cast_tax_profiles add column if not exists withholding_kind text;") && m183.includes("alter table public.staff_contracts add column if not exists withholding_kind text;")
  && m183.includes("revoke all on table public.payroll_withholding_overrides from public, anon, authenticated;") && m183.includes("grant select on table public.payroll_employee_deductions to authenticated;")
  && ["set_withholding_kind(text, uuid, text)", "payroll_withholding_override_set(text, text, uuid, integer, integer, text, boolean)", "payroll_employee_deductions_set(text, text, uuid, jsonb)"].every((f) => m183.includes(`grant execute on function public.${f} to authenticated;`))
  && m183.includes("revoke execute on function public.payroll_period_locked_of(uuid, text, text) from public, anon, authenticated, service_role;") && m183.includes("if public.payroll_period_locked_of(v_store, p_period, p_subject_kind) then raise exception 'period finalized'; end if;")
  && m183.includes("perform public.audit_log_write('payroll_withholding_override_set',")));

if (fails.length) { console.error(`verify:nox-432 FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-432 OK ${pass} checks（裁定432 源泉区分と控除の入れ方）`);
