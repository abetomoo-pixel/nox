// D3 給与明細CSV（run/period・全cast・支給/控除/差引）の純関数。DB を知らない（UI が payslips から組み立てて渡す）。
// 写経元: makanai-shift wage-view exportCsv（buildCsv/csvEsc）。BOM UTF-8・列順固定・CRLF。
// ★機微生値（口座/マイナンバー/back 内訳の個別額）は列に出さない＝合算のみ（0059 と同方針）。口座は持たない
//   （振込フォーマットCSVは将来別項）。対象は finalized/paid run のみ（draft は UI 側で非活性）。
//
// 総支給 = pay.gross のみ（★裁定303 追補1・2026-09-25: extras は gross に内在＝裁定26・二重加算の是正。旧「pay.gross + Σextras」は 2026-07-22 の
//   外側加算モデルの名残＝裁定26 で extras が payOf の gross に入ったあとは 1,000 円の extras が総支給に 2,000 円で出ていた）。
//   「控除計 = 総支給 − 差引」と「時給計＋バック計＋加算計 = 総支給」は gross 内在モデルでそのまま恒等成立する（verify:nox-payroll-csv が係留）。

import { totalDeductionsOf } from "./adjust"; // 裁定264-3: 控除計の式は 1 本に集約

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
  const addTotal = p.customTotal + r.extrasTotal; // ★0152（裁定298-10）: 紹介料は給与に載せない（旧 payslip の referralTotal は読まない・列数 11 は不変）
  const dedTotal = totalDeductionsOf(p); // 裁定264-3（旧: fixedDed+fine+withholding+arDeduct+advanceDeduct+okuriDeduct+normPenalty）
  const grossTotal = p.gross; // ★裁定303 追補1: extras は gross 内在（裁定26）＝足さない
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
// ★夜間便 N3（裁定287-5）: 保証時給が効いた cast の時給内訳（基本／保証）。1 人も無ければ列を足さない（11 列・従来と 1 バイト同値）
type GuaranteeLike = { spans: { from: string; to: string | null; base: number }[]; baseHours: number; basePay: number; guaHours: number; guaPay: number };
const md = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
export function guaranteeCellOf(g: GuaranteeLike | undefined): string {
  if (!g) return "";
  const span = g.spans.map((s) => `${md(s.from)}〜${s.to ? md(s.to) : ""}・¥${s.base}`).join("／");
  return `基本 ${g.baseHours}h ¥${g.basePay}／保証 ${span} ${g.guaHours}h ¥${g.guaPay}`;
}
export function buildPayrollCsv(rows: PayrollCsvRow[]): string {
  const withG = rows.some((r) => !!(r.pay as { guarantee?: GuaranteeLike }).guarantee);
  const lines: (string | number)[][] = withG
    ? [[...PAYROLL_CSV_HEADER, "時給内訳"], ...rows.map((r) => [...payrollCsvCells(r), guaranteeCellOf((r.pay as { guarantee?: GuaranteeLike }).guarantee)])]
    : [PAYROLL_CSV_HEADER.slice(), ...rows.map(payrollCsvCells)];
  return "﻿" + lines.map((r) => r.map(csvEsc).join(",")).join("\r\n");
}
