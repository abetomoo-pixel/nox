-- ═══════════════════════════════════════════════════════════════════════════
-- mig0096: E8-6 分析レーン DB 基盤（自己検証版）
--   store_sales_targets（#3 月間目標）＋ T4 集計 RPC 3本（#5/#7/#8/#13・customers#5・平均滞在）
--   ＋ store_sales_target_set（書込・billing ゲート入り）
--   底本 = nox_mig0096_live_defs.sql（sha256 63875e0a…51b5・live 逐語＝cutoff 検証/92日ガード/
--          窓構成/ゲート形は cast_sales_aggregate・get_store_nom_counts からの写経）
-- ─────────────────────────────────────────────────────────────────────────────
-- ★非冪等（本番手貼り1回・再実行厳禁）: create table／名前付き add constraint
-- ★notify pgrst はファイル外・手貼り後に単発
-- ★読取3本は非ゲート（既存集計 RPC 群と同列・STABLE 表示専用）
-- ★store_sales_target_set は billing ゲート入り新設＝ゲート対象 +1（pin 91→92・課金正本追記が
--   実装ブロックで必要）
-- ★段53 注意（台帳842）: returns table の集計 RPC は「行が返る状態」での runtime 実行検証が必須
--
-- 裁定（台帳収載・E8-6 系）:
--   E8-6-1 粒度=1時間・JST 時計時刻(0..23)・曜日=biz_date の曜日・非ゼロ行のみ返却
--   E8-6-2 returns table
--   E8-6-3 用途別3本（hourly/category/cohort）
--   E8-6-4 単層・owner/manager のみ・p_store_id null=owner の org 合算（cutoff は店別適用）
--   E8-6-5 hourly/category=from/to≤92日・cohort=YYYY-MM＋months≤12
--   E8-6-6 store_sales_targets 新テーブル（cast_norms 対称）＋setter（null=削除）
--   E8-6-7 読取非ゲート・setter のみゲート
--   E8-6-8 5分類写像は DB に焼かない＝category は kind×fee_kind 生Σ・写像は client 純関数
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────
-- (1) DDL: store_sales_targets（cast_norms 対称写経・store×period）
-- ─────────────────────────────────────────────
create table public.store_sales_targets (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id),
  store_id     uuid not null references public.stores(id),
  period       text not null,
  sales_target bigint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint store_sales_targets_period_check
    check (period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  constraint store_sales_targets_sales_target_check
    check (sales_target >= 0),
  constraint store_sales_targets_store_period_key unique (store_id, period)
);

create index store_sales_targets_org_idx on public.store_sales_targets (org_id);

alter table public.store_sales_targets enable row level security;

-- RLS: owner/manager のみ（cast_norms の cast 腕は store 目標には不要）
create policy store_sales_targets_select on public.store_sales_targets for select to authenticated using (
  org_id = public.auth_org_id()
  and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
  and public.auth_role() in ('owner','manager')
);

-- grants 規範形（新テーブルは authenticated 書込も revoke）
revoke all on table public.store_sales_targets from public, anon, authenticated;
grant select on table public.store_sales_targets to authenticated;

-- ─────────────────────────────────────────────
-- (2) store_hourly_aggregate（#7 ヒートマップ・#8 時間帯バー・平均滞在・customers#5 来店傾向）
--     単層・owner/manager・p_store_id null=owner org 合算（cutoff 店別）・p_customer_id で絞込可
-- ─────────────────────────────────────────────
create or replace function public.store_hourly_aggregate(p_store_id uuid, p_from date, p_to date, p_customer_id uuid default null)
 returns table(biz_date date, dow integer, hour integer, sales bigint, check_count integer, guest_count integer, stay_min_sum bigint, stay_count integer)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
end $function$;

revoke execute on function public.store_hourly_aggregate(uuid, date, date, uuid) from public, anon;
grant  execute on function public.store_hourly_aggregate(uuid, date, date, uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────
-- (3) store_category_aggregate（#5 カテゴリ5分類の分類元＝kind×fee_kind 生Σ・写像は client）
-- ─────────────────────────────────────────────
create or replace function public.store_category_aggregate(p_store_id uuid, p_from date, p_to date)
 returns table(biz_date date, kind text, fee_kind text, amount bigint, line_count integer)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
end $function$;

revoke execute on function public.store_category_aggregate(uuid, date, date) from public, anon;
grant  execute on function public.store_category_aggregate(uuid, date, date) to authenticated, service_role;

-- ─────────────────────────────────────────────
-- (4) store_cohort_aggregate（#13 コホート・リピート率）
--     初来店月=全履歴の min（窓外も走査＝RPC 化の根拠）・月帰属は店別 cutoff の biz_date
-- ─────────────────────────────────────────────
create or replace function public.store_cohort_aggregate(p_store_id uuid, p_from_month text, p_months integer)
 returns table(cohort_month text, month_offset integer, customer_count integer)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
end $function$;

revoke execute on function public.store_cohort_aggregate(uuid, text, integer) from public, anon;
grant  execute on function public.store_cohort_aggregate(uuid, text, integer) to authenticated, service_role;

-- ─────────────────────────────────────────────
-- (5) store_sales_target_set（#3 目標の書込・billing ゲート入り・null=削除）
-- ─────────────────────────────────────────────
create or replace function public.store_sales_target_set(p_store_id uuid, p_period text, p_amount bigint)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
end $function$;

revoke execute on function public.store_sales_target_set(uuid, text, bigint) from public, anon;
grant  execute on function public.store_sales_target_set(uuid, text, bigint) to authenticated, service_role;

commit;
