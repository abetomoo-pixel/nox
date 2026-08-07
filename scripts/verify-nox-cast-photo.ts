/**
 * verify:nox-cast-photo — 段P キャスト写真（mig0064/0065＋Storage cast-photos）の runtime 実証
 *   実行: npm run verify:nox-cast-photo（env: .env.local）
 *
 * ★ポリシー定義の目視 ≠ runtime 緑：Storage RLS（insert/update/select の3本・delete なし）と
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
  } finally {
    // fixture 全消し: storage 実体 → photo_updated_at リセット → audit 行 → fixture cast（service key）
    await admin.storage.from(BUCKET).remove([path(orgId, castId), path(orgId, castIdB), path(orgId, castIdA2)]);
    await admin.from("casts").update({ photo_updated_at: null }).in("id", [castId, castIdB]);
    await admin.from("audit_logs").delete().eq("org_id", orgId).eq("action", "set_cast_photo");
    await admin.from("casts").delete().eq("id", castIdA2);
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
