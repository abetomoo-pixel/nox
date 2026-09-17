/**
 * verify:nox-setup — 初期設定ウィザードの純関数 lib/nox/setup/template-plan.ts（裁定270-1／271）の係留。DB 不触・純関数のみ。
 *   npm run verify:nox-setup（env 不要）。f0 52 段目。
 *
 *  (1) JSON 正本の sha256＝b8cf1720b79efe8ed227c090a2ff0d3c549d00fdcf8e24dd903076be1a03f8b1（271-1・器が無いキーも削らない）
 *  (2) 4 業態＋bar の計画配列: 順序（271-12）・件数（営業時間 7＋cutoff・席・料金・報酬・商品・完了）・食品除外数（271-9）
 *  (3) 30 時間制（271-3）・back.type 写像（271-8）・request→hon（271-10）・tier 最下段・商品 OFF で bulk 0 件・bar は料金 1 行＋商品 0＋報酬なし
 *  逆テスト 2 本（手動・各 1 回）: 食品を除外に戻す（CLASS_TO_TYPE.food を null に）→su(2-3) 赤（裁定272-4 後）／写像順を変える（hours を settings より前に）→su(2-1) 赤。
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { SYSTEM_KEYS, type SystemKey } from "../lib/nox/store-systems";
import {
  BIZ_TYPES, backArgsOf, buildSetupPlan, compOf, excludedFoodCountOf, hoursOf, pricingOf, productOverrideArgs, productsPlanOf, seatsOf, templateOf, to30h,
  type BizType, type PlanStep,
} from "../lib/nox/setup/template-plan";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const ORDER: PlanStep["group"][] = ["settings", "hours", "seats", "pricing", "comp", "products", "overrides", "flags", "done"];
const systemsAll = Object.fromEntries(SYSTEM_KEYS.map((k) => [k, k === "sys_hourly" || k === "sys_backs"])) as Record<SystemKey, boolean>;
const CUR = { card_tax_rate: 5, round_unit: 100, round_mode: "down", time_mode: "manual", time_per: "table" };
const planOf = (biz: BizType, includeProducts = true) => buildSetupPlan({
  storeId: "00000000-0000-4000-8000-000000000001", biz, storeName: null, hours: hoursOf(templateOf(biz)), systems: systemsAll, includeProducts, receivablePolicy: "customer_only",
  billingMode: "table", pricing: pricingOf(templateOf(biz)), current: CUR, flags: [{ key: "qr_order", enabled: true }],
});
const ordered = (steps: PlanStep[]) => steps.every((s, i) => i === 0 || ORDER.indexOf(s.group) >= ORDER.indexOf(steps[i - 1].group));

// (1) JSON 正本
{
  const buf = fs.readFileSync("lib/nox/setup/templates/v1.json");
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  check("su(1-1) ★templates/v1.json の sha256＝b8cf1720…（正本・改変なし）", sha === "b8cf1720b79efe8ed227c090a2ff0d3c549d00fdcf8e24dd903076be1a03f8b1", sha);
  check("su(1-2) size 75,783 B", buf.length === 75783, String(buf.length));
  check("su(1-3) 業態 5 種＝JSON 4 テンプレ＋bar（templateId null）", BIZ_TYPES.length === 5 && BIZ_TYPES.filter((b) => b.templateId).length === 4 && templateOf("bar") === null);
}

// (2) 計画配列（4 業態＋bar）
const EXPECT: Record<BizType, { products: number; included: number; food: number; seats: number; rules: number; comp: number; overrides: number }> = {
  // ★裁定272-4（0148）: 271-9 の食品除外を解除＝除外 0・投入＝全商品（overrides は back が既定でない商品数＝OVERRIDES_AFTER で再計測）
  cabaret: { products: 67, included: 67, food: 0, seats: 8, rules: 2, comp: 1, overrides: 54 },
  girlsbar: { products: 34, included: 34, food: 0, seats: 14, rules: 0, comp: 1, overrides: 30 },
  snack: { products: 28, included: 28, food: 0, seats: 11, rules: 0, comp: 1, overrides: 0 },
  lounge: { products: 40, included: 40, food: 0, seats: 9, rules: 1, comp: 1, overrides: 37 },
  bar: { products: 0, included: 0, food: 0, seats: 0, rules: 0, comp: 0, overrides: 0 },
};
for (const biz of ["cabaret", "girlsbar", "snack", "lounge", "bar"] as BizType[]) {
  const e = EXPECT[biz];
  const t = templateOf(biz);
  const pp = productsPlanOf(t);
  const steps = planOf(biz);
  const n = (g: PlanStep["group"]) => steps.filter((s) => s.group === g).length;
  check(`su(2-1) ★${biz}: 書込順＝settings→hours→seats→pricing→comp→products→overrides→flags→done（271-12）`, ordered(steps) && steps[0].group === "settings" && steps[steps.length - 1].group === "done", steps.map((s) => s.group).join(","));
  check(`su(2-2) ${biz}: 営業時間 7＋cutoff 1・席 ${e.seats}・料金 2＋rules ${e.rules}・報酬 ${e.comp}・商品 ${e.included ? 1 : 0}・上書き ${e.overrides ? 1 : 0}・機能 1・完了 1`,
    n("hours") === 8 && n("seats") === e.seats && n("pricing") === 2 + e.rules && n("comp") === e.comp && n("products") === (e.included ? 1 : 0) && n("overrides") === (e.overrides ? 1 : 0) && n("flags") === 1 && n("done") === 1,
    JSON.stringify({ hours: n("hours"), seats: n("seats"), pricing: n("pricing"), comp: n("comp"), products: n("products"), overrides: n("overrides"), flags: n("flags") }));
  check(`su(2-3) ★${biz}: 商品 ${e.products} 件中 投入 ${e.included}・除外 ${e.food}（271-9 は裁定272-4 で解除＝0）`, (t?.products.length ?? 0) === e.products && pp.included.length === e.included && pp.excludedTotal === e.food && excludedFoodCountOf(biz) === e.food, JSON.stringify({ all: t?.products.length, inc: pp.included.length, ex: pp.excluded }));
  check(`su(2-4) ${biz}: back 上書き ${e.overrides} 件・未対応 back 0（gross_profit_pct 使用 0）`, pp.overrides === e.overrides && pp.unsupportedBack === 0, JSON.stringify({ ov: pp.overrides, un: pp.unsupportedBack }));
  const bulk = steps.find((s) => s.key === "products_bulk");
  check(`su(2-5) ${biz}: bulk の item は name/type/price/cost/category の 5 キー・type は drink/champ/bottle/food/other（裁定272-4）`, !bulk || ((bulk.args!.p_items as Array<Record<string, unknown>>).every((it) => JSON.stringify(Object.keys(it)) === JSON.stringify(["name", "type", "price", "cost", "category"]) && ["drink", "champ", "bottle", "food", "other"].includes(String(it.type)))));
  check(`su(2-6) ${biz}: 席・商品・待遇プラン・料金行の step に冪等ガード（seats_empty／products_empty／plans_empty／rules_empty）`, steps.filter((s) => s.group === "seats").every((s) => s.guard === "seats_empty") && steps.filter((s) => s.group === "products" || s.group === "overrides").every((s) => s.guard === "products_empty")
    && steps.filter((s) => s.group === "comp").every((s) => s.guard === "plans_empty") && steps.filter((s) => s.rpc === "set_pricing_rule").every((s) => s.guard === "rules_empty") && steps.filter((s) => s.rpc === "set_store_time_pricing" || s.rpc === "set_store_pricing").every((s) => !s.guard));
  const done = steps[steps.length - 1];
  check(`su(2-7) ${biz}: 完了 step＝set_store_profile {setup_done:true}・先頭 step に biz_type／billing_mode／sys_* 9`, done.rpc === "set_store_profile" && JSON.stringify(done.args?.p_patch) === JSON.stringify({ setup_done: true })
    && (steps[0].args?.p_patch as Record<string, unknown>).biz_type === biz && SYSTEM_KEYS.every((k) => typeof (steps[0].args?.p_patch as Record<string, unknown>)[k] === "boolean"));
  // ★裁定272-5（0148）: settings 段＝set_store_profile → set_store_receivable_policy の 2 件（件数 +1）
  check(`su(2-9) ${biz}: settings 段 2 件・2 件目＝set_store_receivable_policy(p_policy='customer_only')`, n("settings") === 2 && steps[1].group === "settings" && steps[1].rpc === "set_store_receivable_policy" && steps[1].args?.p_policy === "customer_only" && steps[1].args?.p_store_id === steps[0].args?.p_store_id, JSON.stringify(steps[1]));
  const noProd = planOf(biz, false);
  check(`su(2-8) ${biz}: 商品 OFF で bulk／上書き 0 件・他は不変`, noProd.filter((s) => s.group === "products" || s.group === "overrides").length === 0 && noProd.length === steps.length - n("products") - n("overrides"));
}

// (3) 写像
{
  check("su(3-1) ★30 時間制: 02:00→26:00・00:00→24:00・05:00→29:00・01:00→25:00・23:00 は不変", to30h("19:00", "02:00") === "26:00" && to30h("19:00", "00:00") === "24:00" && to30h("20:00", "05:00") === "29:00" && to30h("19:30", "01:00") === "25:00" && to30h("18:00", "23:00") === "23:00");
  const cab = planOf("cabaret");
  const h0 = cab.find((s) => s.key === "hours_0")!;
  check("su(3-2) cabaret の営業時間 step＝19:00〜26:00・7 曜日・cutoff 06:00", h0.args?.p_open_hm === "19:00" && h0.args?.p_close_hm === "26:00" && cab.filter((s) => s.rpc === "set_store_business_hours").map((s) => s.args?.p_dow).join() === "0,1,2,3,4,5,6" && cab.find((s) => s.key === "cutoff")?.args?.p_hm === "06:00");
  const t = templateOf("cabaret");
  check("su(3-3) ★back.type 写像: none→rate 0／fixed→unit4 同額／sale_pct→rate+value／product_specific→既定（プラン側 product_rule）",
    JSON.stringify(backArgsOf({ type: "none" }, t)) === JSON.stringify({ back_mode: "rate", back_value: 0, unit4: null, unsupported: false, isDefault: true })
    && JSON.stringify(backArgsOf({ type: "fixed", value: 200 }, t).unit4) === JSON.stringify({ hon: 200, jonai: 200, dohan: 200, free: 200 })
    && backArgsOf({ type: "sale_pct", value: 10 }, t).back_value === 10 && backArgsOf({ type: "sale_pct", value: 10 }, t).back_mode === "rate"
    && backArgsOf({ type: "product_specific" }, t).isDefault === true);
  check("su(3-4) ★tier＝最下段の率（champagne_4step → 10%）・gross_profit_pct＝未対応フラグ", backArgsOf({ type: "tier", value: "champagne_4step" }, t).back_value === 10 && backArgsOf({ type: "gross_profit_pct", value: 30 }, t).unsupported === true);
  const gb = compOf(templateOf("girlsbar"));
  const gp = pricingOf(templateOf("girlsbar"));
  check("su(3-5) ★request→hon（271-10）: ガールズバー request_back 500→hon_back・request_yen 1,000→hon_fee", gb?.hon_back === 500 && gp.hon_fee === 1000 && gp.jonai_fee === 0);
  const cp = pricingOf(t);
  check("su(3-6) cabaret 料金: set 60/6,000・延長 30/3,500＋2 段目 60/6,000・VIP 3,000・サービス 20%", cp.set_min === 60 && cp.set_fee === 6000 && cp.ext_min === 30 && cp.ext_fee === 3500 && cp.ext2?.min === 60 && cp.ext2?.fee === 6000 && cp.vip_charge === 3000 && cp.service_rate === 20);
  const sp = pricingOf(templateOf("snack"));
  check("su(3-7) snack 料金: set 90/4,000・延長 60/2,000・2 段目なし・VIP なし・karaoke は投入しない", sp.set_min === 90 && sp.set_fee === 4000 && sp.ext_min === 60 && sp.ext_fee === 2000 && sp.ext2 === null && sp.vip_charge === null);
  const bar = planOf("bar");
  check("su(3-8) ★bar＝空テンプレ: 料金 set_store_time_pricing 1 行（set 60/1,000）・rules 0・報酬なし・商品なし・席なし", bar.filter((s) => s.group === "pricing").length === 2 && bar.find((s) => s.key === "time_pricing")?.args?.p_set_fee === 1000 && compOf(null) === null && !bar.some((s) => s.group === "comp" || s.group === "products" || s.group === "seats"));
  const cc = compOf(t);
  const compStep = cab.find((s) => s.key === "comp")!;
  check("su(3-9) 報酬既定: 時給 4,000・本指名 1,000／場内 500／同伴 2,000＝per_count・product_rule・月額保証なし（271-6／271-11）", cc?.base === 4000 && compStep.args?.p_hon_back === 1000 && compStep.args?.p_jonai_back === 500 && compStep.args?.p_dohan_back === 2000 && compStep.args?.p_hon_back_mode === "per_count" && compStep.args?.p_product_back_mode === "product_rule" && !cab.some((s) => s.rpc === "set_comp_component"));
  check("su(3-10) 席: cabaret 卓 6・VIP 2・カウンター 0＝kind は '卓'／'VIP'／'カウンター'", seatsOf(t).map((s) => s.kind).join() === "卓,卓,卓,卓,卓,卓,VIP,VIP");
  check("su(3-11) pricing step＝現値マージ（card_tax_rate／round_unit／round_mode／time_mode／time_per は current）", cab.find((s) => s.key === "pricing")?.args?.p_card_tax_rate === 5 && cab.find((s) => s.key === "time_pricing")?.args?.p_time_per === "table");
  const rows = productsPlanOf(t).included.slice(0, 3).map((p, i) => ({ id: `id${i}`, name: p.name, type: p.type, category: p.category, category_id: null, price: p.price, hon_pt: 0, reorder_point: null, back_exempt_from_split: false, is_active: true }));
  const ov = productOverrideArgs("s", t, rows);
  check("su(3-12) 上書き引数＝既定でない back の商品だけ・p_id は行から・cost はテンプレ・15 引数", ov.length === rows.filter((r) => !productsPlanOf(t).included.find((p) => p.name === r.name)!.back.isDefault).length && ov.every((o) => Object.keys(o.args).length === 15 && typeof o.args.p_id === "string"));
  check("su(3-13) 機能スイッチ step＝flag_set（org 既定行・変更分のみ）", cab.filter((s) => s.rpc === "flag_set").length === 1 && cab.find((s) => s.rpc === "flag_set")?.args?.p_store_id === null);
}

if (fails.length) {
  console.log(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.log(` - ${f}`);
  process.exit(1);
}
console.log(`verify:nox-setup ALL PASS (${pass} assertions)`);
console.log("初期設定(裁定270/271): JSON 正本 sha・4 業態＋bar の計画配列（順序・件数・食品除外・冪等ガード）・30 時間制・back 写像・request→hon・tier 最下段・bar 空・商品 OFF");
