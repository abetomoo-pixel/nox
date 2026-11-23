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
  const op = (await tx.one<{ id: string } | undefined>("select auth_user_id id from ops_operators limit 1"))?.id ?? null;

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
      await tx.q("update stores set settings_json = coalesce(settings_json, '{}'::jsonb) || '{\"zz_unknown_key\": 1, \"line_notify\": {\"x\": 1}, \"receipt_address\": \"1 店目の住所\"}'::jsonb, punch_lat = 35.0, trade_name = '1 店目の屋号' where id = $1", [A1.id]);
      // ★版 3: 1 店目＝店の端末だけ・強制・勤務時間の丸め 15 分（鍵と列）＝写さないことを見る（この試走の中だけ）
      await tx.q("update stores set punch_restrict_mode = 'tablet', punch_enforce = true, punch_round_unit = 15, punch_round_mode = 'store_favor', punch_require_shift = 'block', settings_json = coalesce(settings_json, '{}'::jsonb) || $2::jsonb where id = $1", [A1.id, JSON.stringify({ punch_restrict_mode: "tablet", punch_enforce: true, punch_round_unit: 15, punch_round_mode: "store_favor", punch_require_shift: "block", contract_ack: true, contract_ack_rev: "2026-11-01T00:00:00+09:00" })]);   // ★版 4: シフトの無い打刻は「止める」・契約の確認を出す
      const ghost = (await tx.one<{ g: string }>("select gen_random_uuid()::text g")).g;
      // 1 店目にランク 2 つ・指名料の行（ランクつき）・スライドのランクを入れる（NOX-VERIFY-A1 にはランクと料金の行が無い＝この試走の中だけ）
      const rkA = (await tx.q<{ id: string }>("insert into cast_ranks (org_id, store_id, name, sort_order, is_active) values ($1, $2, '試走ランク金', 1, true), ($1, $2, '試走ランク銀', 2, true) returning id", [A1.org_id, A1.id])).map((r) => r.id);
      await tx.q("insert into pricing_rules (org_id, store_id, fee_kind, rank_id, amount, name) values ($1, $2, 'hon_shimei', $3, 3000, '試走 本指名 金'), ($1, $2, 'hon_shimei', $4, 2000, '試走 本指名 銀'), ($1, $2, 'set', null, 5000, '試走 セット')", [A1.org_id, A1.id, rkA[0], rkA[1]]);
      await tx.q("update comp_plans set slide_rank_ids = $2::uuid[] where id = (select id from comp_plans where store_id = $1 order by created_at limit 1)", [A1.id, rkA]);
      Object.assign(src, await tx.one<Record<string, number>>("select (select count(*)::int from pricing_rules where store_id=$1) pr, (select count(*)::int from pricing_categories where store_id=$1) pc, (select count(*)::int from products where store_id=$1) pd, (select count(*)::int from product_categories where store_id=$1) pcat, (select count(*)::int from comp_plans where store_id=$1) cp, (select count(*)::int from comp_plan_components where store_id=$1) cc, (select count(*)::int from store_business_hours where store_id=$1) bh, (select count(*)::int from cast_ranks where store_id=$1) rk", [A1.id])); // 入れた後の件数で比べる
      await tx.q("update comp_plans set slide_rank_ids = slide_rank_ids || $2::uuid where id = (select id from comp_plans where store_id = $1 order by created_at limit 1)", [A1.id, ghost]);
      const cp = await tx.as(owner, "select public.store_copy_settings($1, $2, array['pricing','products','comp','settings','hours']) j", [A1.id, sid]);
      const dst = await tx.one<Record<string, number>>("select (select count(*)::int from pricing_rules where store_id=$1) pr, (select count(*)::int from pricing_categories where store_id=$1) pc, (select count(*)::int from products where store_id=$1) pd, (select count(*)::int from product_categories where store_id=$1) pcat, (select count(*)::int from comp_plans where store_id=$1) cp, (select count(*)::int from comp_plan_components where store_id=$1) cc, (select count(*)::int from store_business_hours where store_id=$1) bh, (select count(*)::int from cast_ranks where store_id=$1) rk", [sid]);
      check("写し：件数が写し元と同じ（料金・区分・商品・カテゴリ・プラン・部品・営業時間・ランク）", cp.ok && JSON.stringify(src) === JSON.stringify(dst), [tx.errOf(cp), src, dst]);
      const xref = await tx.one<{ badcat: number; badrank: number; badplan: number; badpcat: number }>("select (select count(*)::int from pricing_rules r where r.store_id=$1 and r.category_id is not null and not exists (select 1 from pricing_categories c where c.id=r.category_id and c.store_id=$1)) badcat, (select count(*)::int from pricing_rules r where r.store_id=$1 and r.rank_id is not null and not exists (select 1 from cast_ranks k where k.id=r.rank_id and k.store_id=$1)) badrank, (select count(*)::int from comp_plan_components x where x.store_id=$1 and not exists (select 1 from comp_plans p where p.id=x.plan_id and p.store_id=$1)) badplan, (select count(*)::int from products p where p.store_id=$1 and p.category_id is not null and not exists (select 1 from product_categories c where c.id=p.category_id and c.store_id=$1)) badpcat", [sid]);
      check("写し：ID の付け替え＝写し先の行は写し先の区分・ランク・プラン・カテゴリだけを指す", xref.badcat === 0 && xref.badrank === 0 && xref.badplan === 0 && xref.badpcat === 0, xref);
      const kept = await tx.one<{ sd: string; bt: string; lc: string; ip: string | null }>("select settings_json->>'setup_done' sd, settings_json->>'biz_type' bt, line_config::text lc, punch_allow_ip::text ip from stores where id=$1", [sid]);
      check("写し：初期設定の前・業態はそのまま・LINE と位置（IP）は写さない", kept.sd === "false" && kept.bt === "cabaret" && kept.lc === "{}" && kept.ip === "{}", kept);
      // ★版 2（■2-a）: 名簿に無い鍵・LINE・住所・位置は写さない・屋号は 2 店目の店名
      const dsj = await tx.one<{ sj: Record<string, unknown>; tn: string | null; nm: string; lat: number | null }>("select settings_json sj, trade_name tn, name nm, punch_lat lat from stores where id = $1", [sid]);
      check("版 2 写す鍵の名簿だけ＝名簿に無い鍵・LINE の知らせ・領収書の住所・位置は写さない・屋号は 2 店目の店名", !("zz_unknown_key" in (dsj.sj ?? {})) && !("line_notify" in (dsj.sj ?? {})) && !("receipt_address" in (dsj.sj ?? {})) && dsj.lat === null && dsj.tn === dsj.nm, dsj);
      // ★版 3（■2-a・b）: 打刻の制限の方式・強制・丸めは写さない＝2 店目は制限なし・丸めない（1 分）で始まる・店の設定はそのまま保存できる（range required で止まらない）
      const pv = await tx.one<{ m: string; e: boolean; u: number; rm: string; sj: Record<string, unknown>; rs: string }>("select punch_restrict_mode m, punch_enforce e, punch_round_unit u, punch_round_mode rm, settings_json sj, punch_require_shift rs from stores where id = $1", [sid]);
      const save = await tx.as(owner, "select public.set_store_profile($1, $2::jsonb)", [sid, JSON.stringify({ show_open_status: true })]);
      check("版 3 打刻の制限の方式・強制・丸めは写さない（列は既定のまま＝制限なし・丸めない 1 分・鍵も無い）・2 店目の店の設定はそのまま保存できる",
        pv.e === false && pv.u === 1 && pv.rm === "nearest" && pv.m !== "tablet" && !["punch_restrict_mode", "punch_enforce", "punch_round_unit", "punch_round_mode"].some((k) => k in (pv.sj ?? {})) && save.ok, [pv, tx.errOf(save)]);
      // ★版 4（相談役 11/23 21:20 の ■1）: 1 店目＝シフトの無い打刻は「止める」・契約の確認を出す → 2 店目は「許す」（off）・「出さない」（鍵が無い＝cast_contract_ack_needed は false）
      const ackCast = (await tx.one<{ id: string | null }>("select (select id from casts where store_id = $1 limit 1)::text id", [sid])).id;
      check("版 4 シフトの無い打刻・契約の確認を出すは写さない（2 店目は列 'off'＝許す・鍵 contract_ack も版も無い＝確認を出さない）",
        pv.rs === "off" && !("punch_require_shift" in (pv.sj ?? {})) && !("contract_ack" in (pv.sj ?? {})) && !("contract_ack_rev" in (pv.sj ?? {})), { rs: pv.rs, ack: pv.sj?.contract_ack ?? null, ackCast });
      // ★版 2（■2-c）: 写した後の 2 店目の行（料金・商品・待遇・設定の jsonb を含む）に 1 店目の行の ID（ランク・カテゴリ・プラン・商品・店）が残っていない
      const srcIds = (await tx.q<{ id: string }>(`select id::text id from cast_ranks where store_id = $1 union all select id::text from pricing_categories where store_id = $1 union all select id::text from product_categories where store_id = $1
        union all select id::text from comp_plans where store_id = $1 union all select id::text from products where store_id = $1 union all select $1::text union all select $2::text`, [A1.id, ghost])).map((r) => r.id);
      const dstText = (await tx.one<{ t: string }>(`select concat_ws('|', (select string_agg(row_to_json(x)::text, '|') from pricing_rules x where store_id = $1), (select string_agg(row_to_json(x)::text, '|') from pricing_categories x where store_id = $1),
        (select string_agg(row_to_json(x)::text, '|') from products x where store_id = $1), (select string_agg(row_to_json(x)::text, '|') from product_categories x where store_id = $1), (select string_agg(row_to_json(x)::text, '|') from comp_plans x where store_id = $1),
        (select string_agg(row_to_json(x)::text, '|') from comp_plan_components x where store_id = $1), (select string_agg(row_to_json(x)::text, '|') from plan_norm_tiers x where store_id = $1), (select string_agg(row_to_json(x)::text, '|') from plan_rate_bands x where store_id = $1),
        (select string_agg(row_to_json(x)::text, '|') from plan_event_bonuses x where store_id = $1), (select string_agg(row_to_json(x)::text, '|') from custom_back_defs x where store_id = $1), (select string_agg(row_to_json(x)::text, '|') from penalty_config x where store_id = $1),
        (select string_agg(row_to_json(x)::text, '|') from store_business_hours x where store_id = $1), (select string_agg(row_to_json(x)::text, '|') from cast_ranks x where store_id = $1), (select settings_json::text from stores where id = $1)) t`, [sid])).t ?? "";
      const left = srcIds.filter((i) => dstText.includes(i));
      check(`版 2 写した 2 店目の行に 1 店目の ID が 1 つも残らない（1 店目の ID ${srcIds.length}・2 店目の行の文字 ${dstText.length}）`, srcIds.length > 5 && dstText.length > 1000 && left.length === 0, left);
      const again = await tx.as(owner, "select public.store_copy_settings($1, $2, array['products'])", [A1.id, sid]);
      check("写し：2 回目は not empty（二重に写さない）", !again.ok && /not empty: products/.test(tx.errOf(again)), tx.errOf(again));
      const toDone = await tx.as(owner, "select public.store_copy_settings($1, $2, array['hours'])", [sid, A1.id]);
      check("写し：写し先が初期設定済み・写し元が初期設定の前は不可", !toDone.ok && /(src not ready|dst done)/.test(tx.errOf(toDone)), tx.errOf(toDone));
    }
    // ★版 2（■2-b）: 待遇だけ写す → 後から料金を写す＝指名料の行のランクは 2 店目のランク（名前で結ぶ・二重に作らない）
    const addC = await tx.call("select public.ops_store_add($1, $2, 'NOX-VERIFY-A4（試走）', 'cabaret', null, null) j", [op, A1.org_id]);
    const sidC = addC.ok ? (addC.rows[0].j as { store_id: string }).store_id : null;
    if (sidC) {
      const c1 = await tx.as(owner, "select public.store_copy_settings($1, $2, array['comp'])", [A1.id, sidC]);
      const nRk1 = (await tx.one<{ n: number }>("select count(*)::int n from cast_ranks where store_id = $1", [sidC])).n;
      const c2 = await tx.as(owner, "select public.store_copy_settings($1, $2, array['pricing'])", [A1.id, sidC]);
      const rk = await tx.one<{ n: number; bad: number; rules: number; ranked: number; slide_bad: number }>(`select (select count(*)::int from cast_ranks where store_id = $1) n,
        (select count(*)::int from pricing_rules r where r.store_id = $1 and r.rank_id is not null and not exists (select 1 from cast_ranks k where k.id = r.rank_id and k.store_id = $1)) bad,
        (select count(*)::int from pricing_rules where store_id = $1) rules, (select count(*)::int from pricing_rules where store_id = $1 and rank_id is not null) ranked,
        (select count(*)::int from comp_plans p, unnest(p.slide_rank_ids) x where p.store_id = $1 and not exists (select 1 from cast_ranks k where k.id = x and k.store_id = $1)) slide_bad`, [sidC]);
      const srcRanked = (await tx.one<{ n: number }>("select count(*)::int n from pricing_rules where store_id = $1 and rank_id is not null", [A1.id])).n;
      check("版 2 待遇だけ写す→後から料金＝ランクは待遇の写しで作り、料金の写しは名前で結ぶ（増えない）・指名料の行のランクは 2 店目のランク・スライドのランクも 2 店目",
        c1.ok && c2.ok && nRk1 === rk.n && rk.bad === 0 && rk.slide_bad === 0 && rk.ranked === srcRanked && rk.rules > 0, [tx.errOf(c1), tx.errOf(c2), nRk1, rk, srcRanked]);
    }
    const addD = await tx.call("select public.ops_store_add($1, $2, 'NOX-VERIFY-A5（試走）', 'cabaret', null, null) j", [op, A1.org_id]);
    const sidD = addD.ok ? (addD.rows[0].j as { store_id: string }).store_id : null;
    if (sidD) {
      await tx.q("insert into cast_ranks (org_id, store_id, name, sort_order, is_active) values ($1, $2, '2 店目だけのランク', 1, true)", [A1.org_id, sidD]);
      const srcRanks = (await tx.one<{ n: number }>("select count(*)::int n from cast_ranks where store_id = $1", [A1.id])).n;
      const c3 = await tx.as(owner, "select public.store_copy_settings($1, $2, array['pricing'])", [A1.id, sidD]);
      check("版 2 写し先にランクがあって名前で結べないランクがあれば not empty: ranks で止める（1 つも写さない）", srcRanks === 0 ? true : !c3.ok && /not empty: ranks/.test(tx.errOf(c3)) && (await tx.one<{ n: number }>("select count(*)::int n from pricing_rules where store_id = $1", [sidD])).n === 0, [srcRanks, tx.errOf(c3)]);
    }
  } else check("運営者の行がある（ops_operators）", false, "ops_operators が空");
  // ★版 2（■2-d）: デモの会社は会社の支払日を書かない（毎朝の入れ直しで stores だけ戻る＝ずれる）
  await tx.q("update orgs set is_demo = true where id = $1", [A1.org_id]);
  const pdDemo = await tx.as(owner, "select public.set_org_pay_day(12)");
  await tx.q("update orgs set is_demo = false where id = $1", [A1.org_id]);
  check("版 2 デモの会社で set_org_pay_day は forbidden (demo)（店の設定の今の道のまま）", !pdDemo.ok && /forbidden \(demo\)/.test(tx.errOf(pdDemo)), tx.errOf(pdDemo));

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
