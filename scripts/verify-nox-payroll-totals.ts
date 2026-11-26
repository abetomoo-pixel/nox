/*
 * verify:nox-payroll-totals — ★#21（相談役 11/26 22:50 の返事・裁定513-4）: 給与の月次一覧・明細（確定済みの合計）・CSV の総支給と控除計が同じ数になる。
 *   (1) 純関数：出勤ボーナス（extras）のある 1 枚で、一覧の総支給（listGrossOf）＝明細の合計（runSummaryOf）＝CSV の総支給の列（extras は gross に内在＝足さない）。控除計も明細＝CSV。
 *   (2) 本番の DB（読むだけ）：確定済み・支払済みの run ごとに、一覧・明細・CSV の総支給の和と、明細・CSV の控除計の和が同じ。
 *   (3) 一覧の画面は自分で足さない（payroll-list.tsx は listGrossOf を使う・extras を足す式が無い）。
 *  使い方: npm run verify:nox-payroll-totals
 */
import fs from "node:fs";
import { Client } from "pg";
import { loadEnvOrExit } from "./fixtures-f0";
import { listGrossOf } from "../lib/nox/payroll/list";
import { runSummaryOf, frozenDeductionOf } from "../lib/nox/payroll/view";
import { payrollCsvCells, type PayrollCsvPay } from "../lib/nox/payroll/csv";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const env = loadEnvOrExit(["SUPABASE_DB_URL"]);

type Bj = { pay?: Partial<PayrollCsvPay>; extras?: { amount?: number }[] };
const Z: PayrollCsvPay = { timePay: 0, honBack: 0, jonaiBack: 0, dohanBack: 0, drinkBack: 0, champBack: 0, bottleBack: 0, salesBack: 0, customTotal: 0, withholding: 0, fixedDed: 0, fine: 0, arDeduct: 0, advanceDeduct: 0, okuriDeduct: 0, normPenalty: 0, gross: 0 };
const csvOf = (bj: Bj, net: number) => {
  const pay = { ...Z, ...(bj.pay ?? {}) } as PayrollCsvPay;
  const cells = payrollCsvCells({ castName: "x", taxMode: "委託", period: "2026-10", pay, extrasTotal: (bj.extras ?? []).reduce((a, e) => a + (e.amount ?? 0), 0), net, paidTotal: 0 });
  return { gross: cells[8] as number, ded: cells[6] as number };
};

// (1)
{
  const bj: Bj = { pay: { ...Z, timePay: 60000, customTotal: 5000, withholding: 9000, fixedDed: 3000, gross: 70000 /* extras 5,000 が内在 */ }, extras: [{ amount: 5000 }] };
  const net = 70000 - 12000;
  const sum = runSummaryOf([{ net, breakdown_json: { pay: bj.pay! } }]);
  const csv = csvOf(bj, net);
  check("(1-1) extras のある 1 枚で、一覧＝明細＝CSV の総支給（70,000・extras を二重に足さない）", listGrossOf(bj) === 70000 && sum.gross === 70000 && csv.gross === 70000, { list: listGrossOf(bj), detail: sum.gross, csv: csv.gross });
  check("(1-2) 控除計は明細＝CSV（12,000）", sum.ded === 12000 && csv.ded === 12000 && frozenDeductionOf({ ...Z, ...bj.pay } as PayrollCsvPay) === 12000, { detail: sum.ded, csv: csv.ded });
  check("(1-3) 欠落キー（{\"net\":0} だけの行）は 0", listGrossOf({}) === 0 && listGrossOf(null) === 0);
}

// (3)
{
  const src = fs.readFileSync("app/(manage)/payroll/payroll-list.tsx", "utf8");
  check("(3) 一覧の画面は listGrossOf を使う・extras を足す式が無い", src.includes("listGrossOf(") && !/extras \?\? \[\]\)\.reduce/.test(src));
}

// (2)
async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
  await db.connect();
  try {
    await db.query("begin read only");
    const rows = (await db.query<{ run_id: string; net: number; bj: Bj | null }>(
      "select ps.run_id, ps.net, ps.breakdown_json bj from payslips ps join payroll_runs pr on pr.id = ps.run_id where pr.status in ('finalized','paid')")).rows;
    await db.query("rollback");
    const byRun = new Map<string, { net: number; bj: Bj | null }[]>();
    for (const r of rows) { const a = byRun.get(r.run_id) ?? []; a.push(r); byRun.set(r.run_id, a); }
    const bad: unknown[] = []; let withExtras = 0;
    for (const [run, slips] of byRun) {
      const list = slips.reduce((a, s) => a + listGrossOf(s.bj), 0);
      const sum = runSummaryOf(slips.map((s) => ({ net: s.net, breakdown_json: { pay: s.bj?.pay ?? {} } })));
      const csv = slips.reduce((a, s) => { const c = csvOf(s.bj ?? {}, s.net); return { gross: a.gross + c.gross, ded: a.ded + c.ded }; }, { gross: 0, ded: 0 });
      if (slips.some((s) => (s.bj?.extras ?? []).some((e) => (e.amount ?? 0) !== 0))) withExtras++;
      if (!(list === sum.gross && sum.gross === csv.gross && sum.ded === csv.ded)) bad.push({ run, list, detail: sum.gross, csv: csv.gross, dedDetail: sum.ded, dedCsv: csv.ded });
    }
    check(`(2) 確定済み・支払済みの run ${byRun.size} 本（extras のある run ${withExtras}）で、一覧＝明細＝CSV の総支給・明細＝CSV の控除計`, byRun.size > 0 && bad.length === 0, bad.slice(0, 3));
  } finally { await db.end(); }
  if (fails.length) { console.error(fails.map((f) => `  FAIL: ${f}`).join("\n")); console.error(`verify:nox-payroll-totals FAIL ${fails.length} / pass ${pass}`); process.exit(1); }
  console.log(`verify:nox-payroll-totals ALL PASS (${pass} assertions)`);
}
void main();
