// A1 の settings_json から sys_* 9 キーを落とす（実機確認の原状復帰・他キーは不触）＋現況表示
import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const KEYS = ["sys_hourly","sys_backs","sys_sales_rate","sys_points","sys_sales_slide","sys_point_slide","sys_norms","sys_penalties","sys_bonus"];
if (process.argv[2] === "reset") await db.query("update public.stores set settings_json = settings_json - $1::text[] where name='NOX-VERIFY-A1'", [KEYS]);
const r = await db.query("select name, (select string_agg(k||'='||(settings_json->>k), ',' order by k) from jsonb_object_keys(settings_json) k) kv from public.stores where name in ('NOX-VERIFY-A1','CLUB NOX') order by 1");
console.log(JSON.stringify(r.rows));
await db.end();
