/*
 * verify:nox-x13g — 便 X13-G（2026-10-21）目視指摘（ACE 390px・iOS Safari）＋GV-C 残の係留。DB 不触（静的 pin＋純関数）。
 *   W-1 シートの重なり順・W-2〜W-4 お客様と指名区分・W-5／W-6 給与の操作と 390px・W-7 金種・W-8 日付・W-9 開発用の注記・W-10 縦積み・
 *   W-11 今日タブ・W-12 タブ 2 段と 3 桁区切り・W-13 控除・送り・W-14 VIP の見込み・W-15 外税の明示・W-16 ひな形・W-17 カード加算・W-18 payload・W-19 残
 */
import fs from "node:fs";
import { checkCustLineOf } from "../lib/nox/register/line-groups";
import { NIL_CHECK_ID } from "../components/nox/customer-pick-modal";
import { NOM_KIND_BADGE, nomKindBadgesOf } from "../components/nox/cast-picker";
import { groupedDigitsOf } from "../components/ui/grouped-number-input";
import { isSectionOn } from "../lib/nox/store-systems";
import { dueBreakdownOf, groupDueFull } from "../lib/nox/check-calc";
import { openEstimateOf, resolveRuleOf, bizClockOf, type EstimateRule } from "../lib/nox/register/open-estimate";
import { todayRowViewOf } from "../lib/nox/shift/today-row";
import { shiftPayload } from "../lib/nox/demo/dateshift";
import { DATED_TABLES } from "../lib/nox/demo/seed";

let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");
const css = src("app/globals.css"), modal = src("components/ui/modal.tsx"), reg = src("app/(manage)/register/register-board.tsx");

// W-1
check("x13g(1) W-1 ぼかしは暗幕の擬似要素・カードはその上の層（backdrop-filter の子孫にしない）・開いている間は背面をスクロールさせない",
  /\.nox-modal-overlay::before \{[^}]*-webkit-backdrop-filter: blur\(4px\);[^}]*pointer-events: none;/.test(css) && /\.nox-modal-card \{\s*position: relative;\s*z-index: 1;/.test(css)
  && !/\.nox-modal-overlay \{[^}]*backdrop-filter/.test(css) && modal.includes('document.body.style.overflow = "hidden";'));
// W-2〜W-4
const cpm = src("components/nox/customer-pick-modal.tsx");
check("x13g(2) W-2 伝票なし（開卓）／お客様 0 人は「この伝票のお客様」を出さない", NIL_CHECK_ID === "00000000-0000-0000-0000-000000000000" && cpm.includes("const showCheckTab = checkId !== NIL_CHECK_ID && checkList.length > 0;") && cpm.includes('.filter((k) => k !== "check" || showCheckTab)'));
check("x13g(3) W-3 伝票上部のお客様＝K様／K様 ほか n 名／0 人は空・押すと顧客の節へ・顧客カードの変更で即反映",
  checkCustLineOf([]) === "" && checkCustLineOf(["K"]) === "K様" && checkCustLineOf(["K", "M", "N"]) === "K様 ほか 2 名"
  && reg.includes('data-check-cust-line="1"') && reg.includes('document.getElementById("check-customers")') && reg.includes("await loadCustNames(check.id); /* ★便 X13-G W-3"));
const kb = nomKindBadgesOf({ a: "hon", b: "jonai", c: "free" }, ["a", "b", "c", "d"]);
check("x13g(4) W-4 担当中タブ＝本指名／場内／フリー（色は既存トークン 3 種）・レジの他タブは着卓中に統一",
  kb.get("a")?.label === "本指名" && kb.get("b")?.label === "場内" && kb.get("c")?.label === "フリー" && !kb.has("d") && NOM_KIND_BADGE.hon.tone === "gold"
  && src("components/nox/cast-picker.tsx").includes('chip === "seated" ? seatedBadges?.get(c.id) ?? null : null') && reg.includes("seatedBadges={nomKindBadgesOf(nomKinds, seatedIds)}"));
// W-5／W-6
const pb = src("app/(manage)/payroll/payroll-board.tsx"), pl = src("app/(manage)/payroll/payroll-list.tsx");
check("x13g(5) W-5 未払・明細 PDF・明細へ＝枠ボタン（44px）", pb.includes('className="nox-rowbtn" data-row-pay=') && pb.includes('className="nox-rowbtn" data-row-slip=') && pl.includes('className="nox-rowbtn" data-list-detail="1"') && /\.nox-rowbtn \{[^}]*min-height: 44px/.test(css));
check("x13g(6) W-6 月次一覧の集計 2×2・/payroll のカードは 5 列＋差引支給｜操作・紹介の計算方式は折り返し",
  pl.includes('className="nox-inset nox-kpi4"') && /@media \(max-width: 899px\) \{ \.nox-kpi4 \{ grid-template-columns: repeat\(2/.test(css)
  && css.includes(".nox-paytable.v365 tr { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));") && css.includes(".nox-paytable.v365 td.c-ops { grid-column: 3 / -1;")
  && reg.includes('ariaLabel="紹介料の計算方法" wrap />'));
// W-7／W-8
const rb = src("app/(manage)/report/report-board.tsx");
check("x13g(7) W-7 金種＝−／枚数／＋／小計・0 で − は無効・44px", rb.includes('className="nox-denombtn"') && rb.includes("disabled={n <= 0}") && rb.includes("setN(n + 1)") && /\.nox-denombtn \{ height: 44px;/.test(css));
check("x13g(8) W-8 日付入力＝appearance none・min-width 0・max-width 100%・左寄せ／日払いは 2 列＋全幅ボタン",
  /input\[type="date"\], input\[type="time"\], input\[type="datetime-local"\], input\[type="month"\] \{\s*-webkit-appearance: none;/.test(css) && css.includes(".nox-dailypay-row > .go { grid-column: 1 / -1; width: 100%; }")
  && src("components/nox/daily-pay-form.tsx").includes('className="nox-dailypay-row"'));
// W-9
const pr = src("app/(manage)/master/pricing/pricing-board.tsx");
check("x13g(9) W-9 開発用の注記を利用者向けに（mig／RPC 名／便番号・お客さま・フォールバック・開栓時）",
  !pr.includes("mig0113）") && !pr.includes("お客さま") && !pr.includes("基本料金（フォールバック）") && pr.includes("基本料金（どのルールにも当たらないとき）")
  && !src("components/nox/advance-okuri-form.tsx").includes("次の段（0156）") && !src("app/(manage)/master/cast-comp/comp-sections.tsx").includes("★便 P174 T-3＝裁定394）")
  && !src("app/(manage)/master/cast-comp/plan/plan-editor.tsx").includes("（set_comp_plan）"));
// W-10
check("x13g(10) W-10 設定行は 900px 未満で縦積み・英字チップなし・キャスト詳細の在籍／未招待は折らない",
  css.includes(".nox-listrow.nox-setrow { flex-direction: column;") && css.includes(".nox-frow { flex-direction: column; align-items: stretch; gap: 6px; }")
  && !/>(ROUNDING|CONTROL|CARD|TAX|ENCRYPTED|OWNER)</.test(pr + src("app/(manage)/master/kiosk-device-panel.tsx") + src("app/(manage)/master/kiosk-pin-panel.tsx") + src("app/(manage)/master/sensitive-tax-panel.tsx")));
// W-11
check("x13g(11) W-11 今日タブ＝出勤前（出勤＋4 択）／出勤後／当欠・休み／退勤後", todayRowViewOf({ attStatus: "absent", hasIn: false, hasOut: false }) === "absent" && todayRowViewOf({ attStatus: null, hasIn: false, hasOut: false }) === "pre"
  && /\.nox-attpre-main \{ min-height: 56px;/.test(css) && /\.nox-attpre-sub \{ display: grid; grid-template-columns: repeat\(4/.test(css));
// W-12
check("x13g(12) W-12 待遇プランの 6 タブ＝900px 未満は 2 列×3 段・タブ切替で本文の先頭へ・金額は 3 桁区切り",
  src("app/(manage)/master/cast-comp/plan/plan-board.tsx").includes('className="nox-seg nox-segtabs nox-segtabs--grid2"') && /\.nox-segtabs\.nox-segtabs--grid2 \{ display: grid; grid-template-columns: repeat\(2/.test(css)
  && groupedDigitsOf("800000") === "800,000" && groupedDigitsOf("") === "" && groupedDigitsOf(14520) === "14,520" && reg.includes("<GroupedNumberInput value={isCash ? payTendered : payAmount}"));
// W-13
check("x13g(13) W-13 送り・前借りの節は制度に関係なく出す・節が全部隠れる店は案内", isSectionOn({ sys_penalties: false }, "deductionPanel") && !isSectionOn({ sys_penalties: false }, "compDeductionTab")
  && src("app/(manage)/master/cast-comp/norma/norma-board.tsx").includes('data-systems-off-note="1"') && src("app/(manage)/master/cast-comp/deduction/deduction-board.tsx").includes('data-systems-off-note="1"'));
// W-14
{
  const rules: EstimateRule[] = [
    { id: "s1", fee_kind: "set", amount: 7000, duration_min: 60, seat_kind: null, dow_mask: null, time_from_min: null, time_to_min: null, category_id: null, billing_unit: "person", priority: 100 },
    { id: "v1", fee_kind: "vip_charge", amount: 5000, duration_min: null, seat_kind: "VIP", dow_mask: null, time_from_min: null, time_to_min: null, category_id: null, billing_unit: "table", priority: 100 },
  ];
  const store = { set_fee: 6000, set_min: 60, time_per: "person", service_rate: 20, round_unit: 1, round_mode: "down", business_tax_status: "taxable", price_display: "tax_excluded", tax_rounding: "floor" };
  const now = new Date("2026-10-21T12:00:00Z"); // JST 21:00
  const e1 = openEstimateOf({ store, rules, seatKind: "VIP", categoryId: null, people: 1, ruleId: null, now });
  const e2 = openEstimateOf({ store, rules, seatKind: "VIP", categoryId: null, people: 2, ruleId: null, now });
  const e3 = openEstimateOf({ store, rules, seatKind: "卓", categoryId: null, people: 1, ruleId: null, now });
  check("x13g(14) W-14 見込み＝VIP 1 名 ¥12,000→サ ¥2,400・税 ¥1,440・¥15,840・2 名で変わる・卓では VIP なし",
    e1.vip?.amount === 5000 && e1.breakdown.net === 12000 && e1.breakdown.service === 2400 && e1.breakdown.tax === 1440 && e1.breakdown.due === 15840
    && e2.breakdown.net === 19000 && e3.vip === null && bizClockOf(new Date("2026-10-21T18:00:00Z")).min === 3 * 60 + 1440
    && resolveRuleOf(rules, { feeKind: "vip_charge", seatKind: "卓", categoryId: null, dow: 2, min: 1260 }) === null && reg.includes('data-open-estimate="1"'), JSON.stringify(e1.breakdown));
}
// W-15
{
  const s = { service_rate: 20, round_unit: 1, round_mode: "down", business_tax_status: "taxable", price_display: "tax_excluded", tax_rounding: "floor" };
  const lines = [{ line_total: 7000, kind: "charge" }, { line_total: 5000, kind: "charge" }];
  const b = dueBreakdownOf(lines, s); const inc = dueBreakdownOf(lines, { ...s, price_display: "tax_included" });
  check("x13g(15) W-15 内訳＝合計は groupDueFull と一致（外税 12,000→2,400→1,440→15,840／内税＝うち消費税）・明細と入金画面と上部に外税／内税",
    b.excluded && b.net === 12000 && b.service === 2400 && b.tax === 1440 && b.due === 15840 && b.due === groupDueFull(lines, s)
    && !inc.excluded && inc.due === groupDueFull(lines, { ...s, price_display: "tax_included" }) && inc.tax === Math.floor((inc.due * 10) / 110)
    && reg.includes('data-sum-tax="1"') && reg.includes("消費税（外税 10%）") && reg.includes('data-pay-breakdown="1"') && reg.includes("data-tax-mode={exclTax ?") && !reg.includes("合計（請求・サ料込）"));
}
// W-16／W-17
check("x13g(16) W-16 ひな形の表＝900px 未満は 1 ひな形 1 カード", src("components/nox/settlement-presets-editor.tsx").includes('className="nox-presettable"') && css.includes(".nox-presettable td.c-del { grid-column: 2; grid-row: 1;"));
check("x13g(17) W-17 お客様に請求するカード手数料＝pay_fee_rates.card を節の中の保存ボタンで（インボイスの誤りで止めない）・見出しで区別・未保存の印・入金画面の見込み行",
  pr.includes('rpc("set_store_profile", { p_store_id: storeId, p_patch: { pay_fee_rates: { ...feeRatesSaved, card: feeNow } } })') && pr.includes("カード手数料（お客様に請求・伝票に加算）") && pr.includes("カード手数料（店の負担・日報の集計用）")
  && pr.includes('data-unsaved="tax"') && pr.includes('data-field-err="reg"') && reg.includes('data-pay-fee-line="1"'));
// W-18
{
  const ace = JSON.parse(src("docs/demo/payload/ace.json")) as { tables: Record<string, Record<string, unknown>[]> };
  const T = ace.tables;
  const st = T.stores[0] as Record<string, unknown>; const sj = st.settings_json as Record<string, unknown>;
  const mir = (T.shifts ?? []).filter((r) => typeof r.$onlyBefore === "string");
  const allUnreg = ["muse", "luna", "noir", "ace", "lily", "nest"].every((c) => (JSON.parse(src(`docs/demo/payload/${c}.json`)).tables.stores[0] as Record<string, unknown>).invoice_status === "unregistered");
  check("x13g(18) W-18 payload＝ACE カード 10%・6 店インボイス未登録・今月の写し（$onlyBefore）・既定プラン・発行済み領収書・在庫マイナスの表示",
    (sj.pay_fee_rates as Record<string, number>)?.card === 10 && allUnreg && mir.length > 0 && typeof sj.default_plan_id === "string" && (T.receipt_issues ?? []).length === 1
    && DATED_TABLES.includes("receipt_issues") && reg.includes("在庫 −${Math.abs(stock.n)}"));
  // dateshift: 今月の写しは reset 日より前だけ・重なる日は落とす・子は親に従う
  const pl = { shifts: [{ id: "a", cast_id: "c1", date: { $rel: -1 } }, { id: "m1", cast_id: "c1", date: { $m: 0, d: 20 }, $onlyBefore: "date", $dedupe: ["cast_id", "date"] }, { id: "m2", cast_id: "c1", date: { $m: 0, d: 19 }, $onlyBefore: "date", $dedupe: ["cast_id", "date"] }, { id: "m3", cast_id: "c1", date: { $m: 0, d: 25 }, $onlyBefore: "date", $dedupe: ["cast_id", "date"] }],
    checks: [{ id: "k1", started_at: { $m: 0, d: 25, t: "22:00:00" }, $onlyBefore: "started_at" }, { id: "k2", started_at: { $m: 0, d: 3, t: "22:00:00" }, $onlyBefore: "started_at" }],
    check_lines: [{ id: "l1", check_id: "k1", created_at: { $m: 0, d: 25, t: "22:00:00" }, $onlyBefore: "created_at" }, { id: "l2", check_id: "k2", created_at: { $m: 0, d: 3, t: "22:00:00" }, $onlyBefore: "created_at" }] };
  const out = shiftPayload(pl as unknown as Record<string, Record<string, unknown>[]>, "2026-10-21", "06:00");
  check("x13g(19) W-18 dateshift: reset 日（10/21）以降の写しは落とす・既存行と同じ日（10/20）の写しは落とす・子は親に従う・印の列は残らない",
    out.shifts.map((r) => r.id).join(",") === "a,m2" && out.checks.map((r) => r.id).join(",") === "k2" && out.check_lines.map((r) => r.id).join(",") === "l2" && !("$onlyBefore" in out.shifts[1]) && !("$dedupe" in out.shifts[1]),
    JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.map((r) => r.id)]))));
}
// W-19
check("x13g(20) W-19 ① customers-keep の snapshot は検証 org の範囲・② 0 円のまま方式を切り替えても戻らない",
  src("scripts/verify-nox-customers-keep.ts").includes("from public.check_lines where org_id=$2") && src("app/(manage)/master/cast-comp/comp-sections.tsx").includes('flat === 0 && per === 0 ? (modeSel[ax] ?? "flat")'));

if (fails.length) { console.log(`✗ verify:nox-x13g 失敗 ${fails.length}（成功 ${pass}）`); for (const x of fails) console.log(" - " + x); process.exit(1); }
console.log(`verify:nox-x13g OK (${pass} checks)`);
console.log("便 X13-G: 下シートの重なり順・お客様と指名区分・給与の操作・390px・金種・日付・注記・縦積み・今日タブ・タブ 2 段・控除送り・VIP 見込み・外税・ひな形・カード加算・payload");
