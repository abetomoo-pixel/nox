// ★夜間便 N7-6（裁定273／277・2026-09-18）→ ★裁定328 追補1（便 D1・2026-10-02）: 公開デモ org 6 本（店ごと）の作成スクリプト。
//   作るもの（org ごと）: orgs（name NOX-DEMO-<CODE>・is_demo=true）・org_billing（status 'active'・upsert ignoreDuplicates＝課金ゲート外）・
//   auth ユーザー 5（owner／manager／staff／cast＋kiosk 端末ユーザー・email_confirm・パスワードはランダム＝どこにも出さない・入場は magiclink をサーバ内で消費）・
//   users 4（owner／manager／staff／cast＝残す 3 表の 1 つ。kiosk は users を持たない＝kiosk_devices.auth_user_id に結線）。
//   ★stores／memberships／casts／kiosk_devices は作らない＝payload（docs/demo/payload/<store>.json）の再生＝demo_org_reset の load が供給する。
//   使い方: node scripts/demo/create-demo-orgs.mjs --dry-run   … 作る行の一覧を出すだけ（本便＝D1 で実行するのはこれだけ・docs/demo/dry_run_20261002.md）
//           node scripts/demo/create-demo-orgs.mjs --apply     … 実際に作る（D2・Agoora の順＝0163 手貼り→Auth 設定→--apply→DEMO_USERS を Vercel env へ）
//   env: .env.local（NEXT_PUBLIC_SUPABASE_URL／SUPABASE_SECRET_KEY）。dev 以外の ref では実行しない（URL の ref を目視）。
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
process.loadEnvFile(".env.local");

const MODE = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry-run" : null;
if (!MODE) { console.error("usage: node scripts/demo/create-demo-orgs.mjs --dry-run | --apply"); process.exit(2); }

// 店 6（docs/demo/mapping_20261001.md §1・人は people の代表＝328 追補1 ④）
export const STORES = [
  { key: "muse", org: "NOX-DEMO-MUSE", label: "SNACK MUSE", cast: "さおり", staff: "田中" },
  { key: "luna", org: "NOX-DEMO-LUNA", label: "CLUB LUNA", cast: "みさき", staff: "山本" },
  { key: "noir", org: "NOX-DEMO-NOIR", label: "CLUB NOIR", cast: "あべ", staff: "鈴木" },
  { key: "ace", org: "NOX-DEMO-ACE", label: "CLUB ACE", cast: "ひなの", staff: "小林" },
  { key: "lily", org: "NOX-DEMO-LILY", label: "Girls Bar LILY", cast: "みく", staff: "松本" },
  { key: "nest", org: "NOX-DEMO-NEST", label: "BAR NEST", cast: "ケン", staff: "中村" },
];
export const ROLES = [
  { key: "owner", name: () => "デモ オーナー" },
  { key: "manager", name: () => "デモ 店長" },
  { key: "staff", name: (s) => s.staff },
  { key: "cast", name: (s) => s.cast },
];
export const emailOf = (store, role) => `demo-${store}-${role}@nox-demo.local`; // 合成 email（ログインは magiclink＝入場 route が生成・送信しない）

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) { console.error("env NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY が必要です"); process.exit(2); }
const ref = (url.match(/https?:\/\/([a-z0-9]+)\./) ?? [])[1] ?? "?";
console.log(`mode=${MODE} ref=${ref}`);

const plan = [];
for (const s of STORES) {
  plan.push({ table: "orgs", row: { name: s.org, is_demo: true } });
  plan.push({ table: "org_billing", row: { org_id: `<${s.org}.id>`, status: "active" }, note: "upsert onConflict org_id ignoreDuplicates（課金ゲート外）" });
  for (const r of ROLES) {
    plan.push({ table: "auth.users", row: { email: emailOf(s.key, r.key), email_confirm: true, password: "<random・出力しない>" } });
    plan.push({ table: "users", row: { org_id: `<${s.org}.id>`, auth_user_id: `<auth ${emailOf(s.key, r.key)}>`, email: emailOf(s.key, r.key), name: r.name(s) } });
  }
  plan.push({ table: "auth.users", row: { email: emailOf(s.key, "kiosk"), email_confirm: true, password: "<random・出力しない>" }, note: "kiosk 端末ユーザー（users 行なし・payload の kiosk_devices.auth_user_id に結線）" });
}
const n = (t) => plan.filter((p) => p.table === t).length;
console.log(`作る行: ${plan.length}（orgs ${n("orgs")}／org_billing ${n("org_billing")}／auth.users ${n("auth.users")}／users ${n("users")}）`);
for (const p of plan) console.log(`  ${p.table.padEnd(12)} ${JSON.stringify(p.row)}${p.note ? `  -- ${p.note}` : ""}`);
console.log("作らないもの: stores／memberships／casts／kiosk_devices（payload の再生＝demo_org_reset load が供給）・vercel.json の cron（裁定276-5）");
console.log("DEMO_USERS のキー: " + STORES.flatMap((s) => [...ROLES.map((r) => `${s.key}:${r.key}`), `${s.key}:kiosk`]).join(", "));

if (MODE === "dry-run") { console.log("dry-run: 何も書いていません"); process.exit(0); }

// ── --apply（D2・本便では実行しない）──
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
for (const s of STORES) {
  const { data: existing } = await admin.from("orgs").select("id, is_demo").eq("name", s.org).maybeSingle();
  let orgId = existing?.id;
  if (existing && existing.is_demo !== true) die(`${s.org} は既に存在し is_demo=false＝本番 org の可能性。中止`);
  if (!orgId) {
    const { data: created, error } = await admin.from("orgs").insert({ name: s.org, is_demo: true }).select("id").single();
    if (error || !created) die(`orgs 投入失敗 ${s.org}`, error);
    orgId = created.id;
  }
  const { error: eOb } = await admin.from("org_billing").upsert({ org_id: orgId, status: "active" }, { onConflict: "org_id", ignoreDuplicates: true });
  if (eOb) die("org_billing 投入失敗", eOb);
  for (const r of ROLES) {
    const email = emailOf(s.key, r.key);
    const authId = await ensureAuthUser(email);
    const { data: u } = await admin.from("users").select("id").eq("auth_user_id", authId).maybeSingle();
    if (!u) {
      const { error: eU } = await admin.from("users").insert({ org_id: orgId, auth_user_id: authId, email, name: r.name(s) });
      if (eU) die(`users 投入失敗 ${email}`, eU);
    }
    demoUsers[`${s.key}:${r.key}`] = authId;
  }
  demoUsers[`${s.key}:kiosk`] = await ensureAuthUser(emailOf(s.key, "kiosk"));
  console.log(`✓ ${s.org} ${orgId}`);
}
// env へ貼る対応表（auth user id のみ＝資格情報ではない）。Vercel の env DEMO_USERS に設定する
console.log("DEMO_USERS=" + JSON.stringify(demoUsers));
