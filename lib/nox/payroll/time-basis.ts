// ★裁定324-1／324-2（0159 client 前倒し・便 L-2-3・2026-09-30）: 勤務時間の計算基準（店設定・2 択）の解決＝純関数（DB を知らない）。
//   stores.settings_json: pay_time_basis（'punch'＝実打刻・既定／'shift'＝確定シフトどおり）・pay_time_basis_next・pay_time_basis_next_from（'YYYY-MM-DD'）。
//   run の計算期間の初日（periodStart）≥ next_from なら next を採用・未満なら現行値。欠損・不正は 'punch'（既存店・golden 不変）。settings_json は書き換えない（昇格はここで吸収）。
export type PayTimeBasis = "punch" | "shift";
export const PAY_TIME_BASIS_DEFAULT: PayTimeBasis = "punch";

const asBasis = (v: unknown): PayTimeBasis | null => (v === "punch" || v === "shift" ? v : null);

export function payTimeBasisOf(settings: Record<string, unknown> | null | undefined, periodStart: string): PayTimeBasis {
  const cur = asBasis(settings?.pay_time_basis) ?? PAY_TIME_BASIS_DEFAULT;
  const next = asBasis(settings?.pay_time_basis_next);
  const from = settings?.pay_time_basis_next_from;
  if (next && typeof from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(periodStart) && periodStart >= from) return next;
  return cur;
}
