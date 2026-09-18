-- サンプル diff: set_staff_pin（規則B・引数=v_org）
-- 追加行: if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
-- 直前行(アンカー): if v_org is null then raise exception 'forbidden'; end if;
-- 検証: diff=1行 PASS / 直前行=規則Bアンカー PASS / 最初の DML より前 PASS

-- ── 該当箇所（±7行）──
   SET search_path TO 'public', 'extensions'
  AS $function$
  declare
    v_org uuid := public.auth_org_id();
    v_mem record;
  begin
    if v_org is null then raise exception 'forbidden'; end if;
+   if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
    if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'bad pin'; end if;
    -- memberships は org 列を持たない＝store 経由で org 照合（他 org は not found＝存在オラクル封じ）
    select m.id, m.store_id, m.role, m.is_active, m.can_register into v_mem
      from public.memberships m join public.stores s on s.id = m.store_id
     where m.id = p_membership_id and s.org_id = v_org;
    if v_mem.id is null then raise exception 'not found'; end if;
    if not v_mem.is_active then raise exception 'inactive membership'; end if;

-- ── 変換後 全文 ──
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

