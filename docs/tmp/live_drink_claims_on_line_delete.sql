-- live pg_get_functiondef (2026-08-18・LF正規化済み・読み取り供出)
CREATE OR REPLACE FUNCTION public.drink_claims_on_line_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_actor uuid; v_before jsonb; r record;
begin
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  for r in select * from public.drink_claims
            where check_line_id = old.id and status = 'approved'
  loop
    v_before := to_jsonb(r);
    update public.drink_claims
       set status = 'void', voided_by = v_actor, voided_at = now()
     where id = r.id;
    -- service-role の fixture 掃除では auth 文脈が無い＝audit は文脈がある時のみ
    if coalesce(public.auth_org_id(), public.auth_kiosk_org_id()) is not null then
      perform public.audit_log_write('drink_claim_void_by_line_delete',
        'drink_claims:' || r.id::text, v_before,
        (select to_jsonb(d) from public.drink_claims d where d.id = r.id), r.store_id);
    end if;
  end loop;
  return old;
end $function$

