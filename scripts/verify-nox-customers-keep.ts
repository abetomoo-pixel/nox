/*
 * verify:nox-customers-keep — mig0153（裁定305／307・2026-09-25）: 伝票の顧客複数・注文者・ボトルキープ（キープ出し）・顧客別売上・区分別固定額の係留。
 *   npm run verify:nox-customers-keep（env: SUPABASE_DB_URL・seed:f0 済み）。f0 77 段目。Postgres 直結の 1 トランザクション内で JWT を emulate（fixtures-pgtx）
 *   → 最後に ROLLBACK＝残留 0（商品／卓／プラン／cast_plan／指名／店設定の書き換えはすべて tx 内）。便 M153-3 の突合（docs/tmp/q0925_ag_0153.mjs）d 段 21 を移植。
 *
 *  (1) check_open(顧客)→check_customers position 0＝checks.customer_id／add 2 人→3 人・'exists'・'invalid customer'／line_set 'not on check'／names（can_register の cast・pos 順・電話なし）／
 *      remove position 0→繰り上がり＋checks.customer_id 追従＋行 null／再追加は末尾
 *  (2) bottle_keep_register（9 引数・bottle_name・購入行の持ち主）／bottle_keep_out（kind keep_out・¥0・product_id null・total 不変・stock_logs 不変・last_used_at・冪等）・'keep not active'／bottle_keep_update（7 引数）
 *  (3) check_merge の付け替え／check_close→last_visit_at・retention_until（既定 5 年・店設定 3 年）／customer_sales_summary（均等割り・端数 position 0・cast forbidden）
 *  (4) plan_fixed 区分別（本 500＋unit4 700／場内 300＋unit4.jonai 400・cast_plan 上書き 600・同伴＝本・フリー 200）／set_comp_plan 22 引数／set_store_profile +2／set_cast_plan 白名単 +3
 *  (5) demo_org_reset 配列／権限（can_register なし cast・他 org）／keep_out の kiosk 腕（prosrc pin）／anon 6 本 BLOCKED／ROLLBACK 後 snapshot 一致
 *  逆テスト（手動・1 回）: 本 suite の (1) の 'exists' 期待語を 'exist' 以外にする→ck(1-2) 赤・戻して緑。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { loadEnvOrExit } from "./fixtures-f0";
import { pgTx } from "./fixtures-pgtx";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_DB_URL"]);
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const NEW6 = ["check_customer_add", "check_customer_remove", "check_line_set_customer", "check_customer_names", "bottle_keep_out", "customer_sales_summary"];

async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 180000 });
  await db.connect();
  const T = pgTx(db);
  const { q, one, errOf, as } = T;
  try {
    const A1 = await one<{ id: string; org_id: string; settings_json: Record<string, unknown> | null }>("select id, org_id, settings_json from public.stores where name='NOX-VERIFY-A1'");
    const B1 = await one<{ id: string; org_id: string }>("select id, org_id from public.stores where name='NOX-VERIFY-B1'");
    const uidOf = async (email: string) => one<{ id: string; auth_user_id: string }>("select id, auth_user_id from public.users where email=$1 and is_active", [email]);
    const owner = await uidOf("nox-verify-owner-a@example.com"), mgr = await uidOf("nox-verify-manager-a1@example.com"), castU = await uidOf("nox-verify-cast-a1a@example.com"), castU2 = await uidOf("nox-verify-cast-a1b@example.com");
    const castA = (await one<{ id: string }>("select id from public.casts where store_id=$1 and user_id=$2", [A1.id, castU.id]))?.id;
    const castB = (await one<{ id: string }>("select id from public.casts where store_id=$1 and user_id=$2", [A1.id, castU2.id]))?.id;
    const custs = Object.fromEntries((await q<{ id: string; name: string }>("select id, name from public.customers where store_id=$1 and name in ('NOX-VERIFY-顧客-指名A','NOX-VERIFY-顧客-指名B','NOX-VERIFY-顧客-フリー')", [A1.id])).map((r) => [r.name.replace("NOX-VERIFY-顧客-", ""), r.id]));
    const custB1 = (await one<{ id: string }>("select id from public.customers where store_id=$1 limit 1", [B1.id]))?.id;
    const seat = (await one<{ id: string }>("select id from public.seats where store_id=$1 and name='NOX-VERIFY-CRM卓'", [A1.id]))?.id;
    check("ck(0-1) fixture: A1／B1／owner／manager／cast a1a・a1b／顧客 3／他 org 顧客／CRM 卓", !!A1 && !!B1 && !!owner && !!mgr && !!castA && !!castB && Object.keys(custs).length === 3 && !!custB1 && !!seat);
    if (!seat || !castA || !castB || Object.keys(custs).length !== 3) throw new Error("fixture 解決失敗");
    const snapSql = `select (select count(*)::int from public.checks) ch, (select count(*)::int from public.check_lines) cl, (select count(*)::int from public.check_customers) cc, (select count(*)::int from public.customers) cu, (select count(*)::int from public.bottle_keeps) bk,
      (select count(*)::int from public.products) pr, (select count(*)::int from public.comp_plans) cp, (select count(*)::int from public.stock_logs) sl, (select count(*)::int from public.cast_plan) cpl, (select settings_json::text from public.stores where id=$1) sj`;
    const before = JSON.stringify(await one(snapSql, [A1.id]));
    const today = (await one<{ d: string }>("select public.biz_date_of($1, now())::text d", [A1.id])).d;
    await db.query("begin");
    try {
      await db.query("delete from public.daily_reports where store_id=$1 and biz_date=$2::date", [A1.id, today]);
      await db.query("update public.memberships set can_register = true where user_id=$1 and store_id=$2", [castU.id, A1.id]);
      await db.query("update public.stores set settings_json = jsonb_set(coalesce(settings_json,'{}'::jsonb), '{cast_register_enabled}', '\"true\"'::jsonb) where id=$1", [A1.id]);
      const ff = await one<{ id: string }>("select id from public.feature_flags where store_id=$1 and key='reopen_flow'", [A1.id]);
      if (ff) await db.query("update public.feature_flags set enabled=true where id=$1", [ff.id]); else await db.query("insert into public.feature_flags (org_id, store_id, key, enabled) values ($1,$2,'reopen_flow',true)", [A1.org_id, A1.id]);
      const P1 = (await one<{ id: string }>("insert into public.products (org_id, store_id, type, name, price, back_mode, unit4_json, hon_pt) values ($1,$2,'bottle','ck-unit4 ボトル',5000,'unit4','{\"hon\":700,\"jonai\":400,\"dohan\":700,\"free\":250}'::jsonb,0) returning id", [A1.org_id, A1.id])).id;
      const P2 = (await one<{ id: string }>("insert into public.products (org_id, store_id, type, name, price, back_mode, back_value, hon_pt) values ($1,$2,'drink','ck-rate ドリンク',3000,'rate',10,0) returning id", [A1.org_id, A1.id])).id;
      const seat2 = (await one<{ id: string }>("insert into public.seats (org_id, store_id, name, kind, sort_order, is_active) values ($1,$2,'ck-一時卓','卓',999,true) returning id", [A1.org_id, A1.id])).id;
      // (1)
      const o1 = await as(mgr, "select public.check_open($1, 2, 'free', $2, null, null) id", [seat, custs["指名A"]]);
      const chk = o1.ok ? (o1.rows[0].id as string) : "";
      const cc = async () => q<{ customer_id: string; position: number }>("select customer_id, position from public.check_customers where check_id=$1 order by position", [chk]);
      check("ck(1-1) check_open(顧客あり) → check_customers 1 行 position 0＝checks.customer_id（305-1）", o1.ok && (await cc()).length === 1 && (await cc())[0].position === 0 && (await one<{ customer_id: string }>("select customer_id from public.checks where id=$1", [chk])).customer_id === custs["指名A"], errOf(o1));
      const a1 = await as(mgr, "select public.check_customer_add($1,$2) id", [chk, custs["指名B"]]);
      const a2 = await as(mgr, "select public.check_customer_add($1,$2) id", [chk, custs["フリー"]]);
      const a3 = await as(mgr, "select public.check_customer_add($1,$2) id", [chk, custs["指名A"]]);
      const a4 = await as(mgr, "select public.check_customer_add($1,$2) id", [chk, custB1]);
      check("ck(1-2) add 2 人 → 3 人（position 0,1,2）・同じ顧客は 'exists'・他 org 顧客は 'invalid customer'", a1.ok && a2.ok && (await cc()).map((r) => r.position).join(",") === "0,1,2" && !a3.ok && a3.err.includes("exists") && !a4.ok && a4.err.includes("invalid customer"), [a1, a2, a3, a4].map(errOf).join(" | "));
      const l1 = await as(mgr, "select public.check_add_line($1,$2,2,null,'A',null,null) id", [chk, P1]);
      const l2 = await as(mgr, "select public.check_add_line($1,$2,1,null,'A',null,null) id", [chk, P2]);
      const l3 = await as(mgr, "select public.check_add_line($1,null,1,'custom','A','ck 端数行',10) id", [chk]);
      const L1 = l1.ok ? (l1.rows[0].id as string) : "", L2 = l2.ok ? (l2.rows[0].id as string) : "";
      const s1 = await as(mgr, "select public.check_line_set_customer($1,$2)", [L2, custs["指名B"]]);
      const s2 = await as(mgr, "select public.check_line_set_customer($1,$2)", [L1, custB1]);
      const s3 = await as(mgr, "select public.check_line_set_customer($1,$2)", [L1, custs["指名A"]]);
      check("ck(1-3) line_set_customer: 伝票の顧客なら付く・付いていない顧客は 'not on check'", l1.ok && l2.ok && l3.ok && s1.ok && !s2.ok && s2.err.includes("not on check") && s3.ok && (await one<{ customer_id: string }>("select customer_id from public.check_lines where id=$1", [L2])).customer_id === custs["指名B"], [s1, s2, s3].map(errOf).join(" | "));
      const nm = await as(castU, "select * from public.check_customer_names($1)", [chk]);
      check("ck(1-4) check_customer_names: can_register の cast で 3 行（pos 順・name・bottle_names）・列に tel／memo／birthday／grade なし", nm.ok && nm.rows.length === 3 && nm.rows.map((r) => r.pos).join(",") === "0,1,2" && Object.keys(nm.rows[0]).sort().join(",") === "bottle_names,customer_id,name,pos", nm.ok ? Object.keys(nm.rows[0]).join(",") : nm.err);
      const rm = await as(mgr, "select public.check_customer_remove($1,$2)", [chk, custs["指名A"]]);
      const after = await cc();
      check("ck(1-5) remove position 0 → 繰り上がり（指名B 0・フリー 1）・checks.customer_id＝指名B・指名A が注文者だった行は null・指名B の行は保持", rm.ok && after.length === 2 && after[0].customer_id === custs["指名B"] && after[0].position === 0 && after[1].position === 1
        && (await one<{ customer_id: string }>("select customer_id from public.checks where id=$1", [chk])).customer_id === custs["指名B"]
        && (await one<{ customer_id: string | null }>("select customer_id from public.check_lines where id=$1", [L1])).customer_id === null
        && (await one<{ customer_id: string }>("select customer_id from public.check_lines where id=$1", [L2])).customer_id === custs["指名B"], errOf(rm));
      const a5 = await as(mgr, "select public.check_customer_add($1,$2) id", [chk, custs["指名A"]]);
      check("ck(1-6) 再追加 → 末尾 position 2", a5.ok && (await cc())[2]?.customer_id === custs["指名A"], errOf(a5));
      // (2)
      const kr = await as(mgr, "select public.bottle_keep_register($1,$2,$3,null,80,null,null,'ボトルX',$4) id", [A1.id, custs["指名B"], P1, L1]);
      const keep = kr.ok ? (kr.rows[0].id as string) : "";
      const krBad = await as(mgr, "select public.bottle_keep_register($1,$2,$3,null,null,null,null,'ボトルY',$4) id", [A1.id, custB1, P1, L1]);
      check("ck(2-1) bottle_keep_register（9 引数）: bottle_name・購入行の customer_id＝持ち主（指名B・307-2）／他 org 顧客は 'invalid customer'", kr.ok && (await one<{ bottle_name: string }>("select bottle_name from public.bottle_keeps where id=$1", [keep])).bottle_name === "ボトルX" && (await one<{ customer_id: string }>("select customer_id from public.check_lines where id=$1", [L1])).customer_id === custs["指名B"] && !krBad.ok && krBad.err.includes("invalid customer"), [kr, krBad].map(errOf).join(" | "));
      const totBefore = (await one<{ total: number }>("select total from public.checks where id=$1", [chk])).total;
      const slBefore = (await one<{ n: number }>("select count(*)::int n from public.stock_logs where product_id=$1", [P1])).n;
      const kkey = randomUUID();
      const ko = await as(mgr, "select public.bottle_keep_out($1,$2,$3) id", [keep, chk, kkey]);
      const koLine = ko.ok ? await one<{ kind: string; qty: number; unit_price_snapshot: number; line_total: number; back_snapshot: unknown; product_id: string | null; name_snapshot: string; customer_id: string }>("select kind, qty, unit_price_snapshot, line_total, back_snapshot, product_id, name_snapshot, customer_id from public.check_lines where id=$1", [ko.rows[0].id]) : null;
      const ko2 = await as(mgr, "select public.bottle_keep_out($1,$2,$3) id", [keep, chk, kkey]);
      check("ck(2-2) bottle_keep_out: kind keep_out・qty 1・¥0・back null・product_id null・「キープ出し ボトルX」・customer_id＝持ち主／total 不変／stock_logs 不変／last_used_at 更新／同キー再送＝同 id", ko.ok && !!koLine && koLine.kind === "keep_out" && koLine.qty === 1 && koLine.unit_price_snapshot === 0 && koLine.line_total === 0 && koLine.back_snapshot === null && koLine.product_id === null && koLine.name_snapshot === "キープ出し ボトルX" && koLine.customer_id === custs["指名B"]
        && (await one<{ total: number }>("select total from public.checks where id=$1", [chk])).total === totBefore && (await one<{ n: number }>("select count(*)::int n from public.stock_logs where product_id=$1", [P1])).n === slBefore
        && (await one<{ l: string | null }>("select last_used_at::text l from public.bottle_keeps where id=$1", [keep])).l !== null && ko2.ok && ko2.rows[0].id === ko.rows[0].id, [ko, ko2].map(errOf).join(" | "));
      await db.query("update public.bottle_keeps set status='empty' where id=$1", [keep]);
      const ko3 = await as(mgr, "select public.bottle_keep_out($1,$2,$3) id", [keep, chk, randomUUID()]);
      await db.query("update public.bottle_keeps set status='active' where id=$1", [keep]);
      const ku = await as(mgr, "select public.bottle_keep_update($1,80,null,null,'active',null,'ボトルZ')", [keep]);
      check("ck(2-3) status≠active は 'keep not active'／bottle_keep_update（7 引数）で bottle_name 更新", !ko3.ok && ko3.err.includes("keep not active") && ku.ok && (await one<{ bottle_name: string }>("select bottle_name from public.bottle_keeps where id=$1", [keep])).bottle_name === "ボトルZ", [ko3, ku].map(errOf).join(" | "));
      // (3)
      const o2 = await as(mgr, "select public.check_open($1, 1, 'free', $2, null, null) id", [seat2, custs["フリー"]]);
      const chk2 = o2.ok ? (o2.rows[0].id as string) : "";
      await as(mgr, "select public.check_customer_add($1,$2) id", [chk2, custs["指名A"]]);
      const mg = await as(mgr, "select public.check_merge($1,$2,'ck 突合',$3) id", [chk2, chk, randomUUID()]);
      check("ck(3-1) check_merge: from の顧客（into に既存）→ into は 3 人のまま（重複 skip・連番）・from の check_customers 0", mg.ok && (await cc()).map((r) => r.position).join(",") === "0,1,2" && (await one<{ n: number }>("select count(*)::int n from public.check_customers where check_id=$1", [chk2])).n === 0, [o2, mg].map(errOf).join(" | "));
      const due = (await one<{ d: number }>("select public.check_group_due($1,'A') d", [chk])).d;
      const pay = await as(mgr, "select public.check_pay($1,'cash',$2,'A',null,$3,null) id", [chk, due, randomUUID()]);
      const cl = await as(mgr, "select public.check_close($1,$2) id", [chk, randomUUID()]);
      const visits = await q<{ id: string; last_visit_at: string | null; retention_until: string | null }>("select id, last_visit_at::text as last_visit_at, retention_until::text as retention_until from public.customers where id = any($1)", [Object.values(custs)]);
      const exp5 = (await one<{ d: string }>("select (now() + interval '5 years')::date::text d")).d;
      check("ck(3-2) check_close: 伝票の顧客 3 人の last_visit_at＝now・retention_until＝＋5 年（既定）", pay.ok && cl.ok && visits.length === 3 && visits.every((v) => v.last_visit_at !== null && v.retention_until === exp5), [pay, cl].map(errOf).join(" | "));
      const lines = await q<{ customer_id: string | null; line_total: number }>("select customer_id, line_total from public.check_lines where check_id=$1", [chk]);
      const ccs = await cc();
      const exp: Record<string, number> = {}; for (const c of ccs) exp[c.customer_id] = 0;
      for (const l of lines) { if (l.customer_id) exp[l.customer_id] = (exp[l.customer_id] ?? 0) + l.line_total; else { const n = ccs.length; const base = Math.trunc(l.line_total / n); for (const c of ccs) exp[c.customer_id] += base + (c.position === 0 ? l.line_total - base * n : 0); } }
      const ss = await as(mgr, "select * from public.customer_sales_summary($1,$2::date,$3::date)", [A1.id, today, today]);
      const got: Record<string, number> = ss.ok ? Object.fromEntries(ss.rows.map((r) => [r.customer_id as string, Number(r.amount)])) : {};
      check("ck(3-3) customer_sales_summary: 注文者つき行＝その顧客・なし＝均等割り・端数は position 0（10 円→4/3/3）・cast は forbidden", ss.ok && ccs.every((c) => got[c.customer_id] === exp[c.customer_id]) && !(await as(castU, "select * from public.customer_sales_summary($1,$2::date,$3::date)", [A1.id, today, today])).ok, JSON.stringify({ got, exp }));
      // (4)
      const PF = (await one<{ id: string }>("insert into public.comp_plans (org_id, store_id, name, base, product_back_mode, product_back_fixed, product_back_fixed_hon, product_back_fixed_jonai, product_back_fixed_free) values ($1,$2,'ck-plan_fixed',1000,'plan_fixed',100,500,300,200) returning id", [A1.org_id, A1.id])).id;
      await db.query("delete from public.cast_plan where cast_id = any($1)", [[castA, castB]]);
      await db.query("insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json) values ($1,$2,$3,$4,'{}'::jsonb), ($5,$2,$3,$4,'{}'::jsonb)", [castA, A1.org_id, A1.id, PF, castB]);
      const o3 = await as(mgr, "select public.check_open($1, 2, 'free', null, null, null) id", [seat]);
      const chk3 = o3.ok ? (o3.rows[0].id as string) : "";
      await db.query("insert into public.check_nominations (org_id, store_id, check_id, cast_id, ratio_weight, position, nom_kind, is_dohan) values ($1,$2,$3,$4,1,0,'hon',false), ($1,$2,$3,$5,1,1,'jonai',false)", [A1.org_id, A1.id, chk3, castA, castB]);
      await as(mgr, "select public.check_add_line($1,$2,2,null,'A',null,null) id", [chk3, P2]);
      await as(mgr, "select public.check_add_line($1,$2,2,null,'A',null,null) id", [chk3, P1]);
      await as(mgr, "select public.check_pay($1,'cash',$2,'A',null,$3,null) id", [chk3, (await one<{ d: number }>("select public.check_group_due($1,'A') d", [chk3])).d, randomUUID()]);
      const cl3 = await as(mgr, "select public.check_close($1,$2) id", [chk3, randomUUID()]);
      const backs = Object.fromEntries((await q<{ cast_id: string; source_mode: string; calculated_back_amount: number }>("select cast_id, source_mode, calculated_back_amount from public.check_cast_backs where check_id=$1", [chk3])).map((r) => [r.cast_id, r]));
      check("ck(4-1) plan_fixed 区分別（305-12／307-4）: 本 A＝500×1＋unit4 700×1＝1,200・場内 B＝300×1＋unit4.jonai 400×1＝700", cl3.ok && backs[castA]?.source_mode === "plan_fixed" && backs[castA]?.calculated_back_amount === 1200 && backs[castB]?.calculated_back_amount === 700, JSON.stringify(backs));
      const sp = await as(mgr, "select public.set_cast_plan($1,$2,'{\"productBackFixedHon\":600}'::jsonb,null) id", [castA, PF]);
      const spBad = await as(mgr, "select public.set_cast_plan($1,$2,'{\"productBackFixedHon\":-1}'::jsonb,null) id", [castA, PF]);
      const o4 = await as(mgr, "select public.check_open($1, 2, 'free', null, null, null) id", [seat]);
      const chk4 = o4.ok ? (o4.rows[0].id as string) : "";
      await db.query("insert into public.check_nominations (org_id, store_id, check_id, cast_id, ratio_weight, position, nom_kind, is_dohan) values ($1,$2,$3,$4,1,0,'free',true), ($1,$2,$3,$5,1,1,'free',false)", [A1.org_id, A1.id, chk4, castA, castB]);
      await as(mgr, "select public.check_add_line($1,$2,2,null,'A',null,null) id", [chk4, P2]);
      await as(mgr, "select public.check_pay($1,'cash',$2,'A',null,$3,null) id", [chk4, (await one<{ d: number }>("select public.check_group_due($1,'A') d", [chk4])).d, randomUUID()]);
      const cl4 = await as(mgr, "select public.check_close($1,$2) id", [chk4, randomUUID()]);
      const backs4 = Object.fromEntries((await q<{ cast_id: string; calculated_back_amount: number }>("select cast_id, calculated_back_amount from public.check_cast_backs where check_id=$1", [chk4])).map((r) => [r.cast_id, r.calculated_back_amount]));
      check("ck(4-2) cast_plan 上書き productBackFixedHon 600（白名単）・負は 'bad overrides'／同伴 A＝本指名扱い 600×1・フリー B＝200×1", sp.ok && !spBad.ok && spBad.err.includes("bad overrides") && cl4.ok && backs4[castA] === 600 && backs4[castB] === 200, JSON.stringify(backs4) + " " + [sp, spBad].map(errOf).join(" | "));
      const scp = await as(owner, "select public.set_comp_plan(null,$1,'ck-scp',1000,0,0,0,'[]'::jsonb,'[]'::jsonb,true,'per_count',null,'per_count',null,'per_count',null,'plan_fixed',null,100,500,300,200) id", [A1.id]);
      const scpBad = await as(owner, "select public.set_comp_plan(null,$1,'ck-scp2',1000,0,0,0,'[]'::jsonb,'[]'::jsonb,true,'per_count',null,'per_count',null,'per_count',null,'product_rule',null,null,500,null,null) id", [A1.id]);
      check("ck(4-3) set_comp_plan（22 引数）: plan_fixed＋区分別 3 値 → 列に入る／product_rule で区分別あり → 'bad product_back_fixed_hon'", scp.ok && (await one<{ h: number }>("select product_back_fixed_hon h from public.comp_plans where id=$1", [scp.ok ? scp.rows[0].id : null]))?.h === 500 && !scpBad.ok && scpBad.err.includes("bad product_back_fixed_hon"), [scp, scpBad].map(errOf).join(" | "));
      const pr1 = await as(owner, "select public.set_store_profile($1,'{\"customer_purpose\":\"来店管理と誕生日連絡\",\"customer_retention_years\":3}'::jsonb)", [A1.id]);
      const pr2 = await as(owner, "select public.set_store_profile($1,'{\"customer_retention_years\":11}'::jsonb)", [A1.id]);
      const pr3 = await as(owner, "select public.set_store_profile($1,'{\"customer_retention_years\":\"3\"}'::jsonb)", [A1.id]);
      const sj = (await one<{ s: Record<string, unknown> }>("select settings_json s from public.stores where id=$1", [A1.id])).s;
      check("ck(4-4) set_store_profile: customer_purpose／customer_retention_years=3 が入る・11 は 'bad customer_retention_years'・文字列は 'bad type'", pr1.ok && sj.customer_purpose === "来店管理と誕生日連絡" && sj.customer_retention_years === 3 && !pr2.ok && pr2.err.includes("bad customer_retention_years") && !pr3.ok && pr3.err.includes("bad type"), [pr1, pr2, pr3].map(errOf).join(" | "));
      const o5 = await as(mgr, "select public.check_open($1, 1, 'free', $2, null, null) id", [seat, custs["フリー"]]);
      const chk5 = o5.ok ? (o5.rows[0].id as string) : "";
      await as(mgr, "select public.check_add_line($1,null,1,'custom','A','x',100) id", [chk5]);
      await as(mgr, "select public.check_pay($1,'cash',$2,'A',null,$3,null) id", [chk5, (await one<{ d: number }>("select public.check_group_due($1,'A') d", [chk5])).d, randomUUID()]);
      const cl5 = await as(mgr, "select public.check_close($1,$2) id", [chk5, randomUUID()]);
      const exp3 = (await one<{ d: string }>("select (now() + interval '3 years')::date::text d")).d;
      check("ck(4-5) 店設定 3 年で close → retention_until＝＋3 年", cl5.ok && (await one<{ r: string }>("select retention_until::text r from public.customers where id=$1", [custs["フリー"]])).r === exp3, errOf(cl5));
      // (5)
      const src = Object.fromEntries((await q<{ proname: string; prosrc: string }>("select proname, prosrc from pg_proc where pronamespace='public'::regnamespace and proname in ('demo_org_reset','bottle_keep_out','check_customer_names')")).map((r) => [r.proname, r.prosrc]));
      const arr = (t: string) => t.slice(t.indexOf("array["), t.indexOf("];"));
      const wipe = src.demo_org_reset.slice(src.demo_org_reset.indexOf("c_wipe constant"), src.demo_org_reset.indexOf("c_load constant")), load = src.demo_org_reset.slice(src.demo_org_reset.indexOf("c_load constant"), src.demo_org_reset.indexOf("c_keep constant"));
      check("ck(5-1) demo_org_reset: c_wipe 73（'check_seats' の直後に check_customers）・c_load 72（'checks' の直後）", (arr(wipe).match(/'/g) || []).length / 2 === 73 && (arr(load).match(/'/g) || []).length / 2 === 72 && wipe.includes("'check_seats','check_customers'") && load.includes("'checks','check_customers'"));
      check("ck(5-2) keep_out の kiosk 腕（auth_kiosk_register_store_id∧auth_kiosk_operator）と 0057 null guard・names は can_register 開放（prosrc pin）", src.bottle_keep_out.includes("auth_kiosk_register_store_id()") && src.bottle_keep_out.includes("auth_kiosk_operator()") && src.bottle_keep_out.includes("public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null") && src.check_customer_names.includes("auth_cast_can_register()") && !src.check_customer_names.includes("auth_kiosk_register_store_id()"));
      const f1 = await as(castU2, "select public.check_customer_add($1,$2) id", [chk5, custs["指名A"]]);
      const f2 = await as(mgr, "select * from public.customer_sales_summary($1,$2::date,$3::date)", [B1.id, today, today]);
      check("ck(5-3) 権限: can_register なしの cast は add 'forbidden'・manager の他 org 店 sales_summary 'forbidden'", !f1.ok && f1.err.includes("forbidden") && !f2.ok && f2.err.includes("forbidden"), [f1, f2].map(errOf).join(" | "));
    } finally {
      await T.asPg();
      await db.query("rollback");
    }
    const after = JSON.stringify(await one(snapSql, [A1.id]));
    check("ck(0-2) ROLLBACK 後の snapshot 一致（checks／lines／check_customers／customers／keeps／products／plans／stock_logs／cast_plan／店設定）", after === before, `${before} → ${after}`);
  } finally {
    await db.end().catch(() => undefined);
  }
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  for (const fn of NEW6) {
    const args = fn === "check_customer_names" ? { p_check_id: null } : fn === "bottle_keep_out" ? { p_keep_id: null, p_check_id: null, p_idem_key: null } : fn === "customer_sales_summary" ? { p_store_id: null, p_from: null, p_to: null } : fn === "check_line_set_customer" ? { p_line_id: null, p_customer_id: null } : { p_check_id: null, p_customer_id: null };
    const { error } = await anon.rpc(fn, args);
    check(`ck(5-4) anon ${fn} BLOCKED`, !!error?.message?.includes("permission denied for function"), error?.message ?? "(no error)");
  }

  // (6) client 配線（逐語 grep・D1〜D4）
  {
    const fsx = await import("node:fs");
    const rb = fsx.readFileSync("app/(manage)/register/register-board.tsx", "utf8");
    const card = fsx.readFileSync("components/nox/check-customers-card.tsx", "utf8");
    const cd = fsx.readFileSync("app/(manage)/customers/[id]/customer-detail.tsx", "utf8");
    const sp = fsx.readFileSync("app/(manage)/master/store-profile-panel.tsx", "utf8");
    const cs = fsx.readFileSync("app/(manage)/master/cast-comp/comp-sections.tsx", "utf8");
    const pm = fsx.readFileSync("app/(manage)/master/products/products-board.tsx", "utf8");
    const kiosk = fsx.readFileSync("app/kiosk-register/page.tsx", "utf8");
    check("ck(6-1) D1: レジ「指名・席」タブに CheckCustomersCard（names RPC・customers 直 SELECT＝client filter・remove／add／line_set／bottle_keep_out＝RPC 5 本・冪等キーは押下ごと・明細 select に customer_id）", rb.includes("<CheckCustomersCard checkId={check.id}") && card.includes('supabase.rpc("check_customer_names"') && card.includes('from("customers")') && card.includes('"check_customer_remove"') && card.includes('"check_customer_add"') && card.includes('"check_line_set_customer"') && card.includes('"bottle_keep_out"') && card.includes("p_idem_key: crypto.randomUUID()") && rb.includes("tax_category, customer_id"));
    check("ck(6-2) D2: 顧客詳細にキープ一覧（bottle_keeps: bottle_name／remaining_pct／last_used_at／shelf_no）と顧客別売上（customer_sales_summary・期間 2 欄）", cd.includes('from("bottle_keeps").select("id, bottle_name, product_id, remaining_pct, shelf_no, last_used_at') && cd.includes('supabase.rpc("customer_sales_summary", { p_store_id: storeId, p_from: salesFrom, p_to: salesTo })') && cd.includes("<h2 style={secTitle}>キープ</h2>") && cd.includes("<h2 style={secTitle}>顧客別売上</h2>"));
    check("ck(6-3) D3: 店舗情報に customer_purpose（200）・customer_retention_years（1〜10・数値）／プラン編集に区分別 3 欄（plan_fixed のみ・22 引数）／cast 上書きに productBackFixedHon／Jonai／Free／商品マスターに unit4 4 欄", sp.includes('field("customer_purpose", "顧客情報の利用目的", 200') && sp.includes("out.customer_retention_years = Number(form.customer_retention_years)") && cs.includes("p_product_back_fixed_hon: m === \"plan_fixed\" ? (region?.hon ?? null) : null") && cs.includes("regionOf(pbRegion)") && cs.includes("o.productBackFixedHon = Number(d.pbHon)") && cs.includes("product_back_fixed_hon, product_back_fixed_jonai, product_back_fixed_free") && pm.includes('[["hon", "本指名"], ["jonai", "場内指名"], ["dohan", "同伴"], ["free", "フリー"]]'));
    check("ck(6-4) D5: kiosk はキープ出しの入口なし（顧客系非開示＝裁定11・bottle_keeps は anon 0 行＝読取経路なし・要裁定）", !kiosk.includes("bottle_keep_out"));
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-customers-keep ALL PASS (${pass} assertions)`);
  console.log("顧客複数・キープ出し(0153・裁定305／307): open→position 0・add／remove（繰り上がり・行 null）・line_set・names（cast・電話なし）/ keep_register 9 引数・keep_out（¥0・在庫不変・冪等）・keep_update 7 引数 / merge・close（last_visit_at・retention）・sales_summary（均等割り） / plan_fixed 区分別・set_comp_plan 22・set_store_profile +2・set_cast_plan +3 / demo 配列・kiosk 腕 pin・権限・anon BLOCKED・ROLLBACK 残留 0");
}

main().catch((e) => { console.error(e); process.exit(1); });
