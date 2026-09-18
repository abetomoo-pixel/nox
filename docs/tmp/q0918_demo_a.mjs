// O-a: NOX-DEMO org の現状（読取のみ・教訓88）
import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 30000 });
try {
  await db.connect();
  const q = async (s, p=[]) => (await db.query(s, p)).rows;
  const org = (await q("select id, name, created_at from orgs where name='NOX-DEMO'"))[0];
  console.log("org", JSON.stringify(org));
  console.log("orgs all", JSON.stringify(await q("select name from orgs order by name")));
  console.log("stores", JSON.stringify(await q("select id, name, receivable_policy, settings_json->>'biz_type' biz, settings_json->>'setup_done' sd from stores where org_id=$1 order by name", [org.id])));
  console.log("users", JSON.stringify(await q("select u.id, u.email, u.name, u.is_active, (select string_agg(m.role||'@'||s.name, ',') from memberships m join stores s on s.id=m.store_id where m.user_id=u.id and m.is_active) mem from users u where u.org_id=$1 order by u.email", [org.id])));
  // org_id 列を持つ全表の行数
  const tables = await q("select table_name from information_schema.columns where table_schema='public' and column_name='org_id' and table_name not in (select table_name from information_schema.views where table_schema='public') order by 1");
  const counts = [];
  for (const t of tables) {
    const n = (await q(`select count(*)::int n from public."${t.table_name}" where org_id=$1`, [org.id]))[0].n;
    counts.push(`${t.table_name}=${n}`);
  }
  console.log("rows(org_id 表 " + tables.length + "):", counts.join(" "));
  const noorg = await q("select t.table_name from information_schema.tables t where t.table_schema='public' and t.table_type='BASE TABLE' and t.table_name not in (select table_name from information_schema.columns where table_schema='public' and column_name='org_id') order by 1");
  console.log("org_id を持たない表:", noorg.map(r=>r.table_name).join(", "));
  // is_demo 列の有無
  console.log("orgs cols:", (await q("select string_agg(column_name||':'||data_type, ', ' order by ordinal_position) s from information_schema.columns where table_schema='public' and table_name='orgs'"))[0].s);
  console.log("org_billing demo:", JSON.stringify(await q("select * from org_billing where org_id=$1", [org.id])));
} finally { await db.end().catch(()=>{}); }
