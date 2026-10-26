// ★連続便 3 追補 P-8（裁定393 追補4・0175 v2 ★21）: 入金ごとのカード手数料の上書き＝店の率（auto）／なし（none）／額を指定（manual）。
//   check_pay の p_fee_amount（null＝店の率で自動・0＝なし・正＝この入金だけその額・上限＝残額）。RULES_0175_APPLIED=false の間は UI も引数も従来（p_fee_amount を送らない）。
//   「なし」「指定」は店長・オーナーのみ（スタッフは店の率固定）。確定済みの伝票は入金モーダル自体が出ない（従来）。
import { payFeeKeyOf, payFeeOf, type PayFeeKey } from "@/lib/nox/register/p173";

// ★便 M-6（裁定393 追補5 候補・2026-10-26）: 4 択＝店の率（n%）／率を指定（%→額に換算して p_fee_amount）／額を指定／なし（DB 変更 0＝集計は行を読むので不変）
export type PayFeeMode = "auto" | "rate" | "manual" | "none";
export const PAY_FEE_MODE_LABEL: Record<PayFeeMode, string> = { auto: "店の率", rate: "率を指定", manual: "額を指定", none: "なし" };
export const PAY_FEE_MODES: readonly PayFeeMode[] = ["auto", "rate", "manual", "none"];
/** ★便 M-6: 「店の率（10%）」＝ボタンの文言に店の率を出す */
export const payFeeModeButtonLabelOf = (m: PayFeeMode, storeRate: number): string => (m === "auto" ? `店の率（${storeRate}%）` : PAY_FEE_MODE_LABEL[m]);
/** ★便 M-6: 率の入力（0〜100・小数 1 桁）＝不正は null */
export function feeRateInputOf(raw: string): number | null { const t = raw.trim(); if (!/^\d{1,3}(\.\d)?$/.test(t)) return null; const n = Number(t); return n >= 0 && n <= 100 ? n : null; }

/** 役割で選べる方式＝スタッフは店の率だけ */
export const payFeeModesFor = (isManagerUp: boolean): readonly PayFeeMode[] => (isManagerUp ? PAY_FEE_MODES : ["auto"]);

/** check_pay に渡す p_fee_amount（auto＝null・none＝0・manual＝指定額を残額で丸める） */
export function feeAmountArgOf(mode: PayFeeMode, manual: number | null, balance: number, rate?: { rate: number | null; amount: number }): number | null {
  if (mode === "auto") return null;
  if (mode === "none") return 0;
  if (mode === "rate") return Math.min(payFeeOf(rate?.amount ?? 0, rate?.rate ?? 0), Math.max(0, balance)); // ★便 M-6: 率を指定＝入金額×率（四捨五入）を額に換算
  const m = Math.max(0, Math.trunc(manual ?? 0));
  return Math.min(m, Math.max(0, balance));
}

export type PayFeeNote = { key: PayFeeKey; rate: number; fee: number; receive: number; mode: PayFeeMode };
/** 入金モーダルの手数料 1 行＝方式を反映（auto＝店の率×入金額／none＝0／manual＝指定額）。率 0 の方法（現金・売掛）は null */
export function payFeeNoteWithModeOf(method: string, amount: number, rates: Record<PayFeeKey, number>, mode: PayFeeMode, manual: number | null, balance: number, rateIn: number | null = null): PayFeeNote | null {
  const key = payFeeKeyOf(method);
  if (!key) return null;
  const rate = rates[key];
  if (!(rate > 0)) return null;
  const fee = mode === "auto" ? payFeeOf(amount, rate) : mode === "none" ? 0 : mode === "rate" ? (feeAmountArgOf("rate", null, balance, { rate: rateIn, amount }) ?? 0) : (feeAmountArgOf("manual", manual, balance) ?? 0);
  return { key, rate: mode === "auto" ? rate : mode === "rate" ? (rateIn ?? 0) : 0, fee, receive: amount + fee, mode };
}

/** 手数料行の表示「手数料 ¥7,862（10%）」「手数料 ¥0（なし）」「手数料 ¥5,000（指定）」 */
/** 方式の読み口（従来の payFeeNoteOf の戻りは mode なし＝auto） */
export const noteModeOf = (n: object | null | undefined): PayFeeMode => { const m = (n as { mode?: unknown } | null | undefined)?.mode; return m === "none" || m === "manual" || m === "rate" ? m : "auto"; };
export function payFeeRowTextOf(n: { fee: number; rate: number; mode: PayFeeMode }): string {
  const yen = "¥" + n.fee.toLocaleString();
  return n.mode === "auto" ? `手数料 ${yen}（${n.rate}%）` : n.mode === "rate" ? `手数料 ${yen}（指定 ${n.rate}%）` : n.mode === "none" ? `手数料 ${yen}（なし）` : `手数料 ${yen}（指定）`;
}
