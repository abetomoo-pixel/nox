/*
 * verify:nox-cast-norm-self — mig0148 ★7 cast セルフ norm（裁定272-3・R19）set_cast_norm_self の係留。
 *   npm run verify:nox-cast-norm-self（env: URL/PUBLISHABLE/SUPABASE_DB_URL・seed:f0 済み）。f0 56 段目。
 *   Postgres 直結の 1 トランザクション内で JWT claims を emulate → 最後に ROLLBACK＝残留 0・snapshot 一致。
 *
 *  (1) castA1a で set_cast_norm_self → 自分の cast_norms（cast_id＝auth_cast_id 由来・store＝自店）が upsert される・再呼びで同 id・値更新
 *  (2) 署名に p_cast_id が無い（5 引数）＝他 cast の id を渡す口が無い（6 引数呼びは function does not exist）・他 cast の行は不変
 *  (3) 店の sys_norms='false' で 'norms off'・戻す（欠損／true）と通る
 *  (4) 入力検証は set_cast_norm と同語彙（bad period／bad *_target）
 *  (5) manager／owner（cast 行なし）は 'no cast for caller'・anon BLOCKED
 *  (6) audit: set_cast_norm_self（target cast_norms:<id>・before null→after／2 回目は before あり）
 *  逆テスト 1 本（手動・1 回）: cn(3-1) の期待文言を 'norms disabled' にする→赤・戻して緑。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_DB_URL"]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const P = "2097-12";

async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];
  type R = { ok: true; rows: Record<string, unknown>[] } | { ok: false; err: string };
  const call = async (sql: string, params: unknown[] = []): Promise<R> => {
    await db.query("savepoint sp");
    try { const rows = (await db.query(sql, params)).rows; await db.query("release savepoint sp"); return { ok: true, rows }; }
    catch (e) { await db.query("rollback to savepoint sp"); return { ok: false, err: (e as Error).message }; }
  };
  const errOf = (r: R) => (r.ok ? "(no error)" : r.err);
  const asUid = async (uid: string) => {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    await db.query(`set local role authenticated`);
  };
  const asPg = async () => { await db.query("reset role"); };
  try {
    const st = (await q<{ id: string; org_id: string }>(`select id, org_id from public.stores where name = $1`, [STORE_A1]))[0];
    const uidOf = async (key: keyof typeof FIXTURE_USERS) => (await q<{ id: string; auth_user_id: string }>(`select id, auth_user_id from public.users where email = $1 and is_active`, [FIXTURE_USERS[key].email]))[0];
    const castU = await uidOf("castA1a"), managerA1 = await uidOf("managerA1"), ownerA = await uidOf("ownerA");
    const castA = (await q<{ id: string }>(`select c.id from public.casts c where c.store_id = $1 and c.user_id = $2`, [st?.id, castU?.id]))[0]?.id;
    const castB = (await q<{ id: string }>(`select id from public.casts where store_id = $1 and name = $2`, [st?.id, FIXTURE_USERS.castA1b.name]))[0]?.id;
    check("cn(0-1) fixture: A1／cast-a1a（users→casts）／manager-a1／owner-a／cast b が引ける", !!st && !!castU && !!castA && !!managerA1 && !!ownerA && !!castB);
    if (!st || !castU || !castA || !managerA1 || !ownerA || !castB) throw new Error("fixture 解決失敗");
    const sig = (await q<{ a: string }>(`select pg_get_function_identity_arguments(oid) as a from pg_proc where pronamespace='public'::regnamespace and proname='set_cast_norm_self'`))[0]?.a;
    check("cn(2-1) ★署名 5 引数＝(p_period text, p_days_target integer, p_dohan_target integer, p_sales_target bigint, p_shimei_target integer)・p_cast_id 無し", sig === "p_period text, p_days_target integer, p_dohan_target integer, p_sales_target bigint, p_shimei_target integer" && !/p_cast/.test(sig ?? ""), sig);

    const snap = async () => JSON.stringify((await q(`select (select count(*)::int from public.cast_norms) n, (select count(*)::int from public.audit_logs where org_id = $1) au, (select settings_json->>'sys_norms' from public.stores where id = $2) sn`, [st.org_id, st.id]))[0]);
    const before = await snap();

    await db.query("begin");
    try {
      const otherBefore = await q<{ id: string; days_target: number }>(`select id, days_target from public.cast_norms where cast_id = $1 order by period`, [castB]);
      // ── (1) 本人 upsert ──
      await asUid(castU.auth_user_id);
      const r1 = await call(`select public.set_cast_norm_self($1, 12, 3, 800000, 6) as id`, [P]);
      check("cn(1-1) cast 本人で set_cast_norm_self → uuid", r1.ok, errOf(r1));
      const id1 = r1.ok ? (r1.rows[0].id as string) : "";
      await asPg();
      const row1 = (await q<{ cast_id: string; store_id: string; org_id: string; period: string; days_target: number; dohan_target: number; sales_target: string; shimei_target: number }>(`select cast_id, store_id, org_id, period, days_target, dohan_target, sales_target, shimei_target from public.cast_norms where id = $1`, [id1]))[0];
      check("cn(1-2) 行＝自分の cast_id・自店・org・period・4 目標（12／3／800000／6）", row1?.cast_id === castA && row1?.store_id === st.id && row1?.org_id === st.org_id && row1?.period === P && row1?.days_target === 12 && row1?.dohan_target === 3 && String(row1?.sales_target) === "800000" && row1?.shimei_target === 6, JSON.stringify(row1));
      await asUid(castU.auth_user_id);
      const r2 = await call(`select public.set_cast_norm_self($1, 15, 0, 0, 0) as id`, [P]);
      await asPg();
      const row2 = (await q<{ days_target: number; dohan_target: number }>(`select days_target, dohan_target from public.cast_norms where id = $1`, [id1]))[0];
      const nP = (await q<{ n: number }>(`select count(*)::int as n from public.cast_norms where cast_id = $1 and period = $2`, [castA, P]))[0].n;
      check("cn(1-3) 再呼び＝同 id の upsert（unique cast_id×period）・値が更新される（15／0）・行 1", r2.ok && r2.rows[0].id === id1 && row2?.days_target === 15 && row2?.dohan_target === 0 && nP === 1, errOf(r2) + " " + JSON.stringify(row2));
      // ── (2) 他 cast を指せない ──
      const otherAfter = await q<{ id: string; days_target: number }>(`select id, days_target from public.cast_norms where cast_id = $1 order by period`, [castB]);
      check("cn(2-2) 他 cast（b）の行は不変", JSON.stringify(otherAfter) === JSON.stringify(otherBefore));
      await asUid(castU.auth_user_id);
      const six = await call(`select public.set_cast_norm_self($1, 1, 1, 1, 1, $2::uuid)`, [P, castB]);
      check("cn(2-3) 6 引数（cast_id を足す）呼びは function does not exist", !six.ok && /does not exist/.test(six.err), errOf(six));
      // ── (3) sys_norms='false' ──
      await asPg();
      await db.query(`update public.stores set settings_json = coalesce(settings_json, '{}'::jsonb) || '{"sys_norms": false}'::jsonb where id = $1`, [st.id]);
      await asUid(castU.auth_user_id);
      const off = await call(`select public.set_cast_norm_self($1, 1, 1, 1, 1)`, [P]);
      check("cn(3-1) ★店の sys_norms=false は 'norms off'", !off.ok && off.err === "norms off", errOf(off));
      await asPg();
      await db.query(`update public.stores set settings_json = settings_json || '{"sys_norms": true}'::jsonb where id = $1`, [st.id]);
      await asUid(castU.auth_user_id);
      const on = await call(`select public.set_cast_norm_self($1, 2, 2, 2, 2) as id`, [P]);
      check("cn(3-2) sys_norms=true に戻すと通る（同 id）", on.ok && on.rows[0].id === id1, errOf(on));
      await asPg();
      await db.query(`update public.stores set settings_json = settings_json - 'sys_norms' where id = $1`, [st.id]);
      await asUid(castU.auth_user_id);
      const miss = await call(`select public.set_cast_norm_self($1, 3, 3, 3, 3) as id`, [P]);
      check("cn(3-3) sys_norms 欠損＝ON 扱いで通る（isSystemOn と同じ既定）", miss.ok && miss.rows[0].id === id1, errOf(miss));
      // ── (4) 入力検証 ──
      const bp = await call(`select public.set_cast_norm_self('2097-13', 1, 1, 1, 1)`);
      const bd = await call(`select public.set_cast_norm_self($1, -1, 1, 1, 1)`, [P]);
      const bdo = await call(`select public.set_cast_norm_self($1, 1, null, 1, 1)`, [P]);
      const bs = await call(`select public.set_cast_norm_self($1, 1, 1, -1, 1)`, [P]);
      const bsh = await call(`select public.set_cast_norm_self($1, 1, 1, 1, -1)`, [P]);
      check("cn(4-1) bad period／bad days_target／bad dohan_target／bad sales_target／bad shimei_target（set_cast_norm と同語彙）", !bp.ok && bp.err === "bad period" && !bd.ok && bd.err === "bad days_target" && !bdo.ok && bdo.err === "bad dohan_target" && !bs.ok && bs.err === "bad sales_target" && !bsh.ok && bsh.err === "bad shimei_target", [bp, bd, bdo, bs, bsh].map(errOf).join(" / "));
      // ── (5) manager／owner ──
      await asUid(managerA1.auth_user_id);
      const mg = await call(`select public.set_cast_norm_self($1, 1, 1, 1, 1)`, [P]);
      check("cn(5-1) manager は 'no cast for caller'", !mg.ok && mg.err === "no cast for caller", errOf(mg));
      await asUid(ownerA.auth_user_id);
      const ow = await call(`select public.set_cast_norm_self($1, 1, 1, 1, 1)`, [P]);
      check("cn(5-2) owner は 'no cast for caller'", !ow.ok && ow.err === "no cast for caller", errOf(ow));
      // ── (6) audit ──
      await asPg();
      // ★同一トランザクション内は now() が同値＝at で並べられない → 集合で比較（成功 4 回＝12／15／2／3・初回のみ before null）
      const au = await q<{ action: string; store_id: string; before_null: boolean; after_days: string | null }>(`select action, store_id, (before_json is null) as before_null, after_json->>'days_target' as after_days from public.audit_logs where target = $1`, ["cast_norms:" + id1]);
      const days = au.map((a) => a.after_days).sort();
      check("cn(6-1) audit: set_cast_norm_self が成功回数分（4 行＝12／15／2／3）・初回（12）のみ before null・他は before あり・store A1", au.length === 4 && au.every((a) => a.action === "set_cast_norm_self" && a.store_id === st.id) && JSON.stringify(days) === JSON.stringify(["12", "15", "2", "3"]) && au.find((a) => a.after_days === "12")?.before_null === true && au.filter((a) => a.after_days !== "12").every((a) => a.before_null === false), JSON.stringify(au));
    } finally {
      await db.query("rollback");
    }
    const after = await snap();
    check("cn(9-1) ROLLBACK 後の残留＝実行前と同値（cast_norms／org A audit／A1 sys_norms）", after === before, `${before} → ${after}`);
  } finally {
    await db.end().catch(() => undefined);
  }

  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await anon.rpc("set_cast_norm_self", { p_period: null, p_days_target: null, p_dohan_target: null, p_sales_target: null, p_shimei_target: null });
  check("cn(9-2) anon set_cast_norm_self BLOCKED", !!error?.message?.includes("permission denied for function"), error?.message ?? "(no error)");

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-cast-norm-self ALL PASS (${pass} assertions)`);
  console.log("cast セルフ norm(0148 ★7): 本人 upsert（同 id・値更新）/ 署名 5 引数＝他 cast を指せない・他 cast 不変 / sys_norms=false は norms off・true／欠損は通る / 入力検証 5 語彙 / manager・owner は no cast for caller・anon / audit 4 行（ROLLBACK・残留 0）");
}

main().catch((e) => { console.error(e); process.exit(1); });
