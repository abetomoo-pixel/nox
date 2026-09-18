// A 段: 0147 手貼り後の検証（読取のみ）
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const out = [];
const ok = (k, c, d = "") => out.push(`${k}: ${c ? "OK" : "NG"}${d ? " — " + d : ""}`);
const jst = (await q("select to_char(now() at time zone 'Asia/Tokyo','YYYY-MM-DD HH24:MI:SS') t"))[0].t;
// A-1
const proof = await q("select 'nox-project-proof' p, count(*)::int n from public.orgs");
ok("A-1 proof orgs 3", proof[0].n === 3, JSON.stringify(proof[0]));
// A-2
const f = await q("select pg_get_function_identity_arguments(oid) args, md5(prosrc) m, prosrc from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile'");
const KEYS = ["biz_type", "billing_mode", "setup_done", "sys_hourly", "sys_backs", "sys_sales_rate", "sys_points", "sys_sales_slide", "sys_point_slide", "sys_norms", "sys_penalties", "sys_bonus"];
ok("A-2 署名 1 本 (p_store_id uuid, p_patch jsonb)", f.length === 1 && f[0].args === "p_store_id uuid, p_patch jsonb", f[0]?.args);
ok("A-2 md5(prosrc) が 07d114ff… から変化", f[0].m !== "07d114ff0b570462c3330b87497fc17c", `new md5=${f[0].m}`);
const missing = KEYS.filter((k) => !f[0].prosrc.includes(`'${k}'`));
ok("A-2 12 キー全て prosrc に包含", missing.length === 0, missing.length ? `missing=${missing.join(",")}` : "12/12");
ok("A-2 'billing locked' 残存", f[0].prosrc.includes("raise exception 'billing locked'"));
ok("A-2 'bad biz_type'／'bad billing_mode' あり", f[0].prosrc.includes("'bad biz_type'") && f[0].prosrc.includes("'bad billing_mode'"));
// A-3
const acl = (await q("select proacl::text a from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile'"))[0].a;
ok("A-3 proacl＝postgres／authenticated／service_role のみ", acl === "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}", acl);
// A-4: 0147_pre.md §7 の控えと照合
const pre = fs.readFileSync("docs/tmp/0147_pre.md", "utf8");
const preMd5 = Object.fromEntries([...pre.matchAll(/^- (set_store_[a-z_]+|check_pay|check_close|check_void): `([0-9a-f]{32})`$/gm)].map((m) => [m[1], m[2]]));
const nowSet = await q("select proname, md5(pg_get_functiondef(oid)) m from pg_proc where pronamespace='public'::regnamespace and (proname like 'set\\_store\\_%' or proname in ('check_pay','check_close','check_void')) order by proname");
const diffs = nowSet.filter((r) => r.proname !== "set_store_profile" && preMd5[r.proname] !== r.m).map((r) => r.proname);
ok("A-4 他 set_store_* 11 本＋money-core 3 本の md5 が控えと一致", diffs.length === 0 && nowSet.length === 15, diffs.length ? `changed=${diffs.join(",")}` : `${nowSet.length - 1} 本一致（set_store_profile は意図どおり変化: pre=${preMd5.set_store_profile} now=${nowSet.find((r) => r.proname === "set_store_profile").m}）`);
// A-5
const st = await q("select name, settings_json->>'setup_done' sd, (select string_agg(k, ',' order by k) from jsonb_object_keys(settings_json) k) keys from public.stores order by name");
ok(`A-5 stores 全行 setup_done='true'（${st.filter((r) => r.sd === "true").length}/${st.length} 行）`, st.every((r) => r.sd === "true"), st.map((r) => `${r.name}:${r.keys}`).join(" / "));
const club = st.find((r) => r.name === "CLUB NOX");
ok("A-5 CLUB NOX の okuri_mode／biz_cutoff_hm／cast_register_enabled が残存", ["okuri_mode", "biz_cutoff_hm", "cast_register_enabled"].every((k) => (club?.keys ?? "").split(",").includes(k)), club?.keys);
// A-6 billing 47-1
const gated = (await q("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and prosrc like '%billing locked%'"))[0].n;
const total = (await q("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace"))[0].n;
ok("A-6 billing 47-1: ゲート済み 125・全数 241 不変", gated === 125 && total === 241, `gated=${gated} total=${total}`);
// A-6 G2b
const pub = (await q("select count(*)::int n from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))"))[0].n;
ok("A-6 grants G2b: PUBLIC EXECUTE の SECURITY DEFINER 関数 = 0", pub === 0, `got ${pub}`);
await db.end();
// A-6 anon-guard 31a probe
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { error } = await anon.rpc("set_store_profile", { p_store_id: null, p_patch: null });
ok("A-6 anon-guard 31a: anon set_store_profile(null,null) は BLOCKED", !!error && /permission denied for function/.test(error.message), error?.message ?? "実行できてしまった");
console.log(`JST ${jst}`);
console.log(out.join("\n"));
console.log(out.some((l) => /: NG/.test(l)) ? "A: NG あり" : "A: ALL OK");
