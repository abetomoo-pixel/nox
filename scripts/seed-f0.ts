/*
 * seed:f0 — F0 verify 用フィクスチャ投入（冪等・再実行可）。
 *   npm run seed:f0
 *
 * ★dev 専用。本番環境では実行しない（CLAUDE.md 規約）。
 *
 * 作るもの:
 *   orgs: NOX-VERIFY-A / NOX-VERIFY-B
 *   stores: A1・A2（org A）・B1（org B）
 *   auth users 9人（固定 email・SEED_PASSWORD・確認済み扱い）
 *   users/memberships（ownerA/managerA1/staffA1/staffRegOnA1/staffRegOffA1/staffCrmOnA1/castA1a/castA1b → A・managerB1 → B）
 *   staff 機能別フラグ（mig0022・F3a-1）: memberships に can_register/can_crm/can_shift を明示値で書く
 *     （staffRegOnA1=会計のみ ON・staffRegOffA1=全 OFF・staffCrmOnA1=顧客のみ ON＝2軸独立・他は全 false＝規約7 boolean 明示値）
 *   casts: castA1a/castA1b（store A1・user_id 紐付け）
 *   customers 6行（F3a-2・mig0023）: 指名A/指名B/フリー/休眠（A1）＋他店 A2＋他 org B1
 *     ＋ churn 用 closed checks（started_at=5/40/70/100 日前・専用卓 NOX-VERIFY-CRM卓・
 *     指名/payments なし＝ランキング・売上集計・日報ゴールデンに非干渉）
 *   audit_logs 1行（org A・action=seed_marker・owner 閲覧テスト用）
 *
 * 冪等化: NOX-VERIFY-* の org 配下データを削除→再投入。auth ユーザーは再利用。
 * 書込はすべて service キー（RLS バイパスの正規経路・0003 後も service_role は ALL 保持）。
 */
import { createClient } from "@supabase/supabase-js";
import {
  ORG_A, ORG_B, STORE_A1, STORE_A2, STORE_B1, FIXTURE_USERS, FIXTURE_CUSTOMERS, loadEnvOrExit,
} from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
]);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function die(msg: string, err?: unknown): never {
  console.error(`✗ ${msg}`, err ?? "");
  process.exit(1);
}

async function ensureAuthUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: env.SEED_PASSWORD,
    email_confirm: true,
  });
  if (!error && data.user) return data.user.id;
  // 既存なら探して再利用
  for (let page = 1; page <= 20; page++) {
    const { data: list, error: e } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (e) die("listUsers 失敗", e);
    const hit = list.users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (list.users.length < 200) break;
  }
  die(`auth ユーザー作成も検索も失敗: ${email}`, error);
}

async function main() {
  // ── 1. auth ユーザー確保 ──
  const authIds: Record<string, string> = {};
  for (const [key, u] of Object.entries(FIXTURE_USERS)) {
    authIds[key] = await ensureAuthUser(u.email);
  }

  // ── 2. 既存 NOX-VERIFY-* データ削除（FK 順: audit→casts→memberships→users→stores→orgs）──
  const { data: oldOrgs, error: eOrgs } = await admin
    .from("orgs")
    .select("id")
    .in("name", [ORG_A, ORG_B]);
  if (eOrgs) die("orgs 検索失敗", eOrgs);
  const orgIds = (oldOrgs ?? []).map((o) => o.id);
  if (orgIds.length) {
    const { data: oldStores } = await admin.from("stores").select("id").in("org_id", orgIds);
    const storeIds = (oldStores ?? []).map((s) => s.id);
    const del = async (table: string, col: string, ids: string[]) => {
      if (!ids.length) return;
      const { error } = await admin.from(table).delete().in(col, ids);
      if (error) die(`${table} 削除失敗`, error);
    };
    // FK 順: 参照する側から消す（会計系 → casts/users → products/seats → stores → orgs）
    await del("audit_logs", "org_id", orgIds);
    await del("daily_reports", "org_id", orgIds);
    await del("check_cast_backs", "org_id", orgIds);
    await del("check_nominations", "org_id", orgIds);
    await del("payments", "org_id", orgIds);
    await del("receivables", "org_id", orgIds);
    await del("check_lines", "org_id", orgIds);
    await del("checks", "org_id", orgIds);
    await del("stock_logs", "org_id", orgIds);
    await del("bottle_keeps", "org_id", orgIds);
    await del("customers", "org_id", orgIds);     // F3a-2（checks/bottle_keeps/receivables の FK は set null・会計系削除の後）
    await del("punches", "org_id", orgIds);
    await del("attendance", "org_id", orgIds);
    await del("shifts", "org_id", orgIds);        // shift_wishes より先（wish_id FK）
    await del("shift_wishes", "org_id", orgIds);
    await del("staffing_needs", "org_id", orgIds);
    // F2 系（mig0012〜0021）: casts/stores を参照する側から先に消す（F2 実装後の seed 再実行対応）
    await del("payment_records", "org_id", orgIds);       // → payroll_runs/casts 参照
    await del("payslips", "org_id", orgIds);              // → payroll_runs/casts 参照
    await del("payroll_runs", "org_id", orgIds);
    await del("advances", "org_id", orgIds);
    await del("transport", "org_id", orgIds);
    await del("attendance_incentives", "org_id", orgIds);
    await del("cast_plan", "org_id", orgIds);             // → casts/comp_plans 参照
    await del("cast_norms", "org_id", orgIds);
    await del("cast_tax_profiles", "org_id", orgIds);
    await del("cast_sensitive", "org_id", orgIds);
    await del("comp_plans", "org_id", orgIds);            // cast_plan の後
    await del("deductions", "org_id", orgIds);
    await del("penalty_config", "org_id", orgIds);
    await del("custom_back_defs", "org_id", orgIds);
    await del("casts", "org_id", orgIds);
    await del("memberships", "store_id", storeIds);
    await del("users", "org_id", orgIds);
    await del("products", "org_id", orgIds);
    await del("seats", "org_id", orgIds);
    await del("stores", "org_id", orgIds);
    await del("orgs", "id", orgIds);
  }

  // ── 3. orgs / stores ──
  const { data: orgs, error: e3 } = await admin
    .from("orgs")
    .insert([{ name: ORG_A }, { name: ORG_B }])
    .select("id, name");
  if (e3 || !orgs) die("orgs 投入失敗", e3);
  const orgA = orgs.find((o) => o.name === ORG_A)!.id;
  const orgB = orgs.find((o) => o.name === ORG_B)!.id;

  const { data: stores, error: e4 } = await admin
    .from("stores")
    .insert([
      { org_id: orgA, name: STORE_A1, short: "A1" },
      { org_id: orgA, name: STORE_A2, short: "A2" },
      { org_id: orgB, name: STORE_B1, short: "B1" },
    ])
    .select("id, name");
  if (e4 || !stores) die("stores 投入失敗", e4);
  const storeId = (name: string) => stores.find((s) => s.name === name)!.id;

  // ── 4. users / memberships / casts ──
  const orgIdOf = (org: string) => (org === ORG_A ? orgA : orgB);
  const userRows = Object.entries(FIXTURE_USERS).map(([key, u]) => ({
    org_id: orgIdOf(u.org),
    auth_user_id: authIds[key],
    email: u.email,
    name: u.name,
  }));
  const { data: users, error: e5 } = await admin.from("users").insert(userRows).select("id, email");
  if (e5 || !users) die("users 投入失敗", e5);
  const userId = (email: string) => users.find((u) => u.email === email)!.id;

  const memberRows = Object.values(FIXTURE_USERS).map((u) => ({
    user_id: userId(u.email),
    store_id: storeId(u.store),
    role: u.role,
    // F3a-1（mig0022）: staff 機能別フラグは常に明示値（規約7・perms 未指定 fixture は全 false）
    can_register: u.perms?.can_register ?? false,
    can_crm: u.perms?.can_crm ?? false,
    can_shift: u.perms?.can_shift ?? false,
  }));
  const { error: e6 } = await admin.from("memberships").insert(memberRows);
  if (e6) die("memberships 投入失敗", e6);

  const castRows = (["castA1a", "castA1b"] as const).map((key) => {
    const u = FIXTURE_USERS[key];
    return {
      org_id: orgA,
      store_id: storeId(STORE_A1),
      user_id: userId(u.email),
      name: u.name,
      employment: "委託",
    };
  });
  const { data: casts, error: e7 } = await admin.from("casts").insert(castRows).select("id, name");
  if (e7 || !casts) die("casts 投入失敗", e7);
  const castId = (key: "castA1a" | "castA1b") =>
    casts.find((c) => c.name === FIXTURE_USERS[key].name)!.id;

  // ── 4.5 F3a-2（束2・mig0023）: customers ＋ churn 用 closed checks ──
  // customers は実体属性のみ（visits/last_visit/total_spend は列に持たない）。集計 RPC の
  // ゴールデンは closed checks を started_at 逆算で投入して作る。指名・payments・当日 biz_date を
  // 一切持たない（ランキング/get_cast_sales/日報の既存ゴールデンと構造的に非干渉）。
  const { data: crmSeat, error: eSeat } = await admin.from("seats").insert({
    org_id: orgA, store_id: storeId(STORE_A1), name: "NOX-VERIFY-CRM卓", kind: "卓",
    sort_order: 998, is_active: true,
  }).select("id").single();
  if (eSeat || !crmSeat) die("CRM卓 投入失敗", eSeat);

  const custRows = Object.values(FIXTURE_CUSTOMERS).map((cu) => ({
    org_id: orgIdOf(cu.org),
    store_id: storeId(cu.store),
    name: cu.name,
    cast_id: cu.cast ? castId(cu.cast) : null,
    is_active: cu.active,
  }));
  const { data: custs, error: eCu } = await admin.from("customers").insert(custRows).select("id, name");
  if (eCu || !custs) die("customers 投入失敗", eCu);
  const custId = (name: string) => custs.find((c) => c.name === name)!.id;

  const churnCheckRows = Object.values(FIXTURE_CUSTOMERS).flatMap((cu) =>
    cu.checks.map((ck) => {
      const startedAt = new Date(Date.now() - ck.daysAgo * 86_400_000).toISOString();
      return {
        org_id: orgIdOf(cu.org),
        store_id: storeId(cu.store),
        seat_id: crmSeat.id,
        status: "closed",
        started_at: startedAt,
        closed_at: startedAt,
        nom_type: "free",
        customer_id: custId(cu.name),
        total: ck.total,
        service_rate: 10, round_unit: 100, round_mode: "down",
        created_by: userId(FIXTURE_USERS.managerA1.email),
      };
    }),
  );
  const { error: eCk } = await admin.from("checks").insert(churnCheckRows);
  if (eCk) die("churn 用 closed checks 投入失敗", eCk);

  // ── 5. audit_logs マーカー（owner 閲覧テスト用・service 直 INSERT）──
  const { error: e8 } = await admin.from("audit_logs").insert({
    org_id: orgA,
    store_id: storeId(STORE_A1),
    action: "seed_marker",
    target: "seed:f0",
    before_json: null,
    after_json: { seeded: true },
  });
  if (e8) die("audit_logs 投入失敗", e8);

  console.log("seed:f0 完了");
  console.log(`  orgs: ${ORG_A} / ${ORG_B}`);
  console.log(`  stores: ${STORE_A1} / ${STORE_A2} / ${STORE_B1}`);
  console.log(`  users: ${Object.values(FIXTURE_USERS).map((u) => u.email).join(", ")}`);
  console.log("  casts: 2（A1）・audit_logs marker: 1（org A）");
  console.log(`  customers: ${custs.length}（A1×4・A2×1・B1×1）・churn checks: ${churnCheckRows.length}（CRM卓・5/40/70/100日前）`);
}

main().catch((e) => die("seed:f0 異常終了", e));
