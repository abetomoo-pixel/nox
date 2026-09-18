-- live_M9.sql — M-9 A1（biz_cutoff_hm 入力口＋書込 RPC）起草用 live 全文ダンプ
-- 採取元: nox-dev / pg_get_functiondef（読み取り専用・untracked scratch）
-- 収録: set_store_business_hours（営業時間 RPC）
--     ＋ settings_json を jsonb_set で書く既存 RPC 5本（書き方の前例）
-- ★ set_store_pricing / set_store_time_pricing は stores の実列を書くため除外

-- ======================================================================
-- set_store_business_hours(uuid,integer,boolean,text,text)
-- ======================================================================
CREATE OR REPLACE FUNCTION public.set_store_business_hours(p_store_id uuid, p_dow integer, p_is_closed boolean, p_open_hm text DEFAULT NULL::text, p_close_hm text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_before jsonb;
  v_id uuid;
  v_open_min int;
  v_close_min int;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
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
end $function$


-- ======================================================================
-- set_store_okuri_mode(uuid,text)
-- ======================================================================
CREATE OR REPLACE FUNCTION public.set_store_okuri_mode(p_store_id uuid, p_mode text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
  v_prev  text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_mode is null or p_mode not in ('flat','actual') then raise exception 'bad mode'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（D3a）

  v_prev := coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat');
  update public.stores
     set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{okuri_mode}', to_jsonb(p_mode), true)
   where id = p_store_id;

  perform public.audit_log_write('set_store_okuri_mode', 'stores:' || p_store_id::text,
    jsonb_build_object('okuri_mode', v_prev), jsonb_build_object('okuri_mode', p_mode), p_store_id);
end $function$


-- ======================================================================
-- set_store_okuri_base(uuid,integer)
-- ======================================================================
CREATE OR REPLACE FUNCTION public.set_store_okuri_base(p_store_id uuid, p_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
  v_prev  text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'bad amount'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（okuri_mode と同格）

  v_prev := coalesce(nullif(trim(v_store.settings_json->>'okuri_base_amount'), ''), '0');
  update public.stores
     set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{okuri_base_amount}', to_jsonb(p_amount), true)
   where id = p_store_id;

  perform public.audit_log_write('set_store_okuri_base', 'stores:' || p_store_id::text,
    jsonb_build_object('okuri_base_amount', v_prev), jsonb_build_object('okuri_base_amount', p_amount), p_store_id);
end $function$


-- ======================================================================
-- set_store_cast_register(uuid,boolean)
-- ======================================================================
CREATE OR REPLACE FUNCTION public.set_store_cast_register(p_store_id uuid, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
  v_prev  boolean;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_enabled is null then raise exception 'bad enabled'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（okuri_mode と同格）

  v_prev := coalesce(v_store.settings_json->>'cast_register_enabled', '') = 'true';
  update public.stores
     set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{cast_register_enabled}', to_jsonb(p_enabled), true)
   where id = p_store_id;

  perform public.audit_log_write('set_store_cast_register', 'stores:' || p_store_id::text,
    jsonb_build_object('cast_register_enabled', v_prev), jsonb_build_object('cast_register_enabled', p_enabled), p_store_id);
end $function$


-- ======================================================================
-- set_store_norm_config(uuid,boolean,boolean,text)
-- ======================================================================
CREATE OR REPLACE FUNCTION public.set_store_norm_config(p_store_id uuid, p_sales_enabled boolean, p_shimei_enabled boolean, p_shimei_scope text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store  record;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_sales_enabled is null then raise exception 'bad sales_enabled'; end if;
  if p_shimei_enabled is null then raise exception 'bad shimei_enabled'; end if;
  if p_shimei_scope is null or p_shimei_scope not in ('hon','hon_jonai') then raise exception 'bad shimei_scope'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（okuri_mode と同格）

  v_before := jsonb_build_object(
    'sales_norm_enabled',  coalesce(v_store.settings_json->>'sales_norm_enabled', '') = 'true',
    'shimei_norm_enabled', coalesce(v_store.settings_json->>'shimei_norm_enabled', '') = 'true',
    'shimei_norm_scope',   coalesce(nullif(trim(v_store.settings_json->>'shimei_norm_scope'), ''), 'hon')
  );
  update public.stores
     set settings_json =
       jsonb_set(
         jsonb_set(
           jsonb_set(coalesce(settings_json, '{}'::jsonb),
             '{sales_norm_enabled}',  to_jsonb(p_sales_enabled),  true),
           '{shimei_norm_enabled}', to_jsonb(p_shimei_enabled), true),
         '{shimei_norm_scope}',   to_jsonb(p_shimei_scope),   true)
   where id = p_store_id;
  v_after := jsonb_build_object(
    'sales_norm_enabled',  p_sales_enabled,
    'shimei_norm_enabled', p_shimei_enabled,
    'shimei_norm_scope',   p_shimei_scope
  );
  perform public.audit_log_write('set_store_norm_config', 'stores:' || p_store_id::text, v_before, v_after, p_store_id);
end $function$


-- ======================================================================
-- set_store_receipt_profile(uuid,text,text,text,text)
-- ======================================================================
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

