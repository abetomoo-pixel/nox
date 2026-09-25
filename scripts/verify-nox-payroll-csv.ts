/*
 * verify:nox-payroll-csv — D3 給与明細CSV 純関数テスト（DB 非依存）。
 *   npm run verify:nox-payroll-csv
 * 列順/BOM/合算/状態写像/空run を固定し、★不変条件「控除計 = 総支給 − 差引」を係留する
 * （★裁定303 追補1・2026-09-25: 総支給 = pay.gross のみ。extras は payOf の gross に内在（裁定26）＝旧「pay.gross + Σextras」は二重加算だった。
 *   golden（玲奈）で extras 1,000 → gross が 1,000 増える（1,387,150→1,388,150）ことを payOf で実証し、CSV の総支給＝gross を係留）。
 */
import {
  buildPayrollCsv, payrollCsvCells, payrollRowStatus, PAYROLL_CSV_HEADER,
  type PayrollCsvRow, type PayrollCsvPay,
} from "../lib/nox/payroll/csv";
import { payOf } from "../lib/nox/pay"; // ★裁定303 追補1: golden で extras→gross 内在を実証
import { REINA_INPUT } from "./fixtures-pay";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

// gross = timePay + 全バック + customTotal + Σextras（payOf 定義＝裁定26: extras は gross 内在・源泉対象）。net(payslips) = pay.net = gross − Σ7控除。
const EXTRAS = 5000;
const samplePay: PayrollCsvPay = {
  timePay: 60000,
  honBack: 10000, jonaiBack: 5000, dohanBack: 3000,
  drinkBack: 2000, champBack: 7000, bottleBack: 0, salesBack: 8000,
  customTotal: 5000,
  withholding: 9000, fixedDed: 3000, fine: 1000,
  arDeduct: 4000, advanceDeduct: 2000, okuriDeduct: 1500, normPenalty: 500,
  gross: 105000, // = 60000+10000+5000+3000+2000+7000+0+8000+5000 + extras 5000（★内在）
};
const SUM7 = 9000 + 3000 + 1000 + 4000 + 2000 + 1500 + 500; // 21000
const NET = samplePay.gross - SUM7; // 84000（extras 込みの gross から控除）
const samplePay0: PayrollCsvPay = { ...samplePay, gross: 100000 }; // extras=0 の cast
const PAY_NET0 = samplePay0.gross - SUM7; // 79000

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
check("★総支給 = pay.gross のみ（extras は gross 内在＝裁定26／303 追補1・足さない）", cells[8] === samplePay.gross, String(cells[8])); // 105000
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
  const c0 = payrollCsvCells({ ...baseRow, pay: samplePay0, extrasTotal: 0, net: PAY_NET0 });
  check("extras=0 なら 総支給 = pay.gross", c0[8] === samplePay0.gross, String(c0[8]));
  check("extras=0 でも 控除計 = 総支給 − 差引",
    (c0[6] as number) === (c0[8] as number) - (c0[9] as number), `${c0[6]}`);
}

// ── ★裁定303 追補1: golden（玲奈）で extras→gross 内在を payOf で実証し、CSV の総支給＝gross（二重加算なし）を係留 ──
{
  const reina = payOf(REINA_INPUT), plus = payOf({ ...REINA_INPUT, extrasTotal: 1000 });
  check("★golden: extras 1,000 → payOf の gross が 1,000 増える（1,387,150→1,388,150）・源泉は +102・net は +898", reina.gross === 1387150 && plus.gross === 1388150 && plus.withholding - reina.withholding === 102 && plus.net - reina.net === 898, `${reina.gross}→${plus.gross}`);
  const rowR = payrollCsvCells({ castName: "玲奈", taxMode: "委託", period: "2026-09", pay: reina, extrasTotal: 0, net: reina.net, paidTotal: 0 });
  const rowP = payrollCsvCells({ castName: "玲奈", taxMode: "委託", period: "2026-09", pay: plus, extrasTotal: 1000, net: plus.net, paidTotal: 0 });
  check("★golden: CSV 総支給＝gross（1,387,150／1,388,150＝+1,000 のみ・+2,000 にならない）・控除計＝総支給−差引が両方で恒等", rowR[8] === 1387150 && rowP[8] === 1388150 && (rowR[6] as number) === (rowR[8] as number) - (rowR[9] as number) && (rowP[6] as number) === (rowP[8] as number) - (rowP[9] as number), `${rowR[8]}/${rowP[8]}`);
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
