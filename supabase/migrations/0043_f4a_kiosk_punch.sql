-- 0043_f4a_kiosk_punch.sql
-- F4a キオスク打刻: kiosk_devices 方式（membership 非作成＝既存 RLS/RPC 全遮断が構成証明で成立）
-- 裁定: PIN 4桁 bcrypt・5回失敗15分ロック・盲目記録・source='kiosk'
-- 注意: audit_log_write は auth_org_id() null で raise するため kiosk_punch は audit_logs 直接 INSERT
-- 構成: 再適用可（if not exists / or replace / drop if exists→add）だが手貼りは1回

begin;

-- ============================================================
-- 1) punches.source: 'kiosk' 追加（制約実名 punches_source_check 確認済み）
--    ※ loadPunch は source 非参照（cast_id/punched_at/type のみ）＝payroll 経路無影響
-- ============================================================
alter table public.punches drop constraint if exists punches_source_check;
alter table public.punches
  add constraint punches_source_check check (source in ('self','manager','kiosk'));

-- ============================================================
-- 2) kiosk_devices: 端末台帳（users/memberships 非連動・RLS deny-all・RPC 専任）
-- ============================================================
create table if not exists public.kiosk_devices (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id),
  store_id     uuid not null references public.stores(id),
  auth_user_id uuid not null unique,
  label        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists kiosk_devices_one_active_per_store_idx
  on public.kiosk_devices (store_id) where is_active;

alter table public.kiosk_devices enable row level security;
-- ポリシーなし＝deny-all（読み書きとも RPC 専任）
revoke all on public.kiosk_devices from public, anon, authenticated;

-- ============================================================
-- 3) cast_pin: PIN 隔離（bcrypt・SELECT 含め authenticated からも全 revoke）
-- ============================================================
create table if not exists public.cast_pin (
  cast_id      uuid primary key references public.casts(id),
  org_id       uuid not null references public.orgs(id),
  store_id     uuid not null references public.stores(id),
  pin_hash     text not null,
  fail_count   integer not null default 0 check (fail_count >= 0),
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);
alter table public.cast_pin enable row level security;
revoke all on public.cast_pin from public, anon, authenticated;

-- ============================================================
-- 4) kiosk 認可ヘルパー（auth_cast_id 同型・kiosk_devices 起点）
-- ============================================================
create or replace function public.auth_kiosk_store_id()
returns uuid
language sql stable security definer
set search_path to 'public'
as $function$
  select k.store_id from public.kiosk_devices k
  where k.auth_user_id = auth.uid() and k.is_active
$function$;

create or replace function public.auth_kiosk_org_id()
returns uuid
language sql stable security definer
set search_path to 'public'
as $function$
  select k.org_id from public.kiosk_devices k
  where k.auth_user_id = auth.uid() and k.is_active
$function$;

revoke all on function public.auth_kiosk_store_id() from public, anon;
grant execute on function public.auth_kiosk_store_id() to authenticated;
revoke all on function public.auth_kiosk_org_id() from public, anon;
grant execute on function public.auth_kiosk_org_id() to authenticated;

-- ============================================================
-- 5) kiosk_provision / kiosk_deactivate（owner 限定）
-- ============================================================
create or replace function public.kiosk_provision(
  p_auth_user_id uuid, p_store_id uuid, p_label text
) returns uuid
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_org       uuid := public.auth_org_id();
  v_store_org uuid;
  v_id        uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if p_auth_user_id is null then raise exception 'bad auth user'; end if;
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;
  -- 実在人物の auth uid の kiosk 化を封じる（役職二重化封じの鏡像）
  if exists (select 1 from public.users u where u.auth_user_id = p_auth_user_id) then
    raise exception 'bad target';
  end if;
  -- 1店1kiosk（部分ユニークが物理 backstop）
  if exists (select 1 from public.kiosk_devices k where k.store_id = p_store_id and k.is_active) then
    raise exception 'already provisioned';
  end if;

  insert into public.kiosk_devices (org_id, store_id, auth_user_id, label)
  values (v_org, p_store_id, p_auth_user_id, nullif(trim(coalesce(p_label,'')), ''))
  returning id into v_id;

  perform public.audit_log_write('kiosk_provision', 'kiosk_devices:' || v_id::text,
    null, (select to_jsonb(k) from public.kiosk_devices k where k.id = v_id), p_store_id);
  return v_id;
end $function$;

create or replace function public.kiosk_deactivate(p_device_id uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_org    uuid := public.auth_org_id();
  v_device public.kiosk_devices;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  select k.* into v_device from public.kiosk_devices k
    where k.id = p_device_id and k.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  update public.kiosk_devices
     set is_active = false, updated_at = now()
   where id = p_device_id;

  perform public.audit_log_write('kiosk_deactivate', 'kiosk_devices:' || p_device_id::text,
    to_jsonb(v_device),
    (select to_jsonb(k) from public.kiosk_devices k where k.id = p_device_id),
    v_device.store_id);
end $function$;

revoke all on function public.kiosk_provision(uuid, uuid, text) from public, anon;
grant execute on function public.kiosk_provision(uuid, uuid, text) to authenticated;
revoke all on function public.kiosk_deactivate(uuid) from public, anon;
grant execute on function public.kiosk_deactivate(uuid) to authenticated;

-- ============================================================
-- 6) set_cast_pin（owner / manager 自店・4桁・bcrypt）
--    pgcrypto は extensions スキーマ（確認済み）→ search_path に extensions 必須
--    audit に PIN/ハッシュは載せない
-- ============================================================
create or replace function public.set_cast_pin(p_cast_id uuid, p_pin text)
returns void
language plpgsql security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_org  uuid := public.auth_org_id();
  v_cast public.casts;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'bad pin'; end if;
  select c.* into v_cast from public.casts c
    where c.id = p_cast_id and c.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  insert into public.cast_pin (cast_id, org_id, store_id, pin_hash)
  values (p_cast_id, v_cast.org_id, v_cast.store_id, crypt(p_pin, gen_salt('bf')))
  on conflict (cast_id) do update
    set pin_hash = excluded.pin_hash,
        store_id = excluded.store_id,
        fail_count = 0,
        locked_until = null,
        updated_at = now();

  perform public.audit_log_write('set_cast_pin', 'cast_pin:' || p_cast_id::text,
    null, jsonb_build_object('cast_id', p_cast_id, 'reset', true), v_cast.store_id);
end $function$;

revoke all on function public.set_cast_pin(uuid, text) from public, anon;
grant execute on function public.set_cast_pin(uuid, text) to authenticated;

-- ============================================================
-- 7) kiosk_punch（kiosk 限定・PIN 失敗は raise せず jsonb return＝
--    fail_count/audit をコミットしロックアウトを機能させる）
-- ============================================================
create or replace function public.kiosk_punch(p_cast_id uuid, p_pin text, p_type text)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_device   public.kiosk_devices;
  v_cast     public.casts;
  v_pin      public.cast_pin;
  v_ip       text;
  v_punch_id uuid;
  v_newfail  integer;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active;
  if not found then raise exception 'forbidden'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  -- 形式不正 PIN は失敗カウント外（UI は4桁パッド前提・総当たりは4桁一致のみ計上）
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;

  -- 対象 cast は自店 active のみ（他店/他 org は not_found＝存在オラクル封じ）
  select c.* into v_cast from public.casts c
    where c.id = p_cast_id and c.store_id = v_device.store_id and c.is_active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select p.* into v_pin from public.cast_pin p
    where p.cast_id = p_cast_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;

  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked',
                              'locked_until', v_pin.locked_until);
  end if;

  if v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then
    v_newfail := v_pin.fail_count + 1;
    if v_newfail >= 5 then
      update public.cast_pin
         set fail_count = 0, locked_until = now() + interval '15 minutes', updated_at = now()
       where cast_id = p_cast_id;
    else
      update public.cast_pin
         set fail_count = v_newfail, updated_at = now()
       where cast_id = p_cast_id;
    end if;
    insert into public.audit_logs
      (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values
      (v_device.org_id, v_device.store_id, null, 'kiosk_punch',
       'cast_pin:' || p_cast_id::text, null,
       jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', p_cast_id,
                          'result', 'wrong_pin', 'fail_count', v_newfail,
                          'locked', v_newfail >= 5),
       v_ip);
    if v_newfail >= 5 then
      return jsonb_build_object('ok', false, 'reason', 'locked',
                                'locked_until', now() + interval '15 minutes');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  -- PIN 一致: カウンタ復元 → 盲目記録 INSERT（punch_self 逐語型・source='kiosk'）
  update public.cast_pin
     set fail_count = 0, locked_until = null, updated_at = now()
   where cast_id = p_cast_id;

  insert into public.punches (org_id, store_id, cast_id, type, lat, lng, ip, source)
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_type, null, null, v_ip, 'kiosk')
  returning id into v_punch_id;

  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, null, 'kiosk_punch',
     'punches:' || v_punch_id::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', p_cast_id,
                        'type', p_type, 'result', 'ok'),
     v_ip);

  return jsonb_build_object('ok', true, 'punch_id', v_punch_id, 'punched_at', now());
end $function$;

revoke all on function public.kiosk_punch(uuid, text, text) from public, anon;
grant execute on function public.kiosk_punch(uuid, text, text) to authenticated;

-- ============================================================
-- 8) kiosk_cast_list（kiosk 限定・RLS 全遮断の唯一の読み口＝
--    自店 active cast の id+源氏名+PIN 有無のみ。非 kiosk は0行＝fail-closed）
-- ============================================================
create or replace function public.kiosk_cast_list()
returns table (cast_id uuid, cast_name text, has_pin boolean)
language sql stable security definer
set search_path to 'public'
as $function$
  select c.id, c.name,
         exists (select 1 from public.cast_pin p where p.cast_id = c.id)
  from public.casts c
  where c.store_id = public.auth_kiosk_store_id()
    and c.is_active
  order by c.name
$function$;

revoke all on function public.kiosk_cast_list() from public, anon;
grant execute on function public.kiosk_cast_list() to authenticated;

commit;
