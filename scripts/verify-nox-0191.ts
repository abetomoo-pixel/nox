/*
 * verify:nox-0191 — 0191（初期設定 v5 の器なし項目・2026-10-30 14 時台に Agoora が手貼り）の本番 BEGIN…ROLLBACK 試走＝翻訳元 docs/tmp/t0191_rollback.mts（mig は流さない＝本番の定義で・DB 恒久変更 0・教訓128＝関数数を tx の外で前後に）。
 *  ★1 店設定 5 キー（受理と拒否）★2 set_product 16 引数（back_rate_by_kind・旧 15 引数の named 呼び）★3 PIN 4〜6 桁 ★4 shift_request_mode 'store' ★5 check_remove_line＝pending キープ削除 ★6 setup_drafts（owner 書込・anon／cast 読めない・null で削除）・関数 394／表 112 不変。
 *  使い方: npm run verify:nox-0191（env: SUPABASE_DB_URL・NOX-VERIFY-A1）
 */
process.loadEnvFile(".env.local");
import pg from "pg";
import { pgTx } from "./fixtures-pgtx";

async function main(): Promise<void> {

const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const fnOutside = async () => Number((await c.query(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace`)).rows[0].n);
const fnOutsideBefore = await fnOutside(); console.log("教訓128: 関数数（tx の外・前）", fnOutsideBefore);
const tx = pgTx(c);
let ok = 0, ng = 0; const fails: string[] = [];
const expect = (label: string, cond: boolean, detail?: unknown) => { if (cond) ok++; else { ng++; fails.push(`${label}: ${JSON.stringify(detail)}`); } };
const out: Record<string, unknown> = {};
try {
  await c.query("begin");
  const fnBefore = (await tx.one<{ n: string }>(`select count(*)::text n from pg_proc where pronamespace='public'::regnamespace`))!.n;
  const tbBefore = (await tx.one<{ n: string }>(`select count(*)::text n from pg_tables where schemaname='public'`))!.n;
  // mig は流さない（適用済み＝本番の定義で）
  const A1 = await tx.storeA1(); const owner = await tx.uidOf("ownerA"); const mgr = await tx.uidOf("managerA1"); const castA = await tx.uidOf("castA1a");
  const castId = (await tx.castOf(A1.id, castA.id))!;
  // ★1 店設定
  const s1 = await tx.as(owner, `select public.set_store_profile($1::uuid, $2::jsonb)`, [A1.id, JSON.stringify({ kind_back_rate: { hon: 100, jonai: 50, free: 30 }, withholding_default_cast: "hostess", withholding_default_staff: "none", cash_float_default: 50000, settlement_close_day: 31 })]);
  const sj = await tx.one<{ s: Record<string, unknown> }>(`select settings_json s from public.stores where id = $1`, [A1.id]);
  const s1b = await tx.as(owner, `select public.set_store_profile($1::uuid, $2::jsonb)`, [A1.id, JSON.stringify({ kind_back_rate: { hon: 101 } })]);
  const s1c = await tx.as(owner, `select public.set_store_profile($1::uuid, $2::jsonb)`, [A1.id, JSON.stringify({ withholding_default_staff: "hostess" })]);
  const s1d = await tx.as(owner, `select public.set_store_profile($1::uuid, $2::jsonb)`, [A1.id, JSON.stringify({ settlement_close_day: 10 })]);
  const s1e = await tx.as(owner, `select public.set_store_profile($1::uuid, $2::jsonb)`, [A1.id, JSON.stringify({ cash_float_default: -1 })]);
  expect("★1 店設定 5 キー＝受理（kind_back_rate 100/50/30・既定 hostess／none・釣銭 50,000・締め日 31）・拒否（101／staff hostess／締め日 10／負）",
    s1.ok && (sj?.s.kind_back_rate as { hon: number; jonai: number; free: number })?.hon === 100 && (sj?.s.kind_back_rate as { jonai: number })?.jonai === 50 && (sj?.s.kind_back_rate as { free: number })?.free === 30 && sj?.s.withholding_default_cast === "hostess" && sj?.s.withholding_default_staff === "none" && sj?.s.cash_float_default === 50000 && sj?.s.settlement_close_day === 31
    && !s1b.ok && /bad kind_back_rate/.test(tx.errOf(s1b)) && !s1c.ok && /bad withholding_default_staff/.test(tx.errOf(s1c)) && !s1d.ok && /bad settlement_close_day/.test(tx.errOf(s1d)) && !s1e.ok && /bad cash_float_default/.test(tx.errOf(s1e)),
    { s1: tx.errOf(s1), s1b: tx.errOf(s1b), s1c: tx.errOf(s1c), s1d: tx.errOf(s1d), s1e: tx.errOf(s1e), kbr: sj?.s.kind_back_rate, wdc: sj?.s.withholding_default_cast, wds: sj?.s.withholding_default_staff, cfd: sj?.s.cash_float_default, scd: sj?.s.settlement_close_day });
  // ★2 set_product
  const sigs = await tx.q<{ n: number }>(`select pronargs n from pg_proc where pronamespace='public'::regnamespace and proname='set_product'`);
  const p1 = await tx.as(owner, `select public.set_product(p_id => null, p_store_id => $1::uuid, p_type => 'champ', p_category => 'シャンパン', p_name => 't0191 モエ', p_price => 22000, p_cost => null, p_back_mode => 'rate', p_back_value => 10, p_unit4 => null, p_hon_pt => 0, p_is_active => true, p_back_rate_by_kind => $2::jsonb) id`, [A1.id, JSON.stringify({ jonai: 5, free: 3 })]);
  const pid = p1.ok ? (p1.rows[0] as { id: string }).id : null;
  const prow = pid ? await tx.one<{ b: Record<string, number> | null }>(`select back_rate_by_kind b from public.products where id = $1`, [pid]) : null;
  const p2 = await tx.as(owner, `select public.set_product(p_id => null, p_store_id => $1::uuid, p_type => 'drink', p_category => 'x', p_name => 't0191 旧呼び', p_price => 100, p_cost => null, p_back_mode => 'rate', p_back_value => 0, p_unit4 => null, p_hon_pt => 0, p_is_active => true) id`, [A1.id]);
  const p3 = await tx.as(owner, `select public.set_product(p_id => null, p_store_id => $1::uuid, p_type => 'drink', p_category => 'x', p_name => 't0191 bad', p_price => 100, p_cost => null, p_back_mode => 'rate', p_back_value => 0, p_unit4 => null, p_hon_pt => 0, p_is_active => true, p_back_rate_by_kind => $2::jsonb) id`, [A1.id, JSON.stringify({ hon: 1 })]);
  expect("★2 set_product＝1 定義（16 引数）・back_rate_by_kind {jonai 5, free 3} が保存・旧 15 引数の named 呼びも通る（既定 null）・bad key は拒否", sigs.length === 1 && sigs[0].n === 16 && p1.ok && prow?.b?.jonai === 5 && prow?.b?.free === 3 && p2.ok && !p3.ok && /bad back_rate_by_kind/.test(tx.errOf(p3)), { sigs, p1: tx.errOf(p1), p2: tx.errOf(p2), p3: tx.errOf(p3), prow });
  // ★3 PIN
  const k5 = await tx.as(owner, `select public.set_cast_pin($1::uuid, '12345')`, [castId]);
  const k6 = await tx.as(owner, `select public.set_cast_pin($1::uuid, '123456')`, [castId]);
  const k3 = await tx.as(owner, `select public.set_cast_pin($1::uuid, '123')`, [castId]);
  const k7 = await tx.as(owner, `select public.set_cast_pin($1::uuid, '1234567')`, [castId]);
  const k4 = await tx.as(owner, `select public.set_cast_pin($1::uuid, '1234')`, [castId]);
  const mgrMem = (await tx.one<{ id: string }>(`select m.id from public.memberships m join public.users u on u.id = m.user_id where u.id = $1 and m.is_active limit 1`, [mgr.id]))!.id;
  const s5 = await tx.as(owner, `select public.set_staff_pin($1::uuid, '98765')`, [mgrMem]);
  const s3 = await tx.as(owner, `select public.set_staff_pin($1::uuid, '987')`, [mgrMem]);
  const kp = await tx.q<{ p: string }>(`select prosrc p from pg_proc where pronamespace='public'::regnamespace and proname in ('kiosk_punch','staff_punch')`);
  expect("★3 PIN 4〜6 桁＝5／6 桁 OK・3／7 桁 bad pin・4 桁も通る（cast／staff）・kiosk_punch／staff_punch も {4,6}", k5.ok && k6.ok && !k3.ok && /bad pin/.test(tx.errOf(k3)) && !k7.ok && k4.ok && s5.ok && !s3.ok && kp.length === 2 && kp.every((x) => x.p.includes("{4,6}")), { k3: tx.errOf(k3), k7: tx.errOf(k7), s3: tx.errOf(s3) });
  // ★4 mine 'store'
  const m1 = await tx.as(owner, `select public.set_store_mine_settings($1::uuid, $2::jsonb)`, [A1.id, JSON.stringify({ shift_request_mode: "store" })]);
  const m2 = await tx.as(owner, `select public.set_store_mine_settings($1::uuid, $2::jsonb)`, [A1.id, JSON.stringify({ shift_request_mode: "x" })]);
  const mj = await tx.one<{ v: string }>(`select settings_json->>'shift_request_mode' v from public.stores where id = $1`, [A1.id]);
  expect("★4 shift_request_mode 'store' 受理・'x' 拒否", m1.ok && mj?.v === "store" && !m2.ok && /bad shift_request_mode/.test(tx.errOf(m2)), { m1: tx.errOf(m1), m2: tx.errOf(m2), mj });
  // ★5 check_remove_line＝pending キープ削除
  const seat = await tx.one<{ id: string }>(`select id from public.seats where store_id = $1 and is_active order by sort_order limit 1`, [A1.id]);
  const op = await tx.as(mgr, `select public.check_open($1::uuid, 1) r`, [seat!.id]);
  let keepOk = false; let keepDetail: unknown = null;
  if (op.ok) {
    const chk = (op.rows[0] as { r: string }).r;
    const prod = await tx.one<{ id: string }>(`select id from public.products where store_id = $1 and is_active order by created_at limit 1`, [A1.id]);
    const ln = await tx.as(mgr, `select public.check_add_line($1::uuid, $2::uuid, 1) r`, [chk, prod!.id]);
    if (ln.ok) {
      const lineId = (ln.rows[0] as { r: string }).r;
      const ins = await c.query(`insert into public.bottle_keeps (org_id, store_id, product_id, status, check_line_id, bottle_name) values ($1, $2, $3, 'pending', $4, 't0191'), ($1, $2, $3, 'active', $4, 't0191 active') returning id, status`, [A1.org_id, A1.id, prod!.id, lineId]);
      const rm = await tx.as(mgr, `select public.check_remove_line($1::uuid)`, [lineId]);
      const left = await tx.q<{ status: string }>(`select status from public.bottle_keeps where id = any($1) order by status`, [ins.rows.map((r: { id: string }) => r.id)]);
      keepOk = rm.ok && left.length === 1 && left[0].status === "active"; keepDetail = { rm: tx.errOf(rm), left };
    } else keepDetail = { ln: tx.errOf(ln) };
  } else keepDetail = { op: tx.errOf(op) };
  expect("★5 check_remove_line＝行を消すと pending のキープが消え active は残る（M-30）", keepOk, keepDetail);
  // ★6 setup_drafts
  const d1 = await tx.as(owner, `select public.setup_draft_set($1::uuid, $2::jsonb)`, [A1.id, JSON.stringify({ step: 3, type: "cabaret" })]);
  const d2 = await tx.as(owner, `select data->>'step' s from public.setup_drafts where store_id = $1`, [A1.id]);
  const d3 = await tx.as(mgr, `select public.setup_draft_set($1::uuid, $2::jsonb)`, [A1.id, "{}"]);
  const d4 = await tx.as(castA, `select count(*)::int n from public.setup_drafts`);
  const d5 = await tx.as("anon", `select public.setup_draft_set($1::uuid, $2::jsonb)`, [A1.id, "{}"]);
  const d6 = await tx.as(owner, `select public.setup_draft_set($1::uuid, null)`, [A1.id]);
  const d7 = await tx.one<{ n: number }>(`select count(*)::int n from public.setup_drafts where store_id = $1`, [A1.id]);
  expect("★6 setup_drafts＝owner が保存・読める（step 3）・manager は forbidden・cast は 0 行・anon BLOCKED・null で削除", d1.ok && d2.ok && (d2.rows[0] as { s: string }).s === "3" && !d3.ok && /forbidden/.test(tx.errOf(d3)) && d4.ok && (d4.rows[0] as { n: number }).n === 0 && !d5.ok && /permission denied/.test(tx.errOf(d5)) && d6.ok && d7?.n === 0,
    { d1: tx.errOf(d1), d2: d2.ok ? d2.rows : tx.errOf(d2), d3: tx.errOf(d3), d4: d4.ok ? d4.rows : tx.errOf(d4), d5: tx.errOf(d5), d6: tx.errOf(d6), d7 });
  const fnAfter = (await tx.one<{ n: string }>(`select count(*)::text n from pg_proc where pronamespace='public'::regnamespace`))!.n;
  const tbAfter = (await tx.one<{ n: string }>(`select count(*)::text n from pg_tables where schemaname='public'`))!.n;
  const md = await tx.q<{ n: string; m: string }>(`select proname n, left(md5(replace(prosrc, chr(13), '')), 8) m from pg_proc where pronamespace='public'::regnamespace and proname in ('set_store_profile','set_product','set_cast_pin','set_staff_pin','kiosk_punch','staff_punch','set_store_mine_settings','check_remove_line','setup_draft_set') order by 1`);
  out.md5 = Object.fromEntries(md.map((x) => [x.n, x.m])); out.fnCount = { before: fnBefore, after: fnAfter }; out.tables = { before: tbBefore, after: tbAfter };
  expect("関数 +1（setup_draft_set）・表 +1（setup_drafts）", Number(fnAfter) === Number(fnBefore) + 0 && Number(tbAfter) === Number(tbBefore) + 0, out);
} catch (e) {
  ng++; fails.push(`例外: ${(e as Error).message}`);
} finally {
  await c.query("rollback").catch(() => {});
  const left = await c.query(`select count(*)::int n from public.products where name like 't0191%'`).catch(() => ({ rows: [{ n: -1 }] }));
  const fnOutsideAfter = await fnOutside(); console.log("教訓128: 関数数（tx の外・後）", fnOutsideAfter, fnOutsideAfter === fnOutsideBefore ? "＝DB 恒久変更 0" : "★★ 変化あり＝即報告");
  console.log(JSON.stringify(out));
  const residue = (left.rows[0] as { n: number }).n;
  if (fails.length || residue !== 0 || fnOutsideAfter !== fnOutsideBefore) { console.error(`verify:nox-0191 FAIL ${fails.length}（pass ${ok}・残留 ${residue}）\n` + fails.map((f) => " - " + f).join("\n")); process.exit(1); }
  console.log(`verify:nox-0191 ALL PASS (${ok} assertions)・残留 0・関数数 ${fnOutsideAfter} 不変`);
  await c.end();
}
}
void main();
