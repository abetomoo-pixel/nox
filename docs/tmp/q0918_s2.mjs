import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await db.connect();
const q = async (sql, p=[]) => (await db.query(sql, p)).rows;
const fn = async (n) => (await q("select pg_get_function_identity_arguments(oid) a, prosrc s, proacl::text acl from pg_proc where pronamespace='public'::regnamespace and proname=$1", [n]))[0];
const show = (n, f, re) => { console.log(`## ${n}(${f.a}) acl=${f.acl}`); console.log(f.s.split("\n").filter((l) => re.test(l)).map((l) => "  " + l.trim()).join("\n")); };
// b
show("payroll_adjustment_add", await fn("payroll_adjustment_add"), /raise exception|insert into|p_reason|show_detail|idem|status|audit_log_write/);
show("payroll_run_create", await fn("payroll_run_create"), /raise exception|insert into|returning|on conflict|status|return /);
// c
console.log("## check_lines cols:", (await q("select string_agg(column_name||':'||data_type, ', ' order by ordinal_position) c from information_schema.columns where table_schema='public' and table_name='check_lines'"))[0].c);
console.log("## check_lines CHECKs:"); for (const r of await q("select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.check_lines'::regclass and contype='c' order by 1")) console.log("  " + r.conname + " " + r.d);
for (const n of ["check_add_line", "check_line_update", "check_line_delete"]) { const f = await fn(n); if (f) console.log(`## ${n}(${f.a})`); }
show("check_add_line", await fn("check_add_line"), /p_kind|kind|raise exception 'bad|insert into public.check_lines/);
// d
show("set_cast_norm", await fn("set_cast_norm"), /auth_|raise exception|forbidden|insert|on conflict/);
const selfs = await q("select proname, pg_get_function_identity_arguments(oid) a from pg_proc where pronamespace='public'::regnamespace and prosrc like '%auth_cast_id()%' and prosrc not like '%auth_role() <> ''cast''%' order by 1");
console.log("## RPC using auth_cast_id():", selfs.map((r) => `${r.proname}(${r.a})`).join(" | "));
show("punch_self", await fn("punch_self"), /auth_cast_id|auth_org_id|raise exception|v_cast|insert into/);
// e
console.log("## products type CHECK:", (await q("select pg_get_constraintdef(oid) d from pg_constraint where conname='products_type_check'"))[0].d);
// f
console.log("## stores.receivable_policy:", JSON.stringify(await q("select data_type, column_default, is_nullable from information_schema.columns where table_schema='public' and table_name='stores' and column_name='receivable_policy'")), (await q("select pg_get_constraintdef(oid) d from pg_constraint where conname='stores_receivable_policy_check'"))[0].d);
show("set_store_okuri_mode", await fn("set_store_okuri_mode"), /./);
console.log("## receivable_policy in prosrc:", JSON.stringify(await q("select proname from pg_proc where pronamespace='public'::regnamespace and prosrc like '%receivable_policy%' order by 1")));
await db.end();
