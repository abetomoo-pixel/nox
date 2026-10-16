// scripts/mig-check.mjs — migration の構文検査（恒久注意30・便 M173-fix・2026-10-16）。本番には触れない。
//   使い方: node scripts/mig-check.mjs <mig.sql> [--pgq <libpg-query を npm i したディレクトリ>] [--db <ローカル Postgres の URL>]
//     1) ファイル全体を libpg_query（npm libpg-query・SQL 段）で parse＝ドル引用の対応・DDL の構文・文の区切り（CREATE FUNCTION の本体は文字列として通る）
//     2) LANGUAGE plpgsql の関数＝ローカル Postgres（使い捨て cluster・BEGIN…ROLLBACK）で CREATE FUNCTION を実行＝plpgsql の本体を本番と同じ検証器（check_function_bodies）で parse。
//        宣言部の複合型（public.kiosk_devices 等・%rowtype）は空のスタブ表を同じトランザクション内に作る＝型解決だけ通す（列・関数の存在は実行時解決＝検査対象外）
//     3) LANGUAGE sql の関数＝本体を libpg_query で parse（表の存在は見ない）
//   0173 初回手貼りの 42601（2,042 行目＝values 句の途中に -- コメントが入り残りが消えた）は 2) で捕まる。
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import pg from "pg";
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const pgqDir = opt("--pgq", process.env.MIG_CHECK_PGQ ?? "");
const dbUrl = opt("--db", process.env.MIG_CHECK_DB_URL ?? "");
if (!file) { console.error("usage: node scripts/mig-check.mjs <mig.sql> [--pgq dir] [--db url]"); process.exit(2); }
const sql = readFileSync(file, "utf8");
if (sql.includes("\r")) { console.error("CR in file"); process.exit(1); }
const req = createRequire(path.resolve(pgqDir || process.cwd(), "package.json"));
const pgq = req("libpg-query");
if (typeof pgq.loadModule === "function") await pgq.loadModule();   // libpg-query 17（wasm）
let bad = 0;
const lineOf = (pos) => sql.slice(0, pos).split("\n").length;
// 1) 全体 parse
try { const t = pgq.parseSync(sql); console.log(`[1] libpg_query parse: ok（statements ${t.stmts.length}）`); }
catch (e) { bad++; console.log(`[1] libpg_query parse: NG ${e.message}` + (e.cursorPosition ? `（line ${lineOf(e.cursorPosition)}）` : "")); }
// 関数の切り出し（生成器の形＝CREATE OR REPLACE FUNCTION … AS $function$ … $function$;）
const fns = [];
const re = /CREATE OR REPLACE FUNCTION public\.(\w+)\([\s\S]*?\n LANGUAGE (\w+)\n[\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/g;
for (const m of sql.matchAll(re)) fns.push({ name: m[1], lang: m[2], body: m[3], text: m[0].slice(0, -1), line: lineOf(m.index) });
const n$ = (sql.match(/\$function\$/g) || []).length;
if (n$ !== fns.length * 2) { bad++; console.log(`[2] $function$ の数 ${n$} ≠ 関数 ${fns.length}×2（タグの対応ずれ）`); } else console.log(`[2] $function$ の対応: ok（${fns.length} 本×2）`);
// 3) sql 関数
for (const f of fns.filter((x) => x.lang === "sql")) {
  try { pgq.parseSync(f.body); console.log(`[3] sql ${f.name}: ok`); } catch (e) { bad++; console.log(`[3] sql ${f.name}: NG ${e.message}`); }
}
// 2) plpgsql 関数＝ローカル Postgres
const pl = fns.filter((x) => x.lang === "plpgsql");
if (pl.length && !dbUrl) { console.log(`[2] plpgsql ${pl.length} 本＝--db が無いので未検査`); bad++; }
if (pl.length && dbUrl) {
  const { Client } = pg;
  const c = new Client({ connectionString: dbUrl });
  await c.connect();
  const host = c.host ?? "";
  if (!/^(127\.0\.0\.1|localhost|::1)$/.test(host)) { console.log(`[2] --db はローカルだけ（host=${host}）`); process.exit(1); }
  await c.query("begin");
  try {
    await c.query("create schema if not exists public; create schema if not exists extensions; create schema if not exists auth;");
    await c.query("create or replace function auth.uid() returns uuid language sql as $$ select null::uuid $$;");
    // 宣言部の複合型＝空のスタブ表
    const types = new Set();
    for (const f of pl) {
      const decl = f.body.split(/\nbegin\n/)[0];
      for (const m of decl.matchAll(/\s(public\.(\w+))(%rowtype)?\s*;/g)) types.add(m[2]);
      for (const m of decl.matchAll(/\s(public\.(\w+))%rowtype/g)) types.add(m[2]);
    }
    for (const t of types) await c.query(`create table if not exists public.${t} (id uuid)`);
    for (const f of pl) {
      await c.query("savepoint fn");   // 1 本の失敗で後続を巻き込まない（25P02 の連鎖を防ぐ）
      try { await c.query(f.text); console.log(`[2] plpgsql ${f.name}: ok`); }
      catch (e) { bad++; await c.query("rollback to savepoint fn"); console.log(`[2] plpgsql ${f.name}: NG ${e.code} ${e.message}（file line ${f.line}〜）`); }
    }
  } finally { await c.query("rollback"); await c.end(); }
}
console.log(bad ? `NG ${bad}` : `OK（errors 0・plpgsql ${pl.length}・sql ${fns.length - pl.length}）`);
process.exit(bad ? 1 : 0);
