CREATE OR REPLACE FUNCTION public.set_cast_rank_of(p_cast_id uuid, p_rank_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_cast_store uuid;
  v_old  uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select c.store_id, c.rank_id into v_cast_store, v_old
    from public.casts c
   where c.id = p_cast_id and c.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or v_cast_store is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if p_rank_id is not null and not exists (
       select 1 from public.cast_ranks cr
        where cr.id = p_rank_id and cr.store_id = v_cast_store) then
    raise exception 'bad rank';
  end if;
  -- ★mig0104（裁定77）: 停止中ランクの新規割当を拒否。現在値と同じ rank_id の再送は据え置き
  if p_rank_id is not null
     and p_rank_id is distinct from v_old
     and not exists (
       select 1 from public.cast_ranks cr
        where cr.id = p_rank_id and cr.store_id = v_cast_store and cr.is_active) then
    raise exception 'inactive rank';
  end if;

  update public.casts
     set rank_id = p_rank_id
   where id = p_cast_id;

  -- audit は id のみ（源氏名・PII を載せない既存流儀）
  perform public.audit_log_write(
    p_action   => 'set_cast_rank_of',
    p_target   => 'casts:' || p_cast_id::text,
    p_before   => jsonb_build_object('rank_id', v_old),
    p_after    => jsonb_build_object('rank_id', p_rank_id),
    p_store_id => v_cast_store
  );
end $function$
