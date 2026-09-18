// CLUB NOX: demo-manager は route で 403（HTTP）／demo-staff2 の変更→同値→復帰は performUpdateEmail（admin・route と同じ本体）で実測
import { createClient } from "@supabase/supabase-js";
import { performUpdateEmail } from "../../lib/nox/staff/update-email";
process.loadEnvFile(".env.local");
const URL0 = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const REF = URL0.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)![1];
const admin = createClient(URL0, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const userBy = async (email: string) => (await admin.from("users").select("id, auth_user_id, email, org_id").eq("email", email).maybeSingle()).data!;
const authEmail = async (id: string) => (await admin.auth.admin.getUserById(id)).data.user?.email;
const staff2 = await userBy("demo-staff2@example.com");
console.log("0) demo-staff2 before:", JSON.stringify({ pub: staff2.email, auth: await authEmail(staff2.auth_user_id) }));
// manager 403 via HTTP
const c = createClient(URL0, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await c.auth.signInWithPassword({ email: "demo-manager@example.com", password: process.env.SEED_PASSWORD! });
if (error) { console.log("manager signin FAIL", error.message); process.exit(1); }
const raw = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
const name = `sb-${REF}-auth-token`;
const enc = encodeURIComponent(raw);
const cookie = enc.length <= 3180 ? `${name}=${enc}` : Array.from({ length: Math.ceil(raw.length / 3180) }, (_, n) => `${name}.${n}=${encodeURIComponent(raw.slice(n * 3180, (n + 1) * 3180))}`).join("; ");
const r = await fetch("http://localhost:3200/api/staff/update-email", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ userId: staff2.id, email: "x@example.com" }) });
console.log("1) demo-manager via route:", r.status, JSON.stringify(await r.json().catch(() => null)));
// performUpdateEmail（admin）: 変更→同値→復帰
const tmp = "demo-staff2+e2e0917@example.com";
const r2 = await performUpdateEmail(admin, { orgId: staff2.org_id, userId: staff2.id, email: tmp });
console.log("2) change:", JSON.stringify(r2));
console.log("2b) after:", JSON.stringify({ pub: (await userBy(tmp))?.email ?? null, auth: await authEmail(staff2.auth_user_id) }));
const r3 = await performUpdateEmail(admin, { orgId: staff2.org_id, userId: staff2.id, email: "demo-staff2@example.com" });
console.log("3) restore:", JSON.stringify(r3));
const fin = { pub: (await userBy("demo-staff2@example.com"))?.email ?? null, auth: await authEmail(staff2.auth_user_id) };
console.log("3b) final:", JSON.stringify(fin), "restored=", fin.pub === "demo-staff2@example.com" && fin.auth === "demo-staff2@example.com");
// owner 自身（abetomoo）を対象＝performUpdateEmail で 403
const own = await userBy("abetomoo@gmail.com");
console.log("4) owner self (module):", JSON.stringify(await performUpdateEmail(admin, { orgId: own.org_id, userId: own.id, email: "x@example.com" })));
