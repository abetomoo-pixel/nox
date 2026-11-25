// verify:nox-first-visit（★0210＝起票140 ホストの初回料金・相談役 11/25 の決め）— DB に触れない純関数と画面の配線の照合（f0 の鎖には入れていない）。
//   (1) 新旧の差 0：込みの行（all_in）が無い伝票は、請求（groupDueFull）・内訳（dueBreakdownOf）・支払方法の割引の見込み・レシートが 0210 より前と同じ（乱数 1 万件・固定の写しと比べる）
//   (2) 込みの行の請求＝DB check_group_due（0210）と同じ式（VESPER と同じ設定の例＝1,500・3,000・4,500・1,000・割引の超え・合計からの割引で丸め直さない）
//   (3) レシート（案 R1）：込みの行があると税込みの書き方・列の和が合計・込みの行が無いと 1 バイト同じ
//   (4) 札と柵：10 分前に黄色・0 分で赤・無制限は数えない・延長の柵と切り替え・既定の区分・来店の注意・行の名前
//   (5) 配線：旗 false の既定・旗の後ろでだけ新しい関数を呼ぶ
//   ★0210 版 2（相談役 11/25 の便 F【F5】）: (2-12〜14) 通常分が手数料だけなら丸めない・(3-6) 案 R1 は旗 FIRST_VISIT_RECEIPT_R1 の後ろ・(6) 当たらない並びの判定と保存の柵・(7) 2 店目への写しの鍵
import fs from "node:fs";
import { groupDue, roundAmount, taxRound, groupDueFull, dueBreakdownOf, type DueLine, type CheckDueSettings, type CheckRoundSettings, type DueBreakdown } from "../lib/nox/check-calc";
import { buildReceiptXml, type ReceiptInput, type ReceiptLine } from "../lib/nox/receipt";
import { payDiscountPreviewOf } from "../lib/nox/rules-0175/pay-discount";
import { openEstimateOf, type EstimateRule } from "../lib/nox/register/open-estimate";
import { firstVisitBadgeOf, setLineNameOf, canExtendOf, canSwitchToExtendOf, defaultOpenCategoryOf, visitNoteOf, overdueTablesOf, firstVisitErrJa, FIRST_VISIT_WARN_MIN, firstVisitShadowsOf, firstVisitShadowBlockOf, ruleCoversOf, FIRST_VISIT_SHADOW_JA, firstVisitPartialShadowsOf, FIRST_VISIT_PARTIAL_NOTE_JA, FIRST_VISIT_ALL_IN_NOTE, type ShadowRule } from "../lib/nox/register/first-visit";
import { FIRST_VISIT_SALES_NOTE } from "../lib/nox/payroll/sales-basis";
import { MIG_0210_APPLIED, mig0210On, FIRST_VISIT_RECEIPT_R1, firstVisitReceiptR1On } from "../lib/nox/rules-0175/flag";
import { STORE_SETTING_KEYS } from "../lib/nox/ops/store-copy-keys";
import { roundYen } from "../lib/nox/money";

let n = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean, detail?: unknown) => { n++; if (!cond) fails.push(`${label} ${detail === undefined ? "" : JSON.stringify(detail).slice(0, 400)}`); };
void taxRound;

// ── 0210 より前の式の写し（main の lib/nox/check-calc.ts の groupDueFull／dueBreakdownOf を 1 字も変えずに固定＝新旧の差 0 を乱数で確かめる相手）──
function OLD_groupDueFull(lines: DueLine[], s: CheckDueSettings, referralCustomer = 0): number {
  const bx = lines.filter((l) => l.kind !== "discount").reduce((a, l) => a + l.line_total, 0) + referralCustomer; // ★0152: 客負担の紹介料を加算（DB v_bx）
  const disc = lines.filter((l) => l.kind === "discount" && l.fee_kind !== "pay_discount_total").reduce((a, l) => a + l.line_total, 0); // ★0187（便 CASH）: 「合計から」の割引（fee_kind 'pay_discount_total'）は小計から引かない＝最後に引く（DB v_disc と同式）
  const post = lines.filter((l) => l.kind === "discount" && l.fee_kind === "pay_discount_total").reduce((a, l) => a + l.line_total, 0); // ★0187: 「合計から」の割引（DB v_post）
  const net = Math.max(0, bx - disc);
  if (net === 0) return 0;
  // ★0173（裁定393・便 P173）: 支払手数料の行（fee_kind 'pay_fee'）はサ料の母数から除く＝DB check_group_due の v_pf と同じ（pay_fee 無しなら 1 バイト同値）
  const payFee = lines.filter((l) => l.kind !== "discount" && l.fee_kind === "pay_fee").reduce((a, l) => a + l.line_total, 0);
  const excluded = (s.price_display ?? "tax_included") === "tax_excluded"
    && (s.business_tax_status ?? "taxable") === "taxable";
  if (excluded) {
    const catOf = (l: DueLine) => l.tax_category ?? "taxable_10";
    const bx10 = lines.filter((l) => l.kind !== "discount" && catOf(l) === "taxable_10").reduce((a, l) => a + l.line_total, 0) + referralCustomer; // ★0152: 客負担の紹介料を taxable_10 基底に加算（DB v_bx10）
    const bx8 = lines.filter((l) => l.kind !== "discount" && catOf(l) === "taxable_8").reduce((a, l) => a + l.line_total, 0);
    const sv = roundYen(((net - payFee) * s.service_rate) / 100); // v_sv = round((v_net - v_pf) * v_rate / 100.0) と同式（★0173）
    const trnd = s.tax_rounding ?? "floor";
    const base10 = Math.max(0, bx10 - disc) + sv;
    const tax = taxRound((base10 * 10) / 100, trnd) + taxRound((bx8 * 8) / 100, trnd);
    return postOf(roundAmount(net + sv + tax, s.round_unit, s.round_mode), post, s);
  }
  if (payFee > 0) return postOf(roundAmount(net + roundYen(((net - payFee) * s.service_rate) / 100), s.round_unit, s.round_mode), post, s); // ★0173: 手数料行はサ料なし
  return postOf(groupDue(net, s), post, s); // 内税/exempt＝従来式（1バイト同値）
}
/** ★0187（便 CASH・事後承認 ② Agoora 10/27）: 「合計から」の割引＝丸めた合計から引いてから店の丸め規則でもう一度丸める（DB check_group_due の最後の式と同式・post 0 なら 1 バイト同値） */
const postOf = (pre: number, post: number, s: CheckRoundSettings): number => (post > 0 ? roundAmount(Math.max(0, pre - post), s.round_unit, s.round_mode) : pre);
function OLD_dueBreakdownOf(lines: DueLine[], s: CheckDueSettings, referralCustomer = 0): DueBreakdown {
  const due = OLD_groupDueFull(lines, s, referralCustomer);
  const post = lines.filter((l) => l.kind === "discount" && l.fee_kind === "pay_discount_total").reduce((a, l) => a + l.line_total, 0); // ★0187（便 CASH）: 「合計から」の割引
  const pre = post > 0 ? OLD_groupDueFull(lines.filter((l) => !(l.kind === "discount" && l.fee_kind === "pay_discount_total")), s, referralCustomer) : due; // 割引前の合計（丸め後）＝post 0 なら due
  const postRounding = post > 0 ? due - (pre - post) : 0; // ★0187（事後承認 ②）: 引いてからもう一度丸めた差
  const bx = lines.filter((l) => l.kind !== "discount").reduce((a, l) => a + l.line_total, 0) + referralCustomer;
  const disc = lines.filter((l) => l.kind === "discount" && l.fee_kind !== "pay_discount_total").reduce((a, l) => a + l.line_total, 0);
  const net = Math.max(0, bx - disc);
  const payFee = lines.filter((l) => l.kind !== "discount" && l.fee_kind === "pay_fee").reduce((a, l) => a + l.line_total, 0);
  const excluded = (s.price_display ?? "tax_included") === "tax_excluded" && (s.business_tax_status ?? "taxable") === "taxable";
  if (net === 0) return { excluded, net: 0, service: 0, tax: 0, rounding: 0, due: 0, payFee, postDiscount: 0, postRounding: 0 };
  const service = roundYen(((net - payFee) * s.service_rate) / 100);
  if (excluded) {
    const catOf = (l: DueLine) => l.tax_category ?? "taxable_10";
    const bx10 = lines.filter((l) => l.kind !== "discount" && catOf(l) === "taxable_10").reduce((a, l) => a + l.line_total, 0) + referralCustomer;
    const bx8 = lines.filter((l) => l.kind !== "discount" && catOf(l) === "taxable_8").reduce((a, l) => a + l.line_total, 0);
    const trnd = s.tax_rounding ?? "floor";
    const tax = taxRound(((Math.max(0, bx10 - disc) + service) * 10) / 100, trnd) + taxRound((bx8 * 8) / 100, trnd);
    return { excluded, net, service, tax, rounding: pre - (net + service + tax), due, payFee, postDiscount: post, postRounding };
  }
  const taxIn = (s.business_tax_status ?? "taxable") === "taxable" ? Math.floor((due * 10) / 110) : 0;
  return { excluded, net, service, tax: taxIn, rounding: pre - (net + service), due, payFee, postDiscount: post, postRounding };
}

// ── 乱数（再現できる種） ──
let seed = 20261125;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const KINDS = ["time", "charge", "drink", "champ", "bottle", "custom", "set", "food"];
const randLines = (allInMark: "none" | "false" | "null"): DueLine[] => {
  const k = 1 + Math.floor(rnd() * 7); const ls: DueLine[] = [];
  for (let i = 0; i < k; i++) {
    const disc = rnd() < 0.18;
    const l: DueLine = disc
      ? { kind: "discount", line_total: Math.floor(rnd() * 8000), fee_kind: pick([null, "pay_discount", "pay_discount_total", null]), tax_category: "taxable_10" }
      : { kind: pick(KINDS), line_total: Math.floor(rnd() * 30000), fee_kind: pick([null, null, "set", "extension", "pay_fee", "vip_charge"]), tax_category: pick(["taxable_10", "taxable_10", "taxable_8", "exempt", null]) };
    if (allInMark === "false") l.all_in = false;
    if (allInMark === "null") l.all_in = null;
    ls.push(l);
  }
  return ls;
};
const randSettings = (): CheckDueSettings => ({
  service_rate: pick([0, 10, 20, 30, 35]), round_unit: pick([1, 10, 100, 1000]), round_mode: pick(["up", "down", "round"]),
  business_tax_status: pick(["taxable", "taxable", "exempt", null]), price_display: pick(["tax_included", "tax_excluded", null]), tax_rounding: pick(["floor", "round", "ceil", null]),
});
const taxIn = (s: CheckDueSettings) => ({ business_tax_status: s.business_tax_status ?? undefined, price_display: s.price_display ?? undefined, tax_rounding: s.tax_rounding ?? undefined });

// (1) 新旧の差 0（1 万件）
let diffDue = 0, diffBrk = 0, diffPay = 0, diffRcpt = 0; const firstDiff: unknown[] = [];
for (let i = 0; i < 10000; i++) {
  const mark = pick(["none", "false", "null"] as const);
  const lines = randLines(mark); const s = randSettings(); const ref = rnd() < 0.2 ? Math.floor(rnd() * 5000) : 0;
  const a = groupDueFull(lines, s, ref), b = OLD_groupDueFull(lines, s, ref);
  if (a !== b) { diffDue++; if (firstDiff.length < 3) firstDiff.push({ lines, s, ref, a, b }); }
  if (JSON.stringify(dueBreakdownOf(lines, s, ref)) !== JSON.stringify(OLD_dueBreakdownOf(lines, s, ref))) diffBrk++;
  const due = b, paid = rnd() < 0.3 ? Math.floor(due * rnd()) : 0;
  const base = pick(["total", "subtotal"] as const);
  const pv = payDiscountPreviewOf({ method: "cash", mode: "auto", storeRate: 10, rateIn: null, manual: null, base, due, paid, lines, settings: s, referralCustomer: ref });
  const balance = Math.max(0, due - paid);
  const dnet = lines.filter((l) => l.kind !== "discount" && l.fee_kind !== "pay_fee").reduce((x, l) => x + l.line_total, 0) - lines.filter((l) => l.kind === "discount" && l.fee_kind !== "pay_discount_total").reduce((x, l) => x + l.line_total, 0);
  const oldDisc = balance > 0 ? (base === "subtotal" ? Math.round(((Math.max(0, dnet) * balance) / Math.max(due, 1)) * 10 / 100) : Math.round((balance * 10) / 100)) : 0;
  if (!pv || pv.disc !== oldDisc) diffPay++;
  const rl = lines.map((l) => ({ ...l, name_snapshot: "行", qty: 1, unit_price_snapshot: l.line_total, tax_category: l.tax_category ?? undefined })) as ReceiptLine[];
  const rin = (ls: ReceiptLine[]): ReceiptInput => ({ store: { name: "試走", address: "", tel: "", reg_no: "", footer: "" }, check: { id: "00000000-0000-0000-0000-000000000000", closed_at: "2026-11-25T12:00:00Z", nom_type: "free" }, payGroup: "A", lines: ls, payments: [], serviceRate: s.service_rate, groupDue: b, isReprint: false, taxSettings: taxIn(s) } as unknown as ReceiptInput);
  const noMark = rl.map((l) => { const c = { ...l } as Record<string, unknown>; delete c.all_in; return c as unknown as ReceiptLine; });
  if (buildReceiptXml(rin(rl)) !== buildReceiptXml(rin(noMark))) diffRcpt++;
}
ok("(1-1) 込みの行が無い伝票の請求（groupDueFull）＝0210 より前と同じ（1 万件・差 0）", diffDue === 0, { diffDue, firstDiff });
ok("(1-2) 内訳（dueBreakdownOf）も同じ（1 万件・差 0）", diffBrk === 0, diffBrk);
ok("(1-3) 支払方法の割引の見込み（合計から・小計から）も同じ（1 万件・差 0）", diffPay === 0, diffPay);
ok("(1-4) レシート：all_in が false／null／無いの違いで 1 バイトも変わらない（1 万件）", diffRcpt === 0, diffRcpt);

// (2) 込みの行の請求（VESPER と同じ＝サ 30%・外税 10%・1,000 円単位の切り上げ）
const V: CheckDueSettings = { service_rate: 30, round_unit: 1000, round_mode: "up", business_tax_status: "taxable", price_display: "tax_excluded", tax_rounding: "floor" };
const fv = (t: number): DueLine => ({ kind: "time", fee_kind: "set", line_total: t, tax_category: "taxable_10", all_in: true });
const dr = (t: number): DueLine => ({ kind: "custom", line_total: t, tax_category: "taxable_10" });
const dc = (t: number, fk: string | null = null): DueLine => ({ kind: "discount", line_total: t, fee_kind: fk, tax_category: "taxable_10" });
ok("(2-1) 1 名 1,500 税・サ込み＝1,500（今の式なら 1,500＋サ 450＋税 195＝2,145→3,000）", groupDueFull([fv(1500)], V) === 1500 && OLD_groupDueFull([fv(1500)], V) === 3000);
ok("(2-2) 2 名＝3,000", groupDueFull([fv(3000)], V) === 3000);
ok("(2-3) 1 名＋ドリンク 2,000＝2,860→3,000＋1,500＝4,500", groupDueFull([fv(1500), dr(2000)], V) === 4500);
ok("(2-4) 承認つき割引 500（通常分 0）＝込みの額から＝1,000", groupDueFull([fv(1500), dc(500)], V) === 1000);
ok("(2-5) ドリンク 2,000・割引 2,500＝超えた 500 を込みの額から＝1,000", groupDueFull([fv(1500), dr(2000), dc(2500)], V) === 1000);
ok("(2-6) 合計からの割引 300 は最後に引いて丸め直さない＝4,200", groupDueFull([fv(1500), dr(2000), dc(300, "pay_discount_total")], V) === 4200);
ok("(2-7) 内税の店（サ 20%・100 円の切り捨て）でも込みの額はそのまま＝ドリンク 3,333＋サ 667＝4,000＋1,500＝5,500", groupDueFull([fv(1500), dr(3333)], { service_rate: 20, round_unit: 100, round_mode: "down" }) === 5500);
const pv1 = payDiscountPreviewOf({ method: "cash", mode: "auto", storeRate: 10, rateIn: null, manual: null, base: "total", due: 4500, paid: 0, lines: [fv(1500), dr(2000)], settings: V });
ok("(2-8) 現金割引 10%（合計から）は込みの額に掛けない＝300・割引後 4,200（check_pay 0210 と同じ）", pv1?.disc === 300 && pv1?.newDue === 4200, pv1);
const pv2 = payDiscountPreviewOf({ method: "cash", mode: "auto", storeRate: 10, rateIn: null, manual: null, base: "subtotal", due: 4500, paid: 0, lines: [fv(1500), dr(2000)], settings: V });
ok("(2-9) 小計からの割引も込みの行を母数に入れない＝2,000 の 10%＝200", pv2?.disc === 200, pv2);
const bk = dueBreakdownOf([fv(1500), dr(2000)], V);
ok("(2-10) 内訳＝通常分（2,000・サ 600・税 260・端数 140）＋税・サ込み 1,500＝4,500", bk.net === 2000 && bk.service === 600 && bk.tax === 260 && bk.rounding === 140 && bk.allIn === 1500 && bk.due === 4500, bk);
const rules: EstimateRule[] = [{ id: "r1", fee_kind: "set", amount: 1500, duration_min: 60, seat_kind: null, dow_mask: null, time_from_min: null, time_to_min: null, category_id: "c1", billing_unit: "person", priority: -1, price_mode: "all_in" }];
const est = openEstimateOf({ store: { set_fee: 0, set_min: 60, time_per: "table", ...V, service_rate: 30, round_unit: 1000, round_mode: "up" }, rules, seatKind: "卓", categoryId: "c1", people: 2, ruleId: null, now: new Date("2026-11-25T12:00:00Z") });
ok("(2-11) 開卓の見込み＝税・サ込み 1,500×2 名＝3,000（きっかり）", est.breakdown.due === 3000 && est.setQty === 2, est.breakdown);
// ★0210 版 2（【F5】の直し）: 込みの行がある伝票で通常分が手数料の行（pay_fee）だけなら、手数料に店の丸めを掛けない（DB check_group_due 版 2 の v_bx − v_pf ≤ 0）
const fe = (t: number): DueLine => ({ kind: "charge", fee_kind: "pay_fee", line_total: t, tax_category: "taxable_10" });
ok("(2-12) 外税の店：込み 1,500＋カード手数料 150（通常分は手数料だけ）＝150＋税 15＋1,500＝1,665（丸めない・版 1 なら 1,000＋1,500＝2,500）", groupDueFull([fv(1500), fe(150)], V) === 1665, groupDueFull([fv(1500), fe(150)], V));
ok("(2-13) 内税の店（サ 20%・100 円の切り捨て）：込み 1,500＋手数料 150＝1,650（手数料にサ料なし・丸めない）", groupDueFull([fv(1500), fe(150)], { service_rate: 20, round_unit: 100, round_mode: "down" }) === 1650);
ok("(2-14) 通常分に手数料以外の行があれば今と同じく丸める＝ドリンク 2,000＋手数料 300（2,300＋サ 600＋税 290＝3,190→4,000）＋1,500＝5,500", groupDueFull([fv(1500), dr(2000), fe(300)], V) === 5500, groupDueFull([fv(1500), dr(2000), fe(300)], V));

// (3) レシート（案 R1）
const rcpt = (lines: ReceiptLine[], due: number, s: CheckDueSettings) => buildReceiptXml({ store: { name: "VESPER", address: "", tel: "", reg_no: "T1234567890123", footer: "" }, check: { id: "11111111-2222-3333-4444-555555555555", closed_at: "2026-11-25T14:00:00Z", nom_type: "free" }, payGroup: "A", lines, payments: [], serviceRate: s.service_rate, groupDue: due, isReprint: false, taxSettings: taxIn(s), allInLayout: "r1" } as unknown as ReceiptInput); // ★版 2: R1 は呼び手が "r1" を渡したときだけ
const rl1: ReceiptLine[] = [{ name_snapshot: "初回料金(60分) 税・サ込", qty: 1, unit_price_snapshot: 1500, line_total: 1500, kind: "time", fee_kind: "set", block_no: 0, tax_category: "taxable_10", all_in: true }, { name_snapshot: "ドリンク", qty: 1, unit_price_snapshot: 2000, line_total: 2000, kind: "custom", tax_category: "taxable_10" }];
const x1 = rcpt(rl1, 4500, V);
const yenOf = (label: string, xml: string) => { const m = new RegExp(label + "\\s+-?¥([\\d,]+)").exec(xml); return m ? Number(m[1].replace(/,/g, "")) : null; };
ok("(3-1) 明細に「初回料金(60分) 税・サ込」¥1,500・金額段に「税・サ込みの料金」¥1,500", x1.includes("初回料金(60分) 税・サ込") && yenOf("税・サ込みの料金", x1) === 1500);
ok("(3-2) 外税の店でも税込みの書き方＝「消費税(10%)」の行なし・「（内消費税10%）」floor(4,500×10/110)＝409 の 1 行", !x1.includes("消費税(10%)") && yenOf("（内消費税10%）", x1) === 409);
ok("(3-3) 通常分＝小計(通常分) 2,000・サービス料 600・消費税・端数調整 400（列の和が合計 4,500）", yenOf("小計\\(通常分\\)", x1) === 2000 && yenOf("サービス料\\(30%\\)", x1) === 600 && yenOf("消費税・端数調整", x1) === 400 && yenOf("合計", x1) === 4500, [yenOf("小計\\(通常分\\)", x1), yenOf("サービス料\\(30%\\)", x1), yenOf("消費税・端数調整", x1)]);
const x2 = rcpt([rl1[0], { name_snapshot: "割引", qty: 1, unit_price_snapshot: 500, line_total: 500, kind: "discount", tax_category: "taxable_10" }], 1000, V);
ok("(3-4) 割引 500（通常分 0）＝小計(通常分) 0・割引 -500・税・サ込み 1,500・合計 1,000（調整の行なし）", yenOf("小計\\(通常分\\)", x2) === 0 && yenOf("割引", x2) === 500 && !x2.includes("端数調整") && yenOf("合計", x2) === 1000);
const x3 = rcpt([{ ...rl1[0], all_in: false, name_snapshot: "セット料金(60分)" }, rl1[1]], 5000, V);
ok("(3-5) 込みの行が無い伝票は今の書き方（小計・消費税(10%)）", x3.includes("消費税(10%)") && !x3.includes("税・サ込みの料金") && !x3.includes("小計(通常分)"));
// ★0210 版 2（【F5】）: 案 R1 は税理士の答えが出るまで本番に出さない＝旗 FIRST_VISIT_RECEIPT_R1（既定 false）の後ろ。呼び手が "r1" を渡さなければ今の書き方
const x6 = buildReceiptXml({ store: { name: "VESPER", address: "", tel: "", reg_no: "T1234567890123", footer: "" }, check: { id: "11111111-2222-3333-4444-555555555555", closed_at: "2026-11-25T14:00:00Z", nom_type: "free" }, payGroup: "A", lines: rl1, payments: [], serviceRate: 30, groupDue: 4500, isReprint: false, taxSettings: taxIn(V) } as unknown as ReceiptInput);
ok("(3-6) 案 R1 は渡したときだけ＝渡さない（旗 false）と「税・サ込みの料金」「小計(通常分)」の段は出ない", !x6.includes("税・サ込みの料金") && !x6.includes("小計(通常分)") && x6.includes("消費税(10%)"));
const route0 = fs.readFileSync("app/api/print/poll/[store_token]/route.ts", "utf8");
ok("(3-7) 旗 FIRST_VISIT_RECEIPT_R1 の既定は false・印刷は 2 つの旗がそろったときだけ \"r1\" を渡す", FIRST_VISIT_RECEIPT_R1 === false && firstVisitReceiptR1On() === false && route0.includes('allInLayout: mig0210On() && firstVisitReceiptR1On() ? "r1" : null'));

// (4) 札と柵
const T0 = Date.parse("2026-11-25T12:00:00Z"), min = (m: number) => T0 + m * 60000;
const bd = (te: string, m: number, fvf = true) => firstVisitBadgeOf({ firstVisit: fvf, timeEnd: te, startedAtMs: T0, nowMs: min(m), setMin: 60 });
ok("(4-1) 時間で終わり：残り 30 分＝info「初回 あと 30 分で終了」", bd("end", 30)?.tone === "info" && bd("end", 30)?.label === "初回 あと 30 分で終了");
ok(`(4-2) 残り ${FIRST_VISIT_WARN_MIN} 分で黄色（50 分経過）・11 分は info`, bd("end", 50)?.tone === "warn" && bd("end", 49)?.tone === "info");
ok("(4-3) 0 分で赤「初回 時間です」・過ぎると「（N 分過ぎ）」", bd("end", 60)?.tone === "bad" && bd("end", 60)?.label === "初回 時間です" && bd("end", 75)?.label === "初回 時間です（15 分過ぎ）");
ok("(4-4) 時間無制限＝「初回 時間無制限」（数えない）", bd("unlimited", 500)?.label === "初回 時間無制限" && bd("unlimited", 500)?.tone === "info");
ok("(4-5) 延長に移る：セット中は「あと N 分で延長」・延長に入ったら null（今の赤い表示）", bd("extend", 55)?.label === "初回 あと 5 分で延長" && bd("extend", 61) === null);
ok("(4-6) 初回でない卓は null（今と同じ）", bd("end", 70, false) === null && bd("extend", 10, false) === null);
ok("(4-7) 延長の柵＝extend だけ延長できる・切り替えは店長以上で end のときだけ", canExtendOf("extend") && !canExtendOf("end") && !canExtendOf("unlimited") && canExtendOf(null) && canSwitchToExtendOf("end", true) && !canSwitchToExtendOf("end", false) && !canSwitchToExtendOf("unlimited", true));
ok("(4-8) 時間の卓＝時間で終わりで時間を過ぎた初回の卓だけ", overdueTablesOf([{ firstVisit: true, timeEnd: "end", startedAtMs: T0, setMin: 60 }, { firstVisit: true, timeEnd: "end", startedAtMs: min(30), setMin: 60 }, { firstVisit: true, timeEnd: "unlimited", startedAtMs: T0, setMin: 60 }, { firstVisit: false, timeEnd: "extend", startedAtMs: T0, setMin: 60 }], min(70)).length === 1);
ok("(4-9) 既定の区分＝初回でない区分の一番上・初回しか無い＝区分なし・印が無い（0210 より前）＝今と同じ先頭", defaultOpenCategoryOf([{ id: "f", name: "初回", first_visit: true }, { id: "n", name: "通常" }]) === "n" && defaultOpenCategoryOf([{ id: "f", name: "初回", first_visit: true }]) === "" && defaultOpenCategoryOf([{ id: "a", name: "A" }, { id: "b", name: "B" }]) === "a");
ok("(4-10) 来店の記録がある客で初回＝注意 1 行（止めない）・記録なし／初回でない＝null", !!visitNoteOf({ categoryFirstVisit: true, lastVisitAt: "2026-10-01T00:00:00Z" }) && visitNoteOf({ categoryFirstVisit: true, lastVisitAt: null }) === null && visitNoteOf({ categoryFirstVisit: false, lastVisitAt: "2026-10-01T00:00:00Z" }) === null);
ok("(4-11) 行の名前＝DB と同じ「初回料金(60分) 税・サ込」・base は「セット料金(60分)」", setLineNameOf(60, "all_in") === "初回料金(60分) 税・サ込" && setLineNameOf(90, "base") === "セット料金(90分)");
ok("(4-12) 例外の日本語（no extension・not end・first visit exists・not first visit・not set rule）", ["no extension", "not end", "first visit exists", "not first visit", "not set rule"].every((m) => !!firstVisitErrJa(m)) && firstVisitErrJa("forbidden") === null);
const sqlNames = fs.existsSync("docs/tmp/first_visit_1125/0210_first_visit_price.sql") ? fs.readFileSync("docs/tmp/first_visit_1125/0210_first_visit_price.sql", "utf8") : null;
ok("(4-13) 行の名前と柵の語が 0210 の本体と同じ（本体があるときだけ・main の置き場）", sqlNames === null || (sqlNames.includes("'初回料金(' || v_smin || '分) 税・サ込'") && sqlNames.includes("raise exception 'no extension'") && sqlNames.includes("raise exception 'not end'") && sqlNames.includes("raise exception 'first visit exists'")));

// (5) 配線
ok("(5-1) 旗 MIG_0210_APPLIED の既定は false", MIG_0210_APPLIED === false && mig0210On() === false);
const board = fs.readFileSync("app/(manage)/register/register-board.tsx", "utf8");
const rpcs = ["register_open_categories", "check_set_time_end"];
ok("(5-2) レジの新しい関数は旗の後ろでだけ呼ぶ", rpcs.every((r) => { const i = board.indexOf(`"${r}"`); return i > 0 && /mig0210On\(\)/.test(board.slice(Math.max(0, i - 600), i)); }), rpcs.map((r) => board.indexOf(`"${r}"`)));
ok("(5-3) 旗 false の間は区分を今と同じ直読（owner／manager だけ）", /from\("pricing_categories"\)/.test(board));
const card = fs.readFileSync("app/(manage)/master/pricing/first-visit-card.tsx", "utf8");
ok("(5-4) 料金のマスタ：印と 2 つの選択は set_pricing_category_first／set_pricing_rule_first・カードは旗の後ろ", /set_pricing_category_first/.test(card) && /set_pricing_rule_first/.test(card) && /mig0210On\(\)/.test(fs.readFileSync("app/(manage)/master/pricing/pricing-board.tsx", "utf8")));
const route = fs.readFileSync("app/api/print/poll/[store_token]/route.ts", "utf8");
ok("(5-5) 印刷はレシートに行の all_in を渡す（旗の後ろで列を読む）", /all_in/.test(route) && /mig0210On\(\)/.test(route));

// (6) ★0210 版 2（相談役 11/25 の便 F【F5】の決め）: 当たらない並び＝区分なしの有効なセットの行が並びで上・条件が重なる → マスタの保存で止める
const R = (o: Partial<ShadowRule> & { id: string }): ShadowRule => ({ fee_kind: "set", category_id: null, is_active: true, priority: 1, seat_kind: null, rank_id: null, dow_mask: null, time_from_min: null, time_to_min: null, price_mode: "base", time_end: "extend", ...o });
const CUT = 360;
const fF = R({ id: "f", category_id: "fv", priority: 2, price_mode: "all_in", time_end: "end" });
const gN = R({ id: "g", priority: 1 });
ok("(6-1) 区分なしの終日・全席の行が上（priority 1 < 2）＝初回の行の場面をすべて覆う＝当たらない", firstVisitShadowsOf([gN, fF], ["fv"], CUT).length === 1);
ok("(6-2) 初回の行が上（priority 0）／同じ並び（区分の行が先）＝当たる", firstVisitShadowsOf([gN, { ...fF, priority: 0 }], ["fv"], CUT).length === 0 && firstVisitShadowsOf([gN, { ...fF, priority: 1 }], ["fv"], CUT).length === 0);
ok("(6-3) 上の行が一部の場面だけ（VIP 席だけ・曜日の一部・時間帯の一部・ランク）＝残りの場面で当たる＝止めない（VIP の料金を別に持つ店）", firstVisitShadowsOf([{ ...gN, seat_kind: "VIP" }, fF], ["fv"], CUT).length === 0
  && firstVisitShadowsOf([{ ...gN, dow_mask: 0b0000011 }, fF], ["fv"], CUT).length === 0
  && firstVisitShadowsOf([{ ...gN, time_from_min: 1200, time_to_min: 1320 }, fF], ["fv"], CUT).length === 0
  && firstVisitShadowsOf([{ ...gN, rank_id: "r1" }, fF], ["fv"], CUT).length === 0
  && firstVisitShadowsOf([{ ...gN, seat_kind: "VIP" }, { ...fF, seat_kind: "VIP" }], ["fv"], CUT).length === 1 && firstVisitShadowsOf([{ ...gN, dow_mask: 0b0000111 }, { ...fF, dow_mask: 0b0000011 }], ["fv"], CUT).length === 1);
ok("(6-4) 時間帯は営業日の切替で比べる（20:00〜翌 02:00 は翌 00:00〜01:00 を覆う・翌 01:00〜03:00 は覆わない）・停止中の行と別の区分の行は数えない", ruleCoversOf({ ...gN, time_from_min: 1200, time_to_min: 120 }, { ...fF, time_from_min: 0, time_to_min: 60 }, CUT)
  && !ruleCoversOf({ ...gN, time_from_min: 1200, time_to_min: 120 }, { ...fF, time_from_min: 60, time_to_min: 180 }, CUT)
  && firstVisitShadowsOf([{ ...gN, is_active: false }, fF], ["fv"], CUT).length === 0 && firstVisitShadowsOf([{ ...gN, category_id: "other" }, fF], ["fv"], CUT).length === 0);
ok("(6-5) 2 つの選択が base／extend の行は柵の対象外（onlyChosen）・表示（onlyChosen=false）では数える", firstVisitShadowsOf([gN, { ...fF, price_mode: "base", time_end: "extend" }], ["fv"], CUT).length === 0 && firstVisitShadowsOf([gN, { ...fF, price_mode: "base", time_end: "extend" }], ["fv"], CUT, false).length === 1);
ok("(6-6) 保存の柵：新しく当たらなくなる保存は止める・前から当たらない行は止めない（並びを直す保存を通す）・初回の区分が無ければ止めない",
  firstVisitShadowBlockOf([gN, { ...fF, priority: 0 }], [gN, fF], ["fv"], CUT) === FIRST_VISIT_SHADOW_JA && firstVisitShadowBlockOf([gN, fF], [gN, fF], ["fv"], CUT) === null && firstVisitShadowBlockOf([gN, { ...fF, priority: 0 }], [gN, fF], [], CUT) === null
  && firstVisitShadowBlockOf([gN, { ...fF, price_mode: "base", time_end: "extend" }], [gN, fF], ["fv"], CUT) === FIRST_VISIT_SHADOW_JA);
ok("(6-7) DB の例外 first visit shadowed は同じ理由の日本語", firstVisitErrJa("first visit shadowed") === FIRST_VISIT_SHADOW_JA);
const cardSrc = fs.readFileSync("app/(manage)/master/pricing/first-visit-card.tsx", "utf8"), boardSrc = fs.readFileSync("app/(manage)/master/pricing/pricing-board.tsx", "utf8");
ok("(6-8) 料金のマスタ：カードの保存・帯の保存・帯の停止・並べ替えの前に柵を通す（理由を出して送らない）・税・サ込みは R1 の旗が false の間は選べない",
  cardSrc.includes("firstVisitShadowBlockOf(rules,") && cardSrc.includes("if (block) { setMsg({ text: block, bad: true }); return; }") && cardSrc.includes("!firstVisitReceiptR1On()")
  && (boardSrc.match(/shadowGuard\(/g) ?? []).length === 3 && boardSrc.includes("if (block) { setMErr(block); return; }") && (boardSrc.match(/if \(block\) \{ setMsg\(block\); return; \}/g) ?? []).length === 2);
const sqlV2 = fs.existsSync("docs/tmp/first_visit_1125/v2/0210_first_visit_price.sql") ? fs.readFileSync("docs/tmp/first_visit_1125/v2/0210_first_visit_price.sql", "utf8") : null;
ok("(6-9) 版 2 の本体と同じ語（本体があるときだけ・main の置き場）", sqlV2 === null || (sqlV2.includes("raise exception 'first visit shadowed'") && sqlV2.includes("if v_bx - v_pf <= 0 then return greatest(0, v_net + v_sv + v_tax + v_aeff - v_post)")));
// (7) ★0210 版 2: 2 店目への写し＝待遇の部分で first_visit_in_sales（区分の印と 2 つの選択は料金の部分＝store_copy_settings の本体）
ok("(7-1) 写す鍵の名簿：first_visit_in_sales は待遇（comp）", STORE_SETTING_KEYS.first_visit_in_sales?.part === "comp");
ok("(7-2) 版 2 の本体の写し（本体があるときだけ）＝区分の first_visit・行の price_mode／time_end・鍵 first_visit_in_sales", sqlV2 === null || (sqlV2.includes("c.is_active, c.first_visit from public.pricing_categories c") && sqlV2.includes("r.vip_ext_amount, r.price_mode, r.time_end") && sqlV2.includes("'default_plan_id','first_visit_in_sales','kind_back_rate'")));

// (8) ★0210 版 3（相談役 11/25 の便 G【G4】）
ok("(8-1) ①一部の場面だけ区分なしの行が先に当たる並び（VIP 席だけ・時間帯の一部）＝止めない・注意の対象・すべて覆う並びは注意でなく柵",
  firstVisitPartialShadowsOf([{ ...gN, seat_kind: "VIP" }, fF], ["fv"], CUT).length === 1 && firstVisitPartialShadowsOf([{ ...gN, time_from_min: 1200, time_to_min: 1320 }, fF], ["fv"], CUT).length === 1
  && firstVisitPartialShadowsOf([gN, fF], ["fv"], CUT).length === 0 && firstVisitPartialShadowsOf([{ ...gN, seat_kind: "VIP" }, { ...fF, priority: 0 }], ["fv"], CUT).length === 0
  && firstVisitShadowBlockOf([{ ...gN, seat_kind: "VIP" }, { ...fF, priority: 0 }], [{ ...gN, seat_kind: "VIP" }, fF], ["fv"], CUT) === null);
ok("(8-2) ①料金のマスタのカード：一部の場面の並びは注意の 1 行（保存は通す）", cardSrc.includes("firstVisitPartialShadowsOf(rules, [fc.id], cutMin)") && cardSrc.includes('data-first-visit-partial="1"') && FIRST_VISIT_PARTIAL_NOTE_JA.includes("保存はできます"));
ok("(8-3) ④料金のプレビュー（readers 34）：当たったセットの行が税・サ込みなら、セットの額にサ料と丸めを掛けない（旗の後ろ）",
  boardSrc.includes("const allInSet = mig0210On() && !!setRow &&") && boardSrc.includes("const svc = Math.round(netN * store.service_rate / 100);") && boardSrc.includes(": Math.floor(withSvc / u) * u) + allInSet;"));
const reportSrc = fs.readFileSync("app/(manage)/report/report-board.tsx", "utf8"), anaSrc = fs.readFileSync("app/(manage)/analytics/analytics-board.tsx", "utf8"), sbrSrc = fs.readFileSync("components/nox/sales-basis-rows.tsx", "utf8");
const noteMark = "mig0210On() ? `${FIRST_VISIT_ALL_IN_NOTE}";
ok("(8-4) ④注記（readers 27・36）：日報・分析・売上の基準に「初回料金は税・サ込みの額」の 1 文（旗の後ろ・旗 false の間は今の文のまま）",
  FIRST_VISIT_ALL_IN_NOTE.includes("税・サ込みの額") && reportSrc.includes(noteMark) && anaSrc.split(noteMark).length - 1 === 2
  && sbrSrc.includes('{SALES_BASIS_ROW_NOTE}{mig0210On() ? FIRST_VISIT_SALES_NOTE : ""}') && FIRST_VISIT_SALES_NOTE.includes("税・サ込みの額"));
const flagSrc = fs.readFileSync("lib/nox/rules-0175/flag.ts", "utf8");
ok("(8-5) ⑤R1 は税理士の確認済み（11/25）＝0210 を当てる便で true にしてよい・今は false のまま（旗の注）", FIRST_VISIT_RECEIPT_R1 === false && flagSrc.includes("税理士の確認済み（2026-11-25・R1 でよい）＝0210 を本番に当てる便で true にしてよい"));

if (fails.length) { console.error(fails.join("\n")); console.error(`verify:nox-first-visit NG ${fails.length}／${n}`); process.exit(1); }
console.log(`verify:nox-first-visit OK ${n}`);
