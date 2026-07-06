// 給与確定 route の共通ガード（preview/finalize 共用）。
// (1) 認証（401） (2) 入力検証（400・period='YYYY-MM'） (3) 権限（403・manager+ かつ自店/owner）
// (4) org はサーバ導出（auth_org_id）でクライアント申告を使わない・store が org 内かを admin で照合（クロス org 遮断）。
// 以降の重い読み取り・finalize は admin（service）、get_cast_sales と run_create は supabase（ユーザー文脈）。

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decidePayrollAccess } from "./authz";
import type { SupabaseClient } from "@supabase/supabase-js";

export type GuardOk = {
  ok: true;
  supabase: SupabaseClient;
  admin: SupabaseClient;
  orgId: string;
  storeId: string;
  period: string;
  role: string;
  authUserId: string;
  idemKey?: string;
};
export type GuardErr = { ok: false; status: number; body: Record<string, unknown> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function guardPayroll(req: Request): Promise<GuardOk | GuardErr> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, body: { error: "unauthenticated" } };

  let body: { storeId?: unknown; period?: unknown; idemKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return { ok: false, status: 400, body: { error: "bad json" } };
  }
  const storeId = body.storeId;
  const period = body.period;
  if (typeof storeId !== "string" || !storeId) return { ok: false, status: 400, body: { error: "storeId required" } };
  if (typeof period !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
    return { ok: false, status: 400, body: { error: "period must be YYYY-MM" } };
  const idemKey = typeof body.idemKey === "string" && UUID_RE.test(body.idemKey) ? body.idemKey : undefined;

  const [{ data: role }, { data: authStoreId }, { data: orgId }] = await Promise.all([
    supabase.rpc("auth_role"),
    supabase.rpc("auth_store_id"),
    supabase.rpc("auth_org_id"),
  ]);
  if (decidePayrollAccess(role as string | null, authStoreId as string | null, storeId) !== "ok")
    return { ok: false, status: 403, body: { error: "forbidden" } };
  if (!orgId) return { ok: false, status: 403, body: { error: "forbidden" } };

  const admin = createAdminClient();
  // org はサーバ導出（auth_org_id）。store が org 内かを照合＝owner の他 org・manager の他店混入を遮断。
  const { data: store, error } = await admin.from("stores").select("org_id").eq("id", storeId).single();
  if (error || !store || store.org_id !== orgId) return { ok: false, status: 403, body: { error: "forbidden store" } };

  return { ok: true, supabase, admin, orgId: orgId as string, storeId, period, role: role as string, authUserId: user.id, idemKey };
}
