// ★便 P173（裁定389 追補1・0173）: キャスト本人のセッションから /register（と日次の締め＝/report）を通すかの server 判定。
//   店 ON ∧ 本人 can_register（auth_cast_can_register）∧（店設定 cast_register_device が 'own_phone' ∨ 店端末（kiosk_devices purpose 'register'・active）が未登録＝「自分のスマホ扱い」）。
//   kiosk_devices は deny-all＝件数は admin クライアントで数える（件数だけ・行は渡さない）。真の防御は RPC／RLS の cast 2 段ゲート＝ここは入口の表示制御。
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { castOwnSessionRegisterOf, castRegisterDeviceOf } from "@/lib/nox/register/p173";

export async function castRegisterEntryOf(supabase: SupabaseClient): Promise<{ allowed: boolean; canRegister: boolean }> {
  const { data: can } = await supabase.rpc("auth_cast_can_register");
  const canRegister = can === true;
  if (!canRegister) return { allowed: false, canRegister: false };
  const { data: storeRow } = await supabase.from("stores").select("id, settings_json").limit(1).maybeSingle();
  const device = castRegisterDeviceOf(storeRow?.settings_json);
  let registerDevices = 0;
  if (device === "store_device" && storeRow?.id) {
    try {
      const { count } = await createAdminClient().from("kiosk_devices").select("id", { count: "exact", head: true }).eq("store_id", storeRow.id as string).eq("purpose", "register").eq("is_active", true);
      registerDevices = count ?? 0;
    } catch { registerDevices = 0; }
  }
  return { allowed: castOwnSessionRegisterOf({ enabled: true, canRegister: true, device, registerDevices }), canRegister: true };
}
