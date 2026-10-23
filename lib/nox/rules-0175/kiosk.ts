// ★追補 2 同乗 R-7（裁定423 候補・0175 v2 ★27）: キオスク端末の拡張の純関数＝ホームのタイル（店設定 kiosk_features）・無操作の自動ロック（kiosk_idle_sec）・PIN だけの解除の結果。
//   RULES_0175_APPLIED=false の間は従来（/kiosk＝打刻だけ・/kiosk-register＝操作担当を選んで PIN・15 分）。
export type KioskFeature = "punch" | "register" | "shift";
export const KIOSK_FEATURE_LABEL: Record<KioskFeature, string> = { punch: "出退勤", register: "レジ", shift: "シフト" };
export const KIOSK_FEATURE_HREF: Record<KioskFeature, string> = { punch: "/kiosk", register: "/kiosk-register", shift: "/kiosk-shift" };
/** ホームのタイル＝店設定で ON のものだけ（無いキーは true・出退勤は常に先頭） */
export function kioskTilesOf(settings: Record<string, unknown> | null | undefined): KioskFeature[] {
  const f = (settings?.kiosk_features ?? {}) as Record<string, unknown>;
  return (["punch", "register", "shift"] as KioskFeature[]).filter((k) => f[k] !== false);
}
/** 無操作で自動ロックする秒数＝店設定 kiosk_idle_sec（60〜900・既定 180） */
export function kioskIdleSecOf(settings: Record<string, unknown> | null | undefined, fallback = 180): number {
  const v = settings?.kiosk_idle_sec;
  return typeof v === "number" && v >= 60 && v <= 900 ? Math.trunc(v) : fallback;
}
/** 上部バーの文言「操作中: 林（スタッフ）・残り 2:40」 */
export function operatorBarTextOf(name: string, role: string, remainSec: number): string {
  const r = role === "owner" ? "オーナー" : role === "manager" ? "店長" : role === "cast" ? "キャスト" : "スタッフ";
  const m = Math.floor(Math.max(0, remainSec) / 60), s = Math.max(0, remainSec) % 60;
  return `操作中: ${name}（${r}）・残り ${m}:${String(s).padStart(2, "0")}`;
}
export type UnlockResult = { ok: true; membership_id: string; name: string; role: string; idle_sec?: number } | { ok: false; reason: "bad_pin" | "wrong_pin" | "locked" | "ambiguous" | string; candidates?: { membership_id: string; name: string; role: string }[]; locked_until?: string | null };
/** 解除の結果→画面の分岐（候補が 2 人以上なら名前を選ぶ） */
export function unlockNextOf(r: UnlockResult): { phase: "unlocked" | "choose" | "pin"; message: string | null; candidates?: { membership_id: string; name: string; role: string }[] } {
  if (r.ok) return { phase: "unlocked", message: null };
  if (r.reason === "ambiguous") return { phase: "choose", message: "同じ PIN の人が複数います。名前を選んでください", candidates: r.candidates ?? [] };
  if (r.reason === "locked") return { phase: "pin", message: "失敗が続いたためロック中です（しばらくしてから）" };
  if (r.reason === "bad_pin") return { phase: "pin", message: "PIN は 4〜6 桁の数字です" };
  return { phase: "pin", message: "PIN が違います" };
}
/** キオスクで出さない機能（裁定423 候補 (f)）＝ログアウト・店設定・給与（店設定で解禁可・既定 OFF）・顧客の個人情報 */
export const KIOSK_HIDDEN = ["logout", "settings", "payroll", "customer_pii"] as const;
export const kioskPayrollAllowedOf = (settings: Record<string, unknown> | null | undefined): boolean => settings?.kiosk_payroll === true;
