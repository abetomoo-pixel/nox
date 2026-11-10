import { mig0199On } from "@/lib/nox/rules-0175/flag"; // ★0199（裁定466・M-125）
// ★便 E（2026-11-05・0196 用＝裁定448 B 方式）: キオスクの「スタッフでログイン（PIN）」＝本人の auth セッション（route /api/kiosk/person-session）の純関数（DB を知らない・React を知らない）。
//   印＝cookie nox_kiosk_person（httpOnly・値＝<session_id>:<device_id>:<role>・有効 1 日）。(manage)/layout が cookie を見てナビを 7 つに絞り、帯を出す。
//   MIG_0196_APPLIED が false の間は入口（タイル画面の PIN の入口）を出さない＝従来（M-49 のパスワードの入口）のまま。
import type { NavGroup } from "@/lib/nox/ui/nav-tabs";

export const KIOSK_PERSON_COOKIE = "nox_kiosk_person";
export const KIOSK_PERSON_COOKIE_MAX_AGE_SEC = 24 * 3600;
export type KioskPersonRole = "manager" | "staff" | "cast"; // ★0199（裁定466・M-125）: cast＝can_register ∧ 店のレジ使用 ≥2（判定は kiosk_person_claim）
export type KioskPersonCookie = { sessionId: string; deviceId: string; role: KioskPersonRole };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const kioskPersonCookieValueOf = (c: KioskPersonCookie): string => `${c.sessionId}:${c.deviceId}:${c.role}`;
/** cookie の値 → 構造（形が違えば null＝印なし） */
export function parseKioskPersonCookie(v: string | null | undefined): KioskPersonCookie | null {
  if (!v) return null;
  const [sessionId, deviceId, role] = v.split(":");
  if (!UUID_RE.test(sessionId ?? "") || !UUID_RE.test(deviceId ?? "") || !kioskPersonSessionAllowedOf(role)) return null; // ★0199（裁定466・M-125）: cast の cookie も通す（フラグ false の間は manager／staff だけ＝従来どおり）
  return { sessionId, deviceId, role };
}

/** 本人セッションを作ってよい役割（kiosk_person_claim と同じ＝管理者は通常ログイン・cast は 0199 から＝can_register ∧ 店のレジ使用 ≥2 を RPC が判定） */
export const KIOSK_PERSON_SESSION_ROLES: readonly KioskPersonRole[] = ["manager", "staff", "cast"];
export const kioskPersonSessionAllowedOf = (role: string | null | undefined): role is KioskPersonRole => role === "manager" || role === "staff" || (mig0199On() && role === "cast"); // ★0199（裁定466・M-125）: cast は MIG_0199 配下（DB＝kiosk_person_claim が can_register ∧ 店 ≥2 で判定）

/** キオスクの中の本体画面のナビ＝7 つ（レジ／打刻／予約／シフト／在庫／顧客／日報）。ホーム・歯車（マスタ・監査・ご契約・お知らせ）は出さない。
 *  §6-3（仮置き＝本人セッションなら本店と同じ RLS）: 予約・顧客も出す。staff の権限（can_crm／can_shift／can_register）は本店と同じ述語で絞る。 */
export function kioskNavOf(role: KioskPersonRole, perms: { crm: boolean; shift: boolean; register: boolean }): NavGroup[] {
  const mgr = role === "manager";
  const items = [
    ...(mgr || perms.register ? [{ href: "/register", label: "レジ" }] : []),
    { href: "/shift?tab=today", label: "打刻" },
    ...(mgr || perms.register ? [{ href: "/register?tab=reserve", label: "予約" }] : []),
    ...(mgr || perms.shift ? [{ href: "/shift", label: "シフト" }] : []),
    ...(mgr ? [{ href: "/master/stock", label: "在庫" }] : []),
    ...(mgr || perms.crm ? [{ href: "/customers", label: "顧客" }] : []),
    { href: "/report", label: "日報" },
  ];
  return [{ label: null, items }];
}
/** (manage) の中で cookie があっても通さない役割（owner／cast）＝middleware が cookie を消して /kiosk へ（防御の二重） */
export const kioskPersonMustLeaveOf = (role: string | null | undefined): boolean => !kioskPersonSessionAllowedOf(role);

export const KIOSK_PERSON_PIN_LINK = "スタッフでログイン（PIN）";
export const KIOSK_PERSON_PIN_NOTE = "店長・スタッフ（会計を任されたキャストも）が PIN でこの端末から本人の権限で操作します（管理者は通常のログイン）。無操作で自動的にキオスクへ戻ります。"; // ★0199（裁定466・M-125）: cast＝会計まで（店のレジ使用 2）のキャスト
export const KIOSK_PERSON_DENY_ADMIN = "管理者は通常のログインをお使いください（この端末の PIN の入口は店長・スタッフ用です）";
export const kioskPersonBandTextOf = (name: string | null, minutes: number): string => `端末で${name ? ` ${name} さんとして` : ""}操作中・無操作 ${minutes} 分でキオスクへ戻ります`;
export const KIOSK_PERSON_LEAVE = "キオスクへ戻る";
// ★M-119（2026-11-06・裁定460）: 帯＝本店のレイアウトの上に固定（名前・無操作の残り・ロック／交代＝端末へ戻る）
export const KIOSK_PERSON_LOCK = "ロック（端末へ戻る）";
export const kioskPersonRemainTextOf = (remainMin: number): string => (remainMin <= 0 ? "まもなく端末へ戻ります" : `無操作あと ${remainMin} 分`);
/** route の失敗語 → 画面の 1 行 */
export function kioskPersonErrJa(msg: string): string {
  if (/not bound/.test(msg)) return "この端末は固定されていません（オーナーが端末を固定してから使えます）";
  if (/device bound/.test(msg)) return "この端末の固定と一致しません（店に確認してください）";
  if (/no session/.test(msg)) return "PIN の解除が切れています。もう一度 PIN を入れてください";
  if (/forbidden/.test(msg)) return KIOSK_PERSON_DENY_ADMIN;
  return "本人の画面を開けませんでした（もう一度お試しください）";
}
