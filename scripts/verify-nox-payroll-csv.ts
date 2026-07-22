/*
 * verify:nox-payroll-csv — D3 給与明細CSV 純関数テスト（DB 非依存）。
 *   npm run verify:nox-payroll-csv
 * 列順/BOM/合算/状態写像/空run を固定し、★不変条件「控除計 = 総支給 − 差引」を係留する
 * （総支給 = pay.gross + Σextras の唯一整合解。pay.gross 単独だと extras>0 で崩れる＝回帰検知）。
 */
import {
  buildPayrollCsv, payrollCsvCells, payrollRowStatus, PAYROLL_CSV_HEADER,
  type PayrollCsvRow, type PayrollCsvPay,
} from "../lib/nox/payroll/csv";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

// gross = timePay + 全バック + customTotal（payOf 定義）。net(payslips) = pay.net + extras、pay.net = gross − Σ7控除。
const samplePay: PayrollCsvPay = {
  timePay: 60000,
  honBack: 10000, jonaiBack: 5000, dohanBack: 3000,
  drinkBack: 2000, champBack: 7000, bottleBack: 0, salesBack: 8000,
  customTotal: 5000,
  withholding: 9000, fixedDed: 3000, fine: 1000,
  arDeduct: 4000, advanceDeduct: 2000, okuriDeduct: 1500, normPenalty: 500,
  gross: 100000, // = 60000+10000+5000+3000+2000+7000+0+8000+5000
};
const SUM7 = 9000 + 3000 + 1000 + 4000 + 2000 + 1500 + 500; // 21000
const EXTRAS = 5000;
const PAY_NET = samplePay.gross - SUM7; // 79000
const NET = PAY_NET + EXTRAS; // 84000

const baseRow: PayrollCsvRow = {
  castName: "テスト太郎", taxMode: "委託", period: "2026-07",
  pay: samplePay, extrasTotal: EXTRAS, net: NET, paidTotal: 0,
};

// ── 列順・ヘッダ（11列固定）──
check("列数 = 11", PAYROLL_CSV_HEADER.length === 11, String(PAYROLL_CSV_HEADER.length));
check("ヘッダ列順 逐語",
  PAYROLL_CSV_HEADER.join("|") === "キャスト名|税区分|期間|時給計|バック計|加算計|控除計|うち源泉|総支給|差引|状態",
  PAYROLL_CSV_HEADER.join("|"));

// ── セル合算 ──
const cells = payrollCsvCells(baseRow);
check("セル数 = 11", cells.length === 11, String(cells.length));
check("時給計 = pay.timePay", cells[3] === 60000, String(cells[3]));
check("バック計 = 指名+商品+売上（customTotal 除く）",
  cells[4] === 10000 + 5000 + 3000 + 2000 + 7000 + 0 + 8000, String(cells[4])); // 35000
check("加算計 = customTotal + Σextras", cells[5] === 5000 + EXTRAS, String(cells[5])); // 10000
check("控除計 = fixedDed+fine+withholding+ar+adv+okuri+normPenalty", cells[6] === SUM7, String(cells[6])); // 21000
check("うち源泉 = withholding", cells[7] === 9000, String(cells[7]));
check("★総支給 = pay.gross + Σextras", cells[8] === samplePay.gross + EXTRAS, String(cells[8])); // 105000
check("差引 = payslips.net", cells[9] === NET, String(cells[9])); // 84000

// ── ★不変条件: 控除計 = 総支給 − 差引（extras>0 で係留）──
check("★控除計 = 総支給 − 差引（extras>0 で恒等）",
  (cells[6] as number) === (cells[8] as number) - (cells[9] as number),
  `${cells[6]} vs ${(cells[8] as number) - (cells[9] as number)}`);
// 構成列の和 = 総支給
check("時給計+バック計+加算計 = 総支給",
  (cells[3] as number) + (cells[4] as number) + (cells[5] as number) === (cells[8] as number),
  `${(cells[3] as number) + (cells[4] as number) + (cells[5] as number)} vs ${cells[8]}`);

// ── extras=0 では 総支給 = pay.gross（後方一致）──
{
  const c0 = payrollCsvCells({ ...baseRow, extrasTotal: 0, net: PAY_NET });
  check("extras=0 なら 総支給 = pay.gross", c0[8] === samplePay.gross, String(c0[8]));
  check("extras=0 でも 控除計 = 総支給 − 差引",
    (c0[6] as number) === (c0[8] as number) - (c0[9] as number), `${c0[6]}`);
}

// ── 状態写像 ──
check("状態: Σpay=0 → 未払", payrollRowStatus(0, 84000) === "未払");
check("状態: 0<Σpay<net → 一部", payrollRowStatus(40000, 84000) === "一部");
check("状態: Σpay=net → 支払済", payrollRowStatus(84000, 84000) === "支払済");
check("状態: Σpay>net → 支払済", payrollRowStatus(90000, 84000) === "支払済");
check("状態: net=0 かつ Σpay=0 → 支払済（引く額なし）", payrollRowStatus(0, 0) === "支払済");
check("状態セル(cells[10]) が写像と一致", cells[10] === payrollRowStatus(0, NET));

// ── BOM / CRLF / 空run ──
const csvEmpty = buildPayrollCsv([]);
check("BOM 先頭（\\uFEFF）", csvEmpty.charCodeAt(0) === 0xfeff, String(csvEmpty.charCodeAt(0)));
check("空run = ヘッダ1行のみ（BOM 除いて1行・末尾改行なし）",
  csvEmpty.slice(1) === PAYROLL_CSV_HEADER.join(","), JSON.stringify(csvEmpty.slice(1)));

const csv = buildPayrollCsv([baseRow, { ...baseRow, castName: "二人目", paidTotal: NET }]);
check("CRLF 区切り", csv.split("\r\n").length === 3, String(csv.split("\r\n").length)); // header + 2 rows
check("2行目 状態 = 支払済（paidTotal=net）", csv.split("\r\n")[2].endsWith(",支払済"), csv.split("\r\n")[2]);

// ── CSV エスケープ（カンマ/引用符）──
{
  const csvE = buildPayrollCsv([{ ...baseRow, castName: 'a,b"c' }]);
  const line = csvE.split("\r\n")[1];
  check("カンマ/引用符を含む名は quote＋二重化", line.startsWith('"a,b""c",'), line.slice(0, 20));
}

if (fails.length) {
  console.error(`verify:nox-payroll-csv FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-payroll-csv ALL PASS (${pass} assertions)`);
