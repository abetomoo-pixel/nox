/*
 * verify:nox-0187 — 便 2（0187 の client・MIG_0187_APPLIED＝false の配下・2026-10-27 夜〜10/29）。
 *  (A) フラグ＝MIG_0187_APPLIED は false（手貼りの後に 1 行で true）・読み口 mig0187On はテストで差し替えられる。
 *  (B) 便 CASH の鏡（lib/nox/rules-0175/pay-discount.ts＋check-calc.ts）＝check_pay の割引額と check_group_due（事後承認 ②＝丸めた合計から引いてから店の丸め規則でもう一度丸める）。
 *      合計から／小計から・境界値＝丸め規則 3 種（down／up／round）×割引 10%×端数 1〜9 円（お支払額が丸め単位の倍数）・一部入金の後・率 100・指定額・なし・率 0・売掛。
 *      値は本番 BEGIN…ROLLBACK の試走（docs/tmp/t0187_rollback.mts 20/20）と同じ＝12,870／12,800／12,900／13,600／13,300（残 8,950）／12,900。
 *  (C) M-17＝受け取る額（payReceiveOf）と手数料 4 択（M-6）との共存・店設定「支払方法の調整」（payAdjustModeOf）・レシート（receipt.ts）の「割引(合計から)」行・dueBreakdownOf の postDiscount／postRounding。
 *  (D) 便 EXT の鏡（lib/nox/register/ext-guide.ts）＝ext_menu_pick と同じ順（時間帯つき→選択中→既定→並び）を fixture で固定し、**本番の延長パターンで突合**＝
 *      Postgres 直結の BEGIN…ROLLBACK で、0187 の ext_menu_build／ext_menu_pick（未適用なら tx 内に 0187 のファイルから一時作成・適用後は live）に
 *      デモ 6 店＋NOX-VERIFY-A1 の延長パターンを食わせ、長さごとの行の選び方が TS と 1 件も違わないことを確かめる（残留 0＝ROLLBACK）。
 *  (E) 配線の pin（逐語 grep）＝フラグ false なら check_pay に p_disc_* を送らない・割引欄／店設定／延長のご案内はフラグ配下・主ボタン中央（.nox-actions）・旧の手数料の内訳と長い説明行は撤去。
 *  使い方: npm run verify:nox-0187（env: SUPABASE_DB_URL＝(D) の突合・無ければ (D) は FAIL）
 */
import fs from "node:fs";
import pg from "pg";
import { pgTx } from "./fixtures-pgtx";
import { MIG_0187_APPLIED, __set0187ForTest, mig0187On } from "../lib/nox/rules-0175/flag";
import { dueBreakdownOf, groupDueFull, roundAmount, type CheckDueSettings, type DueLine } from "../lib/nox/check-calc";
import { buildReceiptXml } from "../lib/nox/receipt";
import {
  PAY_ADJUST_MODES, discountArgsOf, discountRateInputOf, dueAfterTotalDiscountOf, payAdjustHasDisc, payAdjustHasFee, payAdjustModeOf, payDiscountBaseOf, payDiscountKeyOf,
  payDiscountLineNameOf, payDiscountModesFor, payDiscountPreviewOf, payDiscountRatesOf, payDiscountRowTextOf, payReceiveLabelOf, payReceiveOf,
} from "../lib/nox/rules-0175/pay-discount";
import { FEE_RATE_MAX, FEE_RATE_MIN, FEE_RATE_STEP, feeAmountArgOf, feeRateEffectiveOf, feeRateStepOf, feeRateTextOf, payFeeNoteWithModeOf } from "../lib/nox/rules-0175/pay-fee";
import { cardGrossDefaultOf, cardGrossSplitOf, payFeeOf } from "../lib/nox/register/p173";
import { extGuideLabelOf, extGuidePriceOf, extGuideRowsOf, extMenuPickOf, extSnapIsNewOf, type ExtSnapItem } from "../lib/nox/register/ext-guide";
try { process.loadEnvFile(".env.local"); } catch { /* (D) で FAIL にする */ }

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;

async function main() {

// ── (A) フラグ ──
check("0187(A-1) MIG_0187_APPLIED＝true（2026-10-29 手貼り後＝sha16 15037e893c142cad・verify 全一致）・mig0187On はテストで差し替えられる", MIG_0187_APPLIED === true && mig0187On() === true && (__set0187ForTest(false), mig0187On() === false) && (__set0187ForTest(null), mig0187On() === true));

// ── (B) 便 CASH の鏡 ──
const S: CheckDueSettings = { service_rate: 30, round_unit: 1, round_mode: "down", business_tax_status: "taxable", price_display: "tax_excluded", tax_rounding: "floor" };
const L = (amt: number): DueLine[] => [{ kind: "custom", line_total: amt, tax_category: "taxable_10" }];
const SJ = { pay_discount_rates: { cash: 10 } };
const prev = (o: Partial<Parameters<typeof payDiscountPreviewOf>[0]> & { s?: CheckDueSettings; amt?: number }) => {
  const s = o.s ?? S; const lines = [...(o.lines ?? L(o.amt ?? 10000))]; const due = o.due ?? groupDueFull(lines, s);
  return payDiscountPreviewOf({ method: "cash", mode: "auto", storeRate: 10, rateIn: null, manual: null, base: "total", paid: 0, ...o, due, lines, settings: s });
};
{
  const p = prev({});
  check("0187(B-1) 合計から（既定）＝小計 10,000・サ 30%・外税 10%＝合計 14,300 → 現金 10%＝1,430 を最後に引く＝12,870・行＝pay_discount_total「現金割引 10%」（従来の過大 12,255 にならない）",
    p?.disc === 1430 && p.newDue === 12870 && p.newBalance === 12870 && p.feeKind === "pay_discount_total" && p.name === "現金割引 10%" && payDiscountRatesOf(SJ).cash === 10 && payDiscountBaseOf(SJ) === "total", p);
  const p2 = prev({ base: "subtotal" });
  check("0187(B-2) 小計から＝10,000×10%＝1,000 を引いてから税・サ＝9,000＋2,700＋1,170＝12,870・行＝pay_discount「現金割引 10%（小計から）」", p2?.disc === 1000 && p2.newDue === 12870 && p2.feeKind === "pay_discount" && p2.name === "現金割引 10%（小計から）", p2);
  const d100 = { ...S, round_unit: 100 };
  check("0187(B-3) 丸め 100 円切捨（事後承認 ②）＝合計から 14,300−1,430＝12,870→12,800／小計から 12,800・切上＝12,900・四捨五入＝12,900",
    prev({ s: d100 })?.newDue === 12800 && prev({ s: d100, base: "subtotal" })?.newDue === 12800 && prev({ s: { ...d100, round_mode: "up" } })?.newDue === 12900 && prev({ s: { ...d100, round_mode: "round" } })?.newDue === 12900,
    { down: prev({ s: d100 })?.newDue, sub: prev({ s: d100, base: "subtotal" })?.newDue, up: prev({ s: { ...d100, round_mode: "up" } })?.newDue, round: prev({ s: { ...d100, round_mode: "round" } })?.newDue });
  const p3 = prev({ s: d100, amt: 10090, mode: "rate", rateIn: 5 });
  check("0187(B-4) 丸め前が倍数でない＝小計 10,090（サ 3,027・税 1,311＝14,428→表示 14,400）・率を指定 5%＝720→14,400−720＝13,680→切捨 13,600（丸め前から引く 13,700 ではない）", groupDueFull(L(10090), d100) === 14400 && p3?.disc === 720 && p3.newDue === 13600 && p3.name === "現金割引 5%", p3);
  const p4 = prev({ s: d100, paid: 4350 });
  check("0187(B-5) 一部入金（4,350）の後の現金 10%＝残額 9,950×10%＝995→14,300−995＝13,305→切捨 13,300→残 8,950", p4?.disc === 995 && p4.newDue === 13300 && p4.newBalance === 8950, p4);
  const p5 = prev({ s: d100, base: "subtotal", amt: 10090 });
  check("0187(B-6) 小計から・切捨 100・小計 10,090＝割引 1,009→12,985→12,900", p5?.disc === 1009 && p5.newDue === 12900, p5);
  check("0187(B-7) 率 100＝割引 14,300→お支払額 0（0 clamp）・率 0 の店で店の率＝null（欄なし）・売掛＝null・なし＝割引 0 で請求は不変",
    prev({ mode: "rate", rateIn: 100 })?.newDue === 0 && prev({ storeRate: 0 }) === null && prev({ method: "ar" }) === null && prev({ mode: "none" })?.disc === 0 && prev({ mode: "none" })?.newDue === 14300);
  const m1 = prev({ mode: "manual", manual: 1000 }), m2 = prev({ mode: "manual", manual: 99999 });
  check("0187(B-8) 額を指定＝1,000（行「現金割引（指定）」・率なし）・残額超えは残額まで（RPC の bad disc_amount に当てない）", m1?.disc === 1000 && m1.name === "現金割引（指定）" && m1.rate === 0 && m2?.disc === 14300 && m2.newDue === 0, { m1, m2 });
  check("0187(B-9) 方法→キー＝cash／card／emoney・qr・other→other／ar＝null・行名＝カード割引・決済割引（check_pay と同じ）・率の表記＝10／7.5",
    payDiscountKeyOf("cash") === "cash" && payDiscountKeyOf("card") === "card" && payDiscountKeyOf("emoney") === "other" && payDiscountKeyOf("qr") === "other" && payDiscountKeyOf("ar") === null
    && payDiscountLineNameOf("card", 7.5, "total") === "カード割引 7.5%" && payDiscountLineNameOf("other", 10, "subtotal") === "決済割引 10%（小計から）");
  // 境界値＝丸め規則 3 種 × 割引 10% × 端数 1〜9 円（合計 10k・割引 k＝9k の一の位が 9〜1）
  for (const mode of ["down", "up", "round"] as const) {
    const s0: CheckDueSettings = { service_rate: 0, round_unit: 10, round_mode: mode, business_tax_status: "taxable", price_display: "tax_included" };
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => {
      const lines = L(10 * k); const due = groupDueFull(lines, s0); const p = prev({ s: s0, lines, due })!;
      const q = (10 * k - k) / 10; const exp = (mode === "down" ? Math.floor(q) : mode === "up" ? Math.ceil(q) : Math.round(q)) * 10;
      return { k, due, disc: p.disc, got: p.newDue, exp, viaFn: dueAfterTotalDiscountOf(due, p.disc, 10, mode), ok: due === 10 * k && p.disc === k && p.newDue === exp && p.newDue % 10 === 0 && dueAfterTotalDiscountOf(due, p.disc, 10, mode) === exp };
    });
    check(`0187(B-10 ${mode}) 丸め 10 円・割引 10%・端数 1〜9 円＝合計 10k−k を店の丸め規則でもう一度丸める＝お支払額が丸め単位の倍数（9 本）`, rows.every((r) => r.ok), rows.filter((r) => !r.ok));
  }
  const bd = dueBreakdownOf([...L(10000), { kind: "discount", fee_kind: "pay_discount_total", line_total: 1430, tax_category: "taxable_10" }], d100);
  check("0187(B-11) dueBreakdownOf＝合計 12,800・postDiscount 1,430・postRounding −70（12,870→12,800）・割引前の端数調整 0・小計／サ料／税は割引の影響なし", bd.due === 12800 && bd.postDiscount === 1430 && bd.postRounding === -70 && bd.rounding === 0 && bd.net === 10000 && bd.service === 3000 && bd.tax === 1300, bd);
  const bd0 = dueBreakdownOf(L(10000), d100);
  check("0187(B-12) 「合計から」の行が無ければ従来と同値（postDiscount 0・postRounding 0・due 14,300）", bd0.due === 14300 && bd0.postDiscount === 0 && bd0.postRounding === 0 && groupDueFull(L(10000), S) === 14300);
}

// ── (C) M-17・手数料 4 択との共存・店設定・レシート ──
{
  const rc = payReceiveOf({ method: "cash", balance: 14300, newBalance: 12800, fee: 0, feeText: null, disc: 1430, discText: "現金割引 ¥1,430（10%）" });
  check("0187(C-1) M-17 現金＝ラベル「現金でのお支払額」・赤字＝割引後の残額 12,800・内訳「残額 ¥14,300−現金割引 ¥1,430（10%）−丸め ¥70」", rc.label === "現金でのお支払額" && rc.amount === 12800 && rc.note === "残額 ¥14,300−現金割引 ¥1,430（10%）−丸め ¥70", rc);
  const rc2 = payReceiveOf({ method: "card", balance: 14300, newBalance: 14300, fee: 1430, feeText: "10%", disc: 0, discText: null });
  check("0187(C-2) M-17 カード＝「カードでのお支払額」15,730・内訳「残額 ¥14,300＋手数料 ¥1,430（10%）」", rc2.label === "カードでのお支払額" && rc2.amount === 15730 && rc2.note === "残額 ¥14,300＋手数料 ¥1,430（10%）", rc2);
  const rc3 = payReceiveOf({ method: "other", balance: 14300, newBalance: 14300, fee: 0, feeText: null, disc: 0, discText: null });
  check("0187(C-3) M-17 その他＝「残額」14,300・内訳なし／売掛も「残額」／電子マネー・QR は方法名つき", rc3.label === "残額" && rc3.amount === 14300 && rc3.note === null && payReceiveLabelOf("ar") === "残額" && payReceiveLabelOf("emoney") === "電子マネーでのお支払額" && payReceiveLabelOf("qr") === "QR 決済でのお支払額");
  const rc4 = payReceiveOf({ method: "card", balance: 14300, newBalance: 13585, fee: 0, feeText: "なし", disc: 715, discText: "カード割引 ¥715（指定 5%）" });
  check("0187(C-4) 手数料 4 択との共存＝手数料「なし」＋カード割引 指定 5%＝内訳に両方（＋手数料 ¥0（なし）−カード割引 ¥715（指定 5%））・額＝13,585", rc4.amount === 13585 && rc4.note === "残額 ¥14,300＋手数料 ¥0（なし）−カード割引 ¥715（指定 5%）", rc4);
  const args = [discountArgsOf("auto", null, null, 14300), discountArgsOf("none", null, null, 14300), discountArgsOf("rate", null, 5, 14300), discountArgsOf("rate", null, null, 14300), discountArgsOf("manual", 1000, null, 14300), discountArgsOf("manual", 99999, null, 14300)];
  check("0187(C-5) check_pay の引数＝店の率は送らない／なし p_disc_amount 0／率を指定 p_disc_rate 5（未入力は送らない）／額を指定 p_disc_amount（残額まで）・手数料の p_fee_amount とキーが重ならない",
    J(args) === J([{}, { p_disc_amount: 0 }, { p_disc_rate: 5 }, {}, { p_disc_amount: 1000 }, { p_disc_amount: 14300 }]) && feeAmountArgOf("none", null, 14300) === 0 && !("p_fee_amount" in args[2]), args);
  check("0187(C-6) 割引の方式＝店長以上は 4 択・スタッフは店の率だけ（事後承認 ④）・行の文言＝店の率／指定 n%／なし／指定",
    J(payDiscountModesFor(true)) === J(["auto", "rate", "manual", "none"]) && J(payDiscountModesFor(false)) === J(["auto"])
    && payDiscountRowTextOf({ key: "cash", disc: 1430, rate: 10, mode: "auto" }) === "現金割引 ¥1,430（10%）" && payDiscountRowTextOf({ key: "cash", disc: 715, rate: 5, mode: "rate" }) === "現金割引 ¥715（指定 5%）"
    && payDiscountRowTextOf({ key: "cash", disc: 0, rate: 0, mode: "none" }) === "現金割引 ¥0（なし）" && payDiscountRowTextOf({ key: "card", disc: 500, rate: 0, mode: "manual" }) === "カード割引 ¥500（指定）");
  check("0187(C-7) 店設定「支払方法の調整」＝なし／カード手数料／現金割引／両方（現値から決める）・率の入力＝空欄 0・10.5 可・10.55／101 は不正",
    J(PAY_ADJUST_MODES) === J(["none", "fee", "disc", "both"]) && payAdjustModeOf({ feeOn: false, discOn: false }) === "none" && payAdjustModeOf({ feeOn: true, discOn: false }) === "fee" && payAdjustModeOf({ feeOn: false, discOn: true }) === "disc" && payAdjustModeOf({ feeOn: true, discOn: true }) === "both"
    && payAdjustHasFee("both") && payAdjustHasDisc("disc") && !payAdjustHasFee("disc") && discountRateInputOf("") === 0 && discountRateInputOf("10.5") === 10.5 && discountRateInputOf("10.55") === null && discountRateInputOf("101") === null);
  const note = payFeeNoteWithModeOf("card", 14300, { card: 10, emoney: 0, other: 0 }, "none", null, 14300);
  check("0187(C-8) M-6 の手数料の行（なし）は従来どおり（fee 0・mode none）＝割引欄と独立", note?.fee === 0 && note.mode === "none" && note.receive === 14300, note);
  const rIn = { store: { name: "店", address: "", tel: "", reg_no: "", footer: "" }, check: { id: "0187abcd-0000-0000-0000-000000000000", closed_at: "2026-10-27T15:00:00Z", nom_type: "free" }, payGroup: "A", payments: [{ method: "cash", amount: 12800, tendered: 13000 }], serviceRate: 30, isReprint: false, taxSettings: { business_tax_status: "taxable", price_display: "tax_excluded", tax_rounding: "floor" } };
  const lineA = { name_snapshot: "セット", qty: 1, unit_price_snapshot: 10000, line_total: 10000, kind: "set", tax_category: "taxable_10" };
  const xmlPost = buildReceiptXml({ ...rIn, lines: [lineA, { name_snapshot: "現金割引 10%", qty: 1, unit_price_snapshot: 1430, line_total: 1430, kind: "discount", tax_category: "taxable_10", fee_kind: "pay_discount_total" }], groupDue: 12800 });
  const xmlNone = buildReceiptXml({ ...rIn, lines: [lineA], groupDue: 14300 });
  check("0187(C-9) レシート＝「合計から」の割引は小計から引かず（サービス料 3,000・消費税 1,300 は不変）、消費税の後に「割引(合計から) -¥1,430」・合計 12,800・端数調整 -¥70（引いてから丸めた差）。行が無ければ従来どおり（割引(合計から) なし）",
    xmlPost.includes("割引(合計から)") && xmlPost.includes("-¥1,430") && xmlPost.includes("¥3,000") && xmlPost.includes("¥1,300") && xmlPost.includes("¥12,800") && xmlPost.includes("端数調整") && xmlPost.includes("-¥70") && xmlPost.indexOf("消費税(10%)") < xmlPost.indexOf("割引(合計から)")
    && !xmlNone.includes("割引(合計から)") && !xmlNone.includes("端数調整") && xmlNone.includes("¥14,300"), { post: xmlPost.slice(xmlPost.indexOf("小計"), xmlPost.indexOf("合計") + 40) });
}

// ── (D) 便 EXT の鏡（fixture）──
const BAND = (from: number, to: number) => ({ from, to });
const SNAP: ExtSnapItem[] = [
  { rule_id: "R1", duration_min: 30, amount: 2000, label: "延長 30分 ¥2000", is_default: true, band: null },
  { rule_id: "R2", duration_min: 30, amount: 1500, label: "延長 30分 ¥1500", is_default: false, band: BAND(768, 878) },
  { rule_id: "R3", duration_min: 30, amount: 9999, label: "延長 30分 ¥9999", is_default: false, band: BAND(878, 938) },
  { rule_id: "R5", duration_min: 60, amount: 3500, label: "延長 60分 ¥3500", is_default: false, band: null },
  { rule_id: "R6", duration_min: 60, amount: 3000, label: "延長 60分 ¥3000", is_default: false, band: null },
];
{
  const rows = (bm: number, prefer: string | null = null) => extGuideRowsOf(SNAP, bm, prefer).map((r) => `${r.duration}:${r.item.rule_id}`);
  check("0187(D-1) 時間帯に合う行を長さごとに 1 行＝818 分（R2 の帯）→30:R2・60:R5（帯なしの先頭）／900→30:R3／1,100（帯の外）→30:R1（既定）／選択中 R6＝60:R6（既定より後・帯より前の順）",
    J(rows(818)) === J(["30:R2", "60:R5"]) && J(rows(900)) === J(["30:R3", "60:R5"]) && J(rows(1100)) === J(["30:R1", "60:R5"]) && J(rows(1100, "R6")) === J(["30:R1", "60:R6"]) && J(rows(818, "R1")) === J(["30:R2", "60:R5"]), { a: rows(818), b: rows(900), c: rows(1100), d: rows(1100, "R6") });
  const old = [{ rule_id: "R1", duration_min: 30, amount: 2000, label: "延長 30分 ¥2000" }];
  check("0187(D-2) 旧い凍結（band キーなし＝0187 前に開いた伝票）＝案内なし・pick null／空＝なし／新しい形の判定", J(extGuideRowsOf(old, 818, null)) === "[]" && extMenuPickOf(old, 818, null, 30) === null && J(extGuideRowsOf([], 818, null)) === "[]" && extSnapIsNewOf(SNAP) && !extSnapIsNewOf(old) && !extSnapIsNewOf(null));
  check("0187(D-3) 金額＝会計と同じ関数（groupDueFull）の差＝2 名×¥2,000＝4,000→サ 1,200・税 520＝5,720（1 名＝2,860）・ラベル「延長 30分」",
    extGuidePriceOf(L(10000), S, 0, 2000, 2) === 5720 && extGuidePriceOf(L(10000), S, 0, 2000, 1) === 2860 && extGuideLabelOf(30) === "延長 30分");
}

// ── (D') 本番の延長パターンで突合（BEGIN…ROLLBACK・残留 0）──
{
  const url = process.env.SUPABASE_DB_URL;
  if (!url) check("0187(D-4) 本番の延長パターンで突合＝SUPABASE_DB_URL が無い", false, "no env");
  else {
    const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await c.connect();
    const tx = pgTx(c);
    let detail: unknown = null;
    try {
      await c.query("begin");
      await c.query("set local statement_timeout = '60s'");
      const have = (await tx.one<{ n: string }>(`select count(*)::text n from pg_proc where pronamespace = 'public'::regnamespace and proname in ('ext_menu_build','ext_menu_pick')`))!.n;
      let source = "live";
      if (have !== "2") { // 0187 未適用＝tx 内に 0187 のファイルから一時作成（ROLLBACK で消える・表のロックなし）
        const mig = src("supabase/migrations/0187_cash_ext_menu.sql");
        const fn = (name: string) => { const m = mig.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$;`)); if (!m) throw new Error("0187 に " + name + " が無い"); return m[0]; };
        await c.query(fn("ext_menu_build")); await c.query(fn("ext_menu_pick")); source = "0187 file (tx)";
      }
      const stores = await tx.q<{ id: string; name: string; ext_min: number; time_per: string; has_vip: boolean }>(`select s.id, s.name, s.ext_min, s.time_per, exists (select 1 from public.seats x where x.store_id = s.id and x.is_active and x.kind = 'VIP') has_vip from public.stores s join public.orgs o on o.id = s.org_id where o.name like 'NOX-DEMO-%' or s.name = 'NOX-VERIFY-A1' order by s.name`);
      let cmp = 0, diff: string[] = [], snaps = 0, multi = 0;
      for (const st of stores) {
        for (const [seat, vip] of [["卓", false], ["VIP", true]] as [string, boolean][]) {
          if (vip && !st.has_vip) continue;
          for (const off of [0, 4, 8, 12]) {
            const at = `now() + interval '${off} hours'`;
            const r = await tx.one<{ snap: ExtSnapItem[]; bm: number }>(`select public.ext_menu_build($1, $2, null, ${at}, $3, $4, $5) snap, (select b.biz_min from public.biz_minutes_of($1, ${at}) b) bm`, [st.id, seat, st.ext_min, st.time_per, vip]);
            const snap = r?.snap ?? []; if (!snap.length) continue;
            snaps++; if (snap.length >= 2) multi++;
            const durs = [...new Set(snap.map((m) => m.duration_min))].sort((a, b) => a - b);
            const sqlRows: string[] = [];
            for (const d of durs) { const p = await tx.one<{ p: ExtSnapItem | null }>(`select public.ext_menu_pick($1::jsonb, $2, null, $3) p`, [J(snap), r!.bm, d]); if (p?.p) sqlRows.push(`${d}:${p.p.rule_id}`); }
            const tsRows = extGuideRowsOf(snap, r!.bm, null).map((x) => `${x.duration}:${x.item.rule_id}`);
            cmp++; if (J(sqlRows) !== J(tsRows)) diff.push(`${st.name}/${seat}/+${off}h: sql ${J(sqlRows)} ts ${J(tsRows)}`);
            // 選択中のパターン＝snap の各行を prefer にしても一致
            for (const m of snap) { const p = await tx.one<{ p: ExtSnapItem | null }>(`select public.ext_menu_pick($1::jsonb, $2, $3::uuid, $4) p`, [J(snap), r!.bm, m.rule_id, m.duration_min]); const t = extMenuPickOf(snap, r!.bm, m.rule_id, m.duration_min); cmp++; if ((p?.p?.rule_id ?? null) !== (t?.rule_id ?? null)) diff.push(`${st.name}/${seat}/+${off}h prefer ${m.rule_id}: sql ${p?.p?.rule_id} ts ${t?.rule_id}`); }
          }
        }
      }
      detail = { source, stores: stores.length, snaps, multi, cmp, diff: diff.slice(0, 5) }; console.log("0187(D-4) 突合", J(detail));
      check(`0187(D-4) 本番の延長パターンで突合（${source}・店 ${stores.length}・凍結 ${snaps}・2 行以上 ${multi}・比較 ${cmp}）＝ext_menu_pick と TS の行の選び方が 1 件も違わない`, stores.length >= 6 && snaps >= 6 && multi >= 1 && cmp >= 20 && diff.length === 0, detail);
    } catch (e) {
      check("0187(D-4) 本番の延長パターンで突合（例外）", false, (e as Error).message);
    } finally {
      await c.query("rollback").catch(() => undefined);
      const after = (await c.query(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace and proname in ('ext_menu_build','ext_menu_pick')`)).rows[0].n as number;
      const live = MIG_0187_APPLIED ? 2 : 0;
      check("0187(D-5) 残留 0＝ROLLBACK の後の ext_menu_build／ext_menu_pick の本数がフラグと一致（未適用 0・適用後 2）", after === live, { after, live });
      await c.end();
    }
  }
}

// ── (E) 配線の pin（逐語 grep）──
{
  const rb = src("app/(manage)/register/register-board.tsx"), sp = src("app/(manage)/master/store-profile-panel.tsx"), css = src("app/globals.css"), fl = src("lib/nox/rules-0175/flag.ts");
  check("0187(E-1) check_pay の引数＝フラグ true かつ割引キーのある方法だけ p_disc_rate／p_disc_amount（店の率＝送らない・上限は割引前の残額 balance0）・成功時に方式を既定へ戻す",
    rb.includes("...(mig0187On() && payDiscountKeyOf(payMethod) && payDiscountRates[payDiscountKeyOf(payMethod)!] > 0 ? discountArgsOf(discMode, /^\\d+$/.test(discManual) ? Number(discManual) : null, feeRateInputOf(discRateIn), over?.balance0 ?? over?.balance ?? (over ? over.amount : payAmount)) : {}),") && rb.includes('setDiscMode("auto"); setDiscManual(""); setDiscRateIn(""); /* ★0187: 方法を替えたら割引の方式は既定へ')
    && rb.includes('setDiscMode("auto"); setDiscManual(""); setDiscRateIn("");') && rb.includes("tendered: isCash ? enteredN : null, balance, balance0 })") && fl.includes("export const MIG_0187_APPLIED = true; // ★2026-10-29: 0187（sha16 15037e893c142cad）"));
  check("0187(E-2) 入金モーダル＝割引欄はフラグ true かつ店の率 > 0 の方法（discOn）だけ・M-6 と同じ部品（4 択・率／額の入力・店長以上）・残額は割引後（balance＝newBalance）・割引対象の注記",
    rb.includes("const discOn = mig0187On() && discKey !== null && discRate0 > 0;") && rb.includes("const balance = discPrev ? discPrev.newBalance : balance0;") && rb.includes('data-pay-disc-row="1"') && rb.includes("{payDiscountModesFor(isManagerUp).map((m) => (")
    && rb.includes('data-disc-rate-input="1"') && rb.includes('data-disc-manual-input="1"') && rb.includes("割引対象＝{PAY_DISCOUNT_BASE_SHORT[payDiscountBase]}") && rb.includes("settings: dueSettingsOf(check, estStore, rules0175On())"));
  check("0187(E-3) M-17＝受け取る額の枠（data-pay-receive）＝ラベルは方法ごと・赤字 26px・内訳 1 行（手数料・割引の欄に即時追随）・均等割りの 1 人分・旧の「残額」行と手数料の内訳と長い説明行は撤去",
    rb.includes('data-pay-receive="1"') && rb.includes("const rc = payReceiveOf({ method: payMethod, balance: balance0, newBalance: balance, fee: feeAmt, feeText, disc: discPrev?.disc ?? 0, discText, base: payDiscountBase });") && rb.includes('{oneOf !== null ? "1 人分（手数料込み）" : rc.label}')
    && rb.includes('data-pay-receive-note="1"') && !rb.includes('data-pay-fee="1"') && !rb.includes("入金額は残額（") && !rb.includes("既定は残額＋カード手数料（") && !rb.includes("<span style={{ fontWeight: 800 }}>残額</span>"));
  check("0187(E-4) 延長のご案内＝フラグ true かつ案内の行がある伝票だけ（backbar と時間料金（手動）カード＝.nox-actions 中央）・全画面（.nox-extguide・大きな文字・内部情報なし）・行をタップ→確認 1 回→check_extension_add(p_rule_id)・自動延長の店は表示だけ・閉じるで戻る",
    rb.split('data-ext-guide-open="1"').length - 1 === 2 && rb.includes('<div className="nox-actions" style={{ marginTop: 8 }}><button type="button" style={btnLight} data-ext-guide-open="1"') && rb.includes("const extGuideRows = check && mig0187On() ? extGuideRowsOf(")
    && rb.includes('<div className="nox-extguide" role="dialog" aria-modal="true" aria-label="延長のご案内" data-ext-guide="1">') && rb.includes('const canAdd = timeMode === "manual" && check.status === "open" && payments.length === 0;')
    && rb.includes('void addExtension(id, "time"); }}>追加する</button>') && rb.includes('data-ext-guide-close="1"') && rb.includes("延長は自動で加算されます"));
  check("0187(E-5) 主ボタン中央＝全画面の確認（やめる／追加する）と閉じるは .nox-actions・CSS で中央（390／1,280 とも）・行は全幅 1 列・390 は文字を小さく",
    rb.includes('<div className="nox-actions">\n                  <button type="button" className="nox-extguide-x" onClick={() => setExtGuideConfirm(null)}>やめる</button>') && rb.includes('<div className="nox-actions"><button type="button" className="nox-extguide-x" data-ext-guide-close="1"')
    && css.includes(".nox-extguide .nox-actions { display: flex; justify-content: center; gap: 12px; width: min(560px, 100%); }") && css.includes(".nox-extguide-rows { display: grid; grid-template-columns: 1fr; gap: 12px; width: min(560px, 100%); }") && css.includes("@media (max-width: 600px) { .nox-extguide { gap: 14px; } .nox-extguide-h { font-size: 26px; }"));
  check("0187(E-6) 店設定「支払方法の調整」＝フラグ true だけ（data-pay-adjust・4 択・現金割引の率・割引対象）・手数料率の欄は従来どおり（フラグ false）か「手数料あり」のときだけ・patch は pay_discount_rates を丸ごと＋pay_discount_base（フラグ false は送らない）・率の先回り検査",
    sp.includes('{on("profile") && mig0187On() && <div style={{ minWidth: 0, gridColumn: "1 / -1" }} data-pay-adjust="1">') && sp.includes('{on("profile") && (!mig0187On() || payAdjustHasFee(adj)) && <div style={{ minWidth: 0 }} data-pay-fee-rates="1">')
    && sp.includes("    if (mig0187On()) {\n      if (form.pay_disc_cash !== cur.pay_disc_cash) out.pay_discount_rates = { ...form.pay_disc_rates_raw, cash: discountRateInputOf(form.pay_disc_cash) ?? -1 };\n      if (form.pay_disc_base !== cur.pay_disc_base) out.pay_discount_base = form.pay_disc_base;\n    }")
    && sp.includes('data-pay-disc-cash="1"') && sp.includes('data-pay-disc-base="1"') && sp.includes('setMsg("現金割引の率は 0〜100（小数 1 桁まで）で入力してください"); return; }') && sp.includes("setAdj(payAdjustModeOf({ feeOn: PAY_FEE_KEYS.some((k) => p.pay_fee[k] !== \"\"), discOn: p.pay_disc_cash !== \"\" }));"));
}

// ── (F) M-17 追補（Agoora 2026-10-29・便 2 同乗）: 率を指定＝既定は店の率・−／＋ 0.5% 刻み 0〜20%・その場で反映・集計の手数料行・残額＋手数料・「なし」で戻る ──
{
  const steps = [feeRateStepOf(null, 1, 10), feeRateStepOf(10, 1, 10), feeRateStepOf(10, -1, 10), feeRateStepOf(7.5, -1, 10), feeRateStepOf(20, 1, 10), feeRateStepOf(0, -1, 10), feeRateStepOf(19.8, 1, 10), feeRateStepOf(null, -1, 0)];
  check("0187(F-1) 率の ±＝空欄は店の率を起点（10→10.5）・10→10.5／9.5・7.5→7・上限 20・下限 0・19.8→20（0.5 刻みで丸める）・店の率 0 から −＝0・定数 0.5／0／20",
    J(steps) === J([10.5, 10.5, 9.5, 7, 20, 0, 20, 0]) && FEE_RATE_STEP === 0.5 && FEE_RATE_MIN === 0 && FEE_RATE_MAX === 20 && feeRateEffectiveOf(null, 10) === 10 && feeRateEffectiveOf(7.5, 10) === 7.5 && feeRateTextOf(7.5) === "7.5" && feeRateTextOf(10) === "10", steps);
  // カードを選んだとき＝残額 31,400＋手数料 3,140（10%）＝34,540（お支払額・入金額の既定）・±1 回で 10.5%→3,297＝34,697・「なし」＝34,540→31,400（元の残額）
  const bal = 31400;
  const g10 = cardGrossDefaultOf(bal, feeRateEffectiveOf(null, 10)), g105 = cardGrossDefaultOf(bal, feeRateStepOf(null, 1, 10)), gNone = payFeeNoteWithModeOf("card", bal, { card: 10, emoney: 0, other: 0 }, "none", null, bal);
  const rcCard = payReceiveOf({ method: "card", balance: bal, newBalance: bal, fee: g10 - bal, feeText: "10%", disc: 0, discText: null });
  check("0187(F-2) カード＝入金額の既定・赤字＝残額＋手数料（31,400＋3,140＝34,540）・±1 回（10.5%）で 34,697 にその場で変わる・「なし」＝手数料 0 で 31,400 に戻る・内訳「残額 ¥31,400＋手数料 ¥3,140（10%）」・受取額の分解が往復で一致",
    g10 === 34540 && g105 === 34697 && gNone?.fee === 0 && gNone.receive === bal && rcCard.label === "カードでのお支払額" && rcCard.amount === 34540 && rcCard.note === "残額 ¥31,400＋手数料 ¥3,140（10%）" && J(cardGrossSplitOf(g10, bal, 10)) === J({ applied: bal, fee: 3140 }) && payFeeOf(bal, 10.5) === 3297, { g10, g105, gNone, rcCard });
  const rcCash = payReceiveOf({ method: "cash", balance: 14300, newBalance: 12800, fee: 0, feeText: null, disc: 1430, discText: "割引 ¥1,430（10%・合計から）", base: "total" });
  const rcSub = payReceiveOf({ method: "cash", balance: 30516, newBalance: 27464, fee: 0, feeText: null, disc: 2522, discText: "割引 ¥2,522（10%・小計から）", base: "subtotal" });
  check("0187(F-3) 現金も同じ型＝「現金でのお支払額」12,800・内訳「残額 ¥14,300−割引 ¥1,430（10%・合計から）−丸め ¥70」・小計から（live MUSE 10/29＝30,516→2,522→27,464）は「−サ・税の減り ¥530」", rcCash.label === "現金でのお支払額" && rcCash.amount === 12800 && rcCash.note === "残額 ¥14,300−割引 ¥1,430（10%・合計から）−丸め ¥70" && rcSub.note === "残額 ¥30,516−割引 ¥2,522（10%・小計から）−サ・税の減り ¥530", { rcCash, rcSub });
  const rb = src("app/(manage)/register/register-board.tsx"), sb = src("app/(manage)/master/stock/stock-board.tsx"), cp = src("components/ui/step-button.tsx"), css = src("app/globals.css");
  check("0187(F-4) 配線＝率を指定の既定は店の率（setFeeRateIn(feeRateTextOf(rate))）・−／＋は共通部品 StepBtn（C2-8 の棚卸しと同じ・長押し 400ms→120ms）・入力と ± は payCardGross を戻してその場で反映・実効の率（空欄＝店の率）を見込み・入金・完了文言の 3 か所で使う",
    rb.includes('if (m === "rate") setFeeRateIn(feeRateTextOf(rate)); /* ★M-17 追補 ①: 率を指定の既定＝店の率 */ }}>{payFeeModeButtonLabelOf(m, rate)}</button>') && rb.includes('data-fee-rate-stepper="1"') && rb.split('dataAttr="data-fee-rate-step"').length - 1 === 2
    && rb.includes("const feeRateEff = payFeeKeyOf(payMethod) ? feeRateEffectiveOf(feeRateN, payFeeRates[payFeeKeyOf(payMethod)!]) : 0;") && rb.includes('? feeRateEff : 0; // ★便 M-6')
    && rb.includes('{ rate: feeRateEffectiveOf(feeRateInputOf(feeRateIn), payFeeRates[payFeeKeyOf(payMethod) ?? "other"]), amount: over ? over.amount : payAmount })') && rb.includes("feeManualN, balance, feeRateEff); // ★便 P173")
    && rb.includes('import StepBtn from "@/components/ui/step-button";') && sb.includes('import StepBtn from "@/components/ui/step-button";') && !sb.includes("function StepBtn(") && cp.includes("setTimeout(() => { timer.current.i = setInterval(onStep, 120); }, 400)") && css.includes(".nox-step-btn { width: 40px; height: 34px;"));
  check("0187(F-5) 配線＝集計に手数料行（data-pay-summary-fee・なし＝行なし）と割引行（data-pay-summary-disc）・末尾の枠は撤去済みで注記 2 行は手数料の枠の下（data-pay-fee-notes）・内訳の割引は「割引 ¥c（n%・合計から／小計から）」",
    rb.includes('data-pay-summary-fee="1"') && rb.includes('data-pay-summary-disc="1"') && rb.includes("const feeRow = rules0175On() && feeK && payFeeRates[feeK] > 0 ? { amt: grossMode ? grossDefault - balance : (feeNote?.fee ?? 0), text:") && rb.includes('data-pay-fee-notes="1"') && rb.includes("手数料は伝票の行として残り、キャストの売上・ノルマ・歩合には含めません。併用時はこの方法で入金する分だけに掛かります。</span>{/* ★M-17 追補 ③")
    && !rb.includes('data-pay-fee="1"') && rb.includes('const discText = discPrev && (discPrev.disc > 0 || discMode0 !== "auto") ? `割引 ¥${discPrev.disc.toLocaleString()}（'));
}

if (fails.length) { console.log(`verify:nox-0187 FAIL ${fails.length} / pass ${pass}`); for (const f of fails) console.log(" - " + f.slice(0, 1500)); process.exit(1); }
console.log(`verify:nox-0187 OK ${pass} checks（便 2＝0187 の client・MIG_0187_APPLIED=true（2026-10-29 手貼り後）・CASH の鏡・M-17・EXT の鏡＝本番の延長パターンで突合）`);
}
void main();
