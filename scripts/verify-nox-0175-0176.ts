/*
 * verify:nox-0175-0176 — 0175 v2（rules bundle・2026-10-23 CN-R 追加）／0176（people・LINE）の DB 段（2026-10-22 起草・**実行は P175 の後**＝f0 への追加も P175 後）。
 *   Postgres 直結（SUPABASE_DB_URL・default_transaction_read_only）で introspection のみ＝書込なし。
 *   未適用（stores.punch_enforce が無い）なら SKIP で緑（exit 0）＝起草の時点で f0 に入れても害がない。P176 未適用なら 0176 の段だけ SKIP。
 *  (1) 0175: 新表 3・列（stores 9／comp_plans 2／payroll_adjustments 6／daily_pays 3／pricing_rules 2／staff_contracts 6／memberships 2／users 2）・引数（check_pay 10・receipt_issue 6・set_comp_plan 32・payroll_adjustment_add 14・punch_self 7）・旧 overload なし・
 *      新設 12 本の存在・pt_rules_check に authenticated なし・新表の authenticated＝SELECT のみ・anon 0・price_display の既定 tax_excluded・comp_plans.slide_method が全行 3 値のどれか・RLS 有効
 *  (2) 0176: 新表 9・service_role 専用 6 本に authenticated なし・新表の authenticated＝SELECT のみ・line_bind_tokens は authenticated／anon 付与 0・RLS 有効・shift_periods_auto_close は authenticated から BLOCKED（permission denied）
 *  (3) ★便 ON-1（2026-10-26・0175／0176／0177 は Agoora 手貼り済み＝SKIP を撤去し f0 に合流）0177（裁定414 送りの 4 方式）: transport.mode 列＋CHECK・6 本の md5 が起草（supabase/migrations/0177_okuri_mode_4way.sql）と一致・proacl 不変・
 *      pg 1 トランザクション（fixtures-pgtx・ROLLBACK）で owner が set_store_okuri_mode の 4 値を通し 'bogus' は 'bad okuri mode'・'none' の店で transport_issue は 'okuri none'・'store' の店では通って行に mode='store'
 *  (4) 効く（本番で RPC と loader が 0175 の列を使う）: ★17 attendance_set('dohan')＝'bad status'／★29 check_group_due＝開いている伝票は stores の丸め（開卓後に 100・up へ変えると due が 100 の倍数・1 に戻すと元）／
 *      R-2 payroll_adjustment_cancel が cancelled_at を書く・loadPayrollAdjustments（collect）が取消済みを数えない（admin 経由の fixture＝隔離 period 2033-02・finally で削除）／P-1 cast_rate_history_add→loadRateHistory が読む（finally で削除）
 *  逆テスト（手動・1 回）: 本番でなくローカル cluster に 0175 を流し、availability の grant を insert 付きにする→(1) の「SELECT のみ」が赤。
 */
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";
import { pgTx } from "./fixtures-pgtx";
import { loadPayrollAdjustments } from "../lib/nox/payroll/collect";
import { loadRateHistory } from "../lib/nox/payroll/rules-0175-collect";
import { rules0175On, okuri4wayOn } from "../lib/nox/rules-0175/flag";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SEED_PASSWORD", "SUPABASE_DB_URL"]);
const url = env.SUPABASE_DB_URL;
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: string) => { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); };
const q = async <T = Record<string, unknown>>(s: string, p: unknown[] = []) => (await c.query(s, p)).rows as T[];
const n1 = async (s: string, p: unknown[] = []) => Number((await q<{ n: string }>(s, p))[0]?.n ?? 0);
const cols = async (t: string, names: string[]) => n1(`select count(*)::text n from information_schema.columns where table_schema='public' and table_name=$1 and column_name = any($2::text[])`, [t, names]);
const MIG_0177 = "supabase/migrations/0177_okuri_mode_4way.sql";
const ISO_PERIOD = "2033-02"; // (4) の隔離 period（他 suite と重ならない未来）

(async () => {
  await c.connect(); await c.query("set default_transaction_read_only = on");
  const applied175 = (await cols("stores", ["punch_enforce"])) === 1;
  check("v175(0) 0175 適用済み（stores.punch_enforce あり）＝便 ON-1 から SKIP しない・フラグ rules0175On()／okuri4wayOn() は true", applied175 && rules0175On() && okuri4wayOn());
  if (!applied175) { console.error("verify:nox-0175-0176 FAIL: 0175 未適用（stores.punch_enforce なし）"); await c.end(); process.exit(1); }
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
  check("v175(1-3) 引数＝check_pay 13（v2 追補 P-8 の 11 ＋★0187 の p_disc_rate／p_disc_amount＝2026-10-29 手貼り）／receipt_issue 6／set_comp_plan 32／payroll_adjustment_add 14／punch_self 7・旧 overload なし（各 1 本）",
    JSON.stringify(a) === JSON.stringify({ check_pay: [13, 1], payroll_adjustment_add: [14, 1], punch_self: [7, 1], receipt_issue: [6, 1], set_comp_plan: [32, 1] }), JSON.stringify(a));
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
    check("v176(2-0) 0176 適用済み（line_links あり）＝便 ON-1 から SKIP しない", false, "line_links なし");
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

  // ── (3) ★便 ON-1: 0177（裁定414 送りの 4 方式）の DB 段 ──
  const fs = await import("node:fs");
  const crypto = await import("node:crypto");
  check("v177(3-1) transport.mode 列（text・not null・既定 'actual'）＋CHECK（actual／flat／store）", (await q<{ d: string; nn: string }>(`select column_default d, is_nullable nn from information_schema.columns where table_schema='public' and table_name='transport' and column_name='mode'`))[0]?.d?.includes("actual") === true
    && (await n1(`select count(*)::text n from pg_constraint where conrelid='public.transport'::regclass and conname='transport_mode_check' and pg_get_constraintdef(oid) like '%''store''%'`)) === 1);
  const mig177 = fs.readFileSync(MIG_0177, "utf8").replace(/\r/g, "");
  const draftMd5 = new Map<string, string>();
  for (const m of mig177.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/g)) draftMd5.set(m[1], crypto.createHash("md5").update(m[2]).digest("hex").slice(0, 8));
  const live177 = await q<{ proname: string; md5: string; star: boolean }>(`select proname, left(md5(replace(prosrc, E'\\r', '')), 8) md5, prosrc like '%★0177%' star from pg_proc where pronamespace='public'::regnamespace and proname in ('set_store_okuri_mode','okuri_default_of','transport_issue','transport_issue_bulk','transport_issue_self','kiosk_transport_issue') order by 1`);
  check("v177(3-2) 6 本の md5＝収蔵した 0177（supabase/migrations）と一致・★0177 の語あり", live177.length === 6 && draftMd5.size === 6 && live177.every((r) => r.star && draftMd5.get(r.proname) === r.md5), JSON.stringify({ live: live177, draft: [...draftMd5] }));
  const acl177 = await q<{ proname: string; acl: string }>(`select proname, coalesce(proacl::text,'') acl from pg_proc where pronamespace='public'::regnamespace and proname in ('set_store_okuri_mode','okuri_default_of','transport_issue','transport_issue_bulk','transport_issue_self','kiosk_transport_issue') order by 1`);
  check("v177(3-3) proacl 不変＝okuri_default_of は postgres のみ（内部専用）・他 5 本は authenticated＋service_role・anon なし", acl177.every((r) => !r.acl.includes("anon")) && acl177.filter((r) => r.proname === "okuri_default_of").every((r) => !r.acl.includes("authenticated")) && acl177.filter((r) => r.proname !== "okuri_default_of").every((r) => r.acl.includes("authenticated") && r.acl.includes("service_role")), JSON.stringify(acl177));

  // (3)(4) の RPC 段＝別接続の 1 トランザクション（BEGIN … ROLLBACK＝残留 0）
  const w = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await w.connect();
  const T = pgTx(w);
  let castA1a = "", storeA1Id = "", orgAId = "", ownerUserId = "";
  try {
    await w.query("begin");
    const A1 = await T.storeA1(); storeA1Id = A1.id; orgAId = A1.org_id;
    const owner = await T.uidOf("ownerA"); ownerUserId = owner.id;
    const castUser = await T.uidOf("castA1a");
    castA1a = (await T.castOf(A1.id, castUser.id)) ?? "";
    check("v177(3-4) fixture＝NOX-VERIFY-A1・ownerA・castA1a が引ける（seed:f0 済み）", !!A1.id && !!owner.auth_user_id && !!castA1a);
    const today = (await T.one<{ d: string }>(`select to_char(current_date, 'YYYY-MM-DD') d`)).d;
    // 4 値＋不正値
    const r4 = [] as string[];
    for (const m of ["flat", "actual", "store", "none"]) { const r = await T.as(owner, `select public.set_store_okuri_mode($1, $2)`, [A1.id, m]); if (!r.ok) r4.push(`${m}: ${r.err}`); }
    const rBad = await T.as(owner, `select public.set_store_okuri_mode($1, 'bogus')`, [A1.id]);
    check("v177(3-5) owner の set_store_okuri_mode＝4 値（flat／actual／store／none）が通り 'bogus' は 'bad mode'（0177 ★2 の文言）", r4.length === 0 && !rBad.ok && rBad.err.includes("bad mode"), JSON.stringify({ r4, bad: T.errOf(rBad) }));
    // 'none' の店＝transport_issue は 'okuri none'
    await T.as(owner, `select public.set_store_okuri_mode($1, 'none')`, [A1.id]);
    const rNone = await T.as(owner, `select public.transport_issue($1, $2, 1500, $3::date, 'verify 0177 none')`, [A1.id, castA1a, today]);
    check("v177(3-6) 方式 'none' の店＝transport_issue は 'okuri none' で拒否", !rNone.ok && rNone.err.includes("okuri none"), T.errOf(rNone));
    // 'store' の店＝通って行に mode='store'
    await T.as(owner, `select public.set_store_okuri_mode($1, 'store')`, [A1.id]);
    const rStore = await T.as(owner, `select public.transport_issue($1, $2, 1500, $3::date, 'verify 0177 store') id`, [A1.id, castA1a, today]);
    const modeRow = rStore.ok ? await T.one<{ mode: string }>(`select mode from public.transport where id = $1`, [rStore.rows[0].id]) : null;
    check("v177(3-7) 方式 'store' の店＝transport_issue が通り transport.mode='store'（店負担＝諸経費行・控除なし）", rStore.ok && modeRow?.mode === "store", rStore.ok ? JSON.stringify(modeRow) : rStore.err);
    const rFlat = await (async () => { await T.as(owner, `select public.set_store_okuri_mode($1, 'flat')`, [A1.id]); return T.as(owner, `select public.transport_issue($1, $2, 1500, $3::date, 'verify 0177 flat') id`, [A1.id, castA1a, today]); })();
    const modeFlat = rFlat.ok ? await T.one<{ mode: string }>(`select mode from public.transport where id = $1`, [rFlat.rows[0].id]) : null;
    check("v177(3-8) 方式 'flat' の店＝通って mode='flat'（控除のみ・現金支払には載らない）", rFlat.ok && modeFlat?.mode === "flat", rFlat.ok ? JSON.stringify(modeFlat) : rFlat.err);
    const rAnon = await T.as("anon", `select public.set_store_okuri_mode($1, 'flat')`, [A1.id]);
    check("v177(3-9) anon の set_store_okuri_mode＝BLOCKED（permission denied）", !rAnon.ok && /permission denied/.test(rAnon.err), T.errOf(rAnon));

    // ── (4) 効く（0175）──
    const rDohan = await T.as(owner, `select public.attendance_set($1, $2::date, 'dohan')`, [castA1a, today]);
    const rShukkin = await T.as(owner, `select public.attendance_set($1, $2::date, 'shukkin')`, [castA1a, today]);
    check("v175(4-1) ★17 attendance_set('dohan')＝'bad status'（同伴の正本は伝票）・'shukkin' は通る", !rDohan.ok && rDohan.err.includes("bad status") && rShukkin.ok, JSON.stringify({ dohan: T.errOf(rDohan), shukkin: T.errOf(rShukkin) }));
    // ★29 丸めは凍結しない
    const seat = await T.one<{ id: string }>(`select s.id from public.seats s where s.store_id = $1 and s.is_active and not exists (select 1 from public.checks c where c.seat_id = s.id and c.status = 'open') order by s.sort_order, s.name limit 1`, [A1.id]);
    await w.query(`update public.stores set round_unit = 1, round_mode = 'down' where id = $1`, [A1.id]);
    const rOpen = await T.as(owner, `select public.check_open($1) id`, [seat?.id]);
    const checkId = rOpen.ok ? String(rOpen.rows[0].id) : "";
    const rLine = rOpen.ok ? await T.as(owner, `select public.check_add_line($1, null, 1, 'custom', 'A', 'verify ★29', 1234) id`, [checkId]) : rOpen;
    const due1 = rLine.ok ? Number((await T.one<{ d: number }>(`select public.check_group_due($1, 'A') d`, [checkId])).d) : NaN;
    await w.query(`update public.stores set round_unit = 100, round_mode = 'up' where id = $1`, [A1.id]);
    const due100 = rLine.ok ? Number((await T.one<{ d: number }>(`select public.check_group_due($1, 'A') d`, [checkId])).d) : NaN;
    await w.query(`update public.stores set round_unit = 1, round_mode = 'down' where id = $1`, [A1.id]);
    const dueBack = rLine.ok ? Number((await T.one<{ d: number }>(`select public.check_group_due($1, 'A') d`, [checkId])).d) : NaN;
    check("v175(4-2) ★29 check_group_due＝開いている伝票は stores の丸めを読む（開卓後に 100・up へ変えると due が 100 の倍数で元以上・1・down に戻すと元の額）", rOpen.ok && rLine.ok && Number.isFinite(due1) && due100 % 100 === 0 && due100 >= due1 && due100 - due1 < 100 && dueBack === due1, JSON.stringify({ open: T.errOf(rOpen), line: T.errOf(rLine), due1, due100, dueBack }));
    // R-2 payroll_adjustment_cancel が cancelled_at を書く（tx 内）
    const run = await T.one<{ id: string }>(`insert into public.payroll_runs (org_id, store_id, period, period_start, period_end, status, created_by) values ($1, $2, $3, $4::date, ($4::date + interval '1 month' - interval '1 day')::date, 'draft', $5) returning id`, [orgAId, A1.id, ISO_PERIOD, `${ISO_PERIOD}-01`, ownerUserId]);
    const adj = await T.one<{ id: string }>(`insert into public.payroll_adjustments (org_id, store_id, run_id, cast_id, mode, amount, before_withholding, show_detail, reason, created_by) values ($1, $2, $3, $4, 'fixed', 3000, false, true, 'verify R-2', $5) returning id`, [orgAId, A1.id, run.id, castA1a, ownerUserId]);
    const rCancel = await T.as(owner, `select public.payroll_adjustment_cancel($1, 'verify 取消')`, [adj.id]);
    const adjRow = await T.one<{ cancelled_at: string | null; cancel_reason: string | null }>(`select cancelled_at, cancel_reason from public.payroll_adjustments where id = $1`, [adj.id]);
    check("v175(4-3) R-2 owner の payroll_adjustment_cancel＝行を消さず cancelled_at／cancel_reason を書く", rCancel.ok && !!adjRow?.cancelled_at && adjRow.cancel_reason === "verify 取消", JSON.stringify({ r: T.errOf(rCancel), row: adjRow }));
    const rCancelCast = await T.as(castUser, `select public.payroll_adjustment_cancel($1, 'x')`, [adj.id]);
    check("v175(4-4) cast の payroll_adjustment_cancel＝forbidden", !rCancelCast.ok && /forbidden/.test(rCancelCast.err), T.errOf(rCancelCast));
    // P-1 cast_rate_history_add（tx 内・値域）
    const rHist = await T.as(owner, `select public.cast_rate_history_add($1, 'slide_up', 300, $2::date) id`, [castA1a, `${ISO_PERIOD}-01`]);
    const rHistBad = await T.as(owner, `select public.cast_rate_history_add($1, 'bogus', 300, $2::date)`, [castA1a, `${ISO_PERIOD}-01`]);
    check("v175(4-5) P-1 owner の cast_rate_history_add＝通る（slide_up）・'bogus' は拒否", rHist.ok && !rHistBad.ok, JSON.stringify({ ok: T.errOf(rHist), bad: T.errOf(rHistBad) }));
  } finally {
    await w.query("rollback").catch(() => {});
    await w.end().catch(() => {});
  }
  const left = await n1(`select count(*)::text n from public.payroll_runs where store_id = $1 and period = $2`, [storeA1Id, ISO_PERIOD]);
  check("v175(4-6) ROLLBACK＝残留 0（隔離 period の run なし）", left === 0);

  // (4) loader＝collect が本番の列を使う（admin 経由・committed・finally で削除）
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  let runId = "", histId = "";
  try {
    const { data: run, error: eRun } = await admin.from("payroll_runs").insert({ org_id: orgAId, store_id: storeA1Id, period: ISO_PERIOD, period_start: `${ISO_PERIOD}-01`, period_end: `${ISO_PERIOD}-28`, status: "draft", created_by: ownerUserId }).select("id").single();
    if (eRun) throw new Error(`payroll_runs insert: ${eRun.message}`);
    runId = run.id as string;
    const { error: eAdj } = await admin.from("payroll_adjustments").insert([
      { org_id: orgAId, store_id: storeA1Id, run_id: runId, cast_id: castA1a, mode: "fixed", amount: 1000, before_withholding: false, show_detail: true, reason: "verify live", created_by: ownerUserId },
      { org_id: orgAId, store_id: storeA1Id, run_id: runId, cast_id: castA1a, mode: "fixed", amount: 2000, before_withholding: false, show_detail: true, reason: "verify cancelled", created_by: ownerUserId, cancelled_at: new Date().toISOString(), cancelled_by: ownerUserId, cancel_reason: "verify" },
    ]);
    if (eAdj) throw new Error(`payroll_adjustments insert: ${eAdj.message}`);
    const byCast = await loadPayrollAdjustments(admin, storeA1Id, ISO_PERIOD);
    const rows = byCast.get(castA1a) ?? [];
    check("v175(4-7) R-2 loadPayrollAdjustments（collect）＝取消済み（cancelled_at）を数えない＝生きている 1 行（¥1,000）だけ", rows.length === 1 && rows[0].amount === 1000 && rows[0].reason === "verify live", JSON.stringify(rows));
    const { data: h, error: eH } = await admin.from("cast_rate_history").insert({ org_id: orgAId, store_id: storeA1Id, cast_id: castA1a, kind: "slide_up", rate: 300, valid_from: `${ISO_PERIOD}-10`, valid_to: null, source: "manual", created_by: ownerUserId }).select("id").single();
    if (eH) throw new Error(`cast_rate_history insert: ${eH.message}`);
    histId = h.id as string;
    const hist = await loadRateHistory(admin, storeA1Id, `${ISO_PERIOD}-01`, `${ISO_PERIOD}-28`);
    const mine = hist.get(castA1a) ?? [];
    const histOut = await loadRateHistory(admin, storeA1Id, "2032-01-01", "2032-01-31");
    check("v175(4-8) P-1 loadRateHistory（collect）＝期間に掛かる履歴（slide_up 300・2/10〜）を cast 別に読む・掛からない期間（2032-01）は 0", mine.length === 1 && mine[0].kind === "slide_up" && mine[0].rate === 300 && mine[0].valid_from === `${ISO_PERIOD}-10` && (histOut.get(castA1a) ?? []).length === 0, JSON.stringify({ mine, out: histOut.get(castA1a) }));
  } finally {
    if (histId) await admin.from("cast_rate_history").delete().eq("id", histId);
    if (runId) { await admin.from("payroll_adjustments").delete().eq("run_id", runId); await admin.from("payroll_runs").delete().eq("id", runId); }
  }
  check("v175(4-9) 後始末＝隔離 period の run／調整／履歴の残留 0", (await n1(`select count(*)::text n from public.payroll_runs where store_id = $1 and period = $2`, [storeA1Id, ISO_PERIOD])) === 0 && (await n1(`select count(*)::text n from public.cast_rate_history where store_id = $1 and valid_from >= '2033-01-01'`, [storeA1Id])) === 0);

  await c.end();
  if (fails.length) { console.error(`verify:nox-0175-0176 FAIL (${fails.length})\n- ${fails.join("\n- ")}`); process.exit(1); }
  console.log(`verify:nox-0175-0176 OK (${pass} checks)＝0175 v2／0176／0177 の DB 段＋効く段（便 ON-1 から f0 に合流）`);
})().catch((e) => { console.error(e); process.exit(1); });
