import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000, connectionTimeoutMillis: 15000 });
await db.connect();
const r = await db.query(`select to_char(now() at time zone 'Asia/Tokyo','HH24:MI:SS') jst,
 (select count(*) from public.payroll_adjustments) adjustments,
 (select count(*) from public.payroll_runs r join public.stores s on s.id=r.store_id where s.name='NOX-VERIFY-A1') a1_runs,
 (select count(*) from public.payslips p join public.stores s on s.id=p.store_id where s.name='NOX-VERIFY-A1') a1_payslips,
 (select string_agg(o.name||':'||f.enabled, ',') from public.feature_flags f join public.orgs o on o.id=f.org_id where f.key='reopen_flow') reopen_flags,
 (select count(*) from pg_stat_activity where backend_type='client backend' and pid<>pg_backend_pid() and usename not in ('supabase_admin','supabase_auth_admin','supabase_storage_admin','authenticator','pgbouncer','supabase_replication_admin','supabase_read_only_user','postgres_exporter')) direct_clients`);
console.log(JSON.stringify(r.rows));
await db.end();
