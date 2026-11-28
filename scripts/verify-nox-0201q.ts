/*
 * verify:nox-0201q — 0201q（2026-11-18 16:53 Agoora 手貼り・検証 11 行一致）の本番の形（読取だけ・env: SUPABASE_DB_URL）。
 *  q(1) 関数 454・表 122／q(2) set_store_profile の白名単に sales_basis・sales_back_default_off（保存だけ）・reward_axis も残る
 *  q(3) cast_sales_aggregate_subtotal＝内部専用（postgres だけ）・get_cast_sales_subtotal と set_store_line_extra＝anon なし・authenticated あり・SECURITY DEFINER・search_path
 *  q(4) 既存の cast_sales_aggregate・get_cast_sales は 0201q の前と同じ本文（CR を除いた md5）
 *  q(5) 種：レジの許可のあるキャスト（ACE ひなの・LILY みく）に staff_pin（店の端末の入口で入れる）
 */
import fs from "node:fs";
import { Client } from "pg";
import { loadEnvOrExit } from "./fixtures-f0";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d).slice(0, 300)}` : ""}`); }
for (const [c, name] of [["ace", "ひなの"], ["lily", "みく"]] as const) {
  const T = JSON.parse(fs.readFileSync(`docs/demo/payload/${c}.json`, "utf8")).tables as Record<string, Record<string, unknown>[]>;
  const m = T.memberships.find((x) => x.role === "cast");
  check(`q(5) ${c}: 代表キャスト（${name}）にレジの許可・★0201r の後は staff_pin を持たない（打刻の PIN で入る）`, !!m && m.can_register === true && !T.staff_pin.some((p) => p.membership_id === m.id) && T.cast_pin.length > 0);
}
async function main() {
  const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 60000, application_name: "nox-verify-0201q" });
  await db.connect();
  try {
    await db.query("begin read only");
    const n = (await db.query("select (select count(*) from pg_proc where pronamespace='public'::regnamespace)::int f, (select count(*) from pg_tables where schemaname='public')::int t")).rows[0];
    check("q(1) 関数 455・表 122（★0201q 2026-11-18 16:53・★0201s 2026-11-19 06:41 で 454→455）", n.f === 528 /* ★0231・0247（2026-11-28 12:36 CC 適用・先の 8 本＝assert_cast_register_level2・auth_cast_order_only）: 526→528・表 133 のまま */ /* ★0235（2026-11-27 19:35 CC 適用）: 525→526・表 133 のまま */ /* ★0217（2026-11-26 14:42 CC 適用）: 524→525・表 133 のまま */ /* ★0216（2026-11-26 12:48 CC 適用）: 522→524・表 133 のまま */ /* ★0210 版 3（2026-11-25 22:39 CC 適用）: 518→522・表 133 のまま */ /* ★0214 版 2（2026-11-25 19:48 CC 適用）: 511→518・132→133 */ /* ★0212・0215（2026-11-25 17:05 CC 適用）: 501→511・129→132 */  /* ★0213・0209（2026-11-25 CC 適用）: 490→501・128→129 */ /* ★0211（2026-11-25 11:13:41 CC 適用）: 487→490 */ /* ★0207・0208（2026-11-25 CC 適用）: 483→487・127→128 */ /* ★0203 版 4（2026-11-24 11:21:19 CC 適用）: 478→483 */ && n.t === 133 /* ★0214 版 2: 132→133 */ /* ★0212（2026-11-25 17:05）: 129→132 */  /* ★0213（2026-11-25）: 128→129＝表 punch_round_rules */ /* ★0207（2026-11-25）: 127→128＝表 ops_support_requests */ /* ★0206（2026-11-24 CC 適用）: 126→127＝表 cast_employment */ /* ★0202a（2026-11-21）: 455→463・122→124 */ /* ★0202b（2026-11-21 21:57 CC 適用）: 463→478・124→126 */, n);
    const ssp = (await db.query("select prosrc from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile'")).rows[0].prosrc as string;
    check("q(2) set_store_profile の白名単に sales_basis・sales_back_default_off（'bad sales_basis'）・reward_axis も残る", ssp.includes("'sales_basis','sales_back_default_off'") && ssp.includes("bad sales_basis") && ssp.includes("bad reward_axis"));
    const fx = (await db.query("select proname, prosecdef, proconfig::text cfg, proacl::text acl, has_function_privilege('anon', oid, 'execute') a, has_function_privilege('authenticated', oid, 'execute') u from pg_proc where pronamespace='public'::regnamespace and proname in ('cast_sales_aggregate_subtotal','get_cast_sales_subtotal','set_store_line_extra') order by 1")).rows as { proname: string; prosecdef: boolean; cfg: string; acl: string; a: boolean; u: boolean }[];
    const by = Object.fromEntries(fx.map((x) => [x.proname, x]));
    check("q(3-1) cast_sales_aggregate_subtotal＝内部専用（postgres だけ）", by.cast_sales_aggregate_subtotal?.acl === "{postgres=X/postgres}" && !by.cast_sales_aggregate_subtotal.a && !by.cast_sales_aggregate_subtotal.u, by.cast_sales_aggregate_subtotal);
    check("q(3-2) get_cast_sales_subtotal・set_store_line_extra＝anon なし・authenticated あり", ["get_cast_sales_subtotal", "set_store_line_extra"].every((k) => by[k] && !by[k].a && by[k].u), fx);
    check("q(3-3) 新設 3 本＝SECURITY DEFINER・search_path=public", fx.length === 3 && fx.every((x) => x.prosecdef && x.cfg.includes("search_path=public")), fx);
    const md = (await db.query("select proname, md5(replace(prosrc, E'\r', '')) m from pg_proc where pronamespace='public'::regnamespace and proname in ('cast_sales_aggregate','get_cast_sales') order by 1")).rows as { proname: string; m: string }[];
    check("q(4) cast_sales_aggregate（★0241g 2026-11-27 16:07 適用の本文＝8fb314c5…→3dafda96…）・get_cast_sales は 0201q の前と同じ本文", md[0]?.m === "3dafda963a13f150a16bfc4c549fd079" && md[1]?.m === "eaec39a4b7625792d75ecb69d353f200", md);
  } finally { await db.query("rollback").catch(() => undefined); await db.end(); }
  if (fails.length) { console.error(`✗ verify:nox-0201q 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log(`verify:nox-0201q OK (${pass} checks)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
