import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await db.connect();
const q = async (sql, p=[]) => (await db.query(sql, p)).rows;
const cols = async (t) => (await q("select string_agg(column_name||':'||data_type||coalesce('='||column_default,''), ' | ' order by ordinal_position) c from information_schema.columns where table_schema='public' and table_name=$1", [t]))[0].c;
const cks = async (t) => (await q("select string_agg(conname||' '||pg_get_constraintdef(oid), ' || ') c from pg_constraint where conrelid=('public.'||$1)::regclass and contype='c'", [t]))[0].c;
for (const t of ["products", "product_categories", "seats", "pricing_rules", "pricing_categories", "business_hours", "store_business_hours", "comp_plans", "comp_plan_components", "custom_back_defs", "cast_ranks", "bottle_keeps"]) {
  console.log(`## ${t}\n  cols: ${await cols(t) ?? "(なし)"}\n  checks: ${await cks(t).catch(() => "(表なし)")}`);
}
const fn = async (n) => (await q("select pg_get_function_identity_arguments(oid) a, prosrc s from pg_proc where pronamespace='public'::regnamespace and proname=$1", [n]))[0];
for (const n of ["product_bulk_insert", "set_product", "set_seat", "set_store_business_hours", "set_store_biz_cutoff", "set_store_pricing", "set_store_time_pricing", "set_store_tax_config", "set_pricing_rule", "set_comp_plan", "set_comp_component", "set_cast_rank", "set_custom_back_def", "set_store_receivable_policy", "set_store_profile"]) {
  const f = await fn(n);
  if (!f) { console.log(`## ${n}: (なし)`); continue; }
  console.log(`## ${n}(${f.a})`);
  if (["product_bulk_insert", "set_product"].includes(n)) console.log(f.s.split("\n").filter((l) => /raise exception|p_items|->>|jsonb_array|insert into|values|not in|any\(/.test(l)).slice(0, 40).map((l) => "    " + l.trim()).join("\n"));
  if (["set_comp_plan", "set_pricing_rule", "set_seat", "set_store_business_hours"].includes(n)) console.log(f.s.split("\n").filter((l) => /not in|any\(array|raise exception 'bad/.test(l)).slice(0, 12).map((l) => "    " + l.trim()).join("\n"));
}
console.log("## receivable_policy setter:", JSON.stringify(await q("select proname from pg_proc where pronamespace='public'::regnamespace and prosrc like '%receivable_policy%' and proname like 'set_%'")));
console.log("## vip in RPC/prosrc:", JSON.stringify(await q("select proname from pg_proc where pronamespace='public'::regnamespace and prosrc like '%vip%' order by 1")));
await db.end();
