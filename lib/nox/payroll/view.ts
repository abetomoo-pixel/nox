// ★夜間便 N3（2026-09-24・週末バックログ 4＝給与の表示・文言）: /payroll 系の表示だけの純関数（DB を知らない・金額の再計算をしない）。
//   AV-1 日付は M/D・期は YYYY/M／AV-4 退勤の記録が無い勤務の警告文／AV-2 確定済み run は凍結値（payslips）をそのまま行にする。
import type { PayrollCsvPay } from "./csv";
import { readFrozenAdjustments, totalDeductionsOf } from "./adjust";

/** 'YYYY-MM' → 'YYYY/M'（期の表示・形が違えばそのまま） */
export function fmtPeriodYM(period: string | null | undefined): string {
  if (!period) return "—";
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  return m ? `${m[1]}/${Number(m[2])}` : period;
}

/** 'YYYY-MM-DD' → 'M/D'（日付の表示・形が違えばそのまま。年は title 等で補う） */
export function fmtMD(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${Number(m[2])}/${Number(m[3])}` : ymd;
}

/** 退勤の記録が無い勤務（in はあるが out が無い営業日）の集計＝警告文と一覧（キャスト名・M/D）。0 件なら null */
export function missingOutSummaryOf(rows: readonly { castName: string; missingOutDates?: readonly string[] }[]): { count: number; text: string; items: { castName: string; date: string; md: string }[] } | null {
  const items: { castName: string; date: string; md: string }[] = [];
  for (const r of rows) for (const d of r.missingOutDates ?? []) items.push({ castName: r.castName, date: d, md: fmtMD(d) });
  if (items.length === 0) return null;
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.castName.localeCompare(b.castName, "ja")));
  return { count: items.length, text: `退勤の記録が無い勤務が ${items.length} 件`, items };
}

export type FrozenSlip = { cast_id: string; net: number; breakdown_json: { pay: PayrollCsvPay; extras?: { amount: number }[]; cast_name?: string } & Record<string, unknown> };
export type FrozenRow = {
  castId: string; castName: string; net: number; taxMode: string; anomalyCount: number;
  arDeductTotal?: number; advDeductTotal?: number; okuriDeductTotal?: number;
  adjustmentsShown?: { reason: string; amount: number; before_withholding: boolean }[]; adjustmentsHiddenTotal?: number;
  breakdown: { pay: PayrollCsvPay; extras: { amount: number }[] };
  frozen: true;
};

/** 確定済み run の payslips（凍結値）→ 明細表の行。再計算なし＝pay／extras／net をそのまま写す。
 *  凍結名（cast_name）が 1 行でも欠ける（B5 以前の旧 payslip）なら null＝従来どおりプレビューで表示（現在名の取得＝fetch を増やさない）。 */
export function frozenRowsOf(slips: readonly FrozenSlip[]): FrozenRow[] | null {
  if (slips.length === 0) return null;
  if (slips.some((s) => !s.breakdown_json?.cast_name)) return null;
  return slips.map((s) => {
    const pay = s.breakdown_json.pay;
    const adj = readFrozenAdjustments(s.breakdown_json);
    return {
      castId: s.cast_id, castName: s.breakdown_json.cast_name as string, net: s.net, taxMode: (pay as { taxMode?: string }).taxMode ?? "", anomalyCount: 0, // taxMode＝凍結 PayResult のキー（0075 と同じ読み口）
      arDeductTotal: pay.arDeduct, advDeductTotal: pay.advanceDeduct, okuriDeductTotal: pay.okuriDeduct,
      adjustmentsShown: [...adj.before, ...adj.after], adjustmentsHiddenTotal: adj.hiddenTotal,
      breakdown: { pay, extras: s.breakdown_json.extras ?? [] },
      frozen: true,
    };
  });
}

/** ★裁定303 追補1（2026-09-25）: 確定済み run の合計サマリ＝凍結値の Σ のみ。総支給＝Σpay.gross（extras は gross 内在＝裁定26・足さない）。
 *  欠落キーは 0 扱い（payroll_finalize は実績ゼロの cast に {"net":0} を書く）。率計算も丸め直しも net との整合補正もしない。 */
export function runSummaryOf(slips: readonly { net: number; breakdown_json: { pay: Partial<PayrollCsvPay> } }[]): { gross: number; ded: number; wh: number; net: number; n: number } {
  const z = (v: number | undefined) => v ?? 0;
  let gross = 0, ded = 0, wh = 0, net = 0;
  for (const sl of slips) {
    const pay = sl.breakdown_json.pay as PayrollCsvPay;
    gross += z(pay.gross);
    ded += totalDeductionsOf(pay);
    wh += z(pay.withholding);
    net += z(sl.net);
  }
  return { gross, ded, wh, net, n: slips.length };
}

/** 表示用: 凍結行の控除計（adjust.ts の 1 本の式＝再計算ではなく凍結値の Σ） */
export const frozenDeductionOf = (pay: PayrollCsvPay): number => totalDeductionsOf(pay);
