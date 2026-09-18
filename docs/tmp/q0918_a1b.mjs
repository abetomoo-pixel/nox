import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await db.connect();
const q = async (sql, p=[]) => (await db.query(sql, p)).rows;
for (const t of ["shifts", "punches"]) {
  console.log(`## ${t} cols:`, (await q("select string_agg(column_name||':'||data_type||coalesce(' def='||column_default,''), ', ' order by ordinal_position) c from information_schema.columns where table_schema='public' and table_name=$1", [t]))[0].c);
  for (const r of await q("select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid=('public.'||$1)::regclass and contype in ('c','u') order by 1", [t])) console.log("  " + r.conname + " " + r.d);
}
console.log("owner/manager A:", JSON.stringify(await q("select u.email, m.role, m.store_id from users u join memberships m on m.user_id=u.id where u.org_id='6408ecea-514d-4ca8-aadf-242eaba96377' and m.role in ('owner','manager') and m.is_active order by m.role")));
console.log("shift status values live:", JSON.stringify(await q("select status, count(*)::int n from shifts group by 1")));
console.log("snapshot:", JSON.stringify(await q("select (select count(*)::int from shifts) shifts, (select count(*)::int from punches) punches, (select count(*)::int from attendance) att, (select count(*)::int from audit_logs) audit")));
await db.end();
