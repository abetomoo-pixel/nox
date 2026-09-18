import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await db.connect();
const q = async (sql, p=[]) => (await db.query(sql, p)).rows;
const src = async (n) => (await q("select prosrc from pg_proc where pronamespace='public'::regnamespace and proname=$1", [n]))[0]?.prosrc.split("\n");
const numbered = (lines, re) => lines.map((l, i) => [i + 1, l]).filter(([, l]) => re.test(l)).map(([i, l]) => `  L${i}: ${l.trim()}`).join("\n");
const d = await src("check_dohan_add"); console.log("## check_dohan_add idem lines\n" + numbered(d, /idem|p_idem_key/));
const s = await src("check_shimei_add"); console.log("## check_shimei_add idem lines\n" + numbered(s, /idem|p_idem_key/));
console.log("## check_lines.idem_key type:", JSON.stringify(await q("select data_type from information_schema.columns where table_name='check_lines' and column_name='idem_key'")));
for (const n of ["set_product", "product_bulk_insert"]) {
  const r = (await q("select pg_get_functiondef(oid) d, md5(prosrc) m from pg_proc where pronamespace='public'::regnamespace and proname=$1", [n]))[0];
  const fs = await import("fs"); fs.writeFileSync(`docs/tmp/q0918_live_${n}.sql`, r.d);
  console.log(`## ${n} md5=${r.m} lines=${r.d.split("\n").length} whitelist:\n` + numbered(r.d.split("\n"), /'drink'/));
}
console.log("## distinct kind/type live:", JSON.stringify(await q("select 'check_lines.kind' c, string_agg(distinct kind, ',') v from check_lines union all select 'products.type', string_agg(distinct type, ',') from products")));
console.log("## payroll_adjustments soft delete? cols:", JSON.stringify(await q("select column_name from information_schema.columns where table_name='payroll_adjustments' and column_name ~ 'delet|updated'")));
console.log("## audit_log_write sig:", JSON.stringify(await q("select pg_get_function_identity_arguments(oid) a from pg_proc where proname='audit_log_write'")));
console.log("## casts store col / stores.settings_json sys_norms sample:", JSON.stringify(await q("select count(*) filter (where settings_json ? 'sys_norms') n_with, count(*) n from stores")));
console.log("## payslips (run_id,cast_id) unique?:", JSON.stringify(await q("select indexdef from pg_indexes where tablename='payslips'")));
console.log("## payroll_runs cols:", (await q("select string_agg(column_name||':'||data_type, ', ' order by ordinal_position) c from information_schema.columns where table_name='payroll_runs'"))[0].c);
await db.end();
