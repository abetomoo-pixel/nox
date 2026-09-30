/*
 * verify:nox-punch-sequence — mig0161（裁定327＋追補1・2026-09-30）: 打刻の順序検査 punch_seq_check と open_punch の注意行の係留（便 P161-3）。
 *   npm run verify:nox-punch-sequence（env: SUPABASE_DB_URL・seed:f0 済み）。Postgres 直結の 1 トランザクション内で JWT を emulate（fixtures-pgtx）→ 最後に ROLLBACK＝残留 0。
 *   fixture＝A1 に一時 cast 6 人（users＋memberships(cast)＋casts・tx 内 insert）＝既存 verify cast の当日の打刻状態に依存しない。
 *
 *  ps(1) punch_self: in OK → in 'already in' → out OK → out 'no open punch' → in 'already out'（同一営業日の再出勤は不可）・行 2（拒否は残さない）
 *  ps(2) 出勤前の退勤 'no open punch'・その後の in は OK
 *  ps(3) 前営業日の未閉鎖 in は今日の in を塞がない・注意行 'open_punch' 1 行（run_id null・detail punch_id／biz_date）・再打刻（'already in'）と out でも 1 行（冪等）・audit 'punch_open_attention' 1
 *  ps(4) 器: 同じ punch_id の 2 行目は部分 unique 違反・detail 欠けは open_punch_ck
 *  ps(5) payroll_attentions_of: その営業日を含む run で open_punch 1 行（run_id null でも拾う）・別期間の run は 0・他 org manager forbidden・payroll_attention_resolve で解決できる
 *  ps(6) punch_proxy（manager 代理＝追補1）: 前営業日 in の注意行は run 期間があれば run_id 付き・in 'already in'・out OK・out 'no open punch'・in 'already out'
 *  ps(7) kiosk_punch（追補1＝raise）: in OK → in 'already in' → out OK → out 'no open punch'（端末の和文は M1）
 *  ps(8) punch_correction_apply（店側修正）は順序検査の対象外＝閉鎖済みの営業日に manager の修正申請（即確定）で out を足せる
 *  ps(9) punch_seq_check は内部専用（anon／cast／owner の直呼びは permission denied）・postgres 直呼びの型検査 'bad type'
 *  ps(0) fixture・ROLLBACK 後 残留 0（punches／payroll_attentions／payroll_runs／casts／users／memberships／kiosk_devices／audit_logs の行数一致）
 *  逆テスト 1 本（手動・1 回）: ps(1-1) の期待語 'already in' を 'already im' にする→赤・戻して緑。
 */
import { Client } from "pg";
import { loadEnvOrExit } from "./fixtures-f0";
import { pgTx } from "./fixtures-pgtx";

const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }

async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
  await db.connect();
  const { q, one, errOf, as, uidOf, storeA1 } = pgTx(db);
  const has = (r: { ok: boolean; err?: string }, w: string) => !r.ok && (r.err ?? "").includes(w);
  try {
    const A1 = await storeA1();
    const owner = await uidOf("ownerA"), mgr = await uidOf("managerA1"), castU = await uidOf("castA1a"), mgrB = await uidOf("managerB1");
    check("ps(0-1) fixture: A1／owner-a／manager-a1／cast-a1a／manager-b1", !!A1 && !!owner && !!mgr && !!castU && !!mgrB);
    const snapSql = `select (select count(*)::int from public.punches) pu, (select count(*)::int from public.payroll_attentions) pa, (select count(*)::int from public.payroll_runs) pr,
      (select count(*)::int from public.casts) ca, (select count(*)::int from public.users) us, (select count(*)::int from public.memberships) me, (select count(*)::int from public.kiosk_devices) kd, (select count(*)::int from public.audit_logs) au`;
    const before = JSON.stringify(await one(snapSql));
    await db.query("begin");
    try {
      // 一時 fixture（tx 内・ROLLBACK で消える）: users＋memberships(cast)＋casts
      const mkCast = async (tag: string) => {
        const u = await one<{ id: string; auth_user_id: string }>("insert into public.users (org_id, auth_user_id, email, name, is_active) values ($1, gen_random_uuid(), $2, $3, true) returning id, auth_user_id", [A1.org_id, `nox-verify-ps-${tag}-${Date.now()}@example.com`, `検証ps-${tag}`]);
        await q("insert into public.memberships (user_id, store_id, role, is_active) values ($1, $2, 'cast', true)", [u.id, A1.id]);
        const c = await one<{ id: string }>("insert into public.casts (org_id, store_id, user_id, name, is_active) values ($1, $2, $3, $4, true) returning id", [A1.org_id, A1.id, u.id, `検証キャストps-${tag}（0161 suite の一時行）`]);
        return { user: u, cast: c.id };
      };
      const cnt = async (castId: string) => (await one<{ n: number }>("select count(*)::int n from public.punches where cast_id=$1", [castId])).n;
      const self = (who: { auth_user_id: string }, type: "in" | "out") => as(who, `select public.punch_self('${type}', null, null) id`);
      const T1 = await mkCast("t1"), T2 = await mkCast("t2"), T3 = await mkCast("t3"), T4 = await mkCast("t4"), T5 = await mkCast("t5"), T6 = await mkCast("t6");
      // (1) punch_self の 3 拒否
      const c11 = await self(T1.user, "in"), c12 = await self(T1.user, "in"), c13 = await self(T1.user, "out"), c14 = await self(T1.user, "out"), c15 = await self(T1.user, "in");
      check("ps(1-1) punch_self: in OK → in 'already in' → out OK → out 'no open punch' → in 'already out'・行 2（拒否は残さない）", c11.ok && has(c12, "already in") && c13.ok && has(c14, "no open punch") && has(c15, "already out") && (await cnt(T1.cast)) === 2, [errOf(c12), errOf(c14), errOf(c15)].join(" | "));
      const c21 = await self(T2.user, "out"), c22 = await self(T2.user, "in");
      check("ps(2-1) 出勤前の退勤 'no open punch'・その後の in は OK（行 1）", has(c21, "no open punch") && c22.ok && (await cnt(T2.cast)) === 1, errOf(c21));
      // (3) 前営業日の未閉鎖 in → 注意行 open_punch（run 無し＝run_id null）
      const old = await one<{ id: string; punched_at: string }>("insert into public.punches (org_id, store_id, cast_id, punched_at, type, source) values ($1, $2, $3, now() - interval '1 day', 'in', 'self') returning id, punched_at", [A1.org_id, A1.id, T3.cast]);
      const att = (castId: string) => q<{ id: string; run_id: string | null; kind: string; detail: Record<string, unknown>; resolved_at: string | null }>("select id, run_id, kind, detail, resolved_at from public.payroll_attentions where cast_id=$1 order by created_at", [castId]);
      const c31 = await self(T3.user, "in");
      const a1 = await att(T3.cast);
      const c32 = await self(T3.user, "in"), c33 = await self(T3.user, "out");
      const a2 = await att(T3.cast);
      const bdOld = (await one<{ d: string }>("select public.biz_date_of($1, $2::timestamptz)::text d", [A1.id, old.punched_at])).d;
      const au = a1[0] ? (await one<{ n: number }>("select count(*)::int n from public.audit_logs where action='punch_open_attention' and target = 'payroll_attentions:' || $1", [a1[0].id])).n : -1;
      check("ps(3-1) 前営業日の未閉鎖 in は今日の in を塞がない・open_punch 1 行（run_id null・detail punch_id／biz_date）・'already in'／out でも 1 行（冪等）・audit 1",
        c31.ok && a1.length === 1 && a1[0].run_id === null && a1[0].kind === "open_punch" && a1[0].detail.punch_id === old.id && a1[0].detail.biz_date === bdOld && has(c32, "already in") && c33.ok && a2.length === 1 && au === 1,
        JSON.stringify({ c31: errOf(c31), a1: a1.map((x) => [x.run_id, x.kind, x.detail.biz_date]), bdOld, au, c32: errOf(c32) }));
      /** postgres のまま 1 文を savepoint で包んで raise を拾う（直 insert の制約違反を見る） */
      const pgTry = async (sql: string, params: unknown[]): Promise<{ ok: boolean; err?: string }> => {
        await db.query("savepoint pgtry");
        try { await db.query(sql, params); await db.query("release savepoint pgtry"); return { ok: true }; }
        catch (e) { await db.query("rollback to savepoint pgtry"); return { ok: false, err: (e as Error).message }; }
      };
      const dup = await pgTry("insert into public.payroll_attentions (org_id, store_id, cast_id, run_id, kind, detail) values ($1, $2, $3, null, 'open_punch', jsonb_build_object('punch_id', $4::uuid, 'biz_date', $5::date))", [A1.org_id, A1.id, T3.cast, old.id, bdOld]);
      const badShape = await pgTry("insert into public.payroll_attentions (org_id, store_id, cast_id, run_id, kind, detail) values ($1, $2, $3, null, 'open_punch', '{}'::jsonb)", [A1.org_id, A1.id, T3.cast]);
      check("ps(4-1) 器: 同じ punch_id の 2 行目は payroll_attentions_open_punch_uq・detail 欠けは payroll_attentions_open_punch_ck", has(dup, "payroll_attentions_open_punch_uq") && has(badShape, "payroll_attentions_open_punch_ck"), [dup.err ?? "(no error)", badShape.err ?? "(no error)"].join(" | "));
      // (5) payroll_attentions_of は run の期間で拾う・resolve
      const per = bdOld.slice(0, 7);
      const runRow = (await one<{ id: string }>("select id from public.payroll_runs where store_id=$1 and period=$2", [A1.id, per])) ?? (await one<{ id: string }>("insert into public.payroll_runs (org_id, store_id, period, created_by) values ($1, $2, $3, $4) returning id", [A1.org_id, A1.id, per, owner.id]));
      const runFar = (await one<{ id: string }>("select id from public.payroll_runs where store_id=$1 and period='2031-01'", [A1.id])) ?? (await one<{ id: string }>("insert into public.payroll_runs (org_id, store_id, period, created_by) values ($1, $2, '2031-01', $3) returning id", [A1.org_id, A1.id, owner.id]));
      const r1 = await as(mgr, "select id, cast_id, kind from public.payroll_attentions_of($1)", [runRow.id]);
      const r2 = await as(mgr, "select id from public.payroll_attentions_of($1)", [runFar.id]);
      const r3 = await as(mgrB, "select id from public.payroll_attentions_of($1)", [runRow.id]);
      const r1rows = r1.ok ? r1.rows.filter((x) => x.cast_id === T3.cast) : [];
      check("ps(5-1) payroll_attentions_of: 期間の run で T3 の open_punch 1 行（run_id null でも拾う）・別期間の run は T3 の行 0・他 org manager forbidden", r1.ok && r1rows.length === 1 && r1rows[0].kind === "open_punch" && r2.ok && r2.rows.filter((x) => x.id === a1[0]?.id).length === 0 && has(r3, "forbidden"), JSON.stringify({ r1: r1.ok ? r1.rows.length : r1.err, r2: r2.ok ? r2.rows.length : r2.err, r3: errOf(r3) }));
      const rs = await as(mgr, "select public.payroll_attention_resolve($1, '修正申請で閉じた') id", [a1[0]?.id ?? null]);
      const a3 = await att(T3.cast);
      check("ps(5-2) payroll_attention_resolve で open_punch を解決できる（resolved_at）", rs.ok && a3[0]?.resolved_at !== null, errOf(rs));
      // (6) punch_proxy（追補1＝対象）: run 期間が既にあるので注意行に run_id が付く
      const old4 = await one<{ id: string }>("insert into public.punches (org_id, store_id, cast_id, punched_at, type, source) values ($1, $2, $3, now() - interval '1 day', 'in', 'self') returning id", [A1.org_id, A1.id, T4.cast]);
      const proxy = (type: "in" | "out") => as(mgr, `select public.punch_proxy($1, '${type}', null) id`, [T4.cast]);
      const p41 = await proxy("in");
      const a4 = await q<{ run_id: string | null; pid: string }>("select run_id, detail->>'punch_id' pid from public.payroll_attentions where cast_id=$1", [T4.cast]);
      const p42 = await proxy("in"), p43 = await proxy("out"), p44 = await proxy("out"), p45 = await proxy("in");
      check("ps(6-1) punch_proxy（manager）: 前営業日 in の注意行は run_id 付き（期間の run あり）・in 'already in'・out OK・out 'no open punch'・in 'already out'", p41.ok && a4.length === 1 && a4[0].run_id === runRow.id && a4[0].pid === old4.id && has(p42, "already in") && p43.ok && has(p44, "no open punch") && has(p45, "already out"), JSON.stringify({ p41: errOf(p41), a4, p42: errOf(p42), p44: errOf(p44), p45: errOf(p45) }));
      // (7) kiosk_punch（追補1＝raise）
      const kioskUid = (await one<{ u: string }>("select gen_random_uuid() u")).u;
      await q("insert into public.kiosk_devices (org_id, store_id, auth_user_id, label, is_active, purpose) values ($1,$2,$3,'ps-punch',true,'punch')", [A1.org_id, A1.id, kioskUid]);
      const pinSet = await as(mgr, "select public.set_cast_pin($1, '1234') r", [T5.cast]);
      const kiosk = (type: "in" | "out") => as({ auth_user_id: kioskUid }, `select public.kiosk_punch($1, '1234', '${type}') r`, [T5.cast]);
      const k1 = await kiosk("in"), k2 = await kiosk("in"), k3 = await kiosk("out"), k4 = await kiosk("out");
      const k1ok = k1.ok && (k1.rows[0].r as { ok: boolean }).ok === true, k3ok = k3.ok && (k3.rows[0].r as { ok: boolean }).ok === true;
      check("ps(7-1) kiosk_punch: in OK → in raise 'already in' → out OK → out raise 'no open punch'（rpc-err 様式・端末の和文は M1）", pinSet.ok && k1ok && has(k2, "already in") && k3ok && has(k4, "no open punch"), [errOf(pinSet), errOf(k1), errOf(k2), errOf(k3), errOf(k4)].join(" | "));
      // (8) 店側の修正（punch_correction_apply）は順序検査の対象外
      const c61 = await self(T6.user, "in"), c62 = await self(T6.user, "out");
      const bizToday = (await one<{ d: string }>("select public.biz_date_of($1, now())::text d", [A1.id])).d;
      const fix = await as(mgr, "select public.punch_correction_request($1, null, $2::date, 'out', now(), '店側修正の検証（0161 suite）') id", [T6.cast, bizToday]);
      const last6 = await one<{ type: string; source: string }>("select type, source from public.punches where cast_id=$1 order by punched_at desc, created_at desc limit 1", [T6.cast]);
      check("ps(8-1) punch_correction_apply（manager の修正申請＝即確定）は順序検査の対象外＝閉鎖済みの営業日に out を足せる（行 3・source manager）", c61.ok && c62.ok && fix.ok && (await cnt(T6.cast)) === 3 && last6?.type === "out" && last6?.source === "manager", errOf(fix));
      // (9) 内部専用
      const d1 = await as("anon", "select public.punch_seq_check($1, $2, 'in', now())", [A1.id, T1.cast]);
      const d2 = await as(castU, "select public.punch_seq_check($1, $2, 'in', now())", [A1.id, T1.cast]);
      const d3 = await as(owner, "select public.punch_seq_check($1, $2, 'in', now())", [A1.id, T1.cast]);
      const bt = await pgTry("select public.punch_seq_check($1, $2, 'bogus', now())", [A1.id, T1.cast]);
      check("ps(9-1) punch_seq_check は内部専用: anon／cast／owner は permission denied・postgres 直呼びの型検査 'bad type'", has(d1, "permission denied") && has(d2, "permission denied") && has(d3, "permission denied") && has(bt, "bad type"), [errOf(d1), errOf(d2), errOf(d3), bt.err ?? ""].join(" | "));
    } finally {
      await db.query("rollback");
    }
    const after = JSON.stringify(await one(snapSql));
    check("ps(0-2) ROLLBACK 後: punches／payroll_attentions／payroll_runs／casts／users／memberships／kiosk_devices／audit_logs の行数が before と一致（残留 0）", after === before, `${before} → ${after}`);
  } finally {
    await db.end().catch(() => undefined);
  }
  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-punch-sequence ALL PASS (${pass} assertions)`);
  console.log("打刻の順序検査(0161・裁定327＋追補1): 'already in'／'already out'／'no open punch' / 前営業日の未閉鎖 in は塞がず open_punch 1 行＋audit / 器 unique・ck / attentions_of 期間拾い・resolve / proxy run_id 付き / kiosk raise / correction_apply 非対象 / 内部専用 / ROLLBACK 残留 0");
}

main().catch((e) => { console.error(e); process.exit(1); });
