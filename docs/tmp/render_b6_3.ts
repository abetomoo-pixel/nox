// @ts-nocheck — scratch（pg の型定義なし・docs/tmp 未追跡）
// B6 ③ 表示値の再現（読取のみ・pg 直結 postgres・DEMO CLUB NOX・2026-09）
//   RPC は auth 前提のため本文 SQL を逐語で再現（get_store_nom_counts＝0054／store_category_aggregate＝dump）。
//   集中度は cast_sales_aggregate（内部関数・直呼び可）＋既存 salesRanking の同式。出勤は attendance 店×月。
import fs from "fs";
import { Client } from "C:/Users/abet/Dropbox/cloude/nox/node_modules/pg";
import { top3ShareOf, presentDaysOf, productTimeOf, nomStoreOf, PRESENT_STATUSES } from "C:/Users/abet/Dropbox/cloude/nox/lib/nox/analytics/cast-stats";
import { sumCategories, CATEGORY_ORDER, CATEGORY_LABEL } from "C:/Users/abet/Dropbox/cloude/nox/lib/nox/analytics/category-map";

for (const l of fs.readFileSync("C:/Users/abet/Dropbox/cloude/nox/.env.local", "utf8").split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
const lastDayOf = (p: string) => { const [y, m] = p.split("-").map(Number); return `${p}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`; };
const yen = (n: number) => "¥" + n.toLocaleString();

(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log(JSON.stringify((await c.query(`select 'nox-project-proof' as k, count(*)::int as n from public.orgs`)).rows[0]));
  const st = (await c.query(`select id, org_id, coalesce(nullif(trim(coalesce(settings_json,'{}'::jsonb)->>'biz_cutoff_hm'),''),'06:00') as cutoff from public.stores where name='CLUB NOX'`)).rows[0];
  const S = st.id as string, ORG = st.org_id as string, CUT = st.cutoff as string;
  const P = "2026-09", from = `${P}-01`, to = lastDayOf(P);
  console.log(`store CLUB NOX cutoff=${CUT} period=${P}`);

  // 1) 指名（店合計）＝get_store_nom_counts 本文（0054）逐語
  const nom = (await c.query(`
    with w as (select (($1::text || ' ' || $3))::timestamp at time zone 'Asia/Tokyo' as v_start,
                      (((($2::date + interval '1 day')::date)::text || ' ' || $3))::timestamp at time zone 'Asia/Tokyo' as v_end)
    select count(*) filter (where c.nom_type='hon')::int as hon_count,
           count(*) filter (where c.nom_type='jonai')::int as jonai_count,
           count(*) filter (where c.nom_type='dohan')::int as dohan_count
    from public.check_nominations n join public.checks c on c.id=n.check_id, w
    where c.org_id=$4 and c.store_id=$5 and c.status='closed' and c.started_at >= w.v_start and c.started_at < w.v_end and n.org_id=$4`,
    [from, to, CUT, ORG, S])).rows[0];
  const ns = nomStoreOf(nom);
  console.log(`  指名（店合計）: raw=${JSON.stringify(nom)} → val=${ns ? `本${ns.hon}・場内${ns.jonai}・同伴${ns.dohan}` : "—"}`);

  // 2) 集中度＝cast_sales_aggregate → salesRanking 同式（cast 合算・降順）→ share（小数 1 桁）→ top3ShareOf
  const cs = (await c.query(`select a.cast_id, sum(a.sales)::int as sales, ca.name from public.cast_sales_aggregate($1,$2,$3) a join public.casts ca on ca.id=a.cast_id group by a.cast_id, ca.name order by 2 desc, 3`, [S, from, to])).rows as { cast_id: string; sales: number; name: string }[];
  const total = cs.reduce((a, r) => a + r.sales, 0);
  const t3 = top3ShareOf(cs.map((r) => ({ amount: r.sales })), total); // ★B6-12 改定: ¥ ベース
  console.log(`  集中度（上位 3 名）: 行=${cs.length} 総和=${total} → val=${t3 === null ? "—" : t3 + "%"}`);
  console.log(`  既存 売上貢献ランキング 上位 3 行（変更前後で不変の経路）:`);
  cs.slice(0, 3).forEach((r, i) => console.log(`    ${i + 1}. ${r.name} ${yen(r.sales)} 構成${total > 0 ? Math.round((r.sales / total) * 1000) / 10 : "—"}%`));

  // 3) 出勤実績＝attendance 店×月（新規読取 1 本と同じ SELECT）
  const att = (await c.query(`select cast_id, status from public.attendance where store_id=$1 and date between $2 and $3`, [S, from, to])).rows as { cast_id: string; status: string }[];
  const ps = presentDaysOf(att);
  const oldPresent = new Set(["shukkin", "dohan", "late"]);
  const oldDays = att.filter((a) => oldPresent.has(a.status)).length;
  console.log(`  出勤実績: rows=${att.length} → val=${ps.days}人日（${ps.casts}名）  旧 PRESENT 直書きの人日=${oldDays} => ${oldDays === ps.days ? "同値" : "★差"}`);

  // 4) 商品売上（明細）／時間料金（明細）＝store_category_aggregate 本文（dump）逐語 → sumCategories → productTimeOf
  const cat = (await c.query(`
    with tc as (
      select c.id as check_id, (timezone('Asia/Tokyo', c.started_at) - ($3 || ':00')::interval)::date as bdate
      from public.checks c where c.org_id=$4 and c.store_id=$5 and c.status='closed'
        and (timezone('Asia/Tokyo', c.started_at) - ($3 || ':00')::interval)::date between $1 and $2)
    select tc.bdate, cl.kind, cl.fee_kind, sum(cl.line_total)::bigint as amount, count(*)::int as line_count
    from public.check_lines cl join tc on tc.check_id=cl.check_id where cl.org_id=$4 group by 1,2,3 order by 1,2,3`,
    [from, to, CUT, ORG, S])).rows as { kind: string; fee_kind: string | null; amount: string }[];
  const sums = sumCategories(cat.map((r) => ({ kind: r.kind, fee_kind: r.fee_kind, amount: Number(r.amount) })));
  const pt = productTimeOf(sums);
  console.log(`  商品売上（明細）=${yen(pt.product)} / 時間料金（明細）=${yen(pt.time)}  （product+time+other=${pt.product + pt.time + sums.cats.other} vs total=${sums.total} => ${pt.product + pt.time + sums.cats.other === sums.total ? "一致" : "★差"}）`);
  console.log(`  既存 売上カテゴリ 5 分類（変更前後で不変の経路）: ${CATEGORY_ORDER.map((k) => `${CATEGORY_LABEL[k]} ${yen(sums.cats[k])}`).join(" / ")}・値引き ${yen(sums.discount)}`);

  // 5) dashboard 当日出勤数＝attendance（営業日＝今日の bizDate）PRESENT 数（旧 Set と PRESENT_STATUSES で同値）
  const biz = (await c.query(`select (timezone('Asia/Tokyo', now()) - ($1 || ':00')::interval)::date::text as d`, [CUT])).rows[0].d as string;
  const today = (await c.query(`select cast_id, status from public.attendance where store_id=$1 and date=$2`, [S, biz])).rows as { cast_id: string; status: string }[];
  const newSet = new Set<string>(PRESENT_STATUSES);
  console.log(`  dashboard 当日出勤（biz_date ${biz}）: 旧 Set=${today.filter((a) => oldPresent.has(a.status)).length} / 新 PRESENT_STATUSES=${today.filter((a) => newSet.has(a.status)).length} => ${today.filter((a) => oldPresent.has(a.status)).length === today.filter((a) => newSet.has(a.status)).length ? "同値" : "★差"}`);
  await c.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
