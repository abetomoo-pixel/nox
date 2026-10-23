// ★連続便 3 追補 P-8（裁定393 追補4・0175 v2 ★21）: 入金ごとのカード手数料の上書き＝店の率（auto）／なし（none）／額を指定（manual）。
//   check_pay の p_fee_amount（null＝店の率で自動・0＝なし・正＝この入金だけその額・上限＝残額）。RULES_0175_APPLIED=false の間は UI も引数も従来（p_fee_amount を送らない）。
//   「なし」「指定」は店長・オーナーのみ（スタッフは店の率固定）。確定済みの伝票は入金モーダル自体が出ない（従来）。
import { payFeeKeyOf, payFeeOf, type PayFeeKey } from "@/lib/nox/register/p173";

export type PayFeeMode = "auto" | "none" | "manual";
export const PAY_FEE_MODE_LABEL: Record<PayFeeMode, string> = { auto: "店の率", none: "なし", manual: "額を指定" };
export const PAY_FEE_MODES: readonly PayFeeMode[] = ["auto", "none", "manual"];

/** 役割で選べる方式＝スタッフは店の率だけ */
export const payFeeModesFor = (isManagerUp: boolean): readonly PayFeeMode[] => (isManagerUp ? PAY_FEE_MODES : ["auto"]);

/** check_pay に渡す p_fee_amount（auto＝null・none＝0・manual＝指定額を残額で丸める） */
export function feeAmountArgOf(mode: PayFeeMode, manual: number | null, balance: number): number | null {
  if (mode === "auto") return null;
  if (mode === "none") return 0;
  const m = Math.max(0, Math.trunc(manual ?? 0));
  return Math.min(m, Math.max(0, balance));
}

export type PayFeeNote = { key: PayFeeKey; rate: number; fee: number; receive: number; mode: PayFeeMode };
/** 入金モーダルの手数料 1 行＝方式を反映（auto＝店の率×入金額／none＝0／manual＝指定額）。率 0 の方法（現金・売掛）は null */
export function payFeeNoteWithModeOf(method: string, amount: number, rates: Record<PayFeeKey, number>, mode: PayFeeMode, manual: number | null, balance: number): PayFeeNote | null {
  const key = payFeeKeyOf(method);
  if (!key) return null;
  const rate = rates[key];
  if (!(rate > 0)) return null;
  const fee = mode === "auto" ? payFeeOf(amount, rate) : mode === "none" ? 0 : (feeAmountArgOf("manual", manual, balance) ?? 0);
  return { key, rate: mode === "auto" ? rate : 0, fee, receive: amount + fee, mode };
}

/** 手数料行の表示「手数料 ¥7,862（10%）」「手数料 ¥0（なし）」「手数料 ¥5,000（指定）」 */
/** 方式の読み口（従来の payFeeNoteOf の戻りは mode なし＝auto） */
export const noteModeOf = (n: object | null | undefined): PayFeeMode => { const m = (n as { mode?: unknown } | null | undefined)?.mode; return m === "none" || m === "manual" ? m : "auto"; };
export function payFeeRowTextOf(n: { fee: number; rate: number; mode: PayFeeMode }): string {
  const yen = "¥" + n.fee.toLocaleString();
  return n.mode === "auto" ? `手数料 ${yen}（${n.rate}%）` : n.mode === "none" ? `手数料 ${yen}（なし）` : `手数料 ${yen}（指定）`;
}
