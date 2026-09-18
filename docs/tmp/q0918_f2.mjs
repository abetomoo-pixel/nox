import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await db.connect();
const q = async (sql) => (await db.query(sql)).rows;
console.log(JSON.stringify((await q(`select
 (select count(*)::int from payroll_adjustments) adjustments,
 (select count(*)::int from payroll_runs r join stores s on s.id=r.store_id where s.name='NOX-VERIFY-A1') a1_runs,
 (select string_agg(s.name||':'||coalesce(s.settings_json->>'setup_done','null'), ',' order by s.name) from stores s) setup_done,
 (select count(*)::int from stores where settings_json ?| array['sys_hourly','sys_backs','sys_norms']) stores_with_sys,
 (select count(*)::int from users u join auth.users a on a.id=u.auth_user_id where u.email like 'nox-verify-%' and a.email = u.email) fixture_auth_match,
 (select count(*)::int from users where email like 'nox-verify-%') fixture_users,
 (select count(*)::int from shifts where date >= current_date) shifts_today_plus,
 (select count(*)::int from punches where punched_at > now() - interval '6 hours') punches_6h,
 (select count(*)::int from products where name like 'NOX-VERIFY-%') verify_products,
 (select count(*)::int from casts where name like 'NOX-VERIFY-%' or name like '%probe%') verify_casts,
 (select count(*)::int from cast_norms where period >= '2031-01') future_norms,
 (select count(*)::int from checks where status='open' and store_id in (select id from stores where name like 'NOX-VERIFY%')) open_checks_verify,
 (select count(*)::int from pg_stat_activity where backend_type='client backend') backends,
 (select count(*)::int from pg_stat_activity where backend_type='client backend' and usename not in ('supabase_admin','supabase_auth_admin','authenticator','postgres')) other_clients,
 to_char(pg_postmaster_start_time() at time zone 'Asia/Tokyo','MM-DD HH24:MI') pm`))[0]));
await db.end();
