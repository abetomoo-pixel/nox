/*
 * verify:nox-open-periods — 夜間便 N5（裁定287-2・2026-09-18）キャスト側の募集期間の案内と日付の可否 lib/nox/shift/open-periods.ts の係留（純関数・DB 不触）。
 *   npm run verify:nox-open-periods（(1)〜(5) は env 不要・(6) は SUPABASE_DB_URL＝seed:f0 済み）。f0 63 段目。
 *  (6) mig0151 ★2 shift_open_periods_mine（AG d2 の移植）: cast＝自店 open のみ 3 列・戻り列・owner／staff 0 行・anon permission denied（pg tx emulate → ROLLBACK）
 *
 *  (1) periodNoticeOf: 期間なし→none／締切前あり→open（M/D〜M/D のシフト希望を受付中（締切 M/D））／すべて締切超過→past_deadline
 *  (2) deadlinePassed: 締切当日は受付中・翌日から超過・締切なしは超過しない
 *  (3) isDateSelectable: 両端含む・隙間は不可・期間なしは不可（DB の fail-closed と同じ）・形式外は不可
 *  (4) dateBoundsOf: 最小 start／最大 end・期間なしは null
 *  (5) 配線（逐語 grep）: wish-form が shift_open_periods_mine を呼び RPC 不在で null（従来どおり）に落とす・期間外は送らない・
 *      'period_not_open' の写像・shift-board の募集中の成功文言
 *  逆テスト 1 本（手動・1 回）: deadlinePassed の `<` を `<=` にする→op(2-1) 赤・戻して緑。
 */
import fs from "node:fs";
import { dateBoundsOf, deadlinePassed, isDateSelectable, periodLineOf, periodNoticeOf, type OpenPeriod } from "../lib/nox/shift/open-periods";
import { rpcErrJa } from "../lib/nox/ui/rpc-err";
import { Client } from "pg";
import { FIXTURE_USERS, STORE_A1, STORE_B1, loadEnvOrExit } from "./fixtures-f0";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const T = "2026-09-18";
const A: OpenPeriod = { start_date: "2026-09-16", end_date: "2026-09-30", wish_deadline: "2026-09-15" }; // 締切超過
const B: OpenPeriod = { start_date: "2026-10-01", end_date: "2026-10-15", wish_deadline: "2026-09-25" }; // 受付中
const C: OpenPeriod = { start_date: "2026-10-16", end_date: "2026-10-31", wish_deadline: null };         // 締切なし＝受付中

// (1)
check("op(1-1) 期間なし→none「現在、募集中の期間はありません」", JSON.stringify(periodNoticeOf([], T)) === JSON.stringify({ kind: "none", text: "現在、募集中の期間はありません" }));
check("op(1-2) 受付中 1 つ→open「10/1〜10/15 のシフト希望を受付中（締切 9/25）」", JSON.stringify(periodNoticeOf([B], T)) === JSON.stringify({ kind: "open", text: "10/1〜10/15 のシフト希望を受付中（締切 9/25）" }), periodNoticeOf([B], T).text);
check("op(1-3) 締切超過だけ→past_deadline「締切を過ぎています（店舗に相談してください）」", JSON.stringify(periodNoticeOf([A], T)) === JSON.stringify({ kind: "past_deadline", text: "締切を過ぎています（店舗に相談してください）" }));
check("op(1-4) 超過＋受付中→open（受付中だけを start 順に「／」で連ねる・締切なしは括弧なし）", periodNoticeOf([C, A, B], T).kind === "open" && periodNoticeOf([C, A, B], T).text === "10/1〜10/15 のシフト希望を受付中（締切 9/25） ／ 10/16〜10/31 のシフト希望を受付中", periodNoticeOf([C, A, B], T).text);
check("op(1-5) periodLineOf 締切なし", periodLineOf(C) === "10/16〜10/31 のシフト希望を受付中");
// (2)
check("op(2-1) 締切当日は受付中・翌日から超過", !deadlinePassed(B, "2026-09-25") && deadlinePassed(B, "2026-09-26"));
check("op(2-2) 締切なしは超過しない・過去の締切は超過", !deadlinePassed(C, "2027-01-01") && deadlinePassed(A, T));
// (3)
check("op(3-1) 両端含む（9/16・9/30 可・9/15・10/16 は A だけなら不可）", isDateSelectable([A], "2026-09-16") && isDateSelectable([A], "2026-09-30") && !isDateSelectable([A], "2026-09-15") && !isDateSelectable([A], "2026-10-16"));
check("op(3-2) 複数期間の隙間は不可（A=〜9/30・C=10/16〜 → 10/5 不可・10/20 可）", !isDateSelectable([A, C], "2026-10-05") && isDateSelectable([A, C], "2026-10-20"));
check("op(3-3) 期間なし・形式外は不可", !isDateSelectable([], "2026-09-18") && !isDateSelectable([A], "") && !isDateSelectable([A], "2026-9-18"));
check("op(3-4) 締切超過の期間の日も可（DB は締切で拒否しない＝0103 裁定43 と同じ・案内だけ）", isDateSelectable([A], T));
// (4)
check("op(4-1) dateBoundsOf 最小 start／最大 end", JSON.stringify(dateBoundsOf([C, A, B])) === JSON.stringify({ min: "2026-09-16", max: "2026-10-31" }));
check("op(4-2) dateBoundsOf 期間なし→null", dateBoundsOf([]) === null);
// (5)
const wf = fs.readFileSync("app/mine/wishes/wish-form.tsx", "utf8");
check("op(5-1) wish-form: shift_open_periods_mine を呼び、RPC 不在は null（従来どおり）・他の失敗は []（募集なし）", /supabase\.rpc\("shift_open_periods_mine"\)/.test(wf) && /setPeriods\(isRpcMissingError\(error\.message\) \? null : \[\]\)/.test(wf));
check("op(5-2) wish-form: 案内は Message（締切超過＝warn）・periods が null なら出さない", /const notice = periods \? periodNoticeOf\(periods, today\) : null;/.test(wf) && /<Message kind=\{notice\.kind === "past_deadline" \? "warn" : "info"\}/.test(wf));
// ★便 AX（裁定290）: 単発の date 入力→月グリッド。期間外の日は活性日の集合（activeDaysOf＝isDateSelectable を内包）で非活性＝送らない
check("op(5-3) wish-form: 期間外の日はカレンダーで非活性（activeDaysOf＝募集中の期間内だけ）・periods null は全て非活性", /activeDaysOf\(\{ periods, cells, wishes, closedDates, today \}\)/.test(wf) && /disabled=\{disabled \|\| busy\}/.test(wf) && !/type="date"/.test(wf));
check("op(5-4) wish-form: 失敗は rpcErrJa 経由（'closed day'／'bad time' は専用文言）・'period_not_open'＝「この日は募集期間外です」", /: rpcErrJa\(error\.message\);/.test(wf) && rpcErrJa("period_not_open") === "この日は募集期間外です" && /提出済み/.test(rpcErrJa("duplicate wish")));
const sb = fs.readFileSync("app/(manage)/shift/shift-board.tsx", "utf8");
check("op(5-5) shift-board: 募集中で保存したとき「キャストのマイページに希望提出の案内が表示されます」を足す", /\(pStatus === "open" \? "。キャストのマイページに希望提出の案内が表示されます" : ""\)/.test(sb));

// (6) DB 段（mig0151 ★2 shift_open_periods_mine＝AG d2 の移植・裁定287-2／289-2）: Postgres 直結の 1 トランザクション内で JWT claims を emulate → ROLLBACK＝残留 0
async function dbChecks() {
  const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];
  type R = { ok: true; rows: Record<string, unknown>[] } | { ok: false; err: string };
  const call = async (sql: string, params: unknown[] = []): Promise<R> => {
    await db.query("savepoint sp");
    try { const rows = (await db.query(sql, params)).rows; await db.query("release savepoint sp"); return { ok: true, rows }; }
    catch (e) { await db.query("rollback to savepoint sp"); return { ok: false, err: (e as Error).message }; }
  };
  const asUid = async (uid: string) => { await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]); await db.query(`set local role authenticated`); };
  const asAnon = async () => { await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "anon" })]); await db.query(`set local role anon`); };
  const asPg = async () => { await db.query("reset role"); };
  try {
    const stA = (await q<{ id: string; org_id: string }>(`select id, org_id from public.stores where name = $1`, [STORE_A1]))[0];
    const stB = (await q<{ id: string; org_id: string }>(`select id, org_id from public.stores where name = $1`, [STORE_B1]))[0];
    const uidOf = async (key: keyof typeof FIXTURE_USERS) => (await q<{ id: string; auth_user_id: string }>(`select id, auth_user_id from public.users where email = $1 and is_active`, [FIXTURE_USERS[key].email]))[0];
    const castU = await uidOf("castA1a"), ownerA = await uidOf("ownerA"), staffU = await uidOf("staffA1"), mgrB = await uidOf("managerB1");
    check("op(6-0) fixture: A1／B1／cast-a1a／owner-a／staff-a1／manager-b1", !!stA && !!stB && !!castU && !!ownerA && !!staffU && !!mgrB);
    const snap = async () => JSON.stringify((await q(`select (select count(*)::int from public.shift_periods) n`))[0]);
    const before = await snap();
    await db.query("begin");
    try {
      const openP = await q<{ s: string; e: string; w: string | null; status: string }>(`select start_date::text s, end_date::text e, wish_deadline::text w, status from public.shift_periods where store_id = $1 order by start_date`, [stA.id]);
      await db.query(`insert into public.shift_periods (org_id, store_id, start_date, end_date, wish_deadline, status, created_by) values ($1,$2,'2097-01-01','2097-01-15','2096-12-25','draft',$3), ($1,$2,'2097-02-01','2097-02-15','2097-01-25','published',$3), ($1,$2,'2097-03-01','2097-03-15','2097-02-25','closed',$3)`, [stA.org_id, stA.id, ownerA.id]);
      await db.query(`insert into public.shift_periods (org_id, store_id, start_date, end_date, wish_deadline, status, created_by) values ($1,$2,'2097-04-01','2097-04-15','2097-03-25','open',$3)`, [stB.org_id, stB.id, mgrB.id]);
      await db.query(`insert into public.shift_periods (org_id, store_id, start_date, end_date, wish_deadline, status, created_by) values ($1,$2,'2097-05-01','2097-05-15','2097-04-25','open',$3)`, [stA.org_id, stA.id, ownerA.id]);
      const expOpen = openP.filter((p) => p.status === "open").map((p) => [p.s, p.e, p.w]).concat([["2097-05-01", "2097-05-15", "2097-04-25"]]);
      await asUid(castU.auth_user_id);
      const op = await call(`select start_date::text s, end_date::text e, wish_deadline::text w from public.shift_open_periods_mine()`);
      check(`op(6-1) ★cast: 自店の open 期間だけが 3 列で返る（${expOpen.length} 行・draft／published／closed・他店（B1）の open は返らない）`, op.ok && JSON.stringify(op.rows.map((r) => [r.s, r.e, r.w])) === JSON.stringify(expOpen), op.ok ? JSON.stringify(op.rows) : op.err);
      await asPg();
      const cols = (await q<{ r: string }>(`select pg_get_function_result(oid) r from pg_proc where pronamespace='public'::regnamespace and proname='shift_open_periods_mine'`))[0];
      check("op(6-2) 戻り列＝start_date date, end_date date, wish_deadline date のみ（id／status を返さない）", cols?.r === "TABLE(start_date date, end_date date, wish_deadline date)", cols?.r);
      await asUid(ownerA.auth_user_id);
      const opO = await call(`select * from public.shift_open_periods_mine()`);
      await asPg(); await asUid(staffU.auth_user_id);
      const opS = await call(`select * from public.shift_open_periods_mine()`);
      await asPg(); await asAnon();
      const opA = await call(`select * from public.shift_open_periods_mine()`);
      await asPg();
      check("op(6-3) ★owner・staff が呼ぶと 0 行（raise しない＝289-2）・anon は permission denied", opO.ok && opO.rows.length === 0 && opS.ok && opS.rows.length === 0 && !opA.ok && /permission denied/.test(opA.err), `${opO.ok ? opO.rows.length : opO.err} / ${opS.ok ? opS.rows.length : opS.err} / ${opA.ok ? "ok" : opA.err}`);
    } finally {
      await db.query("rollback");
    }
    const after = await snap();
    check("op(6-9) ROLLBACK 後の残留＝実行前と同値（shift_periods 行数）", after === before, `${before} → ${after}`);
  } finally {
    await db.end().catch(() => undefined);
  }
}

dbChecks().then(() => {
  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-open-periods OK (${pass} checks)`);
}).catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
