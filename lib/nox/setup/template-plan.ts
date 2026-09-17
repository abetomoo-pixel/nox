// 初期設定ウィザード（裁定270-1／271）の純関数: テンプレ JSON（lib/nox/setup/templates/v1.json＝正本・271-1）＋選択 →
// 「書込計画」＝271-12 の順に並んだ RPC 呼び出しの配列。DB を知らない（import は型と JSON だけ）。
//   271-2 bar は空テンプレ（料金 1 行・商品 0）＝JSON に追記せず client で空を返す。
//   271-3 営業時間＝set_store_business_hours を曜日 7 回・close は 30 時間制（02:00→26:00）。cutoff＝set_store_biz_cutoff。
//   271-4 席＝set_seat ループ（既存 seats が 0 のときだけ＝guard "seats_empty"）。
//   271-5 料金＝set_store_pricing（無い値は現値マージ）・set_store_time_pricing・set_pricing_rule（延長 2 段目・VIP チャージ）。
//   271-6 報酬既定＝set_comp_plan（base 時給・指名／場内／同伴＝fixed→per_count）。月額保証は投入しない。
//   271-7 商品＝product_bulk_insert 1 発 → back 持ちは set_product で個別上書き（原価は bulk が product_costs へ）。既存 products 0 のときだけ。
//   271-8 back.type 写像＝none→rate 0／fixed→unit4（4 種同額）／sale_pct→rate+back_value／product_specific→product_rule（プラン側）／
//          tier→最下段の率を sale_pct／gross_profit_pct→未対応（使用 0・rate 0 に落とし unsupported に数える）。
//   271-9 food／other は v1 では投入しない（wine は bottle へ）。271-10 request＝hon。271-11 投入しない項目は本ファイルで触らない。
//   271-13 ノルマ・罰金・売掛負担は投入しない。
import raw from "./templates/v1.json";
import type { SystemKey } from "../store-systems";

export type BizType = "cabaret" | "girlsbar" | "snack" | "lounge" | "bar";
export const BIZ_TYPES: ReadonlyArray<{ key: BizType; label: string; sub: string; templateId: string | null }> = [
  { key: "cabaret", label: "キャバクラ", sub: "セット・指名・同伴中心", templateId: "cabaret_standard" },
  { key: "girlsbar", label: "ガールズバー", sub: "チャージ＋ドリンク中心", templateId: "girlsbar_standard" },
  { key: "snack", label: "スナック", sub: "セット＋ボトル中心", templateId: "snack_standard" },
  { key: "lounge", label: "ラウンジ", sub: "セット＋VIP・高単価寄り", templateId: "lounge_standard" },
  { key: "bar", label: "バー", sub: "商品会計＋チャージ中心", templateId: null }, // 271-2 空テンプレ
];

export type TemplateBack = { type: string; value?: unknown; name?: string; tiers?: Array<{ max_sale_yen: number | null; back_pct: number }> };
export type TemplateProduct = {
  name: string; accounting_class: string; display_category: string; cost_yen: number | null; gross_margin_pct?: number | null;
  sale_price_yen: number; inventory_managed?: boolean; back: TemplateBack; status?: string;
};
export type StoreTemplate = {
  template_id: string; store_type: string; template_name: string; assumption?: string;
  business_hours: { open: string; close: string; business_day_cutoff: string };
  features: Record<string, boolean>;
  seats: { table_count: number; vip_count: number; counter_count: number };
  customer_pricing: Record<string, number>;
  compensation_defaults: Record<string, unknown>;
  products: TemplateProduct[];
};
type RawJson = { schema_version: string; back_types: Record<string, string>; store_templates: StoreTemplate[]; template_policy?: { do_not_auto_enable?: string[] } };
const JSON_ROOT = raw as unknown as RawJson;

export const TEMPLATES_SCHEMA_VERSION = JSON_ROOT.schema_version;
export function allTemplates(): StoreTemplate[] { return JSON_ROOT.store_templates; }
export function templateOf(biz: BizType): StoreTemplate | null {
  const id = BIZ_TYPES.find((b) => b.key === biz)?.templateId ?? null;
  return id ? JSON_ROOT.store_templates.find((t) => t.template_id === id) ?? null : null;
}

// ── 営業時間（271-3）: close ≤ open なら翌日扱い＝+24h の 30 時間制（"02:00"→"26:00"）。既に 24:00 以上なら不変 ──
const hmToMin = (hm: string): number => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
const minToHm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export function to30h(open: string, close: string): string {
  const o = hmToMin(open), c = hmToMin(close);
  return c <= o && c < 24 * 60 ? minToHm(c + 24 * 60) : close;
}
export const BAR_DEFAULT_HOURS = { open: "18:00", close: "24:00", business_day_cutoff: "05:00" } as const;
export function hoursOf(t: StoreTemplate | null): { open: string; close: string; cutoff: string } {
  const h = t?.business_hours ?? BAR_DEFAULT_HOURS;
  return { open: h.open, close: h.close, cutoff: h.business_day_cutoff };
}

// ── 商品（271-7〜271-9）: accounting_class → products.type（3 値）・food／other は除外 ──
export const CLASS_TO_TYPE: Record<string, "drink" | "champ" | "bottle" | null> = {
  drink: "drink", champagne: "champ", bottle: "bottle", wine: "bottle", food: null, other: null,
};
export type BackArgs = { back_mode: "rate" | "unit4"; back_value: number | null; unit4: { hon: number; jonai: number; dohan: number; free: number } | null; unsupported: boolean; isDefault: boolean };
/** 271-8 の写像。tier は最下段（tiers[0]）の back_pct を売価% に。 */
export function backArgsOf(back: TemplateBack | undefined, t: StoreTemplate | null): BackArgs {
  const def: BackArgs = { back_mode: "rate", back_value: 0, unit4: null, unsupported: false, isDefault: true };
  if (!back) return def;
  switch (back.type) {
    case "none": return def;
    case "fixed": { const v = Number(back.value ?? 0); return { back_mode: "unit4", back_value: null, unit4: { hon: v, jonai: v, dohan: v, free: v }, unsupported: false, isDefault: false }; }
    case "sale_pct": { const v = Number(back.value ?? 0); return { back_mode: "rate", back_value: v, unit4: null, unsupported: false, isDefault: v === 0 }; }
    case "tier": {
      const champ = (t?.compensation_defaults?.champagne_back ?? null) as TemplateBack | null;
      const tiers = (back.tiers ?? champ?.tiers ?? []);
      const v = Number(tiers[0]?.back_pct ?? 0);
      return { back_mode: "rate", back_value: v, unit4: null, unsupported: false, isDefault: v === 0 };
    }
    case "product_specific": return def; // プラン側 product_rule＝商品の back をそのまま採用
    default: return { ...def, unsupported: true }; // gross_profit_pct 等（使用 0）
  }
}
export type ProductItem = { name: string; type: "drink" | "champ" | "bottle"; price: number; cost: number | null; category: string; back: BackArgs };
export type ProductsPlan = { included: ProductItem[]; excluded: Record<string, number>; excludedTotal: number; unsupportedBack: number; overrides: number };
export function productsPlanOf(t: StoreTemplate | null): ProductsPlan {
  const included: ProductItem[] = [];
  const excluded: Record<string, number> = {};
  let unsupportedBack = 0;
  for (const p of t?.products ?? []) {
    if (p.status && p.status !== "active") continue;
    const type = CLASS_TO_TYPE[p.accounting_class] ?? null;
    if (!type) { excluded[p.accounting_class] = (excluded[p.accounting_class] ?? 0) + 1; continue; }
    const back = backArgsOf(p.back, t);
    if (back.unsupported) unsupportedBack++;
    included.push({ name: p.name, type, price: Math.round(p.sale_price_yen), cost: p.cost_yen == null ? null : Math.round(p.cost_yen), category: p.display_category, back });
  }
  const excludedTotal = Object.values(excluded).reduce((a, b) => a + b, 0);
  return { included, excluded, excludedTotal, unsupportedBack, overrides: included.filter((p) => !p.back.isDefault).length };
}
/** 業態別の食品（food／other）除外件数 */
export function excludedFoodCountOf(biz: BizType): number { return productsPlanOf(templateOf(biz)).excludedTotal; }

// ── 料金（271-5）・報酬（271-6） ──
export type PricingInput = {
  set_min: number; set_fee: number; ext_min: number; ext_fee: number;
  hon_fee: number; jonai_fee: number; dohan_fee: number; service_rate: number;
  ext2: { min: number; fee: number } | null; // 延長 2 段目（pricing_rules）
  vip_charge: number | null; // VIP チャージ（pricing_rules fee_kind='vip_charge'）
};
export function pricingOf(t: StoreTemplate | null): PricingInput {
  if (!t) return { set_min: 60, set_fee: 1000, ext_min: 60, ext_fee: 0, hon_fee: 0, jonai_fee: 0, dohan_fee: 0, service_rate: 10, ext2: null, vip_charge: null }; // 271-2 bar: 料金 1 行（チャージ 1,000 円〜）
  const c = t.customer_pricing;
  const setMin = c.set_60min_yen != null ? 60 : c.set_90min_yen != null ? 90 : 60;
  const setFee = c.set_60min_yen ?? c.set_90min_yen ?? 0;
  const ext30 = c.extension_30min_yen, ext60 = c.extension_60min_yen;
  const ext = ext30 != null ? { min: 30, fee: ext30 } : ext60 != null ? { min: 60, fee: ext60 } : { min: 30, fee: 0 };
  const ext2 = ext30 != null && ext60 != null ? { min: 60, fee: ext60 } : null;
  // 271-10 request＝hon（ガールズバーの request_yen を本指名料に写像）
  const hon = c.main_nomination_yen ?? c.request_yen ?? 0;
  return {
    set_min: setMin, set_fee: setFee, ext_min: ext.min, ext_fee: ext.fee,
    hon_fee: hon, jonai_fee: c.in_house_nomination_yen ?? 0, dohan_fee: c.accompaniment_yen ?? 0,
    service_rate: c.service_charge_pct ?? 10, ext2, vip_charge: c.vip_surcharge_yen ?? null,
  };
}
export type CompInput = { base: number; hon_back: number; jonai_back: number; dohan_back: number } | null;
const fixedOf = (b: unknown): number => { const x = b as TemplateBack | undefined; return x && x.type === "fixed" ? Number(x.value ?? 0) : 0; };
export function compOf(t: StoreTemplate | null): CompInput {
  if (!t) return null; // bar: 報酬既定なし
  const d = t.compensation_defaults;
  const hourly = Number(d.hourly_yen ?? 0);
  // 271-10 request＝hon（request_back を本指名バックへ）
  const hon = fixedOf(d.main_nomination_back) || fixedOf(d.request_back);
  return { base: hourly, hon_back: hon, jonai_back: fixedOf(d.in_house_nomination_back), dohan_back: fixedOf(d.accompaniment_back) };
}

// ── 席（271-4） ──
export function seatsOf(t: StoreTemplate | null): Array<{ name: string; kind: "卓" | "カウンター" | "VIP" }> {
  const s = t?.seats ?? { table_count: 0, vip_count: 0, counter_count: 0 };
  const out: Array<{ name: string; kind: "卓" | "カウンター" | "VIP" }> = [];
  for (let i = 1; i <= s.table_count; i++) out.push({ name: `卓${i}`, kind: "卓" });
  for (let i = 1; i <= s.vip_count; i++) out.push({ name: `VIP${i}`, kind: "VIP" });
  for (let i = 1; i <= s.counter_count; i++) out.push({ name: `カウンター${i}`, kind: "カウンター" });
  return out;
}

// ── 書込計画（271-12） ──
export type PlanGuard = "seats_empty" | "products_empty" | "plans_empty" | "rules_empty"; // 席／商品（271-4／271-7）と同じ原理で待遇プラン／料金行も「既存 0 のときだけ」
export type PlanStep = {
  key: string;
  group: "settings" | "hours" | "seats" | "pricing" | "comp" | "products" | "overrides" | "flags" | "done";
  label: string;
  rpc: string;
  /** 静的引数（argsOf のときは無し） */
  args?: Record<string, unknown>;
  /** 実行時に解決する引数（product_overrides＝bulk 後の products 行から set_product の引数を組む） */
  argsOf?: "product_overrides";
  guard?: PlanGuard;
};
export type SetupSelection = {
  storeId: string;
  biz: BizType;
  storeName: string | null; // null＝変更しない
  hours: { open: string; close: string; cutoff: string };
  systems: Record<SystemKey, boolean>; // 9 フラグ（明示 boolean）
  includeProducts: boolean;
  billingMode: "table" | "individual" | "mixed";
  pricing: PricingInput;
  current: { card_tax_rate: number; round_unit: number; round_mode: string; time_mode: string; time_per: string };
  flags?: Array<{ key: string; enabled: boolean }>; // 変更する feature_flags（org 既定行）だけ
};
export const SYSTEM_DEFAULTS_ON: readonly SystemKey[] = ["sys_hourly", "sys_backs"]; // STEP 3 既定＝時給・各種バックのみ ON（本便で確定）

export function buildSetupPlan(sel: SetupSelection): PlanStep[] {
  const t = templateOf(sel.biz);
  const s = sel.storeId;
  const steps: PlanStep[] = [];
  // 1) settings_json（biz_type／billing_mode／sys_* 9・店舗名は変更時のみ）
  const patch: Record<string, unknown> = { biz_type: sel.biz, billing_mode: sel.billingMode, ...sel.systems };
  if (sel.storeName && sel.storeName.trim()) patch.name = sel.storeName.trim();
  steps.push({ key: "settings", group: "settings", label: "店舗設定（業態・会計方式・使う制度）", rpc: "set_store_profile", args: { p_store_id: s, p_patch: patch } });
  // 2) 営業時間 7 曜日＋cutoff
  const close30 = to30h(sel.hours.open, sel.hours.close);
  for (let dow = 0; dow <= 6; dow++) {
    steps.push({ key: `hours_${dow}`, group: "hours", label: `営業時間（${"日月火水木金土"[dow]}）${sel.hours.open}〜${close30}`, rpc: "set_store_business_hours",
      args: { p_store_id: s, p_dow: dow, p_is_closed: false, p_open_hm: sel.hours.open, p_close_hm: close30 } });
  }
  steps.push({ key: "cutoff", group: "hours", label: `営業日の切替時刻 ${sel.hours.cutoff}`, rpc: "set_store_biz_cutoff", args: { p_store_id: s, p_hm: sel.hours.cutoff } });
  // 3) 席（既存 0 のときだけ）
  seatsOf(t).forEach((seat, i) => {
    steps.push({ key: `seat_${i}`, group: "seats", label: `席 ${seat.name}`, rpc: "set_seat", guard: "seats_empty",
      args: { p_id: null, p_store_id: s, p_name: seat.name, p_kind: seat.kind, p_sort_order: i + 1, p_is_active: true } });
  });
  // 4) 料金
  const p = sel.pricing;
  steps.push({ key: "pricing", group: "pricing", label: "指名料・同伴料・サービス料（無い値は現値）", rpc: "set_store_pricing",
    args: { p_store_id: s, p_hon_fee: p.hon_fee, p_jonai_fee: p.jonai_fee, p_dohan_fee: p.dohan_fee, p_service_rate: p.service_rate,
      p_card_tax_rate: sel.current.card_tax_rate, p_round_unit: sel.current.round_unit, p_round_mode: sel.current.round_mode } });
  steps.push({ key: "time_pricing", group: "pricing", label: `セット ${p.set_min}分 ¥${p.set_fee}・延長 ${p.ext_min}分 ¥${p.ext_fee}`, rpc: "set_store_time_pricing",
    args: { p_store_id: s, p_set_min: p.set_min, p_set_fee: p.set_fee, p_ext_min: p.ext_min, p_ext_fee: p.ext_fee, p_time_mode: sel.current.time_mode, p_time_per: sel.current.time_per } });
  const rule = (key: string, label: string, args: Record<string, unknown>) => steps.push({ key, group: "pricing", label, rpc: "set_pricing_rule", guard: "rules_empty",
    args: { p_id: null, p_store_id: s, p_fee_kind: "set", p_seat_kind: null, p_dow_mask: null, p_time_from_min: null, p_time_to_min: null, p_rank_id: null,
      p_amount: 0, p_duration_min: null, p_priority: 100, p_is_active: true, p_name: label, p_tax_category: "taxable_10", p_category_id: null, p_billing_unit: null, ...args } });
  if (p.ext2) rule("rule_ext2", `延長 ${p.ext2.min}分`, { p_fee_kind: "extension", p_amount: p.ext2.fee, p_duration_min: p.ext2.min });
  if (p.vip_charge != null) rule("rule_vip", "VIPチャージ", { p_fee_kind: "vip_charge", p_seat_kind: "VIP", p_amount: p.vip_charge });
  // 5) 報酬既定（bar は無し）
  const comp = compOf(t);
  if (comp) {
    steps.push({ key: "comp", group: "comp", label: `待遇プラン「標準」時給 ¥${comp.base}・本指名 ¥${comp.hon_back}／場内 ¥${comp.jonai_back}／同伴 ¥${comp.dohan_back}`, rpc: "set_comp_plan", guard: "plans_empty",
      args: { p_id: null, p_store_id: s, p_name: "標準", p_base: comp.base, p_hon_back: comp.hon_back, p_jonai_back: comp.jonai_back, p_dohan_back: comp.dohan_back,
        p_sales_slide: [], p_point_slide: [], p_is_active: true, p_hon_back_mode: "per_count", p_hon_back_rate: null, p_jonai_back_mode: "per_count", p_jonai_back_rate: null,
        p_dohan_back_mode: "per_count", p_dohan_back_rate: null, p_product_back_mode: "product_rule", p_product_back_rate: null, p_product_back_fixed: null } });
  }
  // 6) 商品（既存 0 のときだけ）→ 7) back 上書き（原価は bulk が product_costs へ）
  const pp = productsPlanOf(t);
  if (sel.includeProducts && pp.included.length > 0) {
    steps.push({ key: "products_bulk", group: "products", label: `商品 ${pp.included.length} 件（除外 ${pp.excludedTotal} 件）`, rpc: "product_bulk_insert", guard: "products_empty",
      args: { p_store_id: s, p_items: pp.included.map((x) => ({ name: x.name, type: x.type, price: x.price, cost: x.cost, category: x.category })) } });
    if (pp.overrides > 0) steps.push({ key: "products_overrides", group: "overrides", label: `バック設定の上書き ${pp.overrides} 件`, rpc: "set_product", argsOf: "product_overrides", guard: "products_empty" });
  }
  // 8) 機能スイッチ（変更分だけ・org 既定行）
  for (const f of sel.flags ?? []) steps.push({ key: `flag_${f.key}`, group: "flags", label: `機能 ${f.key} を ${f.enabled ? "ON" : "OFF"}`, rpc: "flag_set", args: { p_key: f.key, p_store_id: null, p_enabled: f.enabled, p_reason: null } });
  // 9) 最後に setup_done
  steps.push({ key: "done", group: "done", label: "初期設定完了（setup_done）", rpc: "set_store_profile", args: { p_store_id: s, p_patch: { setup_done: true } } });
  return steps;
}

/** 実行時: bulk 後の products 行から set_product の引数を組む（back が既定でない商品だけ・cost はテンプレ値） */
export type ProductRow = { id: string; name: string; type: string; category: string | null; category_id: string | null; price: number; hon_pt: number; reorder_point: number | null; back_exempt_from_split: boolean; is_active: boolean };
export function productOverrideArgs(storeId: string, t: StoreTemplate | null, rows: ProductRow[]): Array<{ name: string; args: Record<string, unknown> }> {
  const byName = new Map(rows.map((r) => [r.name, r]));
  const out: Array<{ name: string; args: Record<string, unknown> }> = [];
  for (const item of productsPlanOf(t).included) {
    if (item.back.isDefault) continue;
    const r = byName.get(item.name);
    if (!r) continue;
    out.push({ name: item.name, args: {
      p_id: r.id, p_store_id: storeId, p_type: r.type, p_category: r.category, p_name: r.name, p_price: r.price, p_cost: item.cost,
      p_back_mode: item.back.back_mode, p_back_value: item.back.back_value, p_unit4: item.back.unit4, p_hon_pt: r.hon_pt, p_is_active: r.is_active,
      p_reorder_point: r.reorder_point, p_category_id: r.category_id, p_back_exempt_from_split: r.back_exempt_from_split,
    } });
  }
  return out;
}

/** 表示用: 計画の要約（STEP 2／5） */
export function planSummaryOf(steps: PlanStep[]): Record<PlanStep["group"], number> {
  const out = { settings: 0, hours: 0, seats: 0, pricing: 0, comp: 0, products: 0, overrides: 0, flags: 0, done: 0 } as Record<PlanStep["group"], number>;
  for (const s of steps) out[s.group]++;
  return out;
}
