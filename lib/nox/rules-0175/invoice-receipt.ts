// ★追補 2 同乗 R-6（裁定422 候補・0175 v2 ★26）: 電子領収書を簡易インボイスに＝公開面の表示と印紙の注意の純関数。
//   税率別の内訳＝RPC receipt_issue が発行時に凍結（1 税率 1 回丸め・受領額を税率の構成比で按分）＝ここは同じ式の鏡（suite で突合）。
//   登録番号は登録事業者（invoice_status='registered'）のときだけ snapshot に入る＝無ければ行ごと出さない。
//   RULES_0175_APPLIED=false の間は公開面も発行ダイアログも従来（宛名・但し書きは紙の注記）。
export type TaxBreakdownRow = { rate: number; amount_incl: number; tax: number; display: "tax_included" | "tax_excluded" | string };
export type IssuerSnapshot = { legal_name?: string | null; trade_name?: string | null; store_name?: string | null; address?: string | null; tel?: string | null; reg_no?: string | null };
export type ReceiptPaymentMethod = "cash" | "card" | "other" | "mixed";

const roundOf = (x: number, rounding: string): number => (rounding === "ceil" ? Math.ceil(x) : rounding === "round" ? Math.round(x) : Math.floor(x));
/** 税率別の内訳（RPC の鏡）＝受領額を税区分の構成比で按分→税率ごとに 1 回丸め。sums＝伝票の行の税区分別合計（割引は負で足し済み） */
export function taxBreakdownOf(amount: number, sums: { t10: number; t8: number; other: number }, rounding = "floor", display = "tax_included"): TaxBreakdownRow[] {
  const tot = sums.t10 + sums.t8 + sums.other;
  let a10: number, a8: number, ax: number;
  if (tot <= 0) { a10 = amount; a8 = 0; ax = 0; } else { a10 = Math.round(amount * sums.t10 / tot); a8 = Math.round(amount * sums.t8 / tot); ax = amount - a10 - a8; }
  const rows: TaxBreakdownRow[] = [];
  if (a10 > 0) rows.push({ rate: 10, amount_incl: a10, tax: roundOf(a10 * 10 / 110, rounding), display });
  if (a8 > 0) rows.push({ rate: 8, amount_incl: a8, tax: roundOf(a8 * 8 / 108, rounding), display });
  if (ax > 0) rows.push({ rate: 0, amount_incl: ax, tax: 0, display });
  return rows;
}
/** 公開面の税率行＝「10% 対象 ¥…（内消費税 ¥…）」・外税の店は「税抜 ¥…＋消費税 ¥…」 */
export function taxLineTextOf(r: TaxBreakdownRow): string {
  const yen = (n: number) => `¥${n.toLocaleString()}`;
  if (r.rate === 0) return `非課税・不課税 ${yen(r.amount_incl)}`;
  return r.display === "tax_excluded"
    ? `${r.rate}% 対象（税抜）${yen(r.amount_incl - r.tax)}＋消費税 ${yen(r.tax)}`
    : `${r.rate}% 対象 ${yen(r.amount_incl)}（内消費税 ${yen(r.tax)}）`;
}
/** 発行者の行＝法人名→屋号／店名→住所→電話→登録番号（登録事業者のみ・無ければ行ごと出さない） */
export function issuerLinesOf(s: IssuerSnapshot | null | undefined): string[] {
  if (!s) return [];
  const out: string[] = [];
  const name = (s.legal_name ?? "").trim(); const trade = (s.trade_name ?? "").trim(); const store = (s.store_name ?? "").trim();
  if (name) out.push(name);
  if (trade && trade !== name) out.push(trade); else if (!name && store) out.push(store);
  if (name && store && store !== name && store !== trade) out.push(store);
  if (s.address) out.push(s.address);
  if (s.tel) out.push(`TEL ${s.tel}`);
  if (s.reg_no) out.push(`登録番号 ${s.reg_no}`);
  return out;
}
export const PAYMENT_METHOD_LABEL: Record<ReceiptPaymentMethod, string> = { cash: "現金", card: "クレジットカード利用", other: "その他", mixed: "現金・カード併用" };
/** 伝票の入金から支払方法（RPC と同じ式） */
export function paymentMethodOf(pays: readonly { method: string }[]): ReceiptPaymentMethod {
  if (pays.length === 0) return "other";
  const set = new Set(pays.map((p) => p.method));
  if (set.size > 1) return "mixed";
  const m = pays[0].method;
  return m === "cash" ? "cash" : m === "card" ? "card" : "other";
}
/** 印紙の注意＝現金（または併用）受領 かつ 税込 5 万円以上。カードだけなら不要（印紙非課税＝「クレジットカード利用」の 1 行が根拠） */
export function stampNoticeOf(method: ReceiptPaymentMethod | string | null | undefined, amount: number): string | null {
  if (amount < 50_000) return null;
  if (method === "card") return null;
  return "収入印紙（¥200〜）の貼付が必要です（現金受領・税込 5 万円以上）";
}
/** 適格請求書発行事業者の登録番号＝T＋13 桁 */
export const regNoValidOf = (s: string | null | undefined): boolean => /^T[0-9]{13}$/.test((s ?? "").trim());
export const DEFAULT_RECEIPT_DESC = "ご飲食代として";
/** 但し書きの既定＝店設定→「ご飲食代として」 */
export const receiptDescDefaultOf = (storeDefault: string | null | undefined): string => (storeDefault ?? "").trim() || DEFAULT_RECEIPT_DESC;
