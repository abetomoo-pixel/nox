/**
 * verify:nox-0198 — 0198（2026-11-09 Agoora 手貼り・verify 22 行一致・関数 422・表 120・sha16 ed90503b54b54acd）＝裁定458（前借りは「貸付」）＋裁定461（★6）＋M-122（★7）の恒久回帰。
 *  (1) フラグ＝MIG_0198_APPLIED=true・override
 *  (2) 収蔵＝supabase/migrations/0198_cast_loans.sql（sha16・commit; 1 回・lock_timeout）
 *  (3) live（読取）＝docs/tmp/0198_verify.sql の 22 行が期待値どおり（Agoora の返りと同値）・7 関数の md5
 *  (4) live（BEGIN…ROLLBACK＝DB 変更 0）＝★1 set_comp_plan 33 引数／★3 cast_loan_grant（PIN）／cast_loan_repay／★4 view／★6 cast セルフ腕の撤回・staff 経路・cast_day_applied_of・kiosk_punch の操作担当ゲート／★7 set null
 */
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { MIG_0198_APPLIED, mig0198On, __set0198ForTest } from "../lib/nox/rules-0175/flag";
import { loadEnvOrExit } from "./fixtures-f0";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
type R = { ok: true; rows: Record<string, unknown>[] } | { ok: false; err: string };
const fb = (x: R) => !x.ok && /forbidden/.test(x.err);

// (1)
check("0198(1-1) MIG_0198_APPLIED=true（2026-11-09 手貼り・verify 22 行一致）・override", (MIG_0198_APPLIED as boolean) === true && mig0198On() === true);
__set0198ForTest(false); check("0198(1-2) __set0198ForTest(false) で mig0198On() は false", mig0198On() === false); __set0198ForTest(null);
// (2)
const mig = fs.readFileSync("supabase/migrations/0198_cast_loans.sql");
const sha16 = createHash("sha256").update(mig).digest("hex").slice(0, 16);
const migText = mig.toString("utf8");
check("0198(2-1) 収蔵＝sha16 ed90503b54b54acd・begin〜commit 1 回・lock_timeout・★1〜★7", sha16 === "ed90503b54b54acd" && (migText.match(/^commit;$/gm) ?? []).length === 1 && migText.includes("set local lock_timeout = '10s';") && migText.includes("cast_day_applied_of") && migText.includes("on delete set null"), sha16);

(async () => {
  const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
  const pc = new pg.Client({ connectionString: env.SUPABASE_DB_URL as string, ssl: { rejectUnauthorized: false } });
  await pc.connect();
  try {
    // (3) 22 行
    const rows = (await pc.query(fs.readFileSync("docs/tmp/0198_verify.sql", "utf8"))).rows as { k: string; v: string }[];
    const exp: Record<string, string> = {
      "fn count (expect 422)": "440" /* ★0201c／h／e（2026-11-12）: 431→440 */ /* ★0201（2026-11-11 手貼り・+4＝punch_self_impl／set_store_manager_punch／staff_pin_self_set／cast_pin_self_set）: 427→431 */, "table count (expect 120)": "121", /* ★0200（2026-11-10 手貼り）: 422→427・表 120→121 */ "view count cast_loans/cast_loan_balances (expect 2)": "2", "new fns grant/repay (expect 2)": "2",
      "set_comp_plan 33 args (expect 1)": "1", "set_comp_plan 32 args (expect 0)": "0", "cols comp_plans agreed (expect 2)": "2", "cols advances ack (expect 3)": "3",
      "anon exec on 3 fns (expect 0)": "0", "authenticated exec on 3 fns (expect 3)": "3", "views grants authenticated=SELECT only (expect SELECT,SELECT)": "SELECT,SELECT",
      "views grants anon (expect 0)": "0", "views security_invoker (expect 2)": "2", "cast_loan_grant uses crypt+adv_issue (expect yes)": "yes", "set_comp_plan writes agreed (expect yes)": "yes",
      "cast_day_deductions_set cast self gone (expect yes)": "yes", "kiosk_punch operator gate + day_applied (expect yes)": "yes", "cast_day_applied_of exists (expect 1)": "1",
      "cast_day_applied_of acl anon/authenticated (expect 0/1)": "0/1", "audit fks set null (expect 24)": "24",
    };
    const bad = rows.filter((r) => exp[r.k] !== undefined && exp[r.k] !== r.v).map((r) => `${r.k}=${r.v}`);
    const ack = rows.find((r) => r.k.startsWith("advances ack_method none"))?.v ?? "";
    check("0198(3-1) 検証 22 行＝期待値どおり（Agoora の返り 2026-11-09 と同値・ack none は手貼り後の貸付で全数以下）", rows.length === 22 && bad.length === 0 && ack.split("/").length === 2 && ack.split("/").every((x) => x !== "" && Number.isInteger(Number(x))) && Number(ack.split("/")[0]) <= Number(ack.split("/")[1]), { n: rows.length, bad, ack }); // ★手貼り直後は none＝全数（6/6）・その後の貸付（ack manager／pin）で none ≤ 全数
    const md = (await pc.query(`select proname, left(md5(replace(prosrc, chr(13), '')), 8) m from pg_proc where pronamespace='public'::regnamespace and proname in ('cast_loan_grant','cast_loan_repay','cast_day_applied_of','set_comp_plan','demo_org_reset','cast_day_deductions_set','kiosk_punch') order by 1`)).rows as { proname: string; m: string }[];
    const pin: Record<string, string> = { cast_day_applied_of: "adc29e6e", cast_day_deductions_set: "5a60959e", cast_loan_grant: "78b7b5a3", cast_loan_repay: "d34198b6", demo_org_reset: "f3a12f49" /* ★0200＋0200b（2026-11-10）: a3f58a25→a40dafba（0200 ★8）→f3a12f49（0200b＝c_load のコメントを行頭へ） */, kiosk_punch: "1b5eb974", set_comp_plan: "35bd14f3" };
    check("0198(3-2) 7 関数の prosrc md5＝手貼り直後の live（2026-11-09）", md.length === 7 && md.every((x) => pin[x.proname] === x.m), md);
    const wipe = (await pc.query(`select prosrc like '%''cast_day_deductions'',''deduction_rule_casts'',''availability_terms'',''availability'',''register_day_grants'',''staff_allowances''%' w from pg_proc where pronamespace='public'::regnamespace and proname='demo_org_reset'`)).rows[0].w;
    check("0198(3-3) ★5 demo_org_reset の c_wipe に 6 表（availability_terms が memberships より前）", wipe === true);
    // (4) BEGIN…ROLLBACK
    const cnt = async () => (await pc.query(`select (select count(*)::int from pg_proc where pronamespace='public'::regnamespace) f, (select count(*)::int from pg_tables where schemaname='public') t`)).rows[0] as { f: number; t: number };
    const before = await cnt();
    await pc.query("begin");
    try {
      const st = (await pc.query(`select s.id, s.org_id from public.stores s where s.name='NOX-VERIFY-A1'`)).rows[0] as { id: string; org_id: string };
      const mem = async (role: string) => (await pc.query(`select m.id, m.user_id, u.auth_user_id from public.memberships m join public.users u on u.id=m.user_id where m.store_id=$1 and m.role=$2 and m.is_active order by m.id limit 1`, [st.id, role])).rows[0] as { auth_user_id: string };
      const owner = await mem("owner"), manager = await mem("manager"), staff = await mem("staff");
      const as = async (who: { auth_user_id: string }, sql: string, params: unknown[] = []): Promise<R> => {
        await pc.query("savepoint a");
        try {
          await pc.query("set local role authenticated");
          await pc.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who.auth_user_id, role: "authenticated" })]);
          const r = await pc.query(sql, params); await pc.query("reset role"); await pc.query("release savepoint a"); return { ok: true, rows: r.rows };
        } catch (err) { await pc.query("rollback to savepoint a"); await pc.query("reset role"); return { ok: false, err: (err as Error).message }; }
      };
      const J = (x: unknown) => JSON.stringify(x);
      // ★1
      let r = await as(owner, `select public.set_comp_plan(null, $1, 'NOX-VERIFY-0198-plan', 3000, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, true, p_advance_loan_agreed => true) id`, [st.id]);
      const planId = r.ok ? (r.rows[0].id as string) : null;
      check("0198(4-1) ★1 set_comp_plan＝p_advance_loan_agreed true で新規＝agreed true・agreed_at あり", !!planId && (await pc.query(`select advance_loan_agreed a, advance_loan_agreed_at at from public.comp_plans where id=$1`, [planId])).rows[0].a === true, r.ok ? "ok" : r.err);
      r = await as(owner, `select public.set_comp_plan($1, $2, 'NOX-VERIFY-0198-plan', 3000, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, true) id`, [planId, st.id]);
      check("0198(4-2) ★1 更新で省略＝現値のまま（true）", r.ok && (await pc.query(`select advance_loan_agreed a from public.comp_plans where id=$1`, [planId])).rows[0].a === true, r.ok ? "ok" : r.err);
      // ★2★3
      const nc = (await pc.query(`insert into public.casts (org_id, store_id, name, is_active) values ($1, $2, 'NOX-VERIFY-0198-cast', true) returning id`, [st.org_id, st.id])).rows[0] as { id: string };
      await pc.query(`insert into public.cast_pin (cast_id, org_id, store_id, pin_hash, fail_count) values ($1, $2, $3, extensions.crypt('2468', extensions.gen_salt('bf')), 0)`, [nc.id, st.org_id, st.id]);
      const today = (await pc.query(`select public.biz_date_of($1, now())::text d`, [st.id])).rows[0].d as string;
      r = await as(manager, `select public.cast_loan_grant($1, $2, 10000, $3::date, '試走', null) id`, [st.id, nc.id, today]); const adv1 = r.ok ? (r.rows[0].id as string) : null;
      check("0198(4-3) ★3 cast_loan_grant（PIN なし）＝店長 ok・ack manager・audit", !!adv1 && (await pc.query(`select ack_method m from public.advances where id=$1`, [adv1])).rows[0].m === "manager" && (await pc.query(`select count(*)::int n from public.audit_logs where action='cast_loan_grant' and target='advances:' || $1`, [adv1])).rows[0].n === 1, r.ok ? "ok" : r.err);
      r = await as(manager, `select public.cast_loan_grant($1, $2, 3000, $3::date, null, '0000') id`, [st.id, nc.id, today]); check("0198(4-4) ★3 PIN 不一致＝'bad pin'", !r.ok && /bad pin/.test(r.err), r.ok ? "ok" : r.err);
      r = await as(manager, `select public.cast_loan_grant($1, $2, 3000, $3::date, null, '2468') id`, [st.id, nc.id, today]); const adv2 = r.ok ? (r.rows[0].id as string) : null;
      check("0198(4-5) ★3 PIN 一致＝ack pin", !!adv2 && (await pc.query(`select ack_method m from public.advances where id=$1`, [adv2])).rows[0].m === "pin", r.ok ? "ok" : r.err);
      r = await as(staff, `select public.cast_loan_grant($1, $2, 1000, $3::date, null, null) id`, [st.id, nc.id, today]); check("0198(4-6) ★3 staff は forbidden", fb(r), r.ok ? "ok" : r.err);
      r = await as(manager, `select public.cast_loan_repay($1, 4000, '現金') id`, [adv1]); check("0198(4-7) ★3 repay 4,000＝deducted 4000・open", r.ok && (await pc.query(`select deducted_amount d, status from public.advances where id=$1`, [adv1])).rows[0].d === 4000, r.ok ? "ok" : r.err);
      r = await as(manager, `select public.cast_loan_repay($1, 7000, null) id`, [adv1]); check("0198(4-8) ★3 残額超＝bad amount", !r.ok && /bad amount/.test(r.err), r.ok ? "ok" : r.err);
      r = await as(manager, `select public.cast_loan_repay($1, 6000, null) id`, [adv1]); check("0198(4-9) ★3 残額ちょうど＝status deducted", r.ok && (await pc.query(`select status from public.advances where id=$1`, [adv1])).rows[0].status === "deducted", r.ok ? "ok" : r.err);
      r = await as(manager, `select public.cast_loan_repay($1, 1, null) id`, [adv1]); check("0198(4-10) ★3 deducted への返済＝'advance settled'", !r.ok && /advance settled/.test(r.err), r.ok ? "ok" : r.err);
      // ★4
      r = await as(manager, `select cast_name, amount, repaid, remaining, status, ack_method from public.cast_loans where cast_id=$1 order by amount desc`, [nc.id]);
      check("0198(4-11) ★4 cast_loans（店長）＝2 行・列", r.ok && r.rows.length === 2 && r.rows[0].repaid === 10000 && r.rows[1].remaining === 3000, r.ok ? r.rows : r.err);
      r = await as(manager, `select open_total, n from public.cast_loan_balances where cast_id=$1`, [nc.id]); check("0198(4-12) ★4 cast_loan_balances＝open 3,000・n 1", r.ok && r.rows.length === 1 && r.rows[0].open_total === 3000, r.ok ? r.rows : r.err);
      const castSelf = (await pc.query(`select c.id, u.auth_user_id from public.casts c join public.users u on u.id=c.user_id where c.store_id=$1 and c.is_active and u.auth_user_id is not null order by c.name limit 1`, [st.id])).rows[0] as { id: string; auth_user_id: string } | undefined;
      // ★6
      const pk = await as(owner, `select public.set_deduction(null, $1, 'NOX-VERIFY-0198-pick', 500, 'day', true, 'agreed_cost', false, null, 'pick') id`, [st.id]); const pickId = pk.ok ? (pk.rows[0].id as string) : null;
      if (castSelf) { r = await as(castSelf, `select public.cast_day_deductions_set($1, $2::date, $3::jsonb)`, [castSelf.id, today, J([{ deduction_id: pickId, enabled: true }])]); check("0198(4-13) ★6 cast 本人の cast_day_deductions_set＝forbidden（0196 §9-1 の撤回）", fb(r), r.ok ? "ok" : r.err); } else check("0198(4-13) cast 本人（auth のあるキャストが A1 に無い）", false);
      r = await as(staff, `select public.cast_day_deductions_set($1, $2::date, $3::jsonb)`, [nc.id, today, J([{ deduction_id: pickId, enabled: true }])]);
      check("0198(4-14) ★6 staff（自店）＝ok・1 行", r.ok && (await pc.query(`select count(*)::int n from public.cast_day_deductions where cast_id=$1 and biz_date=$2`, [nc.id, today])).rows[0].n === 1, r.ok ? "ok" : r.err);
      await as(owner, `select public.deduction_rule_cast_set($1, $2, true, 450)`, [pickId, nc.id]);
      r = await as(staff, `select public.cast_day_applied_of($1, $2::date) j`, [nc.id, today]); check("0198(4-15) ★6 cast_day_applied_of（staff）＝pick on の行・額の上書き 450", r.ok && Array.isArray(r.rows[0].j) && (r.rows[0].j as { id: string; amount: number }[]).some((x) => x.id === pickId && x.amount === 450), r.ok ? r.rows[0].j : r.err);
      if (castSelf) { r = await as(castSelf, `select public.cast_day_applied_of($1, null) j`, [nc.id]); check("0198(4-16) ★6 cast 本人から他人は forbidden", fb(r), r.ok ? "ok" : r.err); }
      const kUid = randomUUID(); const kr = await as(manager, `select public.kiosk_provision($1, $2, 'NOX-VERIFY-0198 端末') id`, [kUid, st.id]); const kd = { auth_user_id: kUid };
      check("0198(4-17) 試走用の端末", kr.ok, kr.ok ? "ok" : kr.err);
      r = await as(kd, `select public.kiosk_punch($1, '2468', 'in', null, $2::jsonb) j`, [nc.id, J([{ deduction_id: pickId, enabled: true }])]); check("0198(4-18) ★6 端末（操作担当なし）＋p_day_deductions＝forbidden・打刻なし", fb(r) && (await pc.query(`select count(*)::int n from public.punches where cast_id=$1`, [nc.id])).rows[0].n === 0, r.ok ? "ok" : r.err);
      r = await as(kd, `select public.kiosk_punch($1, '2468', 'in') j`, [nc.id]); check("0198(4-19) ★6 3 引数の出勤＝ok・day_applied に店が付けた行（450）", r.ok && (r.rows[0].j as { ok: boolean; day_applied?: { id: string; amount: number }[] }).ok === true && ((r.rows[0].j as { day_applied?: { id: string; amount: number }[] }).day_applied ?? []).some((x) => x.id === pickId && x.amount === 450), r.ok ? r.rows[0].j : r.err);
      // ★7
      const n7 = (await pc.query(`select count(*)::int n from pg_constraint where connamespace='public'::regnamespace and contype='f' and confdeltype='n' and conname in ('availability_terms_updated_by_fkey','cast_day_deductions_set_by_fkey','register_day_grants_granted_by_fkey','deduction_rule_casts_set_by_fkey')`)).rows[0].n;
      check("0198(4-20) ★7 監査系 FK＝set null（availability_terms.updated_by ほか）", n7 === 4, n7);
      const mid = await cnt(); check("0198(4-21) tx 内も関数 422・表 120", mid.f === 440 /* ★0201c／h／e（2026-11-12）: 431→440 */ /* ★0201（2026-11-11 手貼り・+4＝punch_self_impl／set_store_manager_punch／staff_pin_self_set／cast_pin_self_set）: 427→431 */ && mid.t === 121 /* ★0200（2026-11-10 手貼り）: 422→427・表 120→121 */, mid);
    } finally { await pc.query("rollback"); }
    const after = await cnt();
    check("0198(4-22) ROLLBACK＝DB 変更 0（関数 422・表 120）", after.f === before.f && after.t === before.t && after.f === 440 /* ★0201c／h／e（2026-11-12）: 431→440 */ /* ★0201（2026-11-11 手貼り・+4＝punch_self_impl／set_store_manager_punch／staff_pin_self_set／cast_pin_self_set）: 427→431 */ /* ★0200（2026-11-10 手貼り）: 422→427・表 120→121 */, after);
  } finally { await pc.end(); }
  if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log(`verify:nox-0198 ALL PASS (${pass} assertions)`);
})();
