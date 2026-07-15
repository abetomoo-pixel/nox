// castログイン招待 route の共通ガード（staff/create の route-guard を正本に同型・新パターンを作らない）。
// (1) 認証（401） (2) 入力検証（400・castId/action・invite 時 idemKey 必須・email 任意）
// (3) 権限（403・owner/manager＝cast_invite RPC と同じ非対称を route でも先出し・manager は自店 cast のみ）
// (4) org はサーバ導出（auth_org_id）でクライアント申告を使わない・対象 cast を admin で先引きして
//     org 照合（クロス org 遮断）＋ is_active 検証（退店 cast は招待も PW 再発行も不可）。
// 以降、auth 生成（admin.createUser）/PW 再発行（updateUserById）/補償（deleteUser）は admin（service）、
// cast_invite RPC は supabase（呼び出し owner/manager のセッション＝auth_org_id/role が RPC 内で効く）。

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CastInviteInput = {
  castId: string;
  action: "invite" | "reset"; // invite=未結線 cast へアカウント発行 / reset=結線済み cast の PW 再発行
  email: string | null; // invite のみ有効（lower/trim 済み・null=未入力＝合成 email を route が生成）
  idemKey: string | null; // invite のみ必須（二重 POST 対策＋合成 email の導出材料）
};
export type GuardOk = {
  ok: true;
  supabase: SupabaseClient;
  admin: SupabaseClient;
  orgId: string;
  authUserId: string;
  cast: { id: string; storeId: string; name: string; userId: string | null };
  input: CastInviteInput;
};
export type GuardErr = { ok: false; status: number; body: Record<string, unknown> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 実 email の形式検証（厳密 RFC ではなく実用形・auth 側でも最終検証される）
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function guardCastInvite(req: Request): Promise<GuardOk | GuardErr> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, body: { error: "unauthenticated" } };

  let body: { castId?: unknown; action?: unknown; email?: unknown; idemKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return { ok: false, status: 400, body: { error: "bad json" } };
  }
  const castId = body.castId;
  if (typeof castId !== "string" || !UUID_RE.test(castId))
    return { ok: false, status: 400, body: { error: "castId required (uuid)" } };
  const action = body.action;
  if (action !== "invite" && action !== "reset")
    return { ok: false, status: 400, body: { error: "action must be invite or reset" } };
  let idemKey: string | null = null;
  if (action === "invite") {
    if (typeof body.idemKey !== "string" || !UUID_RE.test(body.idemKey))
      return { ok: false, status: 400, body: { error: "idemKey required (uuid)" } };
    idemKey = body.idemKey;
  }
  // email は invite の任意入力。空/空白のみは「未入力」= null（合成 email へ）。lower/trim 正規化（mig0041【12】と整合）。
  let email: string | null = null;
  if (action === "invite" && typeof body.email === "string" && body.email.trim().length > 0) {
    email = body.email.trim().toLowerCase();
    if (email.length > 255 || !EMAIL_RE.test(email))
      return { ok: false, status: 400, body: { error: "bad email format" } };
  }

  const [{ data: authRole }, { data: authStoreId }, { data: orgId }] = await Promise.all([
    supabase.rpc("auth_role"),
    supabase.rpc("auth_store_id"),
    supabase.rpc("auth_org_id"),
  ]);
  // 権限差（RPC 側でも二重に守る）: owner=org 内全店の cast / manager=自店の cast のみ
  if (authRole !== "owner" && authRole !== "manager")
    return { ok: false, status: 403, body: { error: "forbidden" } };
  if (!orgId) return { ok: false, status: 403, body: { error: "forbidden" } };

  const admin = createAdminClient();
  // 対象 cast の先引き（org 照合＝owner の他 org 混入遮断・manager は自店照合）
  const { data: cast, error } = await admin
    .from("casts")
    .select("id, org_id, store_id, name, user_id, is_active")
    .eq("id", castId)
    .single();
  if (error || !cast || cast.org_id !== orgId)
    return { ok: false, status: 403, body: { error: "forbidden cast" } };
  if (authRole === "manager" && cast.store_id !== authStoreId)
    return { ok: false, status: 403, body: { error: "forbidden" } };
  if (!cast.is_active) return { ok: false, status: 400, body: { error: "inactive cast" } };

  return {
    ok: true,
    supabase,
    admin,
    orgId: orgId as string,
    authUserId: user.id,
    cast: { id: cast.id as string, storeId: cast.store_id as string, name: cast.name as string, userId: (cast.user_id as string | null) ?? null },
    input: { castId, action, email, idemKey },
  };
}
