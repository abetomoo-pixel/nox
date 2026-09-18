import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await db.connect();
const q = async (sql, p=[]) => (await db.query(sql, p)).rows;
const f = await q("select pg_get_functiondef(p.oid) def, md5(p.prosrc) md5, p.proacl::text acl, p.prosecdef, pg_get_function_identity_arguments(p.oid) args, p.proconfig from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='set_store_profile'");
console.log("### set_store_profile count=", f.length);
for (const r of f) { console.log("md5(prosrc)=", r.md5, "acl=", r.acl, "secdef=", r.prosecdef, "config=", JSON.stringify(r.proconfig)); console.log("--- pg_get_functiondef ---"); console.log(r.def); }
console.log("### store_profile table?", JSON.stringify(await q("select table_name from information_schema.tables where table_schema='public' and table_name like '%store_profile%'")));
console.log("### stores.settings_json column:", JSON.stringify(await q("select column_name, data_type, column_default, is_nullable from information_schema.columns where table_schema='public' and table_name='stores' and column_name='settings_json'")));
console.log("### stores CHECK constraints:", JSON.stringify(await q("select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.stores'::regclass and contype='c'")));
console.log("### stores RLS:", JSON.stringify(await q("select relrowsecurity, relforcerowsecurity from pg_class where oid='public.stores'::regclass")));
const pol = await q("select policyname, cmd, roles::text roles, qual, with_check from pg_policies where schemaname='public' and tablename='stores'");
for (const p of pol) console.log("policy:", JSON.stringify(p));
console.log("### stores grants:", JSON.stringify(await q("select grantee, string_agg(privilege_type, ',' order by privilege_type) privs from information_schema.role_table_grants where table_schema='public' and table_name='stores' group by grantee")));
const sj = await q("select name, (select jsonb_object_agg(k, jsonb_typeof(settings_json->k)) from jsonb_object_keys(coalesce(settings_json,'{}'::jsonb)) k) types from public.stores order by name");
console.log("### settings_json key types per store:"); for (const r of sj) console.log(r.name, JSON.stringify(r.types));
await db.end();
