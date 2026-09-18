// ★夜間便 N7-6（裁定273／277・2026-09-18）: 公開デモ org 4 本の作成スクリプト。
//   作るもの（org ごと）: orgs（is_demo=true）・org_billing（seed-f0 型の upsert {org_id, status:'active'}・on conflict ignore）・
//   users 3（owner／manager／cast）＋ auth ユーザー 3（email_confirm・パスワードはランダム＝どこにも出さない・入場は magiclink）。
//   ★stores／memberships／casts は作らない＝録画の再生（demo_org_reset の load）が供給する（users は残す 3 表の 1 つ）。
//   使い方: node scripts/demo/create-demo-orgs.mjs --dry-run   … 作る行の一覧を出すだけ（本便で実行するのはこれだけ）
//           node scripts/demo/create-demo-orgs.mjs --apply     … 実際に作る（本便では実行しない・実行後に DEMO_USERS の対応表を出力）
//   env: .env.local（NEXT_PUBLIC_SUPABASE_URL／SUPABASE_SECRET_KEY）。dev 以外の ref では実行しない（URL の ref を目視）。
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
process.loadEnvFile(".env.local");

const MODE = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry-run" : null;
if (!MODE) { console.error("usage: node scripts/demo/create-demo-orgs.mjs --dry-run | --apply"); process.exit(2); }

const BIZ = [
  { key: "cabaret", org: "NOX-DEMO-CABARET", label: "キャバクラ" },
  { key: "girlsbar", org: "NOX-DEMO-GIRLSBAR", label: "ガールズバー" },
  { key: "snack", org: "NOX-DEMO-SNACK", label: "スナック" },
  { key: "lounge", org: "NOX-DEMO-LOUNGE", label: "ラウンジ" },
];
const ROLES = [
  { key: "owner", name: "デモ オーナー" },
  { key: "manager", name: "デモ 店長" },
  { key: "cast", name: "デモ キャスト" },
];
const emailOf = (biz, role) => `demo-${biz}-${role}@nox-demo.local`; // 合成 email（ログインは magiclink＝入場 route が生成）

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) { console.error("env NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY が必要です"); process.exit(2); }
const ref = (url.match(/https?:\/\/([a-z0-9]+)\./) ?? [])[1] ?? "?";
console.log(`mode=${MODE} ref=${ref}`);

const plan = [];
for (const b of BIZ) {
  plan.push({ table: "orgs", row: { name: b.org, is_demo: true } });
  plan.push({ table: "org_billing", row: { org_id: `<${b.org}.id>`, status: "active" }, note: "upsert onConflict org_id ignoreDuplicates" });
  for (const r of ROLES) {
    plan.push({ table: "auth.users", row: { email: emailOf(b.key, r.key), email_confirm: true, password: "<random・出力しない>" } });
    plan.push({ table: "users", row: { org_id: `<${b.org}.id>`, auth_user_id: `<auth ${emailOf(b.key, r.key)}>`, email: emailOf(b.key, r.key), name: r.name } });
  }
}
console.log(`作る行: ${plan.length}（orgs 4／org_billing 4／auth.users 12／users 12）`);
for (const p of plan) console.log(`  ${p.table.padEnd(12)} ${JSON.stringify(p.row)}${p.note ? `  -- ${p.note}` : ""}`);
console.log("作らないもの: stores／memberships／casts（録画の再生＝demo_org_reset load が供給）・vercel.json の cron（裁定276-5）");

if (MODE === "dry-run") { console.log("dry-run: 何も書いていません"); process.exit(0); }

// ── --apply（本便では実行しない）──
const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const die = (m, e) => { console.error("✗", m, e?.message ?? e ?? ""); process.exit(1); };
async function ensureAuthUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: randomBytes(24).toString("base64url"), email_confirm: true });
  if (!error && data.user) return data.user.id;
  for (let page = 1; page <= 20; page++) {
    const { data: list, error: e } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (e) die("listUsers 失敗", e);
    const hit = list.users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (list.users.length < 200) break;
  }
  die(`auth ユーザー作成も検索も失敗: ${email}`, error);
}
const demoUsers = {};
for (const b of BIZ) {
  const { data: existing } = await admin.from("orgs").select("id, is_demo").eq("name", b.org).maybeSingle();
  let orgId = existing?.id;
  if (existing && existing.is_demo !== true) die(`${b.org} は既に存在し is_demo=false＝本番 org の可能性。中止`);
  if (!orgId) {
    const { data: created, error } = await admin.from("orgs").insert({ name: b.org, is_demo: true }).select("id").single();
    if (error || !created) die(`orgs 投入失敗 ${b.org}`, error);
    orgId = created.id;
  }
  const { error: eOb } = await admin.from("org_billing").upsert({ org_id: orgId, status: "active" }, { onConflict: "org_id", ignoreDuplicates: true });
  if (eOb) die("org_billing 投入失敗", eOb);
  for (const r of ROLES) {
    const email = emailOf(b.key, r.key);
    const authId = await ensureAuthUser(email);
    const { data: u } = await admin.from("users").select("id").eq("auth_user_id", authId).maybeSingle();
    if (!u) {
      const { error: eU } = await admin.from("users").insert({ org_id: orgId, auth_user_id: authId, email, name: r.name });
      if (eU) die(`users 投入失敗 ${email}`, eU);
    }
    demoUsers[`${b.key}:${r.key}`] = authId;
  }
  console.log(`✓ ${b.org} ${orgId}`);
}
// env へ貼る対応表（auth user id のみ＝資格情報ではない）。Vercel の env DEMO_USERS に設定する
console.log("DEMO_USERS=" + JSON.stringify(demoUsers));
