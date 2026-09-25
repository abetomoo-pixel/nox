/*
 * verify:nox-referral — mig0152 紹介料（裁定280／286／292-3／298／299）の係留。0148 版（check_add_referral・kind 'referral'）は全面改稿。
 *   npm run verify:nox-referral（env: SUPABASE_DB_URL・seed:f0 済み）。Postgres 直結の 1 トランザクション内で JWT claims を emulate（fixtures-pgtx）→ 最後に ROLLBACK＝残留 0。
 *
 *  (1) set_referrer: external／staff（membership 必須）／更新／拒否 8 種（bad kind・bad membership×2・bad name・bad withholding_category・cast／他 org forbidden・anon）・audit 2 行
 *  (2) check_referral_set: set_rate（店負担＝total 不変）・'exists'・remove→account_rate 客負担（amount＝割引後小計の %・total＝check_group_due＝groupDueFull 第 3 引数の鏡像）・
 *      行追加で recalc（check_recalc 冒頭の referral_recalc）・拒否 8 種（内部 referral_recalc は anon・authenticated とも BLOCKED）・inactive referrer・fixed_per_person×people・'no people'（299-1）
 *  (3) check_merge: from 側に紹介あり→'referral on from'（reopen_flow が off の店では feature_disabled で前段停止＝どちらも可）
 *  (4) check_close: frozen_at＋referral_payouts 1 行（unpaid・withholding 0・同 idem 再送で 1 行のまま）・amount=0 は payout なし（D11）・支払後 remove は 'has payments'（299-4）・確定後は 'not open'
 *  (5) referral_payout_pay: paid・冪等・'already paid'・none は源泉 0／salesperson は同月累計で差分計上（120,000 控除・10.21%・floor＝298-7）
 *  (6) referral_payouts_pay_bulk: 2 件・同 idem 再送 2（冪等）・別 idem は 'already paid'（部分成功なし）
 *  (7) referral_payouts_unpaid: manager 1 行・cast／他 org forbidden・期間外 0 行
 *  (8) check_void: unpaid→voided・paid 据え置き・before に referral_payouts（298-10／299-8）
 *  (9) daily_report_close: referral_cash_payout＝当日 cash_daily の渡した額・diff 式に減算（299-2）
 *  (10) RLS: cast 0 行・manager 自店・他 org 0 行・anon は permission denied for table／CHECK: kind='referral' は insert 不可
 *  (11) 三面鏡（純関数）: receipt.ts＝客負担は初回セット行に合算・紹介行なし・合計＝groupDueFull(…, refAmt)／店負担は据え置き
 *  (12) client 結線（逐語 grep）: register-board は check_referral_set／remove を呼び check_add_referral・旧 helper import なし／pay.ts に referralTotal なし／
 *       check-calc・receipt に kind 'referral' 除外なし／print route は check_referrals を読む／kiosk-register に入口なし／マスタ「紹介者」ページと nav
 *  (13) anon: 公開 6 本 BLOCKED（permission denied for function）
 *  逆テスト（手動・各 1 回）: lib/nox/check-calc.ts の `+ referralCustomer` を外す→re(2-4) 赤／lib/nox/receipt.ts の refIdx 合算を外す→re(11-1) 赤・戻して緑。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";
import { pgTx } from "./fixtures-pgtx";
import { groupDueFull, type DueLine } from "../lib/nox/check-calc";
import { buildReceiptXml, referralTargetIndex, type ReceiptInput, type ReceiptLine } from "../lib/nox/receipt";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_DB_URL"]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const NIL = "00000000-0000-0000-0000-000000000000";

async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const T = pgTx(db);
  const { q, one, errOf, as, uidOf } = T;
  try {
    const A1 = await T.storeA1();
    const owner = await uidOf("ownerA"), mgr = await uidOf("managerA1"), staffU = await uidOf("staffA1"), castU = await uidOf("castA1a"), mgrB = await uidOf("managerB1");
    const staffMem = await one<{ id: string }>(`select m.id from public.memberships m where m.user_id = $1 and m.store_id = $2 and m.is_active`, [staffU.id, A1.id]);
    check("re(0-1) fixture: A1／owner-a／manager-a1／staff-a1（membership）／cast-a1a／manager-b1 が引ける", !!A1 && !!owner && !!mgr && !!staffMem && !!castU && !!mgrB);
    if (!A1 || !owner || !mgr || !staffMem || !castU || !mgrB) throw new Error("fixture 解決失敗");
    const orgA = A1.org_id;

    const snapSql = `select (select count(*)::int from public.checks where store_id=$1) c, (select count(*)::int from public.check_lines where store_id=$1) l,
      (select count(*)::int from public.audit_logs where org_id=$2) au, (select count(*)::int from public.daily_reports where store_id=$1) dr, (select count(*)::int from public.seats where store_id=$1) se,
      (select count(*)::int from public.referrers where org_id=$2) rf, (select count(*)::int from public.check_referrals where org_id=$2) cr, (select count(*)::int from public.referral_payouts where org_id=$2) rp`;
    const before = JSON.stringify(await one(snapSql, [A1.id, orgA]));

    await db.query("begin");
    try {
      // rls suite が A1 の今日／明日の日報を残すことがある＝tx 内で退ける（ROLLBACK で戻る）
      await db.query(`delete from public.daily_reports where store_id = $1 and biz_date >= current_date - 1`, [A1.id]);
      const seatOf = async (name: string) => (await one<{ id: string }>(`insert into public.seats (org_id, store_id, name, kind, sort_order, is_active) values ($1,$2,$3,'卓',9950,true) returning id`, [orgA, A1.id, name])).id;

      // ── (1) set_referrer ──
      const r1 = await as(owner, `select public.set_referrer(null,$1,'external',null,'外部キャッチ 甲',' 090-0000-0000 ','salesperson',true) id`, [A1.id]);
      check("re(1-1) set_referrer（owner・external・salesperson）→ uuid", r1.ok && typeof r1.rows[0].id === "string", errOf(r1));
      const refS = r1.ok ? (r1.rows[0].id as string) : NIL;
      const r1b = await as(mgr, `select public.set_referrer(null,$1,'staff',$2,'黒服 乙',null,'employee',true) id`, [A1.id, staffMem.id]);
      check("re(1-2) set_referrer（manager 自店・staff＋membership・employee）→ uuid", r1b.ok, errOf(r1b));
      const refE = r1b.ok ? (r1b.rows[0].id as string) : NIL;
      const r1c = await as(owner, `select public.set_referrer(null,$1,'external',null,'無し',null,'none',true) id`, [A1.id]);
      const refN = r1c.ok ? (r1c.rows[0].id as string) : NIL;
      const bad = [];
      for (const [who, sql, p] of [
        [owner, `select public.set_referrer(null,$1,'xx',null,'a',null,'none',true)`, [A1.id]],
        [owner, `select public.set_referrer(null,$1,'external',$2,'a',null,'none',true)`, [A1.id, staffMem.id]],
        [owner, `select public.set_referrer(null,$1,'staff',null,'a',null,'none',true)`, [A1.id]],
        [owner, `select public.set_referrer(null,$1,'external',null,'   ',null,'none',true)`, [A1.id]],
        [owner, `select public.set_referrer(null,$1,'external',null,'a',null,'bad',true)`, [A1.id]],
        [castU, `select public.set_referrer(null,$1,'external',null,'a',null,'none',true)`, [A1.id]],
        [mgrB, `select public.set_referrer(null,$1,'external',null,'a',null,'none',true)`, [A1.id]],
        ["anon", `select public.set_referrer(null,$1,'external',null,'a',null,'none',true)`, [A1.id]],
      ] as const) bad.push(await as(who, sql, [...p]));
      const expect = ["bad kind", "bad membership", "bad membership", "bad name", "bad withholding_category", "forbidden", "forbidden", "permission denied for function"];
      check("re(1-3) set_referrer の拒否 8 種（bad kind／external＋membership／staff の membership なし／空名／bad withholding_category／cast／他 org／anon）", bad.every((b, i) => !b.ok && b.err.includes(expect[i])), bad.map(errOf).join(" | "));
      const upd = await as(owner, `select public.set_referrer($1,$2,'external',null,'外部キャッチ 甲改',null,'salesperson',false) id`, [refS, A1.id]);
      const updRow = await one<{ name: string; contact: string | null; is_active: boolean }>(`select name, contact, is_active from public.referrers where id=$1`, [refS]);
      const auN = (await one<{ n: number }>(`select count(*)::int n from public.audit_logs where action='set_referrer' and target=$1`, ["referrers:" + refS])).n;
      check("re(1-4) set_referrer 更新（同 id・名前・contact null・is_active false）＋ audit 2 行（insert／update）", upd.ok && updRow.name === "外部キャッチ 甲改" && updRow.contact === null && updRow.is_active === false && auN === 2, `${errOf(upd)} audit=${auN}`);
      await as(owner, `select public.set_referrer($1,$2,'external',null,'外部キャッチ 甲',null,'salesperson',true)`, [refS, A1.id]);

      // ── (2) check_referral_set ──
      const seat = await seatOf("NOX-VERIFY-0152卓");
      const op1 = await as(owner, `select public.check_open($1, null, 'free', null, null, null) id`, [seat]);
      check("re(2-0) check_open（owner）", op1.ok, errOf(op1));
      const chk = op1.ok ? (op1.rows[0].id as string) : NIL;
      await as(owner, `select public.check_add_line($1, null, 1, 'set', 'A', 'セット', 10000)`, [chk]);
      await as(owner, `select public.check_add_line($1, null, 1, 'custom', 'A', 'カスタム', 5000)`, [chk]);
      const totalOf = async (id: string) => (await one<{ total: number }>(`select total from public.checks where id=$1`, [id])).total;
      const total0 = await totalOf(chk);
      const s1 = await as(owner, `select public.check_referral_set($1,$2,'set_rate',1000,'store',$3,null) id`, [chk, refN, randomUUID()]);
      const cr1 = await one<{ id: string; amount: number }>(`select id, amount from public.check_referrals where check_id=$1`, [chk]);
      check("re(2-1) set（set_rate 1000bp＝10%・店負担）→ amount 1000（set 10,000 の 10%）・total 不変・audit 1", s1.ok && cr1?.amount === 1000 && (await totalOf(chk)) === total0 && (await one<{ n: number }>(`select count(*)::int n from public.audit_logs where action='check_referral_set' and target=$1`, ["check_referrals:" + cr1?.id])).n === 1, `${errOf(s1)} amount=${cr1?.amount}`);
      const s1dup = await as(owner, `select public.check_referral_set($1,$2,'set_rate',2000,'store',$3,null) id`, [chk, refN, randomUUID()]);
      check("re(2-2) 2 件目は 'exists'（1 伝票 1 紹介＝298-3）", !s1dup.ok && s1dup.err.includes("exists"), errOf(s1dup));
      const idem1 = randomUUID();
      const rm1 = await as(owner, `select public.check_referral_remove($1)`, [chk]);
      const s2 = await as(owner, `select public.check_referral_set($1,$2,'account_rate',500,'customer',$3,'メモ') id`, [chk, refS, idem1]);
      const s2b = await as(owner, `select public.check_referral_set($1,$2,'account_rate',500,'customer',$3,'メモ') id`, [chk, refS, idem1]);
      const cr2 = await one<{ amount: number }>(`select amount from public.check_referrals where check_id=$1`, [chk]);
      const total1 = await totalOf(chk);
      const due1 = (await one<{ d: number }>(`select public.check_group_due($1,'A') d`, [chk])).d;
      check("re(2-3) remove→set（account_rate 500bp＝5%・客負担）→ amount 750（15,000 の 5%）・同 idem 再送は同 id・total が動く（＝check_group_due）", rm1.ok && s2.ok && s2b.ok && s2.rows[0].id === s2b.rows[0].id && cr2.amount === 750 && total1 > total0 && total1 === due1, `${errOf(rm1)} ${errOf(s2)} amount=${cr2?.amount} total ${total0}→${total1} due=${due1}`);
      const cs = await one<{ service_rate: number; round_unit: number; round_mode: string; business_tax_status: string; price_display: string; tax_rounding: string }>(`select service_rate, round_unit, round_mode, business_tax_status, price_display, tax_rounding from public.checks where id=$1`, [chk]);
      const linesA = await q<DueLine>(`select line_total, kind, tax_category from public.check_lines where check_id=$1 and pay_group='A'`, [chk]);
      check("re(2-4) ★三面鏡: groupDueFull(lines, s, 750)＝DB total（客負担は第 3 引数）・第 3 引数なしは total0（店負担／紹介なしと同値）", groupDueFull(linesA, cs, 750) === total1 && groupDueFull(linesA, cs) === total0, `mirror=${groupDueFull(linesA, cs, 750)} db=${total1} plain=${groupDueFull(linesA, cs)} total0=${total0}`);
      await as(owner, `select public.check_add_line($1, null, 1, 'custom', 'A', 'カスタム2', 1000)`, [chk]);
      const cr2b = await one<{ amount: number }>(`select amount from public.check_referrals where check_id=$1`, [chk]);
      check("re(2-5) 行追加で recalc → amount 800（16,000 の 5%）＝check_recalc 冒頭の referral_recalc", cr2b.amount === 800, String(cr2b.amount));
      const seat2 = await seatOf("NOX-VERIFY-0152卓2");
      const op2 = await as(owner, `select public.check_open($1, 3, 'free', null, null, null) id`, [seat2]);
      const chk2 = op2.ok ? (op2.rows[0].id as string) : NIL;
      const badSet = [];
      for (const [who, sql, p] of [
        [owner, `select public.check_referral_set($1,$2,'xx',1,'store',null,null)`, [chk, refN]],
        [owner, `select public.check_referral_set($1,$2,'set_rate',10001,'store',null,null)`, [chk, refN]],
        [owner, `select public.check_referral_set($1,$2,'set_rate',100,'xx',null,null)`, [chk, refN]],
        [owner, `select public.check_referral_set($1,$2,'set_rate',100,'store',null,null)`, [chk2, NIL]],
        [castU, `select public.check_referral_set($1,$2,'set_rate',100,'store',null,null)`, [chk2, refN]],
        ["anon", `select public.check_referral_set($1,$2,'set_rate',100,'store',null,null)`, [chk2, refN]],
        ["anon", `select public.referral_recalc($1)`, [chk]],
        [owner, `select public.referral_recalc($1)`, [chk]],
      ] as const) badSet.push(await as(who, sql, [...p]));
      const expect2 = ["bad method", "bad value", "bad burden", "bad referrer", "forbidden", "permission denied for function", "permission denied for function", "permission denied for function"];
      check("re(2-6) 拒否 8 種（bad method／value>10000／bad burden／不在 referrer／cast forbidden／anon／referral_recalc は anon・authenticated とも BLOCKED＝内部専用）", badSet.every((b, i) => !b.ok && b.err.includes(expect2[i])), badSet.map(errOf).join(" | "));
      await as(owner, `select public.set_referrer($1,$2,'external',null,'無し',null,'none',false)`, [refN, A1.id]);
      const inact = await as(owner, `select public.check_referral_set($1,$2,'fixed_per_group',3000,'store',null,null)`, [chk2, refN]);
      await as(owner, `select public.set_referrer($1,$2,'external',null,'無し',null,'none',true)`, [refN, A1.id]);
      check("re(2-7) inactive referrer は 'inactive referrer'", !inact.ok && inact.err.includes("inactive referrer"), errOf(inact));
      const s3 = await as(owner, `select public.check_referral_set($1,$2,'fixed_per_person',500,'store',null,null) id`, [chk2, refE]);
      const cr3 = await one<{ amount: number }>(`select amount from public.check_referrals where check_id=$1`, [chk2]);
      check("re(2-8) fixed_per_person 500×people 3 → 1500", s3.ok && cr3?.amount === 1500, `${errOf(s3)} ${cr3?.amount}`);
      const seatJ = await seatOf("NOX-VERIFY-0152卓J");
      const opJ = await as(owner, `select public.check_open($1, null, 'free', null, null, null) id`, [seatJ]);
      const chkJ = opJ.ok ? (opJ.rows[0].id as string) : NIL;
      const sJ0 = await as(owner, `select public.check_referral_set($1,$2,'fixed_per_person',500,'store',null,null) id`, [chkJ, refE]);
      const spJ = await as(owner, `select public.check_set_people($1, 3)`, [chkJ]);
      const sJ1 = await as(owner, `select public.check_referral_set($1,$2,'fixed_per_person',500,'store',null,null) id`, [chkJ, refE]);
      const crJ = await one<{ amount: number }>(`select amount from public.check_referrals where check_id=$1`, [chkJ]);
      check("re(2-9) 299-1: people null × fixed_per_person は 'no people'（行なし）→ check_set_people(3) の後は 500×3＝1,500", opJ.ok && !sJ0.ok && sJ0.err.includes("no people") && spJ.ok && sJ1.ok && crJ?.amount === 1500, `${errOf(sJ0)} ${errOf(spJ)} ${errOf(sJ1)} amount=${crJ?.amount}`);

      // ── (3) merge ──
      const mg = await as(owner, `select public.check_merge($1,$2,'verify 0152',$3)`, [chk2, chk, randomUUID()]);
      check("re(3-1) check_merge（from に紹介あり）→ 'referral on from'（reopen_flow off なら feature_disabled:reopen_flow で前段停止）", !mg.ok && (mg.err.includes("referral on from") || mg.err.includes("feature_disabled:reopen_flow")), errOf(mg));

      // ── (4) close ──
      const total2 = await totalOf(chk);
      const pay = await as(owner, `select public.check_pay($1,'cash',$2,'A',$2,$3,null)`, [chk, total2, randomUUID()]);
      const rmAfterPay = await as(owner, `select public.check_referral_remove($1)`, [chk]);
      check("re(4-1) 支払後の remove は 'has payments'（299-4）", pay.ok && !rmAfterPay.ok && rmAfterPay.err.includes("has payments"), `${errOf(pay)} ${errOf(rmAfterPay)}`);
      const cidem = randomUUID();
      const cl = await as(owner, `select public.check_close($1,$2)`, [chk, cidem]);
      const cl2 = await as(owner, `select public.check_close($1,$2)`, [chk, cidem]);
      const frozen = await one<{ frozen_at: string | null }>(`select frozen_at from public.check_referrals where check_id=$1`, [chk]);
      const po = await q<{ id: string; status: string; amount: number; withholding: number; referrer_id: string; biz_date: string }>(`select id, status, amount, withholding, referrer_id, biz_date from public.referral_payouts where check_id=$1`, [chk]);
      check("re(4-2) check_close → frozen_at・referral_payouts 1 行（unpaid・amount 800・withholding 0・referrer＝甲）・同 idem 再送でも 1 行", cl.ok && cl2.ok && frozen.frozen_at !== null && po.length === 1 && po[0].status === "unpaid" && po[0].amount === 800 && po[0].withholding === 0 && po[0].referrer_id === refS, `${errOf(cl)} ${errOf(cl2)} ${JSON.stringify(po)}`);
      const rmFrozen = await as(owner, `select public.check_referral_remove($1)`, [chk]);
      check("re(4-3) 確定後の remove は 'not open'（status 判定が先・frozen は到達しない）", !rmFrozen.ok && (rmFrozen.err.includes("not open") || rmFrozen.err.includes("frozen")), errOf(rmFrozen));
      const seat3 = await seatOf("NOX-VERIFY-0152卓3");
      const op3 = await as(owner, `select public.check_open($1, null, 'free', null, null, null) id`, [seat3]); const chk3 = op3.ok ? (op3.rows[0].id as string) : NIL;
      await as(owner, `select public.check_add_line($1, null, 1, 'custom', 'A', 'カスタム', 2000)`, [chk3]);
      await as(owner, `select public.check_referral_set($1,$2,'set_rate',1000,'store',null,null)`, [chk3, refN]);
      const t3 = await totalOf(chk3);
      await as(owner, `select public.check_pay($1,'cash',$2,'A',$2,$3,null)`, [chk3, t3, randomUUID()]);
      const cl3 = await as(owner, `select public.check_close($1,$2)`, [chk3, randomUUID()]);
      check("re(4-4) amount=0（set 行なし×set_rate）は close で payout を作らない（D11）・frozen_at は書く", cl3.ok && (await one<{ n: number }>(`select count(*)::int n from public.referral_payouts where check_id=$1`, [chk3])).n === 0 && (await one<{ f: string | null }>(`select frozen_at f from public.check_referrals where check_id=$1`, [chk3])).f !== null, errOf(cl3));

      // ── (5) payout pay ──
      const poId = po[0].id; const pidem = randomUUID();
      const p1 = await as(mgr, `select public.referral_payout_pay($1,'cash_daily',$2) id`, [poId, pidem]);
      const p1b = await as(mgr, `select public.referral_payout_pay($1,'cash_daily',$2) id`, [poId, pidem]);
      const p1c = await as(mgr, `select public.referral_payout_pay($1,'cash_daily',$2) id`, [poId, randomUUID()]);
      const po1 = await one<{ status: string; paid_via: string; paid_by: string; withholding: number }>(`select status, paid_via, paid_by, withholding from public.referral_payouts where id=$1`, [poId]);
      check("re(5-1) referral_payout_pay（manager・cash_daily）→ paid・paid_by・同 idem 再送 OK・別 idem は 'already paid'・累計 800 < 120,000 → withholding 0・audit 1", p1.ok && p1b.ok && !p1c.ok && p1c.err.includes("already paid") && po1.status === "paid" && po1.paid_via === "cash_daily" && po1.paid_by === mgr.id && po1.withholding === 0 && (await one<{ n: number }>(`select count(*)::int n from public.audit_logs where action='referral_payout_pay'`)).n === 1, `${errOf(p1)} ${errOf(p1c)} ${JSON.stringify(po1)}`);
      const mk = async (amount: number, referrer: string) => {
        const s = await seatOf("NOX-VERIFY-0152-" + amount + "-" + Math.random().toString(36).slice(2, 6));
        const o = await as(owner, `select public.check_open($1, null, 'free', null, null, null) id`, [s]); if (!o.ok) throw new Error("open: " + o.err);
        const c = o.rows[0].id as string;
        await as(owner, `select public.check_add_line($1, null, 1, 'custom', 'A', 'カスタム', 1000)`, [c]);
        const r = await as(owner, `select public.check_referral_set($1,$2,'fixed_per_group',$3,'store',null,null)`, [c, referrer, amount]); if (!r.ok) throw new Error("set: " + r.err);
        const tt = await totalOf(c);
        await as(owner, `select public.check_pay($1,'cash',$2,'A',$2,$3,null)`, [c, tt, randomUUID()]);
        const cc = await as(owner, `select public.check_close($1,$2)`, [c, randomUUID()]); if (!cc.ok) throw new Error("close: " + cc.err);
        return (await one<{ id: string }>(`select id from public.referral_payouts where check_id=$1`, [c])).id;
      };
      const pA = await mk(150000, refS), pB = await mk(10000, refS);
      const wA = await as(owner, `select public.referral_payout_pay($1,'monthly',$2)`, [pA, randomUUID()]);
      const whA = (await one<{ w: number }>(`select withholding w from public.referral_payouts where id=$1`, [pA])).w;
      const wB = await as(owner, `select public.referral_payout_pay($1,'monthly',$2)`, [pB, randomUUID()]);
      const whB = (await one<{ w: number }>(`select withholding w from public.referral_payouts where id=$1`, [pB])).w;
      const expA = Math.floor((150000 + 800 - 120000) * 1021 / 10000), expB = Math.floor((160800 - 120000) * 1021 / 10000) - expA;
      check(`re(5-2) salesperson の源泉（298-7）: 150,000 → floor((150,800−120,000)×0.1021)＝${expA}（同月累計に 5-1 の 800 を含む）／次の 10,000 → 差分 ${expB}`, wA.ok && wB.ok && whA === expA && whB === expB, `${errOf(wA)} whA=${whA} whB=${whB}`);

      // ── (6) bulk ──
      const pC = await mk(3000, refE), pD = await mk(4000, refN);
      const bidem = randomUUID();
      const bk = await as(owner, `select public.referral_payouts_pay_bulk($1,'monthly',$2) n`, [[pC, pD], bidem]);
      const bk2 = await as(owner, `select public.referral_payouts_pay_bulk($1,'monthly',$2) n`, [[pC, pD], bidem]);
      const bk3 = await as(owner, `select public.referral_payouts_pay_bulk($1,'monthly',$2) n`, [[pC, pD], randomUUID()]);
      const paidCD = (await one<{ n: number }>(`select count(*)::int n from public.referral_payouts where id = any($1) and status='paid' and withholding=0`, [[pC, pD]])).n;
      check("re(6-1) pay_bulk 2 件 → 2・同 idem 再送 → 2（冪等）・別 idem → 'already paid'（部分成功なし）・employee／none は withholding 0", bk.ok && bk.rows[0].n === 2 && bk2.ok && bk2.rows[0].n === 2 && !bk3.ok && bk3.err.includes("already paid") && paidCD === 2, `${errOf(bk)} ${errOf(bk3)}`);

      // ── (7) unpaid ──
      const pE = await mk(5000, refE);
      const ul = await as(mgr, `select * from public.referral_payouts_unpaid($1, null, null)`, [A1.id]);
      const ulC = await as(castU, `select * from public.referral_payouts_unpaid($1, null, null)`, [A1.id]);
      const ulB = await as(mgrB, `select * from public.referral_payouts_unpaid($1, null, null)`, [A1.id]);
      const ulR = await as(mgr, `select * from public.referral_payouts_unpaid($1, '2000-01-01', '2000-01-02')`, [A1.id]);
      check("re(7-1) referral_payouts_unpaid（manager）→ 未払 1 行（pE・紹介者名）・cast／他 org は 'forbidden'・期間外は 0 行", ul.ok && ul.rows.length === 1 && ul.rows[0].payout_id === pE && ul.rows[0].referrer_name === "黒服 乙" && !ulC.ok && ulC.err.includes("forbidden") && !ulB.ok && ulB.err.includes("forbidden") && ulR.ok && ulR.rows.length === 0, `${errOf(ul)} n=${ul.ok ? ul.rows.length : "-"}`);

      // ── (8) void ──
      const chkE = (await one<{ c: string }>(`select check_id c from public.referral_payouts where id=$1`, [pE])).c;
      const vd = await as(owner, `select public.check_void($1,'verify void')`, [chkE]);
      const chkA = (await one<{ c: string }>(`select check_id c from public.referral_payouts where id=$1`, [pA])).c;
      const vd2 = await as(owner, `select public.check_void($1,'verify void 2')`, [chkA]);
      const stE = (await one<{ s: string }>(`select status s from public.referral_payouts where id=$1`, [pE])).s, stA = (await one<{ s: string }>(`select status s from public.referral_payouts where id=$1`, [pA])).s;
      const au = await one<{ before_json: { referral_payouts?: unknown[] } }>(`select before_json from public.audit_logs where action='check_void' and target=$1 order by at desc limit 1`, ["checks:" + chkA]);
      check("re(8-1) check_void: unpaid → 'voided'／paid → 据え置き（void は通る）・before に referral_payouts", vd.ok && vd2.ok && stE === "voided" && stA === "paid" && Array.isArray(au?.before_json?.referral_payouts) && au.before_json.referral_payouts!.length === 1, `${errOf(vd)} ${errOf(vd2)} ${stE}/${stA}`);

      // ── (9) daily_report_close ──
      const today = (await one<{ d: string }>(`select public.biz_date_of($1, now()) d`, [A1.id])).d;
      const drc = await as(owner, `select public.daily_report_close($1,$2,0,0,0,0,'verify 0152',true,$3) id`, [A1.id, today, randomUUID()]);
      const dr = drc.ok ? await one<{ cash: number; cash_float: number; ar_collected: number; expense: number; cash_payout: number; referral_cash_payout: number; diff: number; counted_cash: number }>(`select cash, cash_float, ar_collected, expense, cash_payout, referral_cash_payout, diff, counted_cash from public.daily_reports where id=$1`, [drc.rows[0].id]) : null;
      check("re(9-1) daily_report_close → referral_cash_payout=800（cash_daily・今日）・diff = counted − (float + cash + ar − expense − payout − referral_cash_payout)（299-2）", drc.ok && !!dr && dr.referral_cash_payout === 800 && dr.diff === dr.counted_cash - (dr.cash_float + dr.cash + dr.ar_collected - dr.expense - dr.cash_payout - dr.referral_cash_payout), `${errOf(drc)} ${JSON.stringify(dr)}`);

      // ── (10) RLS／CHECK ──
      const liveRef = (await one<{ n: number }>(`select count(*)::int n from public.referrers where store_id = $1`, [A1.id])).n; // 本 tx の 3 行＋他 suite が tx 外で残した行（pricing の 'verify 紹介者'）
      const rlsC = await as(castU, `select count(*)::int n from public.referrers`), rlsM = await as(mgr, `select count(*)::int n from public.referrers`), rlsA = await as("anon", `select count(*)::int n from public.referrers`), rlsB = await as(mgrB, `select count(*)::int n from public.referral_payouts`);
      check(`re(10-1) RLS: cast 0 行・manager A1 は自店の全行（${liveRef}＝本 tx の 3 行を含む）・他 org 0 行・anon は permission denied for table`, rlsC.ok && rlsC.rows[0].n === 0 && rlsM.ok && rlsM.rows[0].n === liveRef && liveRef >= 3 && rlsB.ok && rlsB.rows[0].n === 0 && !rlsA.ok && rlsA.err.includes("permission denied for table"), `${JSON.stringify([rlsC, rlsM, rlsB].map((r) => (r.ok ? r.rows[0].n : r.err)))} ${errOf(rlsA)}`);
      const badKind = await T.call(`insert into public.check_lines (org_id, store_id, check_id, kind, name_snapshot, unit_price_snapshot, qty, line_total) values ($1,$2,$3,'referral','x',1,1,1)`, [orgA, A1.id, chk]);
      check("re(10-2) kind='referral' の insert は CHECK 違反（0152 で除去）", !badKind.ok && badKind.err.includes("check_lines_kind_check"), errOf(badKind));
    } finally {
      await T.asPg();
      await db.query("rollback");
    }
    const after = JSON.stringify(await one(snapSql, [A1.id, orgA]));
    check("re(0-2) ROLLBACK 後の残留＝実行前と同値（checks／lines／audit／daily_reports／seats／referrers／check_referrals／referral_payouts）", after === before, `${before} → ${after}`);
  } finally {
    await db.end().catch(() => undefined);
  }

  // ── (11) 三面鏡（純関数・DB 不要）──
  const s10 = { service_rate: 10, round_unit: 1, round_mode: "round" };
  const lines: ReceiptLine[] = [
    { name_snapshot: "セット", qty: 2, unit_price_snapshot: 3000, line_total: 6000, kind: "set", fee_kind: "set", block_no: 0 },
    { name_snapshot: "ビール", qty: 1, unit_price_snapshot: 800, line_total: 800, kind: "drink" },
    { name_snapshot: "割引", qty: 1, unit_price_snapshot: 500, line_total: 500, kind: "discount" },
  ];
  const dueRef = groupDueFull(lines as DueLine[], s10, 1000);
  const t8: ReceiptInput = { store: { name: "NOX-VERIFY", address: "", tel: "", reg_no: "", footer: "" }, check: { id: "0152015201520152", closed_at: "2097-01-01T00:00:00+09:00", nom_type: "free" }, payGroup: "A", lines, payments: [{ method: "cash", amount: dueRef, tendered: null }], serviceRate: 10, groupDue: dueRef, isReprint: false };
  const xml = buildReceiptXml({ ...t8, referral: { amount: 1000, burden: "customer" } });
  check("re(11-1) ★receipt.ts: 客負担 1000 は初回セット行に合算（セット x2 ¥7,000）・紹介行なし・小計 ¥7,800・合計＝groupDueFull(…,1000)・端数調整なし", xml.includes("¥7,000") && !xml.includes("紹介") && xml.includes("¥7,800") && xml.includes(`¥${dueRef.toLocaleString("en-US")}`) && !xml.includes("端数調整") && referralTargetIndex(lines) === 0, xml.slice(0, 500));
  const xs = buildReceiptXml({ ...t8, groupDue: groupDueFull(lines as DueLine[], s10), referral: { amount: 1000, burden: "store" } });
  check("re(11-2) 店負担は据え置き（セット ¥6,000・小計 ¥6,800）・第 3 引数なしの groupDueFull と同値", xs.includes("¥6,000") && xs.includes("¥6,800") && !xs.includes("¥7,000"));
  check("re(11-3) 鏡像性質: 客負担 n ≡ taxable_10 行 n を A に足したもの（内税）", groupDueFull(lines as DueLine[], s10, 1000) === groupDueFull([...(lines as DueLine[]), { line_total: 1000, kind: "custom", tax_category: "taxable_10" }], s10));

  // ── (12) client 結線（逐語 grep）──
  const rb = fs.readFileSync("app/(manage)/register/register-board.tsx", "utf8");
  const kiosk = fs.readFileSync("app/kiosk-register/page.tsx", "utf8");
  const payTs = fs.readFileSync("lib/nox/pay.ts", "utf8");
  const cc = fs.readFileSync("lib/nox/check-calc.ts", "utf8");
  const rc = fs.readFileSync("lib/nox/receipt.ts", "utf8");
  const pr = fs.readFileSync("app/api/print/poll/[store_token]/route.ts", "utf8");
  const nav = fs.readFileSync("lib/nox/master/nav.ts", "utf8");
  check("re(12-1) register-board: check_referral_set／remove を呼ぶ・p_idem_key＝crypto.randomUUID()・check_add_referral なし・旧 helper import なし・groupDueFull に第 3 引数・'no people' の和文", rb.includes('supabase.rpc("check_referral_set"') && rb.includes('supabase.rpc("check_referral_remove"') && rb.includes("p_idem_key: crypto.randomUUID()") && !rb.includes("check_add_referral") && !rb.includes("lib/nox/register/referral") && rb.includes("groupDueFull(gl, check, refCustomer)") && rb.includes("人数を先に入力してください"));
  check("re(12-2) pay.ts／payroll に referralTotal なし・check-calc／receipt に kind 'referral' 除外なし・第 3 引数 referralCustomer・receipt は referralTargetIndex・print route は check_referrals を読み groupDueFull を使う", !payTs.includes("referralTotal") && !cc.includes('kind !== "referral"') && cc.includes("referralCustomer") && rc.includes("referralTargetIndex") && !rc.includes('kind !== "referral"') && pr.includes('from("check_referrals")') && pr.includes("groupDueFull(") && !fs.existsSync("lib/nox/register/referral.ts"));
  check("re(12-3) kiosk-register に紹介の入口なし・マスタ「紹介者」ページと nav 行", !kiosk.includes("check_referral") && !kiosk.includes("紹介") && fs.existsSync("app/(manage)/master/referrers/referrers-board.tsx") && nav.includes('href: "/master/referrers"'));

  // ── (13) anon: 公開 6 本 BLOCKED ──
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  for (const [fn, args] of [
    ["set_referrer", { p_id: null, p_store_id: null, p_kind: null, p_membership_id: null, p_name: null, p_contact: null, p_withholding_category: null, p_is_active: null }],
    ["check_referral_set", { p_check_id: null, p_referrer_id: null, p_method: null, p_value: null, p_burden: null, p_idem_key: null, p_memo: null }],
    ["check_referral_remove", { p_check_id: null }],
    ["referral_payout_pay", { p_payout_id: null, p_paid_via: null, p_idem_key: null }],
    ["referral_payouts_pay_bulk", { p_payout_ids: null, p_paid_via: null, p_idem_key: null }],
    ["referral_payouts_unpaid", { p_store_id: null, p_from: null, p_to: null }],
  ] as const) {
    const { error } = await anon.rpc(fn, args as Record<string, unknown>);
    check(`re(13) anon ${fn} BLOCKED`, !!error?.message?.includes("permission denied for function"), error?.message ?? "(no error)");
  }
  void STORE_A1; void FIXTURE_USERS;

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-referral ALL PASS (${pass} assertions)`);
  console.log("紹介料(0152・裁定298／299): set_referrer 3 種＋拒否 8／set・exists・remove→客負担（三面鏡 第 3 引数）・recalc・拒否 8・inactive・fixed_per_person・no people／merge／close→frozen＋payout・D11・has payments／pay 冪等・源泉差分／bulk／unpaid／void／日報 referral_cash_payout／RLS・CHECK／receipt 合算／client 結線／anon 6");
}

main().catch((e) => { console.error(e); process.exit(1); });
