-- サンプル diff: check_dohan_add（前=live pg_get_functiondef / 後=機械挿入後）
-- 差分は下記1行の追加のみ（機械検証 (a)(c) PASS 済み）
-- 追加行: if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
-- 直前行(アンカー): v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型

-- ── 前後の該当箇所（±6行）──
  begin
    -- ★0057(1)型
    if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
      raise exception 'forbidden';
    end if;
    v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
+   if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
    if p_count is null or p_count <= 0 then raise exception 'bad count'; end if;
    select * into v_chk from public.checks where id = p_check_id;
    if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
    if (public.auth_role() = 'owner'
            or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
            or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()

-- ── 変換後 全文 ──
CREATE OR REPLACE FUNCTION public.check_dohan_add(p_check_id uuid, p_count integer DEFAULT 1)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_id uuid; v_sort int; v_paycnt int; v_price int;
  v_org uuid;
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_count is null or p_count <= 0 then raise exception 'bad count'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3)型: kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- 入金後に合計が動く経路を塞ぐ（check_time_charge_apply と同じ保守側）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;

  select coalesce(v_chk.dohan_fee, st.dohan_fee) into v_price
    from public.stores st where st.id = v_chk.store_id;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, fee_kind, cast_id)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
          '同伴料', v_price, p_count, v_price * p_count, null, v_sort, 'dohan', null)
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_dohan_add', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$

