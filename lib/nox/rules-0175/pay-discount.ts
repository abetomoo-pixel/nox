// ★0187 の client（便 CASH・Agoora 確定 10/27＋補遺・事後承認 ①〜④ の決着＝2026-10-27 夜）: 支払方法による割引（現金割引）の純関数＝DB を知らない。
//   check_pay（0187）の鏡: 店設定 pay_discount_rates {cash, card, other}（小数 1 桁 %）・pay_discount_base（total＝合計から・既定／subtotal＝小計から）。
//   合計から＝税・サ込みの残額×率（round）を fee_kind 'pay_discount_total' の行にして、check_group_due が「丸めた合計から引いてから店の丸め規則でもう一度丸める」（事後承認 ②）。
//   小計から＝税・サの前の小計（未入金分の比で按分＝事後承認 ③）×率を fee_kind 'pay_discount' の行（従来の割引行＝サ・税の前に効く）。
//   入金ごとの上書き＝M-6 のカード手数料と同じ 4 択（店の率／率を指定／額を指定／なし）・なし・指定は店長以上（事後承認 ④）。
//   権威は RPC（check_pay の p_disc_rate／p_disc_amount）＝ここは入金モーダルの表示と既定値（MIG_0187_APPLIED=false の間は UI も引数も出さない）。
import { groupDueFull, roundAmount, type CheckDueSettings, type DueLine } from "@/lib/nox/check-calc";
import type { PayFeeMode } from "./pay-fee";

export type PayDiscountKey = "cash" | "card" | "other";
export type PayDiscountBase = "total" | "subtotal";
export const PAY_DISCOUNT_BASE_LABEL: Record<PayDiscountBase, string> = { total: "合計から（税・サービス料込みの残額に率を掛けて最後に引く）", subtotal: "小計から（税・サービス料の前の小計から引く）" };
export const PAY_DISCOUNT_BASE_SHORT: Record<PayDiscountBase, string> = { total: "合計から", subtotal: "小計から" };

/** レジの支払方法（cash／card／emoney／qr／ar／other）→割引キー（check_pay の v_dkey と同じ＝emoney／qr は p_fee_key 'other'・売掛は対象外） */
export function payDiscountKeyOf(method: string): PayDiscountKey | null {
  if (method === "cash") return "cash";
  if (method === "card") return "card";
  if (method === "emoney" || method === "qr" || method === "other") return "other";
  return null;
}

/** 店設定 pay_discount_rates → 3 キー（0〜100・小数 1 桁・欠損／不正＝0） */
export function payDiscountRatesOf(settings: unknown): Record<PayDiscountKey, number> {
  const sj = (settings ?? {}) as Record<string, unknown>;
  const o = (sj.pay_discount_rates ?? {}) as Record<string, unknown>;
  const pick = (k: PayDiscountKey) => { const v = o[k]; return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v * 10) / 10 : 0; };
  return { cash: pick("cash"), card: pick("card"), other: pick("other") };
}
/** 店設定 pay_discount_base（欠損＝total＝税理士 T15 の回答待ちの仮置き） */
export const payDiscountBaseOf = (settings: unknown): PayDiscountBase => (((settings ?? {}) as Record<string, unknown>).pay_discount_base === "subtotal" ? "subtotal" : "total");

/** 役割で選べる方式＝なし・指定（率／額）は店長以上（事後承認 ④）・スタッフは店の率だけ */
export const payDiscountModesFor = (isManagerUp: boolean): readonly PayFeeMode[] => (isManagerUp ? ["auto", "rate", "manual", "none"] : ["auto"]);

/** check_pay に足す引数（auto＝何も送らない・none＝p_disc_amount 0・manual＝額（残額まで）・rate＝p_disc_rate） */
export function discountArgsOf(mode: PayFeeMode, manual: number | null, rateIn: number | null, balance: number): { p_disc_rate?: number; p_disc_amount?: number } {
  if (mode === "auto") return {};
  if (mode === "none") return { p_disc_amount: 0 };
  if (mode === "rate") return rateIn === null ? {} : { p_disc_rate: rateIn };
  return { p_disc_amount: Math.min(Math.max(0, Math.trunc(manual ?? 0)), Math.max(0, balance)) };
}

/** 率の表記（check_pay の to_char(v_drate, 'FM990.0') の末尾 0 を落とした形＝"10"・"7.5"） */
export const discountRateTextOf = (r: number): string => String(Math.round(r * 10) / 10);
const KEY_LABEL: Record<PayDiscountKey, string> = { cash: "現金割引", card: "カード割引", other: "決済割引" };
/** 伝票行の印字名（check_pay と同じ）＝「現金割引 10%」「現金割引（指定）」「現金割引 10%（小計から）」 */
export function payDiscountLineNameOf(key: PayDiscountKey, rate: number | null, base: PayDiscountBase): string {
  return `${KEY_LABEL[key]}${rate === null ? "（指定）" : ` ${discountRateTextOf(rate)}%`}${base === "subtotal" ? "（小計から）" : ""}`;
}

export type PayDiscountPreview = {
  key: PayDiscountKey; mode: PayFeeMode; base: PayDiscountBase;
  /** 使う率（auto＝店の率・rate＝指定・manual／none＝0） */ rate: number;
  /** 割引額（行の額） */ disc: number;
  /** 割引後の請求（check_group_due の鏡）と残額 */ newDue: number; newBalance: number;
  /** 伝票行の名前（check_pay と同じ） */ name: string; feeKind: "pay_discount" | "pay_discount_total";
};
/** 入金モーダルの割引の見込み＝check_pay の割引額と、行を足した後の check_group_due（groupDueFull）。店の率 0 で auto＝null（欄を出さない）・売掛＝null */
export function payDiscountPreviewOf(i: {
  method: string; mode: PayFeeMode; storeRate: number; rateIn: number | null; manual: number | null; base: PayDiscountBase;
  due: number; paid: number; lines: readonly DueLine[]; settings: CheckDueSettings; referralCustomer?: number;
}): PayDiscountPreview | null {
  const key = payDiscountKeyOf(i.method);
  if (!key) return null;
  if (i.mode === "auto" && !(i.storeRate > 0)) return null;
  const balance = Math.max(0, i.due - i.paid);
  const rate = i.mode === "auto" ? i.storeRate : i.mode === "rate" ? (i.rateIn ?? 0) : 0;
  let disc = 0;
  if (balance > 0) {
    if (i.mode === "manual") disc = Math.min(Math.max(0, Math.trunc(i.manual ?? 0)), balance);
    else if (i.mode === "none") disc = 0;
    else if (rate > 0) {
      if (i.base === "subtotal") {
        // 小計から＝税・サの前の小計（割引済みの分を除く・手数料行を除く）× 未入金分の比 × 率（check_pay の v_dnet と同式・事後承認 ③）
        const dnet = i.lines.filter((l) => l.kind !== "discount" && l.fee_kind !== "pay_fee").reduce((a, l) => a + l.line_total, 0)
          - i.lines.filter((l) => l.kind === "discount" && l.fee_kind !== "pay_discount_total").reduce((a, l) => a + l.line_total, 0);
        disc = Math.round(((Math.max(0, dnet) * balance) / Math.max(i.due, 1)) * rate / 100);
      } else {
        disc = Math.round((balance * rate) / 100); // 合計から＝税・サ込みの残額×率（round）
      }
    }
  }
  const feeKind = i.base === "subtotal" ? "pay_discount" : "pay_discount_total";
  const newDue = disc > 0 ? groupDueFull([...i.lines, { kind: "discount", fee_kind: feeKind, line_total: disc, tax_category: "taxable_10" }], i.settings, i.referralCustomer ?? 0) : i.due;
  return { key, mode: i.mode, base: i.base, rate, disc, newDue, newBalance: Math.max(0, newDue - i.paid), name: payDiscountLineNameOf(key, i.mode === "manual" ? null : rate, i.base), feeKind };
}

/** 割引欄の 1 行「現金割引 ¥1,430（10%）」「現金割引 ¥0（なし）」「現金割引 ¥500（指定）」「現金割引 ¥715（指定 5%）」 */
export function payDiscountRowTextOf(p: { key: PayDiscountKey; disc: number; rate: number; mode: PayFeeMode }): string {
  const yen = "¥" + p.disc.toLocaleString();
  const l = KEY_LABEL[p.key];
  return p.mode === "auto" ? `${l} ${yen}（${discountRateTextOf(p.rate)}%）` : p.mode === "rate" ? `${l} ${yen}（指定 ${discountRateTextOf(p.rate)}%）` : p.mode === "none" ? `${l} ${yen}（なし）` : `${l} ${yen}（指定）`;
}

// ── M-17（入金モーダルの大きな赤字＝選んだ方法で受け取る額） ─────────────────────────
/** 方法ごとのラベル＝現金「現金でのお支払額」・カード「カードでのお支払額」・電子マネー／QR も同型・その他／売掛「残額」 */
export function payReceiveLabelOf(method: string): string {
  if (method === "cash") return "現金でのお支払額";
  if (method === "card") return "カードでのお支払額";
  if (method === "emoney") return "電子マネーでのお支払額";
  if (method === "qr") return "QR 決済でのお支払額";
  return "残額";
}
/** 受け取る額と内訳＝残額＋手数料−割引。割引で残額が「残額−割引」とずれる分＝合計から（既定）は丸め直し（「丸め」）・小計からはサ・税が割引分だけ減る（「サ・税の減り」）。内訳なし（手数料 0・割引 0・方式が既定）は note null */
export function payReceiveOf(i: { method: string; balance: number; newBalance: number; fee: number; feeText: string | null; disc: number; discText: string | null; base?: PayDiscountBase }): { label: string; amount: number; note: string | null } {
  const yen = (n: number) => "¥" + Math.abs(n).toLocaleString();
  const parts: string[] = [];
  if (i.feeText !== null) parts.push(`＋手数料 ${yen(i.fee)}（${i.feeText}）`);
  if (i.discText !== null) parts.push(`−${i.discText}`);
  const roundDiff = i.newBalance - (i.balance - i.disc);
  if (i.disc > 0 && roundDiff !== 0) parts.push(`${roundDiff < 0 ? "−" : "＋"}${i.base === "subtotal" ? "サ・税の減り" : "丸め"} ${yen(roundDiff)}`); // ★live 10/29: 小計からは丸めではなくサ・税の減り
  const amount = Math.max(0, i.newBalance + i.fee);
  return { label: payReceiveLabelOf(i.method), amount, note: parts.length ? `残額 ${yen(i.balance)}${parts.join("")}` : null };
}

// ── 店設定「支払方法の調整」（なし／カード手数料／現金割引／両方） ─────────────────────
export type PayAdjustMode = "none" | "fee" | "disc" | "both";
export const PAY_ADJUST_LABEL: Record<PayAdjustMode, string> = { none: "なし", fee: "カード手数料", disc: "現金割引", both: "両方" };
export const PAY_ADJUST_MODES: readonly PayAdjustMode[] = ["none", "fee", "disc", "both"];
export const payAdjustModeOf = (i: { feeOn: boolean; discOn: boolean }): PayAdjustMode => (i.feeOn && i.discOn ? "both" : i.feeOn ? "fee" : i.discOn ? "disc" : "none");
export const payAdjustHasFee = (m: PayAdjustMode): boolean => m === "fee" || m === "both";
export const payAdjustHasDisc = (m: PayAdjustMode): boolean => m === "disc" || m === "both";
/** 現金割引の率の入力（0〜100・小数 1 桁）＝不正は null・空欄は 0 */
export function discountRateInputOf(raw: string): number | null { const s = raw.trim(); if (s === "") return 0; if (!/^\d{1,3}(\.\d)?$/.test(s)) return null; const n = Number(s); return n >= 0 && n <= 100 ? n : null; }

/** 合計からの割引を足した後の請求（事後承認 ②＝丸めた合計から引いてもう一度丸める）＝check_group_due の最後の式だけを切り出した鏡（境界値の suite 用） */
export const dueAfterTotalDiscountOf = (dueRounded: number, post: number, unit: number, mode: string): number => (post > 0 ? roundAmount(Math.max(0, dueRounded - post), unit, mode) : dueRounded);
