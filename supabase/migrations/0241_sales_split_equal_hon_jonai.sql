-- 0241g_sales_split_equal_hon_jonai（決め g 版＝相談役 11/27 11:15 の推し・裁定511-7a・#334・R24・相談役 11/26 の決め・起草と手元の試走まで・適用はしない）
--   決め（Agoora 2026-11-26 22:20）：「全員で等分」の店では場内も等分に入れる（動きを初期設定の例文「全員で等分＝A・B とも ¥30,000」に合わせる）。
--   今の本番：売上の数え方 sales_split＝equal は「分配率が 0 より大きい人を 1 として等分」。レジの既定は本指名がいると場内を 0% にする＝例の場内 B は ¥0 だった。
--   ★決め g（相談役 11/27 11:15 の推し）：「全員で等分」に入れるのは本指名と場内だけ。同伴だけの人（フリー＋同伴・分配率 0）は入れない（同伴バックは生の分配率で出す＝等分を見ない）。今の版（0241_sales_split_equal_jonai.sql）との違いは ratio_weight の 1 行（n.is_dohan を外す）だけ（2 本とも）。
--   中身：
--     ★1 cast_sales_aggregate・★2 cast_sales_aggregate_subtotal の作り直し（同じ署名・内部専用のまま＝ACL は postgres だけ）。
--        equal のとき、本指名・場内の人は分配率が 0 でも 1・分配率が 0 より大きい人は前と同じく 1・それ以外（分配率 0 のフリー・分配率 0 の同伴だけの人）は 0。prorate（分配率で分ける）は前のまま。
--     売上（スライド・ノルマ・ランキング・売上歩合）の数え方だけ。ドリンクのバックの按分（check_close）は分配率のまま＝変えない。
--   511-7b（フリーだけの卓はだれにも付けない）はこの本体に入れていない＝デモの給与の下書きが変わるので止めて報告（docs/tmp/nom_split_1126/READY.md の 7b の節・測り用の案は new_7b/）。
--   本番の今：sales_split＝equal の店は 0 店（デモを含む）＝当てても今の数字は変わらない（試走で確かめる）。
--   変えないもの：表・列・索引・ほかの関数（関数の数・表の数は変わらない）。
--   翻訳元：本番の cast_sales_aggregate（md5(prosrc) b45ce0978bfeb52cfb3618c0168b9132）・cast_sales_aggregate_subtotal（d6bcec88d62ecec95373b1891f03e39c）。差分：docs/tmp/nom_split_1126/diff_live.md。
--   事前確認：docs/tmp/nom_split_1126/g/0241_precheck.sql（g/ の中は決め g 版）（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/nom_split_1126/g/0241_verify.sql（g/ の中は決め g 版）。
begin;
set local lock_timeout = '10s';

-- ═══ ★1 cast_sales_aggregate（作り直し・同じ署名・CREATE OR REPLACE） ═══
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
  v_split    text;   -- ★3 0175（裁定409）: 店設定 sales_split（prorate＝伝票の分配率・equal＝等分）
begin
  if p_from is null or p_to is null or p_from > p_to then raise exception 'bad range'; end if;
  if p_to - p_from > 92 then raise exception 'bad range'; end if; -- 給与期間の常識的上限(四半期)
  select s.org_id, s.settings_json into v_org, v_settings from public.stores s where s.id = p_store_id;
  if v_org is null then raise exception 'not found'; end if;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;
  v_split := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'sales_split'), ''), 'prorate');   -- ★3 0175（裁定409）

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
    select n.check_id, n.cast_id as cid,
           -- ★0241g（裁定511-7a・決め g＝相談役 11/27 の推し）: equal＝「指名した人で等分」＝本指名・場内の人は分配率が 0 でも 1 として等分（レジの既定は本指名がいると場内を 0% にする＝前は場内が ¥0 になった）。
           --   同伴だけの人（フリー＋同伴・分配率 0）は入れない（同伴バックは生の分配率で出す＝rules-0175-collect.ts）。分配率が 0 より大きい人は前と同じく 1。prorate（分配率で分ける）は前のまま。
           case when v_split = 'equal' and (n.ratio_weight > 0 or n.nom_kind in ('hon','jonai')) then 1
                when v_split = 'equal' then 0
                else n.ratio_weight end as ratio_weight,
           n.position, n.nom_kind, n.is_dohan  -- ★0119
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
           public.check_group_due(tc.check_id, l.pay_group, true) as due   -- ★6 0173（裁定393）: 手数料行を除外（キャストの売上・ノルマ・歩合・スライドに乗せない）
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
end $function$;
revoke all on function public.cast_sales_aggregate(uuid, date, date) from public, anon, authenticated, service_role;

-- ═══ ★2 cast_sales_aggregate_subtotal（作り直し・同じ署名・CREATE OR REPLACE） ═══
CREATE OR REPLACE FUNCTION public.cast_sales_aggregate_subtotal(p_store_id uuid, p_from date, p_to date)
 RETURNS TABLE(cast_id uuid, biz_date date, sales integer, hon integer, jonai integer, dohan integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid;
  v_settings jsonb;
  v_cutoff   text;
  v_split    text;   -- ★3 0175（裁定409）: 店設定 sales_split（prorate＝伝票の分配率・equal＝等分）
begin
  if p_from is null or p_to is null or p_from > p_to then raise exception 'bad range'; end if;
  if p_to - p_from > 92 then raise exception 'bad range'; end if; -- 給与期間の常識的上限(四半期)
  select s.org_id, s.settings_json into v_org, v_settings from public.stores s where s.id = p_store_id;
  if v_org is null then raise exception 'not found'; end if;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;
  v_split := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'sales_split'), ''), 'prorate');   -- ★3 0175（裁定409）

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
    select n.check_id, n.cast_id as cid,
           -- ★0241g（裁定511-7a・決め g＝相談役 11/27 の推し）: equal＝「指名した人で等分」＝本指名・場内の人は分配率が 0 でも 1 として等分（レジの既定は本指名がいると場内を 0% にする＝前は場内が ¥0 になった）。
           --   同伴だけの人（フリー＋同伴・分配率 0）は入れない（同伴バックは生の分配率で出す＝rules-0175-collect.ts）。分配率が 0 より大きい人は前と同じく 1。prorate（分配率で分ける）は前のまま。
           case when v_split = 'equal' and (n.ratio_weight > 0 or n.nom_kind in ('hon','jonai')) then 1
                when v_split = 'equal' then 0
                else n.ratio_weight end as ratio_weight,
           n.position, n.nom_kind, n.is_dohan  -- ★0119
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
           public.check_group_subtotal(tc.check_id, l.pay_group) as due   -- ★0201s（相談役 夜 2 ③）: 小計＝請求額の側（check_group_due の手数料を除く版）と同じ数え方の税・サ料・丸めの前（支払方法の割引と合計からの割引を引く・お客様負担の紹介料を足す）
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
end $function$;
revoke all on function public.cast_sales_aggregate_subtotal(uuid, date, date) from public, anon, authenticated, service_role;

commit;
