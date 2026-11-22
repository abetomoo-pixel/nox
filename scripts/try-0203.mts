/*
 * try-0203 — 0203_multi_store.sql の試走（BEGIN … ROLLBACK＝本番に残さない・f0 の走行中は流さない＝orgs の DDL が錠を取る）。
 *  教訓（0190 の事故）: mig の本体を送る前に、先頭の begin; と末尾の commit; を外し、ほかに commit; が無いことを確かめる。
 *  NOX-VERIFY-A（A1・A2）で：支払日・店を足す（運営）・写し・お知らせ（店を指定）を、役ごとに通す。最後に必ず rollback。
 *  使い方: npx tsx scripts/try-0203.mts
 */
import fs from "node:fs";
import pg from "pg";
import { pgTx } from "./fixtures-pgtx";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };

const raw = fs.readFileSync("supabase/migrations/0203_multi_store.sql", "utf8");
const lines = raw.split(/\r?\n/);
const bi = lines.findIndex((l) => l.trim() === "begin;");
const ci = lines.map((l) => l.trim()).lastIndexOf("commit;");
const body = lines.slice(bi + 1, ci).join("\n");
if (bi < 0 || ci < 0 || ci <= bi) throw new Error("begin; と commit; の行が見つからない");
if (/^\s*commit\s*;/im.test(body) || /^\s*rollback\s*;/im.test(body) || /^\s*begin\s*;/im.test(body)) throw new Error("本体の中に begin／commit／rollback がある＝送らない");
console.log(`本体 ${body.length} 字・行 ${ci - bi - 1}（begin／commit は外した・中に commit なし）`);

const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL });
await db.connect();
try {
  await db.query("begin");
  const tx = pgTx(db);
  const proof = await tx.one<{ n: number }>("select count(*)::int n from public.orgs"); console.log(`proof nox-project-proof ${proof.n}`);
  const fn0 = (await tx.one<{ n: number }>("select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'")).n;
  await db.query(body);
  const fn1 = (await tx.one<{ n: number }>("select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'")).n;
  check("関数 +5（478 → 483 の形）", fn1 - fn0 === 5, { fn0, fn1 });
  const filled = await tx.one<{ f: number; t: number }>("select count(*) filter (where pay_day is not null)::int f, count(*)::int t from public.orgs");
  check("orgs.pay_day は店の値がそろう会社で埋まる", filled.f >= 1, filled);
  const acl = await tx.q<{ proname: string; rolname: string; ok: boolean }>("select p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'execute') ok from pg_proc p cross join pg_roles r where p.proname in ('ops_store_add','store_copy_settings','set_org_pay_day','notice_create_at','notice_create_targets_at') and r.rolname in ('anon','authenticated','service_role') order by 1, 2");
  const a = (f: string, r: string) => acl.find((x) => x.proname === f && x.rolname === r)?.ok;
  check("ACL：ops_store_add は service_role だけ・ほかの 4 本は authenticated・anon は全部不可", a("ops_store_add", "service_role") === true && a("ops_store_add", "authenticated") === false && a("ops_store_add", "anon") === false
    && ["store_copy_settings", "set_org_pay_day", "notice_create_at", "notice_create_targets_at"].every((f) => a(f, "authenticated") === true && a(f, "anon") === false), acl);

  // 人と店
  const A1 = await tx.one<{ id: string; org_id: string }>("select id, org_id from stores where name = 'NOX-VERIFY-A1'");
  const A2 = await tx.one<{ id: string }>("select id from stores where name = 'NOX-VERIFY-A2'");
  const uid = async (email: string) => ({ auth_user_id: (await tx.one<{ auth_user_id: string }>("select auth_user_id from users where email = $1", [email])).auth_user_id });
  const owner = await uid("nox-verify-owner-a@example.com"), mgr = await uid("nox-verify-manager-a1@example.com"), staff = await uid("nox-verify-staff-a1@example.com"), cast = await uid("nox-verify-cast-a1a@example.com");
  const op = (await tx.one<{ id: string } | undefined>("select id from ops_operators limit 1"))?.id ?? null;

  // ★2 支払日
  const p1 = await tx.as(owner, "select public.set_org_pay_day(10)");
  const pd = await tx.one<{ o: number; s: string }>("select o.pay_day o, string_agg(distinct s.pay_day::text, ',') s from orgs o join stores s on s.org_id = o.id where o.id = $1 group by o.pay_day", [A1.org_id]);
  check("支払日：owner が 10 に＝会社と全店がそろう", p1.ok && pd.o === 10 && pd.s === "10", [tx.errOf(p1), pd]);
  const p2 = await tx.as(mgr, "select public.set_org_pay_day(15)"); const p3 = await tx.as(owner, "select public.set_org_pay_day(32)");
  check("支払日：店長は forbidden・32 は bad pay day", !p2.ok && /forbidden/.test(tx.errOf(p2)) && !p3.ok && /bad pay day/.test(tx.errOf(p3)), [tx.errOf(p2), tx.errOf(p3)]);

  // ★3 店を足す（service で呼ぶ＝postgres のまま）
  if (op) {
    const add = await tx.call("select public.ops_store_add($1, $2, 'NOX-VERIFY-A3（試走）', 'cabaret', $3, array['pricing','products','comp','settings','hours']) j", [op, A1.org_id, A1.id]);
    const sid = add.ok ? (add.rows[0].j as { store_id: string }).store_id : null;
    const st = sid ? await tx.one<{ sd: string; bt: string; pd: number; dr: unknown; mem: number }>("select s.settings_json->>'setup_done' sd, s.settings_json->>'biz_type' bt, s.pay_day pd, d.data dr, (select count(*)::int from memberships m where m.store_id = s.id) mem from stores s left join setup_drafts d on d.store_id = s.id where s.id = $1", [sid]) : null;
    check("店を足す：初期設定の前・業態・会社の支払日・下書きに写す内容だけ・所属は足さない", add.ok && st?.sd === "false" && st?.bt === "cabaret" && st?.pd === 10 && JSON.stringify((st?.dr as { copy?: { parts?: string[] } })?.copy?.parts) === JSON.stringify(["comp", "hours", "pricing", "products", "settings"]) && st?.mem === 0, [tx.errOf(add), st]);
    const addBad = await tx.call("select public.ops_store_add($1, $2, 'x', 'cabaret', $3, array['casts'])", [op, A1.org_id, A1.id]);
    const addDup = await tx.call("select public.ops_store_add($1, $2, 'NOX-VERIFY-A1', 'cabaret', null, null)", [op, A1.org_id]);
    const addNo = await tx.call("select public.ops_store_add(gen_random_uuid(), $1, 'y', 'cabaret', null, null)", [A1.org_id]);
    check("店を足す：写せない part は bad parts・同じ店名は dup store・運営者でない ID は forbidden", !addBad.ok && /bad parts/.test(tx.errOf(addBad)) && !addDup.ok && /dup store/.test(tx.errOf(addDup)) && !addNo.ok && /forbidden/.test(tx.errOf(addNo)), [tx.errOf(addBad), tx.errOf(addDup), tx.errOf(addNo)]);
    const asAuth = await tx.as(owner, "select public.ops_store_add($1, $2, 'z', 'cabaret', null, null)", [op, A1.org_id]);
    check("店を足す：authenticated からは呼べない（permission denied）", !asAuth.ok && /permission denied/.test(tx.errOf(asAuth)), tx.errOf(asAuth));

    // ★4 写し（owner）
    if (sid) {
      const src = await tx.one<Record<string, number>>("select (select count(*)::int from pricing_rules where store_id=$1) pr, (select count(*)::int from pricing_categories where store_id=$1) pc, (select count(*)::int from products where store_id=$1) pd, (select count(*)::int from product_categories where store_id=$1) pcat, (select count(*)::int from comp_plans where store_id=$1) cp, (select count(*)::int from comp_plan_components where store_id=$1) cc, (select count(*)::int from store_business_hours where store_id=$1) bh, (select count(*)::int from cast_ranks where store_id=$1) rk", [A1.id]);
      const cpm = await tx.as(mgr, "select public.store_copy_settings($1, $2, array['pricing'])", [A1.id, sid]);
      check("写し：店長は forbidden", !cpm.ok && /forbidden/.test(tx.errOf(cpm)), tx.errOf(cpm));
      const cp = await tx.as(owner, "select public.store_copy_settings($1, $2, array['pricing','products','comp','settings','hours']) j", [A1.id, sid]);
      const dst = await tx.one<Record<string, number>>("select (select count(*)::int from pricing_rules where store_id=$1) pr, (select count(*)::int from pricing_categories where store_id=$1) pc, (select count(*)::int from products where store_id=$1) pd, (select count(*)::int from product_categories where store_id=$1) pcat, (select count(*)::int from comp_plans where store_id=$1) cp, (select count(*)::int from comp_plan_components where store_id=$1) cc, (select count(*)::int from store_business_hours where store_id=$1) bh, (select count(*)::int from cast_ranks where store_id=$1) rk", [sid]);
      check("写し：件数が写し元と同じ（料金・区分・商品・カテゴリ・プラン・部品・営業時間・ランク）", cp.ok && JSON.stringify(src) === JSON.stringify(dst), [tx.errOf(cp), src, dst]);
      const xref = await tx.one<{ badcat: number; badrank: number; badplan: number; badpcat: number }>("select (select count(*)::int from pricing_rules r where r.store_id=$1 and r.category_id is not null and not exists (select 1 from pricing_categories c where c.id=r.category_id and c.store_id=$1)) badcat, (select count(*)::int from pricing_rules r where r.store_id=$1 and r.rank_id is not null and not exists (select 1 from cast_ranks k where k.id=r.rank_id and k.store_id=$1)) badrank, (select count(*)::int from comp_plan_components x where x.store_id=$1 and not exists (select 1 from comp_plans p where p.id=x.plan_id and p.store_id=$1)) badplan, (select count(*)::int from products p where p.store_id=$1 and p.category_id is not null and not exists (select 1 from product_categories c where c.id=p.category_id and c.store_id=$1)) badpcat", [sid]);
      check("写し：ID の付け替え＝写し先の行は写し先の区分・ランク・プラン・カテゴリだけを指す", xref.badcat === 0 && xref.badrank === 0 && xref.badplan === 0 && xref.badpcat === 0, xref);
      const kept = await tx.one<{ sd: string; bt: string; lc: string; ip: string | null }>("select settings_json->>'setup_done' sd, settings_json->>'biz_type' bt, line_config::text lc, punch_allow_ip::text ip from stores where id=$1", [sid]);
      check("写し：初期設定の前・業態はそのまま・LINE と位置（IP）は写さない", kept.sd === "false" && kept.bt === "cabaret" && kept.lc === "{}" && kept.ip === null, kept);
      const again = await tx.as(owner, "select public.store_copy_settings($1, $2, array['pricing'])", [A1.id, sid]);
      check("写し：2 回目は not empty（二重に写さない）", !again.ok && /not empty: pricing/.test(tx.errOf(again)), tx.errOf(again));
      const toDone = await tx.as(owner, "select public.store_copy_settings($1, $2, array['hours'])", [sid, A1.id]);
      check("写し：写し先が初期設定済み・写し元が初期設定の前は不可", !toDone.ok && /(src not ready|dst done)/.test(tx.errOf(toDone)), tx.errOf(toDone));
    }
  } else check("運営者の行がある（ops_operators）", false, "ops_operators が空");

  // ★5 お知らせ（店を指定）
  const n1 = await tx.as(owner, "select public.notice_create_at($1, 't', 'b', 'all', false, null) id", [A2.id]);
  const n1s = n1.ok ? (await tx.one<{ s: string }>("select store_id s from notices where id = $1", [n1.rows[0].id])).s : null;
  check("お知らせ：owner は A2 を指定して出せる（店は A2）", n1.ok && n1s === A2.id, [tx.errOf(n1), n1s]);
  const n2 = await tx.as(mgr, "select public.notice_create_at($1, 't', 'b', 'all', false, null)", [A2.id]);
  const n3 = await tx.as(staff, "select public.notice_create_at($1, 't', 'b', 'all', false, null)", [A1.id]);
  const n4 = await tx.as(cast, "select public.notice_create_at($1, 't', 'b', 'all', false, null)", [A1.id]);
  check("お知らせ：店長は他店に出せない・スタッフとキャストは forbidden", !n2.ok && /forbidden/.test(tx.errOf(n2)) && !n3.ok && /forbidden/.test(tx.errOf(n3)) && !n4.ok && /forbidden/.test(tx.errOf(n4)), [tx.errOf(n2), tx.errOf(n3), tx.errOf(n4)]);
  const cA1 = (await tx.one<{ id: string }>("select c.id from casts c where c.store_id = $1 and c.is_active limit 1", [A1.id])).id;
  const t1 = await tx.as(owner, "select public.notice_create_targets_at($1, 't', 'b', array[$2]::uuid[], null, false, null)", [A2.id, cA1]);
  check("宛先つき：A2 を指定して A1 のキャストを宛先にすると bad targets（他店の人に出さない）", !t1.ok && /bad targets/.test(tx.errOf(t1)), tx.errOf(t1));
  const anon = await tx.as("anon", "select public.notice_create_at($1, 't', 'b', 'all', false, null)", [A1.id]);
  check("anon は permission denied", !anon.ok && /permission denied/.test(tx.errOf(anon)), tx.errOf(anon));
} finally {
  await db.query("rollback").catch(() => undefined);
  await db.end();
}
if (fails.length) { console.error(`try-0203 FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`try-0203 OK ${pass} checks（BEGIN … ROLLBACK・本番に残さない）`);
