// スタッフ追加 route の共通ガード（payroll route-guard の両クライアントパターンを踏襲・新パターンを作らない）。
// (1) 認証（401） (2) 入力検証（400） (3) 権限（403・owner/manager＝staff_create RPC と同じ非対称を route でも先出し）
// (4) org はサーバ導出（auth_org_id）でクライアント申告を使わない・store が org 内かを admin で照合（クロス org 遮断）。
// 以降、auth 生成（admin.createUser）と補償（deleteUser）は admin（service）、
// staff_create RPC は supabase（呼び出し owner/manager のセッション＝auth_org_id/role が RPC 内で効く）。

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffCreateInput = {
  name: string; // trim 済み（1..80）
  email: string | null; // 実 email（lower/trim 済み）。null=未入力＝合成 email を route が生成
  storeId: string;
  role: "staff" | "manager";
  idemKey: string; // 必須（二重 POST 対策＋合成 email の導出材料）
};
export type GuardOk = {
  ok: true;
  supabase: SupabaseClient;
  admin: SupabaseClient;
  orgId: string;
  authUserId: string;
  input: StaffCreateInput;
};
export type GuardErr = { ok: false; status: number; body: Record<string, unknown> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 実 email の形式検証（厳密 RFC ではなく実用形・auth 側でも最終検証される）
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function guardStaffCreate(req: Request): Promise<GuardOk | GuardErr> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, body: { error: "unauthenticated" } };

  let body: { name?: unknown; email?: unknown; storeId?: unknown; role?: unknown; idemKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return { ok: false, status: 400, body: { error: "bad json" } };
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 80) return { ok: false, status: 400, body: { error: "name required (1-80 chars)" } };
  const storeId = body.storeId;
  if (typeof storeId !== "string" || !UUID_RE.test(storeId))
    return { ok: false, status: 400, body: { error: "storeId required (uuid)" } };
  const role = body.role;
  if (role !== "staff" && role !== "manager")
    return { ok: false, status: 400, body: { error: "role must be staff or manager" } };
  if (typeof body.idemKey !== "string" || !UUID_RE.test(body.idemKey))
    return { ok: false, status: 400, body: { error: "idemKey required (uuid)" } };
  // email は任意。空/空白のみは「未入力」= null（合成 email へ）。あれば lower/trim 正規化（mig0026【12】と整合）。
  let email: string | null = null;
  if (typeof body.email === "string" && body.email.trim().length > 0) {
    email = body.email.trim().toLowerCase();
    if (email.length > 255 || !EMAIL_RE.test(email))
      return { ok: false, status: 400, body: { error: "bad email format" } };
  }

  const [{ data: authRole }, { data: authStoreId }, { data: orgId }] = await Promise.all([
    supabase.rpc("auth_role"),
    supabase.rpc("auth_store_id"),
    supabase.rpc("auth_org_id"),
  ]);
  // 権限差（RPC 側でも二重に守る・論点3）: owner=org 全店 staff/manager / manager=自店 staff のみ
  if (authRole !== "owner" && authRole !== "manager")
    return { ok: false, status: 403, body: { error: "forbidden" } };
  if (authRole === "manager") {
    if (storeId !== authStoreId) return { ok: false, status: 403, body: { error: "forbidden" } };
    if (role !== "staff") return { ok: false, status: 403, body: { error: "forbidden" } };
  }
  if (!orgId) return { ok: false, status: 403, body: { error: "forbidden" } };

  const admin = createAdminClient();
  // org はサーバ導出（auth_org_id）。store が org 内かを照合＝owner の他 org 混入を遮断。
  const { data: store, error } = await admin.from("stores").select("org_id").eq("id", storeId).single();
  if (error || !store || store.org_id !== orgId) return { ok: false, status: 403, body: { error: "forbidden store" } };

  return {
    ok: true,
    supabase,
    admin,
    orgId: orgId as string,
    authUserId: user.id,
    input: { name, email, storeId, role, idemKey: body.idemKey },
  };
}
