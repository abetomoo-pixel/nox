// K-2／K-4 の読取（prosrc 逐語・残置商品 3 行）＝f0 起動前に 1 接続で済ませる（教訓88）
import { Client } from "pg";
import fs from "node:fs";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
try {
  await db.connect();
  const q = async (s, p=[]) => (await db.query(s, p)).rows;
  const fns = ["shift_set","shift_propose","shift_cast_confirm","shift_confirm_bulk","shift_period_set","shift_period_remove","shift_auto_apply","shift_auto_clear","shift_bulk_set","shift_bulk_set_daily","shift_remove","shift_wish_submit","shift_wish_decide","shift_rules_set"];
  let out = "# 0918_R15_live — シフト系 RPC の live 定義（pg_get_functiondef 逐語・読取のみ・2026-09-18）\n\n";
  const sig = await q("select proname, pg_get_function_identity_arguments(oid) a, pg_get_function_result(oid) r, md5(prosrc) m, prosrc like '%billing locked%' g from pg_proc where pronamespace='public'::regnamespace and proname = any($1) order by 1", [fns]);
  out += "## 署名一覧\n\n| 関数 | 引数 | 戻り | md5(prosrc) | gate |\n|---|---|---|---|---|\n" + sig.map(r=>`| ${r.proname} | ${r.a} | ${r.r} | ${r.m} | ${r.g?'A':'B'} |`).join("\n") + "\n\n";
  out += "## shifts の列・CHECK・index\n\n";
  out += (await q("select string_agg(column_name||':'||data_type||(case when is_nullable='NO' then '!' else '' end)||coalesce('='||column_default,''), ', ' order by ordinal_position) s from information_schema.columns where table_schema='public' and table_name='shifts'"))[0].s + "\n\n";
  out += (await q("select string_agg(conname||' '||pg_get_constraintdef(oid), E'\n' order by conname) s from pg_constraint where conrelid='public.shifts'::regclass and contype in ('c','u')"))[0].s + "\n\n";
  out += (await q("select string_agg(indexdef, E'\n') s from pg_indexes where tablename='shifts'"))[0].s + "\n\n";
  out += "## shifts.status の distinct（live）\n\n" + JSON.stringify(await q("select status, count(*)::int n from shifts group by 1 order by 1")) + "\n\n";
  out += "## shift_periods / shift_wishes / staffing_needs の列\n\n";
  for (const t of ["shift_periods","shift_wishes","staffing_needs","shift_rules"]) {
    const r = (await q("select string_agg(column_name||':'||data_type||(case when is_nullable='NO' then '!' else '' end), ', ' order by ordinal_position) s from information_schema.columns where table_schema='public' and table_name=$1",[t]))[0].s;
    out += `- ${t}: ${r ?? '(表なし)'}\n`;
  }
  out += "\n## 逐語（pg_get_functiondef）\n\n";
  for (const f of fns) {
    const d = await q("select pg_get_functiondef(oid) d from pg_proc where pronamespace='public'::regnamespace and proname=$1", [f]);
    if (!d.length) { out += `### ${f}\n(不在)\n\n`; continue; }
    out += `### ${f}\n\n\`\`\`sql\n${d[0].d}\n\`\`\`\n\n`;
  }
  fs.writeFileSync("docs/tmp/0918_R15_live.md", out);
  console.log("R15 live written", out.length, "chars; fns found", sig.length);
  // K-4
  const k4 = await q("select p.id, s.name store, p.name, p.type, p.is_active, to_char(p.created_at at time zone 'Asia/Tokyo','YYYY-MM-DD HH24:MI:SS') created_jst, (select count(*) from check_lines l where l.product_id=p.id)::int check_lines, (select count(*) from product_costs c where c.product_id=p.id)::int product_costs, (select count(*) from stock_logs sl where sl.product_id=p.id)::int stock_logs from products p join stores s on s.id=p.store_id where p.name like 'NOX-VERIFY-%' order by p.created_at");
  fs.writeFileSync("docs/tmp/0918_K4_products.json", JSON.stringify(k4, null, 1));
  console.log("K4:", JSON.stringify(k4));
} finally { await db.end().catch(()=>{}); }
