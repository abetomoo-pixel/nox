import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await db.connect();
const q = async (sql, p=[]) => (await db.query(sql, p)).rows;
const src = async (n) => (await q("select prosrc from pg_proc where pronamespace='public'::regnamespace and proname=$1", [n]))[0]?.prosrc.split("\n");
const numbered = (lines, re) => lines.map((l, i) => [i + 1, l]).filter(([, l]) => re.test(l)).map(([i, l]) => `  L${i}: ${l.trim()}`).join("\n");
// b: finalize writes breakdown_json? payslips cols
console.log("## payslips cols:", (await q("select string_agg(column_name||':'||data_type, ', ' order by ordinal_position) c from information_schema.columns where table_schema='public' and table_name='payslips'"))[0].c);
const fin = await src("payroll_finalize");
console.log("## payroll_finalize", fin.length, "lines\n" + numbered(fin, /breakdown|adjust|overflow|p_rows|jsonb_array_elements|insert into public.payslips|status/));
console.log("## RPC prosrc containing adjustOverflow:", JSON.stringify(await q("select proname from pg_proc where pronamespace='public'::regnamespace and prosrc like '%adjustOverflow%'")));
// c: check_* RPC signatures
console.log("## check_* RPCs:\n  " + (await q("select proname||'('||pg_get_function_identity_arguments(oid)||')' s from pg_proc where pronamespace='public'::regnamespace and proname like 'check\_%' order by 1")).map(r=>r.s).join("\n  "));
const cal = await src("check_add_line"); console.log("## check_add_line", cal.length, "lines\n" + numbered(cal, /auth_|raise exception|insert into|audit_log_write|check_recalc|v_kind|fee_kind|cast_id|tax_category/));
const cld = await src("check_line_delete"); if (cld) console.log("## check_line_delete", cld.length, "lines\n" + numbered(cld, /auth_|raise exception|delete from|audit_log_write|check_recalc/));
console.log("## check_lines indexes:\n  " + (await q("select indexdef from pg_indexes where schemaname='public' and tablename='check_lines'")).map(r=>r.indexdef.replace('CREATE ','').replace(' ON public.check_lines',' ')).join("\n  "));
// d
const scn = await src("set_cast_norm"); console.log("## set_cast_norm", scn.length, "lines\n" + numbered(scn, /auth_|raise exception|billing|insert into|on conflict|audit_log_write|returning|return/));
const sws = await src("shift_wish_submit"); console.log("## shift_wish_submit", sws.length, "lines\n" + numbered(sws, /auth_|raise exception|insert into|audit_log_write/));
console.log("## cast_norms cols:", (await q("select string_agg(column_name||':'||data_type, ', ' order by ordinal_position) c from information_schema.columns where table_schema='public' and table_name='cast_norms'"))[0].c);
for (const r of await q("select conname, contype, pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.cast_norms'::regclass and contype in ('c','u') order by 1")) console.log("  " + r.conname + " " + r.d);
console.log("## cast_norms policies:", JSON.stringify(await q("select policyname, cmd, qual from pg_policies where tablename='cast_norms'")));
console.log("## cast_norms grants:", JSON.stringify(await q("select grantee, string_agg(privilege_type, ',') p from information_schema.role_table_grants where table_schema='public' and table_name='cast_norms' group by 1")));
// e: prosrc mentioning 'champ'
console.log("## prosrc with 'champ':", JSON.stringify(await q("select proname from pg_proc where pronamespace='public'::regnamespace and prosrc like '%''champ''%' order by 1")));
for (const n of ["product_bulk_insert", "set_product"]) { const s = await src(n); if (s) console.log(`## ${n}`, s.length, "lines\n" + numbered(s, /champ/)); }
console.log("## products type CHECK name/def:", JSON.stringify(await q("select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.products'::regclass and contype='c'")));
// f
const rp = await q("select proname from pg_proc where pronamespace='public'::regnamespace and prosrc like '%receivable_policy%' order by 1");
console.log("## receivable_policy prosrc readers:", rp.map(r=>r.proname).join(", "));
for (const r of rp) { const s = await src(r.proname); console.log(`  ${r.proname}:\n` + numbered(s, /receivable_policy/)); }
console.log("## set_store_* text setters:", (await q("select proname||'('||pg_get_function_identity_arguments(oid)||')' s from pg_proc where pronamespace='public'::regnamespace and proname like 'set\_store\_%' order by 1")).map(r=>r.s).join(" | "));
await db.end();
