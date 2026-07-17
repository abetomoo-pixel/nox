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
 *  G4 認可ヘルパー7本（基本4＋F3a-1 staff フラグ3）: 存在・SECURITY DEFINER・search_path=public 固定
 *     ＋ G4b: EXECUTE ACL（authenticated 保持・anon 不在＝mig0022 の revoke/grant 恒久化）
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
  "customers", // F3a-2（mig0023）
  "reservations", // F3a-3（mig0027）
  "trials", // F3d 体入採用（mig0040）
  "kiosk_devices", "cast_pin", // F4a キオスク打刻（mig0043・deny-all＝SELECT すら grant なし。G1/G2/G5 自動回帰＋G20 で policy 0本を能動 assert）
  "printer_config", "print_jobs", // F4b レシート印刷（mig0044/0045・deny-all。G21 で policy 0本＋service_role 限定 ACL を能動 assert）
];
const HELPERS = [
  "auth_org_id", "auth_role", "auth_store_id", "auth_cast_id",
  "auth_staff_can_register", "auth_staff_can_crm", "auth_staff_can_shift", // F3a-1（mig0022）
  "auth_staff_can_view_backs", // バック可視是正（mig0038）
  "auth_cast_can_register", // キャスト会計（mig0039・2段ゲート）
  "auth_kiosk_store_id", "auth_kiosk_org_id", // F4a キオスク（mig0043・kiosk_devices 起点＝auth_cast_id 同型）
];

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
    check(`G4 ヘルパー${HELPERS.length}本が存在`, r.rowCount === HELPERS.length, `got ${r.rowCount}: ${r.rows.map((x) => x.proname).join(", ")}`);
    for (const row of r.rows) {
      check(`G4 ${row.proname} SECURITY DEFINER`, row.prosecdef === true);
      check(`G4 ${row.proname} search_path=public 固定`, (row.config as string).includes("search_path=public"), row.config);
    }

    // G4b: ヘルパーの EXECUTE ACL（authenticated 保持・anon 不在＝mig0001/0022 の revoke/grant 恒久化）
    const acl = await db.query(
      `select p.proname, array_agg(r.rolname::text order by r.rolname) as roles
       from pg_proc p
       join aclexplode(p.proacl) a on true
       join pg_roles r on r.oid = a.grantee
       where p.pronamespace = 'public'::regnamespace and p.proname = any($1)
       group by p.proname`,
      [HELPERS],
    );
    check(`G4b ヘルパー${HELPERS.length}本の ACL 実在`, acl.rowCount === HELPERS.length, `got ${acl.rowCount}`);
    for (const row of acl.rows) {
      const roles = row.roles as string[];
      check(
        `G4b ${row.proname} EXECUTE = authenticated 保持・anon 不在`,
        roles.includes("authenticated") && !roles.includes("anon"),
        roles.join(", "),
      );
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

  // G8: F2c 給与確定（mig0016）— RLS・ポリシー・関数 ACL の proacl 実測
  {
    const r = await db.query(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relname = any($1)`,
      [["payroll_runs", "payslips"]],
    );
    check("G8 payroll_runs/payslips 2テーブル存在", r.rowCount === 2, `got ${r.rowCount}`);
    for (const row of r.rows) check(`G8 ${row.relname} RLS 有効`, row.relrowsecurity === true);

    const p = await db.query(
      `select tablename, policyname, cmd from pg_policies
       where schemaname = 'public' and tablename = any($1) order by tablename`,
      [["payroll_runs", "payslips"]],
    );
    check(
      "G8 payroll_runs/payslips ポリシー = 各1本 SELECT",
      p.rowCount === 2 && p.rows.every((x) => x.cmd === "SELECT"),
      p.rows.map((x) => `${x.tablename}:${x.cmd}`).join(", "),
    );

    const roleOf = async (fn: string): Promise<string[]> => {
      const q = await db.query(
        `select r.rolname from pg_proc p
         join aclexplode(p.proacl) a on true
         join pg_roles r on r.oid = a.grantee
         where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
        [fn],
      );
      return q.rows.map((x) => x.rolname as string);
    };
    // finalize/mark_paid = service_role のみ（anon/authenticated/public 不在）
    for (const fn of ["payroll_finalize", "payroll_mark_paid"]) {
      const roles = await roleOf(fn);
      const leaked = roles.filter((x) => ["anon", "authenticated", "public"].includes(x));
      check(
        `G8 ${fn} EXECUTE = service_role のみ`,
        roles.includes("service_role") && leaked.length === 0,
        `保持者: ${roles.join(", ") || "(なし)"}`,
      );
    }
    // audit_log_write_service = 内部専用（anon/authenticated/service_role/public 不在＝owner のみ）
    {
      const roles = await roleOf("audit_log_write_service");
      const leaked = roles.filter((x) => ["anon", "authenticated", "service_role", "public"].includes(x));
      check("G8 audit_log_write_service EXECUTE = owner のみ（内部専用）", leaked.length === 0, `保持者: ${roles.join(", ") || "(owner のみ)"}`);
    }
    // period_bounds = authenticated + service_role（anon 不在）
    {
      const roles = await roleOf("period_bounds");
      check(
        "G8 period_bounds EXECUTE = authenticated+service_role・anon 不在",
        roles.includes("authenticated") && roles.includes("service_role") && !roles.includes("anon"),
        `保持者: ${roles.join(", ")}`,
      );
    }
    // G8b: attendance_incentives（mig0017・#32）RLS 有効・パターン3 SELECT 1本
    const ai = await db.query(
      `select relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname='attendance_incentives'`,
    );
    check("G8 attendance_incentives RLS 有効", ai.rowCount === 1 && ai.rows[0].relrowsecurity === true, `got ${JSON.stringify(ai.rows)}`);
    const aip = await db.query(
      `select policyname, cmd from pg_policies where schemaname='public' and tablename='attendance_incentives'`,
    );
    check("G8 attendance_incentives ポリシー = SELECT 1本（パターン3）", aip.rowCount === 1 && aip.rows[0].cmd === "SELECT", aip.rows.map((x) => `${x.policyname}:${x.cmd}`).join(", "));
    for (const fn of ["incentive_publish", "incentive_cancel"]) {
      const roles = await roleOf(fn);
      check(`G8 ${fn} EXECUTE = authenticated（anon 不在）`, roles.includes("authenticated") && !roles.includes("anon"), `保持者: ${roles.join(", ")}`);
    }

    // G9: F2e-2 前借り/送り（mig0019）— RLS 有効・パターン1 SELECT 1本ずつ・RPC5本 ACL（authenticated・anon 不在）。
    //   G1（スキーマ全体で authenticated=SELECT のみ）が advances/transport の grant 面を自動回帰済み＝ここは positive assert。
    const t = await db.query(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relname = any($1)`,
      [["advances", "transport"]],
    );
    check("G9 advances/transport 2テーブル存在", t.rowCount === 2, `got ${t.rowCount}`);
    for (const row of t.rows) check(`G9 ${row.relname} RLS 有効`, row.relrowsecurity === true);
    const tp = await db.query(
      `select tablename, policyname, cmd from pg_policies
       where schemaname = 'public' and tablename = any($1) order by tablename`,
      [["advances", "transport"]],
    );
    check(
      "G9 advances/transport ポリシー = 各1本 SELECT（パターン1）",
      tp.rowCount === 2 && tp.rows.every((x) => x.cmd === "SELECT"),
      tp.rows.map((x) => `${x.tablename}:${x.cmd}`).join(", "),
    );
    for (const fn of ["adv_issue", "adv_cancel", "transport_issue", "transport_cancel", "set_store_okuri_mode"]) {
      const roles = await roleOf(fn);
      check(`G9 ${fn} EXECUTE = authenticated（anon 不在）`, roles.includes("authenticated") && !roles.includes("anon"), `保持者: ${roles.join(", ")}`);
    }

    // G10: F2d mynumber 暗号化/payment（mig0021）— payment_records RLS・パターン1・crypto RPC ACL。
    //   G1（authenticated=SELECT のみ）が payment_records の書込面を自動回帰済み＝ここは positive assert。
    const pr = await db.query(
      `select relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname='payment_records'`,
    );
    check("G10 payment_records RLS 有効", pr.rowCount === 1 && pr.rows[0].relrowsecurity === true, `got ${JSON.stringify(pr.rows)}`);
    const prp = await db.query(
      `select policyname, cmd from pg_policies where schemaname='public' and tablename='payment_records'`,
    );
    check("G10 payment_records ポリシー = SELECT 1本（パターン1）", prp.rowCount === 1 && prp.rows[0].cmd === "SELECT", prp.rows.map((x) => `${x.policyname}:${x.cmd}`).join(", "));
    // get_cast_mynumber（full 平文）= service_role のみ（anon/authenticated/public 不在）
    {
      const roles = await roleOf("get_cast_mynumber");
      const leaked = roles.filter((x) => ["anon", "authenticated", "public"].includes(x));
      check("G10 get_cast_mynumber EXECUTE = service_role のみ（full 平文封鎖）", roles.includes("service_role") && leaked.length === 0, `保持者: ${roles.join(", ") || "(なし)"}`);
    }
    // get_cast_mynumber_masked / payment_record_add = authenticated（anon 不在）
    for (const fn of ["get_cast_mynumber_masked", "payment_record_add"]) {
      const roles = await roleOf(fn);
      check(`G10 ${fn} EXECUTE = authenticated（anon 不在）`, roles.includes("authenticated") && !roles.includes("anon"), `保持者: ${roles.join(", ")}`);
    }
    // crypto RPC 3本の search_path=public,extensions 固定（pgcrypto 罠回避の恒久回帰）
    {
      const cfg = await db.query(
        `select proname, coalesce(array_to_string(proconfig,','),'') as config from pg_proc
         where pronamespace='public'::regnamespace and proname = any($1)`,
        [["set_cast_sensitive", "get_cast_mynumber", "get_cast_mynumber_masked"]],
      );
      for (const row of cfg.rows) {
        check(`G10 ${row.proname} search_path=public,extensions 固定（pgcrypto 罠回避）`, (row.config as string).includes("search_path=public, extensions") || (row.config as string).includes("search_path=public,extensions"), row.config);
      }
    }

    // G11: F3a-2 顧客CRM（mig0023）— customers ポリシー・新 RPC 6本の EXECUTE ACL。
    //   customers の RLS 有効と grant 面（authenticated=SELECT のみ・anon 0）は
    //   TABLES 配列追加により G1/G2/G5 が自動回帰＝ここは positive assert。
    const cup = await db.query(
      `select policyname, cmd from pg_policies where schemaname='public' and tablename='customers'`,
    );
    check(
      "G11 customers ポリシー = customers_select（SELECT）1本のみ（書込 policy なし＝RPC 経由）",
      cup.rowCount === 1 && cup.rows[0].cmd === "SELECT" && cup.rows[0].policyname === "customers_select",
      cup.rows.map((x) => `${x.policyname}:${x.cmd}`).join(", "),
    );
    for (const fn of [
      "customer_register", "customer_update", "customer_assign_cast",
      "customer_summary", "customer_list_summary", "bottle_keep_register",
    ]) {
      const roles = await roleOf(fn);
      check(`G11 ${fn} EXECUTE = authenticated（anon/public 不在）`,
        roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
    }

    // G12: F3a 束3-1（mig0024）— set_staff_perms ACL・memberships policy 不変。
    //   read RPC（list_staff_perms）は不採用（既存 memberships_select で owner/manager が読める）＝
    //   memberships の policy は memberships_select 1本のみが不変条件（認可土台の非汚染 assert）。
    {
      const roles = await roleOf("set_staff_perms");
      check("G12 set_staff_perms EXECUTE = authenticated（anon/public 不在）",
        roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
    }
    const memp = await db.query(
      `select policyname, cmd from pg_policies where schemaname='public' and tablename='memberships'`,
    );
    check(
      "G12 memberships ポリシー = memberships_select（SELECT）1本のみ不変（read RPC 不採用・土台非汚染）",
      memp.rowCount === 1 && memp.rows[0].cmd === "SELECT" && memp.rows[0].policyname === "memberships_select",
      memp.rows.map((x) => `${x.policyname}:${x.cmd}`).join(", "),
    );

    // G13: F3a 束3-2 Q-1（mig0025）— スタッフ編集 RPC 5本の EXECUTE ACL（authenticated 保持・anon/public 不在）。
    //   memberships policy 不変（memberships_select 1本のみ）は G12 が恒久 assert 済み＝ここは ACL のみ。
    for (const fn of [
      "staff_update_profile", "staff_transfer_store", "staff_change_role",
      "staff_deactivate", "staff_reactivate",
    ]) {
      const roles = await roleOf(fn);
      check(`G13 ${fn} EXECUTE = authenticated（anon/public 不在）`,
        roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
    }

    // G14: F3a 束3-2 Q-2（mig0026）— staff_create の EXECUTE ACL＋users policy 不変。
    //   memberships policy 不変は G12 が恒久 assert 済み。users も書込 policy を作らない
    //   （staff_create は SECURITY DEFINER 内で INSERT＝users_select 1本のみが不変条件）。
    {
      const roles = await roleOf("staff_create");
      check("G14 staff_create EXECUTE = authenticated（anon/public 不在）",
        roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
    }
    const usp = await db.query(
      `select policyname, cmd from pg_policies where schemaname='public' and tablename='users'`,
    );
    check(
      "G14 users ポリシー = users_select（SELECT）1本のみ不変（書込 policy なし＝RPC 経由）",
      usp.rowCount === 1 && usp.rows[0].cmd === "SELECT" && usp.rows[0].policyname === "users_select",
      usp.rows.map((x) => `${x.policyname}:${x.cmd}`).join(", "),
    );

    // G15: F3a-3 予約（mig0027）— 予約 RPC 4本の EXECUTE ACL＋reservations policy。
    //   reservations の RLS 有効と grant 面（authenticated=SELECT のみ・anon 0）は
    //   TABLES 配列追加により G1/G2/G5 が自動回帰＝ここは positive assert。
    for (const fn of [
      "reservation_create", "reservation_update", "reservation_set_status", "reservation_to_check",
    ]) {
      const roles = await roleOf(fn);
      check(`G15 ${fn} EXECUTE = authenticated（anon/public 不在）`,
        roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
    }
    const rsp = await db.query(
      `select policyname, cmd from pg_policies where schemaname='public' and tablename='reservations'`,
    );
    check(
      "G15 reservations ポリシー = reservations_select（SELECT）1本のみ（書込 policy なし＝RPC 経由）",
      rsp.rowCount === 1 && rsp.rows[0].cmd === "SELECT" && rsp.rows[0].policyname === "reservations_select",
      rsp.rows.map((x) => `${x.policyname}:${x.cmd}`).join(", "),
    );

    // G16: F3b-A 塊2-1（mig0028）— customer_visit_history の EXECUTE ACL。
    //   読み取り専用 definer（checks の can_register 軸 → can_crm 軸への橋渡し）＝
    //   テーブル/policy 変更なし・関数 ACL の1点のみが不変条件。
    {
      const roles = await roleOf("customer_visit_history");
      check("G16 customer_visit_history EXECUTE = authenticated（anon/public 不在）",
        roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
    }

    // G17: キャスト会計（mig0039）— 店/cast フラグ書込 RPC 2本の EXECUTE ACL。
    //   auth_cast_can_register の属性/ACL は G4/G4b が HELPERS 配列追加で自動回帰＝ここは書込 RPC のみ。
    //   RLS cast 枝（8表）と会計8RPC の cast 枝は runtime（anon-guard 段31）で実測＝ここは positive ACL。
    for (const fn of ["set_store_cast_register", "set_cast_register"]) {
      const roles = await roleOf(fn);
      check(`G17 ${fn} EXECUTE = authenticated（anon/public 不在）`,
        roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
    }

    // G18: F3d 体入採用（mig0040）— 公開 RPC 5本 ＋ 内部 cast_create_apply の EXECUTE ACL。
    //   trials の RLS 有効・grant 面（authenticated=SELECT のみ・anon 0）は TABLES 追加で G1/G2/G5 が自動回帰。
    for (const fn of ["trial_register", "trial_update", "trial_hire", "trial_reject", "cast_create"]) {
      const roles = await roleOf(fn);
      check(`G18 ${fn} EXECUTE = authenticated（anon/public 不在）`,
        roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
    }
    // cast_create_apply = 内部専用（anon/authenticated/service_role/public 不在＝owner のみ）
    {
      const roles = await roleOf("cast_create_apply");
      const leaked = roles.filter((x) => ["anon", "authenticated", "service_role", "public"].includes(x));
      check("G18 cast_create_apply EXECUTE = owner のみ（内部専用・4ロール revoke）",
        leaked.length === 0, `保持者: ${roles.join(", ") || "(owner のみ)"}`);
    }

    // G19: castログイン招待（mig0041）— cast_invite の EXECUTE ACL。
    //   users/memberships/casts の policy 不変（select 各1本）は G12/G14 と mig0041 検証3 が担保。
    {
      const roles = await roleOf("cast_invite");
      check("G19 cast_invite EXECUTE = authenticated（anon/public 不在）",
        roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
    }

    // G20: F4a キオスク打刻（mig0043）— RPC 5本の EXECUTE ACL ＋ deny-all 2表の policy 0本 ＋ source 3値。
    //   auth_kiosk_store_id/org_id の属性/ACL は HELPERS 追加で G4/G4b が自動回帰。
    //   kiosk_devices/cast_pin の RLS 有効・grant 0 は TABLES 追加で G1/G2/G5 が自動回帰＝ここは policy 0本（deny-all）を能動 assert。
    for (const fn of ["kiosk_provision", "kiosk_deactivate", "set_cast_pin", "kiosk_punch", "kiosk_cast_list"]) {
      const roles = await roleOf(fn);
      check(`G20 ${fn} EXECUTE = authenticated（anon/public 不在）`,
        roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
    }
    {
      const r = await db.query(
        `select tablename, count(*) as n from pg_policies
         where schemaname = 'public' and tablename in ('kiosk_devices','cast_pin')
         group by tablename`,
      );
      check("G20 kiosk_devices/cast_pin policy 0本（deny-all＝RPC 専任）", r.rowCount === 0,
        JSON.stringify(r.rows));
    }
    {
      const r = await db.query(
        `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'punches_source_check'`,
      );
      const def = (r.rows[0]?.def as string | undefined) ?? "";
      check("G20 punches_source_check = self/manager/kiosk の3値",
        def.includes("'self'") && def.includes("'manager'") && def.includes("'kiosk'"), def || "(missing)");
    }

    // G21: F4b レシート印刷（mig0044/0045）— RPC ACL ＋ deny-all 2表の policy 0本。
    //   printer_config/print_jobs の RLS 有効・grant 0 は TABLES 追加で G1/G2/G5 が自動回帰。
    //   ★print_claim/print_result は service_role 限定（認証外 route 専用＝anon/authenticated/public 不在を能動 assert）。
    for (const fn of ["set_printer_config", "rotate_store_token", "get_printer_config", "set_store_receipt_profile", "print_enqueue"]) {
      const roles = await roleOf(fn);
      check(`G21 ${fn} EXECUTE = authenticated（anon/public 不在）`,
        roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
    }
    for (const fn of ["print_claim", "print_result"]) {
      const roles = await roleOf(fn);
      check(`G21 ${fn} EXECUTE = service_role のみ（anon/authenticated/public 不在）`,
        roles.includes("service_role") && !roles.includes("anon") && !roles.includes("authenticated") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
    }
    {
      const r = await db.query(
        `select tablename, count(*) as n from pg_policies
         where schemaname = 'public' and tablename in ('printer_config','print_jobs')
         group by tablename`,
      );
      check("G21 printer_config/print_jobs policy 0本（deny-all＝RPC/service_role 専任）", r.rowCount === 0,
        JSON.stringify(r.rows));
    }

    // G22: F4c 決済手段内訳（mig0046）— check_pay の署名一意性＋ACL＋method_detail 制約。
    //   ★署名一意性を先に assert する: roleOf は proname 引きのため、旧6引数版が残ると ACL が
    //   2署名ぶん混ざって静かに通ってしまう（＝drop 漏れを検知できない）。
    {
      const r = await db.query(
        `select pg_get_function_identity_arguments(oid) as args from pg_proc
         where pronamespace = 'public'::regnamespace and proname = 'check_pay'`,
      );
      const argsList = r.rows.map((x) => x.args as string);
      check("G22 check_pay = 7引数1本のみ（旧6引数版 drop 済＝オーバーロード無し）",
        r.rowCount === 1 && argsList[0].includes("p_method_detail"), JSON.stringify(argsList));
      const roles = await roleOf("check_pay");
      check("G22 check_pay EXECUTE = authenticated（anon/public 不在）",
        roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
    }
    {
      const r = await db.query(
        `select pg_get_constraintdef(oid) as def from pg_constraint
         where conrelid = 'public.payments'::regclass and conname = 'payments_method_detail_check'`,
      );
      const def = (r.rows[0]?.def as string | undefined) ?? "";
      check("G22 payments_method_detail_check = null 可・50字上限",
        def.includes("IS NULL") && def.includes("50"), def || "(missing)");
    }
    // G22b: 語彙は4値維持（F4c 裁定＝台帳 #36）。値域が動いたら 5点セット改修の合図＝ここで検知する。
    {
      const r = await db.query(
        `select pg_get_constraintdef(oid) as def from pg_constraint
         where conrelid = 'public.payments'::regclass and conname = 'payments_method_check'`,
      );
      const def = (r.rows[0]?.def as string | undefined) ?? "";
      check("G22b payments_method_check = cash/card/ar/other の4値維持（拡張時は 5点セット同時改修）",
        def.includes("'cash'") && def.includes("'card'") && def.includes("'ar'") && def.includes("'other'")
        && (def.match(/'/g) ?? []).length === 8, def || "(missing)");
    }
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
