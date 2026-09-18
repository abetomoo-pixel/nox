// O-d: 「伝票 1 枚（明細 5 行）を RPC で作って閉じる」の所要 ms（A1・owner-a の JWT emulate・1 トランザクション・最後に ROLLBACK＝残留 0）
import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 30000 });
try {
  await db.connect();
  const q = async (s, p=[]) => (await db.query(s, p)).rows;
  const st = (await q("select id, org_id from stores where name='NOX-VERIFY-A1'"))[0];
  const u = (await q("select id, auth_user_id from users where email='nox-verify-owner-a@example.com' and is_active"))[0];
  const seat = (await q("select id from seats where store_id=$1 and is_active order by name limit 1", [st.id]))[0];
  const before = (await q("select (select count(*) from checks where store_id=$1)::int c, (select count(*) from check_lines where store_id=$1)::int l, (select count(*) from payments p join checks c on c.id=p.check_id where c.store_id=$1)::int p, (select count(*) from audit_logs where org_id=$2)::int au", [st.id, st.org_id]))[0];
  await db.query("begin");
  const res = [];
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: u.auth_user_id, role: "authenticated" })]);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [u.auth_user_id]);
    await db.query("set local role authenticated");
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      const chk = (await q("select public.check_open($1, 2, 'free') as id", [seat.id]))[0].id;
      const t1 = Date.now();
      for (let k = 0; k < 5; k++) await q("select public.check_add_line($1, null, 1, 'custom', 'A', $2, 1000)", [chk, `demo line ${k}`]);
      const t2 = Date.now();
      const total = (await q("select total from checks where id=$1", [chk]))[0].total;
      let payErr = null, closeErr = null;
      try { await q("select public.check_pay($1, 'cash', $2, 'A', $2, $3::uuid, null)", [chk, total, "00000000-0000-4000-8000-00000000000" + i]); } catch (e) { payErr = e.message; }
      const t3 = Date.now();
      try { await q("select public.check_close($1, $2::uuid)", [chk, "00000000-0000-4000-8000-00000000001" + i]); } catch (e) { closeErr = e.message; }
      const t4 = Date.now();
      // 卓を空ける（次の open のため void）
      let voidErr = null; try { await q("select public.check_void($1, 'demo timing')", [chk]); } catch (e) { voidErr = e.message; }
      res.push({ i, open_ms: t1 - t0, lines5_ms: t2 - t1, pay_ms: t3 - t2, close_ms: t4 - t3, total_ms: t4 - t0, total, payErr, closeErr, voidErr });
    }
  } finally { await db.query("rollback"); }
  const after = (await q("select (select count(*) from checks where store_id=$1)::int c, (select count(*) from check_lines where store_id=$1)::int l, (select count(*) from payments p join checks c on c.id=p.check_id where c.store_id=$1)::int p, (select count(*) from audit_logs where org_id=$2)::int au", [st.id, st.org_id]))[0];
  console.log(JSON.stringify(res, null, 0));
  console.log("snapshot", JSON.stringify(before), "→", JSON.stringify(after), JSON.stringify(before)===JSON.stringify(after) ? "一致" : "不一致");
  console.log("check_pay args:", JSON.stringify(await q("select pg_get_function_identity_arguments(oid) a from pg_proc where proname in ('check_pay','check_close') order by proname")));
} finally { await db.end().catch(()=>{}); }
