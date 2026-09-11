/*
 * verify:nox-payroll-list — B5 給与 月次一覧の純関数テスト（DB 非依存・走数外＝裁定229・設計書 B5 v1 §6 前半）。
 *   npm run verify:nox-payroll-list
 * 観点 4:
 *  1 行整形: run 単位 1 行・status 3 値保存・凍結値 sum の不変（入力を並べ替えても合計不変）・payment 件数／合計・最新 action と reason
 *  2 CSV 活性条件: finalized／paid のみ true
 *  3 支払済み化 活性: owner ∧ finalized のみ
 *  4 decideReopenAccess: staff は can_reopen によらず forbidden（裁定 B5-5）・owner ok・manager 自店 ok／他店 forbidden
 */
import { buildPayrollListRows, sumListKpi, payrollCsvEnabled, markPaidEnabled, type ListPayslip, type ListPayment, type ListRun } from "../lib/nox/payroll/list";
import { decideReopenAccess } from "../lib/nox/payroll/authz";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

const S1 = "store-1", S2 = "store-2";
const runs: ListRun[] = [
  { id: "run-a", store_id: S1, period: "2026-08", status: "finalized", finalized_at: "2026-09-01T00:00:00Z", paid_at: null, updated_at: "2026-09-01T00:00:00Z" },
  { id: "run-b", store_id: S1, period: "2026-09", status: "draft", finalized_at: null, paid_at: null },
  { id: "run-c", store_id: S2, period: "2026-08", status: "paid", finalized_at: "2026-09-02T00:00:00Z", paid_at: "2026-09-05T00:00:00Z" },
];
const payslips: ListPayslip[] = [
  { run_id: "run-a", cast_id: "c1", gross: 300_000, net: 269_700 },
  { run_id: "run-a", cast_id: "c2", gross: 120_000, net: 107_880 },
  { run_id: "run-c", cast_id: "c3", gross: 50_000, net: 44_950 },
];
const payments: ListPayment[] = [
  { run_id: "run-c", cast_id: "c3", paid_amount: 20_000 },
  { run_id: "run-c", cast_id: "c3", paid_amount: 24_950 },
];
const audits = [
  { target: "payroll_runs:run-a", action: "payroll_finalize", at: "2026-09-01T00:00:00Z", reason: null },
  { target: "payroll_runs:run-a", action: "payroll_reopen", at: "2026-09-03T00:00:00Z", reason: "打刻訂正" },
  { target: "payroll_runs:run-a", action: "payroll_finalize", at: "2026-09-04T00:00:00Z", reason: null },
  { target: "payroll_runs:run-c", action: "payroll_mark_paid", at: "2026-09-05T00:00:00Z", reason: null },
  { target: "payroll_runs:run-c", action: "check_void", at: "2026-09-06T00:00:00Z", reason: "対象外 action" },
  { target: "checks:run-c", action: "payroll_reopen", at: "2026-09-07T00:00:00Z", reason: "対象外 target" },
];

// ══ 1 行整形 ══
const rows = buildPayrollListRows(runs, payslips, payments, audits);
check("pl(1a) run 単位 1 行（3 run → 3 行・cast 数は payslips 行数＝run-b 0／run-a 2／run-c 1）", rows.length === 3 && rows.map((r) => r.castCount).join(",") === "0,2,1", JSON.stringify(rows.map((r) => [r.runId, r.castCount])));
check("pl(1b) 並び＝period 降順→store_id 昇順（決定的）", rows.map((r) => r.runId).join(",") === "run-b,run-a,run-c", rows.map((r) => r.runId).join(","));
check("pl(1c) status 3 値がそのまま保存される", rows.map((r) => r.status).join(",") === "draft,finalized,paid", rows.map((r) => r.status).join(","));
const a = rows.find((r) => r.runId === "run-a")!;
const c = rows.find((r) => r.runId === "run-c")!;
check("pl(1d) 凍結値 sum（gross／net）＝足すだけ", a.gross === 420_000 && a.net === 377_580 && c.gross === 50_000 && c.net === 44_950, JSON.stringify({ a: [a.gross, a.net], c: [c.gross, c.net] }));
const shuffled = buildPayrollListRows([...runs].reverse(), [...payslips].reverse(), [...payments].reverse(), [...audits].reverse());
check("pl(1e) ★入力を並べ替えても行順・合計が不変", JSON.stringify(shuffled) === JSON.stringify(rows));
check("pl(1f) payment 件数／合計（run-c: 2 件 44,950・run-a: 0）", c.paidCount === 2 && c.paidTotal === 44_950 && a.paidCount === 0 && a.paidTotal === 0, JSON.stringify([c.paidCount, c.paidTotal, a.paidCount]));
check("pl(1g) 最新 action＝at 最大（run-a は 9/4 の finalize・reason null）", a.lastAction?.action === "payroll_finalize" && a.lastAction.at === "2026-09-04T00:00:00Z" && a.lastAction.reason === null, JSON.stringify(a.lastAction));
check("pl(1h) 対象外 action／target は無視（run-c は mark_paid・run-b は null）", c.lastAction?.action === "payroll_mark_paid" && rows.find((r) => r.runId === "run-b")!.lastAction === null, JSON.stringify(c.lastAction));
check("pl(1i) payslips 無しの run は 0 で出る（行を落とさない）", rows.find((r) => r.runId === "run-b")!.gross === 0 && rows.find((r) => r.runId === "run-b")!.castCount === 0);
const kpi = sumListKpi(rows);
check("pl(1j) KPI＝行の合計（runs 3・cast 3・gross 470,000・net 422,530・paid 2 件 44,950・★#82 paidRuns 1＝status=paid の run 数・payment_records の有無を見ない＝run-c は記録なしでも 1／run-a は 0）",
  kpi.runs === 3 && kpi.castCount === 3 && kpi.gross === 470_000 && kpi.net === 422_530 && kpi.paidCount === 2 && kpi.paidTotal === 44_950 && kpi.paidRuns === 1
    && sumListKpi(rows.filter((r) => r.runId === "run-a")).paidRuns === 0 && sumListKpi(buildPayrollListRows(runs.filter((r) => r.id === "run-c"), [], [])).paidRuns === 1, JSON.stringify(kpi));
check("pl(1k) 空入力＝空行・KPI 0", buildPayrollListRows([], [], []).length === 0 && sumListKpi([]).gross === 0 && sumListKpi([]).paidRuns === 0);

// ══ 2 CSV 活性 ══
check("pl(2a) CSV 活性＝finalized／paid のみ", payrollCsvEnabled("finalized") && payrollCsvEnabled("paid") && !payrollCsvEnabled("draft") && !payrollCsvEnabled(""));
check("pl(2b) 行の csvEnabled が status と一致", rows.every((r) => r.csvEnabled === payrollCsvEnabled(r.status)));

// ══ 3 支払済み化 活性 ══
check("pl(3a) owner ∧ finalized のみ true", markPaidEnabled("owner", "finalized") && !markPaidEnabled("owner", "draft") && !markPaidEnabled("owner", "paid"));
check("pl(3b) manager／staff／null は finalized でも false", !markPaidEnabled("manager", "finalized") && !markPaidEnabled("staff", "finalized") && !markPaidEnabled(null, "finalized"));

// ══ 4 decideReopenAccess（裁定 B5-5）══
check("pl(4a) ★staff は can_reopen=true・自店でも forbidden（B5-5）", decideReopenAccess("staff", true, S1, S1) === "forbidden" && decideReopenAccess("staff", false, S1, S1) === "forbidden");
check("pl(4b) owner は ok（authStoreId 不問）", decideReopenAccess("owner", false, null, S1) === "ok");
check("pl(4c) manager 自店 ok／他店 forbidden／authStoreId null forbidden", decideReopenAccess("manager", false, S1, S1) === "ok" && decideReopenAccess("manager", false, S2, S1) === "forbidden" && decideReopenAccess("manager", false, null, S1) === "forbidden");
check("pl(4d) reqStoreId 空・role null・cast は forbidden", decideReopenAccess("owner", true, S1, "") === "forbidden" && decideReopenAccess(null, true, S1, S1) === "forbidden" && decideReopenAccess("cast", true, S1, S1) === "forbidden");

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-payroll-list ALL PASS (${pass} assertions)`);
console.log("B5 月次一覧(純関数): run 単位 1 行・凍結値 sum 不変・payment 件数合計・最新 action / CSV 活性 / 支払済み化 活性 / decideReopenAccess は owner・manager 自店のみ");
