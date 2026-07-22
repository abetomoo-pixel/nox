// D3 給与明細CSV（run/period・全cast・支給/控除/差引）の純関数。DB を知らない（UI が payslips から組み立てて渡す）。
// 写経元: makanai-shift wage-view exportCsv（buildCsv/csvEsc）。BOM UTF-8・列順固定・CRLF。
// ★機微生値（口座/マイナンバー/back 内訳の個別額）は列に出さない＝合算のみ（0059 と同方針）。口座は持たない
//   （振込フォーマットCSVは将来別項）。対象は finalized/paid run のみ（draft は UI 側で非活性）。
//
// 総支給 = pay.gross + Σextras.amount（extras=出勤インセンティブ・core.ts が net へ加算）。
//   これにより「控除計 = 総支給 − 差引」が恒等成立し、「時給計＋バック計＋加算計 = 総支給」も一致する
//   （Agoora 裁定 2026-07-22。pay.gross 単独だと extras>0 の cast で両者が崩れる）。

// 凍結 payslips.breakdown_json.pay（PayResult のうち CSV が使う部分集合）
export type PayrollCsvPay = {
  timePay: number;
  honBack: number; jonaiBack: number; dohanBack: number;
  drinkBack: number; champBack: number; bottleBack: number;
  salesBack: number;
  customTotal: number;
  withholding: number;
  fixedDed: number; fine: number;
  arDeduct: number; advanceDeduct: number; okuriDeduct: number;
  normPenalty: number;
  gross: number;
};

export type PayrollCsvRow = {
  castName: string;   // casts.name（cast_id join）
  taxMode: string;    // cast_tax_profiles.mode 現在値（'委託'|'雇用'）・欠落は '—'
  period: string;     // payslips.period（'YYYY-MM'）
  pay: PayrollCsvPay; // payslips.breakdown_json.pay
  extrasTotal: number; // Σ breakdown_json.extras[].amount（出勤インセンティブ）
  net: number;         // payslips.net（凍結・extras 込み）
  paidTotal: number;   // Σ payment_records.paid_amount（cast_id 単位）
};

// 列順固定（11列・spec 確定）
export const PAYROLL_CSV_HEADER = [
  "キャスト名", "税区分", "期間",
  "時給計", "バック計", "加算計", "控除計", "うち源泉",
  "総支給", "差引", "状態",
] as const;

// 状態写像: Σpay≥net→支払済（net=0 も支払済）/ 0<Σ<net→一部 / Σ=0→未払
export function payrollRowStatus(paidTotal: number, net: number): string {
  if (paidTotal >= net) return "支払済";
  if (paidTotal > 0) return "一部";
  return "未払";
}

// 1行の 11 セル（数値は生の integer・CSV 文字列化は buildPayrollCsv 側）
export function payrollCsvCells(r: PayrollCsvRow): (string | number)[] {
  const p = r.pay;
  const backTotal = p.honBack + p.jonaiBack + p.dohanBack + p.drinkBack + p.champBack + p.bottleBack + p.salesBack;
  const addTotal = p.customTotal + r.extrasTotal;
  const dedTotal = p.fixedDed + p.fine + p.withholding + p.arDeduct + p.advanceDeduct + p.okuriDeduct + p.normPenalty;
  const grossTotal = p.gross + r.extrasTotal;
  return [
    r.castName, r.taxMode, r.period,
    p.timePay, backTotal, addTotal, dedTotal, p.withholding, grossTotal, r.net,
    payrollRowStatus(r.paidTotal, r.net),
  ];
}

const csvEsc = (v: string | number): string => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// BOM UTF-8 ＋ CRLF ＋ ヘッダ固定。空 run はヘッダ1行のみ（末尾改行なし＝BANZEN 写経）。
export function buildPayrollCsv(rows: PayrollCsvRow[]): string {
  const lines: (string | number)[][] = [PAYROLL_CSV_HEADER.slice(), ...rows.map(payrollCsvCells)];
  return "﻿" + lines.map((r) => r.map(csvEsc).join(",")).join("\r\n");
}
