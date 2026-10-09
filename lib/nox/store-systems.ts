// 店舗の「使う制度」9 フラグ（裁定269・mig0147）の純関数。DB を知らない（import は型だけ）。
//   - キーは stores.settings_json の sys_*（set_store_profile 白名単 20 のうち 9・boolean）。
//   - 269-2: OFF は表示と入力の口を隠すだけ。計算（payOf／cast_plan／cast_norms）は不変＝本ファイルは計算に一切関与しない。
//   - 269-4: 出し分けは isSystemOn 1 本。欠損・null・非 boolean は ON（false のときだけ OFF）。
//     複数制度にまたがる節（例: 歩合・バック＝各種バック∨売上歩合）は SECTION_KEYS に「その節が要る制度」を列挙し
//     isSectionOn（＝いずれかが ON）で判定する＝16 箇所に個別条件を書かない。
//   - 269-3: systemUsageOf＝「制度 X を既に使っている cast 数」。入力は cast_plan.overrides_json と cast_norms の行（★X-13-21: 任意で comp_plans／comp_plan_components＝プラン側の値でも数える）。
//
// ★対応表（0917_survey2.md §g (1)「cast 単位の設定の所在」を根拠）:
//   | 制度キー          | cast 単位の設定の所在（数える列）                                                   |
//   |-------------------|--------------------------------------------------------------------------------------|
//   | sys_hourly        | cast_plan.overrides_json.base（数値の上書き）                                         |
//   | sys_backs         | cast_plan.overrides_json.honBack／jonaiBack／dohanBack（定額の上書き・mig0086 の許可キー）|
//   | sys_sales_rate    | cast_plan.overrides_json.honBackMode／jonaiBackMode = 'rate'、honBackRate／jonaiBackRate |
//   | sys_points        | cast 単位の器なし（products.hon_pt・comp_plans.point_slide＝店／プラン単位）→ 常に 0     |
//   | sys_sales_slide   | cast 単位の器なし（comp_plans.sales_slide＝プラン単位・overrides に salesSlide 無し）→ 0 |
//   | sys_point_slide   | cast 単位の器なし（comp_plans.point_slide）→ 0                                        |
//   | sys_norms         | cast_norms（days_target／dohan_target／sales_target／shimei_target のいずれか > 0）     |
//   | sys_penalties     | cast 単位の器は payroll_adjustments／advances／transport（本関数の入力外）→ 0           |
//   | sys_bonus         | cast 単位の器なし（comp_plan_components kind='achievement_bonus'＝プラン単位）→ 0       |
//   mig0086 の overrides 許可キー＝'base','honBack','jonaiBack','dohanBack','honBackMode','honBackRate','jonaiBackMode','jonaiBackRate'。

export const SYSTEM_KEYS = [
  "sys_hourly",
  "sys_backs",
  "sys_sales_rate",
  "sys_points",
  "sys_sales_slide",
  "sys_point_slide",
  "sys_norms",
  "sys_penalties",
  "sys_bonus",
] as const;
export type SystemKey = (typeof SYSTEM_KEYS)[number];

/** 表示ラベル（初期設定 STEP 3 と同じ 9 語・順序固定） */
export const SYSTEM_LABELS: Record<SystemKey, string> = {
  sys_hourly: "時給・最低保証",
  sys_backs: "各種バック",
  sys_sales_rate: "売上歩合",
  sys_points: "ポイント制",
  sys_sales_slide: "売上スライド",
  sys_point_slide: "ポイントスライド",
  sys_norms: "ノルマ",
  sys_penalties: "精算調整・控除", // ★0154 D3（裁定293-3）: 罰金→精算調整
  sys_bonus: "達成ボーナス",
};

/** 補助説明（パネルの行に出す・STEP 3 のモック文言に揃える） */
export const SYSTEM_DESCS: Record<SystemKey, string> = {
  sys_hourly: "基本時給と最低保証（待遇プラン 基本・保証）",
  sys_backs: "本指名／場内／同伴／商品バック（待遇プラン 歩合・バック・商品のバック列）",
  sys_sales_rate: "指名料に対する割合バック（待遇プラン 歩合・バック）",
  sys_points: "本指名ptと pt 基準のバック（商品の本指名pt・スライド・ポイント）",
  sys_sales_slide: "売上帯で時給を変える（待遇プラン スライド・ポイント）",
  sys_point_slide: "pt 帯で時給を変える（待遇プラン スライド・ポイント）",
  sys_norms: "出勤／本指名／同伴／売上の目標（ノルマ設定・キャスト別目標・マイページ進捗）",
  sys_penalties: "遅刻・当欠の精算調整（検知の閾値）、固定控除、前借り・送り実費（控除・送り／遅刻・当欠の検知）",
  sys_bonus: "目標達成時の加算（待遇プラン 達成ボーナス）",
};

export type StoreSettings = Record<string, unknown> | null | undefined;

/** 269-4: settings[key] === false のときだけ false。欠損・null・非 boolean・未知キーは true（ON）。 */
export function isSystemOn(settings: StoreSettings, key: string): boolean {
  if (!settings || typeof settings !== "object") return true;
  return (settings as Record<string, unknown>)[key] !== false;
}

/** 出し分け 16 箇所（裁定269-4）。各節が「要る制度」＝いずれかが ON なら描く。 */
export const SECTION_KEYS = {
  planTabBase: ["sys_hourly"],
  planTabBacks: ["sys_backs", "sys_sales_rate"],
  planTabSlides: ["sys_sales_slide", "sys_point_slide", "sys_points"],
  planTabQuota: ["sys_norms", "sys_bonus", "sys_penalties"],
  planEditorBase: ["sys_hourly"],
  planEditorBacks: ["sys_backs", "sys_sales_rate"],
  planEditorSlides: ["sys_sales_slide", "sys_point_slide", "sys_points"],
  planEditorAchieve: ["sys_bonus"],
  compNormTab: ["sys_norms"],
  compDeductionTab: ["sys_penalties"],
  compPenaltyTab: ["sys_penalties", "sys_norms"],
  compBackTab: ["sys_backs", "sys_sales_rate", "sys_points"],
  normConfigPanel: ["sys_norms"],
  deductionPanel: ["sys_penalties"],
  productsBack: ["sys_backs"],
  productsHonPt: ["sys_points"],
  mineNormCard: ["sys_norms"],
} as const satisfies Record<string, readonly SystemKey[]>;
export type SectionKey = keyof typeof SECTION_KEYS;

export function isSectionOn(settings: StoreSettings, section: SectionKey): boolean {
  return SECTION_KEYS[section].some((k) => isSystemOn(settings, k));
}

export type CastPlanRow = { cast_id: string; plan_id?: string | null; overrides_json: unknown };
/** ★X-13-21（便 X-13d-1）: プラン側の値（comp_plans）＝割当だけで overrides の無いキャストも「使っている」と数えるための行 */
export type PlanRow = { id: string; base?: number | null; hon_back?: number | null; jonai_back?: number | null; dohan_back?: number | null; hon_back_mode?: string | null; jonai_back_mode?: string | null; dohan_back_mode?: string | null; sales_slide?: unknown; point_slide?: unknown };
export type PlanComponentRow = { plan_id: string; kind: string; is_active?: boolean | null };
export type CastNormRow = { cast_id: string; days_target?: number | null; dohan_target?: number | null; sales_target?: number | null; shimei_target?: number | null };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** 269-3: 制度 X を既に使っている cast 数（cast 単位に設定がある行を数える・重複 cast は 1）。 */
export function systemUsageOf(rows: { castPlans: CastPlanRow[]; castNorms: CastNormRow[]; plans?: PlanRow[]; components?: PlanComponentRow[] }): Record<SystemKey, number> {
  const sets: Record<SystemKey, Set<string>> = Object.fromEntries(SYSTEM_KEYS.map((k) => [k, new Set<string>()])) as Record<SystemKey, Set<string>>;
  for (const r of rows.castPlans ?? []) {
    const o = (r.overrides_json && typeof r.overrides_json === "object" ? r.overrides_json : {}) as Record<string, unknown>;
    if (isNum(o.base)) sets.sys_hourly.add(r.cast_id);
    if (isNum(o.honBack) || isNum(o.jonaiBack) || isNum(o.dohanBack)) sets.sys_backs.add(r.cast_id);
    if (o.honBackMode === "rate" || o.jonaiBackMode === "rate" || isNum(o.honBackRate) || isNum(o.jonaiBackRate)) sets.sys_sales_rate.add(r.cast_id);
  }
  for (const n of rows.castNorms ?? []) {
    if ((n.days_target ?? 0) > 0 || (n.dohan_target ?? 0) > 0 || (n.sales_target ?? 0) > 0 || (n.shimei_target ?? 0) > 0) sets.sys_norms.add(n.cast_id);
  }
  // ★X-13-21（便 X-13d-1・仮決め）: プラン側の値でも数える＝割当だけで overrides が無いキャスト（デモ 6 店＝「使用中 0 名」の原因）を「使っている」と数える。
  //   base>0→時給／各バック>0→バック／*_back_mode='rate'→売上歩合／sales_slide≠[]→売上スライド／point_slide≠[]→ポイントスライド／achievement_bonus（有効）→達成ボーナス。
  //   plans を渡さない呼び出しは従来どおり（overrides と norms だけ）。ポイント制・精算調整は cast 単位の器が無いため 0 のまま。
  const planById = new Map((rows.plans ?? []).map((p) => [p.id, p] as const));
  const bonusPlans = new Set((rows.components ?? []).filter((c) => c.kind === "achievement_bonus" && c.is_active !== false).map((c) => c.plan_id));
  const arr = (v: unknown) => Array.isArray(v) && v.length > 0;
  for (const r of rows.castPlans ?? []) {
    const p = r.plan_id ? planById.get(r.plan_id) : undefined;
    if (!p) continue;
    if ((p.base ?? 0) > 0) sets.sys_hourly.add(r.cast_id);
    if ((p.hon_back ?? 0) > 0 || (p.jonai_back ?? 0) > 0 || (p.dohan_back ?? 0) > 0) sets.sys_backs.add(r.cast_id);
    if (p.hon_back_mode === "rate" || p.jonai_back_mode === "rate" || p.dohan_back_mode === "rate") sets.sys_sales_rate.add(r.cast_id);
    if (arr(p.sales_slide)) sets.sys_sales_slide.add(r.cast_id);
    if (arr(p.point_slide)) sets.sys_point_slide.add(r.cast_id);
    if (bonusPlans.has(p.id)) sets.sys_bonus.add(r.cast_id);
  }
  return Object.fromEntries(SYSTEM_KEYS.map((k) => [k, sets[k].size])) as Record<SystemKey, number>;
}
