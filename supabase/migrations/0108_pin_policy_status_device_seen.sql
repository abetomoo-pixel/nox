-- =====================================================================
-- NOX mig0108  M-11b ①(レジ)②③: 端末の最終アクセス・PIN ロック閾値の店設定化・PIN 状態の読取
--
-- 内容:
--   (1) kiosk_devices.last_seen_at timestamptz / last_ip text を追加。
--       kiosk_login の成功経路で更新（レジ端末）。打刻端末（kiosk_punch）は mig0109
--   (2) kiosk_login: ロック閾値（5回・15分）のハードコードを
--       stores.settings_json.pin_lock_max_fail / pin_lock_minutes（既定 5 / 15）から読む形へ。
--       auth・失敗カウント・audit・返却は改稿前と同値（既定値のとき挙動不変）
--   (3) set_store_pin_policy(p_store_id, p_max_fail, p_lock_minutes): owner 限定・
--       3〜10 回 / 5〜60 分・jsonb_set・audit（旧値/新値）
--   (4) staff_pin_status(p_store_id): owner ∨ manager 自店。対象 membership ごとに
--       has_pin / fail_count / locked_until / pin_updated_at を返す（hash は返さない）
-- 正本: docs/NOX_裁定台帳.md 起票#31・裁定39。baseline = live_M11.sql（sha 04b70768…8afe）
-- 不変: money 三面鏡不触。kiosk_login の署名・返却 jsonb の形は同一（ACL 保持）
-- 課金ゲート名簿: set_store_pin_policy を A8（店設定・ゲート済み）に +1、
--                 staff_pin_status を非ゲート（読取）側に +1 ＝ 名簿と billing pin の更新が要る
-- 冪等: add column if not exists / create or replace / revoke+grant
-- 単一トランザクション
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. 列
-- ---------------------------------------------------------------------
alter table public.kiosk_devices add column if not exists last_seen_at timestamptz;
alter table public.kiosk_devices add column if not exists last_ip text;

-- ---------------------------------------------------------------------
-- 2. kiosk_login（署名同一・create or replace）
-- ---------------------------------------------------------------------
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
  v_settings jsonb;
  v_max     integer;
  v_lock    interval;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'register';
  if not found then raise exception 'forbidden'; end if;
  -- ★mig0108（M-11b ②）: ロック閾値を店設定から読む（既定 5回 / 15分＝改稿前のハードコードと同値）
  select s.settings_json into v_settings from public.stores s where s.id = v_device.store_id;
  v_max  := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_max_fail'), '')::int, 5);
  v_lock := make_interval(mins => coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_minutes'), '')::int, 15));
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
    if v_newfail >= v_max then
      update public.staff_pin
         set fail_count = 0, locked_until = now() + v_lock, updated_at = now()
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
                          'locked', v_newfail >= v_max),
       v_ip);
    if v_newfail >= v_max then
      return jsonb_build_object('ok', false, 'reason', 'locked',
                                'locked_until', now() + v_lock);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  -- PIN 一致: カウンタ復元 → 既存セッションを閉じて差し替え → 新セッション発行
  update public.staff_pin
     set fail_count = 0, locked_until = null, updated_at = now()
   where membership_id = p_membership_id;

  update public.kiosk_sessions set ended_at = now()
   where device_id = v_device.id and ended_at is null;

  -- ★mig0108（M-11b ①・レジ端末）: 端末の最終アクセスを記録（打刻端末は mig0109 の kiosk_punch 側）
  update public.kiosk_devices
     set last_seen_at = now(), last_ip = v_ip
   where id = v_device.id;

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
end $function$;

-- ---------------------------------------------------------------------
-- 3. set_store_pin_policy（新設・owner 限定・settings_json RPC 5本と同型）
-- ---------------------------------------------------------------------
create or replace function public.set_store_pin_policy(p_store_id uuid, p_max_fail integer, p_lock_minutes integer)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_store  record;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_max_fail is null or p_max_fail < 3 or p_max_fail > 10 then raise exception 'bad max_fail'; end if;
  if p_lock_minutes is null or p_lock_minutes < 5 or p_lock_minutes > 60 then raise exception 'bad lock_minutes'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（D3a）

  v_before := jsonb_build_object(
    'pin_lock_max_fail', coalesce(nullif(trim(v_store.settings_json->>'pin_lock_max_fail'), '')::int, 5),
    'pin_lock_minutes',  coalesce(nullif(trim(v_store.settings_json->>'pin_lock_minutes'), '')::int, 15)
  );
  update public.stores
     set settings_json =
       jsonb_set(
         jsonb_set(coalesce(settings_json, '{}'::jsonb),
           '{pin_lock_max_fail}', to_jsonb(p_max_fail), true),
         '{pin_lock_minutes}',  to_jsonb(p_lock_minutes), true)
   where id = p_store_id;
  v_after := jsonb_build_object('pin_lock_max_fail', p_max_fail, 'pin_lock_minutes', p_lock_minutes);
  perform public.audit_log_write('set_store_pin_policy', 'stores:' || p_store_id::text, v_before, v_after, p_store_id);
end $function$;

revoke all on function public.set_store_pin_policy(uuid, integer, integer) from public, anon;
grant execute on function public.set_store_pin_policy(uuid, integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 4. staff_pin_status（新設・読取・hash 非返却）
-- ---------------------------------------------------------------------
create or replace function public.staff_pin_status(p_store_id uuid)
 returns table(membership_id uuid, has_pin boolean, fail_count integer, locked_until timestamptz, pin_updated_at timestamptz)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and p_store_id = v_st)) then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;
  return query
  select m.id,
         (p.membership_id is not null),
         coalesce(p.fail_count, 0),
         p.locked_until,
         p.updated_at
    from public.memberships m
    left join public.staff_pin p on p.membership_id = m.id
   where m.store_id = p_store_id
     and m.is_active
     and (m.role in ('owner','manager') or (m.role = 'staff' and m.can_register))
   order by m.role, m.id;
end $function$;

revoke all on function public.staff_pin_status(uuid) from public, anon;
grant execute on function public.staff_pin_status(uuid) to authenticated;

commit;
-- ===== end mig0108 =====
