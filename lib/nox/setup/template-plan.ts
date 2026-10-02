// 初期設定ウィザード（裁定270-1／271 → ★裁定331 初期設定 v5・便 W5-1・2026-10-01）の純関数: テンプレ JSON（lib/nox/setup/templates/v2.json＝正本モック
// docs/handoff/mock/20261001/nox-setup-v5.html の SRC 6 店をそのまま JSON 化）＋業態・特徴・各 STEP の選択 → 「書込計画」＝271-12 の順に並んだ RPC 呼び出しの配列。
// DB を知らない（import は型と JSON と純関数だけ）。
//   331-1 業態 5（キャバクラ／ラウンジ／ガールズバー／スナック／バー）× 特徴（VIP 席の取り方／指名料／売上スライド／新人保証／達成ボーナス）→ テンプレ 6 種のうち土台 1 本＋特徴で組み立て
//         （モック build() の写経＝composeDraft）。ラウンジの土台＝cabaret_vip（モック BIZ.lounge.base＝NOIR）。
//   331-2 達成ボーナス多段／売上歩合のみ／スタッフへの商品バック／新人保証のプラン自動切替＝未実装（非表示・SETUP_HIDDEN_ITEMS）。達成ボーナスは 1 段（set_comp_component amount・目標はキャスト別目標）。
//   331-3 売上スライド＝comp_plans.sales_slide（3 段・その日の売上で当日の時給＝現行の判定。モックの「前月の売上」文言は現行に合わせる）。
//   331-4 勤務時間の数え方＝裁定324（既定 実打刻・'shift' のときだけ set_store_pay_time_basis(…,'now')）。
//   W5-1 の範囲＝A のみ（既存 RPC・新 route 0・migration 0）。B（曜日時間帯の料金行・ランク別指名料・個別商品選択・契約の形）＝W5-2。C（インボイス登録日・締め日／支払日・内税・支払い方法・打刻方法）＝0164 以降。
//   271-3 営業時間＝set_store_business_hours を曜日 7 回・close は 30 時間制。cutoff＝set_store_biz_cutoff。271-4 席＝set_seat（既存 0 のときだけ）。
//   271-5 料金＝set_store_pricing（無い値は現値マージ）・set_store_time_pricing・set_pricing_rule（VIP 専用料金表＝seat_kind 'VIP' の set／extension・VIP 加算＝vip_charge）。
//   271-6 報酬＝set_comp_plan（プランごと・新人保証は 2 本目）→ 達成ボーナス 1 段＝set_comp_component（plan id は実行時＝argsOf 'comp_component'）。
//   271-7 商品＝product_bulk_insert 1 発 → back／本指名pt 持ちは set_product で個別上書き。既存 products 0 のときだけ。
//   271-8 back.type 写像＝none→rate 0／fixed→unit4（4 種同額）／unit4→unit4（本指名／場内／同伴／フリー）／sale_pct→rate+back_value／product_specific→既定／他→未対応（rate 0）。
//   271-13 ノルマ・罰金・売掛負担は投入しない（ノルマは sys_norms のスイッチだけ）。
import raw from "./templates/v2.json";
import { DEFAULT_SETTLEMENT_PRESETS } from "../payroll/settlement"; // ★0154 D4
import { MINE_SETTINGS_DEFAULT, mineSettingsPatchOf, type MineSettings } from "../store/mine-settings"; // ★0160（326 の 8 キー）
import type { SystemKey } from "../store-systems";

// ── 業態（モック BIZ の 5 件・順序・文言そのまま）。templateId＝土台テンプレ ──
export type BizType = "cabaret" | "girlsbar" | "snack" | "lounge" | "bar";
export const BIZ_TYPES: ReadonlyArray<{ key: BizType; label: string; sub: string; templateId: string }> = [
  { key: "cabaret", label: "キャバクラ", sub: "セット・指名・同伴中心", templateId: "cabaret_standard" },
  { key: "lounge", label: "ラウンジ", sub: "高単価・VIP寄り", templateId: "cabaret_vip" }, // モック BIZ.lounge.base＝NOIR（VIP 専用料金）
  { key: "girlsbar", label: "ガールズバー", sub: "チャージ＋ドリンク中心", templateId: "girlsbar_standard" },
  { key: "snack", label: "スナック", sub: "セット＋ボトル中心", templateId: "snack_standard" },
  { key: "bar", label: "バー", sub: "商品会計＋チャージ中心", templateId: "bar_staffback" },
];

/** 6 ステップ（モック STEPS の題。副題は C 項目（締め日／税・支払い方法・打刻）が非表示のため W5-1 で言い換え＝仮決め） */
export const SETUP_STEPS: ReadonlyArray<readonly [string, string]> = [
  ["お店について", "業態・特徴・店舗情報"],
  ["料金", "セット・延長・指名料"],
  ["商品", "名前・価格・バック"],
  ["キャスト報酬", "時給・バック・控除"],
  ["会計と運用", "会計・キャストのスマホ画面"],
  ["確認", "見直して完了"],
];

/** 331-2／setup_map §8 の C／D＝本便では画面に出さない項目（suite がウィザード本文に無いことを pin） */
export const SETUP_HIDDEN_ITEMS: ReadonlyArray<{ label: string; cls: "C" | "D"; when: string }> = [
  { label: "インボイスの登録", cls: "C", when: "0164（登録日の器）" },
  { label: "給与の締め日と支払日", cls: "C", when: "裁定待ち（pay_cycle・第 2 期候補）" },
  { label: "消費税の表示", cls: "C", when: "裁定待ち（内税表示）" },
  { label: "お客様の支払い方法", cls: "C", when: "0164（payment_methods）" },
  { label: "出退勤の打刻", cls: "C", when: "0164（punch_methods）" },
  { label: "キャストのランク別", cls: "D", when: "W5-2（ランク行＋ランク別ルールの結線）" },
  { label: "達成ボーナスの多段", cls: "D", when: "第 2 期" },
  { label: "売上歩合のみ", cls: "D", when: "第 2 期" },
  { label: "新人保証のプラン自動切替", cls: "D", when: "第 2 期（期間満了＝現行）" },
  { label: "スタッフへの商品バック", cls: "D", when: "第 2 期（接客スタッフをキャストとして登録）" },
];

// ── テンプレ JSON（v2）の型 ──
export type TemplateBack = { type: string; value?: unknown };
export type TemplateProduct = {
  name: string; accounting_class: string; display_category: string; cost_yen: number | null; sale_price_yen: number;
  inventory_managed?: boolean; hon_pt?: number; back: TemplateBack; status?: string;
};
export type TemplateRule = { name: string; iso_weekdays: number[]; start_min: number; end_min: number; seat: "normal" | "vip" | "any"; set_min: number; set_fee: number; extension_30_fee: number; vip_surcharge: number; enabled: boolean };
export type TemplateRank = { name: string; main_nomination_yen: number; in_house_nomination_yen: number; accompaniment_yen: number };
export type TemplateBonus = { metric: string; threshold: number; add_yen: number };
export type TemplateSlide = { at: number; wage: number };
export type TemplatePlan = { name: string; hourly_yen: number; main_nomination_back: number; in_house_nomination_back: number; accompaniment_back: number; achievement_bonus: TemplateBonus[]; sales_slide: TemplateSlide[] };
export type SeatCounts = { table_count: number; vip_count: number; counter_count: number };
export type StoreTemplate = {
  template_id: string; store_type: string; template_name: string; assumption?: string;
  business_hours: { open: string; close: string; business_day_cutoff: string };
  features: { vip: "none" | "dedicated" | "surcharge"; nomination: boolean; accounts_receivable: boolean; shift_request_mode: "shift" | "off_only" };
  seats: SeatCounts; service_charge_pct: number;
  pricing_rules: TemplateRule[]; ranks: TemplateRank[]; plans: TemplatePlan[]; products: TemplateProduct[];
};
type RawJson = { schema_version: string; back_types: Record<string, string>; store_templates: StoreTemplate[]; template_policy?: { do_not_auto_enable?: string[] } };
const JSON_ROOT = raw as unknown as RawJson;

export const TEMPLATES_SCHEMA_VERSION = JSON_ROOT.schema_version;
export function allTemplates(): StoreTemplate[] { return JSON_ROOT.store_templates; }
export function templateById(id: string): StoreTemplate | null { return JSON_ROOT.store_templates.find((t) => t.template_id === id) ?? null; }
export function templateOf(biz: BizType): StoreTemplate {
  const id = BIZ_TYPES.find((b) => b.key === biz)!.templateId;
  const t = templateById(id);
  if (!t) throw new Error(`template missing: ${id}`);
  return t;
}

// ── 営業時間（271-3）: close ≤ open なら翌日扱い＝+24h の 30 時間制（"01:00"→"25:00"）。既に 24:00 以上なら不変 ──
const hmToMin = (hm: string): number => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
const minToHm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export function to30h(open: string, close: string): string {
  const o = hmToMin(open), c = hmToMin(close);
  return c <= o && c < 24 * 60 ? minToHm(c + 24 * 60) : close;
}
export function hoursOf(t: StoreTemplate): { open: string; close: string; cutoff: string } {
  return { open: t.business_hours.open, close: t.business_hours.close, cutoff: t.business_hours.business_day_cutoff };
}
/** モック bizNote: 終了が開始より早い＝翌日まで前日の営業として集計 */
export function bizNoteOf(open: string, close: string): string {
  const [oh] = open.split(":").map(Number); const [ch, cm] = close.split(":").map(Number);
  return ch < oh ? `翌 ${ch}:${String(cm).padStart(2, "0")} までを前日の営業として集計します` : "当日中に閉店";
}

// ── 特徴（モック defaultFeat／featLabel の写経）──
export type VipMode = "none" | "dedicated" | "surcharge";
export type NomMode = "none" | "flat" | "rank"; // 'rank' は W5-2 まで画面に出さない（型だけ残す）
export type SetupFeatures = { vip: VipMode; nom: NomMode; slide: boolean; newbie: boolean; bonus: boolean };
export const VIP_MODES: ReadonlyArray<readonly [VipMode, string]> = [["none", "なし"], ["dedicated", "VIP 専用の料金表"], ["surcharge", "通常料金＋VIP 加算"]];
export const NOM_MODES: ReadonlyArray<readonly [NomMode, string]> = [["none", "取らない"], ["flat", "全員同じ額"]]; // 'rank'（キャストのランク別）＝W5-2
export function defaultFeaturesOf(biz: BizType): SetupFeatures {
  const t = templateOf(biz);
  return {
    vip: biz === "lounge" ? "dedicated" : "none",
    nom: biz === "lounge" ? "flat" : t.ranks.length ? "flat" : "none",
    slide: false, newbie: false,
    bonus: t.plans.some((p) => p.achievement_bonus.length > 0),
  };
}
export function featureLabelOf(biz: BizType, f: SetupFeatures): string {
  const x: string[] = [];
  if (f.vip === "dedicated") x.push("VIP専用料金"); if (f.vip === "surcharge") x.push("VIP加算");
  if (f.nom === "flat") x.push("指名料あり"); if (f.nom === "rank") x.push("ランク別指名料");
  if (f.slide) x.push("売上スライド"); if (f.newbie) x.push("新人保証"); if (f.bonus) x.push("達成ボーナス");
  return `${BIZ_TYPES.find((b) => b.key === biz)!.label}${x.length ? "｜" + x.join("・") : ""}`;
}

// ── 下書き（業態＋特徴 → 料金行・指名料・商品・プラン＝モック build() の写経）──
export type DraftRule = { name: string; weekdays: number[]; start_min: number; end_min: number; seat: "normal" | "vip" | "any"; set_min: number; set_fee: number; ext_fee: number; vip_surcharge: number; enabled: boolean };
export type DraftRank = { name: string; hon: number; jonai: number; dohan: number };
export type DraftPlan = { name: string; base: number; hon: number; jonai: number; dohan: number; bonus: TemplateBonus[]; slide: TemplateSlide[] };
export type SetupDraft = { service: number; seats: SeatCounts; rules: DraftRule[]; ranks: DraftRank[]; plans: DraftPlan[]; products: TemplateProduct[] };
const ruleOf = (r: TemplateRule): DraftRule => ({ name: r.name, weekdays: [...r.iso_weekdays], start_min: r.start_min, end_min: r.end_min, seat: r.seat === "any" ? "normal" : r.seat, set_min: r.set_min, set_fee: r.set_fee, ext_fee: r.extension_30_fee, vip_surcharge: 0, enabled: r.enabled });
const rankOf = (r: TemplateRank): DraftRank => ({ name: r.name, hon: r.main_nomination_yen, jonai: r.in_house_nomination_yen, dohan: r.accompaniment_yen });
export const SLIDE_SOURCE_BASE = 2500; // cabaret_slide（ACE）の基本時給＝スライドの差分をこの値から取る（モック build: base+(x[1]-2500)）
export function composeDraft(biz: BizType, f: SetupFeatures): SetupDraft {
  const t = templateOf(biz);
  const vipT = templateById("cabaret_vip")!, stdT = templateById("cabaret_standard")!, slideT = templateById("cabaret_slide")!;
  const seats: SeatCounts = { ...t.seats };
  let rules = t.pricing_rules.filter((r) => r.seat !== "vip").map(ruleOf);
  if (f.vip === "dedicated") {
    const vipSrc = biz === "lounge" || biz === "cabaret" ? vipT.pricing_rules.filter((r) => r.seat === "vip").map((r) => ({ ...ruleOf(r), seat: "vip" as const })) : [];
    const base = rules.find((r) => r.enabled) ?? rules[0];
    const add = vipSrc.length ? vipSrc
      : [{ name: "VIP", weekdays: [1, 2, 3, 4, 5, 6, 7], start_min: base.start_min, end_min: base.end_min, seat: "vip" as const, set_min: base.set_min, set_fee: Math.round(base.set_fee * 1.5 / 500) * 500, ext_fee: Math.round(base.ext_fee * 1.5 / 500) * 500, vip_surcharge: 0, enabled: true }];
    rules = rules.concat(add);
    if (!seats.vip_count) seats.vip_count = 2;
  } else if (f.vip === "surcharge") {
    rules = rules.map((r) => ({ ...r, seat: "any" as const, vip_surcharge: 5000 }));
    if (!seats.vip_count) seats.vip_count = 2;
  } else seats.vip_count = 0;
  const flat = t.ranks[0] ?? stdT.ranks[0];
  const ranks: DraftRank[] = f.nom === "none" ? [] : f.nom === "rank" ? vipT.ranks.map(rankOf) : [{ ...rankOf(flat), name: "default" }];
  const p0 = t.plans[0];
  const plan: DraftPlan = {
    name: "標準", base: p0.hourly_yen, hon: p0.main_nomination_back, jonai: p0.in_house_nomination_back, dohan: p0.accompaniment_back,
    bonus: f.bonus ? (p0.achievement_bonus.length ? p0.achievement_bonus : stdT.plans[0].achievement_bonus).map((b) => ({ ...b })) : [],
    slide: f.slide ? slideT.plans[0].sales_slide.map((x, i) => (i === 0 ? { at: 0, wage: p0.hourly_yen } : { at: x.at, wage: p0.hourly_yen + (x.wage - SLIDE_SOURCE_BASE) })) : [],
  };
  if (f.nom !== "none" && !plan.hon) { plan.hon = 1000; plan.jonai = 500; plan.dohan = 1500; }
  if (f.nom === "none") { plan.hon = 0; plan.jonai = 0; plan.dohan = 0; }
  const plans = [plan];
  if (f.newbie) plans.push({ ...plan, name: "新人保証", base: plan.base + 500, bonus: [], slide: [] });
  return { service: t.service_charge_pct, seats, rules, ranks, plans, products: t.products.map((p) => ({ ...p })) };
}

// ── 商品（271-7〜271-9）: accounting_class → products.type（food／other も投入＝裁定272-4）──
export const CLASS_TO_TYPE: Record<string, "drink" | "champ" | "bottle" | "food" | "other" | null> = {
  drink: "drink", champagne: "champ", bottle: "bottle", wine: "bottle", food: "food", other: "other",
};
export type Unit4 = { hon: number; jonai: number; dohan: number; free: number };
export type BackArgs = { back_mode: "rate" | "unit4"; back_value: number | null; unit4: Unit4 | null; unsupported: boolean; isDefault: boolean };
/** 271-8 の写像（v2: unit4＝指名別を追加・tier は v2 に無い） */
export function backArgsOf(back: TemplateBack | undefined): BackArgs {
  const def: BackArgs = { back_mode: "rate", back_value: 0, unit4: null, unsupported: false, isDefault: true };
  if (!back) return def;
  switch (back.type) {
    case "none": return def;
    case "fixed": { const v = Number(back.value ?? 0); return v === 0 ? def : { back_mode: "unit4", back_value: null, unit4: { hon: v, jonai: v, dohan: v, free: v }, unsupported: false, isDefault: false }; }
    case "unit4": { const u = (back.value ?? {}) as Partial<Unit4>; const unit4 = { hon: Number(u.hon ?? 0), jonai: Number(u.jonai ?? 0), dohan: Number(u.dohan ?? 0), free: Number(u.free ?? 0) }; return { back_mode: "unit4", back_value: null, unit4, unsupported: false, isDefault: false }; }
    case "sale_pct": { const v = Number(back.value ?? 0); return { back_mode: "rate", back_value: v, unit4: null, unsupported: false, isDefault: v === 0 }; }
    case "product_specific": return def;
    default: return { ...def, unsupported: true };
  }
}
export type ProductItem = { name: string; type: "drink" | "champ" | "bottle" | "food" | "other"; price: number; cost: number | null; category: string; back: BackArgs; hon_pt: number; stock: boolean };
export type ProductsPlan = { included: ProductItem[]; excluded: Record<string, number>; excludedTotal: number; unsupportedBack: number; overrides: number; stock: number };
const needsOverride = (p: ProductItem) => !p.back.isDefault || p.hon_pt > 0;
export function productsPlanOf(products: TemplateProduct[]): ProductsPlan {
  const included: ProductItem[] = [];
  const excluded: Record<string, number> = {};
  let unsupportedBack = 0;
  for (const p of products) {
    if (p.status && p.status !== "active") continue;
    const type = CLASS_TO_TYPE[p.accounting_class] ?? null;
    if (!type) { excluded[p.accounting_class] = (excluded[p.accounting_class] ?? 0) + 1; continue; }
    const back = backArgsOf(p.back);
    if (back.unsupported) unsupportedBack++;
    included.push({ name: p.name, type, price: Math.round(p.sale_price_yen), cost: p.cost_yen == null ? null : Math.round(p.cost_yen), category: p.display_category, back, hon_pt: Number(p.hon_pt ?? 0), stock: !!p.inventory_managed });
  }
  const excludedTotal = Object.values(excluded).reduce((a, b) => a + b, 0);
  return { included, excluded, excludedTotal, unsupportedBack, overrides: included.filter(needsOverride).length, stock: included.filter((p) => p.stock).length };
}
/** 業態別の除外件数（accounting_class が写像に無いもの＝v2 では 0） */
export function excludedFoodCountOf(biz: BizType): number { return productsPlanOf(templateOf(biz).products).excludedTotal; }
/** 商品の分類（モック STEP 3 のチップ＝display_category の出現順） */
export function productCategoriesOf(products: TemplateProduct[]): string[] { return [...new Set(products.map((p) => p.display_category))]; }

// ── 料金（271-5）──
export type PricingInput = {
  set_min: number; set_fee: number; ext_min: number; ext_fee: number;
  hon_fee: number; jonai_fee: number; dohan_fee: number; service_rate: number;
  ext2: { min: number; fee: number } | null; // 延長 2 段目（v2 では無し・器は残す）
  vip_charge: number | null; // VIP 加算（pricing_rules fee_kind='vip_charge'）
  vip_rows: { set_min: number; set_fee: number; ext_fee: number } | null; // VIP 専用料金表（pricing_rules seat_kind='VIP' の set／extension）
};
/** 下書き → 料金入力（先頭の有効な通常席行＝店既定の 1 行。曜日時間帯の行は W5-2） */
export function pricingOf(d: SetupDraft): PricingInput {
  const base = d.rules.find((r) => r.enabled && r.seat !== "vip") ?? d.rules.find((r) => r.seat !== "vip") ?? null;
  const vip = d.rules.find((r) => r.enabled && r.seat === "vip") ?? null;
  const r0 = d.ranks[0] ?? null;
  return {
    set_min: base?.set_min || 60, set_fee: base?.set_fee ?? 0, ext_min: 30, ext_fee: base?.ext_fee ?? 0,
    hon_fee: r0?.hon ?? 0, jonai_fee: r0?.jonai ?? 0, dohan_fee: r0?.dohan ?? 0, service_rate: d.service,
    ext2: null,
    vip_charge: base && base.vip_surcharge > 0 ? base.vip_surcharge : null,
    vip_rows: vip ? { set_min: vip.set_min || 60, set_fee: vip.set_fee, ext_fee: vip.ext_fee } : null,
  };
}

// ── 席（271-4） ──
export function seatsOf(s: SeatCounts): Array<{ name: string; kind: "卓" | "カウンター" | "VIP" }> {
  const out: Array<{ name: string; kind: "卓" | "カウンター" | "VIP" }> = [];
  for (let i = 1; i <= s.table_count; i++) out.push({ name: `卓${i}`, kind: "卓" });
  for (let i = 1; i <= s.vip_count; i++) out.push({ name: `VIP${i}`, kind: "VIP" });
  for (let i = 1; i <= s.counter_count; i++) out.push({ name: `カウンター${i}`, kind: "カウンター" });
  return out;
}

// ── 1 日の報酬の目安（モック previewHTML の写経・時間報酬 5 時間・本指名 1・場内 1・ドリンク 4 杯）──
export const PREVIEW_HOURS = 5, PREVIEW_CUPS = 4;
export function previewLinesOf(p: DraftPlan, products: TemplateProduct[]): { lines: Array<[string, number]>; total: number; drink: string | null } {
  const items = productsPlanOf(products).included;
  const drink = items.find((x) => x.type === "drink" && x.back.back_mode === "unit4" && x.back.unit4 && x.back.unit4.hon > 0) ?? null;
  const L: Array<[string, number]> = [[`時給 ${p.base.toLocaleString()}円 × ${PREVIEW_HOURS}時間`, p.base * PREVIEW_HOURS]];
  if (p.hon) L.push(["本指名 1 件", p.hon]);
  if (p.jonai) L.push(["場内指名 1 件", p.jonai]);
  if (drink) L.push([`${drink.name} ${PREVIEW_CUPS} 杯（本指名席）`, drink.back.unit4!.hon * PREVIEW_CUPS]);
  const lines = L.filter((l) => l[1] > 0);
  return { lines, total: lines.reduce((a, l) => a + l[1], 0), drink: drink?.name ?? null };
}

// ── 書込計画（271-12） ──
export type PlanGuard = "seats_empty" | "products_empty" | "plans_empty" | "rules_empty";
export type PlanStep = {
  key: string;
  group: "settings" | "hours" | "seats" | "pricing" | "comp" | "products" | "overrides" | "flags" | "done";
  label: string;
  rpc: string;
  args?: Record<string, unknown>;
  /** 実行時に解決する引数（product_overrides＝bulk 後の products 行から set_product／comp_component＝直前の set_comp_plan が返した plan id） */
  argsOf?: "product_overrides" | "comp_component";
  /** argsOf 'comp_component' のとき: plan id を取る step の key */
  after?: string;
  guard?: PlanGuard;
};
export type ReceivablePolicy = "disabled" | "customer_only" | "cast_liability_allowed";
export const RECEIVABLE_POLICIES = [["customer_only", "客の売掛のみ"], ["cast_liability_allowed", "キャスト負担も可"], ["disabled", "売掛を使わない"]] as const;
export const SYSTEM_DEFAULTS_ON: readonly SystemKey[] = ["sys_hourly", "sys_backs"];
/** 使う制度（sys_* 9・明示 boolean）＝特徴とスイッチから導く（モックに制度パネルは無い。残りは店舗設定 › 利用機能で） */
export function systemsOf(f: SetupFeatures, norms: boolean): Record<SystemKey, boolean> {
  return {
    sys_hourly: true, sys_backs: true, sys_sales_rate: false, sys_points: false,
    sys_sales_slide: f.slide, sys_point_slide: false, sys_norms: norms, sys_penalties: false, sys_bonus: f.bonus,
  };
}
/** 遅刻の猶予（set_penalty_config 12 引数・残り 11 は comp-sections の DEFAULT_PENALTY と同値） */
export const SETUP_PENALTY_DEFAULT = {
  fine_absent: 10000, fine_late: 3000, hours_per_shift: 5, norm_on: true,
  norm_days_flat: 5000, norm_days_per: 2000, norm_dohan_flat: 3000, norm_dohan_per: 1500,
  late_grace_min: 10, early_grace_min: 30, over_grace_min: 90,
} as const;
export type SetupCurrent = {
  card_tax_rate: number; round_unit: number; round_mode: string; time_mode: string; time_per: string;
  receipt: { address: string; tel: string; reg_no: string; footer: string }; // set_store_receipt_profile の現値（4 引数明示送信＝原則7）
  mine: MineSettings; // set_store_mine_settings の差分元
};
export type SetupSelection = {
  storeId: string;
  biz: BizType;
  features: SetupFeatures;
  storeName: string | null; // null＝変更しない
  tel: string; address: string; // 空＝set_store_receipt_profile を呼ばない
  hours: { open: string; close: string; cutoff: string };
  seats: SeatCounts;
  includeProducts: boolean;
  products: TemplateProduct[];
  pricing: PricingInput;
  plans: DraftPlan[];
  payTimeBasis: "punch" | "shift"; // ★裁定324（既定 'punch'＝書かない）
  lateGraceMin: number | null; // null＝触っていない（set_penalty_config を呼ばない）
  norms: boolean; // sys_norms
  okuriBase: number; // settings_json.okuri_base_amount（0〜99999）
  billingMode: "table" | "individual" | "mixed";
  cardFee: { on: boolean; rate: number }; // set_store_pricing p_card_tax_rate（OFF＝0）
  receivablePolicy: ReceivablePolicy;
  mine: MineSettings;
  current: SetupCurrent;
  flags?: Array<{ key: string; enabled: boolean }>;
};

export function buildSetupPlan(sel: SetupSelection): PlanStep[] {
  const s = sel.storeId;
  const steps: PlanStep[] = [];
  // 1) settings_json（biz_type／billing_mode／sys_* 9／送りの基本額・店舗名は変更時のみ）
  const patch: Record<string, unknown> = { biz_type: sel.biz, billing_mode: sel.billingMode, ...systemsOf(sel.features, sel.norms), okuri_base_amount: Math.max(0, Math.min(99999, Math.round(sel.okuriBase || 0))) };
  if (sel.storeName && sel.storeName.trim()) patch.name = sel.storeName.trim();
  steps.push({ key: "settings", group: "settings", label: "店舗設定（業態・会計方式・使う制度・送りの基本額）", rpc: "set_store_profile", args: { p_store_id: s, p_patch: patch } });
  steps.push({ key: "receivable_policy", group: "settings", label: `売掛の受取方針（${RECEIVABLE_POLICIES.find(([k]) => k === sel.receivablePolicy)?.[1] ?? sel.receivablePolicy}）`, rpc: "set_store_receivable_policy",
    args: { p_store_id: s, p_policy: sel.receivablePolicy } });
  if (sel.payTimeBasis === "shift") {
    steps.push({ key: "pay_time_basis", group: "settings", label: "勤務時間の計算基準（確定シフトどおり）", rpc: "set_store_pay_time_basis", args: { p_store_id: s, p_value: "shift", p_apply: "now" } });
  }
  if (sel.tel.trim() || sel.address.trim()) {
    steps.push({ key: "receipt", group: "settings", label: "店舗情報（電話番号・住所＝領収書の表記）", rpc: "set_store_receipt_profile",
      args: { p_store_id: s, p_address: sel.address.trim(), p_tel: sel.tel.trim(), p_reg_no: sel.current.receipt.reg_no, p_footer: sel.current.receipt.footer } });
  }
  if (sel.lateGraceMin != null) {
    steps.push({ key: "penalty", group: "settings", label: `遅刻とみなすまでの猶予 ${sel.lateGraceMin} 分`, rpc: "set_penalty_config",
      args: { p_store_id: s, p_fine_absent: SETUP_PENALTY_DEFAULT.fine_absent, p_fine_late: SETUP_PENALTY_DEFAULT.fine_late, p_hours_per_shift: SETUP_PENALTY_DEFAULT.hours_per_shift, p_norm_on: SETUP_PENALTY_DEFAULT.norm_on,
        p_norm_days_flat: SETUP_PENALTY_DEFAULT.norm_days_flat, p_norm_days_per: SETUP_PENALTY_DEFAULT.norm_days_per, p_norm_dohan_flat: SETUP_PENALTY_DEFAULT.norm_dohan_flat, p_norm_dohan_per: SETUP_PENALTY_DEFAULT.norm_dohan_per,
        p_late_grace_min: Math.max(0, Math.round(sel.lateGraceMin)), p_early_grace_min: SETUP_PENALTY_DEFAULT.early_grace_min, p_over_grace_min: SETUP_PENALTY_DEFAULT.over_grace_min } });
  }
  const minePatch = mineSettingsPatchOf(sel.current.mine, sel.mine);
  if (Object.keys(minePatch).length > 0) {
    steps.push({ key: "mine", group: "settings", label: `キャストのスマホ画面（${Object.keys(minePatch).length} 項目）`, rpc: "set_store_mine_settings", args: { p_store_id: s, p_settings: minePatch } });
  }
  // 2) 営業時間 7 曜日＋cutoff
  const close30 = to30h(sel.hours.open, sel.hours.close);
  for (let dow = 0; dow <= 6; dow++) {
    steps.push({ key: `hours_${dow}`, group: "hours", label: `営業時間（${"日月火水木金土"[dow]}）${sel.hours.open}〜${close30}`, rpc: "set_store_business_hours",
      args: { p_store_id: s, p_dow: dow, p_is_closed: false, p_open_hm: sel.hours.open, p_close_hm: close30 } });
  }
  steps.push({ key: "cutoff", group: "hours", label: `営業日の切替時刻 ${sel.hours.cutoff}`, rpc: "set_store_biz_cutoff", args: { p_store_id: s, p_hm: sel.hours.cutoff } });
  // 3) 席（既存 0 のときだけ）
  seatsOf(sel.seats).forEach((seat, i) => {
    steps.push({ key: `seat_${i}`, group: "seats", label: `席 ${seat.name}`, rpc: "set_seat", guard: "seats_empty",
      args: { p_id: null, p_store_id: s, p_name: seat.name, p_kind: seat.kind, p_sort_order: i + 1, p_is_active: true } });
  });
  // 4) 料金
  const p = sel.pricing;
  steps.push({ key: "pricing", group: "pricing", label: "指名料・同伴料・サービス料・カード手数料（無い値は現値）", rpc: "set_store_pricing",
    args: { p_store_id: s, p_hon_fee: p.hon_fee, p_jonai_fee: p.jonai_fee, p_dohan_fee: p.dohan_fee, p_service_rate: p.service_rate,
      p_card_tax_rate: sel.cardFee.on ? sel.cardFee.rate : 0, p_round_unit: sel.current.round_unit, p_round_mode: sel.current.round_mode } });
  steps.push({ key: "time_pricing", group: "pricing", label: `セット ${p.set_min}分 ¥${p.set_fee}・延長 ${p.ext_min}分 ¥${p.ext_fee}`, rpc: "set_store_time_pricing",
    args: { p_store_id: s, p_set_min: p.set_min, p_set_fee: p.set_fee, p_ext_min: p.ext_min, p_ext_fee: p.ext_fee, p_time_mode: sel.current.time_mode, p_time_per: sel.current.time_per } });
  const rule = (key: string, label: string, args: Record<string, unknown>) => steps.push({ key, group: "pricing", label, rpc: "set_pricing_rule", guard: "rules_empty",
    args: { p_id: null, p_store_id: s, p_fee_kind: "set", p_seat_kind: null, p_dow_mask: null, p_time_from_min: null, p_time_to_min: null, p_rank_id: null,
      p_amount: 0, p_duration_min: null, p_priority: 100, p_is_active: true, p_name: label, p_tax_category: "taxable_10", p_category_id: null, p_billing_unit: null, ...args } });
  if (p.ext2) rule("rule_ext2", `延長 ${p.ext2.min}分`, { p_fee_kind: "extension", p_amount: p.ext2.fee, p_duration_min: p.ext2.min });
  if (p.vip_rows) {
    rule("rule_vip_set", `VIP セット ${p.vip_rows.set_min}分`, { p_fee_kind: "set", p_seat_kind: "VIP", p_amount: p.vip_rows.set_fee, p_duration_min: p.vip_rows.set_min });
    rule("rule_vip_ext", "VIP 延長 30分", { p_fee_kind: "extension", p_seat_kind: "VIP", p_amount: p.vip_rows.ext_fee, p_duration_min: 30 });
  }
  if (p.vip_charge != null) rule("rule_vip", "VIP 加算（1人・60分）", { p_fee_kind: "vip_charge", p_seat_kind: "VIP", p_amount: p.vip_charge });
  // 5) 報酬（プランごと・既存 0 のときだけ）→ 達成ボーナス 1 段（plan id は実行時）
  sel.plans.forEach((pl, i) => {
    const slide = pl.slide.filter((x) => x.at > 0).map((x) => ({ at: x.at, wage: x.wage }));
    steps.push({ key: `comp_${i}`, group: "comp", label: `待遇プラン「${pl.name}」時給 ¥${pl.base}・本指名 ¥${pl.hon}／場内 ¥${pl.jonai}／同伴 ¥${pl.dohan}${slide.length ? `・売上スライド ${slide.length} 段` : ""}`, rpc: "set_comp_plan", guard: "plans_empty",
      args: { p_id: null, p_store_id: s, p_name: pl.name, p_base: pl.base, p_hon_back: pl.hon, p_jonai_back: pl.jonai, p_dohan_back: pl.dohan,
        p_sales_slide: slide, p_point_slide: [], p_is_active: true, p_hon_back_mode: "per_count", p_hon_back_rate: null, p_jonai_back_mode: "per_count", p_jonai_back_rate: null,
        p_dohan_back_mode: "per_count", p_dohan_back_rate: null, p_product_back_mode: "product_rule", p_product_back_rate: null, p_product_back_fixed: null } });
    if (pl.bonus.length > 0) {
      const add = Math.max(0, Math.round(pl.bonus[0].add_yen));
      steps.push({ key: `bonus_${i}`, group: "comp", label: `達成ボーナス（${pl.name}）目標達成時 ¥${add}（1 段・目標はキャスト別目標）`, rpc: "set_comp_component", guard: "plans_empty", argsOf: "comp_component", after: `comp_${i}`,
        args: { p_id: null, p_plan_id: null, p_kind: "achievement_bonus", p_mode: "amount", p_amount: add, p_rate: null, p_params: { thresholds: [{ pct: 100, add }] }, p_priority: 100, p_is_active: true } });
    }
  });
  // 6) 商品（既存 0 のときだけ）→ 7) back／本指名pt の上書き
  const pp = productsPlanOf(sel.products);
  if (sel.includeProducts && pp.included.length > 0) {
    steps.push({ key: "products_bulk", group: "products", label: `商品 ${pp.included.length} 件（除外 ${pp.excludedTotal} 件）`, rpc: "product_bulk_insert", guard: "products_empty",
      args: { p_store_id: s, p_items: pp.included.map((x) => ({ name: x.name, type: x.type, price: x.price, cost: x.cost, category: x.category })) } });
    if (pp.overrides > 0) steps.push({ key: "products_overrides", group: "overrides", label: `バック・本指名ptの上書き ${pp.overrides} 件`, rpc: "set_product", argsOf: "product_overrides", guard: "products_empty" });
  }
  // 8) 機能スイッチ（変更分だけ・org 既定行）
  for (const f of sel.flags ?? []) steps.push({ key: `flag_${f.key}`, group: "flags", label: `機能 ${f.key} を ${f.enabled ? "ON" : "OFF"}`, rpc: "flag_set", args: { p_key: f.key, p_store_id: null, p_enabled: f.enabled, p_reason: null } });
  // 9) 最後に setup_done（★裁定285／287-4: slide_apply='next'・★0154 D4: 精算調整のひな形 既定 3 件）
  steps.push({ key: "done", group: "done", label: "初期設定完了（setup_done・slide_apply=next・settlement_presets 既定 3 件）", rpc: "set_store_profile", args: { p_store_id: s, p_patch: { setup_done: true, slide_apply: "next", settlement_presets: DEFAULT_SETTLEMENT_PRESETS } } });
  return steps;
}

/** 実行時: bulk 後の products 行から set_product の引数を組む（back が既定でない・本指名pt>0 の商品だけ・cost はテンプレ値・15 引数） */
export type ProductRow = { id: string; name: string; type: string; category: string | null; category_id: string | null; price: number; hon_pt: number; reorder_point: number | null; back_exempt_from_split: boolean; is_active: boolean };
export function productOverrideArgs(storeId: string, products: TemplateProduct[], rows: ProductRow[]): Array<{ name: string; args: Record<string, unknown> }> {
  const byName = new Map(rows.map((r) => [r.name, r]));
  const out: Array<{ name: string; args: Record<string, unknown> }> = [];
  for (const item of productsPlanOf(products).included) {
    if (!needsOverride(item)) continue;
    const r = byName.get(item.name);
    if (!r) continue;
    out.push({ name: item.name, args: {
      p_id: r.id, p_store_id: storeId, p_type: r.type, p_category: r.category, p_name: r.name, p_price: r.price, p_cost: item.cost,
      p_back_mode: item.back.back_mode, p_back_value: item.back.back_value, p_unit4: item.back.unit4, p_hon_pt: item.hon_pt, p_is_active: r.is_active,
      p_reorder_point: r.reorder_point, p_category_id: r.category_id, p_back_exempt_from_split: r.back_exempt_from_split,
    } });
  }
  return out;
}

/** 表示用: 計画の要約（STEP 6） */
export function planSummaryOf(steps: PlanStep[]): Record<PlanStep["group"], number> {
  const out = { settings: 0, hours: 0, seats: 0, pricing: 0, comp: 0, products: 0, overrides: 0, flags: 0, done: 0 } as Record<PlanStep["group"], number>;
  for (const s of steps) out[s.group]++;
  return out;
}

// ── 「あとで設定」の既定値（STEP 2〜5 を飛ばしたときに入る値＝テンプレ・現行の既定）──
export type LaterDefaults = {
  pricing: PricingInput; // STEP 2
  includeProducts: true; // STEP 3
  plans: DraftPlan[]; payTimeBasis: "punch"; lateGraceMin: null; norms: false; okuriBase: number; // STEP 4
  billingMode: "table"; cardFee: { on: boolean; rate: number }; receivablePolicy: ReceivablePolicy; mine: MineSettings; // STEP 5
};
export const OKURI_BASE_DEFAULT = 1000; // モック comp.okuri
export function laterDefaultsOf(biz: BizType, d: SetupDraft, current: Pick<SetupCurrent, "card_tax_rate" | "mine">): LaterDefaults {
  const t = templateOf(biz);
  return {
    pricing: pricingOf(d),
    includeProducts: true,
    plans: d.plans.map((p) => ({ ...p, bonus: p.bonus.map((b) => ({ ...b })), slide: p.slide.map((x) => ({ ...x })) })),
    payTimeBasis: "punch", lateGraceMin: null, norms: false, okuriBase: OKURI_BASE_DEFAULT,
    billingMode: "table",
    cardFee: { on: current.card_tax_rate > 0, rate: current.card_tax_rate > 0 ? current.card_tax_rate : 4 }, // モック cardRate 4
    receivablePolicy: t.features.accounts_receivable ? "customer_only" : "disabled", // モック ar: store／none → 現行 3 値
    mine: { ...MINE_SETTINGS_DEFAULT, ...current.mine, shift_request_mode: t.features.shift_request_mode },
  };
}

/** 次にやること（完了画面の導線＝モック vDone。在庫は在庫管理の商品があるときだけ） */
export function nextActionsOf(stockCount: number, isOwner: boolean): Array<{ title: string; sub: string; href: string }> {
  const out = [
    { title: "キャスト・スタッフを招待する", sub: "プラン・ランク・契約の形はここで選びます", href: "/casts" },
    { title: "シフトを作って確定する", sub: "給与は確定シフトの時間で計算します", href: "/shift" },
  ];
  if (stockCount > 0) out.push({ title: "在庫の数を入れる", sub: `在庫管理の商品 ${stockCount} 品`, href: "/master/stock" });
  out.push({ title: "レジ端末でログインする", sub: isOwner ? "キオスク端末の登録もここから" : "iPad・PC どちらでも使えます", href: isOwner ? "/master/system#devices" : "/register" });
  return out;
}
