// ★追補 2 同乗 R-7（裁定423 候補・0175 v2 ★27）: キオスク端末の拡張の純関数＝ホームのタイル（店設定 kiosk_features）・無操作の自動ロック（kiosk_idle_sec）・PIN だけの解除の結果。
//   RULES_0175_APPLIED=false の間は従来（/kiosk＝打刻だけ・/kiosk-register＝操作担当を選んで PIN・15 分）。
// ★0190 フラグ true 便（裁定435・2026-10-30）: キオスク＝日常業務の端末＝出退勤／レジ／シフト／在庫／日報の 5 タイル（給与・マスタ・顧客・分析・監査は出さない）。
//   在庫・日報は mig0190On() のときだけタイルに出る（店設定 kiosk_features の無いキーは true）。
import { mig0190On } from "./flag"; // ★0194: 在庫タイル（kiosk_stock_levels）
export type KioskFeature = "punch" | "register" | "shift" | "inventory" | "report";
export const KIOSK_FEATURES_ALL: readonly KioskFeature[] = ["punch", "register", "shift", "inventory", "report"];
export const KIOSK_FEATURE_LABEL: Record<KioskFeature, string> = { punch: "出退勤", register: "レジ", shift: "シフト", inventory: "在庫", report: "日報" };
/** ★裁定469（M-128・2026-11-09＝裁定460 改）: レジ／シフト／在庫／日報のタイル＝PIN → 本人セッション（kiosk_person_claim）で**本店の同じページ**を開く（簡易画面 /kiosk-register・/kiosk-shift・/kiosk-inventory・/kiosk-report は廃止＝/kiosk へ戻す）。出退勤は名前選択＋PIN のまま */
export const KIOSK_FEATURE_HREF: Record<KioskFeature, string> = { punch: "/kiosk", register: "/register", shift: "/shift", inventory: "/master/stock", report: "/report" };
/** ホームのタイル＝店設定で ON のものだけ（無いキーは true・出退勤は常に先頭）。with0190=false（0190 前）は従来の 3 つ */
export function kioskTilesOf(settings: Record<string, unknown> | null | undefined, with0190: boolean = mig0190On()): KioskFeature[] {
  const f = (settings?.kiosk_features ?? {}) as Record<string, unknown>;
  const all = with0190 ? KIOSK_FEATURES_ALL : (["punch", "register", "shift"] as KioskFeature[]);
  return all.filter((k) => f[k] !== false);
}
/** ★裁定468（M-127・2026-11-09）: ホームのタイルは店の設定に従う＝出退勤＝打刻方法「店の端末で押す」（punch_methods.kiosk）ON かつ打刻しない店（punch_mode='store'）でない・
 *  レジ＝店の端末でのレジ使用（kiosk_features.register≠false）・シフト／在庫／日報＝公開（kiosk_features の鍵≠false・無い鍵は ON）。0 個＝PIN の案内とボタンだけ（page 側）。
 *  判定の鍵は本店と同じ（opsProfileOf の punch_methods・punchModeOf・kiosk_features）。 */
export function kioskHomeTilesOf(settings: Record<string, unknown> | null | undefined, punchMethods: { kiosk: boolean } | null | undefined, storeDecides: boolean, with0190: boolean = mig0190On()): KioskFeature[] {
  const base = kioskTilesOf(settings, with0190);
  const punchOn = !!punchMethods?.kiosk && !storeDecides;
  return base.filter((k) => k !== "punch" || punchOn);
}
/** タイルを描くか＝1 つ以上（出退勤だけのときは描かない＝その画面自体が出退勤） */
export const kioskTilesShownOf = (tiles: readonly KioskFeature[]): boolean => tiles.length >= 1 && !(tiles.length === 1 && tiles[0] === "punch");
export const KIOSK_NO_TILES_NOTE = "この端末で使える機能は店の設定で OFF です（スタッフは PIN で本人の画面を開けます）";
export const KIOSK_PUNCH_OFF_NOTE = "この端末では出退勤の打刻を使いません（店の設定＝打刻方法）";
/** タイルの行き先がこの便で開くか（シフト・在庫・日報の本体は K client 第 2 便＝今は案内画面） */
export const KIOSK_FEATURE_READY: Record<KioskFeature, boolean> = { punch: true, register: true, shift: true, inventory: true /* ★裁定469: 本店の /master/stock を開く＝0194 に依らず */, report: true }; // ★0194（裁定445 ③）: 在庫＝読取の本体（kiosk_stock_levels） // ★K client 第 2 便（2026-11-02）: シフト・日報は本体（読取）＝ready・在庫は DDL 待ち
/** 無操作で自動ロックする秒数＝店設定 kiosk_idle_sec（60〜900・既定 180） */
export function kioskIdleSecOf(settings: Record<string, unknown> | null | undefined, fallback = 180): number {
  const v = settings?.kiosk_idle_sec;
  return typeof v === "number" && v >= 60 && v <= 900 ? Math.trunc(v) : fallback;
}
/** 上部バーの文言「操作中: 林（スタッフ）・残り 2:40」 */
export function operatorBarTextOf(name: string, role: string, remainSec: number): string {
  const r = role === "owner" ? "管理者" : role === "manager" ? "店長" : role === "cast" ? "キャスト" : "スタッフ";
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
  if (r.reason === "device_locked") return { phase: "pin", message: "この端末はしばらく使えません（PIN の失敗が続きました）" }; // ★0201g（M-156）: 端末ごとのロック（貼る前の DB は返さない）
  return { phase: "pin", message: "PIN が違います" };
}
/** キオスクで出さない機能（裁定423 候補 (f)）＝ログアウト・店設定・給与（店設定で解禁可・既定 OFF）・顧客の個人情報 */
export const KIOSK_HIDDEN = ["logout", "settings", "payroll", "customer_pii"] as const;
export const kioskPayrollAllowedOf = (settings: Record<string, unknown> | null | undefined): boolean => settings?.kiosk_payroll === true;

/** ★裁定469（M-128）: 本人セッションの無操作＝3 分で端末へ戻る（店設定 kiosk_person_idle_minutes＝M-49 は DB 側のセッション有効期限に残す・帯の時計は 3 分固定） */
// ★2026-11-13（相談役■2 c）: 3 分の固定（KIOSK_PERSON_IDLE_MINUTES）はやめた＝店の設定に従う（lib/nox/kiosk/person-login.ts の kioskPersonIdleMinutesOf・3〜10 分・既定 10）
/** ★裁定469（M-128）: 本人セッションの帯のナビ＝ホーム／レジ／シフト／在庫／日報だけ（権限は本店と同じ述語・cast は裁定466＝レジだけ） */
export function kioskPersonNavOf(role: string, perms: { crm?: boolean; shift: boolean; register: boolean }): { label: string | null; items: { href: string; label: string }[] }[] {
  if (role === "cast") return [{ label: null, items: [{ href: "/register", label: "レジ" }] }];
  const mgr = role === "manager";
  const items = [
    { href: "/dashboard", label: "ホーム" },
    ...(mgr || perms.register ? [{ href: "/register", label: "レジ" }] : []),
    ...(mgr || perms.shift ? [{ href: "/shift", label: "シフト" }] : []),
    ...(mgr ? [{ href: "/master/stock", label: "在庫" }] : []),
    { href: "/report", label: "日報" },
  ];
  return [{ label: null, items }];
}
