// 型宣言（verify-nox-demo-profiles.ts から .mjs を import するため＝便 X-13c）
export type ProfileSys = { hourly: boolean; backs: boolean; norms: boolean; bonus: boolean; points: boolean; sales_slide: boolean; point_slide?: boolean };
export type Profile = {
  template: string; scale: string; sys: ProfileSys; back: "rate" | "unit4";
  rate?: Record<string, number>; u4?: { hon: number; jonai: number; dohan: number; free: number }; u4cast?: { hon: number; jonai: number; dohan: number; free: number }; food?: boolean;
  price: string; basis: "punch" | "shift"; okuri: number; receivable: string; reopen: boolean; confirm: boolean;
  shift: { base: number; fri_sat: number; fill: "full" | "short"; pattern: number[] };
};
export const PROFILES: Record<string, Profile>;
export const PROFILE_CODES: string[];
/** ★X-13-21（便 X-13d-1）: 1 本だけの店に足す 2〜3 本目の待遇プラン */
/** ★X-13-26（便 X-13d-2a）: 代表キャストの前借り額（0＝なし） */
export const ADVANCES: Record<string, number>;
/** ★裁定338（0168・便 P168）: スライドの判定期間と段 */
export const SLIDES: Record<string, { period: "monthly" | "half" | "daily"; sales?: { at: number; wage: number }[]; points?: { at: number; wage: number }[] }>;
export const EXTRA_PLANS: Record<string, { key: string; name: string; base: number; hon: number; jonai: number; dohan: number }[]>;
export function sysSettingsOf(code: string): Record<string, boolean>;
export function backKeyOf(row: { type?: string; category?: string | null }): "champ" | "bottle" | "food" | "cast" | "soft" | "glass";
export function backOf(code: string, row: { type?: string; category?: string | null; price?: number }, i: number): { back_mode: "rate" | "unit4"; back_value: number | null; unit4_json: Record<string, number> | null };

/** ★裁定348 追補1（便 DM-1 D-2b）: 体験入店＝基本時給・保証額・保証期間（R からの相対日）・割当キャスト名 */
export declare const TRIAL: Record<string, { base: number; gua: number; from: number; to: number; cast: string }>;
export declare const BONUS_TIERS: { pct: number; amount: number }[]; // ★便 P173 T-2（起票110）
export declare const EXT_PATTERNS: Record<string, { group: string; rows: { key: string; name: string; minutes: number; amount: number; isDefault: boolean }[] }>; // ★便 P174 T-7b
export function okuriModeOf(code: string): "actual" | "flat" | "store" | "none" | null; // ★裁定414 追補
export function canonOf(code: string): unknown;
/** ★Y2b（2026-11-17 夜）: 源泉のキャストを写して人数を足す（LUNA 7→15）・報酬率スライドの段（LUNA） */
export declare const EXTRA_CASTS: Record<string, { id: string; name: string; from: string; scale: number }[]>;
export declare const PAY_RATE_DEMO: Record<string, { streak: number; tiers: { at_pct: number; up_amount?: number; pay_pct?: number; back_mult?: number }[] }>;
/** ★Y2d（2026-11-17 夜）: 会計の丸め＝業態で（クラブ系 1,000 円・スナック／ガールズバー／バー 100 円・切り上げ） */
export declare const BIZ_TYPE_OF: Record<string, string>;
export function billRoundOf(code: string): { round_unit: number; round_mode: "up" };
/** ★2026-11-18（相談役 B）: 丸めの単位（店ごとの種）・月の売上の目標（源泉／丸めた後の実績） */
export declare const ROUND_UNIT_OF: Record<string, number>;
export declare const SRC_MONTH_GROSS: Record<string, number>;
export declare const MONTH_GROSS_TARGET: Record<string, number>;
/** ★Y2c（2026-11-17 夜）: 7 店目＝ホストの源泉（LUNA の源泉を写して上書き） */
export declare const HOST_SOURCE: { from: string; storeId: string; code: string; name: string; service_bps: number; castNames: Record<string, string>; staffNames: Record<string, string>; set: { regular: number; minutes: number; ext: number; extMinutes: number; first: number }; nomination: { hon: number; jonai: number; dohan: number }; tableCharge: number; plan: { name: string; base: number; hon: number; jonai: number; dohan: number }; grossScale: number };
/** ★2026-11-18 夜（相談役 ④）: ホストの人ごとの目標・売上歩合の段・幹部手当 */
export declare const HOST_PLAN: { ratio: number; casts: Record<string, { sub: number; hon?: number; dohan?: number; jonai?: number; drinks: number; jonaiOnly?: boolean }> };
export declare const HOST_COMMISSION_BASIS: "due" | "subtotal";
export declare const HOST_TIERS: { at: number; pct: number }[];
export function hostCommissionDefsOf(basis?: "due" | "subtotal", ratio?: number): { key: string; name: string; basis: "sales"; value: number; cond: { metric: "sales"; min: number } | null }[];
export function hostStoreSettingsOf(basis?: "due" | "subtotal"): Record<string, unknown>;
export declare const HOST_ALLOWANCE: { cast: string; amount: number; reason: string };
