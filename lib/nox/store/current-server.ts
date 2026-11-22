// ★0203（2 号店の段 2）: 今見ている店をサーバで決める（cookie と RLS で見える店から）。旗 false は auth_store_id のまま。
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mig0203On } from "@/lib/nox/rules-0175/flag";
import { CURRENT_STORE_COOKIE, pickCurrentStore } from "@/lib/nox/store/current";

export async function currentStoreIdOf(supabase: SupabaseClient): Promise<string | null> {
  const [{ data: role }, { data: sid }, { data: rows }] = await Promise.all([
    supabase.rpc("auth_role"),
    supabase.rpc("auth_store_id"),
    supabase.from("stores").select("id").order("name"),
  ]);
  const ck = (await cookies()).get(CURRENT_STORE_COOKIE)?.value ?? null;
  return pickCurrentStore({ flag: mig0203On(), role: (role as string | null) ?? null, cookieId: ck, storeIds: ((rows ?? []) as { id: string }[]).map((r) => r.id), authStoreId: (sid as string | null) ?? null });
}

/** 先頭の店に固定の読取（`from("stores").select(cols).order("name").limit(1)`）の置き換え＝旗 true は今見ている店の 1 行・旗 false は今のまま */
export async function currentStoreRowsOf<T = Record<string, any>>(supabase: SupabaseClient, cols: string): Promise<{ data: T[] | null }> {
  if (!mig0203On()) { const { data } = await supabase.from("stores").select(cols).order("name").limit(1); return { data: (data ?? null) as T[] | null }; }
  const id = await currentStoreIdOf(supabase);
  if (!id) return { data: [] };
  const { data } = await supabase.from("stores").select(cols).eq("id", id).limit(1);
  return { data: (data ?? null) as T[] | null };
}
