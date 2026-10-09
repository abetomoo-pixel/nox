/*
 * verify:nox-comp-list — 裁定339（便 X-13d-1・2026-10-09・X-13-23）: 待遇プラン一覧の読取（useCompData.load と同じ形）が PostgREST 200 で返り、行数 ≥1。
 *   npm run verify:nox-comp-list。f0 97 段目（env: NEXT_PUBLIC_SUPABASE_URL／NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY／SUPABASE_DB_URL／SEED_PASSWORD）。
 *   背景: 0153 client 便（19aba5d・2026-09-28）で from("comp_plans, product_back_fixed_hon, …") と列名が from に混入→PostgREST PGRST205（404）→error を捨てて plans=[]
 *         ＝新規プランは INSERT されるのに一覧にも編集中にも出ない（CLUB NOX「あああ」）。RPC 側の suite では見えない欠陥＝client の読取そのものを係留する。
 *
 *  cl(1) owner A（NOX-VERIFY-A1）の supabase-js で from("comp_plans").select("*").order("name") → error null・配列（RLS で自 org のみ）
 *  cl(2) 壊れた形（表名に列名を連結）は PGRST205 を返す＝検知線が生きていることの自己証明
 *  cl(3) Postgres 直結: CLUB NOX（本番 org・is_demo=false）と NOX-DEMO-MUSE の comp_plans 行数 ≥1（一覧条件は is_active を問わない）
 *  cl(4) 逐語 grep: comp-sections.tsx の from は "comp_plans" だけ・error は onError へ・失敗時は直前値保持
 *  逆テスト 1 本（手動・1 回）: comp-sections.tsx の from("comp_plans") を from("comp_plans, x") に→cl(4-1) 赤（live は cl(1) も赤）・戻して緑。
 */
import fs from "node:fs";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { FIXTURE_USERS, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_DB_URL", "SEED_PASSWORD"]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }

async function main() {
  const owner = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: eIn } = await owner.auth.signInWithPassword({ email: FIXTURE_USERS.ownerA.email, password: env.SEED_PASSWORD });
  if (eIn) { console.error(`✗ ownerA サインイン失敗（seed:f0 実行済みか）: ${eIn.message}`); process.exit(1); }
  try {
    // cl(1) 一覧読取＝useCompData.load と同じ形
    const { data, error } = await owner.from("comp_plans").select("*").order("name");
    check("cl(1-1) owner A: from(\"comp_plans\").select(\"*\").order(\"name\") は error null", !error, error?.message);
    check("cl(1-2) 戻りは配列（RLS で自 org のみ・0 行でも配列）", Array.isArray(data));
    // cl(2) 壊れた形は PGRST205
    const broken = await owner.from("comp_plans, product_back_fixed_hon, product_back_fixed_jonai, product_back_fixed_free").select("*").order("name");
    check("cl(2-1) 表名に列名を連結した from は PGRST205（Could not find the table）＝旧欠陥の形は必ず error", !!broken.error && broken.error.code === "PGRST205", JSON.stringify(broken.error));
    // cl(3) 本番 org とデモ MUSE の行数
    const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 30000 });
    await db.connect();
    try {
      const rows = (await db.query(`
        select s.name store, o.is_demo, count(p.id)::int n
          from public.stores s join public.orgs o on o.id = s.org_id left join public.comp_plans p on p.store_id = s.id
         where s.name = 'CLUB NOX' or o.name = 'NOX-DEMO-MUSE'
         group by 1, 2 order by 1`)).rows as { store: string; is_demo: boolean; n: number }[];
      const club = rows.find((r) => r.store === "CLUB NOX" && !r.is_demo);
      const muse = rows.find((r) => r.store !== "CLUB NOX" && r.is_demo);
      check("cl(3-1) CLUB NOX（本番 org）の comp_plans ≥1（X-13-23 の「あああ」は INSERT 済み＝一覧に出る）", !!club && club.n >= 1, JSON.stringify(rows));
      check("cl(3-2) NOX-DEMO-MUSE の comp_plans ≥1", !!muse && muse.n >= 1, JSON.stringify(rows));
    } finally { await db.end(); }
  } finally { await owner.auth.signOut(); }
  // cl(4) 逐語
  const cs = fs.readFileSync("app/(manage)/master/cast-comp/comp-sections.tsx", "utf8");
  check("cl(4-1) comp-sections: from(\"comp_plans\").select(\"*\").order(\"name\")・列名混入の from なし", cs.includes('supabase.from("comp_plans").select("*").order("name")') && !/from\("comp_plans,/.test(cs));
  check("cl(4-2) comp-sections: 7 本の読取の error は onError（rpcErrJa）へ・失敗した読取は直前値を保持", cs.includes("const errs = [p, c, cp, n, d, b, pc].map((r) => r.error)") && cs.includes("if (!p.error) setPlans(") && cs.includes("if (!b.error) setBacks("));

  if (fails.length) {
    console.error(`verify:nox-comp-list FAIL ${fails.length} / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-comp-list OK (${pass} checks)`);
  console.log("待遇プラン一覧の読取(裁定339): owner の select 200・壊れた from は PGRST205・CLUB NOX／MUSE の行数 ≥1・逐語 grep");
}

main().catch((e) => { console.error(e); process.exit(1); });
