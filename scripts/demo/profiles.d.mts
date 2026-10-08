// 型宣言（verify-nox-demo-profiles.ts から .mjs を import するため＝便 X-13c）
export type ProfileSys = { hourly: boolean; backs: boolean; norms: boolean; bonus: boolean; points: boolean; sales_slide: boolean };
export type Profile = {
  template: string; scale: string; sys: ProfileSys; back: "rate" | "unit4";
  rate?: Record<string, number>; u4?: { hon: number; jonai: number; dohan: number; free: number }; u4cast?: { hon: number; jonai: number; dohan: number; free: number }; food?: boolean;
  price: string; basis: "punch" | "shift"; okuri: number; receivable: string; reopen: boolean; confirm: boolean;
  shift: { base: number; fri_sat: number; fill: "full" | "short"; pattern: number[] };
};
export const PROFILES: Record<string, Profile>;
export const PROFILE_CODES: string[];
export function sysSettingsOf(code: string): Record<string, boolean>;
export function backKeyOf(row: { type?: string; category?: string | null }): "champ" | "bottle" | "food" | "cast" | "soft" | "glass";
export function backOf(code: string, row: { type?: string; category?: string | null; price?: number }, i: number): { back_mode: "rate" | "unit4"; back_value: number | null; unit4_json: Record<string, number> | null };
