/**
 * verify:nox-setup — 初期設定ウィザード v5 の純関数 lib/nox/setup/template-plan.ts（裁定270-1／271 → ★331・便 W5-1）の係留。DB 不触・純関数＋画面本文の pin。
 *   npm run verify:nox-setup（env 不要）。f0 の 1 段。
 *
 *  (1) JSON 正本 v2（6 テンプレ＝正本モックの SRC 6 店）の sha256・size・業態 5（ラウンジの土台＝cabaret_vip）・6 ステップ
 *  (2) 5 業態の既定特徴の計画配列: 順序（271-12）・件数（settings／hours 8／seats／pricing／comp／products／overrides／flags／done）・冪等ガード・完了 step
 *  (3) 特徴の分岐（VIP 専用料金表→seat_kind 'VIP' の set／extension 2 行・VIP 加算→vip_charge 1 行・指名料なし→料金 0／バック 0・売上スライド→p_sales_slide 3 段・新人保証→2 本目・達成ボーナス→set_comp_component 1 段 argsOf）
 *  (4) 写像（30 時間制・back.type unit4／fixed／sale_pct・本指名pt の上書き・1 日の報酬の目安・あとで設定の既定値・次にやること）
 *  (5) 画面（setup-wizard.tsx／page.tsx）: 6 ステップ・C／D の非表示（SETUP_HIDDEN_ITEMS の見出しが本文に無い）・進捗バー・途中保存・あとで設定・完了画面の導線・既存 RPC 以外を呼ばない
 *  逆テスト（手動・各 1 回）: SETUP_STEPS を 5 本にする→su(1-4) 赤／ウィザードに「インボイスの登録」の見出しを足す→su(5-2) 赤。
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { DEFAULT_SETTLEMENT_PRESETS } from "../lib/nox/payroll/settlement";
import { MINE_SETTINGS_DEFAULT } from "../lib/nox/store/mine-settings";
import { SYSTEM_KEYS } from "../lib/nox/store-systems";
import {
  BIZ_TYPES, NOM_MODES, SETUP_HIDDEN_ITEMS, SETUP_STEPS, VIP_MODES, allTemplates, backArgsOf, bizNoteOf, buildSetupPlan, composeDraft, defaultFeaturesOf, excludedFoodCountOf, featureLabelOf, hoursOf,
  laterDefaultsOf, nextActionsOf, previewLinesOf, pricingOf, productOverrideArgs, productsPlanOf, seatsOf, systemsOf, templateOf, to30h,
  type BizType, type PlanStep, type SetupCurrent, type SetupFeatures, type SetupSelection,
} from "../lib/nox/setup/template-plan";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const ORDER: PlanStep["group"][] = ["settings", "hours", "seats", "pricing", "comp", "products", "overrides", "flags", "done"];
const CUR: SetupCurrent = { card_tax_rate: 5, round_unit: 100, round_mode: "down", time_mode: "manual", time_per: "table", receipt: { address: "", tel: "", reg_no: "T1234567890123", footer: "飲食代" }, mine: { ...MINE_SETTINGS_DEFAULT } };
const BIZ_ALL: BizType[] = ["cabaret", "lounge", "girlsbar", "snack", "bar"];
function selOf(biz: BizType, f: SetupFeatures = defaultFeaturesOf(biz), over: Partial<SetupSelection> = {}): SetupSelection {
  const d = composeDraft(biz, f);
  const later = laterDefaultsOf(biz, d, CUR);
  return {
    storeId: "00000000-0000-4000-8000-000000000001", biz, features: f, storeName: null, tel: "", address: "", hours: hoursOf(templateOf(biz)), seats: d.seats, includeProducts: true, products: d.products,
    pricing: later.pricing, plans: later.plans, payTimeBasis: "punch", lateGraceMin: null, norms: false, okuriBase: 1000, billingMode: "table", cardFee: later.cardFee, receivablePolicy: later.receivablePolicy, mine: later.mine,
    current: CUR, flags: [{ key: "qr_order", enabled: true }], ...over,
  };
}
const planOf = (biz: BizType, f?: SetupFeatures, over?: Partial<SetupSelection>) => buildSetupPlan(selOf(biz, f, over));
const ordered = (steps: PlanStep[]) => steps.every((s, i) => i === 0 || ORDER.indexOf(s.group) >= ORDER.indexOf(steps[i - 1].group));
const n = (steps: PlanStep[], g: PlanStep["group"]) => steps.filter((s) => s.group === g).length;

// (1) JSON 正本 v2・業態・ステップ
{
  const buf = fs.readFileSync("lib/nox/setup/templates/v2.json");
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  check("su(1-1) ★templates/v2.json の sha256＝edcc3da3（正本モックの SRC 6 店＝改変なし）", sha === "edcc3da3f67431374e747305c6f0544d53d8c351210cb288e44c77352e3e5cb4", sha);
  check("su(1-2) size 57349 B・6 テンプレ（cabaret_standard／cabaret_vip／cabaret_slide／girlsbar_standard／snack_standard／bar_staffback）", buf.length === 57349 && allTemplates().map((t) => t.template_id).join() === "cabaret_standard,cabaret_vip,cabaret_slide,girlsbar_standard,snack_standard,bar_staffback", String(buf.length));
  check("su(1-3) ★業態 5（モック BIZ の順・文言）＝キャバクラ→cabaret_standard／ラウンジ→cabaret_vip（NOIR 型）／ガールズバー／スナック／バー→bar_staffback（空テンプレは廃止）",
    BIZ_TYPES.map((b) => `${b.key}:${b.label}:${b.templateId}`).join("|") === "cabaret:キャバクラ:cabaret_standard|lounge:ラウンジ:cabaret_vip|girlsbar:ガールズバー:girlsbar_standard|snack:スナック:snack_standard|bar:バー:bar_staffback"
    && BIZ_TYPES.map((b) => b.sub).join("|") === "セット・指名・同伴中心|高単価・VIP寄り|チャージ＋ドリンク中心|セット＋ボトル中心|商品会計＋チャージ中心" && BIZ_ALL.every((b) => templateOf(b).products.length > 0));
  check("su(1-4) ★6 ステップ＝お店について／料金／商品／キャスト報酬／会計と運用／確認（モック STEPS の題）", SETUP_STEPS.length === 6 && SETUP_STEPS.map((s) => s[0]).join("／") === "お店について／料金／商品／キャスト報酬／会計と運用／確認");
  check("su(1-5) 特徴の選択肢＝VIP 3（なし／VIP 専用の料金表／通常料金＋VIP 加算）・指名料 2（取らない／全員同じ額＝ランク別は W5-2）・C 5 件＋D 5 件が非表示一覧に", VIP_MODES.map((x) => x[1]).join("／") === "なし／VIP 専用の料金表／通常料金＋VIP 加算" && NOM_MODES.map((x) => x[1]).join("／") === "取らない／全員同じ額"
    && SETUP_HIDDEN_ITEMS.filter((x) => x.cls === "C").length === 5 && SETUP_HIDDEN_ITEMS.filter((x) => x.cls === "D").length === 5);
}

// (2) 既定特徴の計画配列（5 業態）
const EXPECT: Record<BizType, { products: number; overrides: number; stock: number; seats: number; rules: number; comp: number; feat: string }> = {
  cabaret: { products: 22, overrides: 14, stock: 12, seats: 7, rules: 0, comp: 2, feat: "キャバクラ｜指名料あり・達成ボーナス" },
  lounge: { products: 25, overrides: 17, stock: 16, seats: 7, rules: 2, comp: 2, feat: "ラウンジ｜VIP専用料金・指名料あり・達成ボーナス" },
  girlsbar: { products: 23, overrides: 10, stock: 4, seats: 8, rules: 0, comp: 2, feat: "ガールズバー｜達成ボーナス" },
  snack: { products: 20, overrides: 8, stock: 9, seats: 5, rules: 0, comp: 2, feat: "スナック｜達成ボーナス" },
  bar: { products: 29, overrides: 7, stock: 6, seats: 6, rules: 0, comp: 2, feat: "バー｜達成ボーナス" },
};
for (const biz of BIZ_ALL) {
  const e = EXPECT[biz];
  const f = defaultFeaturesOf(biz);
  const d = composeDraft(biz, f);
  const pp = productsPlanOf(d.products);
  const steps = planOf(biz);
  check(`su(2-1) ★${biz}: 既定の特徴＝${e.feat}（モック defaultFeat: ラウンジだけ VIP 専用・指名料はランクがある業態・達成ボーナスは全業態 ON・スライド／新人保証 OFF）`, featureLabelOf(biz, f) === e.feat, featureLabelOf(biz, f));
  check(`su(2-2) ★${biz}: 書込順＝settings→hours→seats→pricing→comp→products→overrides→flags→done（271-12）`, ordered(steps) && steps[0].group === "settings" && steps[steps.length - 1].group === "done", steps.map((s) => s.group).join(","));
  check(`su(2-3) ${biz}: settings 2（profile・receivable）・hours 8・席 ${e.seats}・料金 2＋rules ${e.rules}・報酬 ${e.comp}（プラン＋達成ボーナス）・商品 1・上書き ${e.overrides ? 1 : 0}・機能 1・完了 1`,
    n(steps, "settings") === 2 && n(steps, "hours") === 8 && n(steps, "seats") === e.seats && n(steps, "pricing") === 2 + e.rules && n(steps, "comp") === e.comp && n(steps, "products") === 1 && n(steps, "overrides") === (e.overrides ? 1 : 0) && n(steps, "flags") === 1 && n(steps, "done") === 1,
    JSON.stringify({ settings: n(steps, "settings"), hours: n(steps, "hours"), seats: n(steps, "seats"), pricing: n(steps, "pricing"), comp: n(steps, "comp"), products: n(steps, "products"), overrides: n(steps, "overrides"), flags: n(steps, "flags") }));
  check(`su(2-4) ★${biz}: 商品 ${e.products} 件 全投入（除外 0）・上書き（back 非既定か本指名pt>0）${e.overrides} 件・在庫管理 ${e.stock} 件・未対応 back 0`, d.products.length === e.products && pp.included.length === e.products && pp.excludedTotal === 0 && excludedFoodCountOf(biz) === 0 && pp.overrides === e.overrides && pp.stock === e.stock && pp.unsupportedBack === 0,
    JSON.stringify({ all: d.products.length, inc: pp.included.length, ov: pp.overrides, stock: pp.stock, un: pp.unsupportedBack }));
  const bulk = steps.find((s) => s.key === "products_bulk")!;
  check(`su(2-5) ${biz}: bulk の item は name/type/price/cost/category の 5 キー・type は drink/champ/bottle/food/other`, (bulk.args!.p_items as Array<Record<string, unknown>>).every((it) => JSON.stringify(Object.keys(it)) === JSON.stringify(["name", "type", "price", "cost", "category"]) && ["drink", "champ", "bottle", "food", "other"].includes(String(it.type))));
  check(`su(2-6) ${biz}: 冪等ガード＝席 seats_empty／商品・上書き products_empty／プラン・達成ボーナス plans_empty／set_pricing_rule rules_empty・set_store_pricing／time_pricing は無し`, steps.filter((s) => s.group === "seats").every((s) => s.guard === "seats_empty") && steps.filter((s) => s.group === "products" || s.group === "overrides").every((s) => s.guard === "products_empty")
    && steps.filter((s) => s.group === "comp").every((s) => s.guard === "plans_empty") && steps.filter((s) => s.rpc === "set_pricing_rule").every((s) => s.guard === "rules_empty") && steps.filter((s) => s.rpc === "set_store_time_pricing" || s.rpc === "set_store_pricing").every((s) => !s.guard));
  const done = steps[steps.length - 1];
  const patch = steps[0].args?.p_patch as Record<string, unknown>;
  check(`su(2-7) ${biz}: 完了 step＝set_store_profile {setup_done, slide_apply:'next', settlement_presets 3}・先頭 step に biz_type／billing_mode／sys_* 9（明示 boolean）／okuri_base_amount 1000・slide_apply は完了 step だけ`,
    done.rpc === "set_store_profile" && JSON.stringify(done.args?.p_patch) === JSON.stringify({ setup_done: true, slide_apply: "next", settlement_presets: DEFAULT_SETTLEMENT_PRESETS })
    && patch.biz_type === biz && patch.billing_mode === "table" && SYSTEM_KEYS.every((k) => typeof patch[k] === "boolean") && patch.okuri_base_amount === 1000 && !("slide_apply" in patch)
    && steps[1].rpc === "set_store_receivable_policy" && steps[1].args?.p_policy === (templateOf(biz).features.accounts_receivable ? "customer_only" : "disabled"));
  const noProd = planOf(biz, f, { includeProducts: false });
  check(`su(2-8) ${biz}: 商品 OFF で bulk／上書き 0 件・他は不変`, noProd.filter((s) => s.group === "products" || s.group === "overrides").length === 0 && noProd.length === steps.length - n(steps, "products") - n(steps, "overrides"));
  const withShift = planOf(biz, f, { payTimeBasis: "shift" });
  const st = withShift.find((s) => s.rpc === "set_store_pay_time_basis");
  check(`su(2-9) ★${biz}: payTimeBasis 'shift' → set_store_pay_time_basis('shift','now') が settings 群に 1 本（receivable の後・hours の前）・'punch' は 0 本（裁定324）`, withShift.length === steps.length + 1 && !!st && st.group === "settings" && st.args?.p_value === "shift" && st.args?.p_apply === "now" && withShift.indexOf(st) === 2 && ordered(withShift) && !steps.some((s) => s.rpc === "set_store_pay_time_basis"));
}

// (3) 特徴の分岐
{
  const base = defaultFeaturesOf("cabaret"); // VIP なし・指名料あり・ボーナス ON
  const std = planOf("cabaret");
  check("su(3-1) ★cabaret 既定: VIP なし→VIP 席 0・rules 0（set_pricing_rule 無し）・指名料＝default ランク（本指名 3,000／場内 2,000／同伴 4,000）・プラン「標準」時給 3,000・本指名バック 1,200", composeDraft("cabaret", base).seats.vip_count === 0 && !std.some((s) => s.rpc === "set_pricing_rule")
    && std.find((s) => s.key === "pricing")?.args?.p_hon_fee === 3000 && std.find((s) => s.key === "pricing")?.args?.p_dohan_fee === 4000 && std.find((s) => s.key === "comp_0")?.args?.p_name === "標準" && std.find((s) => s.key === "comp_0")?.args?.p_base === 3000 && std.find((s) => s.key === "comp_0")?.args?.p_hon_back === 1200);
  const ded = planOf("cabaret", { ...base, vip: "dedicated" });
  const dd = composeDraft("cabaret", { ...base, vip: "dedicated" });
  check("su(3-2) ★VIP 専用の料金表（cabaret）: cabaret_vip の VIP 行（VIP平日／VIP週末）を足す・VIP 席 2・set_pricing_rule 2 本（seat_kind 'VIP' の set 60 分 12,000／extension 30 分 6,000）・vip_charge なし", dd.rules.filter((r) => r.seat === "vip").map((r) => r.name).join() === "VIP平日,VIP週末" && dd.seats.vip_count === 2
    && ded.filter((s) => s.rpc === "set_pricing_rule").map((s) => `${s.args?.p_fee_kind}:${s.args?.p_seat_kind}:${s.args?.p_amount}:${s.args?.p_duration_min}`).join("|") === "set:VIP:12000:60|extension:VIP:6000:30");
  const dg = composeDraft("girlsbar", { ...defaultFeaturesOf("girlsbar"), vip: "dedicated" });
  check("su(3-3) VIP 専用の料金表（ガールズバー＝VIP 元が無い業態）: 通常の 1.5 倍を 500 円単位で丸めた「VIP」行を合成（3,300→5,000／1,650→2,500）", dg.rules.filter((r) => r.seat === "vip").length === 1 && dg.rules.find((r) => r.seat === "vip")?.set_fee === 5000 && dg.rules.find((r) => r.seat === "vip")?.ext_fee === 2500);
  const sur = planOf("cabaret", { ...base, vip: "surcharge" });
  check("su(3-4) ★通常料金＋VIP 加算: set_pricing_rule 1 本（fee_kind 'vip_charge'・seat_kind 'VIP'・5,000）・VIP 席 2", sur.filter((s) => s.rpc === "set_pricing_rule").length === 1 && sur.find((s) => s.rpc === "set_pricing_rule")?.args?.p_fee_kind === "vip_charge" && sur.find((s) => s.rpc === "set_pricing_rule")?.args?.p_amount === 5000 && composeDraft("cabaret", { ...base, vip: "surcharge" }).seats.vip_count === 2);
  const non = planOf("cabaret", { ...base, nom: "none" });
  check("su(3-5) ★指名料を取らない: 本指名／場内／同伴 料金 0・プランのバック 0", non.find((s) => s.key === "pricing")?.args?.p_hon_fee === 0 && non.find((s) => s.key === "pricing")?.args?.p_jonai_fee === 0 && non.find((s) => s.key === "pricing")?.args?.p_dohan_fee === 0
    && non.find((s) => s.key === "comp_0")?.args?.p_hon_back === 0 && non.find((s) => s.key === "comp_0")?.args?.p_dohan_back === 0);
  const sl = planOf("cabaret", { ...base, slide: true });
  const slideArg = sl.find((s) => s.key === "comp_0")?.args?.p_sales_slide as Array<{ at: number; wage: number }>;
  check("su(3-6) ★売上スライド: cabaret_slide の 4 段を基本時給に合わせて写し at=0 を除く 3 段（30,000→3,500／70,000→4,000／120,000→5,000）・sys_sales_slide true", JSON.stringify(slideArg) === JSON.stringify([{ at: 30000, wage: 3500 }, { at: 70000, wage: 4000 }, { at: 120000, wage: 5000 }])
    && (sl[0].args?.p_patch as Record<string, unknown>).sys_sales_slide === true && (std[0].args?.p_patch as Record<string, unknown>).sys_sales_slide === false);
  const nb = planOf("cabaret", { ...base, newbie: true });
  check("su(3-7) ★新人保証: 2 本目のプラン「新人保証」時給 +500（3,500）・スライド／ボーナス無し・comp 群＝プラン 2＋達成ボーナス 1", nb.filter((s) => s.rpc === "set_comp_plan").map((s) => `${s.args?.p_name}:${s.args?.p_base}`).join("|") === "標準:3000|新人保証:3500" && nb.filter((s) => s.rpc === "set_comp_component").length === 1 && n(nb, "comp") === 3);
  const bonus = std.find((s) => s.key === "bonus_0")!;
  check("su(3-8) ★達成ボーナス 1 段: set_comp_component（argsOf 'comp_component'・after 'comp_0'・kind achievement_bonus・mode amount・amount 10,000＝モック 1 段目・params thresholds[{pct:100,add}]・9 引数）・OFF で 0 本・sys_bonus 連動",
    !!bonus && bonus.argsOf === "comp_component" && bonus.after === "comp_0" && bonus.rpc === "set_comp_component" && bonus.args?.p_kind === "achievement_bonus" && bonus.args?.p_mode === "amount" && bonus.args?.p_amount === 10000 && JSON.stringify(bonus.args?.p_params) === JSON.stringify({ thresholds: [{ pct: 100, add: 10000 }] }) && Object.keys(bonus.args!).length === 9
    && !planOf("cabaret", { ...base, bonus: false }).some((s) => s.rpc === "set_comp_component") && (planOf("cabaret", { ...base, bonus: false })[0].args?.p_patch as Record<string, unknown>).sys_bonus === false && (std[0].args?.p_patch as Record<string, unknown>).sys_bonus === true);
  check("su(3-9) ラウンジ既定＝VIP 専用料金＋指名料あり（NOIR 型）: VIP 行 2・ランク別は出さない（ranks 1＝default 3,000／2,000／5,000）・featureLabel「ラウンジ｜VIP専用料金・指名料あり・達成ボーナス」", composeDraft("lounge", defaultFeaturesOf("lounge")).rules.filter((r) => r.seat === "vip").length === 2 && composeDraft("lounge", defaultFeaturesOf("lounge")).ranks.length === 1
    && planOf("lounge").find((s) => s.key === "pricing")?.args?.p_dohan_fee === 5000 && featureLabelOf("lounge", defaultFeaturesOf("lounge")) === "ラウンジ｜VIP専用料金・指名料あり・達成ボーナス");
  const rc = planOf("cabaret", base, { tel: "03-0000-0000", address: "東京都新宿区", lateGraceMin: 5, mine: { ...MINE_SETTINGS_DEFAULT, payslip_visibility: "net_only", drink_claim: true } });
  const receipt = rc.find((s) => s.key === "receipt"), pen = rc.find((s) => s.key === "penalty"), mine = rc.find((s) => s.key === "mine");
  check("su(3-10) ★店舗情報・猶予・スマホ画面: set_store_receipt_profile 4 引数（reg_no／footer は現値）・set_penalty_config 12 引数（late_grace_min 5・他は既定）・set_store_mine_settings 差分 2 キー（payslip 'net_only'・drink_claim 'on'）＝いずれも settings 群・未入力なら 0 本",
    !!receipt && receipt.group === "settings" && receipt.args?.p_address === "東京都新宿区" && receipt.args?.p_tel === "03-0000-0000" && receipt.args?.p_reg_no === "T1234567890123" && receipt.args?.p_footer === "飲食代"
    && !!pen && pen.group === "settings" && Object.keys(pen.args!).length === 12 && pen.args?.p_late_grace_min === 5 && pen.args?.p_hours_per_shift === 5 && pen.args?.p_norm_on === true
    && !!mine && mine.group === "settings" && JSON.stringify(mine.args?.p_settings) === JSON.stringify({ payslip_visibility: "net_only", drink_claim: "on" })
    && !std.some((s) => ["receipt", "penalty", "mine"].includes(s.key)) && ordered(rc));
  const cf = planOf("cabaret", base, { cardFee: { on: true, rate: 4 } });
  check("su(3-11) カード手数料: ON→set_store_pricing p_card_tax_rate 4・OFF→0（現値 5 は使わない）・丸めは現値", cf.find((s) => s.key === "pricing")?.args?.p_card_tax_rate === 4 && planOf("cabaret", base, { cardFee: { on: false, rate: 4 } }).find((s) => s.key === "pricing")?.args?.p_card_tax_rate === 0 && cf.find((s) => s.key === "pricing")?.args?.p_round_unit === 100);
  const barP = planOf("bar");
  check("su(3-12) ★バー＝bar_staffback: テーブルチャージ 1,100（set 60 分扱い・延長 0）・サービス料 0・指名料なし・プラン「標準」時給 1,600・席 卓 5＋カウンター 1・商品 29", barP.find((s) => s.key === "time_pricing")?.args?.p_set_fee === 1100 && barP.find((s) => s.key === "time_pricing")?.args?.p_set_min === 60 && barP.find((s) => s.key === "time_pricing")?.args?.p_ext_fee === 0
    && barP.find((s) => s.key === "pricing")?.args?.p_service_rate === 0 && barP.find((s) => s.key === "pricing")?.args?.p_hon_fee === 0 && barP.find((s) => s.key === "comp_0")?.args?.p_base === 1600 && seatsOf(composeDraft("bar", defaultFeaturesOf("bar")).seats).map((s) => s.kind).join() === "卓,卓,卓,卓,卓,カウンター");
}

// (4) 写像・補助
{
  check("su(4-1) ★30 時間制: 01:00→25:00・00:00→24:00・05:00→29:00・23:00 は不変・bizNote「翌 1:00 までを前日の営業として集計します」／「当日中に閉店」", to30h("20:00", "01:00") === "25:00" && to30h("19:00", "00:00") === "24:00" && to30h("20:00", "05:00") === "29:00" && to30h("18:00", "23:00") === "23:00"
    && bizNoteOf("20:00", "01:00") === "翌 1:00 までを前日の営業として集計します" && bizNoteOf("18:00", "23:00") === "当日中に閉店");
  const cab = planOf("cabaret");
  const h0 = cab.find((s) => s.key === "hours_0")!;
  check("su(4-2) 営業時間 step＝テンプレ 20:00〜25:00・7 曜日・cutoff 06:00", h0.args?.p_open_hm === "20:00" && h0.args?.p_close_hm === "25:00" && cab.filter((s) => s.rpc === "set_store_business_hours").map((s) => s.args?.p_dow).join() === "0,1,2,3,4,5,6" && cab.find((s) => s.key === "cutoff")?.args?.p_hm === "06:00");
  check("su(4-3) ★back.type 写像: none→rate 0 既定／fixed 300→unit4 同額／unit4→unit4（本指名 500／場内 400／同伴 500／フリー 300）／sale_pct 10→rate 10／product_specific→既定／不明→unsupported",
    JSON.stringify(backArgsOf({ type: "none" })) === JSON.stringify({ back_mode: "rate", back_value: 0, unit4: null, unsupported: false, isDefault: true })
    && JSON.stringify(backArgsOf({ type: "fixed", value: 300 }).unit4) === JSON.stringify({ hon: 300, jonai: 300, dohan: 300, free: 300 })
    && JSON.stringify(backArgsOf({ type: "unit4", value: { hon: 500, jonai: 400, dohan: 500, free: 300 } }).unit4) === JSON.stringify({ hon: 500, jonai: 400, dohan: 500, free: 300 })
    && backArgsOf({ type: "sale_pct", value: 10 }).back_value === 10 && backArgsOf({ type: "sale_pct", value: 10 }).back_mode === "rate" && backArgsOf({ type: "product_specific" }).isDefault === true && backArgsOf({ type: "gross_profit_pct", value: 30 }).unsupported === true);
  const d = composeDraft("cabaret", defaultFeaturesOf("cabaret"));
  const inc = productsPlanOf(d.products).included;
  const rows = inc.map((p, i) => ({ id: `id${i}`, name: p.name, type: p.type, category: p.category, category_id: null, price: p.price, hon_pt: 0, reorder_point: null, back_exempt_from_split: false, is_active: true }));
  const ov = productOverrideArgs("s", d.products, rows);
  const cdm = ov.find((o) => o.name === "Cast Drink M")!;
  check("su(4-4) ★上書き引数＝back 非既定か本指名pt>0 の商品だけ・15 引数・p_id は行から・cost はテンプレ・Cast Drink M＝unit4 500/400/500/300・hon_pt 2・黒霧島＝rate 10・pt 2", ov.length === inc.filter((p) => !p.back.isDefault || p.hon_pt > 0).length && ov.every((o) => Object.keys(o.args).length === 15 && typeof o.args.p_id === "string")
    && !!cdm && cdm.args.p_back_mode === "unit4" && JSON.stringify(cdm.args.p_unit4) === JSON.stringify({ hon: 500, jonai: 400, dohan: 500, free: 300 }) && cdm.args.p_hon_pt === 2 && ov.find((o) => o.name === "黒霧島")?.args.p_back_mode === "rate" && ov.find((o) => o.name === "黒霧島")?.args.p_back_value === 10 && ov.find((o) => o.name === "黒霧島")?.args.p_hon_pt === 2);
  const pv = previewLinesOf(d.plans[0], d.products);
  check("su(4-5) ★1 日の報酬の目安（モック previewHTML）: 時給 3,000×5＝15,000・本指名 1,200・場内 600・Cast Drink S 4 杯（本指名席 300×4＝1,200）＝合計 18,000", JSON.stringify(pv.lines) === JSON.stringify([["時給 3,000円 × 5時間", 15000], ["本指名 1 件", 1200], ["場内指名 1 件", 600], ["Cast Drink S 4 杯（本指名席）", 1200]]) && pv.total === 18000, JSON.stringify(pv));
  const later = laterDefaultsOf("cabaret", d, CUR);
  check("su(4-6) ★あとで設定の既定値: 料金＝テンプレ・商品 取り込む・プラン＝下書き・実打刻・猶予 null（書かない）・ノルマ OFF・送り 1,000・卓会計・カード手数料＝現値 5%（ON）・売掛＝テンプレ ar なし→'disabled'・スマホ画面＝既定＋シフト希望", later.pricing.set_fee === 4500 && later.includeProducts === true && later.plans.length === 1 && later.payTimeBasis === "punch" && later.lateGraceMin === null && later.norms === false && later.okuriBase === 1000
    && later.billingMode === "table" && JSON.stringify(later.cardFee) === JSON.stringify({ on: true, rate: 5 }) && later.receivablePolicy === "disabled" && later.mine.shift_request_mode === "shift" && later.mine.reservation_request === true
    && laterDefaultsOf("lounge", composeDraft("lounge", defaultFeaturesOf("lounge")), { ...CUR, card_tax_rate: 0 }).receivablePolicy === "customer_only" && laterDefaultsOf("lounge", composeDraft("lounge", defaultFeaturesOf("lounge")), { ...CUR, card_tax_rate: 0 }).cardFee.on === false);
  check("su(4-7) systemsOf: 時給・各種バック ON・スライド／ボーナス／ノルマは引数・他 OFF（9 キー全部 boolean）", (() => { const s = systemsOf({ vip: "none", nom: "flat", slide: true, newbie: false, bonus: false }, true); return s.sys_hourly && s.sys_backs && s.sys_sales_slide && !s.sys_bonus && s.sys_norms && !s.sys_sales_rate && !s.sys_points && !s.sys_point_slide && !s.sys_penalties && SYSTEM_KEYS.every((k) => typeof s[k] === "boolean"); })());
  check("su(4-8) ★次にやること（モック vDone）: 招待→/casts・シフト→/shift・在庫（在庫管理の商品があるとき）→/master/stock・レジ端末→owner は /master/system#devices・非 owner は /register", nextActionsOf(12, true).map((a) => a.href).join() === "/casts,/shift,/master/stock,/master/system#devices" && nextActionsOf(0, false).map((a) => a.href).join() === "/casts,/shift,/register"
    && nextActionsOf(12, true)[2].sub === "在庫管理の商品 12 品" && nextActionsOf(0, true).map((a) => a.title).join("／") === "キャスト・スタッフを招待する／シフトを作って確定する／レジ端末でログインする");
}

// (5) 画面本文の pin
{
  const wz = fs.readFileSync("app/(manage)/setup/setup-wizard.tsx", "utf8"), pg = fs.readFileSync("app/(manage)/setup/page.tsx", "utf8");
  check("su(5-1) ★ウィザード＝SETUP_STEPS（6）を描く・ステッパー aria-current・進捗バー role=progressbar・STEP 1〜6 の見出し", wz.includes("SETUP_STEPS.map(([label, sub], i)") && wz.includes('aria-current={i === step ? "step" : undefined}') && wz.includes('role="progressbar"')
    && ["STEP 1　お店について", "STEP 2　料金", "STEP 3　商品", "STEP 4　キャスト報酬", "STEP 5　会計と運用", "STEP 6　確認"].every((h) => wz.includes(`>${h}</h2>`)));
  const wzBody = wz.replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, ""); // 本文＝コメント（行頭 // と {/* */}）を除いた描画部
  const leaked = SETUP_HIDDEN_ITEMS.map((x) => x.label).filter((l) => wzBody.includes(l));
  check("su(5-2) ★C／D 非表示: SETUP_HIDDEN_ITEMS の見出し 10 件がウィザード本文に無い（インボイス／締め日／消費税／支払い方法／打刻／ランク別／多段／売上歩合のみ／自動切替／スタッフバック）", leaked.length === 0, leaked.join("・"));
  check("su(5-3) ★途中保存＝localStorage（店ごとのキー・復元は hydration 後・完了で削除・「最初からやり直す」）", wz.includes("nox.setup.v5.draft.${storeId}") && wz.includes("window.localStorage.getItem(DRAFT_KEY(store.id))") && wz.includes("window.localStorage.setItem(DRAFT_KEY(store.id), JSON.stringify(d))") && (wz.match(/window\.localStorage\.removeItem\(DRAFT_KEY\(store\.id\)\)/g) ?? []).length === 2 && wz.includes("最初からやり直す"));
  check("su(5-4) ★あとで設定＝STEP 2〜5 の footnav（laterDefaultsOf の値を入れて進む・確認表に「あとで設定」・「ここで設定する」で解除）", wz.includes("{step > 0 && step < LAST && <button") && wz.includes("onClick={skipLater}>あとで設定</button>") && wz.includes("if (step === 1) setPricing(later.pricing);") && wz.includes("if (step === 4) { setBillingMode(later.billingMode);") && wz.includes("ここで設定する"));
  check("su(5-5) ★完了画面＝「お店の準備ができました」＋nextActionsOf の導線（Link「開く」）・router.push('/dashboard') は無い・下書きを消す", wz.includes("お店の準備ができました") && wz.includes("const acts = nextActionsOf(includeProducts ? pp.stock : 0, isOwner);") && wz.includes(">開く</Link>") && !wz.includes('router.push("/dashboard")'));
  check("su(5-6) ★達成ボーナスの実行＝set_comp_plan の戻り（plan id）を created[key] に取り、argsOf 'comp_component' は p_plan_id を差して呼ぶ（無ければ skip）", wz.includes("created[st.key] = data;") && wz.includes('st.argsOf === "comp_component"') && wz.includes("{ ...(st.args ?? {}), p_plan_id: planId }") && wz.includes("プランが作られていない"));
  check("su(5-7) 勤務時間の数え方＝既定 実打刻（裁定324）・業態／特徴の変更で調整値を初期値に戻す warn・特徴 5 行（VIP 席／指名料／売上スライド／新人保証／達成ボーナス）", wz.includes('useState<"punch" | "shift">("punch")') && wz.includes('ariaLabel="勤務時間の計算基準"') && wz.includes("業態や特徴を変えると、料金・商品・報酬で調整した値は初期値に戻ります。")
    && ['title="VIP 席"', 'title="指名料"', 'title="売上スライド"', 'title="新人保証"', 'title="達成ボーナス"'].every((s) => wz.includes(s)));
  const rpcs = [...wz.matchAll(/supabase\.rpc\(("[a-z_]+")/g)].map((m) => m[1]).sort();
  check("su(5-8) 直接呼ぶ RPC＝set_product（上書き）と計画の st.rpc だけ・計画の RPC 名は既存 17 本の範囲（set_product は上書き）", JSON.stringify([...new Set(rpcs)]) === JSON.stringify(['"set_product"']) && (wz.match(/supabase\.rpc\(st\.rpc/g) ?? []).length === 2
    && [...new Set(BIZ_ALL.flatMap((b) => planOf(b, { vip: "dedicated", nom: "flat", slide: true, newbie: true, bonus: true }, { tel: "1", address: "a", lateGraceMin: 5, payTimeBasis: "shift", mine: { ...MINE_SETTINGS_DEFAULT, ranking: true } }).map((s) => s.rpc)))].sort().join() === "flag_set,product_bulk_insert,set_comp_component,set_comp_plan,set_penalty_config,set_pricing_rule,set_product,set_seat,set_store_biz_cutoff,set_store_business_hours,set_store_mine_settings,set_store_pay_time_basis,set_store_pricing,set_store_profile,set_store_receipt_profile,set_store_receivable_policy,set_store_time_pricing");
  check("su(5-9) page.tsx＝現値に receipt 4 項目（settings_json）と mine（mineSettingsOf）を足して渡す・isOwner・owner 以外は redirect", pg.includes('receipt: { address: str("receipt_address"), tel: str("receipt_tel"), reg_no: str("invoice_reg_no"), footer: str("receipt_footer") }') && pg.includes("mine: mineSettingsOf(sj)") && pg.includes('isOwner={role === "owner"}') && pg.includes('if (role !== "owner") redirect('));
}

if (fails.length) {
  console.log(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.log(` - ${f}`);
  process.exit(1);
}
console.log(`verify:nox-setup ALL PASS (${pass} assertions)`);
console.log("初期設定 v5(裁定331・W5-1): JSON v2 sha・業態 5×特徴→6 テンプレの計画配列（順序・件数・冪等ガード）・特徴の分岐（VIP 専用／加算・指名料なし・スライド 3 段・新人保証・達成ボーナス 1 段）・写像・目安・あとで設定・次にやること・画面 pin（6 ステップ・C／D 非表示・途中保存）");
