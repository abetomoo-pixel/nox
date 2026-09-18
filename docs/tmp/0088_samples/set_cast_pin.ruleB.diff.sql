-- サンプル diff: set_cast_pin（規則B・引数=v_org）
-- 追加行: if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
-- 直前行(アンカー): if v_org is null then raise exception 'forbidden'; end if;
-- 検証: diff=1行 PASS / 直前行=規則Bアンカー PASS / 最初の DML より前 PASS

-- ── 該当箇所（±7行）──
   SET search_path TO 'public', 'extensions'
  AS $function$
  declare
    v_org  uuid := public.auth_org_id();
    v_cast public.casts;
  begin
    if v_org is null then raise exception 'forbidden'; end if;
+   if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
    if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'bad pin'; end if;
    select c.* into v_cast from public.casts c
      where c.id = p_cast_id and c.org_id = v_org;
    if not found then raise exception 'not found'; end if;
    if not v_cast.is_active then raise exception 'inactive cast'; end if;
    if not (public.auth_role() = 'owner'
            or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then

-- ── 変換後 全文 ──
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

