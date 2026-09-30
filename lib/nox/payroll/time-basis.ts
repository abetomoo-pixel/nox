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

// ── 表示用（便 C-1／C-2／C-3・2026-09-30）──
export const PAY_TIME_BASIS_LABEL: Record<PayTimeBasis, string> = { punch: "実打刻", shift: "確定シフトどおり" };
/** 期ヘッダー用の 1 語（C-3）: 実打刻／確定シフト */
export const PAY_TIME_BASIS_SHORT: Record<PayTimeBasis, string> = { punch: "実打刻", shift: "確定シフト" };

export type PayTimeBasisView = { current: PayTimeBasis; next: PayTimeBasis | null; nextFrom: string | null };
/** settings_json → 現在値・予約値・適用日（不正・欠損は既定 'punch'／null）。予約が現在値と同じ・適用日が不正なら予約なし扱い */
export function payTimeBasisViewOf(settings: Record<string, unknown> | null | undefined): PayTimeBasisView {
  const cur = asBasis(settings?.pay_time_basis) ?? PAY_TIME_BASIS_DEFAULT;
  const next = asBasis(settings?.pay_time_basis_next);
  const from = settings?.pay_time_basis_next_from;
  const ok = !!next && typeof from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(from);
  return { current: cur, next: ok ? next : null, nextFrom: ok ? (from as string) : null };
}
/** 'YYYY-MM-DD' → 'M/D' */
const mdOf = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
/** 予約の注記「M/1 から適用（現在: 実打刻）」。予約なしは null。すでに到来している（today ≥ nextFrom）予約は「M/1 から適用中」 */
export function payTimeBasisApplyNoteOf(view: PayTimeBasisView, today?: string): string | null {
  if (!view.next || !view.nextFrom) return null;
  const arrived = typeof today === "string" && today >= view.nextFrom;
  return arrived ? `${mdOf(view.nextFrom)} から適用中（${PAY_TIME_BASIS_LABEL[view.next]}）` : `${mdOf(view.nextFrom)} から適用（現在: ${PAY_TIME_BASIS_LABEL[view.current]}）`;
}
/** 保存時の apply: 当店に payroll_runs が 1 行以上あれば 'next'（次の暦月の 1 日から）・0 行なら 'now'（即時＝ウィザード STEP 3 と同じ） */
export const payTimeBasisApplyOf = (runCount: number): "next" | "now" => (runCount > 0 ? "next" : "now");
