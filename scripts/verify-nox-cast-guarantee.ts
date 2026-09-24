/*
 * verify:nox-cast-guarantee — 夜間便 N4（裁定282-2／282-3／287-3・2026-09-18）保証時給の表示用純関数 lib/nox/cast/guarantee.ts の係留（DB 不触）。
 *   npm run verify:nox-cast-guarantee（(1)〜(8) は env 不要・(9) は SUPABASE_DB_URL＝seed:f0 済み）。f0 62 段目。
 *  (9) mig0151 ★3 set_cast_guarantee（AG d3 の移植）: (a)／重なり／延長／(b)／検証 3／3 ロール／後続の予定より前は exists（289-6 ②）／no plan／audit（pg tx emulate → ROLLBACK）
 *
 *  (1) guaranteeRowsOf: overrides_json.guarantee===true かつ base が数値の行だけ・valid_from 昇順
 *  (2) daysLeftOf: 今日を含まない差（当日=0・7 日後=7・過去は負・to null は null）
 *  (3) guaranteeStateOf: 0151 ★3 (a) の 3 行形（閉じた C／保証行／戻し行）で current・upcoming・history が分かれる。両端の日を含む
 *  (4) guaranteeBadgeOf: 残り 0〜7 で印・8 と負と期限なしと保証なしは null
 *  (5) guaranteeNoticesOf: 7 日以内だけ・残り日数→名前の順・終了日つき
 *  (6) addDays／mdOf: 既定の終了日＝開始＋29 日（30 日間）・月末／年末をまたぐ・M/D
 *  (7) isRpcMissingError: PostgREST の関数不在文言だけ true（'bad amount'／'forbidden' は false）
 *  (8) 配線（逐語 grep）: casts-board が valid_from／valid_to を読み set_cast_guarantee を呼び、RPC 不在で節を隠す。ホームが guaranteeNoticesOf を通す。
 *      rpc-err が 'guarantee exists'／'no plan'／'bad valid_from' を日本語にする
 *  逆テスト 1 本（手動・1 回）: guaranteeBadgeOf の `> withinDays` を `>= withinDays` にする→gu(4-1) 赤・戻して緑。
 */
import fs from "node:fs";
import { addDays, daysLeftOf, guaranteeBadgeOf, guaranteeNoticesOf, guaranteeRowsOf, guaranteeStateOf, mdOf, type PlanRowLike } from "../lib/nox/cast/guarantee";
import { isRpcMissingError, rpcErrJa } from "../lib/nox/ui/rpc-err";
import { Client } from "pg";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const T = "2026-09-18";

// (1)
const rows: PlanRowLike[] = [
  { valid_from: "2026-10-01", valid_to: null, overrides_json: { base: 3000 } },                                  // 戻し行（保証なし）
  { valid_from: "2026-09-10", valid_to: "2026-09-30", overrides_json: { base: 4000, guarantee: true } },        // 保証行（現在）
  { valid_from: "2026-01-01", valid_to: "2026-09-09", overrides_json: { base: 3000 } },                        // 閉じた C
  { valid_from: "2025-06-01", valid_to: "2025-06-30", overrides_json: { base: 3500, guarantee: "true" } },      // 文字列 'true' は保証扱いにしない
  { valid_from: "2025-03-01", valid_to: "2025-03-31", overrides_json: { base: 3200, guarantee: true } },        // 履歴
  { valid_from: "2025-01-01", valid_to: "2025-01-31", overrides_json: { guarantee: true } },                    // base 無し＝除外
];
const gs = guaranteeRowsOf(rows);
check("gu(1-1) guarantee===true かつ base 数値の行だけ（2 行）", gs.length === 2, JSON.stringify(gs));
check("gu(1-2) valid_from 昇順", gs[0].from === "2025-03-01" && gs[1].from === "2026-09-10" && gs[1].base === 4000 && gs[1].to === "2026-09-30");
check("gu(1-3) overrides_json 欠損は落ちない（0 行）", guaranteeRowsOf([{ valid_from: "2026-01-01", valid_to: null }]).length === 0);
// (2)
check("gu(2-1) daysLeftOf 当日=0・7 日後=7・12 日後=12", daysLeftOf(T, T) === 0 && daysLeftOf("2026-09-25", T) === 7 && daysLeftOf("2026-09-30", T) === 12);
check("gu(2-2) daysLeftOf 過去は負・null は null", daysLeftOf("2026-09-17", T) === -1 && daysLeftOf(null, T) === null);
// (3)
const st = guaranteeStateOf(rows, T);
check("gu(3-1) current＝今日を含む保証行（¥4000・9/10〜9/30・あと 12 日）", st.current?.base === 4000 && st.current?.from === "2026-09-10" && st.daysLeft === 12, JSON.stringify(st));
check("gu(3-2) upcoming なし（戻し行は保証行ではない）・history＝2025-03 の 1 行", st.upcoming === null && st.history.length === 1 && st.history[0].from === "2025-03-01");
check("gu(3-3) 両端を含む（from の日・to の日とも current）", guaranteeStateOf(rows, "2026-09-10").current !== null && guaranteeStateOf(rows, "2026-09-30").current !== null && guaranteeStateOf(rows, "2026-09-30").daysLeft === 0);
check("gu(3-4) 終了の翌日は current なし・history に落ちる", guaranteeStateOf(rows, "2026-10-01").current === null && guaranteeStateOf(rows, "2026-10-01").history[0]?.from === "2026-09-10");
check("gu(3-5) 開始前は upcoming（予定）・current なし", guaranteeStateOf(rows, "2026-09-09").current === null && guaranteeStateOf(rows, "2026-09-09").upcoming?.from === "2026-09-10");
check("gu(3-6) 期限なし（to null）の保証は current で daysLeft null", guaranteeStateOf([{ valid_from: "2026-01-01", valid_to: null, overrides_json: { base: 5000, guarantee: true } }], T).daysLeft === null && guaranteeStateOf([{ valid_from: "2026-01-01", valid_to: null, overrides_json: { base: 5000, guarantee: true } }], T).current?.base === 5000);
check("gu(3-7) 行なし＝すべて空", JSON.stringify(guaranteeStateOf([], T)) === JSON.stringify({ current: null, upcoming: null, history: [], daysLeft: null }));
// (4)
const one = (to: string | null) => guaranteeStateOf([{ valid_from: "2026-09-01", valid_to: to, overrides_json: { base: 4000, guarantee: true } }], T);
check("gu(4-1) 残り 7＝印・残り 8＝なし", guaranteeBadgeOf(one("2026-09-25"))?.daysLeft === 7 && guaranteeBadgeOf(one("2026-09-26")) === null);
check("gu(4-2) 残り 0＝印（当日）・残り 1＝印", guaranteeBadgeOf(one(T))?.daysLeft === 0 && guaranteeBadgeOf(one("2026-09-19"))?.daysLeft === 1);
check("gu(4-3) 期限なし・保証なし＝null", guaranteeBadgeOf(one(null)) === null && guaranteeBadgeOf(guaranteeStateOf([], T)) === null);
check("gu(4-4) withinDays を 3 にすると残り 4 は null・残り 3 は印", guaranteeBadgeOf(one("2026-09-22"), 3) === null && guaranteeBadgeOf(one("2026-09-21"), 3)?.daysLeft === 3);
// (5)
const g = (to: string | null): PlanRowLike[] => [{ valid_from: "2026-09-01", valid_to: to, overrides_json: { base: 4000, guarantee: true } }];
const ns = guaranteeNoticesOf([
  { name: "りん", rows: g("2026-09-21") }, { name: "あい", rows: g("2026-09-21") }, { name: "さくら", rows: g("2026-09-19") },
  { name: "みお", rows: g("2026-09-26") }, { name: "ゆき", rows: [] }, { name: "なな", rows: g(null) },
], T);
check("gu(5-1) 7 日以内の 3 名だけ（8 日後・保証なし・期限なしは除外）", ns.length === 3, JSON.stringify(ns));
check("gu(5-2) 残り日数→名前の順・終了日つき", ns.map((n) => n.name).join(",") === "さくら,あい,りん" && ns[0].daysLeft === 1 && ns[0].to === "2026-09-19");
// (6)
check("gu(6-1) 既定の終了日＝開始＋29 日（9/18→10/17）", addDays(T, 29) === "2026-10-17");
check("gu(6-2) 月末・年末・うるう年をまたぐ", addDays("2026-12-31", 1) === "2027-01-01" && addDays("2028-02-28", 1) === "2028-02-29" && addDays("2026-10-01", -1) === "2026-09-30");
check("gu(6-3) mdOf 'YYYY-MM-DD'→'M/D'（先頭 0 なし）", mdOf("2026-09-05") === "9/5" && mdOf("2026-12-31") === "12/31");
// (7)
check("gu(7-1) isRpcMissingError: PostgREST の不在文言（schema cache／PGRST202）＝true・pg の 'does not exist' 単独は対象外（X2-1）", isRpcMissingError("Could not find the function public.set_cast_guarantee(p_amount, p_cast_id, p_end, p_start) in the schema cache") && isRpcMissingError("PGRST202: x") && !isRpcMissingError("function public.set_cast_guarantee(uuid, integer, date, date) does not exist"));
check("gu(7-2) isRpcMissingError: 通常の raise は false", !isRpcMissingError("bad amount") && !isRpcMissingError("forbidden") && !isRpcMissingError(null) && !isRpcMissingError("guarantee exists"));
check("gu(7-3) rpcErrJa: guarantee exists／no plan／bad valid_from／bad valid_to が日本語", /既に保証時給/.test(rpcErrJa("guarantee exists")) && /先に報酬プランを設定してください/.test(rpcErrJa("no plan")) && /開始日/.test(rpcErrJa("bad valid_from")) && /終了日/.test(rpcErrJa("bad valid_to")));
// (8)
const cb = fs.readFileSync("app/(manage)/casts/casts-board.tsx", "utf8");
check("gu(8-1) casts-board: cast_plan を valid_from／valid_to つきで読み、今日を含む行を現在行にする", /select\("cast_id, plan_id, overrides_json, valid_from, valid_to"\)/.test(cb) && /isCurrent = vf <= today && \(vt === null \|\| today <= vt\)/.test(cb));
check("gu(8-2) casts-board: set_cast_guarantee を 4 引数で呼ぶ（p_cast_id／p_amount／p_start／p_end）", /rpc\("set_cast_guarantee", \{ p_cast_id: c\.id, p_amount: amount, p_start: start, p_end: end \}\)/.test(cb));
check("gu(8-3) casts-board: RPC 不在（probe／保存時）で節ごと非表示・成否は Message・失敗は rpcErrJa", /setGuaRpc\(error && isRpcMissingError\(error\.message\) \? "missing" : "ok"\)/.test(cb) && /\{guaRpc !== "missing" && \(\(\) => \{/.test(cb) && /\{guaMsg && <Message kind=\{guaMsg\.kind\}/.test(cb) && /text: rpcErrJa\(error\.message\)/.test(cb));
check("gu(8-4) casts-board: 延長＝現在の終了日の翌日から同じ金額・新規＝今日〜＋29 日・カードの印は nox-stpill warn", /mode: "extend", amount: String\(cur\.base\), start: addDays\(cur\.to \?\? today, 1\)/.test(cb) && /mode: "new", amount: "", start: today, end: addDays\(today, 29\)/.test(cb) && /<span className="nox-stpill warn">保証 あと\{guaBadgeOf\(c\.id\)!\.daysLeft\}日<\/span>/.test(cb));
const db = fs.readFileSync("app/(manage)/dashboard/dashboard-board.tsx", "utf8");
const dp = fs.readFileSync("app/(manage)/dashboard/page.tsx", "utf8");
check("gu(8-5) dashboard: owner/manager のときだけ cast_plan 1 select→guaranteeNoticesOf→warn Message・page が isManagerUp を渡す", /isManagerUp\s*\? await supabase\.from\("cast_plan"\)\.select\("cast_id, valid_from, valid_to, overrides_json"\)/.test(db) && /setGuaNotices\(guaranteeNoticesOf\(/.test(db) && /\{guaNotices\.length > 0 && \(\s*<Message kind="warn"/.test(db) && /isManagerUp=\{isManagerUp\}/.test(dp));
check("gu(8-6) dashboard: cast_plan の select は 1 箇所（追加取得 ≤1）", (db.match(/from\("cast_plan"\)/g) ?? []).length === 1);

// (9) DB 段（mig0151 ★3 set_cast_guarantee＝AG d3 の移植・裁定287-3／289-3〜6）: pg tx で JWT emulate → ROLLBACK＝残留 0
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
  const errOf = (r: R) => (r.ok ? "(no error)" : r.err);
  const asUid = async (uid: string) => { await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]); await db.query(`set local role authenticated`); };
  const asAnon = async () => { await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "anon" })]); await db.query(`set local role anon`); };
  const asPg = async () => { await db.query("reset role"); };
  try {
    const st = (await q<{ id: string; org_id: string }>(`select id, org_id from public.stores where name = $1`, [STORE_A1]))[0];
    const uidOf = async (key: keyof typeof FIXTURE_USERS) => (await q<{ id: string; auth_user_id: string }>(`select id, auth_user_id from public.users where email = $1 and is_active`, [FIXTURE_USERS[key].email]))[0];
    const castU = await uidOf("castA1a"), ownerA = await uidOf("ownerA"), mgrA = await uidOf("managerA1"), staffU = await uidOf("staffA1");
    const castId = (await q<{ id: string }>(`select c.id from public.casts c where c.store_id = $1 and c.user_id = $2`, [st?.id, castU?.id]))[0]?.id;
    check("gu(9-0) fixture: A1／cast-a1a／owner-a／manager-a1／staff-a1", !!st && !!castU && !!castId && !!ownerA && !!mgrA && !!staffU);
    const snap = async () => JSON.stringify((await q(`select (select count(*)::int from public.cast_plan where cast_id = $1) cp, (select count(*)::int from public.comp_plans where store_id = $2) pl, (select count(*)::int from public.audit_logs where org_id = $3) au`, [castId, st.id, st.org_id]))[0]);
    const before = await snap();
    const today = (await q<{ d: string }>(`select current_date::text d`))[0].d;
    const d = (n: number) => addDays(today, n);
    const rowsOf = async () => q<{ f: string; t: string; o: Record<string, unknown> }>(`select valid_from::text f, coalesce(valid_to::text, '∞') t, overrides_json o from public.cast_plan where cast_id = $1 order by valid_from`, [castId]);
    const tbl = (rows: { f: string; t: string; o: Record<string, unknown> }[]) => rows.map((r) => `${r.f}〜${r.t} ${JSON.stringify(r.o)}`).join(" | ");
    await db.query("begin");
    try {
      // 器: 現在行 C が無ければ tx 内で comp_plan＋cast_plan を作る（ROLLBACK で消える）
      const cur0 = (await q<{ id: string }>(`select id from public.cast_plan where cast_id = $1 and valid_to is null`, [castId]))[0];
      if (!cur0) {
        let plan = (await q<{ id: string }>(`select id from public.comp_plans where store_id = $1 and is_active order by created_at limit 1`, [st.id]))[0]?.id;
        if (!plan) plan = (await q<{ id: string }>(`insert into public.comp_plans (org_id, store_id, name, base) values ($1, $2, 'NOX-VERIFY-gu', 3000) returning id`, [st.org_id, st.id]))[0].id;
        await db.query(`delete from public.cast_plan where cast_id = $1`, [castId]);
        await db.query(`insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json, valid_from) values ($1, $2, $3, $4, '{"honBack": 4500}'::jsonb, $5)`, [castId, st.org_id, st.id, plan, d(-30)]);
      }
      const base0 = await rowsOf();
      await asUid(ownerA.auth_user_id);
      const g1 = await call(`select public.set_cast_guarantee($1, 5000, $2, $3)`, [castId, d(1), d(14)]);
      await asPg();
      const r1 = await rowsOf();
      check("gu(9-1) ★(a) 明日から 14 日→行 +2（C に valid_to・保証行 base 5000 guarantee true・戻し行）・valid_to null は 1 本", g1.ok && r1.length === base0.length + 2 && r1.filter((r) => r.t === "∞").length === 1 && r1.some((r) => r.f === d(1) && r.t === d(14) && r.o.base === 5000 && r.o.guarantee === true) && r1.some((r) => r.f === d(15) && r.t === "∞" && !("guarantee" in r.o)), g1.ok ? tbl(r1) : g1.err);
      await asUid(ownerA.auth_user_id);
      const gx = await call(`select public.set_cast_guarantee($1, 6000, $2, $3)`, [castId, d(3), d(10)]);
      check("gu(9-2) ★期間中に別の保証（重なり）→'guarantee exists'（289-6 ①）", !gx.ok && gx.err === "guarantee exists", errOf(gx));
      const g2 = await call(`select public.set_cast_guarantee($1, 5500, $2, $3)`, [castId, d(15), d(30)]);
      await asPg();
      const r2 = await rowsOf();
      const back2 = r2.find((r) => r.t === "∞");
      check("gu(9-3) ★延長＝保証行の終了翌日から呼ぶ→戻し行が保証行（5500・〜+30）に書き換わり・新しい戻し行は base なし（元の非保証に戻る）", g2.ok && r2.some((r) => r.f === d(15) && r.t === d(30) && r.o.base === 5500 && r.o.guarantee === true) && !!back2 && back2.f === d(31) && !("guarantee" in back2.o) && back2.o.base === base0[base0.length - 1].o.base, g2.ok ? tbl(r2) : g2.err);
      // (b) C.valid_from と同日: 保証を消して C を今日始まりに戻す（tx 内の器の付け替え）
      await db.query(`delete from public.cast_plan where cast_id = $1 and valid_from >= $2`, [castId, d(1)]);
      await db.query(`update public.cast_plan set valid_to = null, valid_from = current_date where cast_id = $1 and valid_to = $2`, [castId, d(0)]);
      await asUid(ownerA.auth_user_id);
      const g3 = await call(`select public.set_cast_guarantee($1, 4800, current_date, $2)`, [castId, d(7)]);
      await asPg();
      const r3 = await rowsOf();
      check("gu(9-4) ★(b) C.valid_from と同日開始→C が保証行に書き換わり（valid_to=+7・base 4800）・戻し行 1 本（+8〜∞）", g3.ok && r3.some((r) => r.f === today && r.t === d(7) && r.o.base === 4800 && r.o.guarantee === true) && r3.filter((r) => r.t === "∞").length === 1 && r3.find((r) => r.t === "∞")?.f === d(8), g3.ok ? tbl(r3) : g3.err);
      await asUid(ownerA.auth_user_id);
      const e1 = await call(`select public.set_cast_guarantee($1, 0, $2, $3)`, [castId, d(20), d(25)]);
      const e2 = await call(`select public.set_cast_guarantee($1, 5000, $2, $3)`, [castId, d(-1), d(25)]);
      const e3 = await call(`select public.set_cast_guarantee($1, 5000, $2, $3)`, [castId, d(25), d(20)]);
      check("gu(9-5) 'bad amount'／'bad valid_from'（過去日）／'bad valid_to'", !e1.ok && e1.err === "bad amount" && !e2.ok && e2.err === "bad valid_from" && !e3.ok && e3.err === "bad valid_to", `${errOf(e1)} / ${errOf(e2)} / ${errOf(e3)}`);
      await asPg(); await asUid(mgrA.auth_user_id);
      const m1 = await call(`select public.set_cast_guarantee($1, 5000, $2, $3)`, [castId, d(40), d(45)]);
      await asPg(); await asUid(staffU.auth_user_id);
      const m2 = await call(`select public.set_cast_guarantee($1, 5000, $2, $3)`, [castId, d(40), d(45)]);
      await asPg(); await asUid(castU.auth_user_id);
      const m3 = await call(`select public.set_cast_guarantee($1, 5000, $2, $3)`, [castId, d(40), d(45)]);
      await asPg(); await asAnon();
      const m4 = await call(`select public.set_cast_guarantee($1, 5000, $2, $3)`, [castId, d(40), d(45)]);
      await asPg();
      check("gu(9-6) ★manager（自店）は可・staff／cast は forbidden・anon は permission denied", m1.ok && !m2.ok && m2.err === "forbidden" && !m3.ok && m3.err === "forbidden" && !m4.ok && /permission denied/.test(m4.err), `${errOf(m1)} / ${errOf(m2)} / ${errOf(m3)} / ${errOf(m4)}`);
      const before7 = tbl(await rowsOf());
      await asUid(ownerA.auth_user_id);
      const g7 = await call(`select public.set_cast_guarantee($1, 5200, $2, $3)`, [castId, d(13), d(22)]);
      await asPg();
      const after7 = tbl(await rowsOf());
      check("gu(9-7) ★既存の予定保証（+40〜+45）より前の +13〜+22 を設定→'guarantee exists'（289-6 ②）・行不変", !g7.ok && g7.err === "guarantee exists" && before7 === after7, `${errOf(g7)} / 行不変=${before7 === after7}`);
      await asPg();
      await db.query(`delete from public.cast_plan where cast_id = $1`, [castId]);
      await asUid(ownerA.auth_user_id);
      const np = await call(`select public.set_cast_guarantee($1, 5000, $2, $3)`, [castId, d(1), d(5)]);
      check("gu(9-8) ★現在行 C が無いキャストは 'no plan'（289-3）", !np.ok && np.err === "no plan", errOf(np));
      await asPg();
      const au = (await q<{ n: number }>(`select count(*)::int n from public.audit_logs where org_id = $1 and action = 'set_cast_guarantee'`, [st.org_id]))[0].n;
      check("gu(9-9) audit: set_cast_guarantee が成功回数分（(a)・延長・(b)・manager＝4 行）", au === 4, `got ${au}`);
    } finally {
      await db.query("rollback");
    }
    const after = await snap();
    check("gu(9-10) ROLLBACK 後の残留＝実行前と同値（cast_plan／comp_plans／org A audit）", after === before, `${before} → ${after}`);
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
  console.log(`verify:nox-cast-guarantee OK (${pass} checks)`);
}).catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
