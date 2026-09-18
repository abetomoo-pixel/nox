// D-2: /api/payroll/preview が draft run で payroll_carryover_sync を呼び 200 を返す（dev 3200・A1・run を作って戻す）
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import fs from "node:fs";
process.loadEnvFile(".env.local");
const URL0 = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL0, process.env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const owner = createClient(URL0, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { error: eS } = await owner.auth.signInWithPassword({ email: "nox-verify-owner-a@example.com", password: process.env.SEED_PASSWORD });
if (eS) { console.log("signin FAIL", eS.message); process.exit(1); }
// cookie（q0917_cookie.mjs 出力＝document.cookie="k=v; path=/"; の行）→ Cookie ヘッダ
const cookie = fs.readFileSync("docs/tmp/q0918_cookie_owner.txt", "utf8").split("\n").filter(Boolean).map((l) => l.match(/document\.cookie="([^;]+); path=\/"/)[1]).join("; ");
const PERIOD = "2097-12";
const { data: st } = await admin.from("stores").select("id, org_id").eq("name", "NOX-VERIFY-A1").single();
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await db.connect();
const q = async (s, p = []) => (await db.query(s, p)).rows;
const snap = async () => JSON.stringify((await q(`select (select count(*)::int from payroll_runs where store_id=$1) r, (select count(*)::int from payroll_adjustments where store_id=$1) a, (select count(*)::int from audit_logs where org_id=$2) au`, [st.id, st.org_id]))[0]);
const before = await snap();
let runId = null;
const out = [];
try {
  const { data: rc, error: eRc } = await owner.rpc("payroll_run_create", { p_store_id: st.id, p_period: PERIOD });
  if (eRc) throw new Error("run_create: " + eRc.message);
  runId = rc[0].id;
  out.push(`run_create → ${runId} status=${rc[0].status}`);
  for (const i of [1, 2]) {
    const res = await fetch("http://localhost:3200/api/payroll/preview", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ storeId: st.id, period: PERIOD }) });
    const body = await res.json().catch(() => null);
    out.push(`POST /api/payroll/preview #${i} → HTTP ${res.status} period=${body?.period} rows=${Array.isArray(body?.rows) ? body.rows.length : "?"} error=${body?.error ?? "-"}`);
  }
  const au = await q(`select count(*)::int n, min(after_json->>'upserted') up, min(after_json->>'deleted') del from audit_logs where action='payroll_carryover_sync' and target=$1`, ["payroll_runs:" + runId]);
  out.push(`audit payroll_carryover_sync for run: ${JSON.stringify(au[0])}（期待 n=2・upserted 0・deleted 0＝前期 2097-11 の payslip なし）`);
  const adj = await q(`select count(*)::int n from payroll_adjustments where run_id=$1`, [runId]);
  out.push(`adjustments for run: ${adj[0].n}（期待 0）`);
} finally {
  if (runId) {
    await q(`delete from audit_logs where target=$1 and action in ('payroll_carryover_sync','payroll_run_create')`, ["payroll_runs:" + runId]);
    await q(`delete from audit_logs where org_id=$1 and action='payroll_run_create' and after_json->>'period'=$2`, [st.org_id, PERIOD]);
    await q(`delete from payroll_runs where id=$1`, [runId]);
  }
  const after = await snap();
  out.push(`snapshot before=${before} after=${after} ${before === after ? "一致" : "不一致"}`);
  await db.end().catch(() => {});
}
console.log(out.join("\n"));
