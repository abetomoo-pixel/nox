-- mig0065_set_cast_photo_updated_at.sql
-- 段P: 写真アップロード完了後に casts.photo_updated_at を打刻する RPC。
-- authz = storage ポリシー（cast_photos_insert/update）と同一：
--   owner ∨ manager(自店の cast) ∨ cast 本人。黒服(staff)・anon・他org・他店manager 不可。
-- 二重防御（冒頭 null guard + revoke public,anon + grant authenticated）・audit_log_write。
-- 冪等: 再実行可（create or replace）

begin;

create or replace function public.set_cast_photo_updated_at(p_cast_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cast   record;
  v_now    timestamptz;
  v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_cast_id is null then raise exception 'bad cast'; end if;

  select id, org_id, store_id, photo_updated_at into v_cast
    from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then
    raise exception 'not found';
  end if;

  -- storage cast_photos_insert/update と同一の authz（片側だけ通る不整合を作らない）
  if not (
       public.auth_role() = 'owner'
       or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())
       or (public.auth_cast_id() is not null and public.auth_cast_id() = p_cast_id)
     ) then
    raise exception 'forbidden';
  end if;

  v_now := now();
  v_before := jsonb_build_object('photo_updated_at', v_cast.photo_updated_at);

  update public.casts set photo_updated_at = v_now where id = p_cast_id;

  perform public.audit_log_write(
    'set_cast_photo',
    'casts:' || p_cast_id::text,
    v_before,
    jsonb_build_object('photo_updated_at', v_now),
    v_cast.store_id
  );

  return v_now;
end $function$;

revoke execute on function public.set_cast_photo_updated_at(uuid) from public, anon;
grant execute on function public.set_cast_photo_updated_at(uuid) to authenticated;

commit;
