-- b6_dump.sql  /analytics が呼ぶ RPC の live dump（2026/9/10 18:41:08 JST・pg_get_functiondef 逐語・読取のみ）
-- proof: {"k":"nox-project-proof","n":"3"}
-- 対象: customer_list_summary, get_cast_customer_ranking, get_cast_ranking, get_cast_sales, store_category_aggregate, store_cohort_aggregate, store_hourly_aggregate, store_sales_target_set

-- ============================================================
-- customer_list_summary(uuid,boolean)  secdef=true volatile=v acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.customer_list_summary(p_store_id uuid DEFAULT NULL::uuid, p_include_dormant boolean DEFAULT false)
 RETURNS TABLE(customer_id uuid, name text, furigana text, cast_id uuid, is_active boolean, visits integer, last_visit timestamp with time zone, total_spend bigint, active_bottles integer, open_receivable bigint, days_since integer, churn_tier text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_store uuid := public.auth_store_id();
  v_cast  uuid := public.auth_cast_id();
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  return query
  with visible as (
    select cu.*
    from public.customers cu
    where cu.org_id = v_org
      and (v_role = 'owner' or cu.store_id = v_store)           -- 店スコープ
      and (
        v_role in ('owner','manager')
        or (v_role = 'staff' and public.auth_staff_can_crm())
        or (v_role = 'cast'  and cu.cast_id = v_cast)            -- 担当客のみ
      )
      and (p_store_id is null or cu.store_id = p_store_id)       -- owner の店絞り込み任意
      and (cu.is_active or (p_include_dormant and v_role <> 'cast'))  -- 休眠込みは owner/manager のみ・cast には返さない
  ),
  agg as (
    select
      v.id, v.name, v.furigana, v.cast_id, v.is_active,
      (select count(*)::int from public.checks c
         where c.customer_id = v.id and c.status = 'closed') as visits,
      (select max(c.started_at) from public.checks c
         where c.customer_id = v.id and c.status = 'closed') as last_visit,
      (select coalesce(sum(c.total), 0)::bigint from public.checks c
         where c.customer_id = v.id and c.status = 'closed') as total_spend,
      (select count(*)::int from public.bottle_keeps b
         where b.customer_id = v.id and b.status = 'active') as active_bottles,
      (select coalesce(sum(r.amount), 0)::bigint from public.receivables r
         where r.customer_id = v.id and r.status = 'open') as open_receivable
    from visible v
  )
  select
    a.id, a.name, a.furigana, a.cast_id, a.is_active,
    a.visits, a.last_visit, a.total_spend, a.active_bottles, a.open_receivable,
    case when a.last_visit is null then null
         else (current_date - a.last_visit::date) end as days_since,
    case
      when a.last_visit is null then 'none'
      when (current_date - a.last_visit::date) >= 60 then 'high'
      when (current_date - a.last_visit::date) >= 30 then 'mid'
      else 'none'
    end as churn_tier
  from agg a
  order by a.last_visit desc nulls last;
end $function$

;

-- ============================================================
-- get_cast_customer_ranking(uuid,text,uuid)  secdef=true volatile=s acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_cast_customer_ranking(p_store_id uuid, p_period text, p_cast_id uuid)
 RETURNS TABLE(customer_id uuid, customer_name text, hon_count integer, jonai_count integer, dohan_count integer, total_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid;
  v_role     text;
  v_settings jsonb;
  v_cutoff   text;
  v_first    date;
  v_start    timestamptz;
  v_end      timestamptz;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_period is null or p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  select s.org_id, s.settings_json into v_org, v_settings from public.stores s where s.id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- owner は org 全店・manager は自店のみ
  if not (public.auth_role() = 'owner' or p_store_id = public.auth_store_id()) then
    raise exception 'forbidden';
  end if;
  v_role := public.auth_role();
  if v_role = 'staff' then raise exception 'forbidden'; end if;       -- D6a: cast 別客データは castMng 領域
  if v_role not in ('owner','manager') then raise exception 'forbidden'; end if;  -- cast 本人も初版は不可
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;
  select pb.period_start into v_first from public.period_bounds(p_period) pb;  -- ★写像単一ソース（get_cast_ranking と同一）
  v_start := ((v_first::text || ' ' || v_cutoff))::timestamp at time zone 'Asia/Tokyo';
  v_end   := ((((v_first + interval '1 month')::date)::text || ' ' || v_cutoff))::timestamp at time zone 'Asia/Tokyo';

  return query
  with nom_counts as (
    select c.customer_id as cust,
           count(*) filter (where c.nom_type = 'hon')   as hon,
           count(*) filter (where c.nom_type = 'jonai') as jonai,
           count(*) filter (where c.nom_type = 'dohan') as dohan
    from public.check_nominations n
    join public.checks c on c.id = n.check_id
    where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
      and c.started_at >= v_start and c.started_at < v_end
      and n.org_id = v_org
      and n.cast_id = p_cast_id                    -- ★対象 cast 絞り
      and c.customer_id is not null                -- ★客なし指名は脱落
    group by c.customer_id
  )
  select nc.cust,
         cu.name,
         coalesce(nc.hon, 0)::int,
         coalesce(nc.jonai, 0)::int,
         coalesce(nc.dohan, 0)::int,
         (coalesce(nc.hon, 0) + coalesce(nc.jonai, 0) + coalesce(nc.dohan, 0))::int as total_count
  from nom_counts nc
  join public.customers cu on cu.id = nc.cust    -- 客名解決（is_active 不問・過去/休眠客も名前表示）
  order by (coalesce(nc.hon, 0) + coalesce(nc.jonai, 0) + coalesce(nc.dohan, 0)) desc,
           cu.name asc;
end $function$

;

-- ============================================================
-- get_cast_ranking(uuid,text)  secdef=true volatile=s acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_cast_ranking(p_store_id uuid, p_period text)
 RETURNS TABLE(rank integer, cast_id uuid, cast_name text, hon_count integer, jonai_count integer, dohan_count integer, is_self boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid;
  v_settings jsonb;
  v_cutoff   text;
  v_first    date;
  v_start    timestamptz;
  v_end      timestamptz;
  v_self     uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_period is null or p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  select s.org_id, s.settings_json into v_org, v_settings from public.stores s where s.id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- cast/staff/manager は自店のみ・owner は org 全店
  if not (public.auth_role() = 'owner' or p_store_id = public.auth_store_id()) then
    raise exception 'forbidden';
  end if;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;
  select pb.period_start into v_first from public.period_bounds(p_period) pb; -- ★写像単一ソース（1行差し替え）
  v_start := ((v_first::text || ' ' || v_cutoff))::timestamp at time zone 'Asia/Tokyo';
  v_end   := ((((v_first + interval '1 month')::date)::text || ' ' || v_cutoff))::timestamp at time zone 'Asia/Tokyo';
  v_self  := public.auth_cast_id();

  return query
  with nom_counts as (
    select n.cast_id as cid,
           count(*) filter (where c.nom_type = 'hon')   as hon,
           count(*) filter (where c.nom_type = 'jonai') as jonai,
           count(*) filter (where c.nom_type = 'dohan') as dohan
    from public.check_nominations n
    join public.checks c on c.id = n.check_id
    where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
      and c.started_at >= v_start and c.started_at < v_end
      and n.org_id = v_org
    group by n.cast_id
  ),
  back_sums as (
    -- 順位の最終タイブレーク専用（値は返さない）
    select b.cast_id as cid,
           sum(b.drink_back + b.champ_back + b.bottle_back) as backs
    from public.check_cast_backs b
    join public.checks c on c.id = b.check_id
    where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
      and c.started_at >= v_start and c.started_at < v_end
      and b.org_id = v_org
    group by b.cast_id
  )
  select row_number() over (
           order by coalesce(nc.hon, 0) desc,
                    coalesce(nc.hon, 0) + coalesce(nc.jonai, 0) + coalesce(nc.dohan, 0) desc,
                    coalesce(bs.backs, 0) desc,
                    ca.name asc, ca.id asc
         )::int,
         ca.id,
         ca.name,
         coalesce(nc.hon, 0)::int,
         coalesce(nc.jonai, 0)::int,
         coalesce(nc.dohan, 0)::int,
         coalesce(ca.id = v_self, false) -- 非 cast 呼び出し（v_self=null）でも false
  from public.casts ca
  left join nom_counts nc on nc.cid = ca.id
  left join back_sums  bs on bs.cid = ca.id
  where ca.org_id = v_org and ca.store_id = p_store_id and ca.is_active;
end $function$

;

-- ============================================================
-- get_cast_sales(uuid,date,date)  secdef=true volatile=s acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_cast_sales(p_store_id uuid, p_from date, p_to date)
 RETURNS TABLE(cast_id uuid, biz_date date, sales integer, hon integer, jonai integer, dohan integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid;
  v_role text;
  v_self uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select s.org_id into v_org from public.stores s where s.id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- owner は org 全店・manager/cast は自店のみ
  if not (public.auth_role() = 'owner' or p_store_id = public.auth_store_id()) then
    raise exception 'forbidden';
  end if;
  v_role := public.auth_role();
  if v_role = 'staff' then raise exception 'forbidden'; end if; -- D6a: cast 別金額は castMng 領域
  if v_role not in ('owner','manager','cast') then raise exception 'forbidden'; end if;

  if v_role = 'cast' then
    v_self := public.auth_cast_id();
    if v_self is null then raise exception 'forbidden'; end if; -- fail-closed
    return query
      select a.cast_id, a.biz_date, a.sales, a.hon, a.jonai, a.dohan
      from public.cast_sales_aggregate(p_store_id, p_from, p_to) a
      where a.cast_id = v_self;
  else
    return query
      select a.cast_id, a.biz_date, a.sales, a.hon, a.jonai, a.dohan
      from public.cast_sales_aggregate(p_store_id, p_from, p_to) a;
  end if;
end $function$

;

-- ============================================================
-- store_category_aggregate(uuid,date,date)  secdef=true volatile=s acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.store_category_aggregate(p_store_id uuid, p_from date, p_to date)
 RETURNS TABLE(biz_date date, kind text, fee_kind text, amount bigint, line_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid;
  v_role text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_org  := public.auth_org_id();
  v_role := public.auth_role();
  if v_role not in ('owner','manager') then raise exception 'forbidden'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'bad range'; end if;
  if p_to - p_from > 92 then raise exception 'bad range'; end if;
  if p_store_id is null then
    if v_role <> 'owner' then raise exception 'forbidden'; end if;
  else
    perform 1 from public.stores s where s.id = p_store_id and s.org_id = v_org;
    if not found then raise exception 'forbidden'; end if;
    if not (v_role = 'owner' or p_store_id = public.auth_store_id()) then raise exception 'forbidden'; end if;
  end if;
  if exists (
    select 1 from public.stores s
    where s.org_id = v_org and (p_store_id is null or s.id = p_store_id)
      and coalesce(nullif(trim(coalesce(s.settings_json, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00')
          !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ) then raise exception 'bad store settings'; end if;

  return query
  with tstores as (
    select s.id,
           coalesce(nullif(trim(coalesce(s.settings_json, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00') as cutoff
    from public.stores s
    where s.org_id = v_org and (p_store_id is null or s.id = p_store_id)
  ),
  tc as (
    select c.id as check_id,
           (timezone('Asia/Tokyo', c.started_at) - (ts.cutoff || ':00')::interval)::date as bdate
    from public.checks c
    join tstores ts on ts.id = c.store_id
    where c.org_id = v_org and c.status = 'closed'
      and (timezone('Asia/Tokyo', c.started_at) - (ts.cutoff || ':00')::interval)::date between p_from and p_to
  )
  select tc.bdate, cl.kind, cl.fee_kind,
         sum(cl.line_total)::bigint,
         count(*)::int
  from public.check_lines cl
  join tc on tc.check_id = cl.check_id
  where cl.org_id = v_org
  group by 1, 2, 3
  order by 1, 2, 3;
end $function$

;

-- ============================================================
-- store_cohort_aggregate(uuid,text,integer)  secdef=true volatile=s acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.store_cohort_aggregate(p_store_id uuid, p_from_month text, p_months integer)
 RETURNS TABLE(cohort_month text, month_offset integer, customer_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org   uuid;
  v_role  text;
  v_start date;
  v_limit date;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_org  := public.auth_org_id();
  v_role := public.auth_role();
  if v_role not in ('owner','manager') then raise exception 'forbidden'; end if;
  if p_from_month is null or p_from_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  if p_months is null or p_months < 1 or p_months > 12 then raise exception 'bad range'; end if;
  if p_store_id is null then
    if v_role <> 'owner' then raise exception 'forbidden'; end if;
  else
    perform 1 from public.stores s where s.id = p_store_id and s.org_id = v_org;
    if not found then raise exception 'forbidden'; end if;
    if not (v_role = 'owner' or p_store_id = public.auth_store_id()) then raise exception 'forbidden'; end if;
  end if;
  if exists (
    select 1 from public.stores s
    where s.org_id = v_org and (p_store_id is null or s.id = p_store_id)
      and coalesce(nullif(trim(coalesce(s.settings_json, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00')
          !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ) then raise exception 'bad store settings'; end if;

  v_start := to_date(p_from_month || '-01', 'YYYY-MM-DD');
  v_limit := (v_start + make_interval(months => p_months))::date;

  return query
  with tstores as (
    select s.id,
           coalesce(nullif(trim(coalesce(s.settings_json, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00') as cutoff
    from public.stores s
    where s.org_id = v_org and (p_store_id is null or s.id = p_store_id)
  ),
  visits as (
    -- 顧客×来店月（distinct）。全履歴＝初来店月の確定に窓外も必要
    select c.customer_id,
           date_trunc('month',
             (timezone('Asia/Tokyo', c.started_at) - (ts.cutoff || ':00')::interval)::date)::date as vmonth
    from public.checks c
    join tstores ts on ts.id = c.store_id
    where c.org_id = v_org and c.status = 'closed' and c.customer_id is not null
    group by 1, 2
  ),
  firsts as (
    select v.customer_id, min(v.vmonth) as cmonth from visits v group by 1
  ),
  cohorts as (
    select f.customer_id, f.cmonth
    from firsts f
    where f.cmonth >= v_start and f.cmonth < v_limit
  )
  select to_char(co.cmonth, 'YYYY-MM'),
         (((extract(year from v.vmonth) - extract(year from co.cmonth)) * 12)
           + (extract(month from v.vmonth) - extract(month from co.cmonth)))::int,
         count(distinct v.customer_id)::int
  from cohorts co
  join visits v on v.customer_id = co.customer_id
  where v.vmonth >= co.cmonth
  group by 1, 2
  order by 1, 2;
end $function$

;

-- ============================================================
-- store_hourly_aggregate(uuid,date,date,uuid)  secdef=true volatile=s acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.store_hourly_aggregate(p_store_id uuid, p_from date, p_to date, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(biz_date date, dow integer, hour integer, sales bigint, check_count integer, guest_count integer, stay_min_sum bigint, stay_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid;
  v_role text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_org  := public.auth_org_id();
  v_role := public.auth_role();
  if v_role not in ('owner','manager') then raise exception 'forbidden'; end if;
  -- 範囲検証（cast_sales_aggregate 写経: p_from<=p_to・上限92日）
  if p_from is null or p_to is null or p_from > p_to then raise exception 'bad range'; end if;
  if p_to - p_from > 92 then raise exception 'bad range'; end if;
  -- 店スコープ（null=owner の org 合算・manager は自店のみ）
  if p_store_id is null then
    if v_role <> 'owner' then raise exception 'forbidden'; end if;
  else
    perform 1 from public.stores s where s.id = p_store_id and s.org_id = v_org;
    if not found then raise exception 'forbidden'; end if;
    if not (v_role = 'owner' or p_store_id = public.auth_store_id()) then raise exception 'forbidden'; end if;
  end if;
  -- 対象全店の cutoff 検証（写経: 既定 06:00・不正は bad store settings）
  if exists (
    select 1 from public.stores s
    where s.org_id = v_org and (p_store_id is null or s.id = p_store_id)
      and coalesce(nullif(trim(coalesce(s.settings_json, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00')
          !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ) then raise exception 'bad store settings'; end if;

  return query
  with tstores as (
    select s.id,
           coalesce(nullif(trim(coalesce(s.settings_json, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00') as cutoff
    from public.stores s
    where s.org_id = v_org and (p_store_id is null or s.id = p_store_id)
  ),
  tc as (
    -- SL6a 同型: closed のみ。biz_date=(JST(started_at)−店別cutoff)::date・hour=JST 時計時刻
    select (timezone('Asia/Tokyo', c.started_at) - (ts.cutoff || ':00')::interval)::date as bdate,
           extract(hour from timezone('Asia/Tokyo', c.started_at))::int                  as hh,
           c.total, c.people, c.started_at, c.closed_at
    from public.checks c
    join tstores ts on ts.id = c.store_id
    where c.org_id = v_org and c.status = 'closed'
      and (p_customer_id is null or c.customer_id = p_customer_id)
      and (timezone('Asia/Tokyo', c.started_at) - (ts.cutoff || ':00')::interval)::date between p_from and p_to
  )
  select tc.bdate,
         extract(dow from tc.bdate)::int,
         tc.hh,
         sum(tc.total)::bigint,
         count(*)::int,
         sum(coalesce(tc.people, 0))::int,
         sum(case when tc.closed_at is not null
                  then greatest(0, floor(extract(epoch from (tc.closed_at - tc.started_at)) / 60))::bigint
                  else 0 end)::bigint,
         count(*) filter (where tc.closed_at is not null)::int
  from tc
  group by 1, 2, 3
  order by 1, 3;
end $function$

;

-- ============================================================
-- store_sales_target_set(uuid,text,bigint)  secdef=true volatile=v acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.store_sales_target_set(p_store_id uuid, p_period text, p_amount bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org    uuid;
  v_owner  uuid;
  v_before jsonb;
  v_id     uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_org := public.auth_org_id();
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_period is null or p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  if p_amount is not null and p_amount < 0 then raise exception 'bad amount'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> v_org then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  select to_jsonb(t) into v_before from public.store_sales_targets t
    where t.store_id = p_store_id and t.period = p_period;

  if p_amount is null then
    -- 目標クリア（行削除）。なし→なしは無音（audit を汚さない）
    if v_before is null then return null; end if;
    delete from public.store_sales_targets
      where store_id = p_store_id and period = p_period
      returning id into v_id;
    perform public.audit_log_write('store_sales_target_set', 'store_sales_targets:' || v_id::text,
      v_before, null, p_store_id);
    return v_id;
  end if;

  insert into public.store_sales_targets (org_id, store_id, period, sales_target)
  values (v_org, p_store_id, p_period, p_amount)
  on conflict (store_id, period) do update set sales_target = excluded.sales_target, updated_at = now()
  returning id into v_id;

  perform public.audit_log_write('store_sales_target_set', 'store_sales_targets:' || v_id::text,
    v_before,
    (select to_jsonb(t) from public.store_sales_targets t where t.id = v_id),
    p_store_id);
  return v_id;
end $function$

;
