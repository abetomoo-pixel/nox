-- サンプル diff: set_store_receipt_profile（規則B・引数=v_org）
-- 追加行: if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
-- 直前行(アンカー): if v_org is null then raise exception 'forbidden'; end if;
-- 検証: diff=1行 PASS / 直前行=規則Bアンカー PASS / 最初の DML より前 PASS

-- ── 該当箇所（±7行）──
    v_addr    text := trim(coalesce(p_address, ''));
    v_tel     text := trim(coalesce(p_tel, ''));
    v_reg     text := trim(coalesce(p_reg_no, ''));
    v_footer  text := trim(coalesce(p_footer, ''));
    v_before  jsonb;
  begin
    if v_org is null then raise exception 'forbidden'; end if;
+   if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
    if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
    if length(v_addr) > 200 then raise exception 'bad address'; end if;
    if length(v_tel) > 50 then raise exception 'bad tel'; end if;
    if length(v_footer) > 200 then raise exception 'bad footer'; end if;
    if v_reg <> '' and v_reg !~ '^T[0-9]{13}$' then raise exception 'bad reg_no'; end if;
    select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
    if v_store.org_id is null or v_store.org_id <> v_org then raise exception 'forbidden'; end if;

-- ── 変換後 全文 ──
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

