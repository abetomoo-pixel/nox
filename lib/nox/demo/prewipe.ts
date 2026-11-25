// ★M-122（2026-11-09）: デモ reset の wipe（demo_org_reset の c_wipe）に入っていない表を、route 側で「子から親へ」先に消す。
//   背景＝11/09 06:11 ACE の wipe が 500＝「update or delete on table "memberships" violates foreign key constraint "availability_terms_updated_by_fkey"」。
//   0175 v2 以降に増えた表（availability／availability_terms／cast_day_deductions／register_day_grants／staff_allowances／kiosk_qr_* …）は c_wipe に無く、
//   no-action の FK（availability_terms.updated_by → memberships・kiosk_qr_claims.* → memberships／kiosk_devices／kiosk_sessions）が親の削除を止める。
//   DB の c_wipe の直し（0198 ★5＝6 表）は手貼り待ち＝それまでも落ちないよう route（service role）が先に消す。DDL なし。
//   表が増えたときは verify:nox-wipe-cover（pg 直結＝org_id を持つ全表が c_wipe∪c_keep∪PREWIPE∪KEEP_EXTRA に入っているか）が赤になる。
import type { SupabaseClient } from "@supabase/supabase-js";
import { mig0213On, mig0214On } from "../rules-0175/flag"; // ★0213／0214

/** org_id で消す表＝子から親へ（cast_rate_history → slide_decisions は set null・kiosk_qr_claims → kiosk_sessions／kiosk_devices／memberships は no action＝wipe の前に必ず消す） */
export const DEMO_PREWIPE_TABLES: readonly string[] = [
  "cast_rate_history", "kiosk_qr_claims",
  "attendance_contacts", "cast_notifications", "contact_changes",   // ★0198 ★5（2026-11-09 手貼り）: availability_terms／availability／cast_day_deductions／deduction_rule_casts／register_day_grants／staff_allowances は c_wipe へ移った＝ここから外す
  "line_bind_tokens", "line_links", "line_push_log", "norm_shortfall_intents", "payroll_employee_deductions", "payroll_withholding_overrides",
  "plan_event_bonuses", "plan_norm_tiers", "plan_rate_bands", "punch_corrections", "punch_round_consents", "setup_drafts",
  "shift_period_needs", "slide_decisions", "staff_attendance_days", "staff_attendance_locks", "staff_invites",   // ★0200 ★8（2026-11-10 手貼り）: staff_labor_confirmed は c_wipe へ（支払い記録 → 確定額の順で DB が消す）＝ここから外す
  "staff_sensitive", "store_special_days",
  "cast_employment",   // ★0206 版 2（2026-11-24 08:05 適用）: 契約区分の履歴（casts の削除で連鎖して消えるが、store_id→stores は no action＝wipe の前に route が先に消す・DDL なし・入れ直しのデモには行が無い＝今の値で計算）
  ...(mig0213On() ? ["punch_round_rules"] : []),   // ★0213（相談役 11/25 の D4）: 丸めの履歴（stores の削除で連鎖して消えるが、名簿に載せる＝wipe-cover・旗 false の間は表が無い＝消さない）
  ...(mig0214On() ? ["punch_breaks"] : []),        // ★0214（D5）: 休憩（casts・memberships の削除で連鎖して消える・旗 false の間は表が無い）
];
/** org_id が無く、端末（kiosk_devices）経由で消す表 */
export const DEMO_PREWIPE_BY_DEVICE: readonly string[] = ["kiosk_qr_keys"];
/** org_id を持つが消さない表（users と同じく残す＝demo_entries は /demo の入場ログ・member_profiles は users の属性） */
//   ★0202a（2026-11-21 本番適用）: ops_audit_logs は運営の監査（会社をまたぐ・会社を消すと org_id が null で残る）＝デモの wipe では消さない（デモの会社には運営の操作を許さない＝行は出来ない）
export const DEMO_KEEP_EXTRA: readonly string[] = ["demo_entries", "member_profiles", "ops_audit_logs", "ops_support_grants", "cast_provisionals", "ops_support_requests" /* ★0207（2026-11-25）: 運営の頼み＝デモの会社では関数が断る＝行は 0 */]; // ★0202b（2026-11-21 21:57 適用）: デモの会社では作れない（オーナーの窓口は forbidden (demo)・代行は onb_can_write がデモを止める）＝消す名簿に要らない

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
