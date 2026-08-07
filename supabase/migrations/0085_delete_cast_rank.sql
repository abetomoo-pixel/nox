-- mig0085: delete_cast_rank（参照ゼロのみ削除・裁定5）
-- 再適用可・手貼り1回（dev 適用済み 2026-08-06・検証3/3緑）
CREATE OR REPLACE FUNCTION public.delete_cast_rank(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_row  public.cast_ranks%rowtype;
  v_ref  int;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  select * into v_row from public.cast_ranks cr
   where cr.id = p_id and cr.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or v_row.store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;

  -- 参照ゼロ検証（casts.rank_id / pricing_rules.rank_id）。剥がしは UI 側
  -- （set_cast_rank_of(cast, null)・ルール編集）に委ね、RPC は保守側で拒否。
  select (select count(*) from public.casts c where c.rank_id = p_id)
       + (select count(*) from public.pricing_rules r where r.rank_id = p_id)
    into v_ref;
  if v_ref > 0 then raise exception 'in use'; end if;

  delete from public.cast_ranks where id = p_id;

  perform public.audit_log_write(
    p_action   => 'delete_cast_rank',
    p_target   => 'cast_ranks:' || p_id::text,
    p_before   => to_jsonb(v_row),
    p_after    => null,
    p_store_id => v_row.store_id
  );
end $function$;

revoke all on function public.delete_cast_rank(uuid) from public, anon;
grant execute on function public.delete_cast_rank(uuid) to authenticated, service_role;
