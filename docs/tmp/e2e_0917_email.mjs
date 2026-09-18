// 裁定267 手順 3: dev サーバ（3200）の /api/staff/update-email を実セッションの Cookie で叩く（読取＋一時変更→原状復帰）。
//   使い方: node docs/tmp/e2e_0917_email.mjs <mode>
//     mode=owner-demo : abetomoo@gmail.com（CLUB NOX owner）で SEED_PASSWORD を 1 回だけ試す（失敗なら報告して終了）
//     mode=run <ownerEmail> <targetEmail> <managerEmail> : 一連の実測（成功→同値確認→復帰／manager 403／owner 自身 403／重複 409）
import { createClient } from "@supabase/supabase-js";
process.loadEnvFile(".env.local");
const URL0 = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = URL0.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const BASE = "http://localhost:3200";
const admin = createClient(URL0, process.env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function cookieFor(email, password) {
  const c = createClient(URL0, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  // @supabase/ssr 0.6: 値は "base64-" + base64url(JSON(session))・encodeURIComponent 後 3180 字を超えると name.0 / name.1 … に分割
  const raw = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const name = `sb-${REF}-auth-token`;
  const enc = encodeURIComponent(raw);
  if (enc.length <= 3180) return { cookie: `${name}=${enc}` };
  const parts = [];
  let i = 0, n = 0;
  while (i < raw.length) { // 単純分割（base64url は % を含まないため境界問題なし）
    const piece = raw.slice(i, i + 3180);
    parts.push(`${name}.${n}=${encodeURIComponent(piece)}`);
    i += 3180; n += 1;
  }
  return { cookie: parts.join("; ") };
}
async function post(cookie, body) {
  const r = await fetch(`${BASE}/api/staff/update-email`, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch { j = null; }
  return { status: r.status, body: j };
}
const userBy = async (email) => (await admin.from("users").select("id, auth_user_id, email, org_id").eq("email", email).maybeSingle()).data;
const authEmail = async (id) => (await admin.auth.admin.getUserById(id)).data.user?.email;

const [mode, ownerEmail, targetEmail, managerEmail] = process.argv.slice(2);
if (mode === "owner-demo") {
  const r = await cookieFor("abetomoo@gmail.com", process.env.SEED_PASSWORD);
  console.log("owner-demo signin:", r.error ? `FAIL (${r.error})` : "OK");
  process.exit(0);
}
if (mode !== "run") { console.log("usage"); process.exit(1); }

const own = await cookieFor(ownerEmail, process.env.SEED_PASSWORD);
if (own.error) { console.log("owner signin FAIL", own.error); process.exit(1); }
const target = await userBy(targetEmail);
const ownerRow = await userBy(ownerEmail);
if (!target || !ownerRow) { console.log("target/owner row not found"); process.exit(1); }
const before = { pub: target.email, auth: await authEmail(target.auth_user_id) };
console.log("0) before:", JSON.stringify(before));

// anon（Cookie なし）
console.log("1) anon:", JSON.stringify(await post(null, { userId: target.id, email: "x@example.com" })));
// manager 403
if (managerEmail) {
  const mgr = await cookieFor(managerEmail, process.env.SEED_PASSWORD);
  console.log("2) manager:", mgr.error ? `signin FAIL ${mgr.error}` : JSON.stringify(await post(mgr.cookie, { userId: target.id, email: "x@example.com" })));
}
// owner 自身 403
console.log("3) owner self:", JSON.stringify(await post(own.cookie, { userId: ownerRow.id, email: "x@example.com" })));
// 既存メール（target 自身の現メール＝org 内重複）409
console.log("4) duplicate:", JSON.stringify(await post(own.cookie, { userId: target.id, email: target.email })));
// 400 系
console.log("5) bad email:", JSON.stringify(await post(own.cookie, { userId: target.id, email: "no-at" })));
// 一時値へ変更 → 同値確認 → 復帰
const tmp = `${target.email.split("@")[0]}+e2e0917@example.com`;
const r6 = await post(own.cookie, { userId: target.id, email: tmp });
console.log("6) change:", JSON.stringify(r6));
const mid = { pub: (await userBy(tmp))?.email ?? null, auth: await authEmail(target.auth_user_id) };
console.log("6b) after change:", JSON.stringify(mid), "same=", mid.pub === tmp && mid.auth === tmp);
const r7 = await post(own.cookie, { userId: target.id, email: before.pub });
console.log("7) restore:", JSON.stringify(r7));
const after = { pub: (await userBy(before.pub))?.email ?? null, auth: await authEmail(target.auth_user_id) };
console.log("7b) after restore:", JSON.stringify(after), "restored=", after.pub === before.pub && after.auth === before.auth);
