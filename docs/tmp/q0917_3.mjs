import { Client } from "pg";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await db.connect();
const cols = await db.query("select table_name, string_agg(column_name||':'||data_type, ', ' order by ordinal_position) c from information_schema.columns where table_schema='public' and table_name in ('checks','punches','shifts','cast_tax_profiles') group by 1");
console.log(JSON.stringify(cols.rows, null, 1));
await db.end();
