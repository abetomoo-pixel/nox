-- 0165_cast_sales_aggregate_materialized.sql
-- マイグレーション名: 0165_cast_sales_aggregate_materialized（裁定336＝案 A・起票100・便 G2・2026-10-08 起草）
-- 生成器: docs/tmp/gen_0165.mjs（手打ち禁止）。写経元＝live の pg_get_functiondef(cast_sales_aggregate)＝docs/tmp/0165_live.json（CR 除去）。
--   差分＝CTE `groups as (` → `groups as materialized (` の 1 語だけ（出現 1 回を assert・他は 1 バイト不変＝299-11）。署名・STABLE・SECURITY DEFINER・search_path 不変。
--
-- 写経元 live md5（2026-10-08・prosrc の CR 除去・先頭 8 桁）→ 本 mig 適用後の期待 md5:
--   cast_sales_aggregate  f765c36a → e232dac8
--   不触の控え（適用後も不変であること）: get_cast_sales eaec39a4／check_group_due 6c1ef055／demo_org_reset a4bd6a18
--
-- 理由（起票100＝便 G1 の計測）: PG12 以降は 1 回参照の CTE が inline（subquery 化）され、groups の due＝check_group_due(check_id, pay_group)（STABLE plpgsql）が
--   後段の join（noms）と window（ranked）の行ごと・参照ごとに再評価される＝N+1 型。NOIR（closed 501 件・1 か月）で 8,359 ms＞authenticated の statement_timeout 8s
--   ＝月次の給与プレビュー／確定が 500。materialized で 1 回評価（呼出 501 回）＝95.5 ms（87 倍）・結果の行は不変（due=0 の同クエリは 30 ms＝index／RLS は原因でない）。
--
-- 器: cast_sales_aggregate を CREATE OR REPLACE（本文は live 写経＋1 語）。内部専用（原則8・名簿 B(a)）＝4 ロール明示 revoke を再掲・grant なし＝ACL {postgres=X/postgres} 不変。
--   新規 RPC なし・表なし＝名簿 303／表 83 不変・'billing locked' 154 不変。demo_org_reset 不触。
--
-- 検証クエリ（Run 後・下の commit; の後ろ・貼り先証明を先頭に・値は形だけ返す）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   select left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname='cast_sales_aggregate';   -- e232dac8
--   select left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname='get_cast_sales';         -- eaec39a4（不変）
--   select proacl::text from pg_proc where proname='cast_sales_aggregate';                               -- {postgres=X/postgres}
--   select position('groups as materialized' in prosrc) > 0 from pg_proc where proname='cast_sales_aggregate';   -- true
--   select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions, (select count(*) from pg_tables where schemaname='public') tables;   -- 303／83
--   explain (analyze) select * from public.cast_sales_aggregate((select s.id from public.stores s join public.orgs o on o.id=s.org_id where o.name='NOX-DEMO-NOIR'), '2026-09-01', '2026-09-30');   -- Execution Time 200 ms 未満
begin;

-- ★1 cast_sales_aggregate: live 写経＋ `groups as materialized (`（1 語）
CREATE OR REPLACE FUNCTION public.cast_sales_aggregate(p_store_id uuid, p_from date, p_to date)
 RETURNS TABLE(cast_id uuid, biz_date date, sales integer, hon integer, jonai integer, dohan integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid;
  v_settings jsonb;
  v_cutoff   text;
begin
  if p_from is null or p_to is null or p_from > p_to then raise exception 'bad range'; end if;
  if p_to - p_from > 92 then raise exception 'bad range'; end if; -- 給与期間の常識的上限(四半期)
  select s.org_id, s.settings_json into v_org, v_settings from public.stores s where s.id = p_store_id;
  if v_org is null then raise exception 'not found'; end if;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;

  return query
  with target_checks as (
    -- SL6a: closed のみ(void/open 除外)。SL5a: biz_date=(JST(started_at)−cutoff)::date【2】
    select c.id as check_id,
           c.nom_type,
           (timezone('Asia/Tokyo', c.started_at) - (v_cutoff || ':00')::interval)::date as bdate
    from public.checks c
    where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
      and (timezone('Asia/Tokyo', c.started_at) - (v_cutoff || ':00')::interval)::date between p_from and p_to
  ),
  noms as (
    -- SL4a: nomination の無い伝票(フリー卓)はここで自然に脱落=非帰属
    select n.check_id, n.cast_id as cid, n.ratio_weight, n.position, n.nom_kind, n.is_dohan  -- ★0119
    from public.check_nominations n
    join target_checks tc on tc.check_id = n.check_id
    where n.org_id = v_org
  ),
  wsum as (
    select nm.check_id, sum(nm.ratio_weight)::bigint as w_total
    from noms nm group by nm.check_id
  ),
  groups as materialized (
    -- SL2a: 金額基盤=group due(check_group_due 再利用・サ料込・100円丸め後・カードTAX 非含)
    select tc.check_id, tc.bdate, l.pay_group,
           public.check_group_due(tc.check_id, l.pay_group) as due
    from target_checks tc
    join (select distinct cl.check_id, cl.pay_group from public.check_lines cl where cl.org_id = v_org) l
      on l.check_id = tc.check_id
  ),
  alloc as (
    -- SL1a: weight 按分・整数演算のみ【1】 base=div(due×w, W)・rem=(due×w) mod W
    select g.check_id, g.bdate, g.pay_group, nm.cid,
           ((g.due::bigint * nm.ratio_weight) / ws.w_total)::int  as base_part,
           ((g.due::bigint * nm.ratio_weight) % ws.w_total)       as rem_part,
           nm.position,
           g.due
    from groups g
    join noms nm on nm.check_id = g.check_id
    join wsum ws on ws.check_id = g.check_id
    where g.due > 0 and ws.w_total > 0 -- 全 weight 0 は按分不能=按分なし(★0124: ended/全0 名簿を許容・w_total ガードが権威)
  ),
  ranked as (
    select a.*,
           row_number() over (partition by a.check_id, a.pay_group
                              order by a.rem_part desc, a.position asc) as rk,
           a.due - sum(a.base_part) over (partition by a.check_id, a.pay_group) as remainder_units
    from alloc a
  ),
  parts as (
    select r.cid, r.bdate,
           r.base_part + case when r.rk <= r.remainder_units then 1 else 0 end as part
    from ranked r
  ),
  sales_by_day as (
    select p.cid, p.bdate, sum(p.part)::int as sales_sum
    from parts p group by p.cid, p.bdate
  ),
  counts_by_day as (
    -- SL8a/D9a: 伝票単位カウント(distinct check)・★0119 裁定100: 種別は名簿行(キャスト別)・attendance 不参加
    --   0118 backfill により既存伝票は旧 checks.nom_type 由来と同値
    select nm.cid, tc.bdate,
           count(distinct tc.check_id) filter (where nm.nom_kind = 'hon')::int   as hon_cnt,
           count(distinct tc.check_id) filter (where nm.nom_kind = 'jonai')::int as jonai_cnt,
           count(distinct tc.check_id) filter (where nm.is_dohan)::int           as dohan_cnt
    from noms nm
    join target_checks tc on tc.check_id = nm.check_id
    group by nm.cid, tc.bdate
  )
  select coalesce(s.cid, k.cid),
         coalesce(s.bdate, k.bdate),
         coalesce(s.sales_sum, 0),
         coalesce(k.hon_cnt, 0),
         coalesce(k.jonai_cnt, 0),
         coalesce(k.dohan_cnt, 0)
  from sales_by_day s
  full outer join counts_by_day k on k.cid = s.cid and k.bdate = s.bdate
  order by 2, 1;
end $function$
;

-- ★2 内部専用の ACL を保全（4 ロール明示 revoke・grant なし＝原則8・名簿 B(a)）
revoke all on function public.cast_sales_aggregate(uuid, date, date) from public, anon, authenticated, service_role;

commit;
-- ===== end 0165 =====
