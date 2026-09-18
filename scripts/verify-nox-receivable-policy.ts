/*
 * verify:nox-receivable-policy — mig0148 ★8 受取方針 setter（裁定272-5）set_store_receivable_policy の係留。
 *   npm run verify:nox-receivable-policy（env: URL/PUBLISHABLE/SUPABASE_DB_URL・seed:f0 済み）。f0 58 段目。
 *   Postgres 直結の 1 トランザクション内で JWT claims を emulate → 最後に ROLLBACK＝残留 0・snapshot 一致。
 *
 *  (1) owner で 3 値（disabled／customer_only／cast_liability_allowed）を受理＝stores.receivable_policy 実列が変わる・CHECK 3 値と同語彙
 *  (2) 4 値目／null は 'bad receivable_policy'（列は不変）
 *  (3) manager は 'forbidden'（owner 限定）・他 org の店は 'forbidden'・存在しない店は 'forbidden'・anon BLOCKED
 *  (4) audit: 成功 1 回につき 1 行（action set_store_receivable_policy・target stores:<id>・before/after に receivable_policy）
 *  逆テスト 1 本（手動・1 回）: rp(2-1) の期待文言を 'bad policy' にする→赤・戻して緑。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { FIXTURE_USERS, STORE_A1, STORE_B1, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_DB_URL"]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const POLICIES = ["disabled", "customer_only", "cast_liability_allowed"] as const;

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
    const st = await q<{ id: string; org_id: string; name: string; receivable_policy: string }>(`select id, org_id, name, receivable_policy from public.stores where name in ($1, $2)`, [STORE_A1, STORE_B1]);
    const A1 = st.find((s) => s.name === STORE_A1), B1 = st.find((s) => s.name === STORE_B1);
    const uidOf = async (key: keyof typeof FIXTURE_USERS) => (await q<{ id: string; auth_user_id: string }>(`select id, auth_user_id from public.users where email = $1 and is_active`, [FIXTURE_USERS[key].email]))[0];
    const ownerA = await uidOf("ownerA"), managerA1 = await uidOf("managerA1");
    check("rp(0-1) fixture: A1／B1／owner-a／manager-a1 が引ける", !!A1 && !!B1 && !!ownerA && !!managerA1);
    if (!A1 || !B1 || !ownerA || !managerA1) throw new Error("fixture 解決失敗");
    const ckDef = (await q<{ d: string }>(`select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'stores_receivable_policy_check'`))[0]?.d;
    check("rp(1-0) CHECK stores_receivable_policy_check＝3 値（disabled／customer_only／cast_liability_allowed）不変", ckDef === "CHECK ((receivable_policy = ANY (ARRAY['disabled'::text, 'customer_only'::text, 'cast_liability_allowed'::text])))", ckDef);

    const snap = async () => JSON.stringify((await q(`select (select receivable_policy from public.stores where id = $1) a1, (select receivable_policy from public.stores where id = $2) b1, (select count(*)::int from public.audit_logs where org_id = $3) au`, [A1.id, B1.id, A1.org_id]))[0]);
    const before = await snap();
    const policyOf = async (id: string) => (await q<{ p: string }>(`select receivable_policy as p from public.stores where id = $1`, [id]))[0].p;

    await db.query("begin");
    try {
      // ── (1) 3 値 ──
      const cur0 = await policyOf(A1.id);
      const order = [...POLICIES].filter((p) => p !== cur0).concat([cur0 as (typeof POLICIES)[number]]); // 現値以外→最後に現値へ戻す（3 回とも実変更）
      let prev = cur0;
      for (const p of order) {
        await asUid(ownerA.auth_user_id);
        const r = await call(`select public.set_store_receivable_policy($1, $2)`, [A1.id, p]);
        await asPg();
        const now = await policyOf(A1.id);
        // ★同一トランザクション内は now() が同値＝at で並べられない → (before,after) の組で該当行を探す
        const au = await q<{ b: string | null; a: string | null; store_id: string }>(`select before_json->>'receivable_policy' as b, after_json->>'receivable_policy' as a, store_id from public.audit_logs where action = 'set_store_receivable_policy' and target = $1`, ["stores:" + A1.id]);
        const hit = au.filter((x) => x.b === prev && x.a === p && x.store_id === A1.id);
        check(`rp(1-1) owner: '${p}' を受理＝実列が '${prev}'→'${p}'・audit 1 行（before/after・store A1）`, r.ok && now === p && hit.length === 1, errOf(r) + ` now=${now} audit=${JSON.stringify(au)}`);
        prev = p;
      }
      const nAu = (await q<{ n: number }>(`select count(*)::int as n from public.audit_logs where action = 'set_store_receivable_policy' and target = $1`, ["stores:" + A1.id]))[0].n;
      check("rp(1-2) audit は成功 3 回＝3 行（raise 分は書かない）", nAu === 3, `got ${nAu}`);
      // ── (2) 4 値目・null ──
      await asUid(ownerA.auth_user_id);
      const bad = await call(`select public.set_store_receivable_policy($1, 'store_only')`, [A1.id]);
      const nul = await call(`select public.set_store_receivable_policy($1, null)`, [A1.id]);
      await asPg();
      check("rp(2-1) 4 値目／null は 'bad receivable_policy'・列は不変", !bad.ok && bad.err === "bad receivable_policy" && !nul.ok && nul.err === "bad receivable_policy" && (await policyOf(A1.id)) === cur0, errOf(bad) + " / " + errOf(nul));
      // ── (3) manager／他 org／不在 ──
      await asUid(managerA1.auth_user_id);
      const mg = await call(`select public.set_store_receivable_policy($1, 'disabled')`, [A1.id]);
      check("rp(3-1) manager（自店）は 'forbidden'（owner 限定・D3a）", !mg.ok && mg.err === "forbidden", errOf(mg));
      await asUid(ownerA.auth_user_id);
      const ob = await call(`select public.set_store_receivable_policy($1, 'disabled')`, [B1.id]);
      check("rp(3-2) 他 org の店（B1）は 'forbidden'", !ob.ok && ob.err === "forbidden", errOf(ob));
      const nx = await call(`select public.set_store_receivable_policy($1, 'disabled')`, [randomUUID()]);
      check("rp(3-3) 存在しない店は 'forbidden'", !nx.ok && nx.err === "forbidden", errOf(nx));
      await asPg();
      check("rp(3-4) B1 の実列は不変", (await policyOf(B1.id)) === B1.receivable_policy);
    } finally {
      await db.query("rollback");
    }
    const after = await snap();
    check("rp(9-1) ROLLBACK 後の残留＝実行前と同値（A1／B1 receivable_policy・org A audit）", after === before, `${before} → ${after}`);
  } finally {
    await db.end().catch(() => undefined);
  }

  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await anon.rpc("set_store_receivable_policy", { p_store_id: null, p_policy: null });
  check("rp(9-2) anon set_store_receivable_policy BLOCKED", !!error?.message?.includes("permission denied for function"), error?.message ?? "(no error)");

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-receivable-policy ALL PASS (${pass} assertions)`);
  console.log("受取方針(0148 ★8): CHECK 3 値不変 / owner 3 値受理＝実列＋audit 各 1 行 / 4 値目・null は bad receivable_policy / manager・他 org・不在は forbidden・anon（ROLLBACK・残留 0）");
}

main().catch((e) => { console.error(e); process.exit(1); });
