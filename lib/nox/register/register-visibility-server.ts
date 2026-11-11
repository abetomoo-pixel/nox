// ★M-158／M-159（2026-11-11・裁定472）: 「レジ」を出すかのデータの取り方（サーバ）。layout（ナビ・/register の入口）と dashboard（クイック操作・案内の 1 行）が同じ関数を呼ぶ。
import type { SupabaseClient } from "@supabase/supabase-js";
import { mig0200On } from "@/lib/nox/rules-0175/flag";
import { registerVisibilityOf, type RegisterVisibility } from "./register-visibility";

export async function registerVisibilityServerOf(supabase: SupabaseClient, role: string | null | undefined): Promise<RegisterVisibility> {
  if (role !== "staff") return registerVisibilityOf({ role, canRegister: false, access: null, gateOn: mig0200On(), punchMode: null });
  const gateOn = mig0200On();
  const [{ data: rg }, acc, st] = await Promise.all([
    supabase.rpc("auth_staff_can_register"),
    gateOn ? supabase.rpc("auth_register_access") : Promise.resolve({ data: null }),
    supabase.rpc("auth_store_id").then(async ({ data: sid }) => (sid ? (await supabase.from("stores").select("settings_json").eq("id", sid as string).maybeSingle()).data : null)),
  ]);
  const sj = ((st as { settings_json?: unknown } | null)?.settings_json ?? {}) as Record<string, unknown>;
  return registerVisibilityOf({
    role, canRegister: rg === true, access: (acc.data ?? null) as { allowed?: boolean; reason?: string | null } | null, gateOn,
    punchMode: typeof sj.punch_mode === "string" ? (sj.punch_mode as string) : null,
  });
}
