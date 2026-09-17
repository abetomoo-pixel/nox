/**
 * verify:nox-staff-email — スタッフのメール（ログイン ID）変更（裁定267-2・admin route・mig 0）
 *   npm run verify:nox-staff-email（env: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY / SEED_PASSWORD）
 *
 *  dev サーバ依存の HTTP 直叩きは入れない＝route の中身（lib/nox/staff/update-email.ts）を純関数＋admin client 直叩きで固定する。
 *  (1) parse（純関数・400 系・lower/trim 正規化）
 *  (2) decideOwnerAccess（kiosk/provision guardOwner の判定式＝manager／staff／cast／org 無しは 403）
 *  (3) decideEmailTarget（不在・他 org・owner 自身・cast・membership 無しは 403）
 *  (4) 直 SELECT／UPDATE の遮断: anon と manager／owner の users.email 直 UPDATE は通らない（唯一の書込経路が admin route であること）
 *  (5) performUpdateEmail（実 admin・NOX-VERIFY-A に一時 staff を作って実測）:
 *      他 org 403／owner 自身 403／cast 403／重複 409（org 内）／auth 重複 409（他 org の auth email）／
 *      成功＝auth.users.email と public.users.email が同値／同値の再送 409／membership 解除後 403／
 *      補償＝public 側の UPDATE を故意に失敗させ auth が退避値へ戻る
 *  逆テスト 3 本（手動・各 1 回）: owner 自身許可→se(5-2) 赤／重複許可→se(5-4) 赤／補償を外す→se(5-9b) 赤。
 *  fixture は finally で全消し（memberships→users→auth）。audit は書かない（RPC を呼ばない）。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { FIXTURE_USERS, ORG_A, ORG_B, STORE_A1, loadEnvOrExit } from "./fixtures-f0";
import { decideEmailTarget, decideOwnerAccess, parseUpdateEmailBody, performUpdateEmail } from "../lib/nox/staff/update-email";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SEED_PASSWORD"]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

// ── (1) parse（DB 非依存）──
function parseChecks() {
  const uid = "11111111-2222-4333-8444-555555555555";
  const bad = (b: unknown) => { const r = parseUpdateEmailBody(b); return r.ok ? "ok?!" : `${r.status} ${r.error}`; };
  check("se(1-1) userId 欠落は 400", bad({ email: "a@b.co" }) === "400 userId required (uuid)", bad({ email: "a@b.co" }));
  check("se(1-2) userId 非 uuid は 400", bad({ userId: "x", email: "a@b.co" }) === "400 userId required (uuid)");
  check("se(1-3) email 欠落は 400", bad({ userId: uid }) === "400 email required");
  check("se(1-4) email 空白のみは 400", bad({ userId: uid, email: "   " }) === "400 email required");
  check("se(1-5) email 形式不正は 400", bad({ userId: uid, email: "no-at-sign" }) === "400 bad email format");
  check("se(1-6) email 256 字は 400", bad({ userId: uid, email: `${"a".repeat(250)}@b.com` }) === "400 bad email format");
  const ok = parseUpdateEmailBody({ userId: uid, email: "  Staff.Two@Example.COM " });
  check("se(1-7) lower/trim 正規化（staff/create と同一）", ok.ok && ok.value.email === "staff.two@example.com" && ok.value.userId === uid, JSON.stringify(ok));
  check("se(1-8) null body は 400（例外にしない）", bad(null).startsWith("400"));
}

// ── (2) owner 限定（kiosk/provision guardOwner の判定式）──
function ownerChecks() {
  const org = "o";
  check("se(2-1) owner＋org は ok", decideOwnerAccess("owner", org).ok);
  check("se(2-2) manager は 403", !decideOwnerAccess("manager", org).ok);
  check("se(2-3) staff は 403", !decideOwnerAccess("staff", org).ok);
  check("se(2-4) cast は 403", !decideOwnerAccess("cast", org).ok);
  check("se(2-5) owner でも org 無しは 403", !decideOwnerAccess("owner", null).ok && !decideOwnerAccess("owner", "").ok);
  check("se(2-6) null role は 403", !decideOwnerAccess(null, org).ok);
}

// ── (3) 対象判定（純関数）──
function targetChecks() {
  const r = (t: { found: boolean; sameOrg: boolean; role: string | null }) => { const d = decideEmailTarget(t); return d.ok ? "ok" : `${d.status} ${d.error}`; };
  check("se(3-1) staff は ok", r({ found: true, sameOrg: true, role: "staff" }) === "ok");
  check("se(3-2) manager は ok", r({ found: true, sameOrg: true, role: "manager" }) === "ok");
  check("se(3-3) owner（自身）は 403 forbidden target", r({ found: true, sameOrg: true, role: "owner" }) === "403 forbidden target");
  check("se(3-4) cast は 403", r({ found: true, sameOrg: true, role: "cast" }) === "403 forbidden target");
  check("se(3-5) membership 無し（null）は 403", r({ found: true, sameOrg: true, role: null }) === "403 forbidden target");
  check("se(3-6) 他 org は 403 forbidden user", r({ found: true, sameOrg: false, role: "staff" }) === "403 forbidden user");
  check("se(3-7) 不在は 403 forbidden user", r({ found: false, sameOrg: false, role: null }) === "403 forbidden user");
}

async function main() {
  parseChecks();
  ownerChecks();
  targetChecks();

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  async function login(key: keyof typeof FIXTURE_USERS): Promise<SupabaseClient> {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか確認）: ${error.message}`); process.exit(1); }
    return c;
  }

  // org／store／既存 user の解決
  const orgRow = async (name: string) => (await admin.from("orgs").select("id").eq("name", name).single()).data?.id as string;
  const orgA = await orgRow(ORG_A);
  const orgB = await orgRow(ORG_B);
  const storeA1 = (await admin.from("stores").select("id").eq("name", STORE_A1).single()).data?.id as string;
  const userByEmail = async (email: string) => (await admin.from("users").select("id, auth_user_id, email, org_id").eq("email", email).single()).data as { id: string; auth_user_id: string; email: string; org_id: string };
  const ownerA = await userByEmail(FIXTURE_USERS.ownerA.email);
  const staffA1 = await userByEmail(FIXTURE_USERS.staffA1.email);
  const castA1a = await userByEmail(FIXTURE_USERS.castA1a.email);
  const managerB1 = await userByEmail(FIXTURE_USERS.managerB1.email);
  if (!orgA || !orgB || !storeA1 || !ownerA || !staffA1 || !castA1a || !managerB1) { console.error("✗ fixture 解決失敗（seed:f0 実行済みか確認）"); process.exit(1); }

  // ── (4) 直 UPDATE の遮断（唯一の書込経路が admin route であること） ──
  {
    const target = staffA1.id;
    const a = await anon.from("users").update({ email: "x@example.com" }).eq("id", target).select("id");
    check("se(4-1) anon の users.email 直 UPDATE は通らない", a.error !== null || (a.data ?? []).length === 0, a.error?.message ?? JSON.stringify(a.data));
    const mgr = await login("managerA1");
    const m = await mgr.from("users").update({ email: "x@example.com" }).eq("id", target).select("id");
    check("se(4-2) manager の users.email 直 UPDATE は通らない（書込ポリシー無し）", m.error !== null || (m.data ?? []).length === 0, m.error?.message ?? JSON.stringify(m.data));
    const own = await login("ownerA");
    const o = await own.from("users").update({ email: "x@example.com" }).eq("id", target).select("id");
    check("se(4-3) owner でも直 UPDATE は通らない（route の admin 経由のみ）", o.error !== null || (o.data ?? []).length === 0, o.error?.message ?? JSON.stringify(o.data));
    const still = await userByEmail(FIXTURE_USERS.staffA1.email);
    check("se(4-4) staffA1 の email は不変", still?.id === target);
  }

  // ── (5) performUpdateEmail（実 admin・一時 staff） ──
  const tag = randomUUID().replace(/-/g, "").slice(0, 8);
  const email0 = `nox-verify-se-${tag}@example.com`;
  const email1 = `nox-verify-se-${tag}-new@example.com`;
  let authId: string | null = null;
  let userId: string | null = null;
  let memId: string | null = null;
  const authEmail = async (id: string) => (await admin.auth.admin.getUserById(id)).data.user?.email ?? null;
  const pubEmail = async (id: string) => (await admin.from("users").select("email").eq("id", id).single()).data?.email as string | null;
  try {
    const { data: cu, error: eCu } = await admin.auth.admin.createUser({ email: email0, password: env.SEED_PASSWORD, email_confirm: true });
    if (eCu || !cu?.user) { console.error(`✗ 一時 auth 作成失敗: ${eCu?.message}`); process.exit(1); }
    authId = cu.user.id;
    const { data: ur, error: eUr } = await admin.from("users").insert({ org_id: orgA, auth_user_id: authId, email: email0, name: `SE ${tag}` }).select("id").single();
    if (eUr || !ur) { console.error(`✗ 一時 users 作成失敗: ${eUr?.message}`); process.exit(1); }
    userId = ur.id as string;
    const { data: mr, error: eMr } = await admin.from("memberships").insert({ user_id: userId, store_id: storeA1, role: "staff", is_active: true }).select("id").single();
    if (eMr || !mr) { console.error(`✗ 一時 membership 作成失敗: ${eMr?.message}`); process.exit(1); }
    memId = mr.id as string;

    const r1 = await performUpdateEmail(admin, { orgId: orgB, userId, email: email1 });
    check("se(5-1) ★他 org（orgB の owner 文脈）から A の staff は 403", r1.status === 403 && r1.body.error === "forbidden user", JSON.stringify(r1));
    const r2 = await performUpdateEmail(admin, { orgId: orgA, userId: ownerA.id, email: email1 });
    check("se(5-2) ★owner 自身（role=owner）は 403", r2.status === 403 && r2.body.error === "forbidden target", JSON.stringify(r2));
    check("se(5-2b) owner の email は不変", (await pubEmail(ownerA.id)) === FIXTURE_USERS.ownerA.email && (await authEmail(ownerA.auth_user_id)) === FIXTURE_USERS.ownerA.email);
    const r3 = await performUpdateEmail(admin, { orgId: orgA, userId: castA1a.id, email: email1 });
    check("se(5-3) cast は 403", r3.status === 403 && r3.body.error === "forbidden target", JSON.stringify(r3));
    const r4 = await performUpdateEmail(admin, { orgId: orgA, userId, email: FIXTURE_USERS.staffA1.email });
    check("se(5-4) ★org 内の既存 email は 409（先引き・auth 不触）", r4.status === 409 && r4.body.error === "email already registered in org", JSON.stringify(r4));
    check("se(5-4b) 409 後も auth／public とも元の値", (await authEmail(authId)) === email0 && (await pubEmail(userId)) === email0);
    const r5 = await performUpdateEmail(admin, { orgId: orgA, userId, email: FIXTURE_USERS.managerB1.email });
    check("se(5-5) 他 org で使用中の email は auth 側で 409（org 内先引きは通る）", r5.status === 409 && r5.body.error === "email already registered (auth)", JSON.stringify(r5));
    check("se(5-5b) auth 409 後も auth／public とも元の値", (await authEmail(authId)) === email0 && (await pubEmail(userId)) === email0);
    const r6 = await performUpdateEmail(admin, { orgId: orgA, userId, email: email1 });
    check("se(5-6) ★成功＝200・old_email＝旧値", r6.status === 200 && r6.body.email === email1 && r6.body.old_email === email0 && r6.body.user_id === userId, JSON.stringify(r6));
    const a6 = await authEmail(authId);
    const p6 = await pubEmail(userId);
    check("se(5-6b) ★auth.users.email と public.users.email が同値＝新 email", a6 === email1 && p6 === email1, `auth=${a6} public=${p6}`);
    const r7 = await performUpdateEmail(admin, { orgId: orgA, userId, email: email1 });
    check("se(5-7) 同値の再送は 409（org 内先引きが自分の行に当たる）", r7.status === 409, JSON.stringify(r7));
    const r8 = await performUpdateEmail(admin, { orgId: orgA, userId, email: " " });
    check("se(5-8) 空 email を素通しさせても先引き 0 件→auth 側で拒否＝200 にならない（route では parse が 400 で先に止める）", r8.status !== 200, JSON.stringify(r8));
    check("se(5-8b) 失敗後も auth／public とも新 email のまま", (await authEmail(authId)) === email1 && (await pubEmail(userId)) === email1);

    // 補償: public 側の UPDATE だけ失敗する admin を注入（select／auth は実物）
    const email2 = `nox-verify-se-${tag}-comp@example.com`;
    const failing = {
      auth: admin.auth,
      from: (table: string) => {
        const real = admin.from(table);
        return {
          select: real.select.bind(real),
          update: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: null, error: { message: "injected failure" } }) }) }) }),
        };
      },
    } as unknown as SupabaseClient;
    const r9 = await performUpdateEmail(failing, { orgId: orgA, userId, email: email2 });
    check("se(5-9) ★public 失敗は 500・auth_reverted=true", r9.status === 500 && r9.body.auth_reverted === true && String(r9.body.error).includes("auth reverted"), JSON.stringify(r9));
    const a9 = await authEmail(authId);
    const p9 = await pubEmail(userId);
    check("se(5-9b) ★補償＝auth.users.email が退避値（変更前）に戻り public と同値", a9 === email1 && p9 === email1, `auth=${a9} public=${p9}`);

    // membership を解除すると 403（アクティブ membership を持たない user は対象外）
    await admin.from("memberships").update({ is_active: false }).eq("id", memId);
    const r10 = await performUpdateEmail(admin, { orgId: orgA, userId, email: email2 });
    check("se(5-10) 在籍解除後は 403（アクティブ membership 無し）", r10.status === 403 && r10.body.error === "forbidden target", JSON.stringify(r10));
  } finally {
    // ★固定 fixture の防御的復元: 逆テスト（owner 自身／cast を許可する壊し方）で ownerA／castA1a の email が実際に書き換わると
    //   以後の sign-in が全滅する（2026-09-17 実測）。email が fixture 値と違えば auth→public の順で戻す（正常時は no-op）。
    for (const fx of [ownerA, castA1a]) {
      const cur = (await admin.from("users").select("email").eq("id", fx.id).single()).data?.email as string | undefined;
      const auE = (await admin.auth.admin.getUserById(fx.auth_user_id)).data.user?.email;
      if (cur !== fx.email || auE !== fx.email) {
        await admin.auth.admin.updateUserById(fx.auth_user_id, { email: fx.email, email_confirm: true });
        await admin.from("users").update({ email: fx.email }).eq("id", fx.id);
        check(`se(fin-fx) 固定 fixture ${fx.email} の email が書き換わっていたため復元した（逆テスト由来なら想定内・本走行なら要調査）`, false, `public=${cur} auth=${auE}`);
      }
    }
    // 掃除: memberships → users → auth（逆順・残さない）
    if (memId) await admin.from("memberships").delete().eq("id", memId);
    if (userId) await admin.from("users").delete().eq("id", userId);
    if (authId) await admin.auth.admin.deleteUser(authId);
    const left = await admin.from("users").select("id").like("email", `nox-verify-se-${tag}%`);
    check("se(fin) fixture 残存 0（users）", (left.data ?? []).length === 0, JSON.stringify(left.data));
    const leftAuth = authId ? (await admin.auth.admin.getUserById(authId)).data.user : null;
    check("se(fin-2) fixture 残存 0（auth）", !leftAuth);
  }

  if (fails.length) {
    console.log(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.log(` - ${f}`);
    process.exit(1);
  }
  console.log(`verify:nox-staff-email ALL PASS (${pass} assertions)`);
  console.log("裁定267-2: parse 400 系・owner 限定（guardOwner 同式）・対象判定・直 UPDATE 遮断（anon/manager/owner）・admin 実測（他 org/owner 自身/cast 403・org 内 409・auth 409・成功で auth=public・同値 409・補償で auth 復帰・解除後 403）・fixture 全消し");
}

main().catch((e) => { console.error(e); process.exit(1); });
