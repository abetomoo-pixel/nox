import { createClient } from "@supabase/supabase-js";
process.loadEnvFile(".env.local");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const FIX = { "nox-verify-owner-a@example.com": null, "nox-verify-cast-a1a@example.com": null };
const { data: rows } = await admin.from("users").select("id, auth_user_id, email, org_id").like("email", "nox-verify-%");
console.log("users nox-verify-* :", rows.map(r => r.email).sort().join(", "));
const stray = rows.filter(r => /nox-verify-se-/.test(r.email));
console.log("stray se rows:", JSON.stringify(stray));
for (const r of stray) {
  const au = (await admin.auth.admin.getUserById(r.auth_user_id)).data.user;
  console.log("auth email of stray:", au?.email);
}
// ownerA は auth_user_id で特定（email が変わっているため）: users 行で name/org から引く
const { data: cand } = await admin.from("users").select("id, auth_user_id, email, name").in("id", stray.map(s => s.id));
for (const c of cand ?? []) {
  const target = c.email.startsWith("nox-verify-se-") ? "nox-verify-owner-a@example.com" : null;
  if (!target) continue;
  console.log(`restore ${c.id} (${c.name}) -> ${target}`);
  const { error: e1 } = await admin.auth.admin.updateUserById(c.auth_user_id, { email: target, email_confirm: true });
  console.log("auth restore:", e1 ? e1.message : "ok");
  const { error: e2 } = await admin.from("users").update({ email: target }).eq("id", c.id);
  console.log("public restore:", e2 ? e2.message : "ok");
}
const { data: after } = await admin.from("users").select("email, auth_user_id").in("email", ["nox-verify-owner-a@example.com", "nox-verify-cast-a1a@example.com", "nox-verify-staff-a1@example.com"]);
for (const a of after ?? []) console.log("after:", a.email, "auth=", (await admin.auth.admin.getUserById(a.auth_user_id)).data.user?.email);
const { data: left } = await admin.from("users").select("email").like("email", "nox-verify-se-%");
console.log("left se rows:", JSON.stringify(left));
