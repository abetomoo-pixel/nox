/*
 * verify:nox-payroll-adjust — mig0146 payroll_adjustments（裁定258・run 別調整控除）の係留。
 *   npm run verify:nox-payroll-adjust（env: URL/PUBLISHABLE/SUPABASE_DB_URL・seed:f0 済み）
 *   走数外（f0 では 49 段目に連結）。手貼り検証（docs/tmp/0146_post.txt・2026-09-15）と同じ形。
 *
 * 固定する項目（相談役ブロック 2026-09-15）:
 *  (1) 列 13・CHECK 3（mode／amount 排他／reason trim 1..200）・index 3+pk・RLS enabled・policy 1 本の using 式
 *  (2) grant: 表 authenticated=SELECT のみ・anon 0／関数 2 本 authenticated=EXECUTE・anon 0（＋anon から RPC が BLOCKED）
 *  (3) FK 5 本（orgs／stores／payroll_runs ON DELETE CASCADE／casts／created_by→users）
 *  (4) 署名 2 本・SECURITY DEFINER
 *  (5) 異常系 5（reason 空白／bad mode／fixed amount null／rate_bp 10001／run not draft）
 *      ＝Postgres 直結の 1 トランザクション内で NOX-VERIFY-A1 に仮 run（2099-01）を作り owner-a の JWT claims を emulate して呼び、
 *        最後に ROLLBACK（payroll_adjustments／2099-01 run／audit の残留 0 を assert）。正常 add 1 件で audit の actor=users.id・reason 保持も固定。
 *  money-core（check_close／check_pay／check_void）には非接触。
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

const T = "payroll_adjustments";
const ADD_ARGS = "p_run_id uuid, p_cast_id uuid, p_mode text, p_amount integer, p_rate_bp integer, p_before_withholding boolean, p_show_detail boolean, p_reason text";
const DEL_ARGS = "p_id uuid, p_reason text";
const POLICY_QUAL = "((org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR (store_id = auth_store_id())) AND (auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])))";
const COLS = ["id", "org_id", "store_id", "run_id", "cast_id", "mode", "amount", "rate_bp", "before_withholding", "show_detail", "reason", "created_by", "created_at"];

async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];

  // ── (1) 表の形 ──
  {
    const cols = await q<{ column_name: string }>(`select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`, [T]);
    check("pa(1-1) 列 13", cols.length === 13, `${cols.length}`);
    check("pa(1-2) 列名と順序", JSON.stringify(cols.map((c) => c.column_name)) === JSON.stringify(COLS), cols.map((c) => c.column_name).join(","));
    const cks = await q<{ conname: string; def: string }>(`select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid=('public.' || $1)::regclass and contype='c' order by conname`, [T]);
    check("pa(1-3) CHECK 3", cks.length === 3, cks.map((c) => c.conname).join(","));
    const def = (n: string) => cks.find((c) => c.conname === n)?.def ?? "";
    check("pa(1-4) CHECK mode ∈ fixed/rate", /mode = ANY \(ARRAY\['fixed'::text, 'rate'::text\]\)/.test(def("payroll_adjustments_mode_ck")), def("payroll_adjustments_mode_ck"));
    check("pa(1-5) CHECK amount 排他（fixed: amount≥0∧rate_bp null／rate: rate_bp 0..10000∧amount null）",
      /mode = 'fixed'::text\) AND \(amount IS NOT NULL\) AND \(amount >= 0\) AND \(rate_bp IS NULL\)/.test(def("payroll_adjustments_amount_ck"))
      && /mode = 'rate'::text\) AND \(rate_bp IS NOT NULL\) AND \(\(rate_bp >= 0\) AND \(rate_bp <= 10000\)\) AND \(amount IS NULL\)/.test(def("payroll_adjustments_amount_ck")), def("payroll_adjustments_amount_ck"));
    check("pa(1-6) CHECK reason trim 1..200", /length\(TRIM\(BOTH FROM reason\)\) >= 1\) AND \(length\(TRIM\(BOTH FROM reason\)\) <= 200\)/.test(def("payroll_adjustments_reason_ck")), def("payroll_adjustments_reason_ck"));
    const idx = await q<{ indexname: string }>(`select indexname from pg_indexes where schemaname='public' and tablename=$1 order by indexname`, [T]);
    check("pa(1-7) index 3+pk", JSON.stringify(idx.map((i) => i.indexname)) === JSON.stringify(["payroll_adjustments_cast_idx", "payroll_adjustments_org_idx", "payroll_adjustments_pkey", "payroll_adjustments_run_idx"]), idx.map((i) => i.indexname).join(","));
    const rls = await q<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where oid=('public.' || $1)::regclass`, [T]);
    check("pa(1-8) RLS enabled", rls[0]?.relrowsecurity === true);
    const pol = await q<{ policyname: string; cmd: string; roles: string; qual: string }>(
      `select p.policyname, p.cmd, p.roles::text as roles, pg_get_expr(pp.polqual, pp.polrelid) as qual
         from pg_policies p join pg_policy pp on pp.polname = p.policyname and pp.polrelid = ('public.' || $1)::regclass
        where p.schemaname='public' and p.tablename=$1`, [T]);
    check("pa(1-9) policy 1 本（select・authenticated）", pol.length === 1 && pol[0].cmd === "SELECT" && pol[0].roles === "{authenticated}", JSON.stringify(pol.map((p) => [p.policyname, p.cmd, p.roles])));
    check("pa(1-10) policy の using 式＝payroll_runs_select 同形（owner 全店∨自店 ∧ owner/manager 許可列挙）", pol[0]?.qual === POLICY_QUAL, pol[0]?.qual);
  }

  // ── (2) grant ──
  {
    const tg = await q<{ grantee: string; privs: string }>(`select grantee, string_agg(privilege_type, ',' order by privilege_type) as privs from information_schema.role_table_grants where table_schema='public' and table_name=$1 group by grantee`, [T]);
    const m = Object.fromEntries(tg.map((r) => [r.grantee, r.privs]));
    check("pa(2-1) 表 authenticated=SELECT のみ", m.authenticated === "SELECT", JSON.stringify(m));
    check("pa(2-2) 表 anon 0・PUBLIC 0", !m.anon && !m.PUBLIC, JSON.stringify(m));
    const fg = await q<{ proname: string; acl: string | null }>(`select proname, proacl::text as acl from pg_proc where pronamespace='public'::regnamespace and proname in ('payroll_adjustment_add','payroll_adjustment_delete') order by proname`);
    check("pa(2-3) 関数 2 本", fg.length === 2, fg.map((f) => f.proname).join(","));
    for (const f of fg) {
      const acl = f.acl ?? "";
      check(`pa(2-4) ${f.proname} authenticated=EXECUTE`, /authenticated=X/.test(acl), acl);
      check(`pa(2-5) ${f.proname} anon 0・public 0`, acl !== "" && !/anon=/.test(acl) && !/[{,]=X/.test(acl), acl);
    }
    // anon から能動 BLOCKED（permission denied for function）
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const z = "00000000-0000-0000-0000-000000000000";
    const r1 = await anon.rpc("payroll_adjustment_add", { p_run_id: z, p_cast_id: z, p_mode: "fixed", p_amount: 1, p_rate_bp: null, p_before_withholding: true, p_show_detail: true, p_reason: "x" });
    check("pa(2-6) anon payroll_adjustment_add BLOCKED", !!r1.error?.message?.includes("permission denied for function"), r1.error?.message ?? "(no error)");
    const r2 = await anon.rpc("payroll_adjustment_delete", { p_id: z, p_reason: "x" });
    check("pa(2-7) anon payroll_adjustment_delete BLOCKED", !!r2.error?.message?.includes("permission denied for function"), r2.error?.message ?? "(no error)");
  }

  // ── (3) FK ──
  {
    const fk = await q<{ conname: string; def: string }>(`select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid=('public.' || $1)::regclass and contype='f' order by conname`, [T]);
    const defs = fk.map((f) => f.def);
    check("pa(3-1) FK 5 本", fk.length === 5, fk.map((f) => f.conname).join(","));
    check("pa(3-2) org_id→orgs", defs.some((d) => d === "FOREIGN KEY (org_id) REFERENCES orgs(id)"));
    check("pa(3-3) store_id→stores", defs.some((d) => d === "FOREIGN KEY (store_id) REFERENCES stores(id)"));
    check("pa(3-4) run_id→payroll_runs ON DELETE CASCADE", defs.some((d) => d === "FOREIGN KEY (run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE"));
    check("pa(3-5) cast_id→casts", defs.some((d) => d === "FOREIGN KEY (cast_id) REFERENCES casts(id)"));
    check("pa(3-6) created_by→users", defs.some((d) => d === "FOREIGN KEY (created_by) REFERENCES users(id)"));
  }

  // ── (4) 署名 ──
  {
    const sig = await q<{ proname: string; args: string; ret: string; prosecdef: boolean }>(`select proname, pg_get_function_identity_arguments(oid) as args, pg_get_function_result(oid) as ret, prosecdef from pg_proc where pronamespace='public'::regnamespace and proname in ('payroll_adjustment_add','payroll_adjustment_delete') order by proname`);
    const add = sig.find((s) => s.proname === "payroll_adjustment_add"), del = sig.find((s) => s.proname === "payroll_adjustment_delete");
    check("pa(4-1) add の署名 (uuid,uuid,text,integer,integer,boolean,boolean,text)→uuid", add?.args === ADD_ARGS && add?.ret === "uuid", `${add?.args} → ${add?.ret}`);
    check("pa(4-2) add SECURITY DEFINER", add?.prosecdef === true);
    check("pa(4-3) delete の署名 (uuid,text)→void", del?.args === DEL_ARGS && del?.ret === "void", `${del?.args} → ${del?.ret}`);
    check("pa(4-4) delete SECURITY DEFINER", del?.prosecdef === true);
  }

  // ── (5) 異常系（1 トランザクション・savepoint・最後に ROLLBACK）──
  {
    const ownerEmail = FIXTURE_USERS.ownerA.email;
    const u = await q<{ id: string; auth_user_id: string }>(`select id, auth_user_id from public.users where email = $1 and is_active`, [ownerEmail]);
    const st = await q<{ id: string; org_id: string }>(`select id, org_id from public.stores where name = $1`, [STORE_A1]);
    check("pa(5-0) fixture: owner-a と A1 が引ける（seed:f0 済み）", u.length === 1 && st.length === 1, `users ${u.length}・stores ${st.length}`);
    if (u.length === 1 && st.length === 1) {
      const ownerUsersId = u[0].id, ownerAuthUid = u[0].auth_user_id, storeA1 = st[0].id, orgA = st[0].org_id;
      const cast = await q<{ id: string }>(`select id from public.casts where store_id = $1 and is_active order by created_at limit 1`, [storeA1]);
      const castId = cast[0]?.id;
      check("pa(5-0b) fixture: A1 の有効キャストが 1 人以上", !!castId);
      const before = (await q<{ adj: number; runs: number; audits: number }>(`select (select count(*)::int from public.payroll_adjustments) as adj, (select count(*)::int from public.payroll_runs where period='2099-01') as runs, (select count(*)::int from public.audit_logs where action like 'payroll_adjustment%') as audits`))[0];
      await db.query("begin");
      try {
        const asOwner = async () => {
          await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ownerAuthUid, role: "authenticated" })]);
          await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ownerAuthUid]);
          await db.query(`set local role authenticated`);
        };
        const ADD = `select public.payroll_adjustment_add($1,$2,$3,$4,$5,$6,$7,$8) as id`;
        const expectErr = async (label: string, params: unknown[], expected: string) => {
          await db.query("savepoint sp");
          let got = "(no error)";
          try { await asOwner(); await db.query(ADD, params); } catch (e) { got = (e as Error).message; }
          await db.query("rollback to savepoint sp");
          check(`pa(5) ${label} → '${expected}'`, got === expected, `got '${got}'`);
        };
        await db.query("savepoint fixture");
        const run = await q<{ id: string }>(`insert into public.payroll_runs (org_id, store_id, period, status, created_by) values ($1,$2,'2099-01','draft',$3) returning id`, [orgA, storeA1, ownerUsersId]);
        const runId = run[0].id;
        await expectErr("reason 空白のみ", [runId, castId, "fixed", 1000, null, true, true, "   "], "reason required");
        await expectErr("mode 不正", [runId, castId, "percent", 1000, null, true, true, "test"], "bad mode");
        await expectErr("fixed で amount null", [runId, castId, "fixed", null, null, true, true, "test"], "bad amount");
        await expectErr("rate_bp 10001", [runId, castId, "rate", null, 10001, true, true, "test"], "bad amount");
        // 正常 add 1 件（rollback）＝audit の actor と reason
        await db.query("savepoint sp");
        let okId: string | null = null, okErr = "";
        try { await asOwner(); okId = (await q<{ id: string }>(ADD, [runId, castId, "rate", null, 2000, true, true, "test ok"]))[0].id; } catch (e) { okErr = (e as Error).message; }
        const au = okId ? await q<{ action: string; actor_user_id: string; store_id: string; reason: string }>(`select action, actor_user_id, store_id, reason from public.audit_logs where target = $1`, ["payroll_adjustments:" + okId]) : [];
        const row = okId ? await q<{ mode: string; rate_bp: number; amount: number | null; created_by: string }>(`select mode, rate_bp, amount, created_by from public.payroll_adjustments where id = $1`, [okId]) : [];
        await db.query("rollback to savepoint sp");
        check("pa(5+) 正常 add（rate 2000）が uuid を返す", !!okId, okErr);
        check("pa(5+) 行＝mode rate・rate_bp 2000・amount null・created_by=users.id", row[0]?.mode === "rate" && row[0]?.rate_bp === 2000 && row[0]?.amount === null && row[0]?.created_by === ownerUsersId, JSON.stringify(row[0] ?? null));
        check("pa(5+) audit 1 件 action/actor=users.id/store/reason", au.length === 1 && au[0].action === "payroll_adjustment_add" && au[0].actor_user_id === ownerUsersId && au[0].store_id === storeA1 && au[0].reason === "test ok", JSON.stringify(au[0] ?? null));
        // finalized な run → run not draft
        await db.query(`update public.payroll_runs set status='finalized', finalized_at=now() where id=$1`, [runId]);
        await expectErr("finalized な run へ add", [runId, castId, "fixed", 1000, null, true, true, "test"], "run not draft");
        await db.query("rollback to savepoint fixture");
      } finally {
        await db.query("rollback");
      }
      const after = (await q<{ adj: number; runs: number; audits: number }>(`select (select count(*)::int from public.payroll_adjustments) as adj, (select count(*)::int from public.payroll_runs where period='2099-01') as runs, (select count(*)::int from public.audit_logs where action like 'payroll_adjustment%') as audits`))[0];
      check("pa(5-9) ROLLBACK 後の残留＝実行前と同値（adjustments／2099-01 run／audit）", JSON.stringify(after) === JSON.stringify(before), JSON.stringify({ before, after }));
    }
  }

  await db.end();
  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-payroll-adjust ALL PASS (${pass} assertions)`);
  console.log("run 別調整控除(0146): 列 13・CHECK 3・index 3+pk・RLS・policy using 式 / grant 表 SELECT のみ・関数 EXECUTE・anon 0＋BLOCKED / FK 5（cascade）/ 署名 2・secdef / 異常系 5＋正常 add の audit（ROLLBACK・残留 0）");
}

main().catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
