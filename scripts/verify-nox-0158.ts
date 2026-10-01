/*
 * verify:nox-0158 — mig0158（裁定312／315／316／317／319＋追補1・314 列・起票87・2026-09-29）: 繰り下げ（settle_period／deduct_period）・確定後の打刻修正の要対応・
 *   確定ガード（期間終了の翌営業日から）・送りベース額の白名単・レジ端末／打刻端末の読取・送り実費の本人発行／打刻端末発行・キープの明細行ひも付け。
 *   npm run verify:nox-0158（env: SUPABASE_DB_URL・seed:f0 済み）。f0 80 段目。Postgres 直結の 1 トランザクション内で JWT を emulate（fixtures-pgtx）→ 最後に ROLLBACK＝残留 0
 *   （fixture は自前＝tx 内で作り、ROLLBACK で消す。店設定・payroll_runs・advances・daily_pays・punches・punch_corrections・payroll_attentions・transport・kiosk 端末／セッション・
 *   cast_pin・seats・products・checks・bottle_keeps・audit はすべて tx 内）。
 *   手貼り前の突合（docs/tmp/q0929_ag_0158.mjs・51 段 NG 0・便 Z-3／Z-2b）の 51 段を、適用後の live に対する段として移植（便 AA-3 (3)）。
 *   適用前にしか成り立たない 7 段（s-1〜s-5・r-1・r-2）は同じ番号のまま「適用後の静的確認」「ROLLBACK 後の不変」に読み替えた。
 *
 *  (s) 収蔵 mig の sha256＝貼付版・不触 12 本の md5・新設 5 本／新表の存在・関数 288・単一トランザクション
 *  (m) 改稿 11 本＋新設 5 本の md5・proacl・署名・列・RLS／policy／grant
 *  (1) 裁定312: 支払済み期の前借り・日払いは翌月へ繰り下げ（翌月も支払済みなら 'paid period'）・daily_pays_of_run は settle_period で集計
 *  (2) 裁定315: 確定済み・支払済み期の打刻修正は通り、payroll_attentions に 1 行・一覧／解決の権限と監査
 *  (3) 裁定316: payroll_finalize は期末 < 今日の営業日 のときだけ通る（境界・リプレイ・ACL）
 *  (4) 裁定317: set_store_profile の okuri_base_amount（0〜99999 の整数）
 *  (5) 起票87: kiosk_register_state に okuri_mode／okuri_base_amount
 *  (6) 裁定319: transport_issue_self／kiosk_transport_issue（金額はサーバ側・idem＝打刻・10 分・支払済み期は拒否）
 *  (8) 裁定319 追補1: kiosk_punch_state（打刻端末のみ・2 キー）
 *  (7) 裁定314: bottle_keep_register の p_check_line_id・FK on delete set null
 *  (t) mig 末尾の検証 8 文　(r) ROLLBACK 後の md5／署名／proacl と行数の不変
 *  ★次の mig で関数・表の総数（288／79）や対象 16 本の md5 が変わったら、この suite の控えを同じ便で張り替える（grants／billing の pin と同列）。
 *  逆テスト（手動・1 回）: EXPECTED.adv_issue の先頭 1 文字を変える→0158(m-1) 赤・戻して緑。
 */
import { Client } from "pg";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { loadEnvOrExit } from "./fixtures-f0";
import { pgTx, type CallResult } from "./fixtures-pgtx";

const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
let pass = 0;
const fails: string[] = [];
function check(id: string, label: string, ok: boolean, detail: unknown = "") {
  if (ok) pass++; else fails.push(`0158(${id}) ${label}: ${(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)}`);
}
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const MIG = "supabase/migrations/0158_settle_attention_okuri.sql";
const MIG_SHA256 = "7d2901359fd8fb24d075ae31da05e1e634284a48a465229b2cdd325d1fc82c6b"; // 貼付版（Agoora 手貼り 2026-09-29）
// md5（CR 除去・先頭 8 桁）＝0158 適用後の live（台帳 0158 適用欄・docs/NOX_課金ゲート対象_v1.md の控えと同値）
const EXPECTED: Record<string, string> = {
  adv_issue: "f25d845d", adv_issue_bulk: "0e2044cc", daily_pay_issue: "7e9d29d0", daily_pays_of_run: "b81e8659", punch_correction_request: "2588fd86", punch_correction_decide: "e5dc188e",
  punch_correction_apply: "857dd4cf", payroll_finalize: "e402804d", set_store_profile: "4f2e9f82", kiosk_register_state: "a4426533", bottle_keep_register: "e9028559",
};
const EXPECTED_NEW: Record<string, string> = { payroll_attentions_of: "3721bf4e", payroll_attention_resolve: "01b27881", transport_issue_self: "2eebb64f", kiosk_transport_issue: "08c5dbc3", kiosk_punch_state: "48300293" }; // ★0159（起票91）: kiosk_transport_issue のゲート行を v_org 形に＝76412c7e→08c5dbc3・★0161（裁定327）: payroll_attentions_of は run 未作成の open_punch を期間で拾う＝04d88b37→3721bf4e
const UNTOUCHED: Record<string, string> = {
  payroll_mark_paid: "409c9770", payroll_reopen: "80f042e4", transport_issue_bulk: "9d10c990", transport_issue: "7740e3c4", kiosk_punch: "5a1d5f10", punch_self: "952f18a4",   // ★0161: 打刻 3 本は順序検査 1 行（kiosk_punch b31ff8fa→5a1d5f10・punch_self f2c9b923→952f18a4）
  punch_proxy: "a760e1a4", okuri_today_summary: "e61e5dd9", okuri_default_of: "434e69d9", biz_date_of: "196c453f", period_bounds: "96e10e9a", audit_log_write: "182eba3a",   // ★0161: punch_proxy 83f2a99f→a760e1a4
};
const TOUCH = Object.keys(EXPECTED), NEW = Object.keys(EXPECTED_NEW), CTRL = Object.keys(UNTOUCHED);

async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 180000 });
  await db.connect();
  const T = pgTx(db);
  const q = (s: string, p: unknown[] = []) => T.q<Row>(s, p);
  const one = (s: string, p: unknown[] = []) => T.one<Row>(s, p);
  const rowsOf = (r: CallResult): Row[] => (r.ok ? (r.rows as Row[]) : []);
  const err = T.errOf;
  const has = (r: CallResult, w: string) => !r.ok && r.err.includes(w);
  const as = T.as;
  const pg = async (s: string, p: unknown[] = []) => { await T.asPg(); return T.call(s, p); };
  const md5s = (names: string[]) => q("select proname p, left(md5(replace(prosrc, E'\\r', '')), 8) m, pg_get_function_identity_arguments(oid) a, pg_get_function_result(oid) rt, provolatile v, proacl::text acl from pg_proc where pronamespace='public'::regnamespace and proname = any($1) order by proname", [names]);
  try {
    const raw = fs.readFileSync(MIG);
    const sql = raw.toString("utf8").replace(/\r\n/g, "\n");
    const j = sql.lastIndexOf("\ncommit;\n");
    const bodySql = sql.slice(sql.indexOf("\nbegin;\n"), j);
    const tail = sql.slice(j + "\ncommit;\n".length);

    const before = await md5s([...TOUCH, ...NEW, ...CTRL]);
    const live0: Record<string, Row> = Object.fromEntries(before.map((r) => [r.p, r]));
    const A1 = await T.storeA1();
    const owner = await T.uidOf("ownerA"), mgr = await T.uidOf("managerA1"), castU = await T.uidOf("castA1a"), castU2 = await T.uidOf("castA1b"), mgrB = await T.uidOf("managerB1");
    const castA = await T.castOf(A1.id, castU.id), castB = await T.castOf(A1.id, castU2.id);
    const mgrMid = (await one("select id from public.memberships where user_id=$1 and store_id=$2 and is_active", [mgr.id, A1.id]))?.id as string | undefined;
    if (!castA || !castB || !mgrMid || !owner || !mgrB) throw new Error("fixture 解決失敗（seed:f0 を確認）");
    const snapSql = `select (select count(*)::int from public.advances) adv, (select count(*)::int from public.daily_pays) dp, (select count(*)::int from public.transport) tr, (select count(*)::int from public.punches) pu,
      (select count(*)::int from public.punches where okuri) puo, (select count(*)::int from public.punch_corrections) pc, (select count(*)::int from public.payroll_runs) runs, (select count(*)::int from public.payslips) ps,
      (select count(*)::int from public.payroll_attentions) att, (select count(*)::int from public.bottle_keeps) bk, (select count(*)::int from public.kiosk_devices) kd, (select count(*)::int from public.cast_pin) cp,
      (select count(*)::int from public.cast_tax_profiles) tp, (select count(*)::int from public.checks) ch, (select count(*)::int from public.seats) se, (select count(*)::int from public.products) pr,
      (select count(*)::int from public.audit_logs) au, (select settings_json::text from public.stores where id=$1) a1`;
    const snapBefore = JSON.stringify(await one(snapSql, [A1.id]));

    // ── (s) 静的（適用後）──
    check("s-1", "収蔵した mig の sha256＝貼付版（手貼りした本文と repo の本文が同じ）", createHash("sha256").update(raw).digest("hex") === MIG_SHA256, createHash("sha256").update(raw).digest("hex"));
    check("s-2", "不触 12 本の live md5＝控え", CTRL.every((n) => live0[n]?.m === UNTOUCHED[n]), CTRL.map((n) => `${n}:${live0[n]?.m}/${UNTOUCHED[n]}`).join(" "));
    const fnCount0 = (await one("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace")).n as number;
    check("s-3", "新設 5 本が存在・payroll_attentions が存在・関数 297（★0159 で +2・★0160 で +7−1・★0161 で +1）", NEW.every((n) => !!live0[n]) && (await one("select to_regclass('public.payroll_attentions')::text r")).r !== null && fnCount0 === 297, `fn ${fnCount0}`);
    const colsOf = async (): Promise<Record<string, number>> => Object.fromEntries((await q("select table_name t, count(*)::int n from information_schema.columns where table_schema='public' and table_name in ('daily_pays','bottle_keeps','advances','transport','payroll_attentions') group by 1")).map((r) => [r.t, r.n]));
    const c0 = await colsOf();
    check("s-4", "0158 が列を足していない表は不変: advances 16 列・transport 15 列", c0.advances === 16 && c0.transport === 15, c0);
    check("s-5", "単一トランザクション（begin／commit 各 1）・本体に 'period finalized' の raise なし・'period not ended' あり", (sql.match(/^begin;$/gm) ?? []).length === 1 && (sql.match(/^commit;$/gm) ?? []).length === 1 && !/raise exception 'period finalized'/.test(bodySql) && /raise exception 'period not ended'/.test(bodySql));

    // ── (m) md5／署名／proacl／列 ──
    check("m-1", "改稿 11 本の md5＝控え（各 1 定義）", TOUCH.every((n) => live0[n]?.m === EXPECTED[n]) && before.filter((r) => TOUCH.includes(r.p)).length === 11, TOUCH.map((n) => `${n}:${live0[n]?.m}/${EXPECTED[n]}`).join(" "));
    check("m-2", "新設 5 本の md5＝控え", NEW.every((n) => live0[n]?.m === EXPECTED_NEW[n]), NEW.map((n) => `${n}:${live0[n]?.m}/${EXPECTED_NEW[n]}`).join(" "));
    check("m-3", "対象 28 本（改稿 11＋新設 5＋不触 12）は各 1 定義（同名の多重定義なし）", before.length === 28, String(before.length));
    const AUTHED = "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}";
    check("m-4", "proacl: 新設 5 本＋公開 9 本＝authenticated+service_role・punch_correction_apply＝postgres のみ・payroll_finalize＝service_role のみ・anon なし",
      [...NEW, ...TOUCH.filter((n) => !["punch_correction_apply", "payroll_finalize"].includes(n))].every((n) => live0[n]?.acl === AUTHED) && live0.punch_correction_apply?.acl === "{postgres=X/postgres}"
      && live0.payroll_finalize?.acl === "{postgres=X/postgres,service_role=X/postgres}" && before.every((r) => !/anon/.test(r.acl ?? "")), before.filter((r) => [...NEW, ...TOUCH].includes(r.p)).map((r) => `${r.p}:${r.acl}`).join(" "));
    check("m-5", "署名・揮発性: payroll_attentions_of(p_run_id uuid) TABLE 8 列 STABLE／resolve(p_id uuid, p_reason text) uuid／transport_issue_self(p_punch_id uuid) uuid／kiosk_transport_issue(p_punch_id uuid) uuid／kiosk_punch_state() jsonb STABLE",
      live0.payroll_attentions_of.a === "p_run_id uuid" && live0.payroll_attentions_of.v === "s" && (String(live0.payroll_attentions_of.rt).match(/,/g) ?? []).length === 7
      && live0.payroll_attention_resolve.a === "p_id uuid, p_reason text" && live0.payroll_attention_resolve.rt === "uuid" && live0.transport_issue_self.a === "p_punch_id uuid" && live0.transport_issue_self.rt === "uuid"
      && live0.kiosk_transport_issue.a === "p_punch_id uuid" && live0.kiosk_transport_issue.rt === "uuid" && live0.kiosk_punch_state.a === "" && live0.kiosk_punch_state.rt === "jsonb" && live0.kiosk_punch_state.v === "s",
      NEW.map((n) => [n, live0[n].a, String(live0[n].rt).slice(0, 40), live0[n].v]));
    const nn1 = (await one("select is_nullable n from information_schema.columns where table_schema='public' and table_name='transport' and column_name='created_by'")).n;
    check("m-6", "列・表: daily_pays 13（+settle_period）・bottle_keeps 16（+check_line_id）・payroll_attentions 10 列・transport.created_by null 可", c0.daily_pays === 13 && c0.bottle_keeps === 16 && c0.payroll_attentions === 10 && nn1 === "YES", { c0, nn1 });
    const pols = await q("select tablename, policyname, cmd, roles::text r from pg_policies where schemaname='public' and tablename='payroll_attentions'");
    const grants = await q("select grantee, string_agg(privilege_type, ',' order by privilege_type) pr from information_schema.role_table_grants where table_schema='public' and table_name='payroll_attentions' and grantee in ('anon','authenticated','PUBLIC') group by 1");
    const rls = (await one("select relrowsecurity r from pg_class where oid='public.payroll_attentions'::regclass")).r;
    check("m-7", "payroll_attentions: RLS 有効・policy 1（select）・grant authenticated=SELECT のみ・anon なし", rls === true && pols.length === 1 && pols[0].cmd === "SELECT" && grants.length === 1 && grants[0].grantee === "authenticated" && grants[0].pr === "SELECT", { rls, pols, grants });

    await db.query("begin");
    try {
      // ── fixture（postgres・tx 内）──
      const bizToday = (await one("select public.biz_date_of($1, now())::text d", [A1.id])).d as string;
      const curP = bizToday.slice(0, 7);
      // 他 suite・実機の残りに依存しない（tx 内で片付ける＝ROLLBACK で戻る）
      await q("delete from public.payroll_attentions where store_id=$1", [A1.id]);
      await q("update public.punches set okuri = false where store_id=$1 and okuri", [A1.id]);
      /** 期の run を用意する（あれば status だけ合わせる・無ければ作る） */
      const runOf = async (period: string, status: string): Promise<string> => {
        const ex = await one("select id from public.payroll_runs where store_id=$1 and period=$2", [A1.id, period]);
        if (ex) { await q("update public.payroll_runs set status=$2 where id=$1", [ex.id, status]); return ex.id as string; }
        return (await one("insert into public.payroll_runs (org_id, store_id, period, status, created_by) values ($1,$2,$3,$4,$5) returning id", [A1.org_id, A1.id, period, status, owner.id])).id as string;
      };
      await q("update public.stores set settings_json = jsonb_set(coalesce(settings_json,'{}'::jsonb), '{okuri_mode}', '\"actual\"'::jsonb, true) - 'okuri_base_amount' where id=$1", [A1.id]);
      await q("delete from public.cast_tax_profiles where cast_id=$1", [castA]);
      const R03 = await runOf("2031-03", "paid");    // 支払済み（★1 の当月・★2 の確定後）
      const R04 = await runOf("2031-04", "draft");   // 翌月（draft）

      // ── ★1 裁定312 ──
      const a1 = await as(mgr, "select public.adv_issue($1,$2,5000,'2031-03-15',null) id", [A1.id, castA]);
      const a1id = rowsOf(a1)[0]?.id as string | undefined;
      const a1row = a1id ? await one("select deduct_period, advanced_on::text d, status from public.advances where id=$1", [a1id]) : null;
      const a1au = a1id ? await one("select after_json from public.audit_logs where action='adv_issue' and target=$1", [`advances:${a1id}`]) : null;
      check("1-1", "★paid 期（2031-03）に adv_issue → 発行可・deduct_period＝翌月 2031-04・audit に carried_to・戻りは uuid のまま", a1.ok && a1row?.deduct_period === "2031-04" && a1row?.d === "2031-03-15" && a1row?.status === "open" && a1au?.after_json?.carried_to === "2031-04" && /^[0-9a-f-]{36}$/.test(a1id ?? ""), err(a1) + JSON.stringify(a1row));
      const ab = await as(mgr, "select public.adv_issue_bulk($1,$2::jsonb,gen_random_uuid()) ids", [A1.id, JSON.stringify([{ cast_id: castA, amount: 3000, date: "2031-03-20" }, { cast_id: castB, amount: 2000, date: "2031-04-02" }])]);
      const abRows = ab.ok ? await q("select cast_id, deduct_period, advanced_on::text d from public.advances where id = any($1) order by advanced_on", [rowsOf(ab)[0].ids]) : [];
      check("1-2", "adv_issue_bulk: paid 期の件は deduct_period＝2031-04・draft 期の件は null（件ごとに判定）", ab.ok && abRows.length === 2 && abRows[0].deduct_period === "2031-04" && abRows[1].deduct_period === null, err(ab) + JSON.stringify(abRows));
      const idem1 = (await one("select gen_random_uuid() u")).u;
      const d1 = await as(mgr, "select public.daily_pay_issue($1,'2031-03-15',10000,$2) r", [castA, idem1]);
      const d1r: Row = rowsOf(d1)[0]?.r ?? {};
      const d1row = d1.ok ? await one("select settle_period, biz_date::text d, withholding, net from public.daily_pays where id=$1", [d1r.id]) : null;
      check("1-3", "★paid 期に daily_pay_issue → settle_period＝2031-04・戻り jsonb に settle_period／carried_to＝2031-04・源泉 510 は不変", d1.ok && d1r.settle_period === "2031-04" && d1r.carried_to === "2031-04" && d1r.replay === false && d1row?.settle_period === "2031-04" && d1row?.withholding === 510 && d1row?.net === 9490, err(d1) + JSON.stringify([d1r, d1row]));
      const d1b = await as(mgr, "select public.daily_pay_issue($1,'2031-03-15',10000,$2) r", [castA, idem1]);
      const d1br: Row = rowsOf(d1b)[0]?.r ?? {};
      check("1-4", "同キー再送: replay true・同じ id・carried_to＝2031-04（行は 1 のまま）", d1b.ok && d1br.replay === true && d1br.id === d1r.id && d1br.carried_to === "2031-04" && (await one("select count(*)::int n from public.daily_pays where idem_key=$1", [idem1])).n === 1, err(d1b) + JSON.stringify(d1br));
      const d2 = await as(mgr, "select public.daily_pay_issue($1,'2031-04-05',8000,gen_random_uuid()) r", [castA]);
      const d2r: Row = rowsOf(d2)[0]?.r ?? {};
      check("1-5", "支払済みでない期（2031-04）の日払い: settle_period＝2031-04・carried_to null", d2.ok && d2r.settle_period === "2031-04" && d2r.carried_to === null, err(d2) + JSON.stringify(d2r));
      const of04 = await as(mgr, "select * from public.daily_pays_of_run($1)", [R04]);
      const of03 = await as(mgr, "select * from public.daily_pays_of_run($1)", [R03]);
      const o4 = rowsOf(of04);
      check("1-6", "★daily_pays_of_run は settle_period で集計: 2031-04 の run＝castA 2 件 18,000・源泉 816／2031-03 の run＝0 行（繰り下げた分は当月に出ない）",
        of04.ok && o4.length === 1 && o4[0].cast_id === castA && o4[0].paid_total === 18000 && o4[0].withholding_total === 510 + 306 && o4[0].n === 2 && of03.ok && rowsOf(of03).length === 0, err(of04) + JSON.stringify([o4, rowsOf(of03)]));
      await q("insert into public.daily_pays (org_id, store_id, cast_id, biz_date, gross, withholding, withholding_category, net, paid_by, idem_key) values ($1,$2,$3,'2031-04-10',5000,0,'委託',5000,$4,gen_random_uuid())", [A1.org_id, A1.id, castB, mgr.id]);
      const of04b = await as(owner, "select * from public.daily_pays_of_run($1) order by paid_total", [R04]);
      check("1-7", "settle_period null の行（直 insert）は biz_date の月に帰属＝2031-04 の run に castB 5,000 が乗る", of04b.ok && rowsOf(of04b).length === 2 && rowsOf(of04b).some((r) => r.cast_id === castB && r.paid_total === 5000), err(of04b) + JSON.stringify(rowsOf(of04b)));
      await q("update public.payroll_runs set status='paid' where id=$1", [R04]);
      const a2 = await as(mgr, "select public.adv_issue($1,$2,5000,'2031-03-16',null) id", [A1.id, castA]);
      const d3 = await as(mgr, "select public.daily_pay_issue($1,'2031-03-16',10000,gen_random_uuid()) r", [castA]);
      const ab2 = await as(mgr, "select public.adv_issue_bulk($1,$2::jsonb,gen_random_uuid()) ids", [A1.id, JSON.stringify([{ cast_id: castA, amount: 3000, date: "2031-03-21" }])]);
      check("1-8", "★翌月も paid → adv_issue／adv_issue_bulk／daily_pay_issue とも raise 'paid period'", has(a2, "paid period") && has(d3, "paid period") && has(ab2, "paid period"), [err(a2), err(d3), err(ab2)].join(" / "));
      const d4 = await as(castU, "select public.daily_pay_issue($1,'2031-05-01',10000,gen_random_uuid()) r", [castA]);
      const a3 = await as(castU, "select public.adv_issue($1,$2,5000,'2031-05-01',null) id", [A1.id, castA]);
      check("1-9", "権限は不変: cast は adv_issue／daily_pay_issue とも forbidden", has(d4, "forbidden") && has(a3, "forbidden"), [err(d4), err(a3)].join(" / "));
      await q("update public.payroll_runs set status='draft' where id=$1", [R04]);

      // ── ★2 裁定315 ──
      const attN = async () => (await one("select count(*)::int n from public.payroll_attentions where store_id=$1", [A1.id])).n as number;
      const attRows = () => q("select run_id, cast_id, kind, detail, resolved_at from public.payroll_attentions where store_id=$1 order by created_at, id", [A1.id]);
      const at0 = await attN();
      const pc1 = await as(mgr, "select public.punch_correction_request($1,null,'2031-03-10','in','2031-03-10T20:00:00+09:00','確定後の修正') id", [castA]);
      const pc1id = rowsOf(pc1)[0]?.id ?? null;
      const pc1row = pc1id ? await one("select decision, punch_id from public.punch_corrections where id=$1", [pc1id]) : null;
      const at1 = await attRows();
      check("2-1", "★支払済み期（2031-03）の打刻修正（manager＝申請＝確定）: 'period finalized' で拒否されず apply 成功・punches に反映・attentions 1 行（run＝2031-03・kind post_finalize_punch・detail に after／punch_id／correction_id）",
        pc1.ok && pc1row?.decision === "approved" && !!pc1row?.punch_id && at0 === 0 && at1.length === 1 && at1[0].run_id === R03 && at1[0].cast_id === castA && at1[0].kind === "post_finalize_punch"
        && at1[0].detail.before === null && !!at1[0].detail.after && at1[0].detail.punch_id === pc1row.punch_id && at1[0].detail.correction_id === pc1id && at1[0].detail.biz_date === "2031-03-10" && at1[0].detail.punch_kind === "in" && at1[0].resolved_at === null, err(pc1) + JSON.stringify(at1));
      const pc2 = await as(castU, "select public.punch_correction_request($1,null,'2031-03-11','out','2031-03-12T02:00:00+09:00','打刻忘れ') id", [castA]);
      const pc2id = rowsOf(pc2)[0]?.id ?? null;
      const atMid = await attN();
      const dcd = await as(mgr, "select public.punch_correction_decide($1,true,null) id", [pc2id]);
      const at2 = await attRows();
      check("2-2", "cast 本人の申請（pending）は attentions を増やさない → manager の承認で +1（計 2）・'period finalized' なし", pc2.ok && atMid === 1 && dcd.ok && at2.length === 2 && at2.some((r) => r.detail.correction_id === pc2id && r.detail.punch_kind === "out"), [err(pc2), err(dcd)].join(" / ") + JSON.stringify(at2));
      const pc3 = await as(mgr, "select public.punch_correction_request($1,null,'2031-04-03','in','2031-04-03T20:00:00+09:00','draft 期') id", [castA]);
      const pc4 = await as(mgr, "select public.punch_correction_request($1,null,'2031-06-03','in','2031-06-03T20:00:00+09:00','run なし') id", [castA]);
      check("2-3", "draft の期・run の無い期の打刻修正は attentions を増やさない（計 2 のまま）", pc3.ok && pc4.ok && (await attN()) === 2, [err(pc3), err(pc4)].join(" / "));
      const upd = await as(mgr, "select public.punch_correction_request($1,$2,'2031-03-10','in','2031-03-10T20:30:00+09:00','時刻の訂正') id", [castA, pc1row?.punch_id]);
      const at3 = await attRows();
      check("2-4", "既存打刻の update（確定後）: detail.before／after の両方が入る（計 3）", upd.ok && at3.length === 3 && at3.some((r) => !!r.detail.before && !!r.detail.after && r.detail.punch_id === pc1row?.punch_id), err(upd) + JSON.stringify(at3.map((r) => r.detail)));
      const ofM = await as(mgr, "select id, cast_id, cast_name, kind, resolved_at from public.payroll_attentions_of($1)", [R03]);
      const ofO = await as(owner, "select id from public.payroll_attentions_of($1)", [R03]);
      const ofC = await as(castU, "select id from public.payroll_attentions_of($1)", [R03]);
      const ofB = await as(mgrB, "select id from public.payroll_attentions_of($1)", [R03]);
      check("2-5", "payroll_attentions_of: manager／owner＝3 行（cast_name つき）・cast forbidden・他 org の manager forbidden", ofM.ok && rowsOf(ofM).length === 3 && rowsOf(ofM).every((r) => !!r.cast_name) && ofO.ok && rowsOf(ofO).length === 3 && has(ofC, "forbidden") && has(ofB, "forbidden"), [err(ofM), err(ofC), err(ofB)].join(" / "));
      const selC = await as(castU, "select count(*)::int n from public.payroll_attentions where store_id=$1", [A1.id]);
      const selM = await as(mgr, "select count(*)::int n from public.payroll_attentions where store_id=$1", [A1.id]);
      const insM = await as(mgr, "insert into public.payroll_attentions (org_id, store_id, cast_id, run_id, kind) values ($1,$2,$3,$4,'post_finalize_punch')", [A1.org_id, A1.id, castA, R03]);
      check("2-6", "RLS／grant: cast の直 SELECT＝0 行・manager＝3 行・authenticated の直 INSERT は permission denied", selC.ok && rowsOf(selC)[0].n === 0 && selM.ok && rowsOf(selM)[0].n === 3 && has(insM, "permission denied"), [JSON.stringify(rowsOf(selC)), JSON.stringify(rowsOf(selM)), err(insM)].join(" / "));
      const tgt = rowsOf(ofM)[0]?.id ?? null;
      const auN = async () => (await one("select count(*)::int n from public.audit_logs where action='payroll_attention_resolve' and at >= now()")).n as number;
      const au0 = await auN();
      const rs1 = await as(mgr, "select public.payroll_attention_resolve($1,'翌期の調整で対応') id", [tgt]);
      const rsRow = tgt ? await one("select resolved_at, resolved_by from public.payroll_attentions where id=$1", [tgt]) : null;
      const rsAu = await q("select reason, (before_json->>'resolved_at') b, (after_json->>'resolved_at') a from public.audit_logs where action='payroll_attention_resolve' and target=$1 and at >= now()", [`payroll_attentions:${tgt}`]);
      const rs2 = await as(mgr, "select public.payroll_attention_resolve($1,null) id", [tgt]);
      const au1 = await auN();
      const rsC = await as(castU, "select public.payroll_attention_resolve($1,null) id", [rowsOf(ofM)[1]?.id]);
      const rsB = await as(mgrB, "select public.payroll_attention_resolve($1,null) id", [rowsOf(ofM)[1]?.id]);
      const rsN = await as(mgr, "select public.payroll_attention_resolve(gen_random_uuid(),null) id");
      check("2-7", "resolve: manager＝resolved_at／resolved_by・audit 1（reason つき）・再送は同 id で audit 増えず・cast／他 org forbidden・存在しない id は not_found",
        rs1.ok && !!rsRow?.resolved_at && rsRow?.resolved_by === mgr.id && rsAu.length === 1 && rsAu[0].reason === "翌期の調整で対応" && rsAu[0].b === null && !!rsAu[0].a && rs2.ok && rowsOf(rs2)[0].id === tgt && au1 - au0 === 1
        && has(rsC, "forbidden") && has(rsB, "forbidden") && has(rsN, "not_found"), [err(rs1), err(rs2), err(rsC), err(rsB), err(rsN)].join(" / ") + JSON.stringify(rsAu));

      // ── ★3 裁定316（実在の期と衝突しないよう未来の期の run を使い、終了済みは凍結値 period_start／period_end で表す）──
      const Rfut = await runOf("2031-05", "draft");   // 凍結値なし＝period_bounds（2031-05-31）>= 今日の営業日
      const Rend = await runOf("2031-06", "draft");   // 凍結値＝今日の営業日の前月（終了済み）
      await q("update public.payroll_runs set period_start = (date_trunc('month', $2::date) - interval '1 month')::date, period_end = (date_trunc('month', $2::date) - interval '1 day')::date, finalize_idem_key = null where id=$1", [Rend, bizToday]);
      await q("update public.payroll_runs set period_start = null, period_end = null, finalize_idem_key = null where id=$1", [Rfut]);
      const psOf = (c: string) => JSON.stringify([{ cast_id: c, net: 1000, breakdown: { pay: { gross: 1000 }, extras: [] } }]);
      const f1 = await pg("select public.payroll_finalize($1,$2,$3,gen_random_uuid(),$4::jsonb) n", [A1.org_id, owner.id, Rfut, psOf(castA)]);
      check("3-1", `★終わっていない期（期末 >= 今日の営業日 ${bizToday}）の payroll_finalize → raise 'period not ended'・run は draft のまま・payslips 0`, has(f1, "period not ended") && (await one("select status from public.payroll_runs where id=$1", [Rfut])).status === "draft" && (await one("select count(*)::int n from public.payslips where run_id=$1", [Rfut])).n === 0, err(f1));
      const idemF = (await one("select gen_random_uuid() u")).u;
      const f2 = await pg("select public.payroll_finalize($1,$2,$3,$4,$5::jsonb) n", [A1.org_id, owner.id, Rend, idemF, psOf(castA)]);
      const f2b = await pg("select public.payroll_finalize($1,$2,$3,$4,$5::jsonb) n", [A1.org_id, owner.id, Rend, idemF, psOf(castA)]);
      check("3-2", "★終了した期（期末＝前月末）の payroll_finalize → 成功（1 名）・同キー再送は 1 を返す（リプレイ）", f2.ok && rowsOf(f2)[0].n === 1 && f2b.ok && rowsOf(f2b)[0].n === 1 && (await one("select status from public.payroll_runs where id=$1", [Rend])).status === "finalized", [err(f2), err(f2b)].join(" / "));
      await q("update public.payroll_runs set period_start = '2000-01-01', period_end = $2::date where id=$1", [Rend, bizToday]); // 確定が通ると凍結値は本来の月初・月末（2031-06）に上書きされる＝period_end >= period_start の CHECK を満たすよう start も置く
      await q("update public.payroll_runs set status='draft', finalize_idem_key=null where id=$1", [Rend]);
      const f3 = await pg("select public.payroll_finalize($1,$2,$3,gen_random_uuid(),$4::jsonb) n", [A1.org_id, owner.id, Rend, psOf(castA)]);
      await q("update public.payroll_runs set period_start = '2000-01-01', period_end = ($2::date - 1) where id=$1", [Rend, bizToday]);
      const f4 = await pg("select public.payroll_finalize($1,$2,$3,gen_random_uuid(),$4::jsonb) n", [A1.org_id, owner.id, Rend, psOf(castA)]);
      check("3-3", "境界: 凍結 period_end＝今日の営業日 → 'period not ended'／period_end＝今日−1（終了の翌営業日）→ 成功", has(f3, "period not ended") && f4.ok && rowsOf(f4)[0].n === 1, [err(f3), err(f4)].join(" / "));
      const f5 = await as(mgr, "select public.payroll_finalize($1,$2,$3,gen_random_uuid(),$4::jsonb) n", [A1.org_id, owner.id, Rfut, psOf(castA)]);
      check("3-4", "payroll_finalize は authenticated から permission denied のまま・payroll_mark_paid は不触（409c9770）", has(f5, "permission denied") && live0.payroll_mark_paid?.m === "409c9770", err(f5) + " " + live0.payroll_mark_paid?.m);

      // ── ★4 裁定317 ──
      const s1 = await as(owner, "select public.set_store_profile($1, '{\"okuri_base_amount\": 1500}'::jsonb)", [A1.id]);
      const s1v = await one("select settings_json->'okuri_base_amount' v, jsonb_typeof(settings_json->'okuri_base_amount') t from public.stores where id=$1", [A1.id]);
      const s1au = await q("select before_json, after_json from public.audit_logs where action='set_store_profile' and at >= now() and after_json ? 'okuri_base_amount'");
      const s2 = await as(owner, "select public.set_store_profile($1, '{\"okuri_base_amount\": 100000}'::jsonb)", [A1.id]);
      const s3 = await as(owner, "select public.set_store_profile($1, '{\"okuri_base_amount\": \"1500\"}'::jsonb)", [A1.id]);
      const s4 = await as(owner, "select public.set_store_profile($1, '{\"okuri_base_amount\": 1500.5}'::jsonb)", [A1.id]);
      const s5 = await as(owner, "select public.set_store_profile($1, '{\"okuri_base_amount\": -1}'::jsonb)", [A1.id]);
      const s6 = await as(owner, "select public.set_store_profile($1, '{\"okuri_base_amount\": 99999}'::jsonb)", [A1.id]);
      const s7 = await as(owner, "select public.set_store_profile($1, '{\"okuri_bogus\": 1}'::jsonb)", [A1.id]);
      check("4-1", "★白名単 set: okuri_base_amount 1500（number で保存・audit before 0→after 1500）・99999 可・100000／-1／小数は 'bad okuri_base_amount'・文字列は 'bad type'・白名単外のキーは拒否のまま",
        s1.ok && s1v.v === 1500 && s1v.t === "number" && s1au.length === 1 && s1au[0].before_json.okuri_base_amount === 0 && s1au[0].after_json.okuri_base_amount === 1500
        && has(s2, "bad okuri_base_amount") && has(s3, "bad type") && has(s4, "bad okuri_base_amount") && has(s5, "bad okuri_base_amount") && s6.ok && !s7.ok, [err(s1), err(s2), err(s3), err(s4), err(s5), err(s6), err(s7)].join(" / ") + JSON.stringify(s1au));
      const s8 = await as(mgr, "select public.set_store_profile($1, '{\"okuri_base_amount\": 1500}'::jsonb)", [A1.id]);
      await as(owner, "select public.set_store_profile($1, '{\"okuri_base_amount\": 1500}'::jsonb)", [A1.id]);
      check("4-2", "権限は不変: manager の set_store_profile は従来どおりの判定（拒否するなら forbidden）", s8.ok || /forbidden/.test(err(s8)), err(s8));

      // ── ★5 起票87 ──
      const regUid = (await one("select gen_random_uuid() u")).u as string;
      const dev = (await one("insert into public.kiosk_devices (org_id, store_id, auth_user_id, label, is_active, purpose) values ($1,$2,$3,'v0158-register',true,'register') returning id", [A1.org_id, A1.id, regUid])).id;
      await q("insert into public.kiosk_sessions (org_id, store_id, device_id, membership_id, operator_user_id) values ($1,$2,$3,$4,$5)", [A1.org_id, A1.id, dev, mgrMid, mgr.id]);
      const k1 = await as({ auth_user_id: regUid }, "select public.kiosk_register_state() s");
      const k1s: Row = rowsOf(k1)[0]?.s ?? {};
      await q("update public.stores set settings_json = settings_json - 'okuri_mode' - 'okuri_base_amount' where id=$1", [A1.id]);
      const k2 = await as({ auth_user_id: regUid }, "select public.kiosk_register_state() s");
      const k2s: Row = rowsOf(k2)[0]?.s ?? {};
      await q("update public.stores set settings_json = jsonb_set(jsonb_set(settings_json, '{okuri_mode}', '\"actual\"'::jsonb, true), '{okuri_base_amount}', '1500'::jsonb, true) where id=$1", [A1.id]);
      const k3 = await as(mgr, "select public.kiosk_register_state() s");
      check("5-1", "★kiosk_register_state: okuri_mode 'actual'・okuri_base_amount 1500／未設定は 'flat'・null／ar_enabled・seats・products・casts・checks のキーは残る（計 8 キー）・kiosk 以外は forbidden",
        k1.ok && k1s.okuri_mode === "actual" && k1s.okuri_base_amount === 1500 && k2.ok && k2s.okuri_mode === "flat" && k2s.okuri_base_amount === null
        && JSON.stringify(Object.keys(k1s).sort()) === JSON.stringify(["ar_enabled", "casts", "categories", "checks", "okuri_base_amount", "okuri_mode", "products", "seats"]) && Array.isArray(k1s.seats) && has(k3, "forbidden"), [err(k1), err(k3)].join(" / ") + JSON.stringify(Object.keys(k1s)));

      // ── ★6 裁定319 ──
      const Rcur = await runOf(curP, "draft");
      // ★0161（裁定327）: 打刻は順序検査つき＝out は当日営業日に未閉鎖の in が要る・同一営業日の再出勤は RPC では 'already out'。
      //   当日の状態を tx 内で空にし、out の前に in を置く。2 度目以降の out は直 insert の in で開き直す（reopen）。okuri の意味と summary の件数は不変。
      await q("delete from public.punches where cast_id = any($1) and punched_at >= now() - interval '2 days'", [[castA, castB]]);
      // ★教訓98（便 M4 の f0 run2 で赤）: 同一 tx 内は now() が固定＝直 insert の in と RPC の out が同時刻になり「最終打刻」の順序が不定→'no open punch'。reopen は clock_timestamp() で必ず最新にする
      const reopen = async (castId: string) => { await q("insert into public.punches (org_id, store_id, cast_id, type, source, punched_at, created_at) values ($1,$2,$3,'in','self', clock_timestamp(), clock_timestamp())", [A1.org_id, A1.id, castId]); };
      const pin0 = await as(castU, "select public.punch_self('in', null, null) id");
      const p1 = await as(castU, "select public.punch_self('out', null, null, true) id");
      const p1id = rowsOf(p1)[0]?.id ?? null;
      const auSN = async () => (await one("select count(*)::int n from public.audit_logs where action='transport_issue_self' and at >= now()")).n as number;
      const auS0 = await auSN();
      const t1 = await as(castU, "select public.transport_issue_self($1) id", [p1id]);
      const t1id = rowsOf(t1)[0]?.id ?? null;
      const t1row = t1id ? await one("select amount, cast_id, created_by, biz_date::text d, status, idem_key, (select md5($2::text || ':' || $3::text)::uuid) k from public.transport where id=$1", [t1id, p1id, castA]) : null;
      const t1b = await as(castU, "select public.transport_issue_self($1) id", [p1id]);
      const auS1 = await auSN();
      check("6-1", "★cast 本人: 自分の out 打刻（okuri=true）→ 発行 OK・金額＝店の okuri_base_amount 1500・idem＝md5(punch:cast)・biz_date＝打刻の営業日・created_by＝本人・再送は同 id（行 1・audit 1）",
        pin0.ok && p1.ok && t1.ok && t1row?.amount === 1500 && t1row?.cast_id === castA && t1row?.created_by === castU.id && t1row?.d === bizToday && t1row?.status === "open" && t1row?.idem_key === t1row?.k
        && t1b.ok && rowsOf(t1b)[0].id === t1id && auS1 - auS0 === 1 && (await one("select count(*)::int n from public.transport where idem_key=$1", [t1row?.idem_key])).n === 1, [err(p1), err(t1), err(t1b)].join(" / ") + JSON.stringify(t1row));
      const t2 = await as(castU2, "select public.transport_issue_self($1) id", [p1id]);
      const t2m = await as(mgr, "select public.transport_issue_self($1) id", [p1id]);
      const t2n = await as(castU, "select public.transport_issue_self(gen_random_uuid()) id");
      check("6-2", "★他人の打刻は forbidden・manager（cast でない）も forbidden・存在しない id も forbidden（同文言）", has(t2, "forbidden") && has(t2m, "forbidden") && has(t2n, "forbidden"), [err(t2), err(t2m), err(t2n)].join(" / "));
      // ★0161: 閉鎖済みの日に out／in を RPC で足すと 'no open punch'／'already out'＝発行側の検査（not okuri punch）を見る段なので直 insert で行を作る
      const p2 = await T.call("insert into public.punches (org_id, store_id, cast_id, type, source, okuri) values ($1,$2,$3,'out','self',false) returning id", [A1.org_id, A1.id, castA]);
      const p3 = await T.call("insert into public.punches (org_id, store_id, cast_id, type, source) values ($1,$2,$3,'in','self') returning id", [A1.org_id, A1.id, castA]);
      const t3 = await as(castU, "select public.transport_issue_self($1) id", [rowsOf(p2)[0]?.id]);
      const t4 = await as(castU, "select public.transport_issue_self($1) id", [rowsOf(p3)[0]?.id]);
      check("6-3", "okuri=false の out・in 打刻は 'not okuri punch'", has(t3, "not okuri punch") && has(t4, "not okuri punch"), [err(t3), err(t4)].join(" / "));
      await as(castU2, "select public.punch_self('in', null, null) id");   // ★0161: out の前に in
      const p4 = await as(castU2, "select public.punch_self('out', null, null, true) id");
      const p4id = rowsOf(p4)[0]?.id;
      await q("update public.stores set settings_json = settings_json - 'okuri_base_amount' where id=$1", [A1.id]);
      const t5 = await as(castU2, "select public.transport_issue_self($1) id", [p4id]);
      await q("update public.stores set settings_json = jsonb_set(settings_json, '{okuri_base_amount}', '0'::jsonb, true) where id=$1", [A1.id]);
      const t5z = await as(castU2, "select public.transport_issue_self($1) id", [p4id]);
      await q("update public.stores set settings_json = jsonb_set(jsonb_set(settings_json, '{okuri_base_amount}', '1500'::jsonb, true), '{okuri_mode}', '\"flat\"'::jsonb, true) where id=$1", [A1.id]);
      const t6 = await as(castU2, "select public.transport_issue_self($1) id", [p4id]);
      await q("update public.stores set settings_json = jsonb_set(settings_json, '{okuri_mode}', '\"actual\"'::jsonb, true) where id=$1", [A1.id]);
      check("6-4", "★base 未設定・0 は raise 'no base amount'／okuri_mode が flat は 'okuri not actual'", has(t5, "no base amount") && has(t5z, "no base amount") && has(t6, "okuri not actual"), [err(t5), err(t5z), err(t6)].join(" / "));
      const tb = await as(mgr, "select public.transport_issue_bulk($1,$2::jsonb,$3) ids", [A1.id, JSON.stringify([{ cast_id: castB, amount: 2200, date: bizToday }]), p4id]);
      const t7 = await as(castU2, "select public.transport_issue_self($1) id", [p4id]);
      const sum = await as(mgr, "select punch_id from public.okuri_today_summary($1,$2::date)", [A1.id, bizToday]);
      check("6-5", "店が先に発行済み（transport_issue_bulk・idem＝punch id・2,200 円）→ 本人の発行は同じ id を返す（二重発行なし・金額は店の入力のまま）・okuri_today_summary は未発行 0",
        tb.ok && t7.ok && rowsOf(t7)[0].id === rowsOf(tb)[0].ids[0] && (await one("select amount from public.transport where id=$1", [rowsOf(t7)[0].id])).amount === 2200 && sum.ok && rowsOf(sum).length === 0, [err(tb), err(t7), err(sum)].join(" / ") + JSON.stringify(rowsOf(sum)));
      // kiosk 腕（打刻端末）
      const kioskUid = (await one("select gen_random_uuid() u")).u as string;
      const kdev = (await one("insert into public.kiosk_devices (org_id, store_id, auth_user_id, label, is_active, purpose) values ($1,$2,$3,'v0158-punch',true,'punch') returning id", [A1.org_id, A1.id, kioskUid])).id;
      await q("delete from public.transport where cast_id = any($1) and biz_date = $2::date", [[castA, castB], bizToday]);
      const pin = await as(mgr, "select public.set_cast_pin($1, '1234') r", [castB]);
      await reopen(castB);   // ★0161
      const kp = await as({ auth_user_id: kioskUid }, "select public.kiosk_punch($1, '1234', 'out', true) r", [castB]);
      const kpid = rowsOf(kp)[0]?.r?.ok ? rowsOf(kp)[0].r.punch_id : null;
      const kt1 = await as({ auth_user_id: kioskUid }, "select public.kiosk_transport_issue($1) id", [kpid]);
      const kt1id = rowsOf(kt1)[0]?.id ?? null;
      const kt1row = kt1id ? await one("select amount, cast_id, created_by, biz_date::text d from public.transport where id=$1", [kt1id]) : null;
      const ktAu = await q("select actor_user_id, after_json from public.audit_logs where action='kiosk_transport_issue' and target=$1", [`transport:${kt1id}`]);
      const kt1b = await as({ auth_user_id: kioskUid }, "select public.kiosk_transport_issue($1) id", [kpid]);
      check("6-6", "★kiosk 腕（打刻端末）: kiosk_punch(out・okuri true) → kiosk_transport_issue OK・1,500 円・created_by＝cast の user・audit 1（actor null・kiosk_device_id・punch_id）・再送は同 id",
        pin.ok && !!kpid && kt1.ok && kt1row?.amount === 1500 && kt1row?.cast_id === castB && kt1row?.created_by === castU2.id && kt1row?.d === bizToday && ktAu.length === 1 && ktAu[0].actor_user_id === null
        && ktAu[0].after_json.kiosk_device_id === kdev && ktAu[0].after_json.punch_id === kpid && kt1b.ok && rowsOf(kt1b)[0].id === kt1id, [err(pin), err(kp), err(kt1), err(kt1b)].join(" / ") + JSON.stringify([kt1row, ktAu]));
      const kt2 = await as({ auth_user_id: kioskUid }, "select public.kiosk_transport_issue($1) id", [p1id]);
      const kt3 = await as(mgr, "select public.kiosk_transport_issue($1) id", [kpid]);
      const kt4 = await as({ auth_user_id: regUid }, "select public.kiosk_transport_issue($1) id", [kpid]);
      const kt5 = await as(castU2, "select public.kiosk_transport_issue($1) id", [kpid]);
      check("6-7", "kiosk: self 打刻（source≠kiosk）は forbidden・manager／cast／レジ端末（purpose=register）からは forbidden", has(kt2, "forbidden") && has(kt3, "forbidden") && has(kt4, "forbidden") && has(kt5, "forbidden"), [err(kt2), err(kt3), err(kt4), err(kt5)].join(" / "));
      await reopen(castB);   // ★0161
      const kp2 = await as({ auth_user_id: kioskUid }, "select public.kiosk_punch($1, '1234', 'out', true) r", [castB]);
      const kp2id = rowsOf(kp2)[0]?.r?.punch_id ?? null;
      await q("update public.punches set punched_at = now() - interval '11 minutes' where id=$1", [kp2id]);
      const kt6 = await as({ auth_user_id: kioskUid }, "select public.kiosk_transport_issue($1) id", [kp2id]);
      await reopen(castB);   // ★0161
      const kp3 = await as({ auth_user_id: kioskUid }, "select public.kiosk_punch($1, '1234', 'out', false) r", [castB]);
      const kt7 = await as({ auth_user_id: kioskUid }, "select public.kiosk_transport_issue($1) id", [rowsOf(kp3)[0]?.r?.punch_id]);
      check("6-8", "kiosk: 打刻から 10 分超は 'punch expired'・okuri=false は 'not okuri punch'", has(kt6, "punch expired") && has(kt7, "not okuri punch"), [err(kt6), err(kt7)].join(" / "));
      await q("update public.payroll_runs set status='paid' where id=$1", [Rcur]);
      const p5 = await as(castU, "select public.punch_self('out', null, null, true) id");
      const t8 = await as(castU, "select public.transport_issue_self($1) id", [rowsOf(p5)[0]?.id]);
      await reopen(castB);   // ★0161
      const kp4 = await as({ auth_user_id: kioskUid }, "select public.kiosk_punch($1, '1234', 'out', true) r", [castB]);
      const kt8 = await as({ auth_user_id: kioskUid }, "select public.kiosk_transport_issue($1) id", [rowsOf(kp4)[0]?.r?.punch_id]);
      check("6-9", "その営業日を含む run が paid: 本人・kiosk とも 'paid period'（transport は繰越の列なし）", has(t8, "paid period") && has(kt8, "paid period"), [err(t8), err(kt8)].join(" / "));
      const tbu = await md5s(["transport_issue_bulk", "transport_issue", "kiosk_punch", "punch_self"]);
      check("6-10", "既存 transport_issue_bulk／transport_issue は不触・kiosk_punch／punch_self は 0161 後の値（順序検査 1 行）", tbu.length === 4 && tbu.every((r) => r.m === UNTOUCHED[r.p]), tbu.map((r) => [r.p, r.m]));

      // ── ★8 裁定319 追補1: kiosk_punch_state ──
      const ks1 = await as({ auth_user_id: kioskUid }, "select public.kiosk_punch_state() s");
      const ks1s: Row = rowsOf(ks1)[0]?.s ?? {};
      const ks2 = await as({ auth_user_id: regUid }, "select public.kiosk_punch_state() s");
      const ks3 = await as(mgr, "select public.kiosk_punch_state() s");
      const ks4 = await as(castU, "select public.kiosk_punch_state() s");
      await q("update public.stores set settings_json = settings_json - 'okuri_mode' - 'okuri_base_amount' where id=$1", [A1.id]);
      const ks5 = await as({ auth_user_id: kioskUid }, "select public.kiosk_punch_state() s");
      const ks5s: Row = rowsOf(ks5)[0]?.s ?? {};
      await q("update public.stores set settings_json = jsonb_set(jsonb_set(settings_json, '{okuri_mode}', '\"actual\"'::jsonb, true), '{okuri_base_amount}', '1500'::jsonb, true) where id=$1", [A1.id]);
      await q("update public.kiosk_devices set is_active = false where id=$1", [kdev]);
      const ks6 = await as({ auth_user_id: kioskUid }, "select public.kiosk_punch_state() s");
      await q("update public.kiosk_devices set is_active = true where id=$1", [kdev]);
      check("8-1", "★kiosk_punch_state: 打刻端末 OK（okuri_mode 'actual'・okuri_base_amount 1500・キーは 2 つだけ）・レジ端末 forbidden・authenticated（manager／cast）forbidden・okuri 未設定は 'flat'／base null・無効化した端末は forbidden",
        ks1.ok && ks1s.okuri_mode === "actual" && ks1s.okuri_base_amount === 1500 && JSON.stringify(Object.keys(ks1s).sort()) === JSON.stringify(["okuri_base_amount", "okuri_mode"])
        && has(ks2, "forbidden") && has(ks3, "forbidden") && has(ks4, "forbidden") && ks5.ok && ks5s.okuri_mode === "flat" && ks5s.okuri_base_amount === null && has(ks6, "forbidden"),
        [err(ks1), err(ks2), err(ks3), err(ks4), err(ks5), err(ks6)].join(" / ") + JSON.stringify([ks1s, ks5s]));

      // ── ★7 裁定314 ──
      const custs: Record<string, string> = Object.fromEntries((await q("select id, name from public.customers where store_id=$1 and name in ('NOX-VERIFY-顧客-指名A','NOX-VERIFY-顧客-指名B')", [A1.id])).map((r) => [String(r.name).replace("NOX-VERIFY-顧客-", ""), r.id]));
      const seat = (await one("insert into public.seats (org_id, store_id, name, kind, sort_order, is_active) values ($1,$2,'v0158-一時卓','卓',998,true) returning id", [A1.org_id, A1.id])).id;
      const P1 = (await one("insert into public.products (org_id, store_id, type, name, price, back_mode, unit4_json, hon_pt) values ($1,$2,'bottle','v0158 ボトル',5000,'unit4','{\"hon\":700,\"jonai\":400,\"dohan\":700,\"free\":250}'::jsonb,0) returning id", [A1.org_id, A1.id])).id;
      await q("update public.payroll_runs set status='draft' where id=$1", [Rcur]);
      const o1 = await as(mgr, "select public.check_open($1, 2, 'free', $2, null, null) id", [seat, custs["指名A"]]);
      const ck = rowsOf(o1)[0]?.id ?? null;
      const l1 = await as(mgr, "select public.check_add_line($1,$2,1,null,'A',null,null) id", [ck, P1]);
      const L1 = rowsOf(l1)[0]?.id ?? null;
      const kr = await as(mgr, "select public.bottle_keep_register($1,$2,$3,null,80,null,null,'ボトルX',$4) id", [A1.id, custs["指名A"], P1, L1]);
      const krId = rowsOf(kr)[0]?.id ?? null;
      const krRow = krId ? await one("select check_line_id, bottle_name, customer_id, status from public.bottle_keeps where id=$1", [krId]) : null;
      const kr2 = await as(mgr, "select public.bottle_keep_register($1,$2,$3,null,null,null,null,null,null) id", [A1.id, custs["指名A"], P1]);
      const kr2Row = kr2.ok ? await one("select check_line_id from public.bottle_keeps where id=$1", [rowsOf(kr2)[0].id]) : null;
      const kr3 = await as(mgr, "select public.bottle_keep_register($1,$2,$3,null,null,null,null,null,$4) id", [A1.id, custs["指名B"], P1, L1]);
      check("7-1", "★bottle_keep_register: p_check_line_id を渡すと bottle_keeps.check_line_id に入る・行の注文者＝持ち主（従来どおり）／渡さなければ null／伝票に付いていない顧客は 'not on check' のまま",
        o1.ok && l1.ok && kr.ok && krRow?.check_line_id === L1 && krRow?.bottle_name === "ボトルX" && krRow?.customer_id === custs["指名A"] && krRow?.status === "active"
        && (await one("select customer_id from public.check_lines where id=$1", [L1]))?.customer_id === custs["指名A"] && kr2.ok && kr2Row?.check_line_id === null && has(kr3, "not on check"), [err(o1), err(l1), err(kr), err(kr2), err(kr3)].join(" / ") + JSON.stringify(krRow));
      await pg("delete from public.check_lines where id=$1", [L1]);
      const afterDel = krId ? await one("select check_line_id from public.bottle_keeps where id=$1", [krId]) : null;
      check("7-2", "FK on delete set null: 明細行が消えてもキープは残り check_line_id は null", !!afterDel && afterDel.check_line_id === null, afterDel);

      // ── (t) mig 末尾の検証ブロックを tx 内で流す ──
      await T.asPg();
      const tailStmts = tail.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).join("\n");
      const r = (await db.query(tailStmts)) as unknown;
      const rs = (Array.isArray(r) ? r : [r]) as { rowCount: number; rows: Row[] }[];
      const tr = rs.map((x) => x.rows);
      const counts = rs.map((x) => x.rowCount);
      const md5Tail: Record<string, string> = Object.fromEntries((tr[1] ?? []).map((x) => [x.proname, x.md5]));
      const expAll = { ...EXPECTED, ...EXPECTED_NEW };
      const tg = tr[6] ?? [];
      check("t-1", "検証ブロック 8 文: 行数 1／16／3／7／3／1／3／1・md5 16 本＝控え（kiosk_transport_issue は 0159 後の値）・不触 3 本不変・列 3 行とも null 可・RLS t＋policy 1（SELECT）・grant authenticated=SELECT のみ（anon なし）・関数 296・表 81（★0160）",
        JSON.stringify(counts) === JSON.stringify([1, 16, 3, 7, 3, 1, 3, 1]) && Object.keys(expAll).length === 16 && Object.keys(expAll).every((n) => md5Tail[n] === expAll[n])
        && tr[2].every((x) => UNTOUCHED[x.proname] === x.md5) && tr[4].every((x) => x.is_nullable === "YES") && tr[5][0].relrowsecurity === true && tr[5][0].policyname === "payroll_attentions_select" && tr[5][0].cmd === "SELECT"
        && tg.some((g) => g.grantee === "authenticated" && g.string_agg === "SELECT") && !tg.some((g) => g.grantee === "anon") && Number(tr[7][0].functions) === 297 && Number(tr[7][0].tables) === 81, // ★0159: 関数 290 → ★0160: 296 → ★0161: 297・表 81
        JSON.stringify(counts) + JSON.stringify(tr[7]) + JSON.stringify(Object.keys(expAll).filter((n) => md5Tail[n] !== expAll[n])));
    } catch (e) {
      check("x-0", "例外なし", false, (e as Error).message);
    } finally {
      await db.query("rollback");
    }
    // ── (r) ROLLBACK 後 ──
    const after = await md5s([...TOUCH, ...NEW, ...CTRL]);
    const key = (r: Row) => `${r.m}|${r.a}|${r.rt}|${r.v}|${r.acl}`;
    const bmap: Record<string, string> = Object.fromEntries(before.map((r) => [r.p, key(r)]));
    const amap: Record<string, string> = Object.fromEntries(after.map((r) => [r.p, key(r)]));
    check("r-1", "ROLLBACK 後: 対象 28 本の md5／署名／戻り／揮発性／proacl が開始時と一致", JSON.stringify(bmap) === JSON.stringify(amap) && after.length === before.length, Object.keys(amap).filter((k) => amap[k] !== bmap[k]));
    const snapAfter = JSON.stringify(await one(snapSql, [A1.id]));
    check("r-2", "ROLLBACK 後: 行数（advances／daily_pays／transport／punches／corrections／runs／payslips／attentions／keeps／kiosk／pin／tax／checks／seats／products／audit）と A1 の店設定が開始時と一致（fixture 残 0）", snapAfter === snapBefore, `${snapBefore} → ${snapAfter}`.slice(0, 900));
  } finally {
    await db.end().catch(() => undefined);
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-0158 ALL PASS (${pass} assertions)`);
  console.log("0158（裁定312／315／316／317／319＋追補1・314 列・起票87）: 支払済み期の前借り・日払いは翌月へ繰り下げ / 確定後の打刻修正は通り要対応 1 行 / 確定は期間終了の翌営業日から / 送りベース額（0〜99999）/ 送り実費の本人・打刻端末発行（金額はサーバ側・idem＝打刻）/ キープの明細行ひも付け / ROLLBACK 残 0");
}

main().catch((e) => { console.error(e); process.exit(1); });
