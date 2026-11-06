/*
 * verify:nox-0197 — 0197（2026-11-06 Agoora 手貼り・verify 17 行一致・関数 419・表 120・sha16 f28f737489916c38）のフラグ true 便＝裁定455（打刻の 3 択目 punch_mode）
 *   ＝set_store_profile の白名単 +3（punch_mode／register_window_before_min／register_window_after_min）・on_duty_of の punch_mode='store' の分岐（確定シフトの前後の窓・今日だけ許可）
 *   ・register_day_grants（表・RLS・SELECT だけ）＋register_day_grant_set（店長以上・自店・その営業日か翌営業日）＋裁定456 の 17（/mine の勤怠一覧は確定シフトの日）・18（受給者判定は確定シフトのある日）。
 *  (1) フラグ／(2) 純関数＝punchModeOf・inRegisterWindowOf の窓 4 通り・registerWindowErrorOf・storeModeAttendedDatesOf・monthAttendanceRowsStoreOf／(3) client の pin／
 *  (4) live（読取）＝関数 419・表 120・register_day_grants の RLS／grants／unique・ACL／(5) live（BEGIN…ROLLBACK＝DB 変更 0）＝try_0197.mjs の 19 段の写し（on_duty_of の窓 4 通りを含む）。
 *  使い方: npm run verify:nox-0197（(4)(5) は .env.local の SUPABASE_DB_URL・NOX-VERIFY-A1／A2）
 */
import fs from "node:fs";
import pg from "pg";
import { MIG_0197_APPLIED, mig0197On, __set0197ForTest } from "../lib/nox/rules-0175/flag";
import { REGISTER_WINDOW_DEFAULT, inRegisterWindowOf, punchModeOf, registerWindowErrorOf, registerWindowOf, storeModeAttendedDatesOf } from "../lib/nox/shift/punch-mode";
import { ATTENDANCE_MONTH_NOTE_STORE, monthAttendanceRowsStoreOf } from "../lib/nox/mine/attendance-month";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;

// (1)
check("0197(1-1) MIG_0197_APPLIED=true（2026-11-06 手貼り・verify 17 行一致）・override", (MIG_0197_APPLIED as boolean) === true && mig0197On() === true && (__set0197ForTest(false), !mig0197On()) && (__set0197ForTest(null), mig0197On()));

// (2) 純関数
check("0197(2-1) punchModeOf＝'store'／それ以外は 'punch'・registerWindowOf＝既定 30／60・白名単の値は 0〜240", punchModeOf({ punch_mode: "store" }) === "store" && punchModeOf({}) === "punch" && punchModeOf({ punch_mode: "x" }) === "punch"
  && J(registerWindowOf({})) === J(REGISTER_WINDOW_DEFAULT) && J(registerWindowOf({ register_window_before_min: 10, register_window_after_min: 120 })) === J({ before: 10, after: 120 })
  && registerWindowErrorOf(0) === null && registerWindowErrorOf(240) === null && registerWindowErrorOf(241) !== null && registerWindowErrorOf(-1) !== null && registerWindowErrorOf(1.5) !== null);
const shift = { start_hm: "20:00", end_hm: "25:00" }, win = { before: 30, after: 60 };
check("0197(2-2) 窓 4 通り＝開始 −30 分の中（19:30）true・開始 −31 分（19:29）false・終了 +60 分の中（26:00）true・終了 +61 分（26:01）false・シフト無しは false",
  inRegisterWindowOf(shift, win, 19 * 60 + 30) === true && inRegisterWindowOf(shift, win, 19 * 60 + 29) === false && inRegisterWindowOf(shift, win, 26 * 60) === true && inRegisterWindowOf(shift, win, 26 * 60 + 1) === false && inRegisterWindowOf(null, win, 21 * 60) === false);
const shifts = [{ date: "2026-11-01", start_hm: "20:00", end_hm: "25:00" }, { date: "2026-11-02", start_hm: "20:00", end_hm: "24:00" }, { date: "2026-11-03", start_hm: "20:00", end_hm: "25:00" }, { date: "2026-11-09", start_hm: "20:00", end_hm: "25:00" }];
const attBy = new Map([["2026-11-02", "absent"], ["2026-11-03", "late"]]);
check("0197(2-3) storeModeAttendedDatesOf（裁定456 の 18）＝確定シフトの日（今日まで）で 当欠／休み でない日＝11/1・11/3（11/2 当欠は除く・11/9 未来日は数えない・遅刻は出勤）", J(storeModeAttendedDatesOf(shifts, attBy, "2026-11-06")) === J(["2026-11-01", "2026-11-03"])
  && J(storeModeAttendedDatesOf(shifts, new Map([["2026-11-01", "off"]]), "2026-11-06")) === J(["2026-11-02", "2026-11-03"]));
const rows = monthAttendanceRowsStoreOf({ shifts, attendance: [{ date: "2026-11-02", status: "absent" }, { date: "2026-11-03", status: "late" }], punchRows: [{ bizDate: "2026-11-03", inHm: "20:10", outHm: "25:30", hours: 5.3 }], todayBiz: "2026-11-06" });
check("0197(2-4) monthAttendanceRowsStoreOf（裁定456 の 17）＝確定シフトの日（新しい日が先・未来日なし）・11/1 出 20:00 退 25:00 実働 5・11/2 当欠＝出退 — 0h「当欠」・11/3 打刻があればその出退と実働（遅刻を添える）",
  rows.map((r) => r.bizDate).join() === "2026-11-03,2026-11-02,2026-11-01" && rows[2].inHm === "20:00" && rows[2].outHm === "25:00" && rows[2].hours === 5 && !rows[2].statusJa
  && rows[1].inHm === null && rows[1].outHm === null && rows[1].hours === 0 && rows[1].statusJa === "当欠" && rows[0].inHm === "20:10" && rows[0].hours === 5.3 && rows[0].statusJa === "遅刻" && ATTENDANCE_MONTH_NOTE_STORE.includes("確定シフトの日"), J(rows));

// (3) client の pin
const mine = src("app/mine/page.tsx"), col = src("lib/nox/payroll/collect.ts"), sp = src("app/(manage)/master/store-profile-panel.tsx"), sw = src("app/(manage)/setup/setup-wizard.tsx"), v5 = src("lib/nox/setup/v5.ts");
check("0197(3-1) /mine＝punch_mode='store' の店は monthAttendanceRowsStoreOf（確定シフトの日・att・打刻の行・今日まで）・空は「確定シフトなし」・注記は STORE 版・状態は data-mine-att-status",
  mine.includes("const mineStoreMode = storeDecidesPunchOf((myStore?.settings_json ?? {}) as Record<string, unknown>);") && mine.includes("? monthAttendanceRowsStoreOf({ shifts: monthConfirmedShifts.map(") && mine.includes('{mineStoreMode ? "確定シフトなし" : "打刻なし"}') && mine.includes("{mineStoreMode ? ATTENDANCE_MONTH_NOTE_STORE : ATTENDANCE_MONTH_NOTE}") && mine.includes("data-mine-att-status={r.statusJa}"));
check("0197(3-2) collect＝punch_mode='store' の店は storeModeAttendedDatesOf で日数と受給者（recipientsByDate）を決める（重複させない）", col.includes("const attended = storeModeAttendedDatesOf(upTo, attBy, todayBiz);") && col.includes("days = attended.length;") && col.includes("for (const d of attended) { const list = recipientsByDate.get(d) ?? recipientsByDate.set(d, []).get(d)!; if (!list.includes(cid)) list.push(cid); }"));
check("0197(3-3) 初期設定 ⑦ と店舗設定＝mig0197On() で 3 択（PUNCH_CHOICE_OPTIONS）・v5 は punch_mode を patch・写像表に 1 行（has: mig0197On()）", sw.includes("options={mig0197On() ? PU") && sp.includes('data-punch-choice={form.punch_mode === "store" ? "store" : form.ops.punch_methods.self ? "any" : "device"}') && v5.includes("if (mig0197On()) patch.punch_mode =") && v5.includes('dest: "settings_json punch_mode（0197）", has: mig0197On()'));
check("0197(3-4) 収蔵＝supabase/migrations/0197_punch_mode.sql（begin の直後に lock_timeout・register_day_grants・on_duty_of の store 分岐）", src("supabase/migrations/0197_punch_mode.sql").includes("begin;\nset local lock_timeout = '10s';") && src("supabase/migrations/0197_punch_mode.sql").includes("create table if not exists public.register_day_grants") && src("supabase/migrations/0197_punch_mode.sql").includes("CREATE OR REPLACE FUNCTION public.on_duty_of("));

// (4)(5) live
async function main(): Promise<void> {
  let dbUrl = process.env.SUPABASE_DB_URL; if (!dbUrl) { try { process.loadEnvFile(".env.local"); } catch { /* no env */ } dbUrl = process.env.SUPABASE_DB_URL; }
  if (dbUrl) {
    const pc = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await pc.connect();
    try {
      const cntQ = async () => (await pc.query(`select (select count(*)::int from pg_proc where pronamespace='public'::regnamespace) f, (select count(*)::int from pg_tables where schemaname='public') t`)).rows[0] as { f: number; t: number };
      const before = await cntQ();
      const r = (await pc.query(`select
        (select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname='register_day_grant_set') n1,
        (select rowsecurity from pg_tables where schemaname='public' and tablename='register_day_grants') rls,
        (select count(*)::int from pg_policies where schemaname='public' and tablename='register_day_grants') pol,
        (select string_agg(distinct grantee || '=' || privilege_type, ',') from information_schema.role_table_grants where table_schema='public' and table_name='register_day_grants' and grantee in ('anon','authenticated')) tg,
        (select count(*)::int from pg_indexes where schemaname='public' and tablename='register_day_grants' and indexdef like '%UNIQUE%' and indexdef like '%store_id%' and indexdef like '%subject_id%' and indexdef like '%biz_date%') uq,
        (select string_agg(has_function_privilege('authenticated', p.oid, 'execute')::text || '/' || has_function_privilege('anon', p.oid, 'execute')::text, ',' order by p.proname) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('set_store_profile','on_duty_of','register_day_grant_set')) acl3,
        (select prosrc like '%punch_mode%' and prosrc like '%register_window_before_min%' from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile') spw,
        (select prosrc like '%''store''%' from pg_proc where pronamespace='public'::regnamespace and proname='on_duty_of') odb,
        (select prosrc like '%billing locked%' from pg_proc where pronamespace='public'::regnamespace and proname='register_day_grant_set') gated,
        (select count(*)::int from public.stores where settings_json->>'punch_mode'='store') pm`)).rows[0];
      check("0197(4-1) live＝関数 419・表 120・register_day_grant_set 1 本・register_day_grants は RLS 有効・policy 1・authenticated=SELECT だけ・anon なし・unique（store,kind,subject,date）", before.f === 419 && before.t === 120 && r.n1 === 1 && r.rls === true && r.pol === 1 && r.tg === "authenticated=SELECT" && r.uq === 1, J({ before, r }));
      // ★0197 フラグ便の読取（2026-11-06）: on_duty_of は 0190 で内部専用（4 ロール revoke・client は呼ばない・assert_on_duty から呼ぶ）。0197 の起草が ACL ヘルパーで authenticated に grant してしまった＝追補（revoke）の手貼りまでこの行は赤＝verify:nox-0190 の「内部 3 本」と同じ指摘。
      check("0197(4-2) ACL＝set_store_profile／register_day_grant_set は authenticated 可・on_duty_of は内部専用（authenticated 不可＝0190 のまま）・anon は 3 本とも不可・白名単 3 キー・'store' の分岐・register_day_grant_set はゲート内蔵（A18）", r.acl3 === "false/false,true/false,true/false" /* proname 順＝on_duty_of（内部）・register_day_grant_set・set_store_profile */ && r.spw === true && r.odb === true && r.gated === true, J(r));
      // (5) BEGIN…ROLLBACK（try_0197.mjs の写し）
      await pc.query("begin");
      try {
        const st = (await pc.query(`select s.id, s.org_id from public.stores s where s.name='NOX-VERIFY-A1'`)).rows[0];
        const st2 = (await pc.query(`select s.id, s.org_id from public.stores s where s.name='NOX-VERIFY-A2'`)).rows[0];
        const mem = async (role: string, store = st.id) => (await pc.query(`select m.id, m.user_id, u.auth_user_id from public.memberships m join public.users u on u.id=m.user_id where m.store_id=$1 and m.role=$2 and m.is_active order by m.id limit 1`, [store, role])).rows[0];
        const owner = await mem("owner"), manager = await mem("manager"), staff = await mem("staff"), manager2 = st2 ? await mem("manager", st2.id) : null;
        type R = { ok: boolean; rows: Record<string, unknown>[]; err: string };
        const as = async (who: { auth_user_id: string }, sql: string, params: unknown[] = []): Promise<R> => {
          await pc.query("savepoint a");
          try {
            await pc.query("set local role authenticated");
            await pc.query(`select set_config('request.jwt.claims', $1, true)`, [J({ sub: who.auth_user_id, role: "authenticated" })]);
            const q = await pc.query(sql, params); await pc.query("reset role"); await pc.query("release savepoint a"); return { ok: true, rows: q.rows, err: "" };
          } catch (e) { await pc.query("rollback to savepoint a"); await pc.query("reset role"); return { ok: false, rows: [], err: (e as Error).message }; }
        };
        const fb = (x: R) => !x.ok && /forbidden/.test(x.err);
        let x = await as(owner, `select public.set_store_profile($1, '{"punch_mode":"store","register_window_before_min":30,"register_window_after_min":60}'::jsonb)`, [st.id]);
        check("0197(5-1) set_store_profile＝owner が punch_mode 'store'＋窓 30／60 を保存", x.ok && (await pc.query(`select settings_json->>'punch_mode' m from public.stores where id=$1`, [st.id])).rows[0].m === "store", x.err);
        x = await as(owner, `select public.set_store_profile($1, '{"punch_mode":"never"}'::jsonb)`, [st.id]); check("0197(5-2) 語彙外は bad punch_mode", !x.ok && /bad punch_mode/.test(x.err), x.err);
        x = await as(owner, `select public.set_store_profile($1, '{"register_window_after_min":300}'::jsonb)`, [st.id]); check("0197(5-3) 窓 241 以上は bad register_window_after_min", !x.ok && /bad register_window_after_min/.test(x.err), x.err);
        x = await as(manager, `select public.set_store_profile($1, '{"punch_mode":"punch"}'::jsonb)`, [st.id]); check("0197(5-4) manager は forbidden（owner 限定）", fb(x), x.err);
        const nc = (await pc.query(`insert into public.casts (org_id, store_id, name, is_active) values ($1, $2, 'NOX-VERIFY-0197s-cast', true) returning id`, [st.org_id, st.id])).rows[0];
        const biz = (await pc.query(`select public.biz_date_of($1, now())::text d, floor(extract(epoch from (now() - (public.biz_date_of($1, now())::timestamp at time zone 'Asia/Tokyo'))) / 60)::int m`, [st.id])).rows[0] as { d: string; m: number };
        const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        const mNow = Number(biz.m);
        const sh = (s: number, e: number) => pc.query(`insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, created_by) values ($1, $2, $3, $4, $5, $6, 'confirmed', $7)`, [st.org_id, st.id, nc.id, biz.d, hm(Math.max(0, Math.min(47 * 60 + 59, s))), hm(Math.max(1, Math.min(47 * 60 + 59, e))), owner.user_id]);
        const clear = () => pc.query(`delete from public.shifts where cast_id=$1`, [nc.id]);
        const duty = async () => (await pc.query(`select public.on_duty_of('cast', $1, $2, $3::date) b`, [nc.id, st.id, biz.d])).rows[0].b as boolean;
        check("0197(5-5) on_duty_of＝確定シフトなし・打刻なし＝false", (await duty()) === false);
        await sh(mNow - 120, mNow - 90); check("0197(5-6) 窓①＝終了 +60 分を過ぎた確定シフト（終了 90 分前）＝false", (await duty()) === false); await clear();
        await sh(mNow - 300, mNow - 30); check("0197(5-7) 窓②＝終了 +60 分の中（終了 30 分前）＝true", mNow >= 300 ? (await duty()) === true : true); await clear();
        await sh(mNow + 20, mNow + 300); check("0197(5-8) 窓③＝開始 −30 分の中（開始 20 分前）＝true（打刻が無くてもレジを開けられる）", (await duty()) === true);
        await pc.query(`update public.stores set settings_json = settings_json || '{"register_window_before_min":10}'::jsonb where id=$1`, [st.id]);
        check("0197(5-9) 窓④＝窓を 10 分に縮めると開始 20 分前は false", (await duty()) === false);
        x = await as(manager, `select public.register_day_grant_set('cast', $1, $2::date, true, 'verify')`, [nc.id, biz.d]);
        check("0197(5-10) 店長＝今日だけ許可を付与 → on_duty_of true・audit register_day_grant", x.ok && (await duty()) === true && (await pc.query(`select count(*)::int n from public.audit_logs where action='register_day_grant' and target like $1`, ["cast:" + nc.id + "%"])).rows[0].n === 1, x.err);
        x = await as(manager, `select public.register_day_grant_set('cast', $1, $2::date, false, null)`, [nc.id, biz.d]); check("0197(5-11) 取消＝行が消えて false に戻る", x.ok && (await duty()) === false && (await pc.query(`select count(*)::int n from public.register_day_grants where subject_id=$1`, [nc.id])).rows[0].n === 0, x.err);
        x = await as(manager, `select public.register_day_grant_set('cast', $1, ($2::date + 1), true, null)`, [nc.id, biz.d]); check("0197(5-12) 翌営業日は付与できる", x.ok, x.err);
        x = await as(manager, `select public.register_day_grant_set('cast', $1, ($2::date + 2), true, null)`, [nc.id, biz.d]); check("0197(5-13) 2 日後は 'bad date'", !x.ok && /bad date/.test(x.err), x.err);
        x = await as(manager, `select public.register_day_grant_set('cast', $1, ($2::date - 1), true, null)`, [nc.id, biz.d]); check("0197(5-14) 昨日は 'bad date'", !x.ok && /bad date/.test(x.err), x.err);
        x = await as(staff, `select public.register_day_grant_set('cast', $1, $2::date, true, null)`, [nc.id, biz.d]); check("0197(5-15) スタッフは forbidden", fb(x), x.err);
        if (manager2) { x = await as(manager2, `select public.register_day_grant_set('cast', $1, $2::date, true, null)`, [nc.id, biz.d]); check("0197(5-16) 他店の店長は forbidden", fb(x), x.err); }
        x = await as(manager, `select public.register_day_grant_set('staff', $1, $2::date, true, null)`, [staff.id, biz.d]); check("0197(5-17) staff（membership）にも付与できる → on_duty_of('staff') true", x.ok && (await pc.query(`select public.on_duty_of('staff', $1, $2, $3::date) b`, [staff.id, st.id, biz.d])).rows[0].b === true, x.err);
        x = await as(manager, `select public.register_day_grant_set('staff', $1, $2::date, true, null)`, [owner.id, biz.d]); check("0197(5-18) owner の membership は対象外（forbidden）", fb(x), x.err);
        x = await as(staff, `select count(*)::int n from public.register_day_grants where store_id=$1`, [st.id]); check("0197(5-19) RLS＝自店の staff は読める", x.ok && Number(x.rows[0].n) >= 1, x.err);
        if (manager2) { x = await as(manager2, `select count(*)::int n from public.register_day_grants where store_id=$1`, [st.id]); check("0197(5-20) RLS＝他店は 0 行", x.ok && Number(x.rows[0].n) === 0, x.err); }
        await pc.query(`update public.stores set settings_json = settings_json || '{"punch_mode":"punch"}'::jsonb where id=$1`, [st.id]);
        await pc.query(`delete from public.register_day_grants where subject_id=$1`, [nc.id]);
        check("0197(5-21) punch_mode 'punch'＝確定シフトの窓の中でも打刻が無ければ false（従来）", (await duty()) === false);
        await pc.query(`insert into public.punches (org_id, store_id, cast_id, type, source) values ($1, $2, $3, 'in', 'manager')`, [st.org_id, st.id, nc.id]);
        check("0197(5-22) punch_mode 'punch'＝最後の打刻が in なら true（従来）", (await duty()) === true);
      } finally { await pc.query("rollback"); }
      const after = await cntQ();
      const left = (await pc.query(`select (select count(*)::int from public.casts where name like 'NOX-VERIFY-0197s-%') c, (select count(*)::int from public.register_day_grants) g, (select count(*)::int from public.stores where settings_json->>'punch_mode'='store') pm`)).rows[0];
      check("0197(5-23) ROLLBACK＝DB 変更 0（関数 419・表 120・試走の行なし・punch_mode='store' の店は本番に 0）", after.f === before.f && after.t === before.t && left.c === 0 && left.pm === 0, J({ after, left }));
    } finally { await pc.end(); }
  } else console.log("(4)(5) skipped: SUPABASE_DB_URL なし");
  if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log(`verify:nox-0197 ALL PASS (${pass} assertions)`);
}
void main();
