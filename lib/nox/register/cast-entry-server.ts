// ★便 P173（裁定389 追補1・0173）: キャスト本人のセッションから /register（と日次の締め＝/report）を通すかの server 判定。
//   店 ON ∧ 本人 can_register（auth_cast_can_register）∧（店設定 cast_register_device が 'own_phone' ∨ 店端末（kiosk_devices purpose 'register'・active）が未登録＝「自分のスマホ扱い」）。
//   kiosk_devices は deny-all＝件数は admin クライアントで数える（件数だけ・行は渡さない）。真の防御は RPC／RLS の cast 2 段ゲート＝ここは入口の表示制御。
// ★便 M5 M-40 (c)（2026-10-30）: reason（通さない理由語＝castRegisterDenyReasonOf）を添えて返す（allowed=true のとき null）。
//   auth_cast_can_register は「店 ON ∧ 本人 can_register」を 1 つの boolean で返す＝店 OFF と本人不許可を分けるため、false のときだけ店設定 cast_register を読み分ける。
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { castMineRegisterNavOf, castOwnSessionRegisterOf, castRegisterDenyReasonOf, castRegisterDeviceOf, type CastMineRegisterNav, type CastRegisterDenyReason } from "@/lib/nox/register/p173";
import { mig0190On } from "@/lib/nox/rules-0175/flag"; // ★便 M5 M-44: 打刻ゲート（duty_gate）は 0190 の配下
import { bizDateOf, bizDateRange } from "@/lib/nox/biz-date"; // ★便 M5 M-44: 当日営業日の窓（/mine と同じ）
import { punchStateOf } from "@/lib/nox/shift/punch-state"; // ★便 M5 M-44: 出勤中＝最終打刻が in
import { castRegisterLevelOf } from "@/lib/nox/rules-0175/cast-register"; // ★便 M5 M-40 (c): 店 OFF と本人不許可の読み分け

export type CastRegisterEntry = { allowed: boolean; canRegister: boolean; reason: CastRegisterDenyReason | null };

/** ★便 M5 M-44（2026-10-30）: /mine のナビ「レジ」＝castRegisterEntryOf ∧（店の duty_gate ON なら）出勤中。揃わなければ note（理由 1 行）。
 *  出勤中は当日営業日（店設定 biz_cutoff_hm・既定 06:00）の自分の打刻（RLS 本人）の最終が in。読取だけ・DB 変更 0。 */
export async function castMineRegisterNavEntryOf(supabase: SupabaseClient): Promise<CastMineRegisterNav> {
  const entry = await castRegisterEntryOf(supabase);
  if (entry.reason) return castMineRegisterNavOf({ reason: entry.reason, dutyGate: false, onDuty: false });
  const { data: storeRow } = await supabase.from("stores").select("settings_json").limit(1).maybeSingle();
  const sj = (storeRow?.settings_json ?? {}) as Record<string, unknown>;
  const dutyGate = mig0190On() && sj.duty_gate === true;
  if (!dutyGate) return castMineRegisterNavOf({ reason: null, dutyGate: false, onDuty: true });
  const cutoff = typeof sj.biz_cutoff_hm === "string" && sj.biz_cutoff_hm ? (sj.biz_cutoff_hm as string) : "06:00";
  const { startIso, endIso } = bizDateRange(bizDateOf(new Date().toISOString(), cutoff), cutoff);
  const { data: punches } = await supabase.from("punches").select("type, punched_at").gte("punched_at", startIso).lt("punched_at", endIso);
  const onDuty = punchStateOf((punches ?? []) as { type: string; punched_at: string }[]).state === "open";
  return castMineRegisterNavOf({ reason: null, dutyGate: true, onDuty });
}

export async function castRegisterEntryOf(supabase: SupabaseClient): Promise<CastRegisterEntry> {
  const { data: can } = await supabase.rpc("auth_cast_can_register");
  const canRegister = can === true;
  const { data: storeRow } = await supabase.from("stores").select("id, settings_json").limit(1).maybeSingle();
  const sj = (storeRow?.settings_json ?? {}) as Record<string, unknown>;
  if (!canRegister) {
    // ★M-40 (c): 店の段階（sys_cast_register／旧 cast_register_enabled＝castRegisterLevelOf）が 0＝store_off・店は ON なのに通らない＝本人の不許可
    const storeOn = castRegisterLevelOf(sj) >= 1;
    return { allowed: false, canRegister: false, reason: castRegisterDenyReasonOf({ enabled: storeOn, canRegister: false, device: castRegisterDeviceOf(sj), registerDevices: 0 }) };
  }
  const device = castRegisterDeviceOf(storeRow?.settings_json);
  let registerDevices = 0;
  if (device === "store_device" && storeRow?.id) {
    try {
      const { count } = await createAdminClient().from("kiosk_devices").select("id", { count: "exact", head: true }).eq("store_id", storeRow.id as string).eq("purpose", "register").eq("is_active", true);
      registerDevices = count ?? 0;
    } catch { registerDevices = 0; }
  }
  const i = { enabled: true, canRegister: true, device, registerDevices };
  return { allowed: castOwnSessionRegisterOf(i), canRegister: true, reason: castRegisterDenyReasonOf(i) };
}
