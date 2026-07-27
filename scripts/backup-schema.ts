/**
 * backup-schema — スキーマ論理バックアップ（純増⑤ 段3・二次バックアップ）
 *   実行: npm run backup:schema（env: SUPABASE_DB_URL）
 *
 * 位置づけ（★二層バックアップの二次側）:
 *   一次 = Supabase Pro の日次自動バックアップ／PITR（オプション）＝データ本体の復旧手段。
 *   二次 = 本スクリプト＝「スキーマの定義そのもの」をテキストで手元と git 履歴の外（backups/）に残す。
 *          mig の積み上げ結果が live でどうなっているかを1ファイルで確認・比較できるようにするのが目的
 *          （手貼り運用ゆえ「repo の mig 群」と「live の実体」が乖離していないかの突合に使う）。
 *
 * 出力: backups/nox-schema-<YYYYMMDD-HHmmss>.sql（.gitignore 済み＝コミットしない）
 *   ① テーブル DDL（列・型・NOT NULL・default）② 制約（PK/UK/FK/CHECK）③ インデックス
 *   ④ RLS 有効フラグ＋全ポリシー（USING/WITH CHECK 逐語）⑤ 全関数（pg_get_functiondef＝RPC の実体）
 *   ⑥ トリガ定義 ⑦ grants（テーブル/関数の ACL）
 *
 * ★データは出さない（行は1件も含まない）＝機微情報を手元ファイルに残さないための設計。
 *   データの復旧は一次（Supabase バックアップ／PITR）で行う。
 */
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit(["SUPABASE_DB_URL"]);

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const out: string[] = [];
  const say = (s = "") => out.push(s);
  const section = (title: string) => { say(); say(`-- ${"=".repeat(72)}`); say(`-- ${title}`); say(`-- ${"=".repeat(72)}`); say(); };

  const { rows: [meta] } = await db.query(`select current_database() as db, version() as ver, now() as at`);
  say(`-- NOX schema backup（二次バックアップ・スキーマのみ／データ非包含）`);
  say(`-- generated: ${new Date().toISOString()}`);
  say(`-- database : ${meta.db}`);
  say(`-- server   : ${String(meta.ver).split(",")[0]}`);
  say(`-- ★復旧は一次（Supabase Pro 日次バックアップ／PITR）が主。本ファイルは定義の突合・確認用。`);

  // ── ① テーブル DDL ─────────────────────────────────────────────
  section("① TABLES（列・型・NOT NULL・default）");
  const tables = await db.query(`
    select c.relname as table_name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relkind='r'
     order by c.relname`);
  for (const t of tables.rows) {
    const cols = await db.query(`
      select column_name, data_type, is_nullable, column_default, character_maximum_length
        from information_schema.columns
       where table_schema='public' and table_name=$1 order by ordinal_position`, [t.table_name]);
    say(`-- table: ${t.table_name}`);
    say(`create table public.${t.table_name} (`);
    say(cols.rows.map((c) => {
      const len = c.character_maximum_length ? `(${c.character_maximum_length})` : "";
      const nn = c.is_nullable === "NO" ? " not null" : "";
      const df = c.column_default ? ` default ${c.column_default}` : "";
      return `  ${c.column_name} ${c.data_type}${len}${nn}${df}`;
    }).join(",\n"));
    say(`);`);
    say();
  }

  // ── ② 制約 ────────────────────────────────────────────────────
  section("② CONSTRAINTS（PK / UNIQUE / FK / CHECK）");
  const cons = await db.query(`
    select rel.relname as table_name, con.conname, pg_get_constraintdef(con.oid) as def,
           case con.contype when 'p' then 'PRIMARY KEY' when 'u' then 'UNIQUE'
                            when 'f' then 'FOREIGN KEY' when 'c' then 'CHECK' else con.contype::text end as kind
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
     where n.nspname='public'
     order by rel.relname, con.contype, con.conname`);
  for (const c of cons.rows) say(`alter table public.${c.table_name} add constraint ${c.conname} ${c.def};  -- ${c.kind}`);

  // ── ③ インデックス ─────────────────────────────────────────────
  section("③ INDEXES");
  const idx = await db.query(`select indexdef from pg_indexes where schemaname='public' order by tablename, indexname`);
  for (const i of idx.rows) say(`${i.indexdef};`);

  // ── ④ RLS ─────────────────────────────────────────────────────
  section("④ RLS（有効フラグ＋ポリシー逐語）");
  const rls = await db.query(`
    select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='r' order by c.relname`);
  for (const r of rls.rows) {
    say(`alter table public.${r.relname} ${r.relrowsecurity ? "enable" : "disable"} row level security;${r.relforcerowsecurity ? "  -- FORCE" : ""}`);
  }
  say();
  const pols = await db.query(`
    select c.relname as table_name, p.polname,
           case p.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update'
                         when 'd' then 'delete' when '*' then 'all' end as cmd,
           p.polpermissive,
           (select array_agg(r.rolname order by r.rolname) from pg_roles r where r.oid = any(p.polroles)) as roles,
           pg_get_expr(p.polqual, p.polrelid) as qual,
           pg_get_expr(p.polwithcheck, p.polrelid) as with_check
      from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' order by c.relname, p.polname`);
  // ★pg は name[] を配列で返す場合と "{a,b}" 文字列で返す場合がある＝両対応で正規化
  const roleList = (v: unknown): string =>
    Array.isArray(v) ? v.join(", ") : String(v ?? "").replace(/^\{|\}$/g, "").split(",").filter(Boolean).join(", ");
  for (const p of pols.rows) {
    say(`create policy ${p.polname} on public.${p.table_name}`);
    say(`  as ${p.polpermissive ? "permissive" : "restrictive"} for ${p.cmd} to ${roleList(p.roles)}`);
    if (p.qual) say(`  using (${p.qual})`);
    if (p.with_check) say(`  with check (${p.with_check})`);
    say(`;`);
  }

  // ── ⑤ 関数（RPC の実体）─────────────────────────────────────────
  section("⑤ FUNCTIONS（pg_get_functiondef＝RPC/ヘルパー/トリガ関数の実体）");
  const fns = await db.query(`
    select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as def
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.prokind in ('f','p')
     order by p.proname, args`);
  say(`-- 関数数: ${fns.rows.length}`);
  say();
  for (const f of fns.rows) {
    say(`-- ── ${f.proname}(${f.args})`);
    say(`${f.def};`);
    say();
  }

  // ── ⑥ トリガ ──────────────────────────────────────────────────
  section("⑥ TRIGGERS");
  const trg = await db.query(`
    select c.relname, t.tgname, pg_get_triggerdef(t.oid) as def
      from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and not t.tgisinternal
     order by c.relname, t.tgname`);
  for (const t of trg.rows) say(`${t.def};`);

  // ── ⑦ grants ─────────────────────────────────────────────────
  section("⑦ GRANTS（テーブル ACL / 関数 ACL）");
  const tg = await db.query(`
    select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
      from information_schema.role_table_grants
     where table_schema='public' and grantee in ('anon','authenticated','service_role')
     group by table_name, grantee order by table_name, grantee`);
  for (const g of tg.rows) say(`-- table ${g.table_name}: ${g.grantee} = ${g.privs}`);
  say();
  const fg = await db.query(`
    select p.proname, pg_get_function_identity_arguments(p.oid) as args,
           coalesce(array_to_string(p.proacl::text[], ' '), '(default)') as acl
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.prokind in ('f','p') order by p.proname, args`);
  for (const g of fg.rows) say(`-- function ${g.proname}(${g.args}): ${g.acl}`);

  await db.end();

  mkdirSync("backups", { recursive: true });
  const file = `backups/nox-schema-${stamp()}.sql`;
  writeFileSync(file, out.join("\n") + "\n", "utf8");
  console.log(`backup-schema: ${file} を出力しました`);
  console.log(`  tables=${tables.rows.length} constraints=${cons.rows.length} indexes=${idx.rows.length} policies=${pols.rows.length} functions=${fns.rows.length} triggers=${trg.rows.length}`);
  console.log("  ★スキーマのみ（データ行は非包含）。データ復旧は一次＝Supabase Pro の日次バックアップ／PITR。");
}

main().catch((e) => {
  console.error("backup-schema 実行エラー", e);
  process.exit(1);
});
