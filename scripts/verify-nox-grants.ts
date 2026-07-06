/*
 * verify:nox-grants — grant/ACL/RLS 有効の introspection 恒久回帰（Postgres 直結）。
 *   npm run verify:nox-grants（env: SUPABASE_DB_URL）
 *
 * SQL Editor 手動チェック（各 mig の「適用後の検証」）の自動化＝"Success" を信用しない、の恒久化。
 * PostgREST は information_schema / pg_catalog を公開しないため、このスクリプトのみ DB 直結。
 *
 * assert（mig 0003/0004 の検証と同型）:
 *  G1 public スキーマ全体で authenticated が SELECT 以外のテーブル権限を持たない（0行）
 *  G2 anon にテーブル権限が一切ない（0行）
 *  G3 audit_log_write の EXECUTE 保持者 = owner のみ（anon/authenticated/service_role 不在）
 *  G4 認可ヘルパー4本: 存在・SECURITY DEFINER・search_path=public 固定
 *  G5 6テーブルすべて RLS 有効（relrowsecurity=true）
 *  G6 audit_logs のポリシーは select 1本のみ（insert/update/delete ポリシー不在）
 */
import { Client } from "pg";
import { loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit(["SUPABASE_DB_URL"]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

const TABLES = [
  "orgs", "stores", "users", "memberships", "casts", "audit_logs",
  "products", "seats", "bottle_keeps", "stock_logs", // F1a（mig0005）
  "checks", "check_nominations", "check_lines", "payments", "check_cast_backs", "receivables", // F1b（mig0006）
  "shift_wishes", "shifts", "attendance", "punches", "staffing_needs", // F1d（mig0008）
  "daily_reports", // F1e（mig0010）
];
const HELPERS = ["auth_org_id", "auth_role", "auth_store_id", "auth_cast_id"];

async function main() {
  const db = new Client({
    connectionString: env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();

  // G1: authenticated は SELECT のみ（スキーマ全体ガード＝0003 検証(2)同型）
  {
    const r = await db.query(
      `select table_name, privilege_type
       from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'authenticated'
         and privilege_type <> 'SELECT'
       order by table_name, privilege_type`,
    );
    check(
      "G1 authenticated の SELECT 以外テーブル権限 = 0行（スキーマ全体）",
      r.rowCount === 0,
      r.rows.map((x) => `${x.table_name}:${x.privilege_type}`).join(", "),
    );
  }

  // G2: anon のテーブル権限ゼロ（スキーマ全体）
  {
    const r = await db.query(
      `select table_name, privilege_type
       from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'anon'
       order by table_name, privilege_type`,
    );
    check(
      "G2 anon のテーブル権限 = 0行（スキーマ全体）",
      r.rowCount === 0,
      r.rows.map((x) => `${x.table_name}:${x.privilege_type}`).join(", "),
    );
  }

  // G3: audit_log_write は owner のみ（0004 の恒久化）
  {
    const r = await db.query(
      `select r.rolname
       from pg_proc p
       join aclexplode(p.proacl) a on true
       join pg_roles r on r.oid = a.grantee
       where p.proname = 'audit_log_write'`,
    );
    const roles = r.rows.map((x) => x.rolname as string);
    const leaked = roles.filter((x) => ["anon", "authenticated", "service_role", "public"].includes(x));
    check("G3 audit_log_write EXECUTE = owner のみ", r.rowCount! > 0 && leaked.length === 0, `保持者: ${roles.join(", ") || "(なし)"}`);
  }

  // G4: 認可ヘルパー4本の属性（prosrc 検証の自動化）
  {
    const r = await db.query(
      `select proname, prosecdef, coalesce(array_to_string(proconfig, ','), '') as config
       from pg_proc
       where pronamespace = 'public'::regnamespace and proname = any($1)`,
      [HELPERS],
    );
    check("G4 ヘルパー4本が存在", r.rowCount === 4, `got ${r.rowCount}: ${r.rows.map((x) => x.proname).join(", ")}`);
    for (const row of r.rows) {
      check(`G4 ${row.proname} SECURITY DEFINER`, row.prosecdef === true);
      check(`G4 ${row.proname} search_path=public 固定`, (row.config as string).includes("search_path=public"), row.config);
    }
  }

  // G5: 6テーブル RLS 有効
  {
    const r = await db.query(
      `select relname, relrowsecurity
       from pg_class
       where relnamespace = 'public'::regnamespace and relname = any($1)`,
      [TABLES],
    );
    check(`G5 ${TABLES.length}テーブルが存在`, r.rowCount === TABLES.length, `got ${r.rowCount}`);
    for (const row of r.rows) {
      check(`G5 ${row.relname} RLS 有効`, row.relrowsecurity === true);
    }
  }

  // G6: audit_logs のポリシーは select 1本のみ
  {
    const r = await db.query(
      `select policyname, cmd from pg_policies
       where schemaname = 'public' and tablename = 'audit_logs'`,
    );
    check(
      "G6 audit_logs ポリシー = select 1本のみ",
      r.rowCount === 1 && r.rows[0].cmd === "SELECT",
      r.rows.map((x) => `${x.policyname}:${x.cmd}`).join(", "),
    );
  }

  // G7: cast_sensitive は authenticated 権限 0（T5a 明示例外・grant0 の positive assert）＋ポリシー0行
  {
    const g = await db.query(
      `select privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'cast_sensitive' and grantee = 'authenticated'`,
    );
    check("G7 cast_sensitive の authenticated 権限 = 0（grant0 明示例外）", g.rowCount === 0, g.rows.map((x) => x.privilege_type).join(", "));
    const p = await db.query(
      `select policyname from pg_policies where schemaname = 'public' and tablename = 'cast_sensitive'`,
    );
    check("G7 cast_sensitive ポリシー = 0行（意図・閲覧 RPC のみ）", p.rowCount === 0, p.rows.map((x) => x.policyname).join(", "));
  }

  await db.end();

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-grants ALL PASS (${pass} assertions)`);
}

main().catch((e) => {
  console.error("✗ 異常終了", e);
  process.exit(1);
});
