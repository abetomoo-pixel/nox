import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
try {
  await db.connect();
  for (const t of ["payslips","payroll_runs","audit_logs","cast_norms","check_lines","products","product_costs","product_categories","checks","seats"]) {
    const r = (await db.query("select string_agg(column_name || ':' || data_type || (case when is_nullable='NO' then '!' else '' end) || coalesce('='||column_default,''), ', ' order by ordinal_position) s from information_schema.columns where table_schema='public' and table_name=$1", [t])).rows[0].s;
    console.log(`## ${t}\n${r}`);
  }
  console.log("## uniques cast_norms:", JSON.stringify((await db.query("select indexdef from pg_indexes where tablename='cast_norms'")).rows));
  console.log("## payslips idx:", JSON.stringify((await db.query("select indexdef from pg_indexes where tablename='payslips'")).rows));
} finally { await db.end().catch(()=>{}); }
