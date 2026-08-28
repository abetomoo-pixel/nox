/* レシート XML 生成純関数（F4b・台帳 #F4b 裁定）。
 *
 * DB を知らない純関数（pay.ts と同じ案1）。入力は呼び出し側（print poll route）が
 * checks/check_lines/payments/stores.settings_json/check_group_due から集めて渡す。
 * 出力は Epson ePOS-Print XML（TM-m30 系・80mm・Font A=48桁想定）。
 *
 * ★前提: 全品 10% 内税（酒類・サービスのみ＝ナイトワーク業態）。
 *   軽減税率 8%（テイクアウト食品等）は非対応＝F5 差し替え点:
 *   - ReceiptLine に tax_rate を足し、税率別に集計して「内消費税」を税率行別に出す
 *   - 適格簡易請求書の税率別記載要件は taxOf() の 1 箇所差し替えで対応
 *
 * 金額段の内訳（採用形＝逆算ではなく DB 同式の順算）:
 *   gross    = Σ line_total (kind <> 'discount')          … check_group_due の v_bx  と同式
 *   discount = Σ line_total (kind =  'discount')          … 同 v_disc（正値格納）
 *   net      = max(0, gross - discount)                   … 同 v_net
 *   service  = round(net × serviceRate / 100)             … 同 round(v_net * v_rate / 100.0)（half-up・非負）
 *   端数調整 = groupDue - (net + service)                 … 丸め（round_unit/round_mode）の差額表示
 *   合計     = groupDue（★入力の記録値が正＝check_group_due の返り値。ここで再丸めはしない）
 *
 * 税（適格簡易請求書）: 内消費税 = floor(groupDue × 10/110)。
 *   1レシート = 1 pay_group = 1 インボイス ＝ 税率ごと端数処理 1 回の要件に適合。
 *
 * 伝票番号 = check_id 先頭 8 桁 + '-' + pay_group（採番テーブルは作らない裁定）。
 * reg_no 空 = 登録番号行を出さない（未登録店）。is_reprint = 「再発行」表記（Q-b 裁定）。
 * XML エスケープ: name_snapshot 等の & < > " ' は必ず実体参照へ（ePOS XML 破壊防止）。
 * ★mig0097（R2-b）: auto 延長はブロック行化（「延長料金(N分) #k」×ブロック数）＝本関数は明細を
 *   素通し印字するだけなので無改修で複数行が正しく出る。金額段は Σline_total／groupDue 由来＝総額不変
 *   （golden 52 の fixture は時間行を含まない＝pin も不変・段54 で実測確認）。
 */

import { taxSettingsOf, taxRound, type StoreTaxSettings } from "./check-calc";

export type ReceiptStore = {
  name: string;
  address: string; // 空 = 行を出さない
  tel: string; // 空 = 行を出さない
  reg_no: string; // 空 = 登録番号行を出さない（T+13桁は set_store_receipt_profile が検証済み）
  footer: string; // 空 = 行を出さない
};

export type ReceiptCheck = {
  id: string; // uuid（先頭8桁を伝票番号に使う）
  closed_at: string; // timestamptz ISO（JST 表示に変換）
  nom_type: string; // 受けるが印字しない（客向けレシートに指名種別は出さない）
};

export type ReceiptLine = {
  name_snapshot: string;
  qty: number;
  unit_price_snapshot: number; // 保持のみ（48桁幅の都合で印字は名称×qty＋行計）
  line_total: number;
  kind: string; // 'discount' はマイナス表記＋割引段へ集計
  // ★C3 読み経路段（mig0111）: check_lines.tax_category のスナップショット。省略可＝既存呼び出し不変。
  //   税率別集計（taxable_8 併存・exempt 行の税額除外）は挙動段（C34設計書 §6-4）＝本段では受理のみ。
  tax_category?: string;
};

export type ReceiptPayment = {
  method: string; // 'cash' | 'card' | 'ar' | 'other'
  amount: number;
  tendered: number | null; // cash のみ（釣銭 = tendered - amount）
};

export type ReceiptInput = {
  store: ReceiptStore;
  check: ReceiptCheck;
  payGroup: string;
  lines: ReceiptLine[]; // ★当該 pay_group の行のみを渡す（呼び出し側の責務）
  payments: ReceiptPayment[]; // 当該 pay_group の入金のみ
  serviceRate: number; // checks.service_rate（open 時凍結値）
  groupDue: number; // check_group_due(check_id, pay_group) の記録値＝合計の正
  isReprint: boolean;
  // ★C4 読み経路段（mig0111）: 店舗税設定。省略＝既定（taxable・内税・floor・surcharge 無効）で
  //   現行と1バイト同値。exempt/外税/card_surcharge の挙動差は挙動段で結線（本段は tax_rounding のみ実効）。
  taxSettings?: Partial<StoreTaxSettings> | null;
};

const WIDTH = 48; // 80mm・Font A

const METHOD_JA: Record<string, string> = { cash: "現金", card: "カード", ar: "売掛", other: "その他" };

export function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 印字幅（全角=2・半角=1）。サロゲートペア（絵文字等）は 2 扱い。 */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    // ASCII と半角カナは 1・それ以外（和文・全角記号・絵文字）は 2
    w += cp <= 0x7f || (cp >= 0xff61 && cp <= 0xff9f) ? 1 : 2;
  }
  return w;
}

/** 幅超過を切り詰め（全角境界を壊さない） */
function truncToWidth(s: string, max: number): string {
  let w = 0;
  let out = "";
  for (const ch of s) {
    const cw = (ch.codePointAt(0) ?? 0) <= 0x7f || ((ch.codePointAt(0) ?? 0) >= 0xff61 && (ch.codePointAt(0) ?? 0) <= 0xff9f) ? 1 : 2;
    if (w + cw > max) break;
    out += ch;
    w += cw;
  }
  return out;
}

/** 左寄せ+右寄せの 1 行（48桁）。left が長ければ切り詰めて右端金額を守る。 */
function padLine(left: string, right: string): string {
  const rw = displayWidth(right);
  const maxLeft = WIDTH - rw - 1; // 最低 1 桁の空白
  const l = displayWidth(left) > maxLeft ? truncToWidth(left, maxLeft) : left;
  const pad = WIDTH - displayWidth(l) - rw;
  return l + " ".repeat(Math.max(1, pad)) + right;
}

const yen = (n: number) => "¥" + Math.abs(n).toLocaleString("en-US");
const yenSigned = (n: number) => (n < 0 ? "-" : "") + yen(n);

/** JST 'YYYY/MM/DD HH:MM'（Date の TZ 依存を避け +9h を手動適用＝biz-date.ts と同じ流儀） */
export function jstStamp(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** 消費税＝**1レシート（=1 pay_group=1インボイス）×税率ごとに端数処理1回**（T5）。
 *  第2引数 = stores.tax_rounding（mig0111・既定 'floor'）。
 *  ★mig0113（挙動段）: 第3引数 excludedRate を渡すと**外税**＝amount を「税率別の課税対象額（税抜基底）」
 *    として taxRound(amount × rate / 100) を返す（税率ごとに1回呼ぶ＝伝票×税率×1回）。
 *    省略時は従来どおり**内税**＝amount を税込請求額として ×10/110（1バイト同値）。
 *  ★行ごとに丸めて合算する形にしてはならない（適格請求書の税率ごと1回ルール・verify で性質固定）。
 *  ★DB 鏡像: check_tax_round（mig0113）・check_group_due の外税分岐＝式を変えるときは三面同時改修。 */
export function taxOf(groupDue: number, rounding: string = "floor", excludedRate?: number): number {
  if (excludedRate !== undefined) return taxRound((groupDue * excludedRate) / 100, rounding);
  return taxRound((groupDue * 10) / 110, rounding);
}

export function buildReceiptXml(input: ReceiptInput): string {
  const { store, check, payGroup, lines, payments, serviceRate, groupDue, isReprint } = input;

  // 金額段（冒頭コメントの順算式＝check_group_due と同式）
  const gross = lines.filter((l) => l.kind !== "discount").reduce((s, l) => s + l.line_total, 0);
  const discount = lines.filter((l) => l.kind === "discount").reduce((s, l) => s + l.line_total, 0);
  const net = Math.max(0, gross - discount);
  const service = Math.round((net * serviceRate) / 100);
  // ★C4 挙動段（mig0113・三面鏡）: 税設定で3分岐。既定（内税×taxable）は従来と1バイト同値。
  //   規則は check_group_due（DB）/ groupDueFull（check-calc.ts）と同一＝
  //   外税: discount は taxable_10 基底へ clamp 適用・サ料は taxable_10 基底・税率ごと taxRound 1回。
  const ts = taxSettingsOf(input.taxSettings);
  const isExcluded = ts.price_display === "tax_excluded" && ts.business_tax_status === "taxable";
  const isExempt = ts.business_tax_status === "exempt";
  const catOf = (l: ReceiptLine) => l.tax_category ?? "taxable_10";
  const bx10 = lines.filter((l) => l.kind !== "discount" && catOf(l) === "taxable_10").reduce((s2, l) => s2 + l.line_total, 0);
  const bx8 = lines.filter((l) => l.kind !== "discount" && catOf(l) === "taxable_8").reduce((s2, l) => s2 + l.line_total, 0);
  const base10 = Math.max(0, bx10 - discount) + service; // 外税の 10% 基底（clamp＋サ料算入）
  const tax10 = isExcluded ? taxOf(base10, ts.tax_rounding, 10) : 0;
  const tax8 = isExcluded ? taxOf(bx8, ts.tax_rounding, 8) : 0;
  // 内税税額（表示用・請求額には含まれない）。exempt は税表示なし。
  const tax = isExcluded ? tax10 + tax8 : isExempt ? 0 : taxOf(groupDue, ts.tax_rounding);
  // 端数調整＝記録値 groupDue と順算の差（外税は税が請求額の一部＝差分に算入）
  const rounding = groupDue - (net + service + (isExcluded ? tax : 0));

  const slipNo = `${check.id.replace(/-/g, "").slice(0, 8)}-${payGroup}`;
  const sep = "-".repeat(WIDTH);

  // 本文（テキスト行の配列 → <text> 要素へ。align は要素単位で切替）
  const t: string[] = []; // XML 要素列
  const line = (s: string) => t.push(`<text>${escXml(s)}&#10;</text>`);
  const center = (s: string) => {
    t.push(`<text align="center"/>`);
    line(s);
    t.push(`<text align="left"/>`);
  };

  t.push(`<text lang="ja"/>`);
  t.push(`<text smooth="true"/>`);

  // ── ヘッダ ──
  t.push(`<text align="center"/>`);
  t.push(`<text dw="true" dh="true"/>`);
  line(store.name);
  t.push(`<text dw="false" dh="false"/>`);
  if (store.address) line(store.address);
  if (store.tel) line(`TEL ${store.tel}`);
  if (store.reg_no) line(`登録番号 ${store.reg_no}`);
  t.push(`<text align="left"/>`);
  if (isReprint) center("【再発行】");
  line(sep);
  line(padLine(`No. ${slipNo}`, jstStamp(check.closed_at)));
  line(sep);

  // ── 明細（当該 pay_group のみ・discount はマイナス表記）──
  for (const l of lines) {
    if (l.kind === "discount") {
      line(padLine(`割引 ${l.name_snapshot}`, `-${yen(l.line_total)}`));
    } else {
      const name = l.qty > 1 ? `${l.name_snapshot} x${l.qty}` : l.name_snapshot;
      line(padLine(name, yen(l.line_total)));
    }
  }
  line(sep);

  // ── 金額段 ──
  line(padLine("小計", yen(gross)));
  if (discount > 0) line(padLine("割引", `-${yen(discount)}`));
  if (serviceRate > 0) line(padLine(`サービス料(${serviceRate}%)`, yen(service)));
  if (rounding !== 0) line(padLine("端数調整", yenSigned(rounding)));
  if (isExcluded) {
    // ★外税＝税は請求額の一部として本体行で出す（税率ごとに1行・T5 の税率別記載）
    line(padLine("消費税(10%)", yen(tax10)));
    if (bx8 > 0) line(padLine("消費税(8%)", yen(tax8)));
  }
  t.push(`<text dw="true" dh="true"/>`);
  line(padLine("合計", yen(groupDue)));
  t.push(`<text dw="false" dh="false"/>`);
  if (!isExcluded && !isExempt) line(padLine("（内消費税10%）", yen(tax)));
  // ★exempt＝税額区分の記載なし（免税事業者は適格簡易請求書を発行できない＝T5・設計書 §4）
  line(sep);

  // ── 支払 ──
  for (const p of payments) {
    line(padLine(METHOD_JA[p.method] ?? p.method, yen(p.amount)));
    if (p.method === "cash" && p.tendered != null && p.tendered > 0) {
      line(padLine("お預かり", yen(p.tendered)));
      line(padLine("お釣り", yen(p.tendered - p.amount)));
    }
  }

  // ── フッタ ──
  if (store.footer) {
    line("");
    center(store.footer);
  }

  t.push(`<feed line="3"/>`);
  t.push(`<cut type="feed"/>`);

  return (
    `<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">` +
    t.join("") +
    `</epos-print>`
  );
}
