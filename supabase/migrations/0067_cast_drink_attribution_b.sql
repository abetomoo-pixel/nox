-- mig0067: キャストドリンク注文時帰属 (b) 代理起票 ＋ 取消
-- 前提: mig0066 適用済み / 冪等（create or replace）

begin;

-- 代理起票: 引数2つ＝明細行と対象キャスト。check/product/qty は行から導出
-- （引数で受けると「行は2杯・claim は1杯」の不整合を呼び出し側が作れてしまう）
create or replace function public.drink_claim_submit_proxy(p_line_id uuid, p_cast_id uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_line record; v_chk record; v_prod record; v_cast record;
  v_actor uuid; v_unit int; v_back int; v_id uuid;
begin
  -- 冒頭 null ガード。kiosk 腕を意図的に持たない＝0059 非開示原則
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;

  select * into v_line from public.check_lines where id = p_line_id;
  if v_line.id is null or v_line.org_id <> public.auth_org_id() then
    raise exception 'forbidden';  -- 存在オラクル封じ
  end if;

  select * into v_chk from public.checks where id = v_line.check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;

  -- 黒服 can_register 以上（cast 腕なし＝代理起票は店側の行為）
  if (public.auth_role() = 'owner'
      or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
      or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
          and public.auth_staff_can_register())) is not true then
    raise exception 'forbidden';
  end if;

  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  if v_line.product_id is null or v_line.back_snapshot is null
     or v_line.kind not in ('drink','champ','bottle') then
    raise exception 'bad line';
  end if;

  select * into v_prod from public.products where id = v_line.product_id;
  if v_prod.id is null or not v_prod.back_exempt_from_split then
    raise exception 'not exempt product';  -- 経路排他＝按分対象商品に claim を付けない
  end if;

  if exists (select 1 from public.drink_claims d
              where d.check_line_id = v_line.id and d.status = 'approved') then
    raise exception 'already claimed';
  end if;

  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id()
     or v_cast.store_id <> v_chk.store_id or not v_cast.is_active then
    raise exception 'bad cast';
  end if;

  -- ★焼付け＝伝票凍結値（check_close と同一の真実。マスタ現価では読まない）
  if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
    v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> v_chk.nom_type)::int, 0);
  else
    v_unit := round(v_line.unit_price_snapshot
                    * coalesce((v_line.back_snapshot ->> 'back_value')::numeric, 0) / 100.0)::int;
  end if;
  v_back := v_unit * v_line.qty;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  insert into public.drink_claims
    (org_id, store_id, check_id, check_line_id, cast_id, product_id, qty, back_amount,
     status, requested_by, decided_by, decided_at)
  values
    (v_chk.org_id, v_chk.store_id, v_chk.id, v_line.id, p_cast_id, v_line.product_id,
     v_line.qty, v_back, 'approved', v_actor, v_actor, now())
  returning id into v_id;

  perform public.audit_log_write('drink_claim_submit_proxy', 'drink_claims:' || v_id::text, null,
    (select to_jsonb(d) from public.drink_claims d where d.id = v_id), v_chk.store_id);
  return v_id;
end $function$;

-- 取消: approved -> void。裁定(C)＝伝票が open の間だけ
create or replace function public.drink_claim_void(p_claim_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_cl record; v_chk_status text; v_actor uuid; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_cl from public.drink_claims where id = p_claim_id;
  if v_cl.id is null or v_cl.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
      or (public.auth_role() = 'manager' and v_cl.store_id = public.auth_store_id())
      or (public.auth_role() = 'staff' and v_cl.store_id = public.auth_store_id()
          and public.auth_staff_can_register())) is not true then
    raise exception 'forbidden';
  end if;
  if v_cl.status <> 'approved' then raise exception 'not approved'; end if;
  select status into v_chk_status from public.checks where id = v_cl.check_id;
  if v_chk_status <> 'open' then raise exception 'not open'; end if;
  v_before := to_jsonb(v_cl);
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.drink_claims
     set status = 'void', voided_by = v_actor, voided_at = now()
   where id = p_claim_id;
  perform public.audit_log_write('drink_claim_void', 'drink_claims:' || p_claim_id::text, v_before,
    (select to_jsonb(d) from public.drink_claims d where d.id = p_claim_id), v_cl.store_id);
end $function$;

revoke all on function public.drink_claim_submit_proxy(uuid, uuid) from public, anon;
revoke all on function public.drink_claim_void(uuid) from public, anon;
grant execute on function public.drink_claim_submit_proxy(uuid, uuid) to authenticated;
grant execute on function public.drink_claim_void(uuid) to authenticated;

commit;
