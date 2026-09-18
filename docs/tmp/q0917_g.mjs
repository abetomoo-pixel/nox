import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await db.connect();
const q = async (sql, p=[]) => (await db.query(sql, p)).rows;
const tabs = ["comp_plans","cast_plans","cast_comp","comp_plan_components","custom_back_defs","cast_norms","penalty_config","deductions","cast_ranks","cast_rank_assignments","stores","feature_flags","cast_employments","cast_tax_profiles","casts"];
for (const t of tabs) {
  const r = await q("select string_agg(column_name||':'||data_type, ', ' order by ordinal_position) c from information_schema.columns where table_schema='public' and table_name=$1", [t]);
  console.log(`## ${t}: ${r[0].c ?? "(なし)"}`);
}
console.log("## settings_json keys in stores:", JSON.stringify(await q("select s.name, (select string_agg(k, ',') from jsonb_object_keys(coalesce(s.settings_json,'{}'::jsonb)) k) keys from public.stores s order by 1")));
console.log("## pricing/apply/plan RPC:", JSON.stringify(await q("select proname, pg_get_function_identity_arguments(oid) args from pg_proc where pronamespace='public'::regnamespace and (proname like '%pricing%' or proname like '%apply%' or proname like 'set_cast_plan%' or proname like 'set_comp%' or proname like '%onboard%' or proname like 'set_store_%' or proname like '%template%') order by 1")));
console.log("## feature_flags rows:", JSON.stringify(await q("select key, store_id is not null as store_row, enabled, count(*) from public.feature_flags group by 1,2,3")));
await db.end();
