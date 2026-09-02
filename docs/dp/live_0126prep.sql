CREATE OR REPLACE FUNCTION public.shift_propose(p_shift_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ids uuid[]; v_bad int; v_cnt int; v_store uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_shift_ids is null or coalesce(array_length(p_shift_ids,1),0) = 0 then
    raise exception 'bad ids';
  end if;
  select array_agg(distinct x) into v_ids from unnest(p_shift_ids) as x;  -- 重複除去
  select count(*) into v_bad
    from unnest(v_ids) as t(id)
    left join public.shifts s on s.id = t.id
   where s.id is null
      or s.org_id <> public.auth_org_id()
      or s.status <> 'planned'
      or not (public.auth_role() = 'owner'
              or (public.auth_role() = 'manager' and s.store_id = public.auth_store_id()));
  if v_bad > 0 then raise exception 'bad rows: %', v_bad; end if;
  select s.store_id into v_store from public.shifts s where s.id = v_ids[1];
  update public.shifts
     set status = 'proposed'
   where id = any(v_ids) and org_id = public.auth_org_id() and status = 'planned';
  get diagnostics v_cnt = row_count;
  if v_cnt <> array_length(v_ids,1) then raise exception 'concurrent change'; end if;
  perform public.audit_log_write('shift_propose', 'shifts:bulk', null,
    jsonb_build_object('ids', to_jsonb(v_ids), 'count', v_cnt), v_store);
  return v_cnt;
end
$function$
