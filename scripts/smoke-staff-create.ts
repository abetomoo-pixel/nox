/*
 * smoke:staff-create — /api/staff/create の route E2E スモーク（verify:f0 の外・本番前必須・dev 手実行）。
 *   前提: dev サーバ起動（npm run dev = port 3200）・seed:f0 済み・mig0026 適用済み。
 *   実行: npx tsx scripts/smoke-staff-create.ts
 *
 * ★dev 専用。本番環境では実行しない（CLAUDE.md 規約・admin API と実 auth.users を触る）。
 *
 * 検証項目（Q-2 仕様書 §7）:
 *  S1 email 空 → 合成 email 発行（s-<idemKey8>@o-<org8>.nox.local）・auth user 作成・membership 生成・
 *     初期パスワード返却（16文字）・フラグ全 false の物理確認
 *  S2 二重 POST（同 idemKey）→ 409・二重作成なし（users 1行のまま）
 *  S3 実 email 入力 → その email が login_email に
 *  S4 作成スタッフ（S1 の合成 email＋初期パスワード）で実ログイン → auth_role='staff'
 *  S5 ★補償: staff_create の EXECUTE を DB 直結で一時 revoke（決定論的フォールト注入）→
 *     createUser 成功後に RPC が失敗 → deleteUser で auth user が巻き戻る（孤児が残らない）→
 *     finally で grant 復元＋復元を機械確認
 *  掃除: 生成 users/memberships/auth users を全消し（前回遺物も prep で掃除＝再実行冪等）
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { STORE_A1, FIXTURE_USERS, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
  "SUPABASE_DB_URL",
]);
const BASE = "http://localhost:3200";
const REAL_EMAIL = "nox-smoke-real1@example.com";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fails.push(`${label}${detail ? `: ${detail}` : ""}`); console.error(`  ✗ ${label}: ${detail ?? ""}`); }
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// @supabase/ssr の cookie 形式（base64- プレフィクス・3180 分割）でセッション cookie を構築
function buildCookie(session: unknown): string {
  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const name = `sb-${ref}-auth-token`;
  const raw = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  if (raw.length <= 3180) return `${name}=${raw}`;
  const chunks = raw.match(/.{1,3180}/g) ?? [];
  return chunks.map((c, i) => `${name}.${i}=${c}`).join("; ");
}

async function post(cookie: string, body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${BASE}/api/staff/create`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function findAuthByEmail(email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const hit = list.users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (list.users.length < 200) return null;
  }
  return null;
}

// 生成 users 行（email 配列）を user_id 起点で全消し＋対応する auth user も削除
async function wipeUsersByEmails(emails: string[]) {
  if (!emails.length) return;
  const { data: rows } = await admin.from("users").select("id, auth_user_id, email").in("email", emails);
  for (const r of rows ?? []) {
    await admin.from("memberships").delete().eq("user_id", r.id as string);
    await admin.from("users").delete().eq("id", r.id as string);
    await admin.auth.admin.deleteUser(r.auth_user_id as string).catch(() => undefined);
  }
  // users 行が無い（補償済み等）auth 孤児も email で掃除
  for (const em of emails) {
    const orphan = await findAuthByEmail(em);
    if (orphan) await admin.auth.admin.deleteUser(orphan).catch(() => undefined);
  }
}

async function waitForServer(timeoutMs = 90_000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      await fetch(`${BASE}/api/staff/create`, { method: "GET" });
      return true; // 何かしら HTTP 応答があればサーバは起動済み（POST 専用 route の GET は 405）
    } catch {
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
  return false;
}

async function main() {
  console.log("smoke:staff-create 開始（dev サーバ待機中…）");
  if (!(await waitForServer())) {
    console.error("✗ dev サーバ（localhost:3200）に接続できません。npm run dev を起動してください。");
    process.exit(1);
  }

  // ── 準備: 店 id・owner セッション cookie・org id ──
  const { data: storeRows } = await admin.from("stores").select("id, org_id, name").eq("name", STORE_A1);
  const storeA1 = storeRows?.[0];
  if (!storeA1) { console.error("✗ NOX-VERIFY-A1 店が見つかりません（seed:f0 実行済みか確認）"); process.exit(1); }
  const org8 = (storeA1.org_id as string).replace(/-/g, "").slice(0, 8);

  const ownerC = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error: eSign } = await ownerC.auth.signInWithPassword({
    email: FIXTURE_USERS.ownerA.email, password: env.SEED_PASSWORD,
  });
  if (eSign || !signIn.session) { console.error(`✗ ownerA サインイン失敗: ${eSign?.message}`); process.exit(1); }
  const cookie = buildCookie(signIn.session);

  // idemKey → 合成 email（route の導出と同式・S1/S2/S5 の物理確認に使う）
  const K1 = randomUUID();
  const K3 = randomUUID();
  const synth = (k: string) => `s-${k.replace(/-/g, "").slice(0, 8).toLowerCase()}@o-${org8}.nox.local`;
  const createdEmails: string[] = [synth(K1), REAL_EMAIL, synth(K3)];

  // 前回遺物の掃除（再実行冪等・org A の合成 email 遺物も）
  {
    const { data: oldSynth } = await admin.from("users").select("email")
      .eq("org_id", storeA1.org_id).like("email", "s-%@o-%.nox.local");
    await wipeUsersByEmails([...new Set([...createdEmails, ...(oldSynth ?? []).map((r) => r.email as string)])]);
  }

  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  try {
    // ═══ S1: email 空 → 合成 email・auth 生成・membership 生成・初期パスワード ═══
    console.log("S1: email 空（合成 email 自動生成）");
    const r1 = await post(cookie, { name: "スモーク黒服1", storeId: storeA1.id, role: "staff", idemKey: K1 });
    check("S1 200 応答", r1.status === 200, `status=${r1.status} body=${JSON.stringify(r1.json)}`);
    const login1 = r1.json.login_email as string | undefined;
    const pw1 = r1.json.initial_password as string | undefined;
    check("S1 login_email = 合成形式（idemKey 由来 8桁・o-<org8>.nox.local）", login1 === synth(K1), `got ${login1}`);
    check("S1 initial_password 16文字返却（一度だけ）", typeof pw1 === "string" && pw1.length === 16, `got ${JSON.stringify(pw1)}`);
    const { data: u1 } = await admin.from("users").select("id, auth_user_id").eq("email", synth(K1));
    check("S1 users 1行生成", (u1 ?? []).length === 1, `got ${(u1 ?? []).length}`);
    const { data: m1 } = await admin.from("memberships")
      .select("store_id, role, is_active, can_register, can_crm, can_shift").eq("id", r1.json.membership_id as string).single();
    check("S1 membership = A1 staff active・フラグ全 false（fail-closed）",
      m1?.store_id === storeA1.id && m1?.role === "staff" && m1?.is_active === true
        && m1?.can_register === false && m1?.can_crm === false && m1?.can_shift === false,
      JSON.stringify(m1));
    const { data: au1 } = await admin.auth.admin.getUserById(u1![0].auth_user_id as string);
    check("S1 auth user 実在（admin.createUser が本当に効いている）", au1?.user?.email === synth(K1), JSON.stringify(au1?.user?.email));

    // ═══ S2: 二重 POST（同 idemKey）→ 409・二重作成なし ═══
    console.log("S2: 二重 POST（同 idemKey）");
    const r2 = await post(cookie, { name: "スモーク黒服1", storeId: storeA1.id, role: "staff", idemKey: K1 });
    check("S2 リプレイ = 409", r2.status === 409, `status=${r2.status} body=${JSON.stringify(r2.json)}`);
    const { data: u1b } = await admin.from("users").select("id").eq("email", synth(K1));
    check("S2 二重作成なし（users 1行のまま）", (u1b ?? []).length === 1, `got ${(u1b ?? []).length}`);

    // ═══ S3: 実 email 入力 → その email が login_email に ═══
    console.log("S3: 実 email 入力");
    const r3 = await post(cookie, { name: "スモーク黒服2", email: REAL_EMAIL, storeId: storeA1.id, role: "staff", idemKey: randomUUID() });
    check("S3 200 応答", r3.status === 200, `status=${r3.status} body=${JSON.stringify(r3.json)}`);
    check("S3 login_email = 入力した実 email", r3.json.login_email === REAL_EMAIL, `got ${r3.json.login_email}`);
    check("S3 initial_password 返却", typeof r3.json.initial_password === "string" && (r3.json.initial_password as string).length === 16);

    // ═══ S4: 作成スタッフで実ログイン（S1 の合成 email＋初期パスワード）═══
    console.log("S4: 作成スタッフで実ログイン");
    const staffC = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: eStaffSign } = await staffC.auth.signInWithPassword({ email: login1!, password: pw1! });
    check("S4 合成 email＋初期パスワードで signIn 成功", !eStaffSign, eStaffSign?.message);
    if (!eStaffSign) {
      const { data: roleStaff } = await staffC.rpc("auth_role");
      check("S4 auth_role='staff'（auth→users→memberships 連鎖が生きている）", roleStaff === "staff", `got ${JSON.stringify(roleStaff)}`);
      await staffC.auth.signOut();
    }

    // ═══ S5: ★補償（決定論的フォールト注入＝EXECUTE を一時 revoke）═══
    console.log("S5: 補償（RPC 強制失敗 → auth user 巻き戻し）");
    try {
      await db.query(`revoke execute on function public.staff_create(uuid, text, text, uuid, text) from authenticated`);
      const r5 = await post(cookie, { name: "スモーク補償", storeId: storeA1.id, role: "staff", idemKey: K3 });
      check("S5 RPC 失敗で 500（createUser 成功後に RPC が permission denied）", r5.status === 500, `status=${r5.status} body=${JSON.stringify(r5.json)}`);
      const { data: u5 } = await admin.from("users").select("id").eq("email", synth(K3));
      check("S5 users 行なし（DB 未着手）", (u5 ?? []).length === 0, `got ${(u5 ?? []).length}`);
      const orphan = await findAuthByEmail(synth(K3));
      check("S5 ★補償: auth user が deleteUser で巻き戻り（孤児なし）", orphan === null, `orphan auth id=${orphan}`);
    } finally {
      await db.query(`grant execute on function public.staff_create(uuid, text, text, uuid, text) to authenticated`);
    }
    const { rows: aclRows } = await db.query(
      `select has_function_privilege('authenticated','public.staff_create(uuid,text,text,uuid,text)','execute') as ok`,
    );
    check("S5 復元確認: staff_create EXECUTE = authenticated 復帰（grants G14 前提の非汚染）", aclRows[0]?.ok === true, JSON.stringify(aclRows));
  } finally {
    // ── 掃除: 生成 users/memberships/auth users を全消し ──
    await wipeUsersByEmails(createdEmails);
    await ownerC.auth.signOut();
    await db.end();
  }

  const { data: left } = await admin.from("users").select("id").in("email", createdEmails);
  check("掃除確認: スモーク生成 users 0行", (left ?? []).length === 0, `got ${(left ?? []).length}`);

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    process.exit(1);
  }
  console.log(`smoke:staff-create ALL PASS (${pass} assertions)`);
}

main().catch((e) => {
  console.error("✗ 異常終了", e);
  process.exit(1);
});
