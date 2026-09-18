import { createClient } from "@supabase/supabase-js";
process.loadEnvFile(".env.local");
const URL0 = process.env.NEXT_PUBLIC_SUPABASE_URL; const REF = URL0.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const email = process.argv[2];
const c = createClient(URL0, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await c.auth.signInWithPassword({ email, password: process.env.SEED_PASSWORD });
if (error) { console.log("FAIL", error.message); process.exit(1); }
const raw = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
const name = `sb-${REF}-auth-token`;
const out = [];
if (encodeURIComponent(raw).length <= 3180) out.push(`document.cookie=${JSON.stringify(`${name}=${encodeURIComponent(raw)}; path=/`)};`);
else for (let n = 0, i = 0; i < raw.length; n++, i += 3180) out.push(`document.cookie=${JSON.stringify(`${name}.${n}=${encodeURIComponent(raw.slice(i, i + 3180))}; path=/`)};`);
console.log(out.join("\n"));
