-- mig0090: check_set_people（開卓後の人数修正・E8-1／裁定29②の格上げ＝E8 裁定 T8）
-- 再適用可（create or replace＋ACL のみ）・手貼り1回
-- 設計: open 中のみ・payments 0 のみ（person 制の時間料金 units が変わる＝入金後の
--   合計変動を塞ぐ既存規約に整列）。変更後に auto 店は次回 apply が units を再計算、
--   開卓時 set 行（time_auto ∧ fee_kind='set'）は本 RPC が即時追随（qty/line_total 再計算）。
--   manual 店の押下済み延長行（time_auto=false）は変更しない＝押下時点の事実記録。

begin;
select 'nox-project-proof' as proof, count(*) as orgs from public.orgs;

CREATE OR REPLACE FUNCTION public.check_set_people(p_check_id uuid, p_people integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_paycnt int; v_units int;
  v_before jsonb;
  v_org uuid;
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_people is not null and p_people <= 0 then raise exception 'bad people'; end if;
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
  -- person 制の units 変動＝入金後の合計変動を塞ぐ（apply/shimei と同じ保守側）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;

  v_before := to_jsonb(v_chk);
  update public.checks set people = p_people where id = p_check_id;

  -- 開卓時 set 行の即時追随（auto 店は次回 apply でも同値に収束＝二重権威にならない。
  --   manual 店はここが唯一の再計算点。行が無い（set額0 等）場合は何もしない）
  if v_chk.time_per = 'person' then
    v_units := coalesce(p_people, 1);
    update public.check_lines
       set qty = v_units, line_total = unit_price_snapshot * v_units
     where check_id = p_check_id and time_auto and fee_kind = 'set';
    perform public.check_recalc(p_check_id);
  end if;

  perform public.audit_log_write('check_set_people', 'checks:' || p_check_id::text,
    v_before, (select to_jsonb(c) from public.checks c where c.id = p_check_id),
    v_chk.store_id);
end $function$;

revoke all on function public.check_set_people(uuid, integer) from public, anon;
grant execute on function public.check_set_people(uuid, integer) to authenticated, service_role;

commit;
