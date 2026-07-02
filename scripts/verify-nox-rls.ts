/*
 * verify:nox-rls — 実ユーザーでサインインして RLS を実測（BANZEN verify-rls の構造を翻訳）。
 *   npm run verify:nox-rls（事前に seed:f0）
 *
 * 観点（認可設計 §6 の F0 分）:
 *  - 店スコープ: 他店 0行・owner は org 全店。
 *  - cast プライバシー パターン1土台: cast は casts で自分の行のみ。
 *  - memberships: owner=org 全店分 / manager=自店分 / cast=0行。
 *  - users: manager=自店 membership 保持者のみ / cast=自分のみ。
 *  - audit_logs: owner のみ（manager/cast 0行）＝認可設計 §1.2。
 *  - 書込遮断: authenticated の insert/update/delete が permission denied（0003 grant 面）。
 *  - ヘルパー正常系: auth_role/auth_cast_id が期待値。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ORG_A, ORG_B, STORE_A1, STORE_A2, STORE_B1, FIXTURE_USERS, loadEnvOrExit,
  type FixtureUserKey,
} from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SEED_PASSWORD",
]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
function sameSet(actual: string[], expected: string[]): boolean {
  const a = [...actual].sort();
  const b = [...expected].sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

async function signIn(key: FixtureUserKey): Promise<SupabaseClient> {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({
    email: FIXTURE_USERS[key].email,
    password: env.SEED_PASSWORD,
  });
  if (error) {
    console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか確認）: ${error.message}`);
    process.exit(1);
  }
  return c;
}

async function names(c: SupabaseClient, table: string, col = "name"): Promise<string[]> {
  const { data, error } = await c.from(table).select(col);
  if (error) {
    fails.push(`${table} select がエラー: ${error.message}`);
    return [];
  }
  return (data as unknown as Array<Record<string, string>>).map((r) => r[col]);
}

async function main() {
  // ── ownerA: org A 全店・org B 不可視・audit 閲覧可 ──
  {
    const c = await signIn("ownerA");
    check("ownerA orgs = A のみ", sameSet(await names(c, "orgs"), [ORG_A]));
    check("ownerA stores = A1+A2（B1 不可視）", sameSet(await names(c, "stores"), [STORE_A1, STORE_A2]));
    const { data: mems } = await c.from("memberships").select("id");
    check("ownerA memberships = org A の4行", (mems ?? []).length === 4, `got ${(mems ?? []).length}`);
    const { data: audits } = await c.from("audit_logs").select("id, action");
    check("ownerA audit_logs ≥1行（seed_marker）", (audits ?? []).some((a) => a.action === "seed_marker"), `got ${(audits ?? []).length}行`);
    const { data: role } = await c.rpc("auth_role");
    check("ownerA auth_role = owner", role === "owner", `got ${JSON.stringify(role)}`);
    await c.auth.signOut();
  }

  // ── managerA1: 自店のみ・org B 0行・audit 0行 ──
  {
    const c = await signIn("managerA1");
    check("managerA1 orgs = A のみ", sameSet(await names(c, "orgs"), [ORG_A]));
    check("managerA1 stores = A1 のみ（A2/B1 不可視）", sameSet(await names(c, "stores"), [STORE_A1]));
    check(
      "managerA1 casts = A1 の2人",
      sameSet(await names(c, "casts"), [FIXTURE_USERS.castA1a.name, FIXTURE_USERS.castA1b.name]),
    );
    check(
      "managerA1 users = A1 membership 保持者4人（managerB1 不可視）",
      sameSet(await names(c, "users", "email"), [
        FIXTURE_USERS.ownerA.email,
        FIXTURE_USERS.managerA1.email,
        FIXTURE_USERS.castA1a.email,
        FIXTURE_USERS.castA1b.email,
      ]),
    );
    const { data: mems } = await c.from("memberships").select("id");
    check("managerA1 memberships = 自店4行", (mems ?? []).length === 4, `got ${(mems ?? []).length}`);
    const { data: audits } = await c.from("audit_logs").select("id");
    check("managerA1 audit_logs = 0行（§1.2 owner 限定）", (audits ?? []).length === 0, `got ${(audits ?? []).length}`);
    const { data: castId } = await c.rpc("auth_cast_id");
    check("managerA1 auth_cast_id = null", castId === null, `got ${JSON.stringify(castId)}`);
    await c.auth.signOut();
  }

  // ── castA1a: 自分の行のみ（パターン1土台）・memberships/audit 0行 ──
  {
    const c = await signIn("castA1a");
    check("castA1a orgs = A のみ", sameSet(await names(c, "orgs"), [ORG_A]));
    check("castA1a stores = A1 のみ", sameSet(await names(c, "stores"), [STORE_A1]));
    check(
      "castA1a casts = 自分の1行のみ（castA1b 不可視＝パターン1）",
      sameSet(await names(c, "casts"), [FIXTURE_USERS.castA1a.name]),
    );
    check("castA1a users = 自分のみ", sameSet(await names(c, "users", "email"), [FIXTURE_USERS.castA1a.email]));
    const { data: mems } = await c.from("memberships").select("id");
    check("castA1a memberships = 0行", (mems ?? []).length === 0, `got ${(mems ?? []).length}`);
    const { data: audits } = await c.from("audit_logs").select("id");
    check("castA1a audit_logs = 0行（パターン2包含）", (audits ?? []).length === 0, `got ${(audits ?? []).length}`);
    const { data: role } = await c.rpc("auth_role");
    check("castA1a auth_role = cast", role === "cast", `got ${JSON.stringify(role)}`);
    const { data: castId } = await c.rpc("auth_cast_id");
    check("castA1a auth_cast_id 非null", typeof castId === "string" && castId.length > 0, `got ${JSON.stringify(castId)}`);

    // 書込遮断（0003 grant 面・RLS 以前に permission denied for table）
    const { error: eIns } = await c.from("casts").insert({ org_id: "00000000-0000-0000-0000-000000000000", store_id: "00000000-0000-0000-0000-000000000000", name: "侵入" });
    check("castA1a casts INSERT 遮断", !!eIns?.message?.includes("permission denied"), eIns?.message ?? "実行できてしまった");
    const { error: eUpd } = await c.from("casts").update({ name: "改ざん" }).eq("name", FIXTURE_USERS.castA1a.name);
    check("castA1a casts UPDATE 遮断", !!eUpd?.message?.includes("permission denied"), eUpd?.message ?? "実行できてしまった");
    const { error: eDel } = await c.from("casts").delete().eq("name", FIXTURE_USERS.castA1a.name);
    check("castA1a casts DELETE 遮断", !!eDel?.message?.includes("permission denied"), eDel?.message ?? "実行できてしまった");
    const { error: eAud } = await c.from("audit_logs").insert({ org_id: "00000000-0000-0000-0000-000000000000", action: "偽装" });
    check("castA1a audit_logs INSERT 遮断", !!eAud?.message?.includes("permission denied"), eAud?.message ?? "実行できてしまった");
    await c.auth.signOut();
  }

  // ── managerB1: org B のみ・org A データ 0行 ──
  {
    const c = await signIn("managerB1");
    check("managerB1 orgs = B のみ", sameSet(await names(c, "orgs"), [ORG_B]));
    check("managerB1 stores = B1 のみ", sameSet(await names(c, "stores"), [STORE_B1]));
    const { data: casts } = await c.from("casts").select("id");
    check("managerB1 casts = 0行（org A の cast 不可視）", (casts ?? []).length === 0, `got ${(casts ?? []).length}`);
    const { data: mems } = await c.from("memberships").select("id");
    check("managerB1 memberships = 自店1行", (mems ?? []).length === 1, `got ${(mems ?? []).length}`);
    await c.auth.signOut();
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-rls ALL PASS (${pass} assertions)`);
}

main().catch((e) => {
  console.error("✗ 異常終了", e);
  process.exit(1);
});
