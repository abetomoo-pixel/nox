-- live_M11.sql — M-11b 材料（/master/system 4タブの RPC 全文＋RLS・untracked scratch）

-- ===== kiosk_provision(uuid,uuid,text,text) =====
CREATE OR REPLACE FUNCTION public.kiosk_provision(p_auth_user_id uuid, p_store_id uuid, p_label text, p_purpose text DEFAULT 'punch'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid := public.auth_org_id();
  v_store_org uuid;
  v_id        uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if p_auth_user_id is null then raise exception 'bad auth user'; end if;
  if p_purpose is null or p_purpose not in ('punch','register') then raise exception 'bad purpose'; end if;
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;
  -- 実在人物の auth uid の kiosk 化を封じる（役職二重化封じの鏡像）
  if exists (select 1 from public.users u where u.auth_user_id = p_auth_user_id) then
    raise exception 'bad target';
  end if;
  -- 1店1kiosk×purpose（部分ユニークが物理 backstop）
  if exists (select 1 from public.kiosk_devices k
             where k.store_id = p_store_id and k.purpose = p_purpose and k.is_active) then
    raise exception 'already provisioned';
  end if;

  insert into public.kiosk_devices (org_id, store_id, auth_user_id, label, purpose)
  values (v_org, p_store_id, p_auth_user_id, nullif(trim(coalesce(p_label,'')), ''), p_purpose)
  returning id into v_id;

  perform public.audit_log_write('kiosk_provision', 'kiosk_devices:' || v_id::text,
    null, (select to_jsonb(k) from public.kiosk_devices k where k.id = v_id), p_store_id);
  return v_id;
end $function$


-- ===== kiosk_deactivate(uuid) =====
CREATE OR REPLACE FUNCTION public.kiosk_deactivate(p_device_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$


-- ===== kiosk_login(uuid,text) =====
CREATE OR REPLACE FUNCTION public.kiosk_login(p_membership_id uuid, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_device  public.kiosk_devices;
  v_mem     record;
  v_pin     public.staff_pin;
  v_ip      text;
  v_sid     uuid;
  v_newfail integer;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'register';
  if not found then raise exception 'forbidden'; end if;
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  -- 形式不正 PIN は失敗カウント外（kiosk_punch 逐語・PIN 桁数＝cast_pin 現行4桁に揃える＝確定＋）
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;

  -- 操作担当候補＝自店 active membership・owner/manager/staff(can_register)（cast は kiosk 不使用・
  -- 他店/他 org は not_found＝存在オラクル封じ）
  select m.id, m.user_id, m.role, u.name as user_name into v_mem
    from public.memberships m join public.users u on u.id = m.user_id
   where m.id = p_membership_id and m.store_id = v_device.store_id and m.is_active
     and u.is_active
     and (m.role in ('owner','manager') or (m.role = 'staff' and m.can_register));
  if v_mem.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select p.* into v_pin from public.staff_pin p
    where p.membership_id = p_membership_id
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
      update public.staff_pin
         set fail_count = 0, locked_until = now() + interval '15 minutes', updated_at = now()
       where membership_id = p_membership_id;
    else
      update public.staff_pin
         set fail_count = v_newfail, updated_at = now()
       where membership_id = p_membership_id;
    end if;
    insert into public.audit_logs
      (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values
      (v_device.org_id, v_device.store_id, null, 'kiosk_login',
       'staff_pin:' || p_membership_id::text, null,
       jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', p_membership_id,
                          'result', 'wrong_pin', 'fail_count', v_newfail,
                          'locked', v_newfail >= 5),
       v_ip);
    if v_newfail >= 5 then
      return jsonb_build_object('ok', false, 'reason', 'locked',
                                'locked_until', now() + interval '15 minutes');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  -- PIN 一致: カウンタ復元 → 既存セッションを閉じて差し替え → 新セッション発行
  update public.staff_pin
     set fail_count = 0, locked_until = null, updated_at = now()
   where membership_id = p_membership_id;

  update public.kiosk_sessions set ended_at = now()
   where device_id = v_device.id and ended_at is null;

  insert into public.kiosk_sessions (org_id, store_id, device_id, membership_id, operator_user_id)
  values (v_device.org_id, v_device.store_id, v_device.id, p_membership_id, v_mem.user_id)
  returning id into v_sid;

  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, v_mem.user_id, 'kiosk_login',
     'kiosk_sessions:' || v_sid::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', p_membership_id,
                        'operator_user_id', v_mem.user_id, 'result', 'ok'),
     v_ip);

  return jsonb_build_object('ok', true, 'session_id', v_sid,
                            'operator_name', v_mem.user_name, 'role', v_mem.role,
                            'idle_minutes', 15);
end $function$


-- ===== kiosk_logout() =====
CREATE OR REPLACE FUNCTION public.kiosk_logout()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_device public.kiosk_devices;
  v_sid    uuid;
  v_op     uuid;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'register';
  if not found then raise exception 'forbidden'; end if;

  update public.kiosk_sessions set ended_at = now()
   where device_id = v_device.id and ended_at is null
  returning id, operator_user_id into v_sid, v_op;

  if v_sid is not null then
    insert into public.audit_logs
      (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values
      (v_device.org_id, v_device.store_id, v_op, 'kiosk_logout',
       'kiosk_sessions:' || v_sid::text, null,
       jsonb_build_object('kiosk_device_id', v_device.id), null);
  end if;
end $function$


-- ===== set_staff_pin(uuid,text) =====
CREATE OR REPLACE FUNCTION public.set_staff_pin(p_membership_id uuid, p_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_org uuid := public.auth_org_id();
  v_mem record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'bad pin'; end if;
  -- memberships は org 列を持たない＝store 経由で org 照合（他 org は not found＝存在オラクル封じ）
  select m.id, m.store_id, m.role, m.is_active, m.can_register into v_mem
    from public.memberships m join public.stores s on s.id = m.store_id
   where m.id = p_membership_id and s.org_id = v_org;
  if v_mem.id is null then raise exception 'not found'; end if;
  if not v_mem.is_active then raise exception 'inactive membership'; end if;
  if not (v_mem.role in ('owner','manager') or (v_mem.role = 'staff' and v_mem.can_register)) then
    raise exception 'bad target';
  end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_mem.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  insert into public.staff_pin (membership_id, org_id, store_id, pin_hash)
  values (p_membership_id, v_org, v_mem.store_id, crypt(p_pin, gen_salt('bf')))
  on conflict (membership_id) do update
    set pin_hash = excluded.pin_hash,
        store_id = excluded.store_id,
        fail_count = 0,
        locked_until = null,
        updated_at = now();

  perform public.audit_log_write('set_staff_pin', 'staff_pin:' || p_membership_id::text,
    null, jsonb_build_object('membership_id', p_membership_id, 'reset', true), v_mem.store_id);
end $function$


-- ===== set_printer_config(uuid,boolean,text) =====
CREATE OR REPLACE FUNCTION public.set_printer_config(p_store_id uuid, p_enabled boolean, p_serial text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid := public.auth_org_id();
  v_store_org uuid;
  v_before    jsonb;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if p_enabled is null then raise exception 'bad enabled'; end if;
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  select jsonb_build_object('printer_enabled', c.printer_enabled, 'printer_serial', c.printer_serial)
    into v_before from public.printer_config c where c.store_id = p_store_id;

  insert into public.printer_config (store_id, org_id, printer_enabled, printer_serial)
  values (p_store_id, v_store_org, p_enabled, nullif(trim(coalesce(p_serial,'')), ''))
  on conflict (store_id) do update
    set printer_enabled = excluded.printer_enabled,
        printer_serial  = excluded.printer_serial,
        updated_at      = now();

  perform public.audit_log_write('set_printer_config', 'printer_config:' || p_store_id::text,
    v_before,
    jsonb_build_object('printer_enabled', p_enabled,
                       'printer_serial', nullif(trim(coalesce(p_serial,'')), '')),
    p_store_id);
end $function$


-- ===== rotate_store_token(uuid) =====
CREATE OR REPLACE FUNCTION public.rotate_store_token(p_store_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_org       uuid := public.auth_org_id();
  v_store_org uuid;
  v_token     text;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  v_token := encode(gen_random_bytes(12), 'hex');  -- 24hex

  insert into public.printer_config (store_id, org_id, store_token)
  values (p_store_id, v_store_org, v_token)
  on conflict (store_id) do update
    set store_token = excluded.store_token,
        updated_at  = now();

  perform public.audit_log_write('rotate_store_token', 'printer_config:' || p_store_id::text,
    null, jsonb_build_object('rotated', true), p_store_id);
  return v_token;
end $function$


-- ===== get_printer_config(uuid) =====
CREATE OR REPLACE FUNCTION public.get_printer_config(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid := public.auth_org_id();
  v_store_org uuid;
  v_cfg       public.printer_config;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  select c.* into v_cfg from public.printer_config c where c.store_id = p_store_id;
  if not found then
    return jsonb_build_object('printer_enabled', false, 'printer_serial', null,
                              'has_token', false, 'updated_at', null);
  end if;
  return jsonb_build_object('printer_enabled', v_cfg.printer_enabled,
                            'printer_serial',  v_cfg.printer_serial,
                            'has_token',       v_cfg.store_token is not null,
                            'updated_at',      v_cfg.updated_at);
end $function$


-- ===== set_store_receipt_profile(uuid,text,text,text,text) =====
CREATE OR REPLACE FUNCTION public.set_store_receipt_profile(p_store_id uuid, p_address text, p_tel text, p_reg_no text, p_footer text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid := public.auth_org_id();
  v_store   record;
  v_addr    text := trim(coalesce(p_address, ''));
  v_tel     text := trim(coalesce(p_tel, ''));
  v_reg     text := trim(coalesce(p_reg_no, ''));
  v_footer  text := trim(coalesce(p_footer, ''));
  v_before  jsonb;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if length(v_addr) > 200 then raise exception 'bad address'; end if;
  if length(v_tel) > 50 then raise exception 'bad tel'; end if;
  if length(v_footer) > 200 then raise exception 'bad footer'; end if;
  if v_reg <> '' and v_reg !~ '^T[0-9]{13}$' then raise exception 'bad reg_no'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> v_org then raise exception 'forbidden'; end if;

  v_before := jsonb_build_object(
    'receipt_address', coalesce(v_store.settings_json->>'receipt_address', ''),
    'receipt_tel',     coalesce(v_store.settings_json->>'receipt_tel', ''),
    'invoice_reg_no',  coalesce(v_store.settings_json->>'invoice_reg_no', ''),
    'receipt_footer',  coalesce(v_store.settings_json->>'receipt_footer', '')
  );
  update public.stores
     set settings_json =
       jsonb_set(
         jsonb_set(
           jsonb_set(
             jsonb_set(coalesce(settings_json, '{}'::jsonb),
               '{receipt_address}', to_jsonb(v_addr), true),
             '{receipt_tel}',     to_jsonb(v_tel),    true),
           '{invoice_reg_no}',  to_jsonb(v_reg),    true),
         '{receipt_footer}',  to_jsonb(v_footer), true)
   where id = p_store_id;
  perform public.audit_log_write('set_store_receipt_profile', 'stores:' || p_store_id::text,
    v_before,
    jsonb_build_object('receipt_address', v_addr, 'receipt_tel', v_tel,
                       'invoice_reg_no', v_reg, 'receipt_footer', v_footer),
    p_store_id);
end $function$


-- ===== get_cast_sensitive(uuid) =====
CREATE OR REPLACE FUNCTION public.get_cast_sensitive(p_cast_id uuid)
 RETURNS TABLE(cast_id uuid, real_name text, birthday date, mynumber_set boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast_org   uuid;
  v_cast_store uuid;
  v_role       text;
  v_self       uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  v_role := public.auth_role();
  if v_role = 'owner' then
    null;
  elsif v_role = 'cast' then
    v_self := public.auth_cast_id();
    if v_self is null then raise exception 'forbidden'; end if;
    if v_self <> p_cast_id then raise exception 'forbidden'; end if;
  else
    raise exception 'forbidden';
  end if;

  perform public.audit_log_write('read_cast_sensitive', 'cast_sensitive:' || p_cast_id::text,
    null, null, v_cast_store);

  return query
    select cs.cast_id, cs.real_name, cs.birthday, (cs.mynumber_enc is not null) as mynumber_set
    from public.cast_sensitive cs
    where cs.cast_id = p_cast_id;
end $function$


-- ===== get_cast_mynumber(uuid,uuid,uuid) =====
CREATE OR REPLACE FUNCTION public.get_cast_mynumber(p_org_id uuid, p_actor uuid, p_cast_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_cast_org uuid; v_cast_store uuid; v_key text; v_enc bytea; v_plain text;
begin
  select c.org_id, c.store_id, cs.mynumber_enc into v_cast_org, v_cast_store, v_enc
    from public.casts c left join public.cast_sensitive cs on cs.cast_id = c.id
    where c.id = p_cast_id;
  if v_cast_org is null then raise exception 'not found'; end if;
  if p_org_id is null or v_cast_org <> p_org_id then raise exception 'forbidden'; end if;

  perform public.audit_log_write_service(p_org_id, p_actor, 'read_cast_mynumber',
    'cast_sensitive:' || p_cast_id::text, null, null, v_cast_store);

  if v_enc is null then return null; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'nox_mynumber_key';
  if v_key is null then raise exception 'mynumber key missing'; end if;
  return extensions.pgp_sym_decrypt(v_enc, v_key);
end $function$


-- ===== get_cast_mynumber_masked(uuid) =====
CREATE OR REPLACE FUNCTION public.get_cast_mynumber_masked(p_cast_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_cast_org uuid; v_cast_store uuid; v_self uuid; v_key text; v_enc bytea; v_plain text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'cast' then raise exception 'forbidden'; end if;
  v_self := public.auth_cast_id();
  if v_self is null or v_self <> p_cast_id then raise exception 'forbidden'; end if;
  select c.org_id, c.store_id, cs.mynumber_enc into v_cast_org, v_cast_store, v_enc
    from public.casts c left join public.cast_sensitive cs on cs.cast_id = c.id
    where c.id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;

  perform public.audit_log_write('read_cast_mynumber_masked', 'cast_sensitive:' || p_cast_id::text,
    null, null, v_cast_store);

  if v_enc is null then return null; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'nox_mynumber_key';
  if v_key is null then raise exception 'mynumber key missing'; end if;
  v_plain := extensions.pgp_sym_decrypt(v_enc, v_key);
  return '********' || right(v_plain, 4);
end $function$


-- ===== set_cast_sensitive(uuid,text,date,text) =====
CREATE OR REPLACE FUNCTION public.set_cast_sensitive(p_cast_id uuid, p_real_name text, p_birthday date, p_mynumber text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_cast_org      uuid;
  v_cast_store    uuid;
  v_fields        text[] := array[]::text[];
  v_old_real_name text;
  v_old_birthday  date;
  v_key           text;
  v_enc           bytea;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  select cs.real_name, cs.birthday into v_old_real_name, v_old_birthday
    from public.cast_sensitive cs where cs.cast_id = p_cast_id;

  if p_mynumber is not null then
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'nox_mynumber_key';
    if v_key is null then raise exception 'mynumber key missing'; end if;
    v_enc := extensions.pgp_sym_encrypt(p_mynumber, v_key);
  else
    v_enc := null;
  end if;

  insert into public.cast_sensitive (cast_id, org_id, store_id, real_name, birthday, mynumber_enc)
  values (p_cast_id, v_cast_org, v_cast_store, p_real_name, p_birthday, v_enc)
  on conflict (cast_id) do update
    set real_name = excluded.real_name, birthday = excluded.birthday,
        mynumber_enc = case when p_mynumber is not null then excluded.mynumber_enc else public.cast_sensitive.mynumber_enc end,
        store_id = excluded.store_id;

  if p_real_name is distinct from v_old_real_name then v_fields := array_append(v_fields, 'real_name'); end if;
  if p_birthday  is distinct from v_old_birthday  then v_fields := array_append(v_fields, 'birthday');  end if;
  if p_mynumber is not null then v_fields := array_append(v_fields, 'mynumber'); end if;
  perform public.audit_log_write('set_cast_sensitive', 'cast_sensitive:' || p_cast_id::text,
    null, jsonb_build_object('fields_changed', to_jsonb(v_fields)), v_cast_store);
  return p_cast_id;
end $function$


-- ===== set_cast_tax_profile(uuid,text,text,text,date,date,date) =====
CREATE OR REPLACE FUNCTION public.set_cast_tax_profile(p_cast_id uuid, p_mode text, p_invoice text, p_reg_no text, p_reg_valid_from date, p_reg_valid_to date, p_reg_notified_on date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast_org uuid; v_cast_store uuid; v_before jsonb; v_after jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_mode not in ('委託','雇用') then raise exception 'bad mode'; end if;
  if p_invoice is not null and p_invoice not in ('課税','免税') then raise exception 'bad invoice'; end if;
  if p_reg_no is not null and p_reg_no !~ '^T[0-9]{13}$' then raise exception 'bad reg_no'; end if;
  if p_reg_valid_from is not null and p_reg_valid_to is not null
     and p_reg_valid_from > p_reg_valid_to then raise exception 'bad reg period'; end if;
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  select to_jsonb(t) into v_before from public.cast_tax_profiles t where t.cast_id = p_cast_id;
  insert into public.cast_tax_profiles (cast_id, org_id, store_id, mode, invoice, reg_no,
    reg_valid_from, reg_valid_to, reg_notified_on)
  values (p_cast_id, v_cast_org, v_cast_store, p_mode, p_invoice, p_reg_no,
    p_reg_valid_from, p_reg_valid_to, p_reg_notified_on)
  on conflict (cast_id) do update
    set mode = excluded.mode, invoice = excluded.invoice, reg_no = excluded.reg_no, store_id = excluded.store_id,
        reg_valid_from = excluded.reg_valid_from, reg_valid_to = excluded.reg_valid_to,
        reg_notified_on = excluded.reg_notified_on;
  select to_jsonb(t) into v_after from public.cast_tax_profiles t where t.cast_id = p_cast_id;
  perform public.audit_log_write('set_cast_tax_profile', 'cast_tax_profiles:' || p_cast_id::text,
    v_before, v_after, v_cast_store);
  return p_cast_id;
end $function$


-- ===== pg_policies（8表） =====
--   cast_tax_profiles.cast_tax_profiles_select [SELECT] to {authenticated} using ((org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR (store_id = auth_store_id())) AND (auth_role() <> 'cast'::text))