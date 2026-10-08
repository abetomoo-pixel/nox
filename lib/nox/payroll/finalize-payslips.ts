// ★便 P166／X-13b（X-13-13・2026-10-08）: 確定時の payslips の形＝/api/payroll/finalize と demo の afterResetHooks（先月分の正規経路確定）で同じ 1 関数。
//   凍結の規約は finalize route（裁定264-10／264-11・0156 309-6／309-8・0154 D6）をそのまま移した＝キーの有無の規則は不変。
import type { PayrollDraft } from "./core";
import { frozenAdjustmentKeys } from "./adjust";

export type FinalizePayslip = {
  cast_id: string; net: number; breakdown: Record<string, unknown>;
  ar_deducted: unknown; ar_carried: unknown; adv_deducted: unknown; adv_carried: unknown; okuri_deducted: unknown;
  calc_period_start?: string; calc_period_end?: string;
};

export function payslipsOfDraft(rows: PayrollDraft["rows"]): FinalizePayslip[] {
  return rows.map((r) => ({
    cast_id: r.castId,
    net: r.net,
    // (a) 発行時点キャスト名の凍結: 確定後に源氏名を改名しても、この明細の表示名は発行時のまま。
    //   ★DB 変更は不要＝payroll_finalize は breakdown をそのまま採用し ar/adv/okuri だけを注入する（予約キー5つ pay/extras/ar/adv/okuri とは衝突しない）。
    // ★裁定264-10／264-11: show_detail=true の行は {reason, amount, before_withholding}・false は adjustments_hidden（数値）のみ・超過額は pay.adjustOverflow のまま。調整が無い run はキーを足さない。
    breakdown: {
      pay: r.pay, extras: r.extras, cast_name: r.castName, ...frozenAdjustmentKeys(r.adjustmentsShown, r.adjustmentsHiddenTotal),
      // ★0156（裁定309-6／309-8・便 V-2）: 日払い済み（gross・源泉既徴収・件数）と適用した控除上書き＝凍結は現行。無い cast はキーを足さない
      ...(r.dailyN > 0 ? { daily_paid_gross: r.dailyPaidGross, daily_withheld: r.dailyWithheld, daily_n: r.dailyN } : {}),
      ...(r.deductionOverridesApplied.length ? { deduction_overrides: r.deductionOverridesApplied.map((o) => ({ deduction_id: o.deductionId, enabled: o.enabled, amount_override: o.amountOverride })) } : {}),
    },
    ar_deducted: r.arDeducted, // F2e-1: {receivable_id, amount}[]（finalize が deducted/部分/繰越に遷移）
    ar_carried: r.arCarried, // F2e-1: {receivable_id}[]（deduct_period→翌 period）
    adv_deducted: r.advDeducted, // F2e-2: {advance_id, amount}[]（deducted/部分/繰越）
    adv_carried: r.advCarried, // F2e-2: {advance_id}[]（deduct_period→翌 period）
    okuri_deducted: r.okuriDeducted, // F2e-2: {transport_id, amount}[]（繰越なし＝carried 無し）
    ...(r.calcPeriodStart && r.calcPeriodEnd ? { calc_period_start: r.calcPeriodStart, calc_period_end: r.calcPeriodEnd } : {}), // ★0154 D6（294-8）: 同名キーを finalize が payslips へ写す
  }));
}
