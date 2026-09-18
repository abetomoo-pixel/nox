// (c) 手順1 再実測: 全店舗×全 period で gross（調整行なし）> periodDays*5000 かつ run が paid でない cast×period を列挙（読取のみ）
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { computePayrollDraft } from "../../lib/nox/payroll/core";
import { resolvePayrollWindow, periodDaysBetween } from "../../lib/nox/payroll/window";
process.loadEnvFile(".env.local");
const env = process.env as Record<string, string>;
const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await db.connect();
const periods = await db.query(`
  select s.id store_id, s.name store, p.period from public.stores s join lateral (
    select distinct to_char(started_at at time zone 'Asia/Tokyo','YYYY-MM') period from public.checks c where c.store_id=s.id
    union select distinct to_char(punched_at at time zone 'Asia/Tokyo','YYYY-MM') from public.punches p where p.store_id=s.id
    union select distinct to_char(date,'YYYY-MM') from public.shifts sh where sh.store_id=s.id
    union select period from public.payroll_runs r where r.store_id=s.id
  ) p on true order by 1,3`);
const runs = await db.query("select store_id, period, status from public.payroll_runs");
const runMap = new Map(runs.rows.map((r: any) => [r.store_id + "|" + r.period, r.status]));
await db.end();
console.log("periods:", JSON.stringify(periods.rows.map((r: any) => r.store + " " + r.period)));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const loginFor: Record<string, string> = { "CLUB NOX": "demo-manager@example.com", "NOX-VERIFY-A1": "nox-verify-owner-a@example.com", "NOX-VERIFY-A2": "nox-verify-owner-a@example.com", "NOX-VERIFY-B1": "nox-verify-manager-b1@example.com" };
const clients = new Map<string, any>();
for (const email of new Set(Object.values(loginFor))) {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: env.SEED_PASSWORD });
  if (error) { console.log("login fail", email, error.message); process.exit(1); }
  clients.set(email, c);
}
const hits: string[] = [];
let scanned = 0;
for (const r of periods.rows as any[]) {
  const mc = clients.get(loginFor[r.store]);
  try {
    const d = await computePayrollDraft(admin, mc, r.store_id, r.period, { previewDefaults: true });
    const win = await resolvePayrollWindow(admin, r.store_id, r.period); const pdays = periodDaysBetween(win.periodStart, win.periodEnd);
    const status = runMap.get(r.store_id + "|" + r.period) ?? "(run なし)";
    for (const row of d.rows) {
      scanned++;
      const pd = pdays;
      const th = 5000 * Number(pd);
      const over = row.pay.gross > th;
      if (over) hits.push(`${r.store} ${r.period} ${row.castName} gross=${row.pay.gross} th=${th}(days ${pd}) run=${status} taxMode=${row.taxMode} wh=${row.pay.withholding}${status === "paid" ? "  [paid→除外]" : "  ★該当"}`);
    }
    console.log(`${r.store} ${r.period}: rows ${d.rows.length} run=${status} maxGross=${Math.max(0, ...d.rows.map((x) => x.pay.gross))}`);
  } catch (e: any) { console.log(`${r.store} ${r.period}: ERR ${e.message}`); }
}
console.log("\nscanned rows:", scanned);
console.log("threshold-over list:\n" + (hits.join("\n") || "(none)"));
