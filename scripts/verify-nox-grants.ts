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
  "cast_contract_acks", // ★0162（裁定329／326 追補7-6）: cast の契約確認記録（cast×contract_rev・authenticated=SELECT のみ・RLS select 1 本。G9 0162 で列集合／policy を能動 assert）
  "cast_quotas", "cast_notice_reads", // ★0160（裁定326-3／326-6）: キャスト別ノルマ・お知らせ既読（authenticated=SELECT のみ・RLS select 1 本。G9 0160 で列集合／policy を能動 assert）
  "payroll_attentions", // ★0158（裁定315）: 確定後の打刻修正の要対応（authenticated=SELECT のみ・RLS select 1 本。G9 0158 で列集合／policy を能動 assert）
  "daily_pays", "payroll_run_deduction_overrides", // ★0156（裁定309-6／309-8）: 日払い・run 別控除上書き（authenticated=SELECT のみ・RLS select 1 本。G1/G2/G5 が .length で自動被覆＋G9 で列集合／policy を能動 assert）
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
  "product_costs", // 台帳#40 案C（mig0049/0050・原価分離。G24 で policy 逐語＋grant 実体を能動 assert）
  "check_seats", // B1/B2 相席・席移動（mig0053・追加席の占有台帳。G27 で policy 逐語＋unique index＋grant 実体を能動 assert。.length 参照ゆえ G1/G2/G5 自動被覆＝裁定台帳 裁定9 教訓）
  "ar_collections", // B6 売掛回収消込台帳（mig0055・authenticated=SELECT のみ。G1/G2/G5 が .length で自動被覆＝教訓B。G29 で policy/grant/RPC ACL を能動 assert）
  "staff_pin", "kiosk_sessions", // K レジ用キオスク（mig0056・deny-all。.length 参照ゆえ G1/G2/G5 が自動被覆＝教訓B。G30 で policy 0本/purpose CHECK/index/provision 署名を能動 assert）
  "staff_shift_patterns", "staff_shift_wishes", "staff_shifts", "staff_shift_deadlines", // C層② 黒服シフト（mig0136・authenticated=SELECT のみ・select policy 4 本＝0135 形。G1/G2/G5 が .length で自動被覆）
  "check_customers", // ★mig0153（裁定305）: 伝票×顧客の中間表（check_seats 型・authenticated=SELECT のみ・cast 腕なし＝G1/G2/G5 が .length で自動被覆）
  "product_categories", // 純増⑦ 商品カテゴリマスタ（mig0063・authenticated=SELECT のみ＝products_select 同型パターン3。.length 参照ゆえ G1/G2/G5 が自動被覆＝教訓B）
];
const HELPERS = [
  "auth_org_id", "auth_role", "auth_store_id", "auth_cast_id",
  "auth_staff_can_register", "auth_staff_can_crm", "auth_staff_can_shift", // F3a-1（mig0022）
  "auth_staff_can_view_backs", // バック可視是正（mig0038）
  "auth_cast_can_register", // キャスト会計（mig0039・2段ゲート）
  "auth_kiosk_store_id", "auth_kiosk_org_id", // F4a キオスク（mig0043・kiosk_devices 起点＝auth_cast_id 同型）
  "auth_membership_id", // C層② 黒服本人＝memberships.id（mig0136・裁定 C②-9・authenticated 可＝G4/G4b 同型）
  "auth_staff_can_close", "auth_staff_can_reopen", // C層③ 締め／解除の個別付与（mig0138・auth_staff_can_shift 同型・authenticated 可）
  "staff_shift_can_manage", // C層② owner∨manager 自店判定（mig0136→0137 で authenticated に execute＝policy から呼ぶ関数は呼出者権限で評価される・教訓66）
  "auth_kiosk_register_store_id", "auth_kiosk_operator", // K レジ用キオスク（mig0056・register device 識別＋operator セッション解決＝G4/G4b が secdef/search_path/ACL を自動回帰）
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

  // G2b: SECURITY DEFINER 関数の EXECUTE スキーマ全体ガード（G1/G2 のテーブル版と同型・関数版）。
  //   ★由来: mig0069 が引数追加で set_product を「新署名」として作った際に revoke/grant を書かず、
  //     Supabase の既定 grant が付き直して anon/PUBLIC に EXECUTE が開いた（mig0072 で是正）。
  //     create or replace は ACL を保持するが、引数を足すと別署名＝新規作成となり既定 grant が付く。
  //     この class の事故を関数の増減へ自動追随する全数走査で恒久検知する（個別 assert の棚卸しに頼らない）。
  //   ★R2-11 改訂（裁定33/34・mig0099）: anon 面は「公開専用 SECURITY DEFINER の白名単」で開ける。
  //     token ゲートは引数で受ける DEFINER のみが安全——invoker＋anon select ポリシーは token を
  //     policy 式に束縛できず、テーブル grant を開けた瞬間に全行列挙可能になる（G2 も赤になる）。
  //     旧コメント「将来の anon 公開は invoker で」は本裁定で上書き。白名単は下の ANON_DEFINER_WHITELIST
  //     が正本＝live と機械同期（教訓21: 名簿は assert で同期を強制）。PUBLIC 側 assert は白名単でも不変。
  const ANON_DEFINER_WHITELIST = ["nox_receipt_public"]; // R2-11: 白名単1号（doc 版が要る時に2本目を裁定）
  {
    const r = await db.query(
      `select p.proname, p.oid::regprocedure as sig
       from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prosecdef
         and has_function_privilege('anon', p.oid, 'EXECUTE')
       order by 1`,
    );
    const names = r.rows.map((x) => x.proname as string);
    check(
      "G2b anon が EXECUTE できる SECURITY DEFINER 関数 = 白名単（nox_receipt_public）を除き0本",
      names.every((n) => ANON_DEFINER_WHITELIST.includes(n)),
      r.rows.map((x) => x.sig as string).join(", "),
    );
    // ★白名単の機械 assert（教訓21 同型＝診断 anon_defs / anon_defs_name と同式）:
    //   本数=白名単数 かつ 名前一致＝「白名単に載せたのに grant し忘れ」も「白名単外の漏れ」も赤にする。
    check(
      `G2b ★anon 白名単の live 同期（本数=${ANON_DEFINER_WHITELIST.length}・名前一致）`,
      names.length === ANON_DEFINER_WHITELIST.length
        && ANON_DEFINER_WHITELIST.every((n) => names.includes(n)),
      `live=[${names.join(",")}] whitelist=[${ANON_DEFINER_WHITELIST.join(",")}]`,
    );
  }
  {
    // PUBLIC への grant は has_function_privilege では引けない（public はロールではない）ため
    // aclexplode の grantee = 0 で見る。★proacl IS NULL＝ACL 未設定＝既定で PUBLIC 実行可なので同罪に数える
    //   （revoke を一度も当てていない関数がここに落ちる＝まさに 0069 の事故形）。
    const r = await db.query(
      `select p.oid::regprocedure as sig
       from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prosecdef
         and (p.proacl is null
              or exists (select 1 from aclexplode(p.proacl) a
                          where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
       order by 1`,
    );
    check(
      "G2b PUBLIC に EXECUTE がある SECURITY DEFINER 関数 = 0本（proacl 未設定＝既定 grant も同罪）",
      r.rowCount === 0,
      r.rows.map((x) => x.sig as string).join(", "),
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

  // G4d: mig0151（裁定287／289・2026-09-24）新 secdef RPC 3 本＝SECURITY DEFINER・search_path=public・EXECUTE は authenticated／service_role 保持・anon／PUBLIC 不在
  //   （G2b の全数走査に加え、名前で係留＝「revoke を書き忘れて既定 grant が付く」0069 型の再発を関数名で検知）
  {
    const NEW_0151 = ["staff_shift_cancel", "shift_open_periods_mine", "set_cast_guarantee",
      "punch_correction_request", "punch_correction_decide", "punch_correction_ack", "set_cast_employment", // ★0154（裁定294／295）: 新 secdef 4 本（同じ revoke／grant 形）
      "set_referrer", "check_referral_set", "check_referral_remove", "referral_payout_pay", "referral_payouts_pay_bulk", "referral_payouts_unpaid",
      "adv_issue_bulk", "transport_issue_bulk", // ★0157（裁定302／304）: 一括発行 2 本（同じ revoke／grant 形）
      "check_customer_add", "check_customer_remove", "check_line_set_customer", "check_customer_names", "bottle_keep_out", "customer_sales_summary", // ★0153（裁定305／307）: 公開 6 本 // ★0152（裁定298／299）: 公開 6 本（同じ revoke／grant 形）
      "cast_mynumber_discard", "cast_mynumber_discard_candidates", "customer_anonymize", "customer_anonymize_candidates", "kiosk_check_keeps", // ★0155（裁定309）: 公開 5 本（audit_purge は service 専用＝G4e）
      "daily_pay_issue", "daily_pays_of_run", "payroll_run_deduction_override_set", "payroll_run_deduction_override_clear", "payroll_run_deduction_overrides_of",
      "set_cast_quota", "reservation_request", "reservation_decide", "set_store_mine_settings", "notice_mark_read", "staff_pattern_disable", "staff_pattern_enable", // ★0160（裁定326＋追補1・2）: 公開 7 本（set_cast_norm_self は drop＝名前不在は anon-guard／cast-norm-self で係留）
      "payroll_shortfall_sync", "set_store_pay_time_basis", // ★0159（裁定324＋追補2・3）: 公開 2 本（shortfall_sync は非ゲート＝B(e)・set_store_pay_time_basis はゲート内蔵＝A8）
      "payroll_attentions_of", "payroll_attention_resolve", "transport_issue_self", "kiosk_transport_issue", "kiosk_punch_state", // ★0158（裁定315／317／319＋追補1）: 公開 5 本（punch_correction_apply は内部のまま＝G4c）
      "okuri_today_summary", "advances_open_balance", "cast_mynumber_discard_status", // ★0156（裁定309-6〜9／追補2）: 公開 8 本（okuri_default_of は内部＝G4c）
      "set_user_photo_updated_at", "clear_cast_photo", "clear_user_photo", "cast_contract_ack_needed", "cast_contract_ack_self"]; // ★0162（裁定329／326 追補7-6）: 公開 5 本（非ゲート・authenticated＋service_role）
    const r = await db.query(
      `select p.proname, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') as config,
              has_function_privilege('authenticated', p.oid, 'execute') as auth_ok,
              has_function_privilege('anon', p.oid, 'execute') as anon_ok,
              has_function_privilege('service_role', p.oid, 'execute') as svc_ok,
              exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_ok
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1) order by p.proname`,
      [NEW_0151],
    );
    check(`G4d 0151／0154／0152 新 RPC ${NEW_0151.length} 本が存在`, r.rowCount === NEW_0151.length, `got ${r.rowCount}: ${r.rows.map((x) => x.proname).join(", ")}`);
    for (const row of r.rows) {
      check(`G4d ${row.proname} SECURITY DEFINER＋search_path=public`, row.prosecdef === true && (row.config as string).includes("search_path=public"), row.config);
      check(`G4d ${row.proname} EXECUTE = authenticated／service_role 保持・anon／PUBLIC 不在`, row.auth_ok === true && row.svc_ok === true && !row.anon_ok && !row.public_ok, JSON.stringify([row.auth_ok, row.svc_ok, row.anon_ok, row.public_ok]));
    }
  }

  // G4e: mig0155（裁定309-2）audit_purge＝service_role 専用（billing_writable_of 0087 と同型）＝SECURITY DEFINER・search_path=public・EXECUTE は service_role のみ（authenticated／anon／PUBLIC 不在）
  {
    const r = await db.query(
      `select p.proname, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') as config,
              has_function_privilege('authenticated', p.oid, 'execute') as auth_ok,
              has_function_privilege('anon', p.oid, 'execute') as anon_ok,
              has_function_privilege('service_role', p.oid, 'execute') as svc_ok,
              exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_ok
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'audit_purge'`,
    );
    check("G4e 0155 audit_purge が 1 本存在", r.rowCount === 1, `got ${r.rowCount}`);
    const row = r.rows[0] ?? {};
    check("G4e audit_purge SECURITY DEFINER＋search_path=public", row.prosecdef === true && String(row.config ?? "").includes("search_path=public"), String(row.config));
    check("G4e audit_purge EXECUTE = service_role のみ（authenticated／anon／PUBLIC 不在）", row.svc_ok === true && row.auth_ok === false && !row.anon_ok && !row.public_ok, JSON.stringify([row.auth_ok, row.svc_ok, row.anon_ok, row.public_ok]));
  }

  // G4c: C層② 内部ヘルパー 4 本（mig0136・0137 で can_manage は G4/G4b 側へ）＋C層③ 内部ヘルパー 3 本（mig0138）＝SECURITY DEFINER・search_path 固定・4 ロール明示 revoke（authenticated/anon/service_role/public 不在）
  {
    const INTERNAL = ["staff_shift_biz_today", "staff_shift_gate", "staff_pattern_effective", "staff_shift_deadline_at", // ★0137: can_manage は HELPERS へ（policy から呼ぶ）
      "report_can_close", "report_can_reopen", "assert_day_open", // ★0138: C層③ 内部ヘルパー（RPC 本文からのみ・4 ロール revoke）
      "punch_correction_apply", // ★0154（裁定295-5）: 承認済み申請を punches へ写す内部ヘルパー（4 ロール revoke・grant なし）
      "referral_recalc", // ★0152（裁定286／298-1）: 紹介料の現在値を更新する内部ヘルパー（4 ロール revoke・grant なし）
      "okuri_default_of", // ★0156（裁定309-9／追補2 (a)）: 送り既定の純ヘルパー（打刻 3 本の本文からのみ・4 ロール revoke・grant なし）
      "punch_seq_check"]; // ★0161（裁定327＋追補1）: 打刻の順序検査＋前営業日の未閉鎖 in の注意行（打刻 3 本の本文からのみ・4 ロール revoke・grant なし）
    const r = await db.query(
      `select p.proname, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') as config,
              has_function_privilege('authenticated', p.oid, 'execute') as auth_ok,
              has_function_privilege('anon', p.oid, 'execute') as anon_ok,
              has_function_privilege('service_role', p.oid, 'execute') as svc_ok
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1) order by p.proname`,
      [INTERNAL],
    );
    check(`G4c 内部ヘルパー${INTERNAL.length}本が存在`, r.rowCount === INTERNAL.length, `got ${r.rowCount}`);
    for (const row of r.rows) {
      check(`G4c ${row.proname} SECURITY DEFINER＋search_path=public`, row.prosecdef === true && (row.config as string).includes("search_path=public"), row.config);
      check(`G4c ${row.proname} EXECUTE = authenticated/anon/service_role 不在（内部専用）`, !row.auth_ok && !row.anon_ok && !row.svc_ok, JSON.stringify([row.auth_ok, row.anon_ok, row.svc_ok]));
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
    // G8c: D1 給与確定解除 payroll_reopen（mig0060）= service_role のみ＋署名一意＋reopen_idem_key 列
    {
      const roles = await roleOf("payroll_reopen");
      const leaked = roles.filter((x) => ["anon", "authenticated", "public"].includes(x));
      check("G8 payroll_reopen EXECUTE = service_role のみ", roles.includes("service_role") && leaked.length === 0, `保持者: ${roles.join(", ") || "(なし)"}`);
      const sig = await db.query(
        `select pg_get_function_identity_arguments(p.oid) as args, p.prosecdef
           from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='payroll_reopen'`,
      );
      check(
        "G8 payroll_reopen 署名一意（4 uuid＋p_reason text・secdef＝mig0138）",
        sig.rowCount === 1 && sig.rows[0].args === "p_org_id uuid, p_actor uuid, p_run_id uuid, p_idem_key uuid, p_reason text" && sig.rows[0].prosecdef === true,
        JSON.stringify(sig.rows),
      );
      const col = await db.query(
        `select data_type, is_nullable from information_schema.columns
          where table_schema='public' and table_name='payroll_runs' and column_name='reopen_idem_key'`,
      );
      check(
        "G8 reopen_idem_key 列（uuid/nullable）",
        col.rowCount === 1 && col.rows[0].data_type === "uuid" && col.rows[0].is_nullable === "YES",
        JSON.stringify(col.rows),
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
    for (const fn of ["adv_issue", "adv_cancel", "transport_issue", "transport_cancel", "set_store_okuri_mode", "adv_issue_bulk", "transport_issue_bulk"]) { // ★0157: bulk 2 本
      const roles = await roleOf(fn);
      check(`G9 ${fn} EXECUTE = authenticated（anon 不在）`, roles.includes("authenticated") && !roles.includes("anon"), `保持者: ${roles.join(", ")}`);
    }
    // ★0157（裁定302-2／304）: idem_key 列（uuid・null 可）＋ partial unique index 2 本の名前と定義・列集合（advances 16／transport 15）
    {
      const ix = await db.query(`select indexname, indexdef from pg_indexes where schemaname='public' and indexname in ('advances_store_idem_uidx','transport_store_idem_uidx') order by 1`);
      check("G9 0157 unique index 2 本＝advances_store_idem_uidx／transport_store_idem_uidx（(store_id, idem_key) WHERE idem_key IS NOT NULL）", ix.rowCount === 2 && ix.rows.every((r) => /USING btree \(store_id, idem_key\) WHERE \(idem_key IS NOT NULL\)$/.test(r.indexdef as string)), ix.rows.map((r) => r.indexname).join(","));
      const cc = await db.query(`select table_name, count(*)::int n, bool_or(column_name='idem_key') has_idem from information_schema.columns where table_schema='public' and table_name in ('advances','transport') group by 1 order by 1`);
      check("G9 0157 列集合: advances 16 列／transport 15 列（idem_key を含む）", cc.rowCount === 2 && cc.rows[0].n === 16 && cc.rows[0].has_idem === true && cc.rows[1].n === 15 && cc.rows[1].has_idem === true, JSON.stringify(cc.rows));
      // ★0153（裁定305）: 列集合＝customers 18（+4）／bottle_keeps 15（+2）／check_lines 21（+customer_id）／check_customers 8・kind CHECK 11 値
      const c153 = await db.query(`select table_name, count(*)::int n from information_schema.columns where table_schema='public' and table_name in ('customers','bottle_keeps','check_lines','check_customers') group by 1 order by 1`);
      const n153 = Object.fromEntries(c153.rows.map((r) => [r.table_name, r.n]));
      check("G9 0153 列集合: customers 18／bottle_keeps 16（★0158: +check_line_id）／check_lines 21／check_customers 8", n153.customers === 18 && n153.bottle_keeps === 16 && n153.check_lines === 21 && n153.check_customers === 8, JSON.stringify(n153));
      const k153 = await db.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname='check_lines_kind_check'`);
      check("G9 0153 check_lines_kind_check＝11 値（+keep_out）", (k153.rows[0]?.d as string).includes("'keep_out'") && ((k153.rows[0]?.d as string).match(/::text/g) || []).length === 11, k153.rows[0]?.d);
      // ★0155（裁定309-3）: cast_sensitive 11 列（+mynumber_deleted_at／mynumber_deleted_by／mynumber_deletion_method・別表なし）
      const c155 = await db.query(`select count(*)::int n, bool_and(column_name in ('mynumber_deleted_at','mynumber_deleted_by','mynumber_deletion_method')) filter (where column_name like 'mynumber_del%') three from information_schema.columns where table_schema='public' and table_name='cast_sensitive'`);
      check("G9 0155 列集合: cast_sensitive 11（+廃棄記録 3 列）", c155.rows[0]?.n === 11 && c155.rows[0]?.three === true, JSON.stringify(c155.rows));
      // ★0156（裁定309-6／8／9）: 列集合＝punches 14（+okuri）／daily_pays 12／payroll_run_deduction_overrides 10・新表 2 の policy＝select 1 本ずつ・unique（run_id, cast_id, deduction_id）
      const c156 = await db.query(`select table_name, count(*)::int n from information_schema.columns where table_schema='public' and table_name in ('punches','daily_pays','payroll_run_deduction_overrides') group by 1 order by 1`);
      const n156 = Object.fromEntries(c156.rows.map((r) => [r.table_name, r.n]));
      check("G9 0156 列集合: punches 14（+okuri）／daily_pays 13（★0158: +settle_period）／payroll_run_deduction_overrides 10", n156.punches === 14 && n156.daily_pays === 13 && n156.payroll_run_deduction_overrides === 10, JSON.stringify(n156));
      const p156 = await db.query(`select tablename, policyname, cmd from pg_policies where schemaname='public' and tablename in ('daily_pays','payroll_run_deduction_overrides') order by 1`);
      check("G9 0156 新表 2 の policy＝select 1 本ずつ（daily_pays_select／payroll_run_deduction_overrides_select）", p156.rowCount === 2 && p156.rows.every((r) => r.cmd === "SELECT") && p156.rows.map((r) => r.policyname).join(",") === "daily_pays_select,payroll_run_deduction_overrides_select", JSON.stringify(p156.rows));
      const u156 = await db.query(`select conname from pg_constraint where conname in ('payroll_run_deduction_overrides_uniq','daily_pays_idem_key_key','daily_pays_net_ck') order by 1`);
      check("G9 0156 制約: overrides unique（run×cast×deduction）・daily_pays idem_key unique・net=gross−withholding CHECK", u156.rowCount === 3, u156.rows.map((r) => r.conname).join(","));
      // ★0158（裁定312／315／317／319・起票87）: payroll_attentions 10 列・policy＝select 1 本（owner∨manager 自店）・kind CHECK 1 値・追加 3 列は null 可・transport 15 列のまま
      const c158 = await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name='payroll_attentions' order by ordinal_position`);
      check("G9 0158 列集合: payroll_attentions 10 列（id／org_id／store_id／cast_id／run_id／kind／detail／created_at／resolved_at／resolved_by）", c158.rows.map((r) => r.column_name).join(",") === "id,org_id,store_id,cast_id,run_id,kind,detail,created_at,resolved_at,resolved_by", c158.rows.map((r) => r.column_name).join(","));
      const p158 = await db.query(`select policyname, cmd, qual from pg_policies where schemaname='public' and tablename='payroll_attentions'`);
      check("G9 0158 payroll_attentions の policy＝select 1 本（owner∨manager 自店・cast／staff は 0 行）", p158.rowCount === 1 && p158.rows[0].policyname === "payroll_attentions_select" && p158.rows[0].cmd === "SELECT" && p158.rows[0].qual === "((org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR ((auth_role() = 'manager'::text) AND (store_id = auth_store_id()))))", JSON.stringify(p158.rows));
      const k158 = await db.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname='payroll_attentions_kind_check'`);
      check("G9 0158 payroll_attentions_kind_check＝2 値（post_finalize_punch／open_punch・★0161 で +1）", k158.rows[0]?.d === "CHECK ((kind = ANY (ARRAY['post_finalize_punch'::text, 'open_punch'::text])))", k158.rows[0]?.d);
      const n158 = await db.query(`select table_name || '.' || column_name c, is_nullable from information_schema.columns where table_schema='public' and (table_name, column_name) in (('daily_pays','settle_period'),('bottle_keeps','check_line_id'),('transport','created_by')) order by 1`);
      check("G9 0158 列 3（bottle_keeps.check_line_id／daily_pays.settle_period／transport.created_by）＝すべて null 可", n158.rowCount === 3 && n158.rows.every((r) => r.is_nullable === "YES"), JSON.stringify(n158.rows));
      const t158 = await db.query(`select count(*)::int n from information_schema.columns where table_schema='public' and table_name='transport'`);
      check("G9 0158 transport 15 列のまま（created_by は null 可に変えただけ）", t158.rows[0]?.n === 15, String(t158.rows[0]?.n));
      // ★0160（裁定326／追補1・2・起票95／96）: 列集合＝cast_quotas 11／cast_notice_reads 5／reservations 21（+4）／shift_wishes 13（+kind）／staff_shift_patterns 11（+disabled_from）・
      //   新表 2 の policy＝select 1 本ずつ・reservations_status_chk に pending／rejected・shift_wishes_hm_kind_ck（work＝時刻必須 is not null＝教訓100／off＝null）・cast_quotas_uq
      const c160 = await db.query(`select table_name, count(*)::int n from information_schema.columns where table_schema='public' and table_name in ('cast_quotas','cast_notice_reads','reservations','shift_wishes','staff_shift_patterns') group by 1 order by 1`);
      const n160 = Object.fromEntries(c160.rows.map((r) => [r.table_name, r.n]));
      check("G9 0160 列集合: cast_quotas 11／cast_notice_reads 5／reservations 21／shift_wishes 13／staff_shift_patterns 11", n160.cast_quotas === 11 && n160.cast_notice_reads === 5 && n160.reservations === 21 && n160.shift_wishes === 13 && n160.staff_shift_patterns === 11, JSON.stringify(n160));
      const r160 = await db.query(`select column_name, is_nullable from information_schema.columns where table_schema='public' and table_name='reservations' and column_name in ('requested_by_cast','rejected_reason','decided_by','decided_at') order by 1`);
      check("G9 0160 reservations の追加 4 列（decided_at／decided_by／rejected_reason／requested_by_cast）＝すべて null 可", r160.rowCount === 4 && r160.rows.every((r) => r.is_nullable === "YES"), JSON.stringify(r160.rows));
      const p160 = await db.query(`select tablename, policyname, cmd from pg_policies where schemaname='public' and tablename in ('cast_quotas','cast_notice_reads') order by 1`);
      check("G9 0160 新表 2 の policy＝select 1 本ずつ（cast_notice_reads_select／cast_quotas_select）", p160.rowCount === 2 && p160.rows.every((r) => r.cmd === "SELECT") && p160.rows.map((r) => r.policyname).join(",") === "cast_notice_reads_select,cast_quotas_select", JSON.stringify(p160.rows));
      const k160 = await db.query(`select conname, pg_get_constraintdef(oid) d from pg_constraint where conname in ('reservations_status_chk','shift_wishes_hm_kind_ck','shift_wishes_kind_check','cast_quotas_uq','cast_quotas_month_first_ck') order by 1`);
      const d160 = Object.fromEntries(k160.rows.map((r) => [r.conname, r.d as string]));
      check("G9 0160 制約 5: status_chk に pending／rejected・hm_kind_ck に is not null（教訓100）・kind_check work|off・cast_quotas unique（store×cast×month）・月初 CHECK",
        k160.rowCount === 5 && d160.reservations_status_chk.includes("'pending'") && d160.reservations_status_chk.includes("'rejected'")
        && d160.shift_wishes_hm_kind_ck.includes("start_hm IS NOT NULL") && d160.shift_wishes_hm_kind_ck.includes("end_hm IS NOT NULL") && d160.shift_wishes_hm_kind_ck.includes("'off'")
        && d160.shift_wishes_kind_check.includes("'work'") && d160.cast_quotas_uq === "UNIQUE (store_id, cast_id, month)" && d160.cast_quotas_month_first_ck.includes("day"), JSON.stringify(d160));
      const w160 = await db.query(`select column_name, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='shift_wishes' and column_name in ('kind','start_hm','end_hm') order by 1`);
      const wm = Object.fromEntries(w160.rows.map((r) => [r.column_name, r]));
      check("G9 0160 shift_wishes: kind not null default 'work'・start_hm／end_hm は null 可（off 希望）", w160.rowCount === 3 && wm.kind.is_nullable === "NO" && String(wm.kind.column_default).includes("'work'") && wm.start_hm.is_nullable === "YES" && wm.end_hm.is_nullable === "YES", JSON.stringify(w160.rows));
      // ★0161（裁定327＋追補1）: payroll_attentions の run_id null 可（FK on delete cascade 不変）・open_punch_ck（detail に punch_id／biz_date）・部分 unique payroll_attentions_open_punch_uq（kind='open_punch'）・10 列のまま
      const n161 = await db.query(`select is_nullable from information_schema.columns where table_schema='public' and table_name='payroll_attentions' and column_name='run_id'`);
      const k161 = await db.query(`select conname, pg_get_constraintdef(oid) d from pg_constraint where conname in ('payroll_attentions_open_punch_ck','payroll_attentions_run_id_fkey') order by 1`);
      const i161 = await db.query(`select indexdef from pg_indexes where schemaname='public' and indexname='payroll_attentions_open_punch_uq'`);
      const c161 = await db.query(`select count(*)::int n from information_schema.columns where table_schema='public' and table_name='payroll_attentions'`);
      check("G9 0161 payroll_attentions: run_id null 可・FK on delete cascade 不変・open_punch_ck（punch_id／biz_date）・部分 unique index（kind='open_punch'）・10 列のまま",
        n161.rows[0]?.is_nullable === "YES" && k161.rowCount === 2 && (k161.rows[0].d as string).includes("punch_id") && (k161.rows[0].d as string).includes("biz_date") && (k161.rows[1].d as string).includes("ON DELETE CASCADE")
        && i161.rowCount === 1 && /UNIQUE/.test(i161.rows[0].indexdef as string) && /kind = 'open_punch'/.test(i161.rows[0].indexdef as string) && c161.rows[0].n === 10, JSON.stringify([n161.rows, k161.rows, i161.rows, c161.rows]));
      // ★0162（裁定329／326 追補7-6・329 追補1）: users.photo_updated_at null 可／cast_contract_acks 5 列・PK (cast_id, contract_rev)・FK cascade 3・index 1・policy select 1／
      //   storage cast-photos policy 4 本（insert／update／delete に cast 腕＋users 腕 'u_'＋is_demo 句・select は org フォルダのみ＝不触）
      const u162 = await db.query(`select is_nullable, data_type from information_schema.columns where table_schema='public' and table_name='users' and column_name='photo_updated_at'`);
      const c162 = await db.query(`select count(*)::int n from information_schema.columns where table_schema='public' and table_name='cast_contract_acks'`);
      const k162 = await db.query(`select contype, pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.cast_contract_acks'::regclass order by contype, d`);
      const p162 = await db.query(`select policyname, cmd from pg_policies where schemaname='public' and tablename='cast_contract_acks'`);
      const i162 = await db.query(`select count(*)::int n from pg_indexes where schemaname='public' and indexname='cast_contract_acks_store_rev_idx'`);
      check("G9 0162 users.photo_updated_at＝timestamptz null 可／cast_contract_acks 5 列・PK (cast_id, contract_rev)・FK on delete cascade 3・index 1・policy select 1",
        u162.rowCount === 1 && u162.rows[0].is_nullable === "YES" && u162.rows[0].data_type === "timestamp with time zone" && c162.rows[0].n === 5
        && k162.rows.filter((r) => r.contype === "p").length === 1 && (k162.rows.find((r) => r.contype === "p")?.d as string) === "PRIMARY KEY (cast_id, contract_rev)"
        && k162.rows.filter((r) => r.contype === "f" && /ON DELETE CASCADE/.test(r.d as string)).length === 3 && i162.rows[0].n === 1
        && p162.rowCount === 1 && p162.rows[0].policyname === "cast_contract_acks_select" && p162.rows[0].cmd === "SELECT", JSON.stringify([u162.rows, c162.rows, k162.rows, p162.rows]));
      const s162 = await db.query(`select policyname, cmd, strpos(coalesce(qual,'') || coalesce(with_check,''), 'u_') > 0 users_arm, strpos(coalesce(qual,'') || coalesce(with_check,''), 'is_demo') > 0 demo_arm, strpos(coalesce(qual,'') || coalesce(with_check,''), 'auth_cast_id') > 0 cast_arm from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'cast_photos_%' order by 1`);
      const sm = Object.fromEntries(s162.rows.map((r) => [r.policyname, r]));
      check("G9 0162 storage cast-photos policy 4 本: insert／update／delete＝cast 腕＋users 腕（u_）＋is_demo 句・select＝org フォルダのみ（腕なし＝0162 不触）",
        s162.rowCount === 4 && ["cast_photos_insert", "cast_photos_update", "cast_photos_delete"].every((n) => sm[n] && sm[n].users_arm === true && sm[n].demo_arm === true && sm[n].cast_arm === true)
        && sm.cast_photos_delete.cmd === "DELETE" && sm.cast_photos_select && sm.cast_photos_select.users_arm === false && sm.cast_photos_select.demo_arm === false && sm.cast_photos_select.cast_arm === false, JSON.stringify(s162.rows));
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
    // G23: F3f 申告導線（mig0048）— cast_open_checks の EXECUTE ACL。
    //   最小開示 RPC（自店 open 伝票の席名/開始時刻のみ）＝cast セルフ専用。返却列の金額系不在は段29-25 で実測。
    {
      const roles = await roleOf("cast_open_checks");
      check("G23 cast_open_checks EXECUTE = authenticated（anon/public 不在）",
        roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
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

    // G24: 台帳#40 案C（mig0049/0050）— 原価を product_costs へ分離し products.cost を drop。
    //   cast/staff には列そのものが存在しない＝select("*") でも導出不能（構造的非開示）。
    //   ★署名一意性を先に assert する（G22 と同型）: roleOf は proname 引きのため、旧署名が残ると
    //   ACL が2署名ぶん混ざって静かに通る。set_product は #40 当時 12引数据置＝create or replace で置換した。
    //   ★引数はその後 mig0062(p_reorder_point)・0063(p_category_id)・0069(p_back_exempt_from_split)で 15 へ。
    //     0071 が旧 v14 を drop 済み＝ここが assert する「1本のみ」は署名一意性の担保として現役。
    {
      const r = await db.query(
        `select pg_get_function_identity_arguments(oid) as args from pg_proc
         where pronamespace = 'public'::regnamespace and proname = 'set_product'`,
      );
      const argsList = r.rows.map((x) => x.args as string);
      check("G24 set_product = 15引数1本のみ（mig0071 で旧 v14 drop 済＝オーバーロード無し）",
        r.rowCount === 1 && argsList[0].includes("p_cost"), JSON.stringify(argsList));
      const roles = await roleOf("set_product");
      check("G24 set_product EXECUTE = authenticated（anon/public 不在）",
        roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
    }
    // products.cost の不在＝#40 のスキーマガード（将来の列復活を機械検知する）
    {
      const r = await db.query(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'products' and column_name = 'cost'`,
      );
      check("G24 products.cost 列が存在しない（原価は product_costs へ分離＝#40）", r.rowCount === 0);
      const c = await db.query(
        `select conname from pg_constraint where conname = 'products_cost_check'`,
      );
      check("G24 products_cost_check 消滅（drop column で自動消滅＝CASCADE 不要だった）", c.rowCount === 0);
    }
    // product_costs の policy 逐語（polqual と polroles の両方＝CLAUDE.md 規約）
    {
      const r = await db.query(
        `select polname, polroles::regrole[]::text[] as roles, pg_get_expr(polqual, polrelid) as qual
         from pg_policy where polrelid = 'public.product_costs'::regclass`,
      );
      check("G24 product_costs ポリシー = product_costs_select 1本のみ（書込 policy なし）",
        r.rowCount === 1 && r.rows[0].polname === "product_costs_select",
        r.rows.map((x) => x.polname).join(", ") || "(なし)");
      const roles = (r.rows[0]?.roles ?? []) as string[];
      check("G24 product_costs policy roles = {authenticated} 逐語",
        roles.length === 1 && roles[0] === "authenticated", roles.join(", ") || "(なし)");
      const qual = (r.rows[0]?.qual as string | undefined) ?? "";
      check("G24 product_costs policy qual = owner ∨（manager ∧ 自店）逐語",
        qual.includes("org_id = auth_org_id()") && qual.includes("auth_role() = 'owner'")
        && qual.includes("auth_role() = 'manager'") && qual.includes("store_id = auth_store_id()"),
        qual || "(missing)");
    }
    // grant 実体＝authenticated:SELECT の単独。DML 列挙 revoke が取りこぼす REFERENCES/TRIGGER の不在も
    // ここで見る（0049 で実際に踏み 0050 で補正＝恒久回帰）。
    {
      const r = await db.query(
        `select grantee, privilege_type from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'product_costs'
           and grantee in ('anon', 'authenticated', 'public')
         order by grantee, privilege_type`,
      );
      const got = r.rows.map((x) => `${x.grantee}:${x.privilege_type}`);
      check("G24 product_costs grant = authenticated:SELECT のみ（REFERENCES/TRIGGER 不在＝mig0050 補正）",
        got.length === 1 && got[0] === "authenticated:SELECT", got.join(", ") || "(なし)");
    }

    // G25: E1 料金設定（mig0051）— stores 料金列7本の CHECK 逐語＋set_store_pricing。
    //   defaults 現行実効値と同値＝golden 不変の構造保証（設計 §1）。round_unit は上限 10000
    //   つき（相談役注記採用＝誤入力で全会計が極端丸めになる事故を構造で止める）。
    {
      const r = await db.query(
        `select conname, pg_get_constraintdef(oid) as def from pg_constraint
         where conrelid = 'public.stores'::regclass and contype = 'c'
           and conname like 'stores_%_check' order by conname`,
      );
      const defs = new Map(r.rows.map((x) => [x.conname as string, x.def as string]));
      const expects: Array<[string, string]> = [
        ["stores_hon_fee_check", "CHECK ((hon_fee >= 0))"],
        ["stores_jonai_fee_check", "CHECK ((jonai_fee >= 0))"],
        ["stores_dohan_fee_check", "CHECK ((dohan_fee >= 0))"],
        ["stores_service_rate_check", "CHECK (((service_rate >= 0) AND (service_rate <= 100)))"],
        ["stores_card_tax_rate_check", "CHECK (((card_tax_rate >= 0) AND (card_tax_rate <= 100)))"],
        ["stores_round_unit_check", "CHECK (((round_unit >= 1) AND (round_unit <= 10000)))"],
        ["stores_round_mode_check", "CHECK ((round_mode = ANY (ARRAY['up'::text, 'down'::text, 'round'::text])))"],
      ];
      // 2026-07-21 B4: count→named スコープ化（無関係列とのカップリング解除）。stores へ B4 の
      //   時間制6 CHECK が増えても E1 の7本の逐語 assert は不変（B4 分は G26 が専任）。裁定台帳 裁定9。
      const e1Names = expects.map(([n]) => n);
      check("G25 stores 料金 CHECK = E1 の7本", e1Names.every((n) => defs.has(n)), [...defs.keys()].join(", "));
      for (const [name, want] of expects) {
        check(`G25 ${name} 逐語`, defs.get(name) === want, defs.get(name) ?? "(missing)");
      }
      const sig = await db.query(
        `select pg_get_function_identity_arguments(oid) as args, pronargs from pg_proc
         where pronamespace = 'public'::regnamespace and proname = 'set_store_pricing'`,
      );
      check("G25 set_store_pricing = 8引数1本のみ（署名一意）",
        sig.rowCount === 1 && sig.rows[0].pronargs === 8, JSON.stringify(sig.rows.map((x) => x.args)));
      const roles = await roleOf("set_store_pricing");
      check("G25 set_store_pricing EXECUTE = authenticated（anon/public 不在）",
        roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
    }

    // G26: B4 時間料金自動計算（mig0052）— stores 時間制6 CHECK 逐語＋checks スナップ5 CHECK 逐語＋
    //   check_lines 部分ユニークインデックス逐語＋新 RPC 2本の署名一意＋ACL。逐語は live 正規化表現
    //   （between→>= AND <=・in→= ANY(ARRAY[]) 展開）。G22/G24/G25 と同型＝旧署名残置で ACL が
    //   2署名混ざる事故を署名一意 assert で先に潰す。
    {
      const rs = await db.query(
        `select conname, pg_get_constraintdef(oid) as def from pg_constraint
         where conrelid = 'public.stores'::regclass and contype = 'c' order by conname`,
      );
      const sdefs = new Map(rs.rows.map((x) => [x.conname as string, x.def as string]));
      const storeExpects: Array<[string, string]> = [
        ["stores_set_min_check", "CHECK (((set_min >= 1) AND (set_min <= 1440)))"],
        ["stores_set_fee_check", "CHECK ((set_fee >= 0))"],
        ["stores_ext_min_check", "CHECK (((ext_min >= 1) AND (ext_min <= 1440)))"],
        ["stores_ext_fee_check", "CHECK ((ext_fee >= 0))"],
        ["stores_time_mode_check", "CHECK ((time_mode = ANY (ARRAY['manual'::text, 'auto'::text])))"],
        ["stores_time_per_check", "CHECK ((time_per = ANY (ARRAY['table'::text, 'person'::text])))"],
      ];
      for (const [name, want] of storeExpects) {
        check(`G26 ${name} 逐語`, sdefs.get(name) === want, sdefs.get(name) ?? "(missing)");
      }
      const rc = await db.query(
        `select conname, pg_get_constraintdef(oid) as def from pg_constraint
         where conrelid = 'public.checks'::regclass and contype = 'c' order by conname`,
      );
      const cdefs = new Map(rc.rows.map((x) => [x.conname as string, x.def as string]));
      const checkExpects: Array<[string, string]> = [
        ["checks_set_min_check", "CHECK ((set_min >= 1))"],
        ["checks_set_fee_check", "CHECK ((set_fee >= 0))"],
        ["checks_ext_min_check", "CHECK ((ext_min >= 1))"],
        ["checks_ext_fee_check", "CHECK ((ext_fee >= 0))"],
        ["checks_time_per_check", "CHECK ((time_per = ANY (ARRAY['table'::text, 'person'::text])))"],
      ];
      for (const [name, want] of checkExpects) {
        check(`G26 ${name} 逐語`, cdefs.get(name) === want, cdefs.get(name) ?? "(missing)");
      }
      const ix = await db.query(
        `select indexdef from pg_indexes where schemaname = 'public' and indexname = 'check_lines_one_time_auto'`,
      );
      // ★mig0089（段48）2列 → ★mig0097（段54 張り替え）: ブロック行化＝(check_id, fee_kind, block_no) の3列部分ユニーク
      check("G26 check_lines_one_time_auto 部分ユニーク逐語（0097 ブロック行版・3列）",
        ix.rowCount === 1 && ix.rows[0].indexdef ===
          "CREATE UNIQUE INDEX check_lines_one_time_auto ON public.check_lines USING btree (check_id, fee_kind, block_no) WHERE time_auto",
        ix.rows[0]?.indexdef ?? "(missing)");
      const s1 = await db.query(
        `select pg_get_function_identity_arguments(oid) as args, pronargs from pg_proc
         where pronamespace = 'public'::regnamespace and proname = 'set_store_time_pricing'`,
      );
      check("G26 set_store_time_pricing = 7引数1本のみ（署名一意）",
        s1.rowCount === 1 && s1.rows[0].pronargs === 7, JSON.stringify(s1.rows.map((x) => x.args)));
      const r1 = await roleOf("set_store_time_pricing");
      check("G26 set_store_time_pricing EXECUTE = authenticated（anon/public 不在）",
        r1.includes("authenticated") && !r1.includes("anon") && !r1.includes("public"),
        `保持者: ${r1.join(", ") || "(なし)"}`);
      const s2 = await db.query(
        `select pg_get_function_identity_arguments(oid) as args, pronargs from pg_proc
         where pronamespace = 'public'::regnamespace and proname = 'check_time_charge_apply'`,
      );
      check("G26 check_time_charge_apply = 1引数1本のみ（署名一意）",
        s2.rowCount === 1 && s2.rows[0].pronargs === 1, JSON.stringify(s2.rows.map((x) => x.args)));
      const r2 = await roleOf("check_time_charge_apply");
      check("G26 check_time_charge_apply EXECUTE = authenticated（anon/public 不在）",
        r2.includes("authenticated") && !r2.includes("anon") && !r2.includes("public"),
        `保持者: ${r2.join(", ") || "(なし)"}`);
    }

    // G27: B1/B2 相席・席移動（mig0053）— check_seats の RLS/policy 逐語＋占有 unique index 逐語＋
    //   grant 実体（authenticated:SELECT のみ）＋新 RPC 3本の署名一意＋ACL。TABLES への追加で
    //   G1/G2/G5 は自動被覆済み＝ここは占有構造と RPC 面を能動 assert。
    {
      // RLS 有効＋SELECT ポリシー1本（checks_select 逐語ミラー）
      const rls = await db.query(
        `select relrowsecurity from pg_class where oid = 'public.check_seats'::regclass`,
      );
      check("G27 check_seats RLS 有効", rls.rows[0]?.relrowsecurity === true, JSON.stringify(rls.rows));
      const pol = await db.query(
        `select polname, polcmd from pg_policy where polrelid = 'public.check_seats'::regclass`,
      );
      check("G27 check_seats ポリシー = SELECT 1本（check_seats_select）",
        pol.rowCount === 1 && pol.rows[0].polcmd === "r" && pol.rows[0].polname === "check_seats_select",
        pol.rows.map((x) => `${x.polname}:${x.polcmd}`).join(", "));
      // 占有 unique index 逐語（追加席は同時1伝票の構造保証）
      const ix = await db.query(
        `select indexdef from pg_indexes where schemaname = 'public' and indexname = 'check_seats_seat_occupancy'`,
      );
      check("G27 check_seats_seat_occupancy unique index 逐語",
        ix.rowCount === 1 && ix.rows[0].indexdef ===
          "CREATE UNIQUE INDEX check_seats_seat_occupancy ON public.check_seats USING btree (seat_id)",
        ix.rows[0]?.indexdef ?? "(missing)");
      // grant 実体（authenticated:SELECT のみ＝REFERENCES/TRIGGER 不在＝mig0049→0050 教訓）
      const g = await db.query(
        `select grantee, privilege_type from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'check_seats' and grantee = 'authenticated'
         order by privilege_type`,
      );
      const got = g.rows.map((x) => `${x.grantee}:${x.privilege_type}`);
      check("G27 check_seats grant = authenticated:SELECT のみ（REFERENCES/TRIGGER 不在）",
        got.length === 1 && got[0] === "authenticated:SELECT", got.join(", ") || "(なし)");
      // 新 RPC 3本の署名一意＋ACL
      for (const fn of ["check_move_seat", "check_add_seat", "check_remove_seat"]) {
        const sig = await db.query(
          `select pg_get_function_identity_arguments(oid) as args, pronargs from pg_proc
           where pronamespace = 'public'::regnamespace and proname = $1`,
          [fn],
        );
        check(`G27 ${fn} = 2引数1本のみ（署名一意）`,
          sig.rowCount === 1 && sig.rows[0].pronargs === 2, JSON.stringify(sig.rows.map((x) => x.args)));
        const roles = await roleOf(fn);
        check(`G27 ${fn} EXECUTE = authenticated（anon/public 不在）`,
          roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
          `保持者: ${roles.join(", ") || "(なし)"}`);
      }
    }

    // G28: A4 月報（mig0054）— get_store_nom_counts の署名一意（3引数1本）＋返り列3本＋ACL。
    //   読取専用 RPC（checks/check_nominations SELECT のみ）＝会計非改修・daily_report_aggregate 非改修。
    {
      const sig = await db.query(
        `select pg_get_function_identity_arguments(oid) as args, pronargs, prosecdef, provolatile,
                pg_get_function_result(oid) as ret
         from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_store_nom_counts'`,
      );
      check("G28 get_store_nom_counts = 3引数1本のみ（署名一意・secdef・STABLE）",
        sig.rowCount === 1 && sig.rows[0].pronargs === 3 && sig.rows[0].prosecdef === true
        && sig.rows[0].provolatile === "s", JSON.stringify(sig.rows.map((x) => x.args)));
      check("G28 返り列 = hon_count/jonai_count/dohan_count 逐語",
        sig.rows[0]?.ret === "TABLE(hon_count integer, jonai_count integer, dohan_count integer)",
        sig.rows[0]?.ret ?? "(missing)");
      const roles = await roleOf("get_store_nom_counts");
      check("G28 get_store_nom_counts EXECUTE = authenticated（anon/public 不在）",
        roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
    }

    // G29: B6 売掛回収（mig0055）— 新 RPC 2本＋空フック2本の EXECUTE ACL＋ar_collections の policy/grant。
    //   ar_collections の RLS 有効・grant 面（authenticated=SELECT のみ・anon 0）は TABLES 配列追加で
    //   G1/G2/G5 が自動回帰＝ここは policy 1本＋grant 実体＋RPC/フック ACL を能動 assert。
    {
      // 公開 RPC 2本＝authenticated 保持・anon/public 不在
      for (const fn of ["receivable_collect", "receivable_mark_deduct"]) {
        const roles = await roleOf(fn);
        check(`G29 ${fn} EXECUTE = authenticated（anon/public 不在）`,
          roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
          `保持者: ${roles.join(", ") || "(なし)"}`);
      }
      // 空フック2本＝内部専用（anon/authenticated/service_role/public 不在＝postgres のみ＝差し替え1箇所）
      for (const fn of ["consent_ok", "ar_policy_ok"]) {
        const roles = await roleOf(fn);
        const leaked = roles.filter((x) => ["anon", "authenticated", "service_role", "public"].includes(x));
        check(`G29 ${fn} EXECUTE = 内部専用（4ロール revoke・postgres のみ）`,
          leaked.length === 0, `保持者: ${roles.join(", ") || "(postgres のみ)"}`);
      }
      // ar_collections policy = ar_collections_select（SELECT）1本のみ（書込 policy なし＝RPC 経由）
      const acp = await db.query(
        `select policyname, cmd from pg_policies where schemaname='public' and tablename='ar_collections'`,
      );
      check("G29 ar_collections ポリシー = ar_collections_select（SELECT）1本のみ",
        acp.rowCount === 1 && acp.rows[0].cmd === "SELECT" && acp.rows[0].policyname === "ar_collections_select",
        acp.rows.map((x) => `${x.policyname}:${x.cmd}`).join(", "));
      // ar_collections grant = authenticated:SELECT のみ（INSERT/UPDATE/DELETE/REFERENCES/TRIGGER 不在＝mig0049→0050 教訓）
      const acg = await db.query(
        `select grantee, privilege_type from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'ar_collections'
           and grantee in ('anon', 'authenticated', 'public')
         order by grantee, privilege_type`,
      );
      const acGot = acg.rows.map((x) => `${x.grantee}:${x.privilege_type}`);
      check("G29 ar_collections grant = authenticated:SELECT のみ（REFERENCES/TRIGGER 不在）",
        acGot.length === 1 && acGot[0] === "authenticated:SELECT", acGot.join(", ") || "(なし)");
    }

    // G30: レジ用キオスク 基盤層（mig0056）— 新 RPC 4本 ACL＋deny-all 2表 policy 0本＋purpose CHECK＋
    //   index 差し替え（旧不在/新逐語）＋kiosk_sessions 部分ユニーク逐語＋provision 4引数一意。
    //   auth_kiosk_register_store_id/auth_kiosk_operator の属性/ACL は HELPERS 追加で G4/G4b が自動回帰。
    //   staff_pin/kiosk_sessions の RLS 有効・grant 0 は TABLES 追加で G1/G2/G5 が自動回帰＝ここは policy 0本を能動 assert。
    for (const fn of ["kiosk_login", "kiosk_logout", "kiosk_operator_list", "set_staff_pin"]) {
      const roles = await roleOf(fn);
      check(`G30 ${fn} EXECUTE = authenticated（anon/public 不在）`,
        roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
        `保持者: ${roles.join(", ") || "(なし)"}`);
    }
    {
      const r = await db.query(
        `select tablename, count(*) as n from pg_policies
         where schemaname = 'public' and tablename in ('staff_pin','kiosk_sessions')
         group by tablename`,
      );
      check("G30 staff_pin/kiosk_sessions policy 0本（deny-all＝RPC 専任）", r.rowCount === 0, JSON.stringify(r.rows));
    }
    {
      const r = await db.query(
        `select pg_get_constraintdef(oid) as def from pg_constraint
         where conrelid = 'public.kiosk_devices'::regclass and conname = 'kiosk_devices_purpose_check'`,
      );
      const def = (r.rows[0]?.def as string | undefined) ?? "";
      check("G30 kiosk_devices_purpose_check = punch/register の2値",
        def.includes("'punch'") && def.includes("'register'") && (def.match(/'/g) ?? []).length === 4, def || "(missing)");
    }
    {
      const old = await db.query(
        `select 1 from pg_indexes where schemaname = 'public' and indexname = 'kiosk_devices_one_active_per_store_idx'`,
      );
      check("G30 旧 kiosk_devices_one_active_per_store_idx 不在（0056 で drop）", old.rowCount === 0);
      const nw = await db.query(
        `select indexdef from pg_indexes where schemaname = 'public' and indexname = 'kiosk_devices_one_active_per_store_purpose_idx'`,
      );
      check("G30 kiosk_devices_one_active_per_store_purpose_idx 逐語（(store_id, purpose) WHERE is_active）",
        nw.rowCount === 1 && nw.rows[0].indexdef ===
          "CREATE UNIQUE INDEX kiosk_devices_one_active_per_store_purpose_idx ON public.kiosk_devices USING btree (store_id, purpose) WHERE is_active",
        nw.rows[0]?.indexdef ?? "(missing)");
      const ks = await db.query(
        `select indexdef from pg_indexes where schemaname = 'public' and indexname = 'kiosk_sessions_one_active_per_device'`,
      );
      check("G30 kiosk_sessions_one_active_per_device 部分ユニーク逐語（(device_id) WHERE (ended_at IS NULL)）",
        ks.rowCount === 1 && ks.rows[0].indexdef ===
          "CREATE UNIQUE INDEX kiosk_sessions_one_active_per_device ON public.kiosk_sessions USING btree (device_id) WHERE (ended_at IS NULL)",
        ks.rows[0]?.indexdef ?? "(missing)");
    }
    {
      const r = await db.query(
        `select pg_get_function_identity_arguments(oid) as args from pg_proc
         where pronamespace = 'public'::regnamespace and proname = 'kiosk_provision'`,
      );
      const argsList = r.rows.map((x) => x.args as string);
      check("G30 kiosk_provision = 4引数1本のみ（旧3引数 drop 済＝オーバーロード無し）",
        r.rowCount === 1 && argsList[0] === "p_auth_user_id uuid, p_store_id uuid, p_label text, p_purpose text",
        JSON.stringify(argsList));
    }

    // G31: レジ用キオスク arms＋gate（mig0057/0058）— kiosk 腕の集合一致＋check_void 非対象＋
    //   ★ゲート fail-closed 逐語（0058）。人間セッションの runtime では検出不能な回帰（fail-open への逆行）を
    //   prosrc で機械検知する＝再発防止の本体。prokind='f' で pg_get_functiondef の集約関数エラーを回避。
    //   除外リスト＝helper 自身・kiosk_operator_list（WHERE 用途）・0059 read layer 2本（G32 専任）＝
    //   G31 の意味論は「0057 write-arm 集合」のまま不変（count 棚卸し 2026-07-22・期待値 12/13 は書換えない）。
    //   ★2026-07-31 更新: mig0066 が新設したトリガ関数 drink_claims_on_line_delete が actor 解決で
    //     auth_kiosk_operator() を coalesce するため operator 側のみ 13→14。増分の正体を特定したうえでの
    //     更新であり、根拠なく数字を合わせたものではない（「12/13 は書換えない」の原則自体は維持＝
    //     write-arm 集合を測る register helper 側 12本は不変・こちらは1本も動かしていない）。
    //   ★2026-08-07 更新: mig0084 が check_lines への INSERT 経路として新設した check_shimei_add /
    //     check_dohan_add の2本が kiosk 腕（0057 の5腕逐語＋0058 fail-closed ゲート）を持つため
    //     register 12→14・operator 14→16・fail-closed 12→14。設計書 v1.2 §3-2「kiosk 経路は既存
    //     kiosk RPC の型に従う」どおりの正当な増分で、段44(7) が kiosk セッションの runtime も実測。
    {
      const reg = await db.query(
        `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
         where ns.nspname = 'public' and p.prokind = 'f'
           and pg_get_functiondef(p.oid) ilike '%auth_kiosk_register_store_id()%'
           and p.proname not in ('auth_kiosk_register_store_id','kiosk_operator_list',
                                 'kiosk_register_state','kiosk_check_detail')`,
      );
      // ★mig0148（裁定272・2026-09-18）: check_add_referral（check_add_line の冒頭〜role 判定を逐語＝kiosk 腕あり）で 18→19・20→21・18→19。
      // ★mig0152（裁定298／299・2026-09-25）: check_add_referral を drop・check_referral_set／remove（同じ冒頭を逐語＝kiosk 腕あり）で 19→20・21→22・19→20。
      check("G31 register helper を使う会計RPC = 20本（0057 の12＋0084 shimei/dohan＋0089 extension＋0090 set_people＋0091 line_set_group＋0131 pricing_categories_for_register＋0152 check_referral_set／remove）",
        reg.rows[0].n === 22, `got ${reg.rows[0].n}`); // ★mig0153（裁定305-7）: bottle_keep_out（kiosk 腕）で 20→21 // ★mig0155（裁定309-10）: kiosk_check_keeps（kiosk 腕・読取）で 21→22
      const op = await db.query(
        `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
         where ns.nspname = 'public' and p.prokind = 'f'
           and pg_get_functiondef(p.oid) ilike '%auth_kiosk_operator()%'
           and p.proname not in ('auth_kiosk_operator','kiosk_register_state','kiosk_check_detail')`,
      );
      check("G31 operator を使う関数 = 22本（write-arm 系 20＝0131 for_register・0152 check_referral_set／remove 込み＋audit_log_write＋drink_claims_on_line_delete）",
        op.rows[0].n === 24, `got ${op.rows[0].n}`); // ★mig0153: bottle_keep_out で 22→23 // ★mig0155: kiosk_check_keeps で 23→24
      const cv = await db.query(
        `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
         where ns.nspname = 'public' and p.prokind = 'f' and p.proname = 'check_void'
           and pg_get_functiondef(p.oid) ilike '%kiosk%'`,
      );
      check("G31 check_void に kiosk トークン 0件（確定①＝取消は manager 権限・腕を足さない）", cv.rows[0].n === 0, `got ${cv.rows[0].n}`);
      const fixed = await db.query(
        `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
         where ns.nspname = 'public' and p.prokind = 'f'
           and pg_get_functiondef(p.oid) ilike '%auth_kiosk_operator() is not null)) is not true then%'`,
      );
      check("G31 ★kiosk ゲート fail-closed = 20本が (OR連鎖) is not true 形（0058・0084・0089・0090・0091・0131・0152 も同形）",
        fixed.rows[0].n === 22, `got ${fixed.rows[0].n}`); // ★mig0153: bottle_keep_out（同形の OR 連鎖）で 20→21 // ★mig0155: kiosk_check_keeps（同形）で 21→22
      const openGate = await db.query(
        `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
         where ns.nspname = 'public' and p.prokind = 'f'
           and pg_get_functiondef(p.oid) ilike '%auth_kiosk_operator() is not null)) then%'`,
      );
      check("G31 ★旧 fail-open 形（裸の )) then）= 0本（if not(OR) の NULL 伝播＝0057 回帰の逆行を検知）",
        openGate.rows[0].n === 0, `got ${openGate.rows[0].n}`);
    }

    // G32: レジ用キオスク read layer（mig0059）— 2本の ACL・署名一意・VOLATILE・正ガード prosrc 逐語・
    //   機微トークン0。0058 教訓（F0 §7.1＝OR連鎖ゲート禁止）の恒久機械検知を read layer にも適用。
    //   runtime（自店読取/他店 forbidden/不存在 not found/idle・logout forbidden）は anon-guard 段37 が実測。
    {
      for (const fn of ["kiosk_register_state", "kiosk_check_detail"]) {
        const roles = await roleOf(fn);
        check(`G32 ${fn} EXECUTE = authenticated（anon/public 不在）`,
          roles.includes("authenticated") && !roles.includes("anon") && !roles.includes("public"),
          `保持者: ${roles.join(", ") || "(なし)"}`);
      }
      const sig = await db.query(
        `select proname, pg_get_function_identity_arguments(oid) as args, provolatile from pg_proc
         where pronamespace = 'public'::regnamespace
           and proname in ('kiosk_register_state','kiosk_check_detail') order by proname`,
      );
      check("G32 署名一意 = kiosk_check_detail(p_check_id uuid) / kiosk_register_state() の各1本",
        sig.rowCount === 2
        && sig.rows[0].proname === "kiosk_check_detail" && sig.rows[0].args === "p_check_id uuid"
        && sig.rows[1].proname === "kiosk_register_state" && sig.rows[1].args === "",
        JSON.stringify(sig.rows.map((x) => `${x.proname}(${x.args})`)));
      check("G32 両 RPC VOLATILE（auth_kiosk_operator の touch UPDATE 内包＝STABLE 宣言不可）",
        sig.rowCount === 2 && sig.rows.every((x) => x.provolatile === "v"),
        JSON.stringify(sig.rows.map((x) => x.provolatile)));
      const guard = await db.query(
        `select count(*)::int as n from pg_proc
         where pronamespace = 'public'::regnamespace
           and proname in ('kiosk_register_state','kiosk_check_detail')
           and prosrc like '%if v_store is null or public.auth_kiosk_operator() is null then%'`,
      );
      check("G32 ★正ガード形 逐語 = 2本（0058/F0 §7.1 教訓の read layer 適用）", guard.rows[0].n === 2, `got ${guard.rows[0].n}`);
      const ifnot = await db.query(
        `select count(*)::int as n from pg_proc
         where pronamespace = 'public'::regnamespace
           and proname in ('kiosk_register_state','kiosk_check_detail')
           and prosrc ilike '%if not (%'`,
      );
      check("G32 ★OR連鎖ゲート（if not( ）= 0本（fail-open 逆行の機械検知）", ifnot.rows[0].n === 0, `got ${ifnot.rows[0].n}`);
      const tok = await db.query(
        `select count(*)::int as n from pg_proc
         where pronamespace = 'public'::regnamespace
           and proname in ('kiosk_register_state','kiosk_check_detail')
           and (prosrc ilike '%back%' or prosrc ilike '%customer%' or prosrc ilike '%by_user_id%')`,
      );
      check("G32 機微トークン（back/customer/by_user_id）= 0（#34 同族の非開示恒久化）", tok.rows[0].n === 0, `got ${tok.rows[0].n}`);
    }
  }

  // G33: mig0077（product_category_reorder / set_product_active）の ACL 同型。
  //   G2b は「anon / PUBLIC に開いていない」という負側をスキーマ全数走査で見る（新関数にも自動追随）。
  //   ここは正側＝authenticated に EXECUTE が付いていること＝revoke だけ書いて grant を書き忘れる
  //   逆向きの事故を明示的に塞ぐ。0069→0072 の ACL 回帰と対の関係。
  {
    const r = await db.query(
      `select p.oid::regprocedure::text as sig,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anonx,
              p.prosecdef, p.proconfig
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.proname in ('product_category_reorder', 'set_product_active')
        order by 1`,
    );
    check("G33 mig0077 の2本が存在し署名は各1本のみ（オーバーロード無し）",
      r.rowCount === 2, r.rows.map((x) => x.sig as string).join(", ") || "0行");
    check("G33 mig0077 ACL＝authenticated に EXECUTE あり / anon は無し（既存 RPC 同型）",
      r.rowCount === 2 && r.rows.every((x) => x.authed === true && x.anonx === false),
      JSON.stringify(r.rows.map((x) => ({ sig: x.sig, authed: x.authed, anon: x.anonx }))));
    check("G33 mig0077 は SECURITY DEFINER＋search_path=public 固定（二重防御の前提）",
      r.rowCount === 2 && r.rows.every((x) =>
        x.prosecdef === true && Array.isArray(x.proconfig) && (x.proconfig as string[]).includes("search_path=public")),
      JSON.stringify(r.rows.map((x) => ({ sig: x.sig, secdef: x.prosecdef, cfg: x.proconfig }))));
  }

  // G34: mig0078（product_stock_totals）の ACL 同型＋宣言。
  //   ★provolatile は型 "char"（1バイト）＝text と直接連結すると
  //     operator is not unique: "char" || unknown で落ちる（教訓15）。::text を挟む。
  {
    const r = await db.query(
      `select p.oid::regprocedure::text as sig,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anonx,
              p.prosecdef, p.provolatile::text as vol, p.proconfig,
              pg_get_function_result(p.oid) as ret
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = 'product_stock_totals'
        order by 1`,
    );
    check("G34 mig0078 product_stock_totals が1本のみ（オーバーロード無し）",
      r.rowCount === 1, r.rows.map((x) => x.sig as string).join(", ") || "0行");
    check("G34 mig0078 ACL＝authenticated に EXECUTE あり / anon は無し（既存 RPC 同型）",
      r.rowCount === 1 && r.rows[0].authed === true && r.rows[0].anonx === false,
      JSON.stringify(r.rows.map((x) => ({ authed: x.authed, anon: x.anonx }))));
    check("G34 mig0078 は SECURITY DEFINER＋STABLE＋search_path=public 固定",
      r.rowCount === 1 && r.rows[0].prosecdef === true && r.rows[0].vol === "s"
      && Array.isArray(r.rows[0].proconfig) && (r.rows[0].proconfig as string[]).includes("search_path=public"),
      JSON.stringify({ secdef: r.rows[0]?.prosecdef, vol: r.rows[0]?.vol, cfg: r.rows[0]?.proconfig }));
    check("G34 ★戻り型の qty は integer 宣言（sum(integer)→bigint 昇格を ::integer で受ける前提）",
      r.rowCount === 1 && String(r.rows[0].ret).includes("qty integer"), String(r.rows[0]?.ret));
  }

  // G35: mig0080（product_bulk_insert）の ACL 同型＋宣言。
  //   ★product_stock_totals（読取・stable）と違い本 RPC は DML あり＝volatile であることも見る
  //     （誤って stable を付けると PostgreSQL が計画上 DML を巻き込んで壊れうるため宣言を固定する）。
  {
    const r = await db.query(
      `select p.oid::regprocedure::text as sig,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anonx,
              p.prosecdef, p.provolatile::text as vol, p.proconfig,
              pg_get_function_result(p.oid) as ret
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = 'product_bulk_insert'
        order by 1`,
    );
    check("G35 mig0080 product_bulk_insert が1本のみ（オーバーロード無し）",
      r.rowCount === 1, r.rows.map((x) => x.sig as string).join(", ") || "0行");
    check("G35 mig0080 ACL＝authenticated に EXECUTE あり / anon は無し（既存 RPC 同型）",
      r.rowCount === 1 && r.rows[0].authed === true && r.rows[0].anonx === false,
      JSON.stringify(r.rows.map((x) => ({ authed: x.authed, anon: x.anonx }))));
    check("G35 mig0080 は SECURITY DEFINER＋★VOLATILE＋search_path=public 固定",
      r.rowCount === 1 && r.rows[0].prosecdef === true && r.rows[0].vol === "v"
      && Array.isArray(r.rows[0].proconfig) && (r.rows[0].proconfig as string[]).includes("search_path=public"),
      JSON.stringify({ secdef: r.rows[0]?.prosecdef, vol: r.rows[0]?.vol, cfg: r.rows[0]?.proconfig }));
    check("G35 戻り型は jsonb（UI トースト用サマリ）",
      r.rowCount === 1 && String(r.rows[0].ret) === "jsonb", String(r.rows[0]?.ret));
  }

  // G36: mig0081（product_reorder＋products.sort_order）の ACL 同型＋列宣言。
  //   ★列も見る＝sort_order は integer NOT NULL DEFAULT 0（既存3テーブルと同形）。
  //     NULL 許容に緩むと並び順が非決定に戻るため、型と NOT NULL を恒久 assert する。
  {
    const r = await db.query(
      `select p.oid::regprocedure::text as sig,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anonx,
              p.prosecdef, p.provolatile::text as vol, p.proconfig,
              pg_get_function_result(p.oid) as ret
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = 'product_reorder'
        order by 1`,
    );
    check("G36 mig0081 product_reorder が1本のみ（オーバーロード無し）",
      r.rowCount === 1, r.rows.map((x) => x.sig as string).join(", ") || "0行");
    check("G36 mig0081 ACL＝authenticated に EXECUTE あり / anon は無し（既存 RPC 同型）",
      r.rowCount === 1 && r.rows[0].authed === true && r.rows[0].anonx === false,
      JSON.stringify(r.rows.map((x) => ({ authed: x.authed, anon: x.anonx }))));
    check("G36 mig0081 は SECURITY DEFINER＋VOLATILE＋search_path=public 固定",
      r.rowCount === 1 && r.rows[0].prosecdef === true && r.rows[0].vol === "v"
      && Array.isArray(r.rows[0].proconfig) && (r.rows[0].proconfig as string[]).includes("search_path=public"),
      JSON.stringify({ secdef: r.rows[0]?.prosecdef, vol: r.rows[0]?.vol, cfg: r.rows[0]?.proconfig }));
    const c = await db.query(
      `select data_type, is_nullable, column_default from information_schema.columns
        where table_schema='public' and table_name='products' and column_name='sort_order'`,
    );
    check("G36 ★products.sort_order は integer NOT NULL DEFAULT 0（既存3テーブルと同形）",
      c.rowCount === 1 && c.rows[0].data_type === "integer"
      && c.rows[0].is_nullable === "NO" && String(c.rows[0].column_default) === "0",
      JSON.stringify(c.rows[0] ?? "列なし"));
  }

  // G37: mig0083（料金基盤）＝テーブル2＋関数8の ACL/RLS 恒久 assert。
  //   ★A4 の教訓（_r2 改訂の理由）: 名指し revoke では Supabase 既定 grant の
  //     TRUNCATE/REFERENCES/TRIGGER が残る。TRUNCATE は RLS 非適用＝全消し可能。
  //     PostgREST からは TRUNCATE を発行できないため、runtime 面（段43(15)）では
  //     INSERT/UPDATE/DELETE のみ実測し、TRUNCATE はここで宣言的に固定する。
  {
    const POLQUAL = "((org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR "
      + "((auth_role() = 'manager'::text) AND (store_id = auth_store_id()))))";
    for (const t of ["pricing_rules", "cast_ranks"]) {
      const acl = await db.query(
        `select has_table_privilege('authenticated','public.${t}','SELECT') sel,
                has_table_privilege('authenticated','public.${t}','INSERT') ins,
                has_table_privilege('authenticated','public.${t}','UPDATE') upd,
                has_table_privilege('authenticated','public.${t}','DELETE') del,
                has_table_privilege('authenticated','public.${t}','TRUNCATE') trunc,
                has_table_privilege('authenticated','public.${t}','REFERENCES') refs,
                has_table_privilege('authenticated','public.${t}','TRIGGER') trg,
                has_table_privilege('anon','public.${t}','SELECT') anon_sel`,
      );
      const a = acl.rows[0];
      check(`G37 ${t} ACL＝authenticated SELECT のみ（★TRUNCATE/REFS/TRIGGER false・anon 全遮断）`,
        a.sel === true && !a.ins && !a.upd && !a.del && !a.trunc && !a.refs && !a.trg && !a.anon_sel,
        JSON.stringify(a));
      const rls = await db.query(
        `select relrowsecurity from pg_class where oid = ('public.${t}')::regclass`,
      );
      check(`G37 ${t} RLS 有効`, rls.rows[0]?.relrowsecurity === true, JSON.stringify(rls.rows[0]));
      const pol = await db.query(
        `select polname, polcmd::text cmd, pg_get_expr(polqual, polrelid) q,
                -- rolname は name 型＝name[] を node-postgres がパースしないため ::text で受ける
                (select array_agg(r.rolname::text order by r.rolname) from pg_roles r where r.oid = any(polroles)) roles
           from pg_policy where polrelid = ('public.${t}')::regclass`,
      );
      check(`G37 ${t} policy は select 1本のみ・polroles={authenticated}`,
        pol.rowCount === 1 && pol.rows[0].cmd === "r"
        && JSON.stringify(pol.rows[0].roles) === JSON.stringify(["authenticated"]),
        JSON.stringify(pol.rows.map((x) => ({ n: x.polname, c: x.cmd, r: x.roles }))));
      check(`G37 ${t} polqual 逐語＝org 照合＋owner∨manager自店（cast/staff に見せない）`,
        pol.rows[0]?.q === POLQUAL, String(pol.rows[0]?.q));
    }

    const FNS: Array<[string, string, boolean, string]> = [
      // [proname, 期待署名の引数部, authenticated 実行可, 期待 volatility]
      ["biz_minutes_of", "(uuid,timestamp with time zone)", false, "s"],
      // ★mig0130（裁定118-3=#52 消化）: 末尾に p_category_id uuid DEFAULT NULL を足して 5→6 引数（旧5引数は drop 済）
      ["pricing_resolve", "(uuid,timestamp with time zone,text,text,uuid,uuid)", true, "s"],
      // ★mig0107（P-1）: 末尾に p_name text DEFAULT NULL を足して 12→13 引数（旧12引数は drop 済）
      // ★mig0112（C3）: 末尾に p_tax_category text DEFAULT 'taxable_10' を足して 13→14 引数（旧13引数は drop 済）
      // ★mig0128（裁定116-2）: 末尾に p_category_id uuid DEFAULT NULL を足して 14→15 引数（旧14引数は drop 済）
      // ★mig0130（裁定118）: 末尾に p_billing_unit text DEFAULT NULL を足して 15→16 引数（旧15引数は drop 済）
      ["set_pricing_rule", "(uuid,uuid,text,text,integer,integer,integer,uuid,integer,integer,integer,boolean,text,text,uuid,text)", true, "v"],
      ["delete_pricing_rule", "(uuid)", true, "v"],
      ["pricing_rule_reorder", "(uuid,text,uuid[])", true, "v"],
      ["set_cast_rank", "(uuid,uuid,text,boolean)", true, "v"],
      ["cast_rank_reorder", "(uuid,uuid[])", true, "v"],
      ["set_cast_rank_of", "(uuid,uuid)", true, "v"],
    ];
    for (const [fn, sigArgs, authedOk, vol] of FNS) {
      const r = await db.query(
        `select p.oid::regprocedure::text as sig,
                has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed,
                has_function_privilege('anon', p.oid, 'EXECUTE') as anonx,
                p.prosecdef, p.provolatile::text as v, p.proconfig
           from pg_proc p
          where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [fn],
      );
      check(`G37 ${fn} が1本のみ・署名一致・secdef＋search_path 固定・${vol === "s" ? "STABLE" : "VOLATILE"}`,
        r.rowCount === 1 && String(r.rows[0].sig) === `${fn}${sigArgs}`
        && r.rows[0].prosecdef === true && r.rows[0].v === vol
        && Array.isArray(r.rows[0].proconfig) && (r.rows[0].proconfig as string[]).includes("search_path=public"),
        JSON.stringify(r.rows.map((x) => ({ sig: x.sig, v: x.v, cfg: x.proconfig }))));
      check(`G37 ${fn} ACL＝authenticated ${authedOk ? "可" : "★不可（内部専用）"}・anon 不可`,
        r.rowCount === 1 && r.rows[0].authed === authedOk && r.rows[0].anonx === false,
        JSON.stringify({ authed: r.rows[0]?.authed, anon: r.rows[0]?.anonx }));
    }
  }

  // G37b: mig0107（P-1）＝set_pricing_rule の旧12引数版が残っていないこと。
  //   ★署名変更は drop→create のため、drop を飛ばすとオーバーロードが残り
  //     PostgREST の呼び出し解決が 'function is not unique' で落ちる（0069→0071 の前例）。
  {
    const ov = await db.query(
      `select p.oid::regprocedure::text as sig
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = 'set_pricing_rule'
        order by 1`,
    );
    check("G37b set_pricing_rule はオーバーロードなし＝16引数1本のみ（旧15引数 drop 済＝mig0130）",
      ov.rowCount === 1
      && String(ov.rows[0].sig) === "set_pricing_rule(uuid,uuid,text,text,integer,integer,integer,uuid,integer,integer,integer,boolean,text,text,uuid,text)",
      JSON.stringify(ov.rows.map((r) => r.sig)));
  }

  // G38: mig0104（裁定77）＝comp_plans の店内名前一意 index。
  //   ★RPC 側の 'duplicate name' 検査（rls F2a★0104）だけでは service_role の直 insert を止められない。
  //     backstop は index なので、存在と定義を宣言的に固定する（cast_ranks_store_name_uq と同型）。
  {
    const ix = await db.query(
      `select indexdef, indisunique
         from pg_indexes i
         join pg_class c on c.relname = i.indexname
         join pg_index x on x.indexrelid = c.oid
        where i.schemaname = 'public' and i.tablename = 'comp_plans'
          and i.indexname = 'comp_plans_store_name_uq'`,
    );
    check("G38 comp_plans_store_name_uq が存在し UNIQUE",
      ix.rowCount === 1 && ix.rows[0]?.indisunique === true,
      JSON.stringify(ix.rows[0] ?? null));
    check("G38 comp_plans_store_name_uq の定義＝(store_id, lower(name))",
      ix.rows[0]?.indexdef ===
        "CREATE UNIQUE INDEX comp_plans_store_name_uq ON public.comp_plans USING btree (store_id, lower(name))",
      String(ix.rows[0]?.indexdef));
  }

  // G39: mig0105（裁定81）＝comp_plans_select の polqual 逐語固定（cast_ranks / pricing_rules の G37 と同形）。
  //   staff 腕が無いこと・manager が自店限定であることを文字列一致で固定する。
  //   ★POLQUAL は live の pg_get_expr から機械転写（2026-08-27・手打ちしていない）。
  {
    const POLQUAL_COMP_PLANS = "((org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR ((auth_role() = 'manager'::text) AND (store_id = auth_store_id())) OR ((auth_role() = 'cast'::text) AND (store_id = auth_store_id()) AND (EXISTS ( SELECT 1\n   FROM cast_plan cp\n  WHERE ((cp.cast_id = auth_cast_id()) AND (cp.plan_id = comp_plans.id)))))))";
    const pol = await db.query(
      `select polname, polcmd::text cmd, pg_get_expr(polqual, polrelid) q,
              (select array_agg(r.rolname::text order by r.rolname) from pg_roles r where r.oid = any(polroles)) roles
         from pg_policy where polrelid = ('public.comp_plans')::regclass`,
    );
    check("G39 comp_plans policy は select 1本のみ・polroles={authenticated}",
      pol.rowCount === 1 && pol.rows[0].cmd === "r"
      && JSON.stringify(pol.rows[0].roles) === JSON.stringify(["authenticated"]),
      JSON.stringify(pol.rows.map((x) => ({ n: x.polname, c: x.cmd, r: x.roles }))));
    check("G39 comp_plans_select polqual 逐語＝owner org∨manager自店∨cast 自店∧自プラン（staff 腕なし）",
      pol.rows[0]?.q === POLQUAL_COMP_PLANS, String(pol.rows[0]?.q));
  }

  // G40: mig0106（裁定82・起票#14）＝set_store_biz_cutoff の署名・secdef・search_path・ACL。
  //   ★G37 の FNS ループと同型。settings_json を書く RPC 群（okuri_mode 等）と同格の
  //     「authenticated に grant・anon 不可」を宣言的に固定する（owner 限定は RPC 内ガード＝pricing 段43(18)）。
  {
    const r = await db.query(
      `select p.oid::regprocedure::text as sig,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anonx,
              p.prosecdef, p.provolatile::text as v, p.proconfig
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = 'set_store_biz_cutoff'`,
    );
    check("G40 set_store_biz_cutoff が1本のみ・署名(uuid,text)・secdef＋search_path 固定・VOLATILE",
      r.rowCount === 1 && String(r.rows[0].sig) === "set_store_biz_cutoff(uuid,text)"
      && r.rows[0].prosecdef === true && r.rows[0].v === "v"
      && Array.isArray(r.rows[0].proconfig) && (r.rows[0].proconfig as string[]).includes("search_path=public"),
      JSON.stringify(r.rows.map((x) => ({ sig: x.sig, v: x.v, cfg: x.proconfig }))));
    check("G40 set_store_biz_cutoff ACL＝authenticated 可・anon 不可",
      r.rowCount === 1 && r.rows[0].authed === true && r.rows[0].anonx === false,
      JSON.stringify({ authed: r.rows[0]?.authed, anon: r.rows[0]?.anonx }));
  }

  // G41: mig0108（起票#31）＝set_store_pin_policy / staff_pin_status の署名・secdef・search_path・ACL。
  //   G40 と同型。owner/manager 判定は RPC 内ガード＝anon-guard 段37 ★0108 が実セッションで固定。
  {
    const r = await db.query(
      `select p.proname, p.oid::regprocedure::text as sig,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anonx,
              p.prosecdef, p.provolatile::text as v, p.proconfig
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.proname in ('set_store_pin_policy', 'staff_pin_status')
        order by p.proname`,
    );
    const byName = (n: string) => r.rows.filter((x) => x.proname === n);
    const pol = byName("set_store_pin_policy");
    const sts = byName("staff_pin_status");
    check("G41 set_store_pin_policy が1本のみ・署名(uuid,integer,integer)・secdef＋search_path 固定・VOLATILE",
      pol.length === 1 && String(pol[0].sig) === "set_store_pin_policy(uuid,integer,integer)"
      && pol[0].prosecdef === true && pol[0].v === "v"
      && Array.isArray(pol[0].proconfig) && (pol[0].proconfig as string[]).includes("search_path=public"),
      JSON.stringify(pol.map((x) => ({ sig: x.sig, v: x.v, cfg: x.proconfig }))));
    check("G41 staff_pin_status が1本のみ・署名(uuid)・secdef＋search_path 固定・STABLE",
      sts.length === 1 && String(sts[0].sig) === "staff_pin_status(uuid)"
      && sts[0].prosecdef === true && sts[0].v === "s"
      && Array.isArray(sts[0].proconfig) && (sts[0].proconfig as string[]).includes("search_path=public"),
      JSON.stringify(sts.map((x) => ({ sig: x.sig, v: x.v, cfg: x.proconfig }))));
    check("G41 2関数 ACL＝authenticated 可・anon 不可",
      r.rows.length === 2 && r.rows.every((x) => x.authed === true && x.anonx === false),
      JSON.stringify(r.rows.map((x) => ({ n: x.proname, authed: x.authed, anon: x.anonx }))));
  }

  // G42: mig0112（C3/C4 §6-3・裁定90）＝set_pricing_rule 14引数化と set_store_tax_config 新設。
  //   ★肝は「旧13引数署名が残っていない」こと（overload 罠＝PostgREST 曖昧ディスパッチ・0062/0086 前例）。
  {
    const r = await db.query(
      `select p.proname, p.oid::regprocedure::text as sig, p.pronargs,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anonx,
              p.prosecdef, p.proconfig
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.proname in ('set_pricing_rule', 'set_store_tax_config')
        order by p.proname`,
    );
    const spr = r.rows.filter((x) => x.proname === "set_pricing_rule");
    const stc = r.rows.filter((x) => x.proname === "set_store_tax_config");
    check("G42 set_pricing_rule が1本のみ＝16引数（旧15引数署名の残骸なし・overload 罠封じ＝mig0130）",
      spr.length === 1 && Number(spr[0].pronargs) === 16 && spr[0].prosecdef === true
      && Array.isArray(spr[0].proconfig) && (spr[0].proconfig as string[]).includes("search_path=public"),
      JSON.stringify(spr.map((x) => ({ sig: x.sig, n: x.pronargs }))));
    check("G42 set_store_tax_config が1本のみ＝7引数・secdef＋search_path 固定",
      stc.length === 1 && Number(stc[0].pronargs) === 7 && stc[0].prosecdef === true
      && Array.isArray(stc[0].proconfig) && (stc[0].proconfig as string[]).includes("search_path=public"),
      JSON.stringify(stc.map((x) => ({ sig: x.sig, n: x.pronargs }))));
    check("G42 2関数 ACL＝authenticated 可・anon 不可",
      r.rows.length === 2 && r.rows.every((x) => x.authed === true && x.anonx === false),
      JSON.stringify(r.rows.map((x) => ({ n: x.proname, authed: x.authed, anonx: x.anonx }))));
  }

  // G43: mig0122（裁定109）set_cast_profile ＝源氏名・入店日更新 RPC の ACL（教訓43＝4者 revoke→2者 grant）。
  {
    const r = await db.query(
      `select p.pronargs, p.prosecdef,
              has_function_privilege('authenticated', p.oid, 'execute') as authed,
              has_function_privilege('anon', p.oid, 'execute') as anonx,
              has_function_privilege('service_role', p.oid, 'execute') as svc
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'set_cast_profile'`,
    );
    check("G43 set_cast_profile＝1本・3引数・secdef",
      r.rowCount === 1 && Number(r.rows[0].pronargs) === 3 && r.rows[0].prosecdef === true,
      JSON.stringify(r.rows));
    check("G43 set_cast_profile ACL＝authenticated/service_role 可・anon 不可",
      r.rowCount === 1 && r.rows[0].authed === true && r.rows[0].svc === true && r.rows[0].anonx === false,
      JSON.stringify(r.rows));
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
