-- サンプル diff: set_printer_config（規則B・引数=v_org）
-- 追加行: if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
-- 直前行(アンカー): if v_org is null then raise exception 'forbidden'; end if;
-- 検証: diff=1行 PASS / 直前行=規則Bアンカー PASS / 最初の DML より前 PASS

-- ── 該当箇所（±7行）──
  AS $function$
  declare
    v_org       uuid := public.auth_org_id();
    v_store_org uuid;
    v_before    jsonb;
  begin
    if v_org is null then raise exception 'forbidden'; end if;
+   if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
    if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
    if p_enabled is null then raise exception 'bad enabled'; end if;
    select org_id into v_store_org from public.stores where id = p_store_id;
    if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;
  
    select jsonb_build_object('printer_enabled', c.printer_enabled, 'printer_serial', c.printer_serial)
      into v_before from public.printer_config c where c.store_id = p_store_id;

-- ── 変換後 全文 ──
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

