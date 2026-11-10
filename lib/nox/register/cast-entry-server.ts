// ★便 P173（裁定389 追補1・0173）: キャスト本人のセッションから /register（と日次の締め＝/report）を通すかの server 判定。
//   店 ON ∧ 本人 can_register（auth_cast_can_register）∧ 店設定 cast_register_device が 'own_phone'。
//   ★裁定473／M-131（2026-11-10）: 「店端末（kiosk_devices purpose 'register'）が未登録＝自分のスマホ扱い」の例外を廃止＝店端末のみの店はスマホから通さない（client 側）。RPC 側は 0200（auth_cast_can_register が端末を見る）。
//   ★裁定472（2026-11-10）: /register の入場も出勤中だけ（ナビと同じ判定＝castOnDutyOf）。打刻ゲート（duty_gate）OFF の例外は廃止。
//   ★0200（MIG_0200_APPLIED＝auth_register_access）: フラグ true なら RPC の 1 本（段階・端末・出勤中）を読む＝ナビと入場が同じ真実。false の間は client で同じ順に判定。
// ★便 M5 M-40 (c)（2026-10-30）: reason（通さない理由語＝castRegisterDenyReasonOf）を添えて返す（allowed=true のとき null）。
import type { SupabaseClient } from "@supabase/supabase-js";
import { bizNowMinOf, inRegisterWindowOf, registerWindowOf, storeDecidesPunchOf, storeRegisterWindowTextOf } from "@/lib/nox/shift/punch-mode"; // ★便 E（0197 用）
import { castMineRegisterNavOf, castOwnSessionRegisterOf, castRegisterDenyReasonOf, castRegisterDeviceOf, castRegisterReasonOfAccess, type CastMineRegisterNav, type CastRegisterDenyReason } from "@/lib/nox/register/p173";
import { mig0200On } from "@/lib/nox/rules-0175/flag"; // ★0200（裁定472／473）
import { bizDateOf, bizDateRange } from "@/lib/nox/biz-date"; // ★便 M5 M-44: 当日営業日の窓（/mine と同じ）
import { punchStateOf } from "@/lib/nox/shift/punch-state"; // ★便 M5 M-44: 出勤中＝最終打刻が in
import { castRegisterLevelOf } from "@/lib/nox/rules-0175/cast-register"; // ★便 M5 M-40 (c): 店 OFF と本人不許可の読み分け

export type CastRegisterEntry = { allowed: boolean; canRegister: boolean; reason: CastRegisterDenyReason | null };
type AccessRow = { allowed?: boolean; reason?: string | null; role?: string | null };

/** ★裁定472: 本人（cast）が今「出勤中」か＝打刻しない店＝その営業日の確定シフトの窓か「今日だけ許可」・打刻する店＝当日営業日の最終打刻が in。note＝打刻しない店の窓の 1 行（出勤中でないとき） */
async function castOnDutyOf(supabase: SupabaseClient, sj: Record<string, unknown>): Promise<{ onDuty: boolean; note: string | null }> {
  const cutoff = typeof sj.biz_cutoff_hm === "string" && sj.biz_cutoff_hm ? (sj.biz_cutoff_hm as string) : "06:00";
  if (storeDecidesPunchOf(sj)) {
    const biz = bizDateOf(new Date().toISOString(), cutoff);
    const [{ data: sh }, { data: gr }] = await Promise.all([
      supabase.from("shifts").select("start_hm, end_hm").eq("date", biz).eq("status", "confirmed").order("start_hm").limit(1),
      supabase.from("register_day_grants").select("id").eq("biz_date", biz).eq("subject_kind", "cast").limit(1),
    ]);
    const shift = ((sh ?? [])[0] as { start_hm: string; end_hm: string } | undefined) ?? null;
    const win = registerWindowOf(sj);
    const onDuty = ((gr ?? []).length > 0) || inRegisterWindowOf(shift, win, bizNowMinOf(Date.now(), cutoff));
    return { onDuty, note: onDuty ? null : `レジ：${storeRegisterWindowTextOf(shift, win)}` };
  }
  const { startIso, endIso } = bizDateRange(bizDateOf(new Date().toISOString(), cutoff), cutoff);
  const { data: punches } = await supabase.from("punches").select("type, punched_at").gte("punched_at", startIso).lt("punched_at", endIso);
  return { onDuty: punchStateOf((punches ?? []) as { type: string; punched_at: string }[]).state === "open", note: null };
}

/** ★便 M5 M-44（2026-10-30）: /mine のナビ「レジ」＝castRegisterEntryOf ∧ 出勤中。揃わなければ note（理由 1 行）。読取だけ・DB 変更 0。 */
export async function castMineRegisterNavEntryOf(supabase: SupabaseClient): Promise<CastMineRegisterNav> {
  const { data: storeRow } = await supabase.from("stores").select("settings_json").limit(1).maybeSingle();
  const sj = (storeRow?.settings_json ?? {}) as Record<string, unknown>;
  if (mig0200On()) { // ★0200: RPC の 1 本（段階・本人・端末・出勤中）
    const { data } = await supabase.rpc("auth_register_access");
    const a = (data ?? null) as AccessRow | null;
    if (a?.allowed === true) return castMineRegisterNavOf({ reason: null, dutyGate: true, onDuty: true });
    const reason = castRegisterReasonOfAccess(a?.reason ?? "forbidden", castRegisterLevelOf(sj) >= 1);
    const nav = castMineRegisterNavOf({ reason, dutyGate: true, onDuty: false });
    if (reason === "off_duty" && storeDecidesPunchOf(sj)) { const d = await castOnDutyOf(supabase, sj); return { ...nav, note: d.note ?? nav.note }; }
    return nav;
  }
  const entry = await castRegisterEntryOf(supabase);
  if (entry.reason) return castMineRegisterNavOf({ reason: entry.reason, dutyGate: false, onDuty: false });
  const d = await castOnDutyOf(supabase, sj);
  const nav = castMineRegisterNavOf({ reason: null, dutyGate: true, onDuty: d.onDuty });
  return nav.show || !d.note ? nav : { ...nav, note: d.note };
}

/** /register・/report の入場（(manage)/layout）＝店 ON ∧ 本人 ∧ 自分のスマホからも ∧ 出勤中（★裁定472）。通さない理由を why に */
export async function castRegisterEntryOf(supabase: SupabaseClient): Promise<CastRegisterEntry> {
  const { data: storeRow } = await supabase.from("stores").select("id, settings_json").limit(1).maybeSingle();
  const sj = (storeRow?.settings_json ?? {}) as Record<string, unknown>;
  if (mig0200On()) { // ★0200: RPC の 1 本
    const { data } = await supabase.rpc("auth_register_access");
    const a = (data ?? null) as AccessRow | null;
    if (a?.allowed === true) return { allowed: true, canRegister: true, reason: null };
    const reason = castRegisterReasonOfAccess(a?.reason ?? "forbidden", castRegisterLevelOf(sj) >= 1);
    return { allowed: false, canRegister: reason !== "store_off" && reason !== "not_allowed", reason };
  }
  const { data: can } = await supabase.rpc("auth_cast_can_register");
  const canRegister = can === true;
  if (!canRegister) {
    // ★M-40 (c): 店の段階（sys_cast_register）が 0＝store_off・店は ON なのに通らない＝本人の不許可
    const storeOn = castRegisterLevelOf(sj) >= 1;
    return { allowed: false, canRegister: false, reason: castRegisterDenyReasonOf({ enabled: storeOn, canRegister: false, device: castRegisterDeviceOf(sj), registerDevices: 0 }) };
  }
  const device = castRegisterDeviceOf(storeRow?.settings_json);
  const i = { enabled: true, canRegister: true, device, registerDevices: 0 };
  if (!castOwnSessionRegisterOf(i)) return { allowed: false, canRegister: true, reason: castRegisterDenyReasonOf(i) };
  const d = await castOnDutyOf(supabase, sj);   // ★裁定472: 入場も出勤中だけ
  return d.onDuty ? { allowed: true, canRegister: true, reason: null } : { allowed: false, canRegister: true, reason: "off_duty" };
}
