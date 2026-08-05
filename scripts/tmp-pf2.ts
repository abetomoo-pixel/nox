import { readFileSync, writeFileSync } from "fs";
import { Client } from "pg";
const env: Record<string, string> = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
(async () => {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL });
  await db.connect();
  const want = ["check_open","check_time_calc","check_time_apply","check_add_line","check_close","biz_date_of","auth_biz_cutoff","daily_report_aggregate","set_store_pricing","set_store_time_pricing","check_group_due","round_amount","check_round_amount"];
  const r = await db.query(`select proname, oid::regprocedure::text sig, pg_get_functiondef(oid) def
    from pg_proc where pronamespace='public'::regnamespace and proname = any($1) order by proname`, [want]);
  console.log("見つかった関数:", r.rows.map((x: any) => x.sig).join("\n  "));
  const norm = (s: string) => s.replace(/\r\n/g, "\n");
  let all = "";
  for (const row of r.rows) all += `\n\n========== ${row.sig} ==========\n` + norm(row.def);
  writeFileSync("scripts/tmp-fns.txt", all);
  // 名前に time/biz/round/price を含む関数の一覧も
  const r2 = await db.query(`select proname, oid::regprocedure::text sig from pg_proc
    where pronamespace='public'::regnamespace and (proname ~ 'time|biz|round|pric|fee|charge|set_store')
    order by proname`);
  console.log("\n関連しそうな関数一覧:");
  for (const x of r2.rows) console.log("  " + x.sig);
  await db.end();
})().catch((e) => { console.error(e); process.exit(1); });
