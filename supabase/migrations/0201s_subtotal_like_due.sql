-- 0201s_subtotal_like_due（2026-11-18 夜 2 起草・CC・相談役 ③・起草と試走まで＝貼らない・0201r と同じ朝に続けて手貼り）。生成器＝docs/tmp/gen_0201s.mjs（底本＝docs/tmp/live_0201s/・CR を除いた md5 を照合）。
--   小計の売上（cast_sales_aggregate_subtotal＝get_cast_sales_subtotal の中身）を請求額の側と同じ数え方に：支払方法の割引（pay_discount・pay_discount_total）を引く・お客様負担の紹介料を足す。違いは税・サ料・丸めが無いことだけ。
--   新しい内部専用の関数 check_group_subtotal（4 ロール revoke・grant なし）＋cast_sales_aggregate_subtotal の金額の 1 行の差し替え。関数 454→455・表 122 のまま。前提＝0201r の後。
--   今は sales_basis を保存している店が 0＝貼っても給与の計算は変わらない（collect が小計を読む便＝③は未 push）。
-- 検証クエリ＝docs/tmp/0201s_verify.sql（先頭は貼り先証明）
begin;
set local lock_timeout = '10s';
CREATE OR REPLACE FUNCTION public.check_group_subtotal(p_check_id uuid, p_pay_group text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0201s（2026-11-18 夜 2・相談役 ③）: 伝票×pay_group の小計＝check_group_due(p_check_id, p_pay_group, true)（キャストの売上が使う手数料を除く版）の「税・サ料・丸めの前」。
--   数え方は請求額の側と同じ：行の合計（割引の行と支払の手数料 pay_fee を除く）＋お客様負担の紹介料（pay_group 'A'）−割引の行（支払方法の割引 pay_discount を含む・合計からの割引は除く）を 0 で止め、
--   合計からの割引（pay_discount_total）を最後に引いて 0 で止める。違いは税・サ料・丸めが無いことだけ（請求額の側は丸めた合計から合計からの割引を引く）。内部専用（4 ロール revoke）。
declare
  v_bx int; v_disc int; v_post int; v_ref int := 0;
begin
  select coalesce(sum(line_total), 0)::int into v_bx
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind <> 'discount' and fee_kind is distinct from 'pay_fee';
  if p_pay_group = 'A' then
    select coalesce(sum(amount), 0)::int into v_ref from public.check_referrals where check_id = p_check_id and burden = 'customer';
    v_bx := v_bx + v_ref;
  end if;
  select coalesce(sum(line_total), 0)::int into v_disc
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind = 'discount' and fee_kind is distinct from 'pay_discount_total';
  select coalesce(sum(line_total), 0)::int into v_post
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind = 'discount' and fee_kind = 'pay_discount_total';
  return greatest(0, greatest(0, v_bx - v_disc) - v_post);
end $function$;

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
           case when v_split = 'equal' and n.ratio_weight > 0 then 1 else n.ratio_weight end as ratio_weight,   -- ★3 0175（裁定409）: equal＝分配率>0 の全員を 1 として等分（0＝分配なしは据え置き）
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

revoke execute on function public.check_group_subtotal(uuid, text) from public, anon, authenticated, service_role;   -- 内部専用（cast_sales_aggregate_subtotal と同じ＝4 ロール明示 revoke・grant なし）
commit;
