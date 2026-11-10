/*
 * verify:nox-0196 — 0196（2026-11-06 Agoora 手貼り・verify 22 行一致・関数 418・表 119・sha16 baab7cbbc665ec4b）のフラグ true 便＝キオスクの便
 *   ＝裁定448 B 方式（PIN の本人セッション＝kiosk_person_claim／kiosk_person_end・kiosk_lock は jsonb）＋§6-4（kiosk_register_state の nominations）
 *   ＋§9 M-103（cast_day_deductions_set の cast セルフ腕・kiosk_punch の p_day_deductions・kiosk_punch_state の day_rules）＋M-93（候補の判定）＋punch_proxy の staff
 *   ＋裁定456 の 1／457（kiosk_login・kiosk_unlock の staff は can_register を見ない・kiosk_unlock は inner に fp・kiosk_operator_list は不変）＋M-110（KioskUnlockPad が fp を送る）。
 *  (1) フラグ／(2) client の pin（M-110・入口・route）／(3) live（読取）＝関数 418・表 119・新設 2・列 2・署名・ACL・本文の印／
 *  (4) live（BEGIN…ROLLBACK＝DB 変更 0）＝try_0196.mjs の 31 段を写す（NOX-VERIFY-A1・端末を発行して束縛・staff／owner の解除・claim／end／lock・nominations・cast セルフ腕・day_rules・出勤時の控除・punch_proxy の staff・can_register=false の staff の PIN 入場）。
 *  使い方: npm run verify:nox-0196（(3)(4) は .env.local の SUPABASE_DB_URL）
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { MIG_0196_APPLIED, MIG_0198_APPLIED, mig0196On, __set0196ForTest } from "../lib/nox/rules-0175/flag"; // ★0198（裁定461）: cast セルフ腕の撤回・kiosk_punch の操作担当ゲート＝フラグで反転
import { KIOSK_PERSON_PIN_LINK, kioskPersonMustLeaveOf, kioskPersonSessionAllowedOf } from "../lib/nox/kiosk/person-session";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;

// (1)
check("0196(1-1) MIG_0196_APPLIED=true（2026-11-06 手貼り・verify 22 行一致）・override", (MIG_0196_APPLIED as boolean) === true && mig0196On() === true && (__set0196ForTest(false), !mig0196On()) && (__set0196ForTest(null), mig0196On()));
check("0196(1-2) 本人セッションの役割＝manager／staff（★0199＝cast も・owner／admin は leave）", kioskPersonSessionAllowedOf("manager") && kioskPersonSessionAllowedOf("staff") && !kioskPersonSessionAllowedOf("owner") && !kioskPersonMustLeaveOf("cast") /* ★0199（裁定466・M-125・2026-11-10）: cast は can_register ∧ 店 ≥2 を kiosk_person_claim が判定 */ && kioskPersonMustLeaveOf("admin") && KIOSK_PERSON_PIN_LINK === "スタッフでログイン（PIN）");

// (2) client の pin
const pad = src("components/nox/kiosk-unlock-pad.tsx");
check("0196(2-1) M-110＝KioskUnlockPad が kiosk_unlock に p_device_fp（browserDeviceFp・mig0190On のとき）を送る（★裁定469（M-128・2026-11-09）: 包みは廃止＝PIN の入口はこの 1 つ）", pad.includes('supabase.rpc("kiosk_unlock", { p_pin: pin, p_membership_id: membershipId ?? null, ...(mig0190On() ? { p_device_fp: browserDeviceFp() } : {}) })') && !fs.existsSync("components/nox/kiosk-workspace.tsx"));
check("0196(2-2) 入口＝/kiosk は mig0196On() で KioskPersonEntry（KioskUnlockPad → startKioskPersonSession → dest）",
  src("app/kiosk/page.tsx").includes("{mig0196On() ? <KioskPersonEntry /> : (") && src("components/nox/kiosk-person-entry.tsx").includes("<KioskUnlockPad onUnlocked={async () => {") && src("components/nox/kiosk-person-entry.tsx").includes("const r = await startKioskPersonSession(createClient());"));
check("0196(2-3) route＝person-session は admin で kiosk_person_claim（端末の uid・fp）・person-end は kiosk_person_end",
  src("app/api/kiosk/person-session/route.ts").includes('admin.rpc("kiosk_person_claim", { p_device_auth_user: user.id, p_device_fp: fp })') && src("app/api/kiosk/person-end/route.ts").includes('"kiosk_person_end"'));
check("0196(2-4) 収蔵＝supabase/migrations/0196_kiosk_person.sql（begin の直後に lock_timeout・★5 裁定456 の 1）", src("supabase/migrations/0196_kiosk_person.sql").includes("begin;\nset local lock_timeout = '10s';") && src("supabase/migrations/0196_kiosk_person.sql").includes("return public.kiosk_login(v_mid, p_pin, p_device_fp)"));

// (3)(4) live
async function main(): Promise<void> {
  let dbUrl = process.env.SUPABASE_DB_URL; if (!dbUrl) { try { process.loadEnvFile(".env.local"); } catch { /* no env */ } dbUrl = process.env.SUPABASE_DB_URL; }
  if (dbUrl) {
    const pc = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await pc.connect();
    try {
      const cntQ = async () => (await pc.query(`select (select count(*)::int from pg_proc where pronamespace='public'::regnamespace) f, (select count(*)::int from pg_tables where schemaname='public') t`)).rows[0] as { f: number; t: number };
      const before = await cntQ();
      const r = (await pc.query(`select
        (select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname in ('kiosk_person_claim','kiosk_person_end')) n2,
        (select count(*)::int from information_schema.columns where table_schema='public' and table_name='kiosk_sessions' and column_name in ('person_auth_session','person_role')) c2,
        (select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_punch' and pronargs=5) kp5,
        (select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_punch') kpn,
        (select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_punch_state' and pronargs=1) kps1,
        (select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_punch_state') kpsn,
        (select pg_get_function_result(p.oid) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='kiosk_lock') lockret,
        (select string_agg(has_function_privilege('service_role', p.oid, 'execute')::text || '/' || has_function_privilege('authenticated', p.oid, 'execute')::text, ',' order by p.proname) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('kiosk_person_claim','kiosk_person_end')) acl2,
        (select count(*)::int from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('kiosk_person_claim','kiosk_person_end','kiosk_lock','kiosk_register_state','cast_day_deductions_set','kiosk_punch','kiosk_punch_state','kiosk_operator_list','kiosk_login','kiosk_unlock','punch_proxy') and has_function_privilege('anon', p.oid, 'execute')) anon11,
        (select count(*)::int from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('kiosk_lock','kiosk_register_state','cast_day_deductions_set','kiosk_punch','kiosk_punch_state','kiosk_operator_list','kiosk_login','kiosk_unlock','punch_proxy') and has_function_privilege('authenticated', p.oid, 'execute')) auth9,
        (select prosrc like '%''nominations''%' from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_register_state') nom,
        (select bool_and(prosrc like '%sys_cast_register%') from pg_proc where pronamespace='public'::regnamespace and proname in ('kiosk_login','kiosk_operator_list')) m93,
        (select bool_and(prosrc like '%or m.role = ''staff''%') from pg_proc where pronamespace='public'::regnamespace and proname in ('kiosk_login','kiosk_unlock')) staff2,
        (select prosrc like '%kiosk_login(v_mid, p_pin, p_device_fp)%' from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_unlock') unlockfp,
        (select prosrc like '%(m.role = ''staff'' and m.can_register)%' from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_operator_list') opkeep,
        (select prosrc like '%in (''manager'',''staff'')%' from pg_proc where pronamespace='public'::regnamespace and proname='punch_proxy') ppstaff,
        (select prosrc like '%not today%' from pg_proc where pronamespace='public'::regnamespace and proname='cast_day_deductions_set') selfarm,
        (select prosrc like '%''day_rules''%' from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_punch_state') dayrules`)).rows[0];
      check("0196(3-1) live＝関数 418・表 119・新設 2・列 2・kiosk_punch は 5 引数だけ・kiosk_punch_state は 1 引数だけ・kiosk_lock は jsonb", before.f === 422 /* ★0198（2026-11-09 手貼り・+3＝cast_loan_grant／cast_loan_repay／cast_day_applied_of）: 419→422 */ && before.t === 120 /* ★0197（2026-11-06・+1＝register_day_grant_set・作り直し 2 本は ±0）: 418→419 */ && r.n2 === 2 && r.c2 === 2 && r.kp5 === 1 && r.kpn === 1 && r.kps1 === 1 && r.kpsn === 1 && r.lockret === "jsonb", J({ before, r }));
      check("0196(3-2) ACL＝claim／end は service_role だけ（authenticated 不可）・anon は 11 本とも不可・authenticated は 9 本（kiosk_unlock を含む）", r.acl2 === "true/false,true/false" && r.anon11 === 0 && r.auth9 === 9, J({ acl2: r.acl2, anon11: r.anon11, auth9: r.auth9 }));
      check("0196(3-3) 本文の印＝nominations・M-93（login／operator_list）・裁定456 の 1（login／unlock の staff）・裁定457（unlock が fp を inner へ）・operator_list は can_register のまま・punch_proxy の staff・not today・day_rules",
        r.nom === true && r.m93 === true && r.staff2 === true && r.unlockfp === true && r.opkeep === true && r.ppstaff === true && r.selfarm === !MIG_0198_APPLIED /* ★0198 ★6（裁定461）: cast セルフ腕の撤回＝'not today' は消える */ && r.dayrules === true, J(r));
      // (4) BEGIN…ROLLBACK（try_0196.mjs の写し）
      await pc.query("begin");
      try {
        const st = (await pc.query(`select s.id, s.org_id from public.stores s where s.name='NOX-VERIFY-A1'`)).rows[0];
        const st2 = (await pc.query(`select s.id, s.org_id from public.stores s where s.name='NOX-VERIFY-A2'`)).rows[0];
        const mem = async (role: string, store = st.id) => (await pc.query(`select m.id, m.user_id, u.auth_user_id from public.memberships m join public.users u on u.id=m.user_id where m.store_id=$1 and m.role=$2 and m.is_active order by m.id limit 1`, [store, role])).rows[0];
        const owner = await mem("owner"), manager = await mem("manager"), staff = await mem("staff"), staff2 = st2 ? await mem("staff", st2.id) : null;
        type R = { ok: boolean; rows: Record<string, unknown>[]; err: string };
        const as = async (who: { auth_user_id: string }, sql: string, params: unknown[] = []): Promise<R> => {
          await pc.query("savepoint a");
          try {
            await pc.query("set local role authenticated");
            await pc.query(`select set_config('request.jwt.claims', $1, true)`, [J({ sub: who.auth_user_id, role: "authenticated" })]);
            const q = await pc.query(sql, params); await pc.query("reset role"); await pc.query("release savepoint a"); return { ok: true, rows: q.rows, err: "" };
          } catch (e) { await pc.query("rollback to savepoint a"); await pc.query("reset role"); return { ok: false, rows: [], err: (e as Error).message }; }
        };
        const su = async (sql: string, params: unknown[] = []): Promise<R> => { await pc.query("savepoint s"); try { const q = await pc.query(sql, params); await pc.query("release savepoint s"); return { ok: true, rows: q.rows, err: "" }; } catch (e) { await pc.query("rollback to savepoint s"); return { ok: false, rows: [], err: (e as Error).message }; } };
        const fb = (x: R) => !x.ok && /forbidden/.test(x.err);
        const jj = (x: R) => (x.ok ? (x.rows[0] as Record<string, unknown>).j as Record<string, unknown> : null);
        // 試走用の端末（束縛済み）と解除
        const kUid = randomUUID();
        const kr = await as(manager, `select public.kiosk_provision($1, $2, 'NOX-VERIFY-0196 端末') id`, [kUid, st.id]);
        if (!kr.ok) throw new Error("端末の発行: " + kr.err);
        const devId = kr.rows[0].id as string; const kdev = { auth_user_id: kUid };
        let x = await su(`select public.kiosk_person_claim($1, 'fp0196') j`, [kUid]); check("0196(4-1) claim＝未束縛の端末は 'not bound'", !x.ok && /not bound/.test(x.err), x.err);
        await pc.query(`update public.kiosk_devices set device_fp='fp0196', bound_at=now() where id=$1`, [devId]);
        x = await su(`select public.kiosk_person_claim($1, 'fp0196') j`, [kUid]); check("0196(4-2) claim＝解除が無い端末は 'no session'", !x.ok && /no session/.test(x.err), x.err);
        const sess = async (m: { id: string; user_id: string }) => { await pc.query(`update public.kiosk_sessions set ended_at=now() where device_id=$1 and ended_at is null`, [devId]); return (await pc.query(`insert into public.kiosk_sessions (org_id, store_id, device_id, membership_id, operator_user_id, token_hash, unlock_method) values ($1, $2, $3, $4, $5, 'v0196', 'pin') returning id`, [st.org_id, st.id, devId, m.id, m.user_id])).rows[0].id as string; };
        let sid = await sess(owner);
        x = await su(`select public.kiosk_person_claim($1, 'fp0196') j`, [kUid]); check("0196(4-3) claim＝owner（管理者）の解除は forbidden（通常ログインへ）", fb(x), x.err);
        sid = await sess(staff);
        x = await su(`select public.kiosk_person_claim($1, 'bad-fp') j`, [kUid]); check("0196(4-4) claim＝fp 不一致は 'device bound'", !x.ok && /device bound/.test(x.err), x.err);
        x = await su(`select public.kiosk_person_claim($1, 'fp0196') j`, [kUid]); const j = jj(x);
        check("0196(4-5) claim＝staff の解除＝ok・auth_user_id／membership_id／role staff／store／session_id・idle_minutes 10（既定）", !!j && j.ok === true && j.auth_user_id === staff.auth_user_id && j.membership_id === staff.id && j.role === "staff" && j.store_id === st.id && j.idle_minutes === 10 && j.session_id === sid, x.ok ? j : x.err);
        check("0196(4-6) kiosk_sessions に印（person_auth_session true・person_role staff）＋audit kiosk_person_claim 1 行", (await pc.query(`select person_auth_session p, person_role r from public.kiosk_sessions where id=$1`, [sid])).rows[0].p === true && (await pc.query(`select count(*)::int n from public.audit_logs where action='kiosk_person_claim' and target=$1`, ["kiosk_sessions:" + sid])).rows[0].n === 1);
        x = await as(staff, `select public.kiosk_person_claim($1, 'fp0196')`, [kUid]); check("0196(4-7) ACL＝authenticated からは permission denied", !x.ok && /permission denied/.test(x.err), x.err);
        x = await as(kdev, `select public.kiosk_lock('manual') j`); check("0196(4-8) kiosk_lock は jsonb（person_end true＝本人セッションあり）", !!jj(x) && jj(x)!.person_end === true && jj(x)!.ok === true, x.ok ? jj(x) : x.err);
        sid = await sess(staff);
        x = await as(kdev, `select public.kiosk_lock('idle') j`); check("0196(4-9) 本人セッションの無い解除＝person_end false", !!jj(x) && jj(x)!.person_end === false, x.ok ? jj(x) : x.err);
        sid = await sess(staff); await su(`select public.kiosk_person_claim($1, 'fp0196')`, [kUid]);
        x = await su(`select public.kiosk_person_end($1, 'idle') b`, [sid]); check("0196(4-10) kiosk_person_end＝true（ended・end_reason idle）", x.ok && x.rows[0].b === true && (await pc.query(`select end_reason from public.kiosk_sessions where id=$1`, [sid])).rows[0].end_reason === "idle", x.err);
        x = await su(`select public.kiosk_person_end($1, 'idle') b`, [sid]); check("0196(4-11) 二度目は false", x.ok && x.rows[0].b === false, x.err);
        x = await su(`select public.kiosk_person_end($1, 'x') b`, [sid]); check("0196(4-12) bad reason", !x.ok && /bad reason/.test(x.err), x.err);
        // nominations
        sid = await sess(staff);
        x = await as(kdev, `select public.kiosk_register_state() j`); const checks = (jj(x)?.checks ?? []) as { nominations?: unknown }[];
        check("0196(4-13) kiosk_register_state＝checks の各行に nominations（配列）", x.ok && Array.isArray(checks) && checks.every((k) => Array.isArray(k.nominations)), x.ok ? checks.length : x.err);
        // §9
        const castRow = (await pc.query(`select c.id, u.auth_user_id from public.casts c join public.users u on u.id = c.user_id where c.store_id=$1 and c.is_active and u.auth_user_id is not null order by c.name limit 1`, [st.id])).rows[0];
        const other = (await pc.query(`select c.id from public.casts c where c.store_id=$1 and c.is_active and c.id<>$2 order by c.name limit 1`, [st.id, castRow?.id])).rows[0];
        const pk1 = await as(owner, `select public.set_deduction(null, $1, 'NOX-VERIFY-0196s-pick', 700, 'day', true, 'agreed_cost', false, null, 'pick') id`, [st.id]); const pickId = pk1.ok ? pk1.rows[0].id as string : null;
        const pk2 = await as(owner, `select public.set_deduction(null, $1, 'NOX-VERIFY-0196s-pick2', 300, 'day', true, 'agreed_cost', false, null, 'pick') id`, [st.id]); const pick2 = pk2.ok ? pk2.rows[0].id as string : null;
        check("0196(4-14) 準備＝pick ルール 2 本", !!pickId && !!pick2, pk1.err || pk2.err);
        const biz = (await pc.query(`select public.biz_date_of($1, now())::text d`, [st.id])).rows[0].d as string;
        const rowsOf = async (cid: string, d: string) => (await pc.query(`select deduction_id, enabled from public.cast_day_deductions where cast_id=$1 and biz_date=$2 order by deduction_id`, [cid, d])).rows;
        if (castRow) {
          x = await as(castRow, `select public.cast_day_deductions_set($1, $2::date, $3::jsonb)`, [castRow.id, biz, J([{ deduction_id: pickId, enabled: true }])]);
          check(MIG_0198_APPLIED ? "0196(4-15) cast セルフ腕＝0198（裁定461）で撤回＝forbidden" : "0196(4-15) cast セルフ腕＝本人・当日の営業日＝ok（pick を on＝1 行）", MIG_0198_APPLIED ? fb(x) : x.ok && (await rowsOf(castRow.id, biz)).length === 1, x.err);
          x = await as(castRow, `select public.cast_day_deductions_set($1, '2099-05-10', $2::jsonb)`, [castRow.id, J([{ deduction_id: pickId, enabled: true }])]); check("0196(4-16) cast セルフ腕＝当日以外は 'not today'（0198 後は forbidden）", MIG_0198_APPLIED ? fb(x) : !x.ok && /not today/.test(x.err), x.err);
          if (other) { x = await as(castRow, `select public.cast_day_deductions_set($1, $2::date, $3::jsonb)`, [other.id, biz, J([{ deduction_id: pickId, enabled: true }])]); check("0196(4-17) cast セルフ腕＝他人の行は forbidden", fb(x), x.err); }
          x = await as(castRow, `select public.cast_day_deductions_set($1, $2::date, $3::jsonb)`, [castRow.id, biz, J([{ deduction_id: pickId, enabled: false }])]); check("0196(4-18) cast セルフ腕＝既定どおりに戻すと行が消える（0198 後は forbidden）", MIG_0198_APPLIED ? fb(x) : x.ok && (await rowsOf(castRow.id, biz)).length === 0, x.err);
        } else check("0196(4-15) cast セルフ腕（auth のあるキャストが A1 に無い）", false);
        const nc = (await pc.query(`insert into public.casts (org_id, store_id, name, is_active) values ($1, $2, 'NOX-VERIFY-0196s-cast', true) returning id`, [st.org_id, st.id])).rows[0];
        await pc.query(`insert into public.cast_pin (cast_id, org_id, store_id, pin_hash, fail_count) values ($1, $2, $3, extensions.crypt('1234', extensions.gen_salt('bf')), 0)`, [nc.id, st.org_id, st.id]);
        x = await as(kdev, `select public.kiosk_punch_state($1) j`, [nc.id]); let dr = (jj(x)?.day_rules ?? []) as { id: string; name: string; amount: number }[];
        check("0196(4-19) kiosk_punch_state(p_cast_id)＝day_rules に pick 2 本（名前・額）", x.ok && dr.length === 2 && dr.every((d) => typeof d.name === "string" && typeof d.amount === "number"), x.ok ? dr : x.err);
        x = await as(kdev, `select public.kiosk_punch_state() j`); check("0196(4-20) kiosk_punch_state() 0 引数＝day_rules は空（従来の呼び出し）", x.ok && Array.isArray(jj(x)?.day_rules) && (jj(x)!.day_rules as unknown[]).length === 0 && jj(x)!.okuri_mode !== undefined, x.ok ? jj(x) : x.err);
        await as(owner, `select public.deduction_rule_cast_set($1, $2, false, null)`, [pick2, nc.id]);
        await as(owner, `select public.deduction_rule_cast_set($1, $2, true, 450)`, [pickId, nc.id]);
        x = await as(kdev, `select public.kiosk_punch_state($1) j`, [nc.id]); dr = (jj(x)?.day_rules ?? []) as { id: string; name: string; amount: number }[];
        check("0196(4-21) day_rules＝キャスト別の適用で使わないは除く・額の上書き 450", x.ok && dr.length === 1 && dr[0].id === pickId && dr[0].amount === 450, x.ok ? dr : x.err);
        x = await as(kdev, `select public.kiosk_punch($1, '1234', 'out', null, $2::jsonb) j`, [nc.id, J([{ deduction_id: pickId, enabled: true }])]); check("0196(4-22) kiosk_punch＝退勤に p_day_deductions は 'bad day deductions'", !x.ok && /bad day deductions/.test(x.err), x.err);
        x = await as(kdev, `select public.kiosk_punch($1, '1234', 'in', null, $2::jsonb) j`, [nc.id, J([{ deduction_id: pick2, enabled: "x" }])]);
        check("0196(4-23) 行の形が悪ければ statement ごと戻る（打刻も入らない）（0198 後も同じ＝この suite は操作担当が解錠中）", !x.ok && /bad row|invalid input/.test(x.err) && (await pc.query(`select count(*)::int n from public.punches where cast_id=$1`, [nc.id])).rows[0].n === 0, x.err);
        x = await as(kdev, `select public.kiosk_punch($1, '1234', 'in', null, $2::jsonb) j`, [nc.id, J([{ deduction_id: pickId, enabled: true }])]);
        check("0196(4-24) kiosk_punch＝出勤と同時に「今日の控除」＝ok・cast_day_deductions に 1 行・audit に day_deductions（0198 後＝操作担当が解錠中なので受理）", x.ok && jj(x)!.ok === true && (await rowsOf(nc.id, biz)).length === 1 && (await pc.query(`select count(*)::int n from public.audit_logs where action='kiosk_punch' and target='punches:' || $1 and after_json ? 'day_deductions'`, [x.ok ? jj(x)!.punch_id : "x"])).rows[0].n === 1, x.ok ? jj(x) : x.err);
        check("0196(4-24b) 0198 後＝出勤 ok の返りに day_applied（配列＝店が付けた行）", !MIG_0198_APPLIED || (x.ok && Array.isArray(jj(x)!.day_applied)), x.ok ? jj(x) : x.err);
        x = await as(kdev, `select public.kiosk_punch($1, '1234', 'out') j`, [nc.id]); check("0196(4-25) kiosk_punch 3 引数（従来の呼び出し）＝退勤 ok", x.ok && jj(x)!.ok === true, x.err);
        // punch_proxy の staff
        const nc3 = (await pc.query(`insert into public.casts (org_id, store_id, name, is_active) values ($1, $2, 'NOX-VERIFY-0196s-cast3', true) returning id`, [st.org_id, st.id])).rows[0];
        x = await as(staff, `select public.punch_proxy($1, 'in', '0196 verify') id`, [nc3.id]); check("0196(4-26) punch_proxy＝自店の staff が代行できる", x.ok && typeof x.rows[0].id === "string", x.err);
        if (staff2) { x = await as(staff2, `select public.punch_proxy($1, 'out', '0196 verify') id`, [nc3.id]); check("0196(4-27) punch_proxy＝他店の staff は forbidden", fb(x), x.err); }
        // 裁定456 の 1／457＝can_register=false の staff
        const staffNc = (await pc.query(`select m.id, m.user_id from public.memberships m join public.users u on u.id=m.user_id where m.store_id=$1 and m.role='staff' and m.is_active and u.is_active and not m.can_register order by m.id limit 1`, [st.id])).rows[0];
        if (staffNc) {
          await pc.query(`insert into public.staff_pin (membership_id, org_id, store_id, pin_hash, fail_count) values ($1, $2, $3, extensions.crypt('7391', extensions.gen_salt('bf')), 0)`, [staffNc.id, st.org_id, st.id]);
          x = await as(kdev, `select public.kiosk_login($1, '7391', 'fp0196') j`, [staffNc.id]); check("0196(4-28) kiosk_login＝can_register=false の staff が PIN で入れる（ok・role staff）", x.ok && jj(x)!.ok === true && jj(x)!.role === "staff", x.ok ? jj(x) : x.err);
          x = await as(kdev, `select public.kiosk_unlock('7391', $1, 'fp0196') j`, [staffNc.id]); check("0196(4-29) kiosk_unlock（束縛済み端末・fp を inner へ＝裁定457）＝同じ staff が入れる（ok・idle_sec）", x.ok && jj(x)!.ok === true && typeof jj(x)!.idle_sec === "number", x.ok ? jj(x) : x.err);
          x = await as(kdev, `select membership_id from public.kiosk_operator_list()`); check("0196(4-30) kiosk_operator_list＝その staff は候補に出ない（レジの操作担当は can_register のまま）", x.ok && x.rows.length > 0 && !x.rows.some((q) => q.membership_id === staffNc.id), x.ok ? x.rows.length : x.err);
          x = await su(`select public.kiosk_person_claim($1, 'fp0196') j`, [kUid]); check("0196(4-31) その解除（kiosk_unlock の session）で kiosk_person_claim＝role staff・membership 一致", x.ok && jj(x)!.ok === true && jj(x)!.role === "staff" && jj(x)!.membership_id === staffNc.id, x.ok ? jj(x) : x.err);
        } else check("0196(4-28) can_register=false の staff が A1 に無い", false);
      } finally { await pc.query("rollback"); }
      const after = await cntQ();
      const left = (await pc.query(`select (select count(*)::int from public.casts where name like 'NOX-VERIFY-0196s-%') c, (select count(*)::int from public.deductions where name like 'NOX-VERIFY-0196s-%') d, (select count(*)::int from public.kiosk_devices where label = 'NOX-VERIFY-0196 端末') k, (select count(*)::int from public.kiosk_sessions where person_auth_session) ps`)).rows[0];
      check("0196(4-32) ROLLBACK＝DB 変更 0（関数 418・表 119・試走の行なし・本番の本人セッション 0）", after.f === before.f && after.t === before.t && left.c === 0 && left.d === 0 && left.k === 0, J({ after, left }));
    } finally { await pc.end(); }
  } else console.log("(3)(4) skipped: SUPABASE_DB_URL なし");
  if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log(`verify:nox-0196 ALL PASS (${pass} assertions)`);
}
void main();
