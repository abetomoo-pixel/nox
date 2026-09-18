import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
try {
  await db.connect();
  const q = async (s, p=[]) => (await db.query(s, p)).rows;
  console.log(JSON.stringify(await q("select s.id, s.name, s.org_id, s.receivable_policy, s.settings_json->>'sys_norms' sys_norms, s.price_display, s.business_tax_status, s.service_rate, s.round_unit, s.round_mode, s.tax_rounding from stores s where s.name like 'NOX-VERIFY-%' order by name"), null, 1));
  console.log("flag reopen_flow A1:", JSON.stringify(await q("select public.flag_enabled('reopen_flow', s.id) f from stores s where s.name='NOX-VERIFY-A1'")));
  console.log("daily_reports A1 recent:", JSON.stringify(await q("select d.biz_date from daily_reports d join stores s on s.id=d.store_id where s.name='NOX-VERIFY-A1' order by biz_date desc limit 4")));
  console.log("runs A1:", JSON.stringify(await q("select period, status from payroll_runs r join stores s on s.id=r.store_id where s.name='NOX-VERIFY-A1' order by period")));
  console.log("casts A1:", JSON.stringify(await q("select c.id, c.name, c.is_active, u.email from casts c join stores s on s.id=c.store_id left join users u on u.id=c.user_id where s.name='NOX-VERIFY-A1' order by c.name")));
  console.log("seats A1:", JSON.stringify(await q("select st.id, st.name, st.is_active from seats st join stores s on s.id=st.store_id where s.name='NOX-VERIFY-A1' order by name limit 5")));
  console.log("open checks A1:", JSON.stringify(await q("select count(*)::int n from checks c join stores s on s.id=c.store_id where s.name='NOX-VERIFY-A1' and c.status='open'")));
  console.log("products A1 verify:", JSON.stringify(await q("select p.name, p.type from products p join stores s on s.id=p.store_id where s.name in ('NOX-VERIFY-A1','NOX-VERIFY-A2') and p.name like 'NOX-VERIFY-%'")));
  console.log("cast_norms A1:", JSON.stringify(await q("select n.cast_id, n.period, n.days_target from cast_norms n join stores s on s.id=n.store_id where s.name='NOX-VERIFY-A1' order by period")));
  console.log("pricing_rules A1:", JSON.stringify(await q("select count(*)::int n from pricing_rules r join stores s on s.id=r.store_id where s.name='NOX-VERIFY-A1'")));
} finally { await db.end().catch(()=>{}); }
