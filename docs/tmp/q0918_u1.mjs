// u1: NOX-DEMO org を対象に 1 トランザクションで全削除（子→親）→ ROLLBACK。所要 ms・阻んだ FK・snapshot 一致（読取実験・原状不変・教訓88）
import { Client } from "pg";
import fs from "node:fs";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
const out = [];
try {
  await db.connect();
  const q = async (s, p=[]) => (await db.query(s, p)).rows;
  const org = (await q("select id from orgs where name='NOX-DEMO'"))[0].id;
  // org_id を持つ表（views 除く）
  const tables = (await q("select c.table_name t from information_schema.columns c join information_schema.tables tt on tt.table_name=c.table_name and tt.table_schema='public' and tt.table_type='BASE TABLE' where c.table_schema='public' and c.column_name='org_id' order by 1")).map(r=>r.t);
  // FK グラフ（表間・public）→ 子→親のトポロジカル順（自己参照・循環は後ろに回す）
  const fks = await q("select c.conrelid::regclass::text child, c.confrelid::regclass::text parent from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='f'");
  const set = new Set([...tables, "memberships"]);
  const parents = {}; for (const t of set) parents[t] = new Set();
  for (const f of fks) { if (set.has(f.child) && set.has(f.parent) && f.child !== f.parent) parents[f.child].add(f.parent); }
  // children-first: 表 t は、t を親に持つ表が全て並んだ後に置く
  const order = []; const placed = new Set();
  let guard = 0;
  while (placed.size < set.size && guard++ < 200) {
    for (const t of set) {
      if (placed.has(t)) continue;
      const childrenLeft = [...set].some((c) => !placed.has(c) && c !== t && parents[c].has(t));
      if (!childrenLeft) { order.push(t); placed.add(t); }
    }
  }
  const leftovers = [...set].filter((t) => !placed.has(t));
  out.push(`## u1 削除順（子→親・${order.length} 表・循環残り ${leftovers.length}: ${leftovers.join(",")}）`);
  out.push(order.join(" → "));
  const before = JSON.stringify((await q("select (select count(*) from audit_logs where org_id=$1)::int au, (select count(*) from checks where org_id=$1)::int c, (select count(*) from check_lines where org_id=$1)::int l, (select count(*) from stock_logs where org_id=$1)::int sl, (select count(*) from shifts where org_id=$1)::int sh, (select count(*) from users where org_id=$1)::int u, (select count(*) from memberships m join users u on u.id=m.user_id where u.org_id=$1)::int mem, (select count(*) from orgs where id=$1)::int o", [org]))[0]);
  await db.query("begin");
  const res = []; const blocked = [];
  const t0 = Date.now();
  try {
    // memberships（org_id なし）は users 経由
    for (const t of [...order, ...leftovers]) {
      const ts = Date.now();
      try {
        await db.query("savepoint sp");
        let n;
        if (t === "memberships") n = (await db.query("delete from public.memberships m using public.users u where u.id=m.user_id and u.org_id=$1", [org])).rowCount;
        else if (t === "orgs") n = (await db.query("delete from public.orgs where id=$1", [org])).rowCount;
        else n = (await db.query(`delete from public."${t}" where org_id=$1`, [org])).rowCount;
        await db.query("release savepoint sp");
        res.push({ t, n, ms: Date.now() - ts });
      } catch (e) {
        await db.query("rollback to savepoint sp");
        blocked.push({ t, err: e.message.slice(0, 160) });
        res.push({ t, n: -1, ms: Date.now() - ts });
      }
    }
    const remain = (await q("select (select count(*) from stock_logs where org_id=$1)::int sl, (select count(*) from orgs where id=$1)::int o", [org]))[0];
    out.push(`\n所要（削除のみ・ROLLBACK 前）: ${Date.now() - t0} ms・削除行 Σ=${res.filter(r=>r.n>0).reduce((a,r)=>a+r.n,0)}・阻まれた表=${blocked.length}`);
    out.push("残（トランザクション内・削除後）: " + JSON.stringify(remain));
  } finally {
    await db.query("rollback");
  }
  const after = JSON.stringify((await q("select (select count(*) from audit_logs where org_id=$1)::int au, (select count(*) from checks where org_id=$1)::int c, (select count(*) from check_lines where org_id=$1)::int l, (select count(*) from stock_logs where org_id=$1)::int sl, (select count(*) from shifts where org_id=$1)::int sh, (select count(*) from users where org_id=$1)::int u, (select count(*) from memberships m join users u on u.id=m.user_id where u.org_id=$1)::int mem, (select count(*) from orgs where id=$1)::int o", [org]))[0]);
  out.push(`snapshot before=${before} after=${after} ${before===after?"一致":"不一致"}`);
  out.push("\n| 表 | 削除行 | ms |\n|---|---|---|\n" + res.map(r=>`| ${r.t} | ${r.n} | ${r.ms} |`).join("\n"));
  if (blocked.length) out.push("\n阻まれた表: " + blocked.map(b=>`${b.t}: ${b.err}`).join(" / "));
  fs.writeFileSync("docs/tmp/0918_u1_result.md", out.join("\n"));
  console.log(out.slice(0, 5).join("\n")); console.log(blocked.length ? blocked : "blocked 0");
} finally { await db.end().catch(()=>{}); }
