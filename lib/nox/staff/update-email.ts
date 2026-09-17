// スタッフのメール（ログイン ID）変更＝裁定267-2（mig 0・admin route 1 本）。
// 写経元 3 本の合成で、新しい判定式は書かない:
//   - owner 限定の判定式＝kiosk/provision の guardOwner（`role !== "owner" || !orgId`）を decideOwnerAccess に置く
//   - email の lower/trim 正規化・形式検証（EMAIL_RE）と org 内 unique の先引き＝staff/create（lib/nox/staff/route-guard）
//   - auth 側の更新＝cast/invite の updateUserById（email_confirm: true＝owner 操作のため確認メールなし）
// 書き順は auth.users.email → public.users.email。後者が失敗したら auth を退避値へ戻してから 500（補償）。
// 対象は staff／manager のアクティブ membership を持つ user のみ。owner 自身（role=owner）と cast は 403。
// 本モジュールは DB を admin クライアント経由でしか触らない＝verify が admin 直叩き（と失敗注入）で固定できる。
import type { SupabaseClient } from "@supabase/supabase-js";

export type UpdateEmailInput = { userId: string; email: string }; // email は trim/lower 済み
export type ParseResult<T> = { ok: true; value: T } | { ok: false; status: 400; error: string };
export type RouteResult = { status: number; body: Record<string, unknown> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 実 email の形式検証（厳密 RFC ではなく実用形・auth 側でも最終検証される）＝staff/create と同一
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bad<T>(error: string): ParseResult<T> {
  return { ok: false, status: 400, error };
}

/** 入力整形（純関数）。userId は uuid・email は必須（空/空白は 400）・lower/trim 正規化・形式と長さは staff/create と同一。 */
export function parseUpdateEmailBody(body: unknown): ParseResult<UpdateEmailInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.userId !== "string" || !UUID_RE.test(b.userId)) return bad("userId required (uuid)");
  if (typeof b.email !== "string" || b.email.trim().length === 0) return bad("email required");
  const email = b.email.trim().toLowerCase();
  if (email.length > 255 || !EMAIL_RE.test(email)) return bad("bad email format");
  return { ok: true, value: { userId: b.userId, email } };
}

/** owner 限定（kiosk/provision guardOwner の判定式をそのまま置く＝manager には開かない・org はサーバ導出値）。 */
export function decideOwnerAccess(role: unknown, orgId: unknown): { ok: true } | { ok: false; status: 403; error: "forbidden" } {
  if (role !== "owner" || !orgId) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true };
}

/** 対象の判定（純関数）: 同 org の user で、アクティブ membership の role が staff／manager のときだけ許可。owner 自身（role=owner）・cast・不在は 403。 */
export function decideEmailTarget(t: { found: boolean; sameOrg: boolean; role: string | null }): { ok: true } | { ok: false; status: 403; error: string } {
  if (!t.found || !t.sameOrg) return { ok: false, status: 403, error: "forbidden user" };
  if (t.role !== "staff" && t.role !== "manager") return { ok: false, status: 403, error: "forbidden target" };
  return { ok: true };
}

/**
 * 本体: 対象先引き（403）→ org 内 unique 先引き（409）→ auth 更新（dup は 409）→ public 更新（失敗は auth を戻して 500）。
 * route はガード（owner・org サーバ導出）と parse の後にこれを呼ぶだけ。verify は admin を差し替えて補償を固定する。
 */
export async function performUpdateEmail(
  admin: SupabaseClient,
  p: { orgId: string; userId: string; email: string },
): Promise<RouteResult> {
  // ── 対象の先引き（org 照合＝owner の他 org 混入遮断・cast/invite の cast 先引きと同型） ──
  const { data: u, error: eU } = await admin
    .from("users")
    .select("id, org_id, auth_user_id, email")
    .eq("id", p.userId)
    .maybeSingle();
  if (eU) return { status: 500, body: { error: `lookup failed: ${eU.message}` } };
  const { data: mem, error: eM } = u
    ? await admin.from("memberships").select("role").eq("user_id", u.id as string).eq("is_active", true).limit(1).maybeSingle()
    : { data: null, error: null };
  if (eM) return { status: 500, body: { error: `lookup failed: ${eM.message}` } };
  const target = decideEmailTarget({ found: !!u, sameOrg: !!u && u.org_id === p.orgId, role: (mem?.role as string | undefined) ?? null });
  if (!target.ok) return { status: target.status, body: { error: target.error } };
  const authUserId = u!.auth_user_id as string;

  // ── org 内 unique の先引き（staff/create 逐語＝route 側 lower 正規化済み・保存済み行は全小文字）。同一 user の同値も 409 ──
  const { data: existRows, error: eLook } = await admin
    .from("users")
    .select("id")
    .eq("org_id", p.orgId)
    .eq("email", p.email)
    .limit(1);
  if (eLook) return { status: 500, body: { error: `lookup failed: ${eLook.message}` } };
  if (existRows && existRows.length > 0) return { status: 409, body: { error: "email already registered in org" } };
  // ── auth 側の重複（他 org で使用中）の先引き＝public.users を org 条件なしで引く（auth.users.email は全 org で一意・
  //    users 行を持つ auth は必ずここに当たる）。GoTrue の updateUserById は重複 email に対して code なし・message "{}" の
  //    500（AuthRetryableFetchError）しか返さず message／code で写像できない（2026-09-17 実測）ため、auth 書込前に止めて
  //    staff/create の「email already registered (auth)」と同じ 409 を返す（auth 未書込＝補償不要）。 ──
  const { data: anyRows, error: eAny } = await admin.from("users").select("id").eq("email", p.email).limit(1);
  if (eAny) return { status: 500, body: { error: `lookup failed: ${eAny.message}` } };
  if (anyRows && anyRows.length > 0) return { status: 409, body: { error: "email already registered (auth)" } };

  // ── auth.users.email の退避 → 更新（cast/invite の updateUserById・email_confirm: true＝確認メールなし） ──
  const { data: au, error: eAu } = await admin.auth.admin.getUserById(authUserId);
  if (eAu || !au?.user) return { status: 500, body: { error: `auth lookup failed: ${eAu?.message ?? "no user"}` } };
  const oldAuthEmail = au.user.email ?? (u!.email as string);
  const { error: eUpd } = await admin.auth.admin.updateUserById(authUserId, { email: p.email, email_confirm: true });
  if (eUpd) {
    // dup 判定＝staff/create と同じ正規表現。updateUserById の重複は message が空で code='email_exists'（GoTrue 実測）のため code も見る
    const code = (eUpd as { code?: string }).code ?? "";
    if ([eUpd.message ?? "", code].some((s) => /already|registered|exists/i.test(s))) return { status: 409, body: { error: "email already registered (auth)" } };
    return { status: 500, body: { error: `auth update failed: ${eUpd.message || code || "unknown"}` } };
  }

  // ── public.users.email の更新。失敗したら auth を退避値へ戻す（補償・staff/create §4-A と同じく失敗はログに残す） ──
  const { data: updRows, error: ePub } = await admin
    .from("users")
    .update({ email: p.email })
    .eq("id", p.userId)
    .eq("org_id", p.orgId)
    .select("id");
  if (ePub || !updRows || updRows.length !== 1) {
    const { error: eRev } = await admin.auth.admin.updateUserById(authUserId, { email: oldAuthEmail, email_confirm: true });
    if (eRev) {
      console.error(`[staff/update-email] 補償失敗: auth と public の email が不一致のまま auth_user_id=${authUserId} auth=${p.email} public=${oldAuthEmail} 戻しエラー=${eRev.message}`);
    }
    return { status: 500, body: { error: `users update failed (auth reverted): ${ePub?.message ?? "0 rows"}`, auth_reverted: !eRev } };
  }
  return { status: 200, body: { user_id: p.userId, email: p.email, old_email: oldAuthEmail } };
}
