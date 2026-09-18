-- サンプル diff: check_add_line（前=live pg_get_functiondef / 後=機械挿入後）
-- 差分は下記1行の追加のみ（機械検証 (a)(c) PASS 済み）
-- 追加行: if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
-- 直前行(アンカー): v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)

-- ── 前後の該当箇所（±6行）──
  begin
    -- ★0057(1)
    if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
      raise exception 'forbidden';
    end if;
    v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
+   if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
    if p_qty is null or p_qty <= 0 then raise exception 'bad qty'; end if;
    v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
    if length(v_grp) > 20 then raise exception 'bad group'; end if;
    select * into v_chk from public.checks where id = p_check_id;
    if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
    if (public.auth_role() = 'owner'

-- ── 変換後 全文 ──
CREATE OR REPLACE FUNCTION public.check_add_line(p_check_id uuid, p_product_id uuid DEFAULT NULL::uuid, p_qty integer DEFAULT 1, p_kind text DEFAULT NULL::text, p_pay_group text DEFAULT 'A'::text, p_name text DEFAULT NULL::text, p_unit_price integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_prod record; v_id uuid; v_grp text; v_sort int;
  v_kind text; v_name text; v_price int; v_back jsonb;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'bad qty'; end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（誤入力訂正は remove_line＝確定① の代替経路）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  if p_product_id is not null then
    select * into v_prod from public.products where id = p_product_id;
    if v_prod.id is null or v_prod.org_id <> v_org
       or v_prod.store_id <> v_chk.store_id then raise exception 'bad item'; end if;
    if not v_prod.is_active then raise exception 'inactive item'; end if;
    v_kind := v_prod.type;             -- drink/champ/bottle
    v_name := v_prod.name;
    v_price := v_prod.price;
    -- ★mig0070: back_exempt を凍結（経路の分岐もマスタ現価でなく伝票の凍結値で決める）
    v_back := jsonb_build_object('back_mode', v_prod.back_mode, 'back_value', v_prod.back_value,
                                 'unit4', v_prod.unit4_json, 'hon_pt', v_prod.hon_pt,
                                 'back_exempt', coalesce(v_prod.back_exempt_from_split, false));
  else
    if p_kind is null or p_kind not in ('set','time','charge','custom') then raise exception 'bad kind'; end if;
    if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
    if p_unit_price is null or p_unit_price < 0 then raise exception 'bad price'; end if;
    v_kind := p_kind;
    v_name := trim(p_name);
    v_price := p_unit_price;
    v_back := null;
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot, sort_order)
  values (v_chk.org_id, v_chk.store_id, p_check_id, p_product_id, v_kind, v_grp,
          v_name, v_price, p_qty, v_price * p_qty, v_back, v_sort)
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_add_line', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$

