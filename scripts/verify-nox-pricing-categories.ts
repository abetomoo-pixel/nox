/*
 * verify:nox-pricing-categories — 裁定116-1（mig0127）料金区分の器の係留。
 *   npm run verify:nox-pricing-categories（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD/SUPABASE_DB_URL）
 *
 * 観点（設計書 v2 §4・mig0127）:
 *  (a) 正常系: owner 新規作成→返値 uuid・行内容・audit（action='set_pricing_category'/
 *      target='pricing_categories:<id>'・before null）。update（改名+sort）→before/after audit
 *  (b) manager 自店=作成可・他店（他 org）manager='forbidden'
 *  (c) staff セッション='forbidden'（role 分岐の else 側）
 *  (d) duplicate name: 同店 active 同名拒否・停止後は同名再作成可・停止行の再活性化は 'duplicate name'
 *  (e) 直接書込遮断: authenticated の .insert() が権限エラー（grant select のみの実測）
 *  (f) select policy: manager は自店行のみ（他店行 0件・admin が B1 に植えた行が見えない）
 *  (g) pricing_rules.category_id は全行 null（0127 時点の挙動不変の器確認）
 *
 * 逆張り: PC_INVERT=1 で全 check の期待を反転＝全赤を実測。
 * fixture: NOX-VERIFY-pc* 命名・finally 後始末（golden 不触・pricing_rules は読むだけ）。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { FIXTURE_USERS, STORE_A1, STORE_B1, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
  "SUPABASE_DB_URL",
]);

const INV = process.env.PC_INVERT === "1";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  const eff = INV ? !ok : ok;
  if (eff) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = async (key: keyof typeof FIXTURE_USERS) => {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };
  const owner = await signIn("ownerA");
  const mgr = await signIn("managerA1");
  const mgrB = await signIn("managerB1");
  const staff = await signIn("staffA1");
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const { data: sA1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const storeA1 = sA1!.id as string;
  const { data: sB1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_B1).single();
  const storeB1 = sB1!.id as string;
  const orgB = sB1!.org_id as string;

  async function teardown() {
    const { error } = await admin.from("pricing_categories").delete().like("name", "NOX-VERIFY-pc%");
    if (error) console.error(`[pc teardown] delete 失敗（次 run 先頭で自浄）: ${error.message}`);
  }
  await teardown();

  const rowOf = async (id: string) =>
    (await admin.from("pricing_categories").select("store_id, name, sort, is_active").eq("id", id).single()).data as
      { store_id: string; name: string; sort: number; is_active: boolean } | null;

  try {
    // ══ (a) 正常系: owner 作成→uuid/行内容/audit・update→before/after audit ══
    let idA = "";
    {
      const { data: r1, error: e1 } = await owner.rpc("set_pricing_category", {
        p_id: null, p_store_id: storeA1, p_name: "NOX-VERIFY-pc通常", p_sort: 100, p_is_active: true,
      });
      idA = r1 as string;
      const row1 = idA ? await rowOf(idA) : null;
      check("pc(a1) ★owner 新規作成＝返値 uuid・行内容（store/name/sort/active）",
        !e1 && typeof idA === "string" && idA.length === 36
          && row1?.store_id === storeA1 && row1?.name === "NOX-VERIFY-pc通常"
          && row1?.sort === 100 && row1?.is_active === true,
        e1?.message ?? JSON.stringify(row1));
      const { rows: au1 } = await db.query(
        `select count(*)::int as n from public.audit_logs
          where action = 'set_pricing_category' and target = $1 and before_json is null`,
        [`pricing_categories:${idA}`]);
      check("pc(a2) ★作成 audit（action/target・before null）", au1[0].n === 1, `n=${au1[0].n}`);
      const { error: e2 } = await owner.rpc("set_pricing_category", {
        p_id: idA, p_store_id: storeA1, p_name: "NOX-VERIFY-pc通常改", p_sort: 50, p_is_active: true,
      });
      const row2 = await rowOf(idA);
      const { rows: au2 } = await db.query(
        `select count(*)::int as n from public.audit_logs
          where action = 'set_pricing_category' and target = $1
            and before_json->>'name' = 'NOX-VERIFY-pc通常'
            and after_json->>'name' = 'NOX-VERIFY-pc通常改' and (after_json->>'sort')::int = 50`,
        [`pricing_categories:${idA}`]);
      check("pc(a3) ★update（改名+sort）＝行反映・before/after audit",
        !e2 && row2?.name === "NOX-VERIFY-pc通常改" && row2?.sort === 50 && au2[0].n === 1,
        e2?.message ?? JSON.stringify({ row2, n: au2[0].n }));
    }

    // ══ (b) manager 自店可・他店 forbidden ══
    let idM = "";
    {
      const { data: r1, error: e1 } = await mgr.rpc("set_pricing_category", {
        p_id: null, p_store_id: storeA1, p_name: "NOX-VERIFY-pc初来店", p_sort: 200, p_is_active: true,
      });
      idM = r1 as string;
      check("pc(b1) ★manager 自店＝作成可", !e1 && typeof idM === "string", e1?.message ?? JSON.stringify(r1));
      const { error: e2 } = await mgrB.rpc("set_pricing_category", {
        p_id: null, p_store_id: storeA1, p_name: "NOX-VERIFY-pc越境", p_sort: 100, p_is_active: true,
      });
      check("pc(b2) ★他店（他 org）manager＝'forbidden'", !!e2 && e2.message.includes("forbidden"),
        e2?.message ?? "通ってしまった");
    }

    // ══ (c) staff セッション forbidden ══
    {
      const { error: e1 } = await staff.rpc("set_pricing_category", {
        p_id: null, p_store_id: storeA1, p_name: "NOX-VERIFY-pcスタッフ", p_sort: 100, p_is_active: true,
      });
      check("pc(c1) ★staff セッション＝'forbidden'（owner/manager 以外の else 分岐）",
        !!e1 && e1.message.includes("forbidden"), e1?.message ?? "通ってしまった");
    }

    // ══ (d) duplicate name（active 内のみ・停止→再作成→再活性化拒否）══
    {
      const { error: e1 } = await mgr.rpc("set_pricing_category", {
        p_id: null, p_store_id: storeA1, p_name: "NOX-VERIFY-pc初来店", p_sort: 300, p_is_active: true,
      });
      check("pc(d1) ★同店 active 同名＝'duplicate name'", !!e1 && e1.message.includes("duplicate name"),
        e1?.message ?? "通ってしまった");
      const { error: e2 } = await mgr.rpc("set_pricing_category", {
        p_id: idM, p_store_id: storeA1, p_name: "NOX-VERIFY-pc初来店", p_sort: 200, p_is_active: false,
      });
      const { data: r3, error: e3 } = await mgr.rpc("set_pricing_category", {
        p_id: null, p_store_id: storeA1, p_name: "NOX-VERIFY-pc初来店", p_sort: 210, p_is_active: true,
      });
      check("pc(d2) ★停止（is_active=false）後は同名再作成可", !e2 && !e3 && typeof r3 === "string",
        e2?.message ?? e3?.message ?? JSON.stringify(r3));
      const { error: e4 } = await mgr.rpc("set_pricing_category", {
        p_id: idM, p_store_id: storeA1, p_name: "NOX-VERIFY-pc初来店", p_sort: 200, p_is_active: true,
      });
      check("pc(d3) ★停止行の再活性化＝'duplicate name'（active 同名が別 id で存在）",
        !!e4 && e4.message.includes("duplicate name"), e4?.message ?? "通ってしまった");
    }

    // ══ (e) 直接書込遮断（grant select のみの実測）══
    {
      const { error: e1 } = await mgr.from("pricing_categories").insert({
        org_id: sA1!.org_id, store_id: storeA1, name: "NOX-VERIFY-pc直insert", sort: 1, is_active: true,
      });
      check("pc(e1) ★authenticated の直接 insert は 'permission denied'",
        !!e1 && (e1.message ?? "").includes("permission denied"), e1?.message ?? "書けてしまった");
    }

    // ══ (f) select policy: manager は自店行のみ ══
    {
      const { error: eB } = await admin.from("pricing_categories").insert({
        org_id: orgB, store_id: storeB1, name: "NOX-VERIFY-pcB", sort: 1, is_active: true,
      });
      const { data: mine } = await mgr.from("pricing_categories").select("store_id").like("name", "NOX-VERIFY-pc%");
      const rows = (mine ?? []) as { store_id: string }[];
      check("pc(f1) ★manager select＝自店行のみ（B1 行 0件・A1 行は見える）",
        !eB && rows.length > 0 && rows.every((r) => r.store_id === storeA1),
        eB?.message ?? JSON.stringify(rows));
    }

    // ══ (g) pricing_rules.category_id 全 null（挙動不変の器確認）══
    {
      const { rows } = await db.query(
        `select count(*)::int as total, count(category_id)::int as nonnull from public.pricing_rules`);
      check("pc(g1) ★pricing_rules.category_id は全行 null（0127 時点＝resolve 挙動不変）",
        rows[0].nonnull === 0, JSON.stringify(rows[0]));
    }
  } finally {
    await teardown();
  }
  await db.end();

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}${INV ? "（PC_INVERT=1＝期待反転ラン）" : ""}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-pricing-categories ALL PASS (${pass} assertions)${INV ? "（INVERT）" : ""}`);
}

main().catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
