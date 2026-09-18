import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000, connectionTimeoutMillis: 15000 });
await db.connect();
const r = await db.query(`select to_char(now() at time zone 'Asia/Tokyo','HH24:MI:SS') jst, 'nox-project-proof' proof, (select count(*) from public.orgs) orgs,
 current_setting('max_connections') max_conn, (select count(*) from pg_stat_activity) backends, (select count(*) from pg_stat_activity where backend_type='client backend') clients,
 to_char(pg_postmaster_start_time() at time zone 'Asia/Tokyo','MM-DD HH24:MI') pm_start,
 (select count(*) from pg_stat_activity where backend_type='client backend' and pid<>pg_backend_pid() and usename not in ('supabase_admin','supabase_auth_admin','supabase_storage_admin','authenticator','pgbouncer','supabase_replication_admin','supabase_read_only_user','postgres_exporter')) direct_clients,
 (select count(*) from public.audit_logs where at > now() - interval '60 seconds') audit60,
 (select count(*) from pg_stat_activity where usename='authenticator' and state='active') postgrest_active`);
console.log(JSON.stringify(r.rows));
await db.end();
