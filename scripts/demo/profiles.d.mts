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
