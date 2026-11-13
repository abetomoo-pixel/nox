/**
 * verify:nox-0200 — 0200（2026-11-10 Agoora 手貼り・検証 32 行一致＝相談役の再確認で can_register／level の行をコメントを除いた本文で yes/yes・関数 422→427／表 120→121・sha16 caa775c91eaa0e24）
 *   裁定470（お知らせの個別選択）・471（スタッフ給与の支払い済み）・472（スマホのレジは出勤中だけ）・473（キャストのレジ設定を 1 か所に・店端末のみ・会計できる卓）＋本人セッションの heartbeat（kiosk_person_touch）
 *  (1) フラグ＝MIG_0200_APPLIED=true・override
 *  (2) 収蔵＝supabase/migrations/0200_notice_targets_staff_pay.sql（sha16・3007 行・commit; 1 回・lock_timeout）＋client の結線（heartbeat・入場判定・お知らせの宛先・支払い済み）
 *  (3) live（読取）＝docs/tmp/0200_verify.sql の 32 行が期待値どおり（教訓137＝not like はコメントを除いた本文）
 *  (4) live（BEGIN…ROLLBACK＝DB 変更 0）＝try_0200.mjs の段を写す（★1〜★4 お知らせ・★5〜★7 支払い済み・★9〜★17 出勤中／店端末のみ／本人セッション／heartbeat／会計できる卓）
 */
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { MIG_0200_APPLIED, mig0200On, __set0200ForTest } from "../lib/nox/rules-0175/flag";
import { loadEnvOrExit } from "./fixtures-f0";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type R = { ok: true; rows: Row[] } | { ok: false; err: string };
const errOf = (x: R) => (x.ok ? "ok" : x.err);
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = (x: unknown) => JSON.stringify(x);
const FN = 449 /* ★0201d（2026-11-13 夜 手貼り）: 447→449 */ /* ★0201i（2026-11-13 夕 手貼り）: 442→447 */ /* ★0201g（作り直し 4・手貼りの後）: 440→442 */, TB = 122 /* ★0201i: 121→122 */; // ★0201c／h／e（2026-11-12 手貼り・+9＝0201c 3・0201e 6）: 431→440 // ★0201（2026-11-11 手貼り・+4＝punch_self_impl／set_store_manager_punch／staff_pin_self_set／cast_pin_self_set）: 427→431   // 0200 の後（0201 の手貼りで張り替える）

// (1)
check("0200(1-1) MIG_0200_APPLIED=true（2026-11-10 手貼り・verify 32 行一致）・override", (MIG_0200_APPLIED as boolean) === true && mig0200On() === true);
__set0200ForTest(false); check("0200(1-2) __set0200ForTest(false) で mig0200On() は false", mig0200On() === false); __set0200ForTest(null);
check("0200(1-3) gen-demo の鏡（scripts/demo/rules-0175-flag.mjs）も true", /export const MIG_0200_APPLIED = true;/.test(src("scripts/demo/rules-0175-flag.mjs")));
// (2)
{
  const mig = fs.readFileSync("supabase/migrations/0200_notice_targets_staff_pay.sql");
  const sha16 = createHash("sha256").update(mig).digest("hex").slice(0, 16);
  const L = mig.toString("utf8").split("\n");
  const b = L.indexOf("begin;"), e = L.indexOf("commit;");
  check("0200(2-1) 収蔵＝sha16 caa775c91eaa0e24・3007 行・begin; と commit; が行頭に 1 回ずつ・begin の直後に lock_timeout（教訓128／132）",
    sha16 === "caa775c91eaa0e24" && L.length === 3008 && b >= 0 && e > b && L.filter((l) => l === "commit;").length === 1 && L[b + 1] === "set local lock_timeout = '10s';", { sha16, lines: L.length, b, e });
  const g = src("components/nox/kiosk-person-guard.tsx"), rt = src("app/api/kiosk/person-touch/route.ts");
  check("0200(2-2) heartbeat の結線＝PIN の本人セッション ∧ mig0200On で 1 分ごとに /api/kiosk/person-touch（端末の fp を添える）・route は本人の auth＋cookie の session＋fp を service_role の kiosk_person_touch へ",
    g.includes("isPin && mig0200On()") && g.includes('fetch("/api/kiosk/person-touch"') && g.includes("browserDeviceFp()") && rt.includes("supabase.auth.getUser()") && rt.includes('createAdminClient().rpc("kiosk_person_touch"') && rt.includes("p_device_fp: fp"));
  const ce = src("lib/nox/register/cast-entry-server.ts"), lay = src("app/(manage)/layout.tsx");
  check("0200(2-3) 入場とナビの判定＝フラグ true は auth_register_access の 1 本（cast-entry-server・(manage)/layout の staff）", ce.includes('supabase.rpc("auth_register_access")') && lay.includes("auth_register_access"));
  const nb = src("app/(manage)/notices/notices-board.tsx"), sw = src("app/(manage)/staff/staff-work-panel.tsx");
  check("0200(2-4) お知らせの宛先（notice_create_targets）・支払い済み（staff_labor_mark_paid）の client", nb.includes("notice_create_targets") && sw.includes("staff_labor_mark_paid"));
}

(async () => {
  const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
  const pc = new pg.Client({ connectionString: env.SUPABASE_DB_URL as string, ssl: { rejectUnauthorized: false } });
  await pc.connect();
  try {
    // (3) 32 行（期待値＝見出しの「expect」の最初の語・t/SELECT は true/SELECT・支払いの件数はデモの reset で増える＝整数）
    const rows = (await pc.query(src("docs/tmp/0200_verify.sql"))).rows as { k: string; v: string }[];
    const bad: string[] = [];
    for (const r of rows) {
      if (r.k === "nox-project-proof") continue;
      if (r.k.startsWith("fn count")) { if (r.v !== String(FN)) bad.push(`${r.k}=${r.v}`); continue; } // ★0201（2026-11-11 手貼り）: 関数は 427→431（0200 の検証 SQL の期待は 0200 の時点の 427）
      if (r.k.startsWith("set_store_profile whitelist has cast_register_scope")) { const w = (await pc.query("select position('''cast_register_scope''' in prosrc) > 0 ok from pg_proc where proname='set_store_profile'")).rows[0]?.ok; if (!w) bad.push(`${r.k}=no-key`); continue; } // ★0201c（2026-11-12 手貼り）: set_store_profile の白名単に体入の 2 キーが続く＝「cast_register_scope で終わる」の形でなくなった＝キーがあることだけを見る
      if (r.k.startsWith("table count")) { if (r.v !== String(TB)) bad.push(`${r.k}=${r.v}`); continue; } // ★0201i（2026-11-13 夕）: 表は 121→122（0200 の検証 SQL の期待は 0200 の時点の 121）
      if (r.k.startsWith("no payments yet")) { if (!/^\d+$/.test(r.v)) bad.push(`${r.k}=${r.v}`); continue; }
      const m = /\(expect ([^ )]+)/.exec(r.k); const exp = m ? (m[1] === "t/SELECT" ? "true/SELECT" : m[1]) : null;
      if (exp === null || exp !== r.v) bad.push(`${r.k}=${r.v}`);
    }
    check("0200(3-1) 検証 31 行（貼り先証明＋30・案内の「32 行」は数え違い）＝期待値どおり（Agoora の返り 2026-11-10＋相談役の再確認と同値・教訓137＝not like はコメントを除いた本文）", rows.length === 31 && bad.length === 0, { n: rows.length, bad });
    const sj = src("docs/tmp/0200_verify.sql");
    check("0200(3-2) 教訓137＝prosrc の not like はすべて regexp_replace(prosrc, '--[^\\n]*', '', 'g') を通す", !/[^)]\bprosrc not like/.test(sj) && (sj.match(/regexp_replace\(prosrc, '--\[\^\\n\]\*', '', 'g'\) not like/g) ?? []).length === 4);
    // (3b) 0200b（2026-11-10 Agoora 手貼り・事前確認 10／72・検証 7 行一致）＝demo_org_reset の c_load を 84 表に戻す（教訓138＝0200 が行の途中にコメントを入れて 12 表を消した）
    {
      const mb = fs.readFileSync("supabase/migrations/0200b_demo_reset_load_fix.sql");
      const sha = createHash("sha256").update(mb).digest("hex").slice(0, 16);
      const Lb = mb.toString("utf8").split("\n");
      check("0200(3b-1) 0200b 収蔵＝sha16 961bd94c784f1d81・143 行・begin;／commit; 1 回ずつ・lock_timeout", sha === "961bd94c784f1d81" && Lb.length === 144 && Lb.filter((l) => l === "begin;").length === 1 && Lb.filter((l) => l === "commit;").length === 1 && Lb[Lb.indexOf("begin;") + 1] === "set local lock_timeout = '10s';", { sha, n: Lb.length });
      const rb = (await pc.query(src("docs/tmp/0200b_verify.sql"))).rows as { k: string; v: string }[];
      const expB = [String(FN) /* ★0201: 427→431 */, "122" /* ★0201i */, "85" /* ★0201i */, "92" /* ★0201i */, "yes", "0/0/1"];
      check("0200(3b-2) 0200b の検証 7 行＝期待どおり（貼り先証明＋427／121／84／91／yes／0/0/1）", rb.length === 7 && rb.slice(1).every((r, i) => r.v === expB[i]), rb.map((r) => r.v));
      const md = (await pc.query(`select left(md5(replace(prosrc, chr(13), '')), 8) m, prosrc from pg_proc where pronamespace='public'::regnamespace and proname='demo_org_reset'`)).rows[0] as { m: string; prosrc: string };
      const strip = md.prosrc.replace(/--[^\n]*/g, "");
      const loadN = ((strip.match(/c_load constant text\[\] := array\[([\s\S]*?)\];/)?.[1] ?? "").match(/'[a-z_]+'/g) ?? []).length;
      const pl = new Set<string>();
      for (const f of fs.readdirSync("docs/demo/payload").filter((x) => x.endsWith(".json") && !x.startsWith("_"))) for (const k of Object.keys((JSON.parse(src(`docs/demo/payload/${f}`)) as { tables: Record<string, unknown> }).tables)) pl.add(k);
      const loadSet = new Set(((strip.match(/c_load constant text\[\] := array\[([\s\S]*?)\];/)?.[1] ?? "").match(/'[a-z_]+'/g) ?? []).map((x) => x.slice(1, -1)));
      check("0200(3b-3) live の demo_org_reset＝md5 f3a12f49・コメントを除いた c_load 84・デモの payload の表がすべて c_load にある（'bad table' にならない）", md.m === "9e417f94" /* ★0201i（2026-11-13 夕）: f3a12f49→9e417f94 */ && loadN === 85 /* ★0201i: 84→85 */ && [...pl].every((t) => loadSet.has(t)), { m: md.m, loadN, missing: [...pl].filter((t) => !loadSet.has(t)) });
    }
    // (4) BEGIN…ROLLBACK
    const cnt = async () => (await pc.query(`select (select count(*)::int from pg_proc where pronamespace='public'::regnamespace) f, (select count(*)::int from pg_tables where schemaname='public') t`)).rows[0] as { f: number; t: number };
    const before = await cnt();
    check("0200(4-0) 関数 427・表 121（0200 の後）", before.f === FN && before.t === TB, before);
    await pc.query("begin");
    try {
      const st = (await pc.query(`select s.id, s.org_id from public.stores s where s.name='NOX-VERIFY-A1'`)).rows[0] as { id: string; org_id: string };
      const mem = async (role: string) => (await pc.query(`select m.id, m.user_id, u.auth_user_id from public.memberships m join public.users u on u.id=m.user_id where m.store_id=$1 and m.role=$2 and m.is_active and u.auth_user_id is not null order by m.id limit 1`, [st.id, role])).rows[0] as Row;
      const owner = await mem("owner"), manager = await mem("manager"), staff = await mem("staff");
      const as = async (who: Row, sql: string, params: unknown[] = []): Promise<R> => {
        await pc.query("savepoint a");
        try {
          await pc.query("set local role authenticated");
          await pc.query(`select set_config('request.jwt.claims', $1, true)`, [J({ sub: who.auth_user_id, role: "authenticated" })]);
          const r = await pc.query(sql, params); await pc.query("reset role"); await pc.query("release savepoint a"); return { ok: true, rows: r.rows };
        } catch (err) { await pc.query("rollback to savepoint a"); await pc.query("reset role"); return { ok: false, err: (err as Error).message }; }
      };
      const e = (x: R, re: RegExp) => !x.ok && re.test(x.err);
      // ── ★1〜★4 お知らせ ──
      const casts = (await pc.query(`select c.id, u.auth_user_id from public.casts c join public.users u on u.id=c.user_id where c.store_id=$1 and c.is_active and u.auth_user_id is not null order by c.name limit 2`, [st.id])).rows as Row[];
      const castA = casts[0], castB = casts[1];
      const staff2 = (await pc.query(`select m.id, u.auth_user_id from public.memberships m join public.users u on u.id=m.user_id where m.store_id=$1 and m.role='staff' and m.is_active and u.auth_user_id is not null order by m.id limit 2`, [st.id])).rows as Row[];
      const staffA = staff2[0], staffB = staff2[1];
      check("0200(4-1) fixture＝cast 2・staff 1 以上（A1）", !!castA && !!castB && !!staffA && !!owner && !!manager && !!staff, { casts: casts.length, staff: staff2.length });
      let r = await as(manager, `select public.notice_create_targets('NOX-VERIFY-0200 個別', '本文', $1::uuid[], $2::uuid[], true, null) id`, [[castA.id], [staffA.id]]);
      const nid = r.ok ? (r.rows[0].id as string) : null;
      check("0200(4-2) ★2 個別＝cast 1＋staff 1・audience targets", !!nid && (await pc.query(`select audience from public.notices where id=$1`, [nid])).rows[0].audience === "targets", errOf(r));
      r = await as(manager, `select public.notice_create_targets('x', 'y', null, null, false, null)`); check("0200(4-3) ★2 宛先 0 人＝bad targets", e(r, /bad targets/), errOf(r));
      r = await as(manager, `select public.notice_create_targets('x', 'y', null, $1::uuid[], false, null)`, [[owner.id]]); check("0200(4-4) ★2 owner の membership＝bad targets", e(r, /bad targets/), errOf(r));
      r = await as(manager, `select public.notice_create_targets('x', 'y', $1::uuid[], null, null, null)`, [[castA.id]]); check("0200(4-5) ★2 p_pinned null＝bad pinned", e(r, /bad pinned/), errOf(r));
      r = await as(manager, `select public.notice_create_targets(p_title => 'NOX-VERIFY-0200 旧型', p_body => '本文', p_cast_ids => $1::uuid[], p_until => null) id`, [[castA.id]]); const nid2 = r.ok ? (r.rows[0].id as string) : null;
      check("0200(4-6) ★2 シフト画面の呼び方（4 引数・名前つき）＝pinned false", !!nid2 && (await pc.query(`select pinned from public.notices where id=$1`, [nid2])).rows[0].pinned === false, errOf(r));
      r = await as(staff, `select public.notice_create_targets('x', 'y', $1::uuid[], null, false, null)`, [[castA.id]]); check("0200(4-7) ★2 staff は forbidden", e(r, /forbidden/), errOf(r));
      const see = async (who: Row) => { const x = await as(who, `select id from public.notices where id = any($1::uuid[])`, [[nid, nid2]]); return x.ok ? x.rows.map((y) => y.id as string).sort() : x.err; };
      check("0200(4-8) ★1 RLS cast A（宛先）＝2 件", J(await see(castA)) === J([nid, nid2].sort()));
      check("0200(4-9) ★1 RLS cast B（宛先外）＝0 件", J(await see(castB)) === "[]");
      check("0200(4-10) ★1 RLS staff A＝個別 1 件だけ", J(await see(staffA)) === J([nid]));
      if (staffB) check("0200(4-11) ★1 RLS staff B（宛先外）＝0 件", J(await see(staffB)) === "[]"); else check("0200(4-11) staff B なし（飛ばす）", true);
      check("0200(4-12) ★1 RLS manager＝2 件", J(await see(manager)) === J([nid, nid2].sort()));
      const old = await as(manager, `select public.notice_create('NOX-VERIFY-0200 区分', '本文', 'cast', false, null) id`); const nid3 = old.ok ? (old.rows[0].id as string) : null;
      r = await as(castB, `select id from public.notices where id=$1`, [nid3]); check("0200(4-13) ★1 区分（cast）＝宛先外のキャストにも見える（従来どおり）", r.ok && r.rows.length === 1, errOf(r));
      r = await as(castA, `select public.notice_mark_read($1)`, [nid]); check("0200(4-14) ★3 mark_read＝宛先の cast ok", r.ok, errOf(r));
      r = await as(castB, `select public.notice_mark_read($1)`, [nid]); check("0200(4-15) ★3 mark_read＝宛先外 forbidden", e(r, /forbidden/), errOf(r));
      r = await as(castB, `select public.notice_mark_read($1)`, [nid3]); check("0200(4-16) ★3 mark_read＝区分は ok", r.ok, errOf(r));
      r = await as(manager, `select public.notice_update($1, 't2', 'b2', 'all', true, null)`, [nid]); check("0200(4-17) ★4 targets を区分に＝bad audience", e(r, /bad audience/), errOf(r));
      r = await as(manager, `select public.notice_update($1, 't2', 'b2', 'targets', false, null)`, [nid]);
      check("0200(4-18) ★4 targets のまま title は変えられる・宛先は不変", r.ok && (await pc.query(`select title, cardinality(cast_ids) c from public.notices where id=$1`, [nid])).rows[0].c === 1, errOf(r));
      // ── ★5〜★7 スタッフ給与の支払い済み ──
      const period = "2026-10";
      const smem = (await pc.query(`select m.id from public.memberships m where m.store_id=$1 and m.role in ('manager','staff') and m.is_active order by m.id limit 1`, [st.id])).rows[0] as Row;
      const labor = J([{ membership_id: smem.id, pay_kind: "monthly", hourly: 0, minutes: 0, time_pay: 0, fixed: 0, monthly: 250000, daily: 0, days: 20, amount: 250000, deductions: [], calc_version: "verify0200", allowances: [] }]);
      await pc.query(`delete from public.staff_labor_payments where store_id=$1 and period=$2`, [st.id, period]);
      await pc.query(`delete from public.staff_labor_confirmed where store_id=$1 and period=$2`, [st.id, period]);
      r = await as(manager, `select public.staff_labor_mark_paid($1, $2, '2026-11-10', 'transfer', 'k1', null)`, [st.id, period]); check("0200(4-19) ★6 未確定の月＝not confirmed", e(r, /not confirmed/), errOf(r));
      r = await as(manager, `select public.staff_attendance_confirm($1, $2, true, $3::jsonb)`, [st.id, period, labor]); check("0200(4-20) ★7 確定＝ok", r.ok, errOf(r));
      r = await as(manager, `select public.staff_labor_mark_paid($1, $2, '2026-11-10', 'card', 'k1', null)`, [st.id, period]); check("0200(4-21) ★6 method card＝bad method", e(r, /bad method/), errOf(r));
      r = await as(staff, `select public.staff_labor_mark_paid($1, $2, '2026-11-10', 'transfer', 'k1', null)`, [st.id, period]); check("0200(4-22) ★6 staff＝forbidden", e(r, /forbidden/), errOf(r));
      r = await as(manager, `select public.staff_labor_mark_paid($1, $2, '2026-11-10', 'transfer', 'k1', 'メモ') j`, [st.id, period]);
      check("0200(4-23) ★6 支払い済み＝amount 250000・headcount 1・replay false", r.ok && r.rows[0].j.amount === 250000 && r.rows[0].j.headcount === 1 && r.rows[0].j.replay === false, r.ok ? r.rows[0].j : r.err);
      r = await as(manager, `select public.staff_labor_mark_paid($1, $2, '2026-11-10', 'transfer', 'k1', null) j`, [st.id, period]); check("0200(4-24) ★6 同じ idem_key＝replay true", r.ok && r.rows[0].j.replay === true, errOf(r));
      r = await as(manager, `select public.staff_labor_mark_paid($1, $2, '2026-11-11', 'cash', 'k2', null)`, [st.id, period]); check("0200(4-25) ★6 別キー＝already paid", e(r, /already paid/), errOf(r));
      r = await as(manager, `select public.staff_attendance_confirm($1, $2, false, null)`, [st.id, period]); check("0200(4-26) ★7 支払い済みの月の解除＝paid period", e(r, /paid period/), errOf(r));
      r = await as(staff, `select amount from public.staff_labor_payments where store_id=$1 and period=$2`, [st.id, period]); check("0200(4-27) ★5 RLS＝自店の staff も読める（経費一覧）", r.ok && r.rows.length === 1 && r.rows[0].amount === 250000, errOf(r));
      const au = (await pc.query(`select count(*)::int n from public.audit_logs where action='staff_labor_mark_paid' and target = 'stores:' || $1::text || ':' || $2`, [st.id, period])).rows[0].n as number;
      check("0200(4-28) ★6 audit 1 行（replay は書かない）", au === 1, au);
      r = await as(manager, `select public.staff_labor_unmark_paid($1, $2)`, [st.id, period]); check("0200(4-29) ★6 取消＝manager ok", r.ok, errOf(r));
      r = await as(manager, `select public.staff_labor_unmark_paid($1, $2)`, [st.id, period]); check("0200(4-30) ★6 取消の 2 回目＝not paid", e(r, /not paid/), errOf(r));
      // ── ★9〜★17 出勤中／店端末のみ／本人セッション／heartbeat／会計できる卓 ──
      const setSj = async (patch: Row) => pc.query(`update public.stores set settings_json = coalesce(settings_json, '{}'::jsonb) || $2::jsonb where id = $1`, [st.id, J(patch)]);
      const delSj = async (k: string) => pc.query(`update public.stores set settings_json = settings_json - $2 where id = $1`, [st.id, k]);
      const acc = async (who: Row): Promise<Row> => { const x = await as(who, `select public.auth_register_access() j`); return x.ok ? x.rows[0].j : { err: x.err }; };
      const castMemA = (await pc.query(`select m.id from public.memberships m where m.user_id=(select user_id from public.casts where id=$1) and m.store_id=$2 and m.role='cast' limit 1`, [castA.id, st.id])).rows[0] as Row;
      await pc.query(`update public.memberships set can_register=true where id=$1`, [castMemA.id]);
      await setSj({ sys_cast_register: 2, cast_register_device: "own_phone", duty_gate: false }); await delSj("cast_register_scope");
      const biz = (await pc.query(`select public.biz_date_of($1, now())::text d`, [st.id])).rows[0].d as string;
      await pc.query(`delete from public.punches where cast_id=$1 and punched_at >= ($2::date - 1)`, [castA.id, biz]);
      let j = await acc(castA); check("0200(4-31) ★12 cast 未出勤＝off_duty（duty_gate=false でも）", j.allowed === false && j.reason === "off_duty", j);
      const seat = (await pc.query(`select s.id from public.seats s where s.store_id=$1 and s.is_active and s.kind='卓' order by s.name limit 1`, [st.id])).rows[0] as Row;
      r = await as(manager, `select public.check_open($1, 1) r`, [seat.id]); const chk = r.ok ? (r.rows[0].r as string) : null; check("0200(4-32) fixture＝店長が開卓", !!chk, errOf(r));
      const addLine = () => as(castA, `select public.check_add_line($1, null, 1, 'custom', 'A', 'verify0200', 500) r`, [chk]);
      r = await addLine(); check("0200(4-33) ★9 未出勤の注文＝off duty", e(r, /off duty/), errOf(r));
      r = await as(castA, `select public.punch_self('in') r`); check("0200(4-34) fixture＝cast の出勤打刻", r.ok, errOf(r));
      j = await acc(castA); check("0200(4-35) ★12 出勤後＝allowed", j.allowed === true, j);
      r = await addLine(); check("0200(4-36) ★9 出勤後の注文＝ok", r.ok, errOf(r));
      await setSj({ cast_register_device: "store_device" });
      j = await acc(castA); check("0200(4-37) ★13 M-131 店端末のみ＝スマホからは store_device", j.allowed === false && j.reason === "store_device", j);
      r = await addLine(); check("0200(4-38) ★13 店端末のみ＝RPC も forbidden", e(r, /forbidden/), errOf(r));
      r = await as(castA, `select count(*)::int n from public.checks where id=$1`, [chk]); check("0200(4-39) ★13 店端末のみ＝RLS でも伝票が見えない", r.ok && r.rows[0].n === 0, errOf(r));
      let kdev = (await pc.query(`select id from public.kiosk_devices where store_id=$1 and is_active limit 1`, [st.id])).rows[0] as Row | undefined;
      if (!kdev) { const kr = await as(manager, `select public.kiosk_provision($1, $2, 'NOX-VERIFY-0200 端末') id`, [randomUUID(), st.id]); kdev = kr.ok ? { id: kr.rows[0].id } : undefined; check("0200(4-40) fixture＝端末を発行（tx 内）", !!kdev, errOf(kr)); }
      else check("0200(4-40) fixture＝端末あり", true);
      if (kdev) {
        const ksid = (await pc.query(`insert into public.kiosk_sessions (org_id, store_id, device_id, membership_id, operator_user_id, unlock_method, person_auth_session, person_role, last_seen_at) values ($1, $2, $3, $4, (select user_id from public.memberships where id=$4), 'pin', true, 'cast', now()) returning id`, [st.org_id, st.id, kdev.id, castMemA.id])).rows[0].id as string;
        j = await acc(castA); check("0200(4-41) ★13/16 本人セッション中＝店端末のみでも allowed", j.allowed === true, j);
        r = await addLine(); check("0200(4-42) ★13 本人セッション中＝RPC も ok", r.ok, errOf(r));
        await pc.query(`update public.kiosk_sessions set last_seen_at = now() - interval '11 minutes' where id=$1`, [ksid]);
        j = await acc(castA); check("0200(4-43) ★16 無操作 10 分を過ぎた＝store_device", j.allowed === false && j.reason === "store_device", j);
        await pc.query(`update public.kiosk_devices set device_fp='fp0200v', bound_at=now() where id=$1`, [kdev.id]);
        const touch = async (auth: string, fp: string) => (await pc.query(`select public.kiosk_person_touch($1, $2, $3) b`, [ksid, auth, fp])).rows[0].b as boolean;
        check("0200(4-44) ★17 fp が合わなければ touch できない", (await touch(castA.auth_user_id, "fp-wrong")) === false);
        const t1 = await touch(castA.auth_user_id, "fp0200v"); j = await acc(castA); check("0200(4-45) ★17 heartbeat＝last_seen_at が戻り allowed", t1 === true && j.allowed === true, { t1, j });
        check("0200(4-46) ★17 他人の auth では touch できない", (await touch(castB.auth_user_id, "fp0200v")) === false);
        r = await as(castA, `select public.kiosk_person_touch($1, $2, 'fp0200v') b`, [ksid, castA.auth_user_id]); check("0200(4-47) ★17 authenticated からは permission denied", e(r, /permission denied/), errOf(r));
        await setSj({ kiosk_person_idle_minutes: 3 }); await pc.query(`update public.kiosk_sessions set last_seen_at = now() - interval '4 minutes' where id=$1`, [ksid]);
        j = await acc(castA); check("0200(4-48) ★16 kiosk_person_idle_minutes=3・4 分前＝不可", j.allowed === false && j.reason === "store_device", j); await delSj("kiosk_person_idle_minutes");
        await pc.query(`update public.kiosk_sessions set last_seen_at = now(), ended_at = now() where id=$1`, [ksid]);
        j = await acc(castA); check("0200(4-49) ★16 ended_at あり＝不可", j.allowed === false && j.reason === "store_device", j);
        check("0200(4-50) ★17 終了済みは touch できない", (await touch(castA.auth_user_id, "fp0200v")) === false);
      }
      await setSj({ cast_register_device: "own_phone", cast_register_scope: "own" });
      r = await addLine(); check("0200(4-51) ★14 own＝指名なしの卓＝forbidden", e(r, /forbidden/), errOf(r));
      r = await as(castA, `select count(*)::int n from public.checks where id=$1`, [chk]); check("0200(4-52) ★15 own＝RLS で他の卓は見えない", r.ok && r.rows[0].n === 0, errOf(r));
      r = await as(castA, `select public.check_open($1, 1) r`, [seat.id]); check("0200(4-53) ★14 own＝cast は開卓不可", e(r, /forbidden/), errOf(r));
      await pc.query(`insert into public.check_nominations (org_id, store_id, check_id, cast_id, ratio_weight, position, nom_kind, is_dohan) values ($1, $2, $3, $4, 1, 1, 'hon', false)`, [st.org_id, st.id, chk, castA.id]);
      r = await addLine(); check("0200(4-54) ★14 own＝自分の指名の卓＝ok", r.ok, errOf(r));
      r = await as(castB, `select count(*)::int n from public.checks where id=$1`, [chk]); check("0200(4-55) ★15 own＝他のキャストには見えない", r.ok && r.rows[0].n === 0, errOf(r));
      await setSj({ cast_register_scope: "all", sys_cast_register: 1 });
      r = await as(castA, `select public.check_close($1, $2::uuid) r`, [chk, randomUUID()]); check("0200(4-56) ★14 段階 1（注文のみ）は締め不可", e(r, /forbidden/), errOf(r));
      r = await as(owner, `select public.set_store_profile($1, '{"cast_register_scope": "x"}'::jsonb)`, [st.id]); check("0200(4-57) ★11 cast_register_scope＝all／own 以外は bad", e(r, /bad cast_register_scope/), errOf(r));
      await setSj({ cast_register_enabled: true });
      r = await as(owner, `select public.set_store_profile($1, '{"sys_cast_register": 2, "cast_register_scope": "own"}'::jsonb)`, [st.id]);
      { const sj2 = (await pc.query(`select settings_json sj from public.stores where id=$1`, [st.id])).rows[0].sj as Row; check("0200(4-58) ★11 sys_cast_register を書くと旧キーは消える", r.ok && !("cast_register_enabled" in sj2) && sj2.sys_cast_register === 2, errOf(r)); }
      r = await as(owner, `select public.set_store_cast_register($1, true)`, [st.id]); check("0200(4-59) ★13 set_store_cast_register＝drop 済み", e(r, /does not exist/), errOf(r));
      j = await acc(manager); check("0200(4-60) ★12 manager＝常に allowed", j.allowed === true, j);
      const mid = await cnt(); check("0200(4-61) tx 内も関数 427・表 121", mid.f === FN && mid.t === TB, mid);
    } finally { await pc.query("rollback"); }
    const after = await cnt();
    check("0200(4-62) ROLLBACK＝DB 変更 0（関数 427・表 121）", after.f === before.f && after.t === before.t, after);
  } finally { await pc.end(); }
  if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log(`verify:nox-0200 ALL PASS (${pass} assertions)`);
})();
