// ★M-122（2026-11-09）: デモ reset の wipe（demo_org_reset の c_wipe）に入っていない表を、route 側で「子から親へ」先に消す。
//   背景＝11/09 06:11 ACE の wipe が 500＝「update or delete on table "memberships" violates foreign key constraint "availability_terms_updated_by_fkey"」。
//   0175 v2 以降に増えた表（availability／availability_terms／cast_day_deductions／register_day_grants／staff_allowances／kiosk_qr_* …）は c_wipe に無く、
//   no-action の FK（availability_terms.updated_by → memberships・kiosk_qr_claims.* → memberships／kiosk_devices／kiosk_sessions）が親の削除を止める。
//   DB の c_wipe の直し（0198 ★5＝6 表）は手貼り待ち＝それまでも落ちないよう route（service role）が先に消す。DDL なし。
//   表が増えたときは verify:nox-wipe-cover（pg 直結＝org_id を持つ全表が c_wipe∪c_keep∪PREWIPE∪KEEP_EXTRA に入っているか）が赤になる。
import type { SupabaseClient } from "@supabase/supabase-js";

/** org_id で消す表＝子から親へ（cast_rate_history → slide_decisions は set null・kiosk_qr_claims → kiosk_sessions／kiosk_devices／memberships は no action＝wipe の前に必ず消す） */
export const DEMO_PREWIPE_TABLES: readonly string[] = [
  "cast_rate_history", "kiosk_qr_claims",
  "attendance_contacts", "availability_terms", "availability", "cast_day_deductions", "cast_notifications", "contact_changes", "deduction_rule_casts",
  "line_bind_tokens", "line_links", "line_push_log", "norm_shortfall_intents", "payroll_employee_deductions", "payroll_withholding_overrides",
  "plan_event_bonuses", "plan_norm_tiers", "plan_rate_bands", "punch_corrections", "punch_round_consents", "register_day_grants", "setup_drafts",
  "shift_period_needs", "slide_decisions", "staff_allowances", "staff_attendance_days", "staff_attendance_locks", "staff_invites", "staff_labor_confirmed",
  "staff_sensitive", "store_special_days",
];
/** org_id が無く、端末（kiosk_devices）経由で消す表 */
export const DEMO_PREWIPE_BY_DEVICE: readonly string[] = ["kiosk_qr_keys"];
/** org_id を持つが消さない表（users と同じく残す＝demo_entries は /demo の入場ログ・member_profiles は users の属性） */
export const DEMO_KEEP_EXTRA: readonly string[] = ["demo_entries", "member_profiles"];

export type PrewipeResult = { ok: true; deleted: Record<string, number> } | { ok: false; table: string; error: string; deleted: Record<string, number> };

/** wipe の前に demo org の行を子から親へ消す（service role・is_demo の org だけ＝呼び手が確認済み） */
export async function prewipeDemoOrg(admin: SupabaseClient, orgId: string): Promise<PrewipeResult> {
  const deleted: Record<string, number> = {};
  const { data: devs, error: eD } = await admin.from("kiosk_devices").select("id").eq("org_id", orgId);
  if (eD) return { ok: false, table: "kiosk_devices", error: eD.message, deleted };
  const devIds = ((devs ?? []) as { id: string }[]).map((d) => d.id);
  for (const t of DEMO_PREWIPE_BY_DEVICE) {
    if (devIds.length === 0) { deleted[t] = 0; continue; }
    const { data, error } = await admin.from(t).delete().in("device_id", devIds).select("device_id");
    if (error) return { ok: false, table: t, error: error.message, deleted };
    deleted[t] = (data ?? []).length;
  }
  for (const t of DEMO_PREWIPE_TABLES) {
    const { data, error } = await admin.from(t).delete().eq("org_id", orgId).select("org_id");
    if (error) return { ok: false, table: t, error: error.message, deleted };
    deleted[t] = (data ?? []).length;
  }
  return { ok: true, deleted };
}
