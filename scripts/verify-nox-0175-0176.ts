/*
 * verify:nox-0175-0176 — 0175 v2（rules bundle・2026-10-23 CN-R 追加）／0176（people・LINE）の DB 段（2026-10-22 起草・**実行は P175 の後**＝f0 への追加も P175 後）。
 *   Postgres 直結（SUPABASE_DB_URL・default_transaction_read_only）で introspection のみ＝書込なし。
 *   未適用（stores.punch_enforce が無い）なら SKIP で緑（exit 0）＝起草の時点で f0 に入れても害がない。P176 未適用なら 0176 の段だけ SKIP。
 *  (1) 0175: 新表 3・列（stores 9／comp_plans 2／payroll_adjustments 6／daily_pays 3／pricing_rules 2／staff_contracts 6／memberships 2／users 2）・引数（check_pay 10・receipt_issue 6・set_comp_plan 32・payroll_adjustment_add 14・punch_self 7）・旧 overload なし・
 *      新設 12 本の存在・pt_rules_check に authenticated なし・新表の authenticated＝SELECT のみ・anon 0・price_display の既定 tax_excluded・comp_plans.slide_method が全行 3 値のどれか・RLS 有効
 *  (2) 0176: 新表 9・service_role 専用 6 本に authenticated なし・新表の authenticated＝SELECT のみ・line_bind_tokens は authenticated／anon 付与 0・RLS 有効・shift_periods_auto_close は authenticated から BLOCKED（permission denied）
 *  逆テスト（手動・1 回）: 本番でなくローカル cluster に 0175 を流し、availability の grant を insert 付きにする→(1) の「SELECT のみ」が赤。
 */
import pg from "pg";

process.loadEnvFile?.(".env.local");
const url = process.env.SUPABASE_DB_URL;
if (!url) { console.error("SUPABASE_DB_URL missing"); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: string) => { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); };
const q = async <T = Record<string, unknown>>(s: string, p: unknown[] = []) => (await c.query(s, p)).rows as T[];
const n1 = async (s: string, p: unknown[] = []) => Number((await q<{ n: string }>(s, p))[0]?.n ?? 0);
const cols = async (t: string, names: string[]) => n1(`select count(*)::text n from information_schema.columns where table_schema='public' and table_name=$1 and column_name = any($2::text[])`, [t, names]);

(async () => {
  await c.connect(); await c.query("set default_transaction_read_only = on");
  const applied175 = (await cols("stores", ["punch_enforce"])) === 1;
  if (!applied175) { console.log("verify:nox-0175-0176 SKIP（0175 未適用＝stores.punch_enforce なし・P175 後に有効）"); await c.end(); return; }
  // (1) 0175
  check("v175(1-1) 新表 3", (await n1(`select count(*)::text n from pg_tables where schemaname='public' and tablename in ('punch_round_consents','availability','availability_terms')`)) === 3);
  check("v175(1-2) 列＝stores 9／comp_plans 2／payroll_adjustments 6／daily_pays 3／pricing_rules 2／staff_contracts 6／memberships 2／users 2／products 1／check_lines 1／receipt_issues 2",
    (await cols("stores", ["punch_enforce", "punch_restrict_mode", "punch_lat", "punch_lng", "punch_radius_m", "punch_allow_ip", "punch_require_shift", "punch_round_unit", "punch_round_mode"])) === 9
    && (await cols("comp_plans", ["slide_method", "pt_rules"])) === 2 && (await cols("payroll_adjustments", ["kind", "source_table", "source_id", "cancelled_at", "cancelled_by", "cancel_reason"])) === 6
    && (await cols("daily_pays", ["cancelled_at", "cancelled_by", "cancel_reason"])) === 3 && (await cols("pricing_rules", ["vip_timing", "vip_ext_amount"])) === 2
    && (await cols("staff_contracts", ["pay_kind", "monthly", "daily", "min_month_h", "max_month_h", "max_consec"])) === 6 && (await cols("memberships", ["hire_date", "leave_date"])) === 2
    && (await cols("users", ["contact_email", "phone"])) === 2 && (await cols("products", ["pt"])) === 1 && (await cols("check_lines", ["fee_rate"])) === 1 && (await cols("receipt_issues", ["reissue_of", "by_membership"])) === 2
    && (await cols("payments", ["fee_amount", "fee_source"])) === 2 && (await cols("bottle_keeps", ["tag_label"])) === 1 && (await cols("checks", ["ext_rule_id"])) === 1 && (await cols("approvals", ["staff_direct"])) === 1 && (await cols("receipt_issues", ["tax_breakdown", "issuer_snapshot", "payment_method", "issued_hash"])) === 4 && (await cols("stores", ["legal_name", "trade_name", "receipt_default_desc"])) === 3 && (await cols("kiosk_sessions", ["end_reason", "token_hash", "unlock_method"])) === 3 && (await cols("memberships", ["qr_secret", "qr_fail_count", "qr_locked_until"])) === 3); // ★連続便 3 追補 P-8／P-9／P-10・追補 2 ★24・★26・★27
  const args = await q<{ proname: string; pronargs: number; n: string }>(`select proname, max(pronargs)::int pronargs, count(*)::text n from pg_proc where pronamespace='public'::regnamespace and proname in ('check_pay','receipt_issue','set_comp_plan','payroll_adjustment_add','punch_self') group by 1 order by 1`);
  const a = Object.fromEntries(args.map((r) => [r.proname, [r.pronargs, Number(r.n)]]));
  check("v175(1-3) 引数＝check_pay 11（v2 追補 P-8）／receipt_issue 6／set_comp_plan 32／payroll_adjustment_add 14／punch_self 7・旧 overload なし（各 1 本）",
    JSON.stringify(a) === JSON.stringify({ check_pay: [11, 1], payroll_adjustment_add: [14, 1], punch_self: [7, 1], receipt_issue: [6, 1], set_comp_plan: [32, 1] }), JSON.stringify(a));
  check("v175(1-4) 新設 RPC 21（★26 set_store_invoice_profile・★27 kiosk_unlock／kiosk_lock／my_qr_secret／kiosk_unlock_qr／totp_code_of・★28 auth_role_raw／set_membership_role／owner_transfer）", (await n1(`select count(*)::text n from pg_proc where pronamespace='public'::regnamespace and proname in ('pt_rules_check','payroll_adjustment_cancel','norm_shortfall_decide','daily_pay_cancel','set_cast_kind','set_pricing_rule_vip','staff_payroll_run_set_status','store_wifi_add','store_wifi_remove','availability_set','availability_list','set_my_contact','set_store_invoice_profile','kiosk_unlock','kiosk_lock','my_qr_secret','kiosk_unlock_qr','totp_code_of','auth_role_raw','set_membership_role','owner_transfer')`)) === 21);
  check("v175(1-4b) ★28 役割「管理者」＝memberships.role CHECK に admin・auth_role は admin→owner・org_billing_select は auth_role_raw（3 つ揃って 1）", (await n1(`select count(*)::text n from (select 1 where exists (select 1 from pg_constraint where conname='memberships_role_check' and pg_get_constraintdef(oid) like '%admin%') and exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='auth_role' and prosrc like '%''admin'' then ''owner''%') and exists (select 1 from pg_policies where schemaname='public' and tablename='org_billing' and qual like '%auth_role_raw%')) x`)) === 1);
  check("v175(1-5) pt_rules_check は内部専用（authenticated／anon なし）", (await n1(`select count(*)::text n from pg_proc where pronamespace='public'::regnamespace and proname='pt_rules_check' and coalesce(proacl::text,'') not like '%authenticated%' and coalesce(proacl::text,'') not like '%anon%'`)) === 1);
  const g = await q<{ grantee: string; privs: string }>(`select grantee, string_agg(distinct privilege_type, ',') privs from information_schema.role_table_grants where table_schema='public' and table_name in ('punch_round_consents','availability','availability_terms') and grantee in ('authenticated','anon','public') group by 1`);
  check("v175(1-6) 新表 3＝authenticated は SELECT のみ・anon／public 付与 0", g.length === 1 && g[0].grantee === "authenticated" && g[0].privs === "SELECT", JSON.stringify(g));
  check("v175(1-7) 新表 3 の RLS 有効", (await n1(`select count(*)::text n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relname in ('punch_round_consents','availability','availability_terms') and c.relrowsecurity`)) === 3);
  check("v175(1-8) price_display の既定＝tax_excluded", (await q<{ d: string }>(`select column_default d from information_schema.columns where table_schema='public' and table_name='stores' and column_name='price_display'`))[0]?.d?.includes("tax_excluded") === true);
  check("v175(1-9) comp_plans.slide_method＝全行 sales／point／none（移行 SQL）", (await n1(`select count(*)::text n from public.comp_plans where slide_method not in ('sales','point','none')`)) === 0);
  // v2（2026-10-23・CN-R／412 追補／R-4）
  check("v175(1-10) v2 新表 5（plan_rate_bands／plan_norm_tiers／plan_event_bonuses／slide_decisions／cast_rate_history）・RLS 有効・authenticated SELECT のみ",
    (await n1(`select count(*)::text n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relname in ('plan_rate_bands','plan_norm_tiers','plan_event_bonuses','slide_decisions','cast_rate_history') and c.relrowsecurity`)) === 5
    && (await q<{ grantee: string; privs: string }>(`select grantee, string_agg(distinct privilege_type, ',') privs from information_schema.role_table_grants where table_schema='public' and table_name in ('plan_rate_bands','plan_norm_tiers','plan_event_bonuses','slide_decisions','cast_rate_history') and grantee in ('authenticated','anon','public') group by 1`)).every((g) => g.grantee === "authenticated" && g.privs === "SELECT"));
  check("v175(1-11) v2 comp_plans 12 列・stores.service_rate_by_seat・slide_basis CHECK に pay_rate・attendance.status に dohan 行 0・CHECK に help／duty_absent",
    (await cols("comp_plans", ["pay_rate_tiers", "slide_streak_n", "reward_axis", "assess_grace_months", "hon_back_unit", "jonai_back_unit", "dohan_back_unit", "product_back_rate_by_kind", "product_back_fixed_vip", "product_back_rate_vip", "reservation_back_tiers", "back_rate_tiers"])) === 12
    && (await cols("stores", ["service_rate_by_seat"])) === 1
    && (await n1(`select count(*)::text n from pg_constraint where conname='comp_plans_slide_basis_check' and pg_get_constraintdef(oid) like '%pay_rate%'`)) === 1
    && (await n1(`select count(*)::text n from public.attendance where status='dohan'`)) === 0
    && (await n1(`select count(*)::text n from pg_constraint where conname='attendance_status_check' and pg_get_constraintdef(oid) like '%duty_absent%' and pg_get_constraintdef(oid) not like '%dohan%'`)) === 1);
  check("v175(1-12) v2 新設 RPC 8・comp_plan_pay_rate_check は内部専用・daily_pay_issue 6 引数 1 本",
    (await n1(`select count(*)::text n from pg_proc where pronamespace='public'::regnamespace and proname in ('comp_plan_pay_rate_check','comp_plan_ext_set','plan_rate_band_set','plan_norm_tier_set','plan_event_bonus_set','slide_decision_propose','slide_decision_decide','cast_rate_history_add')`)) === 8
    && (await n1(`select count(*)::text n from pg_proc where pronamespace='public'::regnamespace and proname='comp_plan_pay_rate_check' and coalesce(proacl::text,'') not like '%authenticated%'`)) === 1
    && JSON.stringify((await q<{ pronargs: number; n: string }>(`select max(pronargs)::int pronargs, count(*)::text n from pg_proc where pronamespace='public'::regnamespace and proname='daily_pay_issue'`))[0]) === JSON.stringify({ pronargs: 6, n: "1" }));
  // (2) 0176（未適用なら SKIP）
  const applied176 = (await n1(`select count(*)::text n from pg_tables where schemaname='public' and tablename='line_links'`)) === 1;
  if (!applied176) {
    console.log("v176: SKIP（0176 未適用＝line_links なし）");
  } else {
    check("v176(2-1) 新表 9", (await n1(`select count(*)::text n from pg_tables where schemaname='public' and tablename in ('line_links','line_bind_tokens','line_push_log','staff_invites','member_profiles','attendance_contacts','contact_changes','shift_period_needs','cast_notifications')`)) === 9);
    check("v176(2-2) service_role 専用 6 本＝authenticated なし・service_role あり", (await n1(`select count(*)::text n from pg_proc where pronamespace='public'::regnamespace and proname in ('set_line_secret','get_line_secret','bind_line','staff_invite_accept','line_push_log_write','shift_periods_auto_close') and coalesce(proacl::text,'') not like '%authenticated%' and coalesce(proacl::text,'') like '%service_role%'`)) === 6);
    const g2 = await q<{ grantee: string; privs: string }>(`select grantee, string_agg(distinct privilege_type, ',') privs from information_schema.role_table_grants where table_schema='public' and table_name in ('line_links','line_push_log','staff_invites','member_profiles','attendance_contacts','contact_changes','shift_period_needs','cast_notifications') and grantee in ('authenticated','anon','public') group by 1`);
    check("v176(2-3) 新表 8＝authenticated は SELECT のみ・anon／public 付与 0", g2.length === 1 && g2[0].grantee === "authenticated" && g2[0].privs === "SELECT", JSON.stringify(g2));
    check("v176(2-4) line_bind_tokens＝authenticated／anon 付与 0・RLS 有効", (await n1(`select count(*)::text n from information_schema.role_table_grants where table_schema='public' and table_name='line_bind_tokens' and grantee in ('authenticated','anon')`)) === 0
      && (await n1(`select count(*)::text n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relname='line_bind_tokens' and c.relrowsecurity`)) === 1);
    check("v176(2-5) 新表 9 の RLS 有効", (await n1(`select count(*)::text n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relname in ('line_links','line_bind_tokens','line_push_log','staff_invites','member_profiles','attendance_contacts','contact_changes','shift_period_needs','cast_notifications') and c.relrowsecurity`)) === 9);
    check("v176(2-6) stores.line_config／line_monthly_limit・notices.cast_ids・shifts decline 2・attendance ack 2", (await cols("stores", ["line_config", "line_monthly_limit"])) === 2 && (await cols("notices", ["cast_ids"])) === 1 && (await cols("shifts", ["declined_at", "decline_reason"])) === 2 && (await cols("attendance", ["ack_at", "ack_by"])) === 2);
  }
  await c.end();
  if (fails.length) { console.error(`verify:nox-0175-0176 FAIL (${fails.length})\n- ${fails.join("\n- ")}`); process.exit(1); }
  console.log(`verify:nox-0175-0176 OK (${pass} checks)${applied176 ? "" : "（0176 の段は SKIP）"}`);
})().catch((e) => { console.error(e); process.exit(1); });
