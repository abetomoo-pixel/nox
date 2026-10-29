// ★便 OB-2 ⑧（2026-10-29）: 運営が本番で「org（会社）＋店 1 つ＋オーナーの招待」を作るスクリプト。
//   作るもの: orgs 1・org_billing 1（status 'active'＝seed と同じ・課金は Stripe 接続後に切替）・stores 1（settings_json {biz_type, setup_done:false}＝オーナーの初回ログインで /setup へ）・
//             auth ユーザー（inviteUserByEmail＝Supabase の招待メール・リンクの有効期限は Auth 設定「Email OTP expiration」・送り元は Supabase の既定 or カスタム SMTP）・
//             users 1（オーナー）・memberships 1（role owner）・audit_logs 1（create_org・Postgres 直結＝audit_log_write は内部専用）。
//   使い方: node scripts/admin/create-org.mjs --store "CLUB NOX" --type cabaret --email owner@example.com [--org "会社名"] [--site https://nox-kappa-eight.vercel.app] [--link] [--yes] [--dry-run]
//     --type: cabaret／girlsbar／snack／lounge／bar（初期設定 STEP 1 の既定）。--org 省略＝店名。--site 省略＝本番の URL（招待リンクの戻り先 /auth/set-password）。
//     --link: メールを送らず招待リンクを標準出力に出す（generateLink・dev の live 用）。--yes: 確認プロンプトを省略（CI 用）。--dry-run: 何も書かない。
//   柵: ①本番 ref（hiqbfagmkrdpmlqhkmsu）は NOX_PROD_CONFIRM=1 が無いと走らない ②運営の確認 1 回（y）③同じ email の users／auth が既にあれば止まる ④失敗したら作った行と auth を巻き戻す。
//   env: .env.local（NEXT_PUBLIC_SUPABASE_URL／SUPABASE_SECRET_KEY／SUPABASE_DB_URL）。
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import pg from "pg";
process.loadEnvFile(".env.local");

const PROD_REF = "hiqbfagmkrdpmlqhkmsu";
const TYPES = ["cabaret", "girlsbar", "snack", "lounge", "bar"];
const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(`--${k}`); return i >= 0 && !String(args[i + 1] ?? "").startsWith("--") ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
const store = opt("store"), type = opt("type", "cabaret"), email = (opt("email") ?? "").trim().toLowerCase(), orgName = opt("org", store), site = (opt("site", "https://nox-kappa-eight.vercel.app") ?? "").replace(/\/+$/, "");
const die = (m, e) => { console.error("✗", m, e?.message ?? e ?? ""); process.exit(1); };
if (!store || !email) { console.error("usage: node scripts/admin/create-org.mjs --store <店名> --type <cabaret|girlsbar|snack|lounge|bar> --email <オーナーのメール> [--org <会社名>] [--site <URL>] [--link] [--yes] [--dry-run]"); process.exit(2); }
if (!TYPES.includes(type)) die(`--type は ${TYPES.join("／")}`);
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) die("--email の形式");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, secret = process.env.SUPABASE_SECRET_KEY, dbUrl = process.env.SUPABASE_DB_URL;
if (!url || !secret || !dbUrl) die("env NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY / SUPABASE_DB_URL が必要です");
const ref = (url.match(/https?:\/\/([a-z0-9]+)\./) ?? [])[1] ?? "?";
const isProd = ref === PROD_REF;
console.log(`ref=${ref}${isProd ? "（本番）" : ""} store=${store} type=${type} org=${orgName} owner=${email} site=${site} mode=${flag("dry-run") ? "dry-run" : flag("link") ? "link" : "email"}`);
if (isProd && !flag("dry-run") && process.env.NOX_PROD_CONFIRM !== "1") die("本番 ref です。NOX_PROD_CONFIRM=1 を付けて実行してください（運営の確認）");
if (flag("dry-run")) { console.log("dry-run: orgs 1・org_billing 1・stores 1・auth 招待 1・users 1・memberships 1・audit 1 を作ります（何も書いていません）"); process.exit(0); }
if (!flag("yes")) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(`この内容で本番に org を作り、${email} に招待を送ります。よろしいですか？ (y/N) `); rl.close();
  if (a.trim().toLowerCase() !== "y") { console.log("中止しました"); process.exit(0); }
}

const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const made = { org: null, store: null, authUser: null, user: null, membership: null };
async function rollback(why) {
  console.error("✗", why, "→ 巻き戻します");
  if (made.membership) await admin.from("memberships").delete().eq("id", made.membership);
  if (made.user) await admin.from("users").delete().eq("id", made.user);
  if (made.authUser) { const { error } = await admin.auth.admin.deleteUser(made.authUser); if (error) console.error("  auth の削除に失敗（孤児＝手で消す）:", made.authUser, error.message); }
  if (made.store) await admin.from("stores").delete().eq("id", made.store);
  if (made.org) { await admin.from("org_billing").delete().eq("org_id", made.org); await admin.from("orgs").delete().eq("id", made.org); }
  process.exit(1);
}
// ③ 既存チェック
{
  const { data: u } = await admin.from("users").select("id, org_id").eq("email", email).limit(1);
  if (u && u.length) die(`users に同じメールが既にあります（org_id ${u[0].org_id}）`);
  const { data: o } = await admin.from("orgs").select("id").eq("name", orgName).limit(1);
  if (o && o.length) die(`orgs に同じ名前が既にあります（${o[0].id}）`);
}
// 1) org＋billing
{
  const { data, error } = await admin.from("orgs").insert({ name: orgName }).select("id").single();
  if (error || !data) die("orgs の作成", error); made.org = data.id;
  const { error: eB } = await admin.from("org_billing").upsert({ org_id: made.org, status: "active" }, { onConflict: "org_id", ignoreDuplicates: true });
  if (eB) await rollback(`org_billing: ${eB.message}`);
}
// 2) store
{
  const { data, error } = await admin.from("stores").insert({ org_id: made.org, name: store, short: store.slice(0, 8), settings_json: { biz_type: type, setup_done: false } }).select("id").single();
  if (error || !data) await rollback(`stores: ${error?.message}`); made.store = data.id;
}
// 3) auth 招待
let inviteLink = null;
{
  const redirectTo = `${site}/auth/set-password`;
  if (flag("link")) {
    const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo, data: { role: "owner", store } } });
    if (error || !data?.user) await rollback(`generateLink: ${error?.message}`);
    made.authUser = data.user.id; inviteLink = data.properties?.action_link ?? null;
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { role: "owner", store } });
    if (error || !data?.user) await rollback(`inviteUserByEmail: ${error?.message}`);
    made.authUser = data.user.id;
  }
}
// 4) users＋memberships
{
  const { data, error } = await admin.from("users").insert({ org_id: made.org, auth_user_id: made.authUser, email, name: "オーナー" }).select("id").single();
  if (error || !data) await rollback(`users: ${error?.message}`); made.user = data.id;
  const { data: m, error: eM } = await admin.from("memberships").insert({ user_id: made.user, store_id: made.store, role: "owner", can_register: false, can_crm: false, can_shift: false }).select("id").single();
  if (eM || !m) await rollback(`memberships: ${eM?.message}`); made.membership = m.id;
}
// 5) audit（Postgres 直結＝audit_log_write は内部専用・actor は null＝運営）
{
  const c = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    await c.query(`insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json) values ($1, $2, null, 'create_org', $3, null, $4::jsonb)`,
      [made.org, made.store, `orgs:${made.org}`, JSON.stringify({ org: orgName, store, biz_type: type, owner_email: email, invited_via: flag("link") ? "link" : "email", by: "scripts/admin/create-org.mjs" })]);
  } catch (e) { console.error("  audit の書込に失敗（org は作成済み）:", e.message); } finally { await c.end().catch(() => {}); }
}
console.log(`✓ 作成: org ${made.org}／store ${made.store}／auth ${made.authUser}／users ${made.user}／membership ${made.membership}`);
if (inviteLink) console.log(`招待リンク（1 回だけ・有効期限は Auth 設定）:\n${inviteLink}`);
else console.log(`招待メールを ${email} に送りました（送り元＝Supabase Auth の設定・リンクの有効期限＝Auth 設定「Email OTP expiration」）。開くと /auth/set-password → パスワード設定 → ログイン → 規約の同意 → 初期設定 STEP 1。`);
