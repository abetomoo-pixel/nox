-- 0074_cast_leave_rejoin.sql
-- 前提: mig0073 まで適用済み（dev hiqbfagmkrdpmlqhkmsu）
-- 冪等: add column if not exists / set default（再実行可）/ do-block constraint / create or replace / revoke・grant
-- ★非冪等要素: なし
-- 内容: casts に joined_on/left_on（date・backfill なし）＋整合CHECK＋cast_leave/cast_rejoin RPC（owner全店/manager自店・復活方式A＝履歴なし）
-- 手貼り後: notify pgrst, 'reload schema';

begin;

-- 1) 列追加（★default は列追加と分離＝volatile default を add column に同居させると
--    既存行へ評価値が書かれ backfill なしに反するため。既存7行は null のまま）
alter table public.casts add column if not exists joined_on date;
alter table public.casts alter column joined_on
  set default ((now() at time zone 'Asia/Tokyo')::date);
alter table public.casts add column if not exists left_on date;

-- 2) 整合制約: is_active = (left_on is null)（裁定(ii)・既存7行全件通過を実測確認済み）
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'casts_active_left_on_chk'
      and conrelid = 'public.casts'::regclass
  ) then
    alter table public.casts
      add constraint casts_active_left_on_chk check (is_active = (left_on is null));
  end if;
end $$;

-- 3) cast_leave: 退店（is_active=false ＋ left_on を同一UPDATEで書く＝CHECKと整合）
create or replace function public.cast_leave(p_cast_id uuid, p_left_on date default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.casts;
  v_left date;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 対象 cast を org 照合
  select c.* into v_row
  from public.casts c
  where c.id = p_cast_id and c.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 権限: owner || (manager && 自店)（staff_deactivate 同型）
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 既に退店済みなら明示拒否
  if not v_row.is_active then raise exception 'already inactive'; end if;

  v_left := coalesce(p_left_on, (now() at time zone 'Asia/Tokyo')::date);

  update public.casts
     set is_active = false, left_on = v_left
   where id = p_cast_id;

  perform public.audit_log_write('cast_leave', 'casts:' || p_cast_id::text,
    to_jsonb(v_row),
    (select to_jsonb(c) from public.casts c where c.id = p_cast_id),
    v_row.store_id);
end $function$;

revoke execute on function public.cast_leave(uuid, date) from public, anon;
grant execute on function public.cast_leave(uuid, date) to authenticated;

-- 4) cast_rejoin: 復活（方式A＝履歴なし・joined_on 不変・left_on を null へ）
create or replace function public.cast_rejoin(p_cast_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.casts;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  select c.* into v_row
  from public.casts c
  where c.id = p_cast_id and c.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 既に在籍なら明示拒否
  if v_row.is_active then raise exception 'already active'; end if;

  -- 1ユーザー1アクティブ: 同一 user の他 active 行を検証（staff_reactivate 同型・
  -- casts_one_active_per_user_idx への抵触を例外文言で先取り）
  if v_row.user_id is not null and exists (
    select 1 from public.casts c
    where c.user_id = v_row.user_id and c.is_active and c.id <> p_cast_id
  ) then
    raise exception 'already active elsewhere';
  end if;

  update public.casts
     set is_active = true, left_on = null
   where id = p_cast_id;

  perform public.audit_log_write('cast_rejoin', 'casts:' || p_cast_id::text,
    to_jsonb(v_row),
    (select to_jsonb(c) from public.casts c where c.id = p_cast_id),
    v_row.store_id);
end $function$;

revoke execute on function public.cast_rejoin(uuid) from public, anon;
grant execute on function public.cast_rejoin(uuid) to authenticated;

commit;
