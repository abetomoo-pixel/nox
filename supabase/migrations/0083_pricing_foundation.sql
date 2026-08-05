-- =====================================================================
-- NOX mig0083  料金ルール一般化・基盤（設計書 v1.2 §1/§2/§4/§5）【_r2】
--
-- _r2 での改訂（2026-08-05 CC 手貼り前照合 A4 の指摘反映・初版は手貼り未実施）:
--   新テーブルの grants を規範形（全剥がし→必要 grant のみ戻す）に修正。
--   初版の名指し revoke では TRUNCATE / REFERENCES / TRIGGER が authenticated に
--   残存（★TRUNCATE は RLS 非適用＝全消し可能）。0002 検証(4) の既存規約・
--   product_categories 等の実測 ACL と同型に統一。A1/A2/A3/A5 は照合OK。
--
-- 内容: cast_ranks / casts.rank_id / pricing_rules / RLS・grants /
--       biz_minutes_of（内部ヘルパー）/ pricing_resolve /
--       set_pricing_rule / delete_pricing_rule / pricing_rule_reorder /
--       set_cast_rank / cast_rank_reorder / set_cast_rank_of
--
-- 設計正本: docs/NOX_料金ルール一般化_設計書v1_2.md（裁定4点確定・
--   B最終形＝指名バックの正本は comp_plan・本 mig はバックを扱わない）
--
-- ★手貼り前に CC の live 照合が必須（想定2点）:
--   A1. casts の列（org_id / store_id / id の存在・rank_id 未存在）
--   A2. audit_log_write 署名（(p_action,p_target,p_before,p_after,p_store_id)
--       ＝0080 で照合済みだが再確認）
--
-- ★冪等性: 非冪等（create table＋add column）。手貼りは1回・再貼り厳禁。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) cast_ranks
-- ---------------------------------------------------------------------
create table public.cast_ranks (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id),
  store_id   uuid not null references public.stores(id),
  name       text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index cast_ranks_store_name_uq
  on public.cast_ranks (store_id, lower(name));
create index cast_ranks_store_idx on public.cast_ranks (store_id);

alter table public.cast_ranks enable row level security;
create policy cast_ranks_select on public.cast_ranks
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (
      public.auth_role() = 'owner'
      or (public.auth_role() = 'manager' and store_id = public.auth_store_id())
    )
  );

-- _r2: 規範形＝全剥がし→必要 grant のみ戻す（authenticated には7権限が
--   自動付与され、TRUNCATE は RLS 非適用のため名指し revoke では塞げない）
revoke all on table public.cast_ranks from public, anon, authenticated;
grant select on table public.cast_ranks to authenticated;


-- ---------------------------------------------------------------------
-- 2) casts.rank_id ＋ kind の意味確定
-- ---------------------------------------------------------------------
alter table public.casts
  add column rank_id uuid null references public.cast_ranks(id);

comment on column public.casts.kind is
  '在籍区分の自由記述（例: 体入）。ランクではない。ランクは rank_id（mig0083）。';


-- ---------------------------------------------------------------------
-- 3) pricing_rules
-- ---------------------------------------------------------------------
create table public.pricing_rules (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id),
  store_id      uuid not null references public.stores(id),
  fee_kind      text not null
                check (fee_kind in ('set','extension','dohan','hon_shimei','jonai_shimei')),
  seat_kind     text null
                check (seat_kind is null or seat_kind in ('卓','カウンター','VIP')),
  dow_mask      integer null
                check (dow_mask is null or (dow_mask between 1 and 127)),
  time_from_min smallint null
                check (time_from_min is null or (time_from_min between 0 and 1439)),
  time_to_min   smallint null
                check (time_to_min is null or (time_to_min between 0 and 1439)),
  rank_id       uuid null references public.cast_ranks(id),
  amount        integer not null check (amount >= 0),
  duration_min  smallint null check (duration_min is null or duration_min >= 1),
  priority      integer not null default 100,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- 時間帯は両方 null（終日）か両方非 null
  check ((time_from_min is null) = (time_to_min is null)),
  -- rank は指名系のみ
  check (fee_kind in ('hon_shimei','jonai_shimei') or rank_id is null),
  -- duration は set/extension のみ
  check (fee_kind in ('set','extension') or duration_min is null)
);
create index pricing_rules_resolve_idx
  on public.pricing_rules (store_id, fee_kind, is_active, priority);

alter table public.pricing_rules enable row level security;
create policy pricing_rules_select on public.pricing_rules
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (
      public.auth_role() = 'owner'
      or (public.auth_role() = 'manager' and store_id = public.auth_store_id())
    )
  );

-- _r2: 規範形（cast_ranks と同じ理由）
revoke all on table public.pricing_rules from public, anon, authenticated;
grant select on table public.pricing_rules to authenticated;


-- ---------------------------------------------------------------------
-- 4) biz_minutes_of（内部ヘルパー・RPC 専用＝authenticated にも出さない）
--    営業日の曜日（bit0=月..bit6=日）と営業日拡張分（0..2879）を返す。
--    cutoff は mig0010:224 の既存イディオムを逐語再掲（形式チェック込み）。
-- ---------------------------------------------------------------------
create or replace function public.biz_minutes_of(
  p_store_id uuid,
  p_at       timestamptz
)
returns table(biz_dow smallint, biz_min integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings jsonb;
  v_cutoff   text;
  v_cut_min  integer;
  v_local    timestamp;
  v_clock    integer;
  v_bizdate  date;
begin
  select s.settings_json into v_settings
    from public.stores s where s.id = p_store_id;
  if not found then raise exception 'forbidden'; end if;

  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'bad store settings';
  end if;
  v_cut_min := split_part(v_cutoff, ':', 1)::int * 60 + split_part(v_cutoff, ':', 2)::int;

  v_local := p_at at time zone 'Asia/Tokyo';
  v_clock := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;

  -- 営業日の暦日 = (現地時刻 - cutoff) の日付
  v_bizdate := (v_local - make_interval(mins => v_cut_min))::date;

  biz_dow := (extract(isodow from v_bizdate)::int - 1)::smallint;  -- 0=月..6=日
  biz_min := case when v_clock < v_cut_min then v_clock + 1440 else v_clock end;
  return next;
end $$;

revoke execute on function public.biz_minutes_of(uuid, timestamptz)
  from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5) pricing_resolve（解決・0行=基本料金フォールバックは呼び出し側）
-- ---------------------------------------------------------------------
create or replace function public.pricing_resolve(
  p_store_id  uuid,
  p_at        timestamptz,
  p_fee_kind  text,
  p_seat_kind text default null,
  p_rank_id   uuid default null
)
returns table(amount integer, duration_min smallint, rule_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_dow  smallint;
  v_bm   integer;
  v_cut  integer;
  v_seat text;
  v_settings jsonb;
  v_cutoff   text;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or p_store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;
  if p_fee_kind is null
     or p_fee_kind not in ('set','extension','dohan','hon_shimei','jonai_shimei') then
    raise exception 'bad fee kind';
  end if;

  select b.biz_dow, b.biz_min into v_dow, v_bm
    from public.biz_minutes_of(p_store_id, coalesce(p_at, now())) b;

  -- cutoff 分（帯の営業日拡張に使用・ヘルパーと同じイディオム）
  select s.settings_json into v_settings
    from public.stores s where s.id = p_store_id;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  v_cut := split_part(v_cutoff, ':', 1)::int * 60 + split_part(v_cutoff, ':', 2)::int;

  v_seat := coalesce(p_seat_kind, '卓');

  return query
  select r.amount, r.duration_min, r.id
    from public.pricing_rules r
   where r.store_id = p_store_id
     and r.is_active
     and r.fee_kind = p_fee_kind
     and (r.seat_kind is null or r.seat_kind = v_seat)
     and (r.rank_id  is null or r.rank_id  = p_rank_id)
     and (r.dow_mask is null or ((r.dow_mask >> v_dow) & 1) = 1)
     and (r.time_from_min is null
          or ( (case when r.time_from_min <  v_cut then r.time_from_min + 1440 else r.time_from_min::int end) <= v_bm
           and v_bm < (case when r.time_to_min <= v_cut then r.time_to_min + 1440 else r.time_to_min::int end) ))
   order by r.priority asc, r.created_at asc, r.id asc
   limit 1;
end $$;

revoke execute on function public.pricing_resolve(uuid, timestamptz, text, text, uuid)
  from public, anon;
grant execute on function public.pricing_resolve(uuid, timestamptz, text, text, uuid)
  to authenticated;


-- ---------------------------------------------------------------------
-- 6) set_pricing_rule（upsert・p_id null=新規）returns uuid
-- ---------------------------------------------------------------------
create or replace function public.set_pricing_rule(
  p_id            uuid,
  p_store_id      uuid,
  p_fee_kind      text,
  p_seat_kind     text,
  p_dow_mask      integer,
  p_time_from_min integer,
  p_time_to_min   integer,
  p_rank_id       uuid,
  p_amount        integer,
  p_duration_min  integer,
  p_priority      integer,
  p_is_active     boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_settings jsonb;
  v_cutoff   text;
  v_cut  integer;
  v_ef   integer;
  v_et   integer;
  v_id   uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or p_store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;

  -- 検証（テーブル CHECK と同値＋cutoff 跨ぎ禁止＝RPC 権威）
  if p_fee_kind is null
     or p_fee_kind not in ('set','extension','dohan','hon_shimei','jonai_shimei') then
    raise exception 'bad fee kind';
  end if;
  if p_seat_kind is not null and p_seat_kind not in ('卓','カウンター','VIP') then
    raise exception 'bad seat kind';
  end if;
  if p_dow_mask is not null and (p_dow_mask < 1 or p_dow_mask > 127) then
    raise exception 'bad dow';
  end if;
  if (p_time_from_min is null) <> (p_time_to_min is null) then
    raise exception 'bad time';
  end if;
  if p_time_from_min is not null then
    if p_time_from_min < 0 or p_time_from_min > 1439
       or p_time_to_min < 0 or p_time_to_min > 1439 then
      raise exception 'bad time';
    end if;
    select s.settings_json into v_settings
      from public.stores s where s.id = p_store_id;
    v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
    v_cut := split_part(v_cutoff, ':', 1)::int * 60 + split_part(v_cutoff, ':', 2)::int;
    v_ef := case when p_time_from_min <  v_cut then p_time_from_min + 1440 else p_time_from_min end;
    v_et := case when p_time_to_min   <= v_cut then p_time_to_min   + 1440 else p_time_to_min   end;
    if v_ef >= v_et then raise exception 'bad time'; end if;   -- 空帯・cutoff 跨ぎを一括拒否
  end if;
  if p_rank_id is not null then
    if p_fee_kind not in ('hon_shimei','jonai_shimei') then
      raise exception 'bad rank';
    end if;
    if not exists (select 1 from public.cast_ranks cr
                    where cr.id = p_rank_id and cr.store_id = p_store_id) then
      raise exception 'bad rank';
    end if;
  end if;
  if p_amount is null or p_amount < 0 then raise exception 'bad amount'; end if;
  if p_duration_min is not null then
    if p_fee_kind not in ('set','extension') then raise exception 'bad duration'; end if;
    if p_duration_min < 1 then raise exception 'bad duration'; end if;
  end if;
  if p_priority is null then raise exception 'bad priority'; end if;
  if p_is_active is null then raise exception 'bad active'; end if;

  if p_id is null then
    insert into public.pricing_rules
      (org_id, store_id, fee_kind, seat_kind, dow_mask,
       time_from_min, time_to_min, rank_id, amount, duration_min,
       priority, is_active)
    values
      (v_org, p_store_id, p_fee_kind, p_seat_kind, p_dow_mask,
       p_time_from_min, p_time_to_min, p_rank_id, p_amount, p_duration_min,
       p_priority, p_is_active)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(r) into v_before
      from public.pricing_rules r
     where r.id = p_id and r.org_id = v_org and r.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.pricing_rules
       set fee_kind      = p_fee_kind,
           seat_kind     = p_seat_kind,
           dow_mask      = p_dow_mask,
           time_from_min = p_time_from_min,
           time_to_min   = p_time_to_min,
           rank_id       = p_rank_id,
           amount        = p_amount,
           duration_min  = p_duration_min,
           priority      = p_priority,
           is_active     = p_is_active,
           updated_at    = now()
     where id = p_id;
    v_id := p_id;
  end if;

  select to_jsonb(r) into v_after
    from public.pricing_rules r where r.id = v_id;

  perform public.audit_log_write(
    p_action   => 'set_pricing_rule',
    p_target   => 'pricing_rules:' || v_id::text,
    p_before   => v_before,
    p_after    => v_after,
    p_store_id => p_store_id
  );
  return v_id;
end $$;

revoke execute on function public.set_pricing_rule(uuid, uuid, text, text, integer, integer, integer, uuid, integer, integer, integer, boolean)
  from public, anon;
grant execute on function public.set_pricing_rule(uuid, uuid, text, text, integer, integer, integer, uuid, integer, integer, integer, boolean)
  to authenticated;


-- ---------------------------------------------------------------------
-- 7) delete_pricing_rule（物理削除・伝票は額スナップ済みで履歴責務なし）
-- ---------------------------------------------------------------------
create or replace function public.delete_pricing_rule(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_row  public.pricing_rules%rowtype;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  select * into v_row from public.pricing_rules r
   where r.id = p_id and r.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or v_row.store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;

  delete from public.pricing_rules where id = p_id;

  perform public.audit_log_write(
    p_action   => 'delete_pricing_rule',
    p_target   => 'pricing_rules:' || p_id::text,
    p_before   => to_jsonb(v_row),
    p_after    => null,
    p_store_id => v_row.store_id
  );
end $$;

revoke execute on function public.delete_pricing_rule(uuid) from public, anon;
grant  execute on function public.delete_pricing_rule(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 8) pricing_rule_reorder（(store, fee_kind) スコープ・priority を 1..N）
--    0077/0081 同型（両方向検証・is_active 不問）
-- ---------------------------------------------------------------------
create or replace function public.pricing_rule_reorder(
  p_store_id uuid,
  p_fee_kind text,
  p_ids      uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_n    int;
  v_cnt  int;
  v_before jsonb;
  v_after  jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'bad ids';
  end if;
  v_n := array_length(p_ids, 1);
  if (select count(distinct x) from unnest(p_ids) x) <> v_n then
    raise exception 'duplicate ids';
  end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or p_store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;
  if p_fee_kind is null
     or p_fee_kind not in ('set','extension','dohan','hon_shimei','jonai_shimei') then
    raise exception 'bad fee kind';
  end if;

  select count(*) into v_cnt from public.pricing_rules r
   where r.id = any(p_ids) and r.org_id = v_org
     and r.store_id = p_store_id and r.fee_kind = p_fee_kind;
  if v_cnt <> v_n then raise exception 'forbidden'; end if;

  select count(*) into v_cnt from public.pricing_rules r
   where r.org_id = v_org and r.store_id = p_store_id
     and r.fee_kind = p_fee_kind;
  if v_cnt <> v_n then raise exception 'partial ids'; end if;

  select jsonb_agg(jsonb_build_object('id', r.id, 'priority', r.priority)
                   order by r.priority, r.id)
    into v_before
    from public.pricing_rules r
   where r.org_id = v_org and r.store_id = p_store_id and r.fee_kind = p_fee_kind;

  update public.pricing_rules r
     set priority = u.ord, updated_at = now()
    from unnest(p_ids) with ordinality as u(id, ord)
   where r.id = u.id;

  select jsonb_agg(jsonb_build_object('id', r.id, 'priority', r.priority)
                   order by r.priority, r.id)
    into v_after
    from public.pricing_rules r
   where r.org_id = v_org and r.store_id = p_store_id and r.fee_kind = p_fee_kind;

  perform public.audit_log_write(
    p_action   => 'pricing_rule_reorder',
    p_target   => 'pricing_rules:store:' || p_store_id::text || ':' || p_fee_kind,
    p_before   => v_before,
    p_after    => v_after,
    p_store_id => p_store_id
  );
end $$;

revoke execute on function public.pricing_rule_reorder(uuid, text, uuid[]) from public, anon;
grant  execute on function public.pricing_rule_reorder(uuid, text, uuid[]) to authenticated;


-- ---------------------------------------------------------------------
-- 9) set_cast_rank（upsert・p_id null=新規）returns uuid
-- ---------------------------------------------------------------------
create or replace function public.set_cast_rank(
  p_id        uuid,
  p_store_id  uuid,
  p_name      text,
  p_is_active boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_name text;
  v_id   uuid;
  v_sort int;
  v_before jsonb;
  v_after  jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or p_store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;

  v_name := trim(coalesce(p_name, ''));
  if length(v_name) < 1 or length(v_name) > 40 then
    raise exception 'bad name';
  end if;
  if p_is_active is null then raise exception 'bad active'; end if;

  if exists (select 1 from public.cast_ranks cr
              where cr.store_id = p_store_id
                and lower(cr.name) = lower(v_name)
                and (p_id is null or cr.id <> p_id)) then
    raise exception 'duplicate name';
  end if;

  if p_id is null then
    select coalesce(max(cr.sort_order), 0) + 1 into v_sort
      from public.cast_ranks cr where cr.store_id = p_store_id;
    insert into public.cast_ranks (org_id, store_id, name, sort_order, is_active)
    values (v_org, p_store_id, v_name, v_sort, p_is_active)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(cr) into v_before
      from public.cast_ranks cr
     where cr.id = p_id and cr.org_id = v_org and cr.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.cast_ranks
       set name = v_name, is_active = p_is_active, updated_at = now()
     where id = p_id;
    v_id := p_id;
  end if;

  select to_jsonb(cr) into v_after
    from public.cast_ranks cr where cr.id = v_id;

  perform public.audit_log_write(
    p_action   => 'set_cast_rank',
    p_target   => 'cast_ranks:' || v_id::text,
    p_before   => v_before,
    p_after    => v_after,
    p_store_id => p_store_id
  );
  return v_id;
end $$;

revoke execute on function public.set_cast_rank(uuid, uuid, text, boolean) from public, anon;
grant  execute on function public.set_cast_rank(uuid, uuid, text, boolean) to authenticated;


-- ---------------------------------------------------------------------
-- 10) cast_rank_reorder（store スコープ・0077 同型）
-- ---------------------------------------------------------------------
create or replace function public.cast_rank_reorder(
  p_store_id uuid,
  p_ids      uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_n    int;
  v_cnt  int;
  v_before jsonb;
  v_after  jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'bad ids';
  end if;
  v_n := array_length(p_ids, 1);
  if (select count(distinct x) from unnest(p_ids) x) <> v_n then
    raise exception 'duplicate ids';
  end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or p_store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;

  select count(*) into v_cnt from public.cast_ranks cr
   where cr.id = any(p_ids) and cr.org_id = v_org and cr.store_id = p_store_id;
  if v_cnt <> v_n then raise exception 'forbidden'; end if;

  select count(*) into v_cnt from public.cast_ranks cr
   where cr.org_id = v_org and cr.store_id = p_store_id;
  if v_cnt <> v_n then raise exception 'partial ids'; end if;

  select jsonb_agg(jsonb_build_object('id', cr.id, 'sort_order', cr.sort_order)
                   order by cr.sort_order, cr.id)
    into v_before
    from public.cast_ranks cr
   where cr.org_id = v_org and cr.store_id = p_store_id;

  update public.cast_ranks cr
     set sort_order = u.ord, updated_at = now()
    from unnest(p_ids) with ordinality as u(id, ord)
   where cr.id = u.id;

  select jsonb_agg(jsonb_build_object('id', cr.id, 'sort_order', cr.sort_order)
                   order by cr.sort_order, cr.id)
    into v_after
    from public.cast_ranks cr
   where cr.org_id = v_org and cr.store_id = p_store_id;

  perform public.audit_log_write(
    p_action   => 'cast_rank_reorder',
    p_target   => 'cast_ranks:store:' || p_store_id::text,
    p_before   => v_before,
    p_after    => v_after,
    p_store_id => p_store_id
  );
end $$;

revoke execute on function public.cast_rank_reorder(uuid, uuid[]) from public, anon;
grant  execute on function public.cast_rank_reorder(uuid, uuid[]) to authenticated;


-- ---------------------------------------------------------------------
-- 11) set_cast_rank_of（casts.rank_id 更新・p_rank_id null=解除）
-- ---------------------------------------------------------------------
create or replace function public.set_cast_rank_of(
  p_cast_id uuid,
  p_rank_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_cast_store uuid;
  v_old  uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  select c.store_id, c.rank_id into v_cast_store, v_old
    from public.casts c
   where c.id = p_cast_id and c.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or v_cast_store is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if p_rank_id is not null and not exists (
       select 1 from public.cast_ranks cr
        where cr.id = p_rank_id and cr.store_id = v_cast_store) then
    raise exception 'bad rank';
  end if;

  update public.casts
     set rank_id = p_rank_id
   where id = p_cast_id;

  -- audit は id のみ（源氏名・PII を載せない既存流儀）
  perform public.audit_log_write(
    p_action   => 'set_cast_rank_of',
    p_target   => 'casts:' || p_cast_id::text,
    p_before   => jsonb_build_object('rank_id', v_old),
    p_after    => jsonb_build_object('rank_id', p_rank_id),
    p_store_id => v_cast_store
  );
end $$;

revoke execute on function public.set_cast_rank_of(uuid, uuid) from public, anon;
grant  execute on function public.set_cast_rank_of(uuid, uuid) to authenticated;


notify pgrst, 'reload schema';
