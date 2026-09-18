-- サンプル diff: kiosk_provision（規則B・引数=v_org）
-- 追加行: if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
-- 直前行(アンカー): if v_org is null then raise exception 'forbidden'; end if;
-- 検証: diff=1行 PASS / 直前行=規則Bアンカー PASS / 最初の DML より前 PASS

-- ── 該当箇所（±7行）──
  AS $function$
  declare
    v_org       uuid := public.auth_org_id();
    v_store_org uuid;
    v_id        uuid;
  begin
    if v_org is null then raise exception 'forbidden'; end if;
+   if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
    if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
    if p_auth_user_id is null then raise exception 'bad auth user'; end if;
    if p_purpose is null or p_purpose not in ('punch','register') then raise exception 'bad purpose'; end if;
    select org_id into v_store_org from public.stores where id = p_store_id;
    if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;
    -- 実在人物の auth uid の kiosk 化を封じる（役職二重化封じの鏡像）
    if exists (select 1 from public.users u where u.auth_user_id = p_auth_user_id) then

-- ── 変換後 全文 ──
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

