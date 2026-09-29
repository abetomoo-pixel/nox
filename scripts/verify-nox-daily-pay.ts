/*
 * verify:nox-daily-pay — mig0156（裁定309-6〜9／309 追補2・起票84／85・2026-09-28）: 日払い・run 別控除上書き・退勤連動の送り・貸付残高・kiosk ar_enabled・廃棄状況の係留。
 *   npm run verify:nox-daily-pay（env: SUPABASE_DB_URL・NEXT_PUBLIC_*・seed:f0 済み）。f0 79 段目。Postgres 直結の 1 トランザクション内で JWT を emulate（fixtures-pgtx）
 *   → 最後に ROLLBACK＝残留 0（店設定 okuri_mode／okuri_base_amount／ar_enabled・cast_tax_profiles・payroll_runs・deductions・punches・kiosk 端末／セッション・cast_pin・advances・
 *   cast_sensitive の enc／廃棄列はすべて tx 内）。便 T-3／T-2b-4 の突合（docs/tmp/q0928_ag_0156.mjs）の d／o／p／a／k を移植。
 *
 *  (1) daily_pay_issue: 委託＝月次と同式を日数 1 で（lib/nox/pay.ts withholdingOf の写像＝floor(max(0, gross−5000)×0.1021)）・境界 11 点・雇用 0＋warn 'T10 pending'・
 *      同キー再送＝同 id・cast forbidden／bad amount／idem required／paid period／bad idem key・audit・daily_pays_of_run（cast 別合計・cast forbidden）・RLS（cast 本人のみ）
 *  (2) payroll_run_deduction_override_set／clear／of: upsert・forbidden／bad deduction／bad amount／bad enabled・clear 1→0・audit・finalized は 'run not draft'・cast は RLS 0
 *  (3) punches.okuri: punch_self（in null／out+true／out 省略＝actual 店 false・flat 店 null・旧 3 引数互換）・punch_proxy・kiosk_punch（PIN・source kiosk）・
 *      okuri_today_summary（未発行のみ・base_amount・idem＝md5(punch_id:cast_id)）・transport_issue_bulk(p_idem_key＝punch_id) 再送 0 件→summary から消える
 *  (4) advances_open_balance（open 合計・件数・最古・cancelled 除外・cast forbidden）
 *  (5) kiosk_register_state ar_enabled／get_cast_mynumber_masked 不触（text・6f401f45）／cast_mynumber_discard_status 3 role（他 cast・他店 manager forbidden・廃棄前後・audit なし）
 *  (6) anon 8 本 BLOCKED／ROLLBACK 後 snapshot 一致
 *  逆テスト（手動・1 回）: (1) の whOf の 5000 を 5001 にする→dp(1-2) 赤・戻して緑。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { loadEnvOrExit } from "./fixtures-f0";
import { pgTx } from "./fixtures-pgtx";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_DB_URL"]);
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const PUBLIC8 = ["daily_pay_issue", "daily_pays_of_run", "payroll_run_deduction_override_set", "payroll_run_deduction_override_clear", "payroll_run_deduction_overrides_of", "okuri_today_summary", "advances_open_balance", "cast_mynumber_discard_status"];
/** lib/nox/pay.ts withholdingOf を日数 1 で（Math.floor・Number＝IEEE754）＝daily_pay_issue の double precision 演算と同値 */
const whOf = (gross: number) => Math.floor(Math.max(0, gross - 5000) * 0.1021);
type Dp = { id: string; gross: number; withholding: number; net: number; withholding_category: string; warn: string | null; replay: boolean };

async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 180000 });
  await db.connect();
  const T = pgTx(db);
  const { q, one, errOf, as, uidOf, storeA1, castOf } = T;
  try {
    const A1 = await storeA1();
    const owner = await uidOf("ownerA"), mgr = await uidOf("managerA1"), castU = await uidOf("castA1a"), castU2 = await uidOf("castA1b"), mgrB = await uidOf("managerB1");
    const castA = await castOf(A1.id, castU.id), castB = await castOf(A1.id, castU2.id);
    const mgrMid = (await one<{ id: string }>("select id from public.memberships where user_id=$1 and store_id=$2 and is_active", [mgr.id, A1.id]))?.id;
    check("dp(0-1) fixture: A1／owner／manager（membership）／manager B1／cast a1a・a1b", !!A1 && !!owner && !!mgr && !!mgrMid && !!mgrB && !!castA && !!castB);
    if (!castA || !castB || !mgrMid) throw new Error("fixture 解決失敗");
    const snapSql = `select (select count(*)::int from public.punches) pu, (select count(*)::int from public.daily_pays) dp, (select count(*)::int from public.payroll_run_deduction_overrides) ov, (select count(*)::int from public.payroll_runs) pr,
      (select count(*)::int from public.deductions) de, (select count(*)::int from public.advances) ad, (select count(*)::int from public.transport) tr, (select count(*)::int from public.kiosk_devices) kd,
      (select count(*)::int from public.cast_pin) cp, (select count(*)::int from public.cast_tax_profiles) tp, (select count(*)::int from public.cast_sensitive) cs, (select settings_json::text from public.stores where id=$1) st,
      (select count(*)::int from public.audit_logs) au`;
    const before = JSON.stringify(await one(snapSql, [A1.id]));
    // masked は不触（md5 6f401f45・戻り text）
    const msk = await one<{ m: string; rt: string }>("select md5(replace(prosrc, E'\\r', '')) m, pg_get_function_result(oid) rt from pg_proc where pronamespace='public'::regnamespace and proname='get_cast_mynumber_masked'");
    check("dp(5-0) get_cast_mynumber_masked は不触（md5 6f401f45・戻り text）＝309 追補2 (f)", msk?.m.slice(0, 8) === "6f401f45" && msk?.rt === "text", JSON.stringify(msk));

    await db.query("begin");
    try {
      const bizToday = (await one<{ d: string }>("select public.biz_date_of($1, now())::text d", [A1.id])).d;
      const period = bizToday.slice(0, 7);
      await db.query("update public.stores set settings_json = jsonb_set(jsonb_set(jsonb_set(coalesce(settings_json,'{}'::jsonb), '{okuri_mode}', '\"actual\"'::jsonb, true), '{okuri_base_amount}', '1500'::jsonb, true), '{ar_enabled}', 'true'::jsonb, true) where id=$1", [A1.id]);
      await db.query("insert into public.cast_tax_profiles (cast_id, org_id, store_id, mode) values ($1,$2,$3,'雇用') on conflict (cast_id) do update set mode='雇用'", [castB, A1.org_id, A1.id]);
      await db.query("delete from public.cast_tax_profiles where cast_id=$1", [castA]);
      const runDraft = (await one<{ id: string }>("insert into public.payroll_runs (org_id, store_id, period, status, created_by) values ($1,$2,$3,'draft',$4) returning id", [A1.org_id, A1.id, period, owner.id])).id;
      await db.query("insert into public.payroll_runs (org_id, store_id, period, status, created_by) values ($1,$2,'2020-01','paid',$3)", [A1.org_id, A1.id, owner.id]);
      const dedId = (await one<{ id: string }>("insert into public.deductions (org_id, store_id, name, amount, per) values ($1,$2,'dp-寮費',30000,'month') returning id", [A1.org_id, A1.id])).id;

      // (1) daily_pay_issue
      const k1 = (await one<{ u: string }>("select gen_random_uuid() u")).u, k2 = (await one<{ u: string }>("select gen_random_uuid() u")).u;
      const dp1 = await as(mgr, "select public.daily_pay_issue($1, $2::date, 10000, $3) r", [castA, bizToday, k1]);
      const dp1b = await as(mgr, "select public.daily_pay_issue($1, $2::date, 10000, $3) r", [castA, bizToday, k1]);
      const dp2 = await as(owner, "select public.daily_pay_issue($1, $2::date, 5000, $3) r", [castB, bizToday, k2]);
      const r1 = dp1.ok ? (dp1.rows[0].r as Dp) : null, r1b = dp1b.ok ? (dp1b.rows[0].r as Dp) : null, r2 = dp2.ok ? (dp2.rows[0].r as Dp) : null;
      check("dp(1-1) manager: 委託 10000→源泉 510（月次と同式・日数 1）・net 9490・category '委託'・warn null・replay false", !!r1 && r1.gross === 10000 && r1.withholding === whOf(10000) && r1.net === 10000 - whOf(10000) && r1.withholding_category === "委託" && r1.warn === null && r1.replay === false, JSON.stringify(dp1));
      const bounds = [1, 4999, 5000, 5001, 5010, 6000, 7499, 15000, 20000, 123456, 1000000];
      const bRes: Array<{ g: number; ok: boolean; wh: unknown; exp: number }> = [];
      for (const g of bounds) { const r = await as(mgr, "select public.daily_pay_issue($1, $2::date, $3, gen_random_uuid()) r", [castA, bizToday, g]); bRes.push({ g, ok: r.ok, wh: r.ok ? (r.rows[0].r as Dp).withholding : errOf(r), exp: whOf(g) }); }
      check("dp(1-2) 源泉の境界 11 点＝pay.ts withholdingOf（日数 1）の写像と一致（5000 以下 0・5001→0・15000→1021・1000000→101599）", bRes.every((b) => b.ok && b.wh === b.exp), JSON.stringify(bRes));
      check("dp(1-3) 同キー再送＝同 id・replay true・行は 1", !!r1 && !!r1b && r1b.id === r1.id && r1b.replay === true && (await one<{ n: number }>("select count(*)::int n from public.daily_pays where idem_key=$1", [k1])).n === 1, JSON.stringify(dp1b));
      check("dp(1-4) owner: 雇用 5000→源泉 0・net 5000・warn 'T10 pending'", !!r2 && r2.withholding === 0 && r2.net === 5000 && r2.withholding_category === "雇用" && r2.warn === "T10 pending", JSON.stringify(dp2));
      const dpCast = await as(castU, "select public.daily_pay_issue($1, $2::date, 1000, gen_random_uuid()) r", [castA, bizToday]);
      const dpBad = await as(mgr, "select public.daily_pay_issue($1, $2::date, 0, gen_random_uuid()) r", [castA, bizToday]);
      const dpIdem = await as(mgr, "select public.daily_pay_issue($1, $2::date, 1000, null) r", [castA, bizToday]);
      const dpPaid = await as(mgr, "select public.daily_pay_issue($1, '2020-01-15'::date, 1000, gen_random_uuid()) r", [castA]);
      const dpOther = await as(mgr, "select public.daily_pay_issue($1, $2::date, 1000, $3) r", [castB, bizToday, k1]);
      check("dp(1-5) cast forbidden／gross 0 'bad amount'／idem null 'idem required'／★0158（裁定312）paid 期（2020-01）は翌月へ繰り下げて発行（settle_period・carried_to＝2020-02）／別 cast のキー再利用 'bad idem key'", /forbidden/.test(errOf(dpCast)) && /bad amount/.test(errOf(dpBad)) && /idem required/.test(errOf(dpIdem)) && dpPaid.ok && (dpPaid.rows[0].r as { settle_period?: string; carried_to?: string | null }).settle_period === "2020-02" && (dpPaid.rows[0].r as { carried_to?: string | null }).carried_to === "2020-02" && /bad idem key/.test(errOf(dpOther)), [errOf(dpCast), errOf(dpBad), errOf(dpIdem), errOf(dpPaid), errOf(dpOther)].join(" / "));
      const dpAudit = await q<{ after_json: Record<string, unknown> }>("select after_json from public.audit_logs where action='daily_pay_issue' and at >= now()");
      const a10k = dpAudit.find((a) => a.after_json.gross === 10000 && a.after_json.cast_id === castA), aEmp = dpAudit.find((a) => a.after_json.cast_id === castB);
      check("dp(1-6) audit 'daily_pay_issue' 2＋境界 11＋繰り下げ 1 行（再送では書かない）・after に withholding／net／warn", dpAudit.length === 3 + bounds.length && a10k?.after_json.withholding === whOf(10000) && aEmp?.after_json.warn === "T10 pending", `n=${dpAudit.length}`);
      const ofRun = await as(owner, "select cast_id, paid_total, withholding_total, n from public.daily_pays_of_run($1) order by cast_id", [runDraft]);
      const ofRunCast = await as(castU, "select * from public.daily_pays_of_run($1)", [runDraft]);
      const mp = ofRun.ok ? Object.fromEntries(ofRun.rows.map((r) => [r.cast_id as string, r])) : {};
      const aSum = 10000 + bounds.reduce((a, b) => a + b, 0), aWh = whOf(10000) + bounds.reduce((a, b) => a + whOf(b), 0);
      check("dp(1-7) daily_pays_of_run（owner・当月 draft run）: 2 行＝A1a 合計／源泉／件数・A1b 5000/0/1・cast forbidden", ofRun.ok && ofRun.rows.length === 2 && mp[castA]?.paid_total === aSum && mp[castA]?.withholding_total === aWh && mp[castA]?.n === 1 + bounds.length && mp[castB]?.paid_total === 5000 && mp[castB]?.withholding_total === 0 && /forbidden/.test(errOf(ofRunCast)), JSON.stringify(ofRun));
      const dpSel = await as(castU, "select count(*)::int n from public.daily_pays");
      const dpSelM = await as(mgr, "select count(*)::int n from public.daily_pays");
      check("dp(1-8) RLS: cast は本人行のみ・manager は自店全件（★0158: 繰り下げ発行の 1 行を含む）", dpSel.ok && dpSel.rows[0].n === 2 + bounds.length && dpSelM.ok && dpSelM.rows[0].n === 3 + bounds.length, JSON.stringify([dpSel, dpSelM]));

      // (2) overrides
      const o1 = await as(mgr, "select public.payroll_run_deduction_override_set($1,$2,$3,false,null) id", [runDraft, castA, dedId]);
      const o2 = await as(mgr, "select public.payroll_run_deduction_override_set($1,$2,$3,true,500) id", [runDraft, castA, dedId]);
      const oOf = await as(owner, "select cast_id, deduction_id, enabled, amount_override from public.payroll_run_deduction_overrides_of($1)", [runDraft]);
      const oCast = await as(castU, "select public.payroll_run_deduction_override_set($1,$2,$3,false,null) id", [runDraft, castA, dedId]);
      const oBadDed = await as(mgr, "select public.payroll_run_deduction_override_set($1,$2,gen_random_uuid(),false,null) id", [runDraft, castA]);
      const oBadAmt = await as(mgr, "select public.payroll_run_deduction_override_set($1,$2,$3,true,-1) id", [runDraft, castA, dedId]);
      const oNullEn = await as(mgr, "select public.payroll_run_deduction_override_set($1,$2,$3,null,null) id", [runDraft, castA, dedId]);
      const oClr = await as(mgr, "select public.payroll_run_deduction_override_clear($1,$2,$3) n", [runDraft, castA, dedId]);
      const oClr2 = await as(mgr, "select public.payroll_run_deduction_override_clear($1,$2,$3) n", [runDraft, castA, dedId]);
      const oSel = await as(castU, "select count(*)::int n from public.payroll_run_deduction_overrides");
      check("dp(2-1) set（false）→set（500）＝同 id（upsert）・overrides_of 1 行（enabled true・500）", o1.ok && o2.ok && o1.rows[0].id === o2.rows[0].id && oOf.ok && oOf.rows.length === 1 && oOf.rows[0].enabled === true && oOf.rows[0].amount_override === 500, JSON.stringify([o1, o2, oOf]));
      check("dp(2-2) cast forbidden／他店 deduction 'bad deduction'／負値 'bad amount'／enabled null 'bad enabled'", /forbidden/.test(errOf(oCast)) && /bad deduction/.test(errOf(oBadDed)) && /bad amount/.test(errOf(oBadAmt)) && /bad enabled/.test(errOf(oNullEn)), [errOf(oCast), errOf(oBadDed), errOf(oBadAmt), errOf(oNullEn)].join(" / "));
      const oAud = await one<{ s: number; c: number }>("select count(*) filter (where action='payroll_run_deduction_override_set')::int s, count(*) filter (where action='payroll_run_deduction_override_clear')::int c from public.audit_logs where at >= now()");
      check("dp(2-3) clear→1・再 clear→0・audit set 2／clear 1・cast は RLS 0 行", oClr.ok && oClr.rows[0].n === 1 && oClr2.ok && oClr2.rows[0].n === 0 && oAud.s === 2 && oAud.c === 1 && oSel.ok && oSel.rows[0].n === 0, JSON.stringify([oClr, oClr2, oAud, oSel]));
      await db.query("update public.payroll_runs set status='finalized' where id=$1", [runDraft]);
      const oFin = await as(mgr, "select public.payroll_run_deduction_override_set($1,$2,$3,false,null) id", [runDraft, castA, dedId]);
      const oFinC = await as(mgr, "select public.payroll_run_deduction_override_clear($1,$2,$3) n", [runDraft, castA, dedId]);
      await db.query("update public.payroll_runs set status='draft' where id=$1", [runDraft]);
      check("dp(2-4) finalized の run: set／clear とも 'run not draft'", /run not draft/.test(errOf(oFin)) && /run not draft/.test(errOf(oFinC)), errOf(oFin) + " / " + errOf(oFinC));

      // (3) punches.okuri
      const okuriOf = async (r: { ok: boolean; rows?: Record<string, unknown>[] }) => (r.ok && r.rows ? (await one<{ okuri: boolean | null }>("select okuri from public.punches where id=$1", [r.rows[0].id])).okuri : "ERR");
      const p1 = await as(castU, "select public.punch_self('in', null, null) id");
      const p2 = await as(castU, "select public.punch_self('out', null, null, true) id");
      const p3 = await as(castU, "select public.punch_self('out', null, null) id");
      const p4 = await as(mgr, "select public.punch_proxy($1, 'out', null, true) id", [castB]);
      const p5 = await as(mgr, "select public.punch_proxy($1, 'out', 'dp-代理') id", [castB]);
      check("dp(3-1) punch_self: in→okuri null／out+true→true／out 省略（actual 店）→false・旧 3 引数呼出は互換", (await okuriOf(p1)) === null && (await okuriOf(p2)) === true && (await okuriOf(p3)) === false, JSON.stringify([await okuriOf(p1), await okuriOf(p2), await okuriOf(p3)]));
      check("dp(3-2) punch_proxy: out+true→true／3 引数（note）→false", (await okuriOf(p4)) === true && (await okuriOf(p5)) === false, JSON.stringify([await okuriOf(p4), await okuriOf(p5)]));
      await db.query("update public.stores set settings_json = jsonb_set(settings_json, '{okuri_mode}', '\"flat\"'::jsonb, true) where id=$1", [A1.id]);
      const p6 = await as(castU, "select public.punch_self('out', null, null) id");
      await db.query("update public.stores set settings_json = jsonb_set(settings_json, '{okuri_mode}', '\"actual\"'::jsonb, true) where id=$1", [A1.id]);
      check("dp(3-3) flat の店: out 省略→okuri null（追補2 (a)）", (await okuriOf(p6)) === null, String(await okuriOf(p6)));
      const kioskUid = (await one<{ u: string }>("select gen_random_uuid() u")).u;
      await db.query("insert into public.kiosk_devices (org_id, store_id, auth_user_id, label, is_active, purpose) values ($1,$2,$3,'dp-punch',true,'punch')", [A1.org_id, A1.id, kioskUid]);
      const pinSet = await as(mgr, "select public.set_cast_pin($1, '1234') r", [castB]);
      const kp = await as({ auth_user_id: kioskUid }, "select public.kiosk_punch($1, '1234', 'out', true) r", [castB]);
      const kpOld = await as({ auth_user_id: kioskUid }, "select public.kiosk_punch($1, '1234', 'in') r", [castB]);
      const kpR = kp.ok ? (kp.rows[0].r as { ok: boolean; punch_id: string }) : null;
      const kpRow = kpR?.ok ? await one<{ okuri: boolean; source: string }>("select okuri, source from public.punches where id=$1", [kpR.punch_id]) : null;
      check("dp(3-4) kiosk_punch: PIN 一致・out+true→okuri true・source kiosk／3 引数（in）も ok", pinSet.ok && kpR?.ok === true && kpRow?.okuri === true && kpRow?.source === "kiosk" && kpOld.ok && (kpOld.rows[0].r as { ok: boolean }).ok === true, JSON.stringify([errOf(pinSet), kp, kpOld]));
      // ★教訓98（便 W-1g）: 同一 tx 内の行は順序で同定しない（punched_at＝now() 同値）＝p2 の行は punch_id で find
      const sum1 = await as(mgr, "select punch_id, cast_id, base_amount, idem_key from public.okuri_today_summary($1, $2::date) order by punched_at", [A1.id, bizToday]);
      const sumCast = await as(castU, "select * from public.okuri_today_summary($1, $2::date)", [A1.id, bizToday]);
      const p2id = p2.ok ? (p2.rows[0].id as string) : "";
      const idemExp = (await one<{ k: string }>("select md5($1::text || ':' || $2::text)::uuid k", [p2id, castA])).k;
      check("dp(3-5) okuri_today_summary（manager・当日）: okuri=true の out 3 件（self／proxy／kiosk）・base_amount 1500・idem_key＝md5(punch_id:cast_id)・cast forbidden", sum1.ok && sum1.rows.length === 3 && sum1.rows.every((r) => r.base_amount === 1500) && sum1.rows.find((r) => r.punch_id === p2id)?.idem_key === idemExp && /forbidden/.test(errOf(sumCast)), JSON.stringify(sum1));
      const items = JSON.stringify([{ cast_id: castA, amount: 1500, date: bizToday }]);
      const tb1 = await as(mgr, "select public.transport_issue_bulk($1, $2::jsonb, $3) ids", [A1.id, items, p2id]);
      const tb2 = await as(mgr, "select public.transport_issue_bulk($1, $2::jsonb, $3) ids", [A1.id, items, p2id]);
      const trN = (await one<{ n: number }>("select count(*)::int n from public.transport where store_id=$1 and idem_key = $2::uuid", [A1.id, idemExp])).n;
      const sum2 = await as(mgr, "select punch_id from public.okuri_today_summary($1, $2::date)", [A1.id, bizToday]);
      check("dp(3-6) transport_issue_bulk(p_idem_key＝punch_id): 1 件→再送は同 id・transport 1 行（再発行 0）→summary 2 件（発行済みが消える）", tb1.ok && (tb1.rows[0].ids as string[]).length === 1 && tb2.ok && (tb2.rows[0].ids as string[])[0] === (tb1.rows[0].ids as string[])[0] && trN === 1 && sum2.ok && sum2.rows.length === 2 && !sum2.rows.some((r) => r.punch_id === p2id), JSON.stringify([tb1, tb2, trN]));

      // (4) advances_open_balance
      await db.query("insert into public.advances (org_id, store_id, cast_id, amount, deducted_amount, status, advanced_on, created_by) values ($1,$2,$3,10000,3000,'open','2025-12-20',$4), ($1,$2,$3,20000,0,'open','2026-01-10',$4), ($1,$2,$3,5000,0,'cancelled','2026-02-01',$4)", [A1.org_id, A1.id, castA, owner.id]);
      const ab = await as(owner, "select cast_id, open_total, n, oldest_on::text oldest_on from public.advances_open_balance($1)", [A1.id]);
      const abCast = await as(castU, "select * from public.advances_open_balance($1)", [A1.id]);
      check("dp(4-1) advances_open_balance（owner）: A1a 1 行＝open 27000・n 2・最古 2025-12-20（cancelled 除外）・cast forbidden", ab.ok && ab.rows.length === 1 && ab.rows[0].cast_id === castA && ab.rows[0].open_total === 27000 && ab.rows[0].n === 2 && ab.rows[0].oldest_on === "2025-12-20" && /forbidden/.test(errOf(abCast)), JSON.stringify(ab));

      // (5) kiosk_register_state ar_enabled／discard_status
      const regUid = (await one<{ u: string }>("select gen_random_uuid() u")).u;
      const dev = (await one<{ id: string }>("insert into public.kiosk_devices (org_id, store_id, auth_user_id, label, is_active, purpose) values ($1,$2,$3,'dp-register',true,'register') returning id", [A1.org_id, A1.id, regUid])).id;
      await db.query("insert into public.kiosk_sessions (org_id, store_id, device_id, membership_id, operator_user_id) values ($1,$2,$3,$4,$5)", [A1.org_id, A1.id, dev, mgrMid, mgr.id]);
      const krs1 = await as({ auth_user_id: regUid }, "select (public.kiosk_register_state()->>'ar_enabled')::boolean ar, jsonb_typeof(public.kiosk_register_state()->'seats') seats");
      await db.query("update public.stores set settings_json = jsonb_set(settings_json, '{ar_enabled}', 'false'::jsonb, true) where id=$1", [A1.id]);
      const krs2 = await as({ auth_user_id: regUid }, "select (public.kiosk_register_state()->>'ar_enabled')::boolean ar");
      check("dp(5-1) kiosk_register_state: ar_enabled true→店設定 false で false・seats は配列", krs1.ok && krs1.rows[0].ar === true && krs1.rows[0].seats === "array" && krs2.ok && krs2.rows[0].ar === false, JSON.stringify([krs1, krs2]));
      await db.query("insert into public.cast_sensitive (cast_id, org_id, store_id, mynumber_enc) values ($1,$2,$3, decode('00ff','hex')) on conflict (cast_id) do update set mynumber_enc = excluded.mynumber_enc, mynumber_deleted_at = null, mynumber_deletion_method = null", [castA, A1.org_id, A1.id]);
      const au0 = (await one<{ n: number }>("select count(*)::int n from public.audit_logs")).n;
      const st1o = await as(owner, "select mynumber_deleted_at, mynumber_deletion_method, has_mynumber from public.cast_mynumber_discard_status($1)", [castA]);
      const st1m = await as(mgr, "select has_mynumber from public.cast_mynumber_discard_status($1)", [castA]);
      const st1c = await as(castU, "select has_mynumber from public.cast_mynumber_discard_status($1)", [castA]);
      const stOther = await as(castU, "select * from public.cast_mynumber_discard_status($1)", [castB]);
      const stMgrB = await as(mgrB, "select * from public.cast_mynumber_discard_status($1)", [castA]);
      const stNone = await as(owner, "select * from public.cast_mynumber_discard_status($1)", [castB]);
      await db.query("update public.cast_sensitive set mynumber_enc = null, mynumber_deleted_at = now(), mynumber_deleted_by = $2, mynumber_deletion_method = 'overwrite_null' where cast_id=$1", [castA, owner.id]);
      const st2 = await as(owner, "select mynumber_deleted_at, mynumber_deletion_method, has_mynumber from public.cast_mynumber_discard_status($1)", [castA]);
      const au1 = (await one<{ n: number }>("select count(*)::int n from public.audit_logs")).n;
      check("dp(5-2) discard_status 廃棄前: owner／manager 自店／cast 本人＝has_mynumber true・廃棄列 null（1 行）", st1o.ok && st1o.rows.length === 1 && st1o.rows[0].has_mynumber === true && st1o.rows[0].mynumber_deleted_at === null && st1m.ok && st1m.rows[0].has_mynumber === true && st1c.ok && st1c.rows[0].has_mynumber === true, JSON.stringify([st1o, st1m, st1c]));
      check("dp(5-3) discard_status: 他 cast forbidden／他店 manager（B1）forbidden／cast_sensitive 行なし＝0 行", /forbidden/.test(errOf(stOther)) && /forbidden/.test(errOf(stMgrB)) && stNone.ok && stNone.rows.length === 0, [errOf(stOther), errOf(stMgrB)].join(" / "));
      check("dp(5-4) discard_status 廃棄後: has_mynumber false・deleted_at・'overwrite_null'／audit を書かない（呼出 7 回で audit_logs 不変）", st2.ok && st2.rows.length === 1 && st2.rows[0].has_mynumber === false && st2.rows[0].mynumber_deleted_at !== null && st2.rows[0].mynumber_deletion_method === "overwrite_null" && au1 === au0, JSON.stringify([st2, au0, au1]));
    } finally {
      await T.asPg();
      await db.query("rollback");
    }
    const after = JSON.stringify(await one(snapSql, [A1.id]));
    check("dp(0-2) ROLLBACK 後の snapshot 一致（punches／daily_pays／overrides／runs／deductions／advances／transport／kiosk／pin／tax／sensitive／店設定／audit）", after === before, `${before} → ${after}`);
  } finally {
    await db.end().catch(() => undefined);
  }
  // (6) anon BLOCKED
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const ARGS: Record<string, Record<string, null>> = {
    daily_pay_issue: { p_cast_id: null, p_biz_date: null, p_gross: null, p_idem_key: null }, daily_pays_of_run: { p_run_id: null },
    payroll_run_deduction_override_set: { p_run_id: null, p_cast_id: null, p_deduction_id: null, p_enabled: null, p_amount_override: null },
    payroll_run_deduction_override_clear: { p_run_id: null, p_cast_id: null, p_deduction_id: null }, payroll_run_deduction_overrides_of: { p_run_id: null },
    okuri_today_summary: { p_store_id: null, p_biz_date: null }, advances_open_balance: { p_store_id: null }, cast_mynumber_discard_status: { p_cast_id: null },
  };
  for (const fn of PUBLIC8) {
    const { error } = await anon.rpc(fn, ARGS[fn]);
    check(`dp(6-1) anon ${fn} BLOCKED`, !!error?.message?.includes("permission denied for function"), error?.message ?? "(no error)");
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-daily-pay ALL PASS (${pass} assertions)`);
  console.log("日払い・控除上書き・送り・貸付残高(0156・裁定309-6〜9／追補2): 源泉＝月次同式（日数 1・境界 11 点）/ overrides upsert・draft のみ / punches.okuri 既定（actual false・flat null）・summary 未発行のみ・transport idem＝punch / open 残高 / kiosk ar_enabled・masked 不触・discard_status 3 role / anon 8 本 BLOCKED / ROLLBACK 残留 0");
}

main().catch((e) => { console.error(e); process.exit(1); });
