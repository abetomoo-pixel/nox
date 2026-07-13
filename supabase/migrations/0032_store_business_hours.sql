-- 0032_store_business_hours: B-5 スライスA — 営業時間マスタ（④）＋予約バリデーション（①）
-- store_business_hours: 店×曜日(dow 0-6)の営業時間＋定休日。staffing_needs 型踏襲。
-- 時刻は HH:MM text・close は24h超表記(00:00-47:59・shifts.end_hm と同)＝②シフト突合が lib 再利用で成立。
-- ①: reservation_create/update に「定休日ハード拒否」を挿入。営業時間外は拒否せず UI 警告（RPC は通す）。
--    営業時間未設定の店は縛らない（行なし=通す・後方互換）。営業日 dow は cutoff 変換で解決（深夜帯=前営業日）。
-- cast 0行（staffing_needs 型 RLS パターン2）。cutoff 非改変（別物・集計は現行どおり）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・先頭に貼り先証明）:
--   0) select 'nox-project-proof', count(*) from public.orgs;
--   1) テーブル存在＋制約＋RLS＋grant を1結果セットで:
--      select
--        (select string_agg(conname, ' | ' order by conname) from pg_constraint
--           where conrelid='public.store_business_hours'::regclass) as constraints,
--        (select string_agg(polname||':'||polcmd, ' | ') from pg_policy
--           where polrelid='public.store_business_hours'::regclass) as policies,
--        (select string_agg(grantee||'='||privilege_type, ', ') from information_schema.role_table_grants
--           where table_name='store_business_hours') as tbl_grants;
--   2) RPC の prosrc＋ACL を1結果セットで:
--      select
--        (select pg_get_functiondef('set_store_business_hours(uuid, integer, boolean, text, text)'::regprocedure)) as set_def,
--        (select pg_get_functiondef('reservation_is_closed_day(uuid, timestamptz)'::regprocedure)) as helper_def,
--        (select string_agg(p.proname||'='||coalesce(array_to_string(p.proacl,','),'default'), ' || ')
--           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--           where n.nspname='public'
--             and p.proname in ('set_store_business_hours','reservation_is_closed_day','reservation_create','reservation_update')) as fn_acls;
--   3) reservation_create に closed day チェックが入ったか:
--      select pg_get_functiondef('reservation_create(uuid, timestamptz, uuid, uuid, text, integer, text, text, uuid, integer)'::regprocedure);
--      （'closed day' と reservation_is_closed_day 呼び出しを目視）
--   4) notify pgrst, 'reload schema';
--   5) 動作アンカー（定休日拒否・未設定通過・時間外通過・upsert・cast 0行・dow 解決）は verify 段で実測。

begin;

-- ── ④ テーブル: store_business_hours（staffing_needs 型踏襲）──
create table public.store_business_hours (
  id         uuid        not null default gen_random_uuid(),
  org_id     uuid        not null references public.orgs(id),
  store_id   uuid        not null references public.stores(id),
  dow        smallint    not null,
  is_closed  boolean     not null default false,
  open_hm    text,
  close_hm   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_business_hours_pkey primary key (id),
  constraint store_business_hours_store_dow_key unique (store_id, dow),
  constraint store_business_hours_dow_check check (dow >= 0 and dow <= 6),
  constraint store_business_hours_closed_check check (
    (is_closed and open_hm is null and close_hm is null)
    or (not is_closed and open_hm is not null and close_hm is not null)
  ),
  constraint store_business_hours_open_fmt_check check (
    open_hm is null or open_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  constraint store_business_hours_close_fmt_check check (
    close_hm is null or close_hm ~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$'
  )
);

create index store_business_hours_org_idx on public.store_business_hours (org_id);

create trigger store_business_hours_touch_updated_at
  before update on public.store_business_hours
  for each row execute function public.touch_updated_at();

alter table public.store_business_hours enable row level security;

create policy store_business_hours_select on public.store_business_hours
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and public.auth_role() <> 'cast'
  );

revoke all on table public.store_business_hours from public, anon;
grant select on table public.store_business_hours to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.store_business_hours from authenticated;

-- ── ヘルパー: 営業日 dow 解決＋定休日判定 ──
-- 戻り: true=定休日（拒否対象）／false=営業日または未設定（通す）。時間外は判定しない（UI 警告の責務）。
create or replace function public.reservation_is_closed_day(
  p_store_id uuid,
  p_reserved_at timestamptz
)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_settings jsonb;
  v_cutoff   text;
  v_dow      int;
  v_closed   boolean;
begin
  select s.settings_json into v_settings from public.stores s where s.id = p_store_id;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then v_cutoff := '06:00'; end if;
  v_dow := extract(dow from (timezone('Asia/Tokyo', p_reserved_at) - (v_cutoff || ':00')::interval)::date)::int;
  select bh.is_closed into v_closed
  from public.store_business_hours bh
  where bh.store_id = p_store_id and bh.dow = v_dow;
  return coalesce(v_closed, false);
end $function$;

revoke all on function public.reservation_is_closed_day(uuid, timestamptz) from public, anon;
grant execute on function public.reservation_is_closed_day(uuid, timestamptz) to authenticated;

-- ── RPC: set_store_business_hours（set_staffing_need 写し・owner/manager 自店）──
create or replace function public.set_store_business_hours(
  p_store_id uuid,
  p_dow integer,
  p_is_closed boolean,
  p_open_hm text default null,
  p_close_hm text default null
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_before jsonb;
  v_id uuid;
  v_open_min int;
  v_close_min int;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_dow is null or p_dow < 0 or p_dow > 6 then raise exception 'bad dow'; end if;
  if p_is_closed is null then raise exception 'bad closed'; end if;

  if p_is_closed then
    if p_open_hm is not null or p_close_hm is not null then raise exception 'bad hours'; end if;
  else
    if p_open_hm is null or p_close_hm is null then raise exception 'bad hours'; end if;
    if p_open_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad hours'; end if;
    if p_close_hm !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad hours'; end if;
    v_open_min  := split_part(p_open_hm, ':', 1)::int * 60 + split_part(p_open_hm, ':', 2)::int;
    v_close_min := split_part(p_close_hm, ':', 1)::int * 60 + split_part(p_close_hm, ':', 2)::int;
    if v_close_min <= v_open_min then raise exception 'bad hours'; end if;
  end if;

  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  select to_jsonb(bh) into v_before from public.store_business_hours bh
    where bh.store_id = p_store_id and bh.dow = p_dow;

  insert into public.store_business_hours (org_id, store_id, dow, is_closed, open_hm, close_hm)
  values (public.auth_org_id(), p_store_id, p_dow, p_is_closed, p_open_hm, p_close_hm)
  on conflict (store_id, dow) do update
    set is_closed = excluded.is_closed,
        open_hm   = excluded.open_hm,
        close_hm  = excluded.close_hm
  returning id into v_id;

  perform public.audit_log_write('set_store_business_hours', 'store_business_hours:' || v_id::text,
    v_before, (select to_jsonb(bh) from public.store_business_hours bh where bh.id = v_id), p_store_id);
  return v_id;
end $function$;

revoke all on function public.set_store_business_hours(uuid, integer, boolean, text, text) from public, anon;
grant execute on function public.set_store_business_hours(uuid, integer, boolean, text, text) to authenticated;

-- ── ① reservation_create 書き直し（store org 照合直後に closed day チェック1ブロック挿入）──
create or replace function public.reservation_create(p_store_id uuid, p_reserved_at timestamp with time zone, p_customer_id uuid default null::uuid, p_cast_id uuid default null::uuid, p_guest_name text default null::text, p_party_size integer default null::integer, p_nom_type text default null::text, p_memo text default null::text, p_seat_id uuid default null::uuid, p_stay_minutes integer default null::integer)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org         uuid := public.auth_org_id();
  v_role        text := public.auth_role();
  v_store_org   uuid;
  v_guest       text;
  v_actor       uuid;
  v_id          uuid;
  v_seat_store  uuid;
  v_seat_active boolean;
  v_stay        tstzrange;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  if p_reserved_at is null then raise exception 'bad reserved_at'; end if;
  if p_party_size is not null and p_party_size <= 0 then raise exception 'bad people'; end if;
  if p_nom_type is not null and p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  if p_guest_name is not null and length(p_guest_name) > 80 then raise exception 'bad name'; end if;
  v_guest := nullif(trim(coalesce(p_guest_name, '')), '');

  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'invalid store'; end if;

  -- ★B-5①: 定休日ハード拒否（時間外は拒否しない=UI 警告・未設定は通す）
  if public.reservation_is_closed_day(p_store_id, p_reserved_at) then
    raise exception 'closed day';
  end if;

  if not (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())
          or (v_role = 'staff' and p_store_id = public.auth_store_id()
              and public.auth_staff_can_crm())) then
    raise exception 'forbidden';
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers cu
    where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = p_store_id
  ) then
    raise exception 'invalid customer';
  end if;

  if p_cast_id is not null and not exists (
    select 1 from public.casts c
    where c.id = p_cast_id and c.org_id = v_org and c.store_id = p_store_id and c.is_active
  ) then
    raise exception 'bad cast';
  end if;

  if (p_seat_id is null) <> (p_stay_minutes is null) then raise exception 'bad stay'; end if;
  if p_seat_id is not null then
    if p_stay_minutes not in (60, 90, 120, 180) then raise exception 'bad stay'; end if;
    select s.store_id, s.is_active into v_seat_store, v_seat_active
    from public.seats s where s.id = p_seat_id and s.org_id = v_org;
    if v_seat_store is null or v_seat_store <> p_store_id then raise exception 'invalid store'; end if;
    if not v_seat_active then raise exception 'bad seat'; end if;
    v_stay := tstzrange(p_reserved_at, p_reserved_at + make_interval(mins => p_stay_minutes), '[)');
    if exists (
      select 1 from public.reservations r
      where r.org_id = v_org and r.seat_id = p_seat_id and r.status = 'booked'
        and r.stay && v_stay
    ) then
      raise exception 'seat time conflict';
    end if;
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  insert into public.reservations
    (org_id, store_id, customer_id, cast_id, guest_name, reserved_at, party_size, nom_type,
     status, memo, created_by, seat_id, stay)
  values
    (v_org, p_store_id, p_customer_id, p_cast_id, v_guest, p_reserved_at, p_party_size, p_nom_type,
     'booked', p_memo, v_actor, p_seat_id, v_stay)
  returning id into v_id;

  perform public.audit_log_write('reservation_create', 'reservations:' || v_id::text,
    null, (select to_jsonb(r) from public.reservations r where r.id = v_id), p_store_id);
  return v_id;
end $function$;

-- ── ① reservation_update 書き直し（not editable 判定直後に closed day チェック1ブロック挿入・店は既存行）──
create or replace function public.reservation_update(p_reservation_id uuid, p_reserved_at timestamp with time zone, p_customer_id uuid, p_cast_id uuid, p_guest_name text, p_party_size integer, p_nom_type text, p_memo text, p_seat_id uuid default null::uuid, p_stay_minutes integer default null::integer)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org         uuid := public.auth_org_id();
  v_role        text := public.auth_role();
  v_res         public.reservations;
  v_guest       text;
  v_before      jsonb;
  v_seat_store  uuid;
  v_seat_active boolean;
  v_stay        tstzrange;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  if p_reserved_at is null then raise exception 'bad reserved_at'; end if;
  if p_party_size is not null and p_party_size <= 0 then raise exception 'bad people'; end if;
  if p_nom_type is not null and p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  if p_guest_name is not null and length(p_guest_name) > 80 then raise exception 'bad name'; end if;
  v_guest := nullif(trim(coalesce(p_guest_name, '')), '');

  select * into v_res from public.reservations
  where id = p_reservation_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  if not (v_role = 'owner'
          or (v_role = 'manager' and v_res.store_id = public.auth_store_id())
          or (v_role = 'staff' and v_res.store_id = public.auth_store_id()
              and public.auth_staff_can_crm())) then
    raise exception 'forbidden';
  end if;

  if v_res.status <> 'booked' then raise exception 'not editable'; end if;

  -- ★B-5①: 定休日ハード拒否（店は既存行の store_id・時間外は UI 警告・未設定は通す）
  if public.reservation_is_closed_day(v_res.store_id, p_reserved_at) then
    raise exception 'closed day';
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers cu
    where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = v_res.store_id
  ) then
    raise exception 'invalid customer';
  end if;
  if p_cast_id is not null and not exists (
    select 1 from public.casts c
    where c.id = p_cast_id and c.org_id = v_org and c.store_id = v_res.store_id and c.is_active
  ) then
    raise exception 'bad cast';
  end if;

  if (p_seat_id is null) <> (p_stay_minutes is null) then raise exception 'bad stay'; end if;
  if p_seat_id is not null then
    if p_stay_minutes not in (60, 90, 120, 180) then raise exception 'bad stay'; end if;
    select s.store_id, s.is_active into v_seat_store, v_seat_active
    from public.seats s where s.id = p_seat_id and s.org_id = v_org;
    if v_seat_store is null or v_seat_store <> v_res.store_id then raise exception 'invalid store'; end if;
    if not v_seat_active then raise exception 'bad seat'; end if;
    v_stay := tstzrange(p_reserved_at, p_reserved_at + make_interval(mins => p_stay_minutes), '[)');
    if exists (
      select 1 from public.reservations r
      where r.org_id = v_org and r.seat_id = p_seat_id and r.status = 'booked'
        and r.id <> p_reservation_id
        and r.stay && v_stay
    ) then
      raise exception 'seat time conflict';
    end if;
  end if;

  v_before := to_jsonb(v_res);
  update public.reservations
     set reserved_at = p_reserved_at,
         customer_id = p_customer_id,
         cast_id     = p_cast_id,
         guest_name  = v_guest,
         party_size  = p_party_size,
         nom_type    = p_nom_type,
         memo        = p_memo,
         seat_id     = p_seat_id,
         stay        = v_stay,
         updated_at  = now()
   where id = p_reservation_id;

  perform public.audit_log_write('reservation_update', 'reservations:' || p_reservation_id::text,
    v_before, (select to_jsonb(r) from public.reservations r where r.id = p_reservation_id),
    v_res.store_id);
end $function$;

commit;
