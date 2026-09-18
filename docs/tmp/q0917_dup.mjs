import { createClient } from "@supabase/supabase-js";
process.loadEnvFile(".env.local");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const tmp = `nox-verify-dup-${Date.now()}@example.com`;
const { data: cu, error: e1 } = await admin.auth.admin.createUser({ email: tmp, password: process.env.SEED_PASSWORD, email_confirm: true });
if (e1) { console.log("create fail", e1.message); process.exit(1); }
try {
  const { error } = await admin.auth.admin.updateUserById(cu.user.id, { email: "nox-verify-manager-b1@example.com", email_confirm: true });
  console.log("keys:", Object.keys(error ?? {}), "name:", error?.name, "status:", error?.status, "code:", error?.code, "message:", JSON.stringify(error?.message));
  console.log("json:", JSON.stringify(error));
} finally {
  await admin.auth.admin.deleteUser(cu.user.id);
  const chk = await admin.auth.admin.getUserById(cu.user.id);
  console.log("deleted:", !chk.data.user);
}
