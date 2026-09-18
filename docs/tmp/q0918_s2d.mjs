import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await db.connect();
const q = async (sql, p=[]) => (await db.query(sql, p)).rows;
const src = async (n) => (await q("select prosrc from pg_proc where pronamespace='public'::regnamespace and proname=$1", [n]))[0]?.prosrc.split("\n");
const numbered = (lines, re) => lines.map((l, i) => [i + 1, l]).filter(([, l]) => re.test(l)).map(([i, l]) => `  L${i}: ${l.trim()}`).join("\n");
const pa = await src("payroll_adjustment_add"); console.log("## payroll_adjustment_add role/idem lines\n" + numbered(pa, /auth_role|auth_store|idem|v_actor :=|exists|already|duplicate|returning|return /));
const pr = await src("payroll_reopen"); console.log("## payroll_reopen", pr.length, "lines · adjust mentions:\n" + numbered(pr, /adjust|delete from|set status|reason/));
const pd = await src("payroll_adjustment_delete"); console.log("## payroll_adjustment_delete:", pd ? pd.length + " lines\n" + numbered(pd, /auth_role|raise exception|delete from|status/) : "なし");
for (const n of ["check_close", "daily_report_aggregate", "drink_claim_submit"]) { const s = await src(n); console.log(`## ${n} 'champ' lines\n` + numbered(s, /champ/)); }
const snc = await src("set_store_norm_config"); console.log("## set_store_norm_config", snc.length, "lines\n" + numbered(snc, /auth_role|raise exception|update public.stores|jsonb_set|settings_json|norm_config|scope/));
console.log("## set_store_* full list:\n  " + (await q("select proname||'('||pg_get_function_identity_arguments(oid)||')' s from pg_proc where pronamespace='public'::regnamespace and proname like 'set\_store\_%' order by 1")).map(r=>r.s).join("\n  "));
console.log("## set_store_* が stores の実列を update するもの:", JSON.stringify(await q("select proname from pg_proc where pronamespace='public'::regnamespace and proname like 'set\_store\_%' and prosrc ~ 'update public.stores' and prosrc !~ 'settings_json = jsonb_set' order by 1")));
console.log("## check_lines.kind 実在値:", JSON.stringify(await q("select kind, count(*)::int n from public.check_lines group by 1 order by 1")));
console.log("## products.type 実在値:", JSON.stringify(await q("select type, count(*)::int n from public.products group by 1 order by 1")));
console.log("## stores.receivable_policy 実在値:", JSON.stringify(await q("select receivable_policy, count(*)::int n from public.stores group by 1 order by 1")));
await db.end();
