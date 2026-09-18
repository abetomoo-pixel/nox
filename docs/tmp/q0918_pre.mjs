import { Client } from "pg";
import { createHash } from "crypto";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await db.connect();
const q = async (sql, p=[]) => (await db.query(sql, p)).rows;
const out = [];
for (const n of ["payroll_adjustment_add","payroll_adjustment_delete","check_add_line","set_cast_norm","shift_wish_submit","set_store_okuri_mode","set_store_tax_config","payroll_run_create"]) {
  const r = (await q("select pg_get_functiondef(oid) d, md5(prosrc) m, proacl::text acl, prosecdef from pg_proc where pronamespace='public'::regnamespace and proname=$1", [n]))[0];
  out.push(`### ${n}\nmd5(prosrc)=${r.m}  secdef=${r.prosecdef}  acl=${r.acl}\n\n\`\`\`sql\n${r.d}\n\`\`\`\n`);
}
out.push("### CHECK 逐語\n");
for (const [t, c] of [["products","products_type_check"],["check_lines","check_lines_kind_check"],["payroll_adjustments","payroll_adjustments_mode_ck"],["payroll_adjustments","payroll_adjustments_amount_ck"],["payroll_adjustments","payroll_adjustments_reason_ck"],["stores","stores_receivable_policy_check"]]) {
  const r = (await q("select pg_get_constraintdef(oid) d from pg_constraint where conname=$1 and conrelid=('public.'||$2)::regclass", [c, t]))[0];
  out.push(`- ${t}.${c}: \`${r?.d ?? "なし"}\``);
}
out.push("\n### payroll_adjustments 全列\n");
for (const r of await q("select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='payroll_adjustments' order by ordinal_position")) out.push(`- ${r.column_name} ${r.data_type} ${r.is_nullable==='NO'?'not null':'null'}${r.column_default?` default ${r.column_default}`:''}`);
out.push("\n### payroll_adjustments index\n");
for (const r of await q("select indexname, indexdef from pg_indexes where schemaname='public' and tablename='payroll_adjustments' order by 1")) out.push(`- ${r.indexdef}`);
out.push("\n### payroll_adjustments FK / RLS / grants\n");
for (const r of await q("select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.payroll_adjustments'::regclass and contype='f' order by 1")) out.push(`- FK ${r.conname}: ${r.d}`);
for (const r of await q("select policyname, cmd, qual from pg_policies where tablename='payroll_adjustments'")) out.push(`- policy ${r.policyname} ${r.cmd}: ${r.qual}`);
out.push(`- grants: ${JSON.stringify(await q("select grantee, string_agg(privilege_type, ',' order by privilege_type) p from information_schema.role_table_grants where table_schema='public' and table_name='payroll_adjustments' group by 1 order by 1"))}`);
out.push(`- rls enabled: ${JSON.stringify(await q("select relrowsecurity from pg_class where oid='public.payroll_adjustments'::regclass"))}`);
await db.end();
const txt = out.join("\n");
const fs = await import("fs"); fs.writeFileSync("docs/tmp/q0918_pre_out.md", txt);
console.log("bytes", txt.length, "sha256", createHash("sha256").update(txt).digest("hex").slice(0,16));
console.log(txt.split("\n").filter(l => /^md5|^### |^- /.test(l)).join("\n").slice(0, 6000));
