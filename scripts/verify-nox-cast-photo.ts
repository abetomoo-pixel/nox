/**
 * verify:nox-cast-photo — 段P キャスト写真（mig0064/0065＋Storage cast-photos）の runtime 実証
 *   実行: npm run verify:nox-cast-photo（env: .env.local）
 *
 * ★0162（裁定329／329 追補1・2026-10-01）: policy は 4 本（insert／update／delete に cast 腕＋users 腕 u_{user_id}.jpg・select は org フォルダ）。段 (n)〜(r)＝users 腕の 4 象限・
 *   cast は u_ 不可・set_user_photo_updated_at／clear_user_photo／clear_cast_photo・storage.remove で実体が消える（delete policy の runtime 実証）・audit 3 action。
 * ★ポリシー定義の目視 ≠ runtime 緑：Storage RLS（0162 前は insert/update/select の3本・delete なし）と
 *   RPC set_cast_photo_updated_at の authz が「同一式で・実セッションで・両方」効いて初めて
 *   片肺状態（ファイルは置けたが打刻できない／その逆）が無いと言える。
 *
 * 段構成:
 *   ── Storage（バケット cast-photos・パス規約 {org_id}/{cast_id}.jpg）──
 *   (a) owner が自 org のキャスト写真をアップロードできる（insert ポリシー owner 腕）
 *   (b) 署名 URL 発行→実 GET 200＋バイト一致（private バケットの閲覧経路が生きている）
 *   (c) manager 自店キャストは上書きできる（update 腕）／★他店キャストは RLS 拒否
 *   (d) cast 本人は自分のファイルを上書きできる（filename=auth_cast_id().jpg 腕）
 *   (e) ★cast は他人のファイルを書けない（本人腕の限定が効いている）
 *   (f) anon はアップロードも署名 URL も不可
 *   (g) ★他 org からは署名 URL を発行できない（select ポリシーの org 境界）
 *   ── RPC set_cast_photo_updated_at（authz 4象限＋監査）──
 *   (h) owner 成功＝戻り値 timestamptz が casts.photo_updated_at に一致（round-trip）
 *   (i) manager 他店キャストは 'forbidden'（他 org は 'not found'）
 *   (j) cast 本人成功／他人は 'forbidden'
 *   (k) staff は 'forbidden'（黒服は写真を触れない＝storage 側にも staff 腕は無い）
 *   (l) anon は関数実行自体が不可（permission denied＝二重防御の revoke 面）
 *   (m) ★audit_logs に action='set_cast_photo' の行が実在（新 action 値が書ける＝CHECK 罠の runtime 実証）
 *
 * fixture: 他店キャスト1行を admin で動的生成→finally で全消し（storage 実体・photo_updated_at・audit 行も掃く）。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { FIXTURE_USERS, ORG_A, STORE_A1, STORE_A2, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
// Storage の RLS 拒否は経路で文言が揺れる（"row-level security" / "Unauthorized" / "access denied"）
const isAuthzErr = (e: { message?: string } | null) =>
  !!e && /security|unauthorized|denied|not.*found/i.test(e.message ?? "");

const BUCKET = "cast-photos";
const PHOTO_A2_NAME = "NOX-VERIFY-PHOTO-A2";
// 最小 JPEG（SOI+EOI）。バケットは contentType で締める＝中身の妥当性は問わない。バイト一致の照合にも使う。
const JPEG_1 = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const JPEG_2 = Buffer.from([0xff, 0xd8, 0x00, 0x11, 0x22, 0xff, 0xd9]);

async function signIn(key: keyof typeof FIXTURE_USERS): Promise<SupabaseClient> {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
  return c;
}

const path = (orgId: string, castId: string) => `${orgId}/${castId}.jpg`;
const upath = (orgId: string, userId: string) => `${orgId}/u_${userId}.jpg`; // ★0162（裁定329）: スタッフ写真＝同 bucket・u_ 接頭
const up = (c: SupabaseClient, p: string, body: Buffer) =>
  c.storage.from(BUCKET).upload(p, body, { upsert: true, contentType: "image/jpeg" });

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: org } = await admin.from("orgs").select("id").eq("name", ORG_A).single();
  const { data: sA2 } = await admin.from("stores").select("id").eq("name", STORE_A2).single();
  if (!org || !sA2) throw new Error("verify org/store が見つからない（seed:f0 未実行？）");
  const orgId = org.id as string;

  // 本人腕の主語＝castA1a / 「他人」＝castA1b（同店・cast 同士）。id はセッションの auth_cast_id() が正。
  const castCli = await signIn("castA1a");
  const { data: castIdRaw } = await castCli.rpc("auth_cast_id");
  const castId = castIdRaw as string;
  const castCliB = await signIn("castA1b");
  const { data: castIdBRaw } = await castCliB.rpc("auth_cast_id");
  const castIdB = castIdBRaw as string;
  if (!castId || !castIdB) throw new Error("auth_cast_id が引けない（cast 結線が壊れている）");

  // 他店（A2）キャスト＝manager 他店拒否の的。fixture に無いので動的生成（finally で削除）。
  const { data: castA2 } = await admin
    .from("casts")
    .insert({ org_id: orgId, store_id: sA2.id, name: PHOTO_A2_NAME })
    .select("id")
    .single();
  if (!castA2) throw new Error("fixture cast(A2) を作れない");
  const castIdA2 = castA2.id as string;

  const owner = await signIn("ownerA");
  const manager = await signIn("managerA1");
  const staff = await signIn("staffA1");
  const managerB = await signIn("managerB1");

  // ★0162: users.id（u_ パスの主語）＝セッションの auth uid → users 行。他店（A2）staff は users＋memberships を admin で動的生成（finally で削除）
  const uidOfSession = async (c: SupabaseClient) => (await c.auth.getUser()).data.user?.id as string;
  const userIdOf = async (authUid: string) => (await admin.from("users").select("id").eq("auth_user_id", authUid).single()).data?.id as string;
  const staffUserId = await userIdOf(await uidOfSession(staff));
  const managerUserId = await userIdOf(await uidOfSession(manager));
  const castUserId = await userIdOf(await uidOfSession(castCli));
  if (!staffUserId || !managerUserId || !castUserId) throw new Error("users.id が引けない（staff／manager／cast）");
  const { data: uA2 } = await admin
    .from("users")
    .insert({ org_id: orgId, auth_user_id: randomUUID(), email: `nox-verify-photo-a2-${Date.now()}@example.com`, name: "NOX-VERIFY-PHOTO-A2-STAFF" })
    .select("id")
    .single();
  if (!uA2) throw new Error("fixture user(A2 staff) を作れない");
  const staffA2UserId = uA2.id as string;
  await admin.from("memberships").insert({ user_id: staffA2UserId, store_id: sA2.id, role: "staff" });

  try {
    // ── Storage ──
    // (a) owner insert
    {
      const { error } = await up(owner, path(orgId, castId), JPEG_1);
      check("(a) owner が自orgキャストへアップロード", !error, error?.message);
    }
    // (b) 署名 URL → 実 GET → バイト一致
    {
      const { data, error } = await owner.storage.from(BUCKET).createSignedUrl(path(orgId, castId), 60);
      check("(b) owner が署名URLを発行できる", !error && !!data?.signedUrl, error?.message);
      if (data?.signedUrl) {
        const res = await fetch(data.signedUrl);
        const body = Buffer.from(await res.arrayBuffer());
        check("(b) 署名URLの GET が 200", res.status === 200, `status=${res.status}`);
        check("(b) 取得バイトが一致", body.equals(JPEG_1), `len=${body.length}`);
      }
    }
    // (c) manager: 自店=上書き可（update 腕）／他店=拒否
    {
      const { error: e1 } = await up(manager, path(orgId, castId), JPEG_2);
      check("(c) manager が自店キャストを上書きできる", !e1, e1?.message);
      const { error: e2 } = await up(manager, path(orgId, castIdA2), JPEG_1);
      check("(c) ★manager 他店キャストは RLS 拒否", isAuthzErr(e2), e2 ? e2.message : "エラーが出ない＝素通り");
    }
    // (d) cast 本人＝自分のファイルを上書きできる
    {
      const { error } = await up(castCli, path(orgId, castId), JPEG_1);
      check("(d) cast 本人が自分の写真を上書きできる", !error, error?.message);
    }
    // (e) cast が他人のファイル名では書けない
    {
      const { error } = await up(castCli, path(orgId, castIdB), JPEG_1);
      check("(e) ★cast は他人の写真を書けない", isAuthzErr(error), error ? error.message : "エラーが出ない＝素通り");
    }
    // (f) anon 全遮断
    {
      const { error: e1 } = await up(anon, path(orgId, castId), JPEG_1);
      check("(f) anon はアップロード不可", !!e1);
      const { error: e2, data } = await anon.storage.from(BUCKET).createSignedUrl(path(orgId, castId), 60);
      check("(f) anon は署名URL不可", !!e2 && !(data as { signedUrl?: string } | null)?.signedUrl);
    }
    // (g) 他 org は署名 URL を発行できない（select ポリシーの org 境界）
    {
      const { error, data } = await managerB.storage.from(BUCKET).createSignedUrl(path(orgId, castId), 60);
      check("(g) ★他orgは署名URLを発行できない", !!error && !(data as { signedUrl?: string } | null)?.signedUrl, error ? undefined : "発行できてしまう");
    }

    // ── RPC set_cast_photo_updated_at（4象限）──
    // (h) owner 成功＋round-trip
    {
      const { data, error } = await owner.rpc("set_cast_photo_updated_at", { p_cast_id: castId });
      check("(h) owner の打刻が成功", !error && !!data, error?.message);
      const { data: row } = await owner.from("casts").select("photo_updated_at").eq("id", castId).single();
      check(
        "(h) 戻り値と photo_updated_at が一致（round-trip）",
        !!row?.photo_updated_at && Date.parse(row.photo_updated_at as string) === Date.parse(data as string),
        `ret=${data} sel=${row?.photo_updated_at}`,
      );
    }
    // (i) manager: 他店='forbidden'／他org='not found'（org 照合が先＝存在探索に使えない）
    {
      const { error: e1 } = await manager.rpc("set_cast_photo_updated_at", { p_cast_id: castIdA2 });
      check("(i) ★manager 他店は 'forbidden'", has(e1, "forbidden"), e1?.message ?? "エラーが出ない＝素通り");
      const { error: e2 } = await managerB.rpc("set_cast_photo_updated_at", { p_cast_id: castId });
      check("(i) 他org は 'not found'", has(e2, "not found"), e2?.message ?? "エラーが出ない＝素通り");
    }
    // (j) cast: 本人成功／他人 'forbidden'
    {
      const { data, error } = await castCli.rpc("set_cast_photo_updated_at", { p_cast_id: castId });
      check("(j) cast 本人の打刻が成功", !error && !!data, error?.message);
      const { error: e2 } = await castCli.rpc("set_cast_photo_updated_at", { p_cast_id: castIdB });
      check("(j) ★cast 他人は 'forbidden'", has(e2, "forbidden"), e2?.message ?? "エラーが出ない＝素通り");
    }
    // (k) staff 拒否（storage 側にも staff 腕は無い＝UI でも出さない）
    {
      const { error } = await staff.rpc("set_cast_photo_updated_at", { p_cast_id: castId });
      check("(k) ★staff は 'forbidden'", has(error, "forbidden"), error?.message ?? "エラーが出ない＝素通り");
    }
    // (l) anon は実行自体が不可（revoke 面＝anon-guard と同型）
    {
      const { error } = await anon.rpc("set_cast_photo_updated_at", { p_cast_id: castId });
      check("(l) anon は permission denied", has(error, "permission denied"), error?.message ?? "エラーが出ない");
    }
    // (m) audit 行の実在（action='set_cast_photo' が書ける＝CHECK/enum 罠なしの runtime 実証）
    {
      const { data } = await admin
        .from("audit_logs")
        .select("id, action, target")
        .eq("org_id", orgId)
        .eq("action", "set_cast_photo")
        .eq("target", `casts:${castId}`);
      check("(m) ★audit action='set_cast_photo' が実在", (data ?? []).length >= 1, `rows=${(data ?? []).length}`);
    }

    // ── ★0162（裁定329／329 追補1）: スタッフ写真＝users 腕（u_{user_id}.jpg）・delete policy・clear_*（実 Storage で runtime 実証）──
    // (n) users 腕: staff 本人 OK・owner→manager OK・manager→自店 staff OK（update 腕＝上書き）
    {
      const { error: e1 } = await up(staff, upath(orgId, staffUserId), JPEG_1);
      check("(n) ★staff 本人が自分の u_ 写真をアップロードできる", !e1, e1?.message);
      const { error: e2 } = await up(owner, upath(orgId, managerUserId), JPEG_1);
      check("(n) ★owner がスタッフ（manager）の u_ 写真をアップロードできる", !e2, e2?.message);
      const { error: e3 } = await up(manager, upath(orgId, staffUserId), JPEG_2);
      check("(n) ★manager が自店 staff の u_ 写真を上書きできる", !e3, e3?.message);
    }
    // (o) users 腕の拒否: cast は u_ パス不可（自分の users 行でも）・staff は他人不可・manager は他店 staff 不可・他 org 不可
    {
      const { error: e1 } = await up(castCli, upath(orgId, castUserId), JPEG_1);
      check("(o) ★cast は u_ パスを使えない（自分の users 行でも RLS 拒否＝329 追補1）", isAuthzErr(e1), e1 ? e1.message : "エラーが出ない＝素通り");
      const { error: e2 } = await up(staff, upath(orgId, managerUserId), JPEG_1);
      check("(o) ★staff は他人の u_ 写真を書けない", isAuthzErr(e2), e2 ? e2.message : "エラーが出ない＝素通り");
      const { error: e3 } = await up(manager, upath(orgId, staffA2UserId), JPEG_1);
      check("(o) ★manager は他店 staff の u_ 写真を書けない", isAuthzErr(e3), e3 ? e3.message : "エラーが出ない＝素通り");
      const { error: e4 } = await up(managerB, upath(orgId, staffUserId), JPEG_1);
      check("(o) ★他 org は u_ 写真を書けない", isAuthzErr(e4), e4 ? e4.message : "エラーが出ない＝素通り");
    }
    // (p) RPC set_user_photo_updated_at／clear_user_photo（authz は policy と同一式）
    {
      const { data, error } = await staff.rpc("set_user_photo_updated_at", { p_user_id: staffUserId });
      const { data: row } = await admin.from("users").select("photo_updated_at").eq("id", staffUserId).single();
      check("(p) ★staff 本人の打刻が成功（round-trip）", !error && !!data && !!row?.photo_updated_at && Date.parse(row.photo_updated_at as string) === Date.parse(data as string), error?.message ?? `ret=${data} sel=${row?.photo_updated_at}`);
      const { error: e2 } = await manager.rpc("set_user_photo_updated_at", { p_user_id: staffA2UserId });
      check("(p) ★manager 他店 staff は 'forbidden'", has(e2, "forbidden"), e2?.message ?? "エラーが出ない＝素通り");
      const { error: e3 } = await castCli.rpc("set_user_photo_updated_at", { p_user_id: castUserId });
      check("(p) ★cast は自分の users 行でも 'forbidden'", has(e3, "forbidden"), e3?.message ?? "エラーが出ない＝素通り");
      const { error: e4 } = await managerB.rpc("set_user_photo_updated_at", { p_user_id: staffUserId });
      check("(p) 他 org は 'not found'", has(e4, "not found"), e4?.message ?? "エラーが出ない＝素通り");
      const { error: e5 } = await staff.rpc("clear_user_photo", { p_user_id: managerUserId });
      check("(p) ★staff は他人の clear_user_photo 不可 'forbidden'", has(e5, "forbidden"), e5?.message ?? "エラーが出ない＝素通り");
      const { error: e6 } = await staff.rpc("clear_user_photo", { p_user_id: staffUserId });
      const { data: row2 } = await admin.from("users").select("photo_updated_at").eq("id", staffUserId).single();
      check("(p) ★staff 本人の clear_user_photo で null", !e6 && row2?.photo_updated_at === null, e6?.message ?? `sel=${row2?.photo_updated_at}`);
    }
    // (q) delete policy＝storage.remove の runtime 実証: staff 本人が自分の u_ 実体を消せる・他人の実体は消えない・owner は cast の実体を消せる・cast 本人も消せる
    {
      const existsAdmin = async (p: string) => {
        const [folder, file] = [p.slice(0, p.indexOf("/")), p.slice(p.indexOf("/") + 1)];
        const { data } = await admin.storage.from(BUCKET).list(folder, { search: file });
        return (data ?? []).some((o) => o.name === file);
      };
      const { error: r1 } = await staff.storage.from(BUCKET).remove([upath(orgId, managerUserId)]);
      check("(q) ★staff は他人（manager）の u_ 実体を消せない（RLS＝実体が残る）", await existsAdmin(upath(orgId, managerUserId)), r1 ? r1.message : "remove はエラーなし＝RLS で 0 行");
      const { error: r2 } = await staff.storage.from(BUCKET).remove([upath(orgId, staffUserId)]);
      check("(q) ★staff 本人は自分の u_ 実体を消せる（削除で Storage 実体が消える）", !r2 && !(await existsAdmin(upath(orgId, staffUserId))), r2?.message ?? "実体が残っている");
      const { error: r3 } = await owner.storage.from(BUCKET).remove([path(orgId, castId)]);
      check("(q) ★owner はキャストの実体を消せる", !r3 && !(await existsAdmin(path(orgId, castId))), r3?.message ?? "実体が残っている");
      const { error: u2 } = await up(castCliB, path(orgId, castIdB), JPEG_1);
      const { error: r4 } = await castCliB.storage.from(BUCKET).remove([path(orgId, castIdB)]);
      check("(q) ★cast 本人は自分の実体を消せる", !u2 && !r4 && !(await existsAdmin(path(orgId, castIdB))), u2?.message ?? r4?.message ?? "実体が残っている");
      const { error: r5 } = await castCli.storage.from(BUCKET).remove([upath(orgId, managerUserId)]);
      check("(q) ★cast は u_ 実体を消せない", await existsAdmin(upath(orgId, managerUserId)), r5 ? r5.message : "remove はエラーなし＝RLS で 0 行");
    }
    // (r) clear_cast_photo: owner で null・cast 本人で null・他 cast／staff は 'forbidden'・audit 行
    {
      await owner.rpc("set_cast_photo_updated_at", { p_cast_id: castId });
      const { error: e1 } = await castCliB.rpc("clear_cast_photo", { p_cast_id: castId });
      check("(r) ★他 cast の clear_cast_photo は 'forbidden'", has(e1, "forbidden"), e1?.message ?? "エラーが出ない＝素通り");
      const { error: e2 } = await staff.rpc("clear_cast_photo", { p_cast_id: castId });
      check("(r) ★staff の clear_cast_photo は 'forbidden'", has(e2, "forbidden"), e2?.message ?? "エラーが出ない＝素通り");
      const { error: e3 } = await owner.rpc("clear_cast_photo", { p_cast_id: castId });
      const { data: row } = await admin.from("casts").select("photo_updated_at").eq("id", castId).single();
      check("(r) ★owner の clear_cast_photo で null", !e3 && row?.photo_updated_at === null, e3?.message ?? `sel=${row?.photo_updated_at}`);
      await castCli.rpc("set_cast_photo_updated_at", { p_cast_id: castId });
      const { error: e4 } = await castCli.rpc("clear_cast_photo", { p_cast_id: castId });
      const { data: row2 } = await admin.from("casts").select("photo_updated_at").eq("id", castId).single();
      check("(r) ★cast 本人の clear_cast_photo で null", !e4 && row2?.photo_updated_at === null, e4?.message ?? `sel=${row2?.photo_updated_at}`);
      const { data: au } = await admin.from("audit_logs").select("action").eq("org_id", orgId).in("action", ["set_user_photo", "clear_user_photo", "clear_cast_photo"]);
      const n = (a: string) => (au ?? []).filter((x) => x.action === a).length;
      check("(r) ★audit: set_user_photo 1・clear_user_photo 1・clear_cast_photo 2", n("set_user_photo") === 1 && n("clear_user_photo") === 1 && n("clear_cast_photo") === 2, JSON.stringify([n("set_user_photo"), n("clear_user_photo"), n("clear_cast_photo")]));
    }
  } finally {
    // fixture 全消し: storage 実体 → photo_updated_at リセット → audit 行 → fixture cast／user（service key）
    await admin.storage.from(BUCKET).remove([path(orgId, castId), path(orgId, castIdB), path(orgId, castIdA2), upath(orgId, staffUserId), upath(orgId, managerUserId), upath(orgId, castUserId), upath(orgId, staffA2UserId)]);
    await admin.from("casts").update({ photo_updated_at: null }).in("id", [castId, castIdB]);
    await admin.from("users").update({ photo_updated_at: null }).in("id", [staffUserId, managerUserId]);
    await admin.from("audit_logs").delete().eq("org_id", orgId).in("action", ["set_cast_photo", "clear_cast_photo", "set_user_photo", "clear_user_photo"]);
    await admin.from("casts").delete().eq("id", castIdA2);
    await admin.from("memberships").delete().eq("user_id", staffA2UserId);
    await admin.from("users").delete().eq("id", staffA2UserId);
  }

  // 成功行は他スイートと同書式（"ALL PASS (N assertions)"）に統一＝集計 grep から漏れない（2026-08 是正）
  for (const f of fails) console.error("  FAIL:", f);
  if (fails.length) {
    console.error(`verify:nox-cast-photo FAIL ${fails.length} / pass ${pass}`);
    process.exit(1);
  }
  console.log(`verify:nox-cast-photo ALL PASS (${pass} assertions)`);
}

main().catch((e) => {
  console.error("verify:nox-cast-photo 実行エラー:", e.message ?? e);
  process.exit(1);
});
