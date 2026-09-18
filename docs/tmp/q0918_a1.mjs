import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await db.connect();
const q = async (sql, p=[]) => (await db.query(sql, p)).rows;
const st = (await q("select s.id, s.name, s.org_id, s.settings_json->>'biz_cutoff_hm' cutoff, (select late_grace_min from penalty_config where store_id=s.id) grace from stores s join orgs o on o.id=s.org_id where o.name like 'NOX-VERIFY%' order by s.name"))
console.log("stores:", JSON.stringify(st));
const a1 = st.find(s => /A1/.test(s.name));
console.log("now JST:", new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
console.log("shifts today/yesterday A1:", JSON.stringify(await q("select sh.date, sh.start_hm, sh.end_hm, sh.status, c.name cast, c.id cast_id from shifts sh join casts c on c.id=sh.cast_id where sh.store_id=$1 and sh.date >= current_date - 1 order by sh.date, sh.start_hm", [a1.id])));
console.log("punches last 30h A1:", JSON.stringify(await q("select p.cast_id, c.name, p.type, p.punched_at at time zone 'Asia/Tokyo' t, p.source from punches p join casts c on c.id=p.cast_id where p.store_id=$1 and p.punched_at > now() - interval '30 hours' order by p.punched_at", [a1.id])));
console.log("attendance today A1:", JSON.stringify(await q("select a.date, a.status, c.name from attendance a join casts c on c.id=a.cast_id where a.store_id=$1 and a.date >= current_date - 1", [a1.id])));
console.log("casts A1 active:", JSON.stringify(await q("select id, name from casts where store_id=$1 and is_active order by name limit 8", [a1.id])));
console.log("users ownerA:", JSON.stringify(await q("select u.email, m.role from users u join memberships m on m.user_id=u.id where m.store_id=$1 or (m.role='owner' and m.org_id=$2) order by m.role", [a1.id, a1.org_id])));
await db.end();
