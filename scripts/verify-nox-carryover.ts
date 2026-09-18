/*
 * verify:nox-carryover — mig0148 ★1〜★3 繰越消費（裁定272-1）payroll_carryover_sync の係留。
 *   npm run verify:nox-carryover（env: URL/PUBLISHABLE/SUPABASE_DB_URL・seed:f0 済み）。f0 54 段目。
 *   Postgres 直結の 1 トランザクション内で fixture ユーザーの JWT claims を emulate（payroll-adjust 段(5) と同型）→
 *   最後に ROLLBACK＝残留 0・snapshot 一致（教訓88: finally で接続を閉じる）。
 *
 *  (1) 前期 run（2097-11）を調整行つきで finalize（breakdown.pay.adjustOverflow=4000）→ 次期 draft（2097-12）で sync →
 *      carryover 行 1（amount＝前期 adjustOverflow・source='carryover'・carry_from＝前期 payslip・理由「前期繰越」・show_detail true・源泉後 before_withholding=false・created_by＝actor）
 *  (2) 再 sync で件数・id 不変（冪等・upsert）・前期 overflow の更新は amount に追随・manager 自店も可・他 org manager は 'run not found'・staff／cast は 'forbidden'
 *  (3) 前期 reopen（flag reopen_flow を org 既定で一時 ON）→ 調整行削除 → 再 finalize（overflow 0）→ 次期 sync で行が消える（戻り 1＝削除・rows 0）
 *  (4) draft 以外（finalized）は 'run not draft'・run 不在は 'run not found'・前期 payslip 無しは 0（行 0）
 *  (5) manual 行に部分 unique は掛からない（同 run×cast の manual 2 行）・carryover 行と manual 行は共存
 *  (6) audit: payroll_carryover_sync 1 行／成功呼び出し（after_json に upserted／deleted・store_id・reason「前期繰越」）
 *  anon は BLOCKED（permission denied for function）。
 *  逆テスト 1 本（手動・1 回）: co(1-3) の期待 amount を 4001 にする→赤・戻して緑。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_DB_URL"]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

const PREV = "2097-11", NEXT = "2097-12", LONE = "2096-05";

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
    // ── fixture 解決 ──
    const st = await q<{ id: string; org_id: string }>(`select id, org_id from public.stores where name = $1`, [STORE_A1]);
    const uidOf = async (key: keyof typeof FIXTURE_USERS) => (await q<{ id: string; auth_user_id: string }>(`select id, auth_user_id from public.users where email = $1 and is_active`, [FIXTURE_USERS[key].email]))[0];
    const ownerA = await uidOf("ownerA"), managerA1 = await uidOf("managerA1"), managerB1 = await uidOf("managerB1"), staffA1 = await uidOf("staffA1"), castU = await uidOf("castA1a");
    check("co(0-1) fixture: A1／owner-a／manager-a1／manager-b1／staff-a1／cast-a1a が引ける（seed:f0 済み）", st.length === 1 && !!ownerA && !!managerA1 && !!managerB1 && !!staffA1 && !!castU);
    if (st.length !== 1 || !ownerA || !managerA1 || !managerB1 || !staffA1 || !castU) throw new Error("fixture 解決失敗");
    const storeA1 = st[0].id, orgA = st[0].org_id;
    const casts = await q<{ id: string; name: string }>(`select id, name from public.casts where store_id = $1 and is_active order by name`, [storeA1]);
    const castA = casts.find((c) => c.name === FIXTURE_USERS.castA1a.name)?.id, castB = casts.find((c) => c.name === FIXTURE_USERS.castA1b.name)?.id;
    check("co(0-2) fixture: A1 の cast a／b が引ける", !!castA && !!castB, casts.map((c) => c.name).join(","));
    if (!castA || !castB) throw new Error("cast 解決失敗");

    const snap = async () => JSON.stringify((await q(`select (select count(*)::int from public.payroll_adjustments) a, (select count(*)::int from public.payroll_runs where store_id = $1) r,
      (select count(*)::int from public.payslips where store_id = $1) p, (select count(*)::int from public.audit_logs where org_id = $2) au,
      (select count(*)::int from public.feature_flags where org_id = $2) ff`, [storeA1, orgA]))[0]);
    const before = await snap();

    await db.query("begin");
    try {
      // ── (1) 前期 run を調整行つきで finalize ──
      const prev = (await q<{ id: string }>(`insert into public.payroll_runs (org_id, store_id, period, status, created_by) values ($1,$2,$3,'draft',$4) returning id`, [orgA, storeA1, PREV, ownerA.id]))[0].id;
      await asUid(ownerA.auth_user_id);
      const adj = await call(`select public.payroll_adjustment_add($1,$2,'fixed',9000,null,false,true,'verify 罰金') as id`, [prev, castA]);
      check("co(1-1) 前期 draft に調整行（fixed 9000・源泉後）を add できる", adj.ok, errOf(adj));
      const adjId = adj.ok ? (adj.rows[0].id as string) : null;
      await asPg();
      const slips = (overflowA: number) => JSON.stringify([
        { cast_id: castA, net: 0, breakdown: { pay: { gross: 5000, net: 0, adjustOverflow: overflowA }, extras: [] } },
        { cast_id: castB, net: 3000, breakdown: { pay: { gross: 3000, net: 3000, adjustOverflow: 0 }, extras: [] } },
      ]);
      const fin = await call(`select public.payroll_finalize($1,$2,$3,$4,$5::jsonb) as n`, [orgA, ownerA.id, prev, randomUUID(), slips(4000)]);
      check("co(1-2) 前期 finalize（payslip 2・cast a の adjustOverflow=4000）", fin.ok && fin.rows[0].n === 2, errOf(fin));
      const prevSlipA = (await q<{ id: string }>(`select id from public.payslips where run_id = $1 and cast_id = $2`, [prev, castA]))[0]?.id;
      // 次期 draft run（payroll_run_create＝owner 文脈）
      await asUid(ownerA.auth_user_id);
      const rc = await call(`select id, status from public.payroll_run_create($1,$2)`, [storeA1, NEXT]);
      check("co(1-2b) 次期 run_create → draft", rc.ok && rc.rows[0].status === "draft", errOf(rc));
      const next = rc.ok ? (rc.rows[0].id as string) : "";
      const s1 = await call(`select public.payroll_carryover_sync($1) as n`, [next]);
      check("co(1-3) sync → 戻り 1（upsert 1）", s1.ok && s1.rows[0].n === 1, errOf(s1) + " " + JSON.stringify(s1.ok ? s1.rows : null));
      await asPg();
      type Row = { id: string; cast_id: string; mode: string; amount: number; rate_bp: number | null; before_withholding: boolean; show_detail: boolean; reason: string; created_by: string; source: string; carry_from_payslip_id: string | null; org_id: string; store_id: string };
      const rows1 = await q<Row>(`select id, cast_id, mode, amount, rate_bp, before_withholding, show_detail, reason, created_by, source, carry_from_payslip_id, org_id, store_id from public.payroll_adjustments where run_id = $1 and source = 'carryover'`, [next]);
      const r = rows1[0];
      check("co(1-3) carryover 行 1（cast a）・amount 4000＝前期 adjustOverflow", rows1.length === 1 && r?.cast_id === castA && r?.amount === 4000, JSON.stringify(rows1));
      check("co(1-4) 行の形: mode fixed・rate_bp null・★源泉後（before_withholding=false）・show_detail true・理由「前期繰越」", r?.mode === "fixed" && r?.rate_bp === null && r?.before_withholding === false && r?.show_detail === true && r?.reason === "前期繰越", JSON.stringify(r));
      check("co(1-5) source='carryover'・carry_from_payslip_id＝前期 payslip（cast a）・org/store 一致・created_by＝actor users.id", r?.source === "carryover" && r?.carry_from_payslip_id === prevSlipA && r?.org_id === orgA && r?.store_id === storeA1 && r?.created_by === ownerA.id, JSON.stringify({ r, prevSlipA }));
      const rowsB = await q<{ n: number }>(`select count(*)::int as n from public.payroll_adjustments where run_id = $1 and cast_id = $2`, [next, castB]);
      check("co(1-6) overflow 0 の cast b には行を作らない", rowsB[0].n === 0);

      // ── (2) 冪等・更新追随・ロール ──
      await asUid(ownerA.auth_user_id);
      const s2 = await call(`select public.payroll_carryover_sync($1) as n`, [next]);
      await asPg();
      const rows2 = await q<Row>(`select id, amount from public.payroll_adjustments where run_id = $1 and source = 'carryover'`, [next]);
      check("co(2-1) 再 sync＝件数 1 のまま・id 不変（冪等 upsert）", s2.ok && rows2.length === 1 && rows2[0].id === r?.id && rows2[0].amount === 4000, errOf(s2) + " " + JSON.stringify(rows2));
      await db.query(`update public.payslips set breakdown_json = jsonb_set(breakdown_json, '{pay,adjustOverflow}', '2500'::jsonb) where id = $1`, [prevSlipA]);
      await asUid(ownerA.auth_user_id);
      const s3 = await call(`select public.payroll_carryover_sync($1) as n`, [next]);
      await asPg();
      const rows3 = await q<Row>(`select id, amount from public.payroll_adjustments where run_id = $1 and source = 'carryover'`, [next]);
      check("co(2-2) 前期 overflow が 2500 に変わると sync で amount 2500（同 id・upsert の update 側）", s3.ok && rows3.length === 1 && rows3[0].id === r?.id && rows3[0].amount === 2500, JSON.stringify(rows3));
      await asUid(managerA1.auth_user_id);
      const sM = await call(`select public.payroll_carryover_sync($1) as n`, [next]);
      check("co(2-3) manager 自店は可（戻り 1）", sM.ok && sM.rows[0].n === 1, errOf(sM));
      await asUid(managerB1.auth_user_id);
      const sB = await call(`select public.payroll_carryover_sync($1) as n`, [next]);
      check("co(2-4) 他 org の manager は 'run not found'（org 照合で見えない）", !sB.ok && sB.err === "run not found", errOf(sB));
      await asUid(staffA1.auth_user_id);
      const sS = await call(`select public.payroll_carryover_sync($1) as n`, [next]);
      check("co(2-5) staff は 'forbidden'", !sS.ok && sS.err === "forbidden", errOf(sS));
      await asUid(castU.auth_user_id);
      const sC = await call(`select public.payroll_carryover_sync($1) as n`, [next]);
      check("co(2-6) cast は 'forbidden'", !sC.ok && sC.err === "forbidden", errOf(sC));

      // ── (5) manual 行に部分 unique は掛からない・共存 ──
      await asUid(ownerA.auth_user_id);
      const m1 = await call(`select public.payroll_adjustment_add($1,$2,'fixed',100,null,true,true,'manual 1') as id`, [next, castA]);
      const m2 = await call(`select public.payroll_adjustment_add($1,$2,'fixed',200,null,true,true,'manual 2') as id`, [next, castA]);
      await asPg();
      const mix = await q<{ source: string; n: number }>(`select source, count(*)::int as n from public.payroll_adjustments where run_id = $1 and cast_id = $2 group by source order by source`, [next, castA]);
      check("co(5-1) 同 run×cast の manual 2 行が入る（部分 unique は carryover のみ）・carryover 1 行と共存", m1.ok && m2.ok && JSON.stringify(mix) === JSON.stringify([{ source: "carryover", n: 1 }, { source: "manual", n: 2 }]), errOf(m1) + " " + errOf(m2) + " " + JSON.stringify(mix));
      const dup = await call(`insert into public.payroll_adjustments (org_id, store_id, run_id, cast_id, mode, amount, before_withholding, show_detail, reason, created_by, source) values ($1,$2,$3,$4,'fixed',1,false,true,'dup',$5,'carryover')`, [orgA, storeA1, next, castA, ownerA.id]);
      check("co(5-2) carryover の 2 行目は部分 unique 違反（payroll_adjustments_carryover_uidx）", !dup.ok && /payroll_adjustments_carryover_uidx/.test(dup.err), errOf(dup));

      // ── (3) 前期 reopen → 調整行削除 → 再 finalize（overflow 0）→ 次期 sync で消える ──
      await db.query(`insert into public.feature_flags (org_id, store_id, key, enabled) values ($1, null, 'reopen_flow', true)`, [orgA]);
      const ro = await call(`select public.payroll_reopen($1,$2,$3,$4,'verify reopen') as s`, [orgA, ownerA.id, prev, randomUUID()]);
      const prevSt = (await q<{ status: string }>(`select status from public.payroll_runs where id = $1`, [prev]))[0]?.status;
      check("co(3-1) 前期 reopen → draft", ro.ok && prevSt === "draft", errOf(ro) + " status=" + prevSt);
      await asUid(ownerA.auth_user_id);
      const del = await call(`select public.payroll_adjustment_delete($1,'verify del')`, [adjId]);
      check("co(3-2) 前期の調整行を delete", del.ok, errOf(del));
      await asPg();
      const fin2 = await call(`select public.payroll_finalize($1,$2,$3,$4,$5::jsonb) as n`, [orgA, ownerA.id, prev, randomUUID(), slips(0)]);
      check("co(3-3) 前期を再 finalize（overflow 0）", fin2.ok && fin2.rows[0].n === 2, errOf(fin2));
      await asUid(ownerA.auth_user_id);
      const s4 = await call(`select public.payroll_carryover_sync($1) as n`, [next]);
      await asPg();
      const rows4 = await q<{ n: number }>(`select count(*)::int as n from public.payroll_adjustments where run_id = $1 and source = 'carryover'`, [next]);
      const manual4 = await q<{ n: number }>(`select count(*)::int as n from public.payroll_adjustments where run_id = $1 and source = 'manual'`, [next]);
      check("co(3-4) 次期 sync → 戻り 1（削除 1）・carryover 行 0・manual 2 行は残る", s4.ok && s4.rows[0].n === 1 && rows4[0].n === 0 && manual4[0].n === 2, errOf(s4) + " " + JSON.stringify({ rows4, manual4 }));
      await asUid(ownerA.auth_user_id);
      const s5 = await call(`select public.payroll_carryover_sync($1) as n`, [next]);
      check("co(3-5) もう一度 sync → 戻り 0（削除対象なし＝冪等）", s5.ok && s5.rows[0].n === 0, errOf(s5));

      // ── (4) draft 以外・run 不在・前期 payslip 無し ──
      await asPg();
      await db.query(`update public.payroll_runs set status = 'finalized', finalized_at = now() where id = $1`, [next]);
      await asUid(ownerA.auth_user_id);
      const sF = await call(`select public.payroll_carryover_sync($1) as n`, [next]);
      check("co(4-1) finalized な run へ sync は 'run not draft'", !sF.ok && sF.err === "run not draft", errOf(sF));
      await asPg();
      await db.query(`update public.payroll_runs set status = 'draft', finalized_at = null where id = $1`, [next]);
      await asUid(ownerA.auth_user_id);
      const sN = await call(`select public.payroll_carryover_sync($1) as n`, [randomUUID()]);
      check("co(4-2) 存在しない run は 'run not found'", !sN.ok && sN.err === "run not found", errOf(sN));
      await asPg();
      const lone = (await q<{ id: string }>(`insert into public.payroll_runs (org_id, store_id, period, status, created_by) values ($1,$2,$3,'draft',$4) returning id`, [orgA, storeA1, LONE, ownerA.id]))[0].id;
      await asUid(ownerA.auth_user_id);
      const sL = await call(`select public.payroll_carryover_sync($1) as n`, [lone]);
      await asPg();
      const rowsL = await q<{ n: number }>(`select count(*)::int as n from public.payroll_adjustments where run_id = $1`, [lone]);
      check("co(4-3) 前期 payslip が無い run は 0（行 0・raise しない）", sL.ok && sL.rows[0].n === 0 && rowsL[0].n === 0, errOf(sL));

      // ── (6) audit ──
      const au = await q<{ n: number; last: Record<string, unknown>; store_id: string; reason: string }>(`select count(*)::int as n, (array_agg(after_json order by at desc))[1] as last, (array_agg(store_id order by at desc))[1] as store_id, (array_agg(reason order by at desc))[1] as reason from public.audit_logs where action = 'payroll_carryover_sync' and target = $1`, ["payroll_runs:" + next]);
      check("co(6-1) audit: 成功 sync 6 回＝6 行（owner 4＋manager 1＋finalized 後 1 ではなく raise 分は書かない）", au[0].n === 6, `got ${au[0].n}`);
      check("co(6-2) audit after_json に run_id／prev_period／upserted／deleted・store_id＝A1・reason「前期繰越」", au[0].last?.run_id === next && au[0].last?.prev_period === PREV && typeof au[0].last?.upserted === "number" && typeof au[0].last?.deleted === "number" && au[0].store_id === storeA1 && au[0].reason === "前期繰越", JSON.stringify(au[0]));
    } finally {
      await db.query("rollback");
    }
    const after = await snap();
    check("co(9-1) ROLLBACK 後の残留＝実行前と同値（adjustments／A1 runs／A1 payslips／org A audit／feature_flags）", after === before, `${before} → ${after}`);
  } finally {
    await db.end().catch(() => undefined);
  }

  // anon BLOCKED
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await anon.rpc("payroll_carryover_sync", { p_run_id: null });
  check("co(9-2) anon payroll_carryover_sync BLOCKED", !!error?.message?.includes("permission denied for function"), error?.message ?? "(no error)");

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-carryover ALL PASS (${pass} assertions)`);
  console.log("繰越消費(0148 ★1〜★3): finalize→次期 sync で carryover 1 行（4000・源泉後・前期繰越・carry_from）/ 冪等・更新追随・manager 自店可・他 org/staff/cast 拒否 / reopen→削除→再 finalize→sync で消える / not draft・not found・前期なし 0 / manual 2 行共存・carryover 2 行目は unique 違反 / audit 6 行（ROLLBACK・残留 0）");
}

main().catch((e) => { console.error(e); process.exit(1); });
