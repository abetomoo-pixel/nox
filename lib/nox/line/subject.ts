// ★便 ON-3（2026-10-26・0176 ★1 LINE）: 紐付けの subject（cast／membership）→ Auth ユーザー・行き先（サーバ専用・admin client）。
//   cast＝casts.user_id → users.auth_user_id（未招待＝user_id null は「先にログインの招待が要る」＝LINE からの初回作成（onboard）は 0182 起草＝【事後承認待ち】）。
//   membership＝memberships.user_id → users.auth_user_id。行き先＝cast は /mine・それ以外は /dashboard。
import type { SupabaseClient } from "@supabase/supabase-js";

export type SubjectKind = "cast" | "membership";
export const LINE_STORE_COOKIE = "nox_line_store"; // 再ログインの店（400 日・資格情報ではない）
export const lineStoreCookieOptions = (secure: boolean) => ({ path: "/", maxAge: 400 * 86400, httpOnly: true, sameSite: "lax" as const, secure });

export async function authUserOfSubject(admin: SupabaseClient, kind: SubjectKind, id: string): Promise<{ authUserId: string; dest: string } | { error: "no_login" | "not_found" }> {
  if (kind === "cast") {
    const { data: c } = await admin.from("casts").select("user_id, is_active").eq("id", id).maybeSingle();
    if (!c) return { error: "not_found" };
    if (!c.user_id) return { error: "no_login" };
    const { data: u } = await admin.from("users").select("auth_user_id, is_active").eq("id", c.user_id as string).maybeSingle();
    if (!u?.auth_user_id || u.is_active === false) return { error: "no_login" };
    return { authUserId: u.auth_user_id as string, dest: "/mine" };
  }
  const { data: m } = await admin.from("memberships").select("user_id, is_active").eq("id", id).maybeSingle();
  if (!m) return { error: "not_found" };
  if (m.is_active === false) return { error: "no_login" };
  const { data: u } = await admin.from("users").select("auth_user_id, is_active").eq("id", m.user_id as string).maybeSingle();
  if (!u?.auth_user_id || u.is_active === false) return { error: "no_login" };
  return { authUserId: u.auth_user_id as string, dest: "/dashboard" };
}

/** 店の LINE 設定（公開値）と org・デモ判定 */
export async function lineStoreOf(admin: SupabaseClient, storeId: string): Promise<{ orgId: string; isDemo: boolean; name: string; config: Record<string, string | null> } | null> {
  const { data: s } = await admin.from("stores").select("id, org_id, name, line_config").eq("id", storeId).maybeSingle();
  if (!s) return null;
  const { data: o } = await admin.from("orgs").select("is_demo").eq("id", s.org_id as string).maybeSingle();
  return { orgId: s.org_id as string, isDemo: o?.is_demo === true, name: (s.name as string) ?? "", config: ((s.line_config ?? {}) as Record<string, string | null>) };
}
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
