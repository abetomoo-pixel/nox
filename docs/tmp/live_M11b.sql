-- live_M11b.sql — mig0109 材料（打刻端末 /kiosk の PIN 経路 RPC 全文・untracked scratch）
-- 経路実測: app/kiosk/page.tsx は kiosk_cast_list と kiosk_punch の2本のみを呼ぶ。
-- PIN 書込は set_cast_pin（casts 管理側）。認可は auth_kiosk_store_id / auth_kiosk_org_id。

-- ===== kiosk_punch(uuid,text,text) =====
CREATE OR REPLACE FUNCTION public.kiosk_punch(p_cast_id uuid, p_pin text, p_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_device   public.kiosk_devices;
  v_cast     public.casts;
  v_pin      public.cast_pin;
  v_ip       text;
  v_punch_id uuid;
  v_newfail  integer;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'punch';
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
end $function$


-- ===== kiosk_cast_list() =====
CREATE OR REPLACE FUNCTION public.kiosk_cast_list()
 RETURNS TABLE(cast_id uuid, cast_name text, has_pin boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.id, c.name,
         exists (select 1 from public.cast_pin p where p.cast_id = c.id)
  from public.casts c
  where c.store_id = public.auth_kiosk_store_id()
    and c.is_active
  order by c.name
$function$


-- ===== set_cast_pin(uuid,text) =====
CREATE OR REPLACE FUNCTION public.set_cast_pin(p_cast_id uuid, p_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_cast public.casts;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
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
end $function$


-- ===== auth_kiosk_store_id() =====
CREATE OR REPLACE FUNCTION public.auth_kiosk_store_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select k.store_id from public.kiosk_devices k
  where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'punch'
$function$


-- ===== auth_kiosk_org_id() =====
CREATE OR REPLACE FUNCTION public.auth_kiosk_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select k.org_id from public.kiosk_devices k
  where k.auth_user_id = auth.uid() and k.is_active
$function$

