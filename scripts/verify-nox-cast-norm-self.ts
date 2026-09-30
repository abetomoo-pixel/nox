/*
 * verify:nox-cast-norm-self — mig0148 ★7 の cast セルフ norm（set_cast_norm_self・裁定272-3）は **mig0160（裁定326-3／追補1-2・2026-09-30）で drop**＝本 suite は「無いこと」の実証 1 段に置換（便 P160-3）。
 *   旧 15 段（upsert・署名・norms off・入力検証・権限・audit・ROLLBACK）は撤去（drop した関数の挙動は係留しない）。suite 名と f0 の段位置（56 段目）は残す。
 *   npm run verify:nox-cast-norm-self（env: SUPABASE_DB_URL・NEXT_PUBLIC_*）。読取のみ・DB 不触。
 *
 *  cn(1-1) live に set_cast_norm_self が無い（pg_proc 0 行）・cast からの呼出は「function ... does not exist」・店側の set_cast_norm（4fc3ed4b）と cast_norms（RLS select 1 本）は不変
 *  逆テスト 1 本（手動・1 回）: 期待の md5 '4fc3ed4b' を '00000000' にする→赤・戻して緑。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { FIXTURE_USERS, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_DB_URL", "SEED_PASSWORD"]);
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }

async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 60000 });
  await db.connect();
  try {
    const { rows: fn } = await db.query("select proname from pg_proc where pronamespace='public'::regnamespace and proname='set_cast_norm_self'");
    const { rows: keep } = await db.query("select proname, left(md5(replace(prosrc, E'\\r', '')), 8) m from pg_proc where pronamespace='public'::regnamespace and proname='set_cast_norm'");
    const { rows: pol } = await db.query("select count(*)::int n from pg_policies where schemaname='public' and tablename='cast_norms' and cmd='SELECT'");
    // cast セッションからの呼出＝PostgREST は関数不在を PGRST202／'Could not find the function' で返す
    const cast = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: eIn } = await cast.auth.signInWithPassword({ email: FIXTURE_USERS.castA1a.email, password: env.SEED_PASSWORD });
    const { error } = eIn ? { error: null } : await cast.rpc("set_cast_norm_self", { p_period: "2097-12", p_days_target: 1, p_dohan_target: 1, p_sales_target: 1, p_shimei_target: 1 });
    const gone = !eIn && !!error && (error.code === "PGRST202" || /Could not find the function|does not exist/i.test(error.message ?? ""));
    check("cn(1-1) ★0160: set_cast_norm_self は live に無い（pg_proc 0 行・cast からの呼出は関数不在）・set_cast_norm は不変（4fc3ed4b）・cast_norms の select policy 1 本は不変",
      fn.length === 0 && gone && keep.length === 1 && keep[0].m === "4fc3ed4b" && pol[0].n === 1, JSON.stringify({ fn: fn.length, signIn: eIn?.message, err: error?.code ?? error?.message, keep, pol }));
    await cast.auth.signOut().catch(() => undefined);
  } finally {
    await db.end().catch(() => undefined);
  }
  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-cast-norm-self ALL PASS (${pass} assertions)`);
  console.log("cast セルフ norm(0148→0160 で drop): set_cast_norm_self 不在の実証・set_cast_norm と cast_norms は不変");
}

main().catch((e) => { console.error(e); process.exit(1); });
