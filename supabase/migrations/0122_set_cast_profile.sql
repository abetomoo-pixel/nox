-- mig 0122 NOX: set_cast_profile 新設＝源氏名・入店日の更新 RPC（裁定109）
-- 前提: casts（name/joined_on/left_on）・auth_org_id/auth_role/auth_store_id・billing_writable_of・audit_log_write
-- 底本の型: live set_cast_rank_of（docs/tmp/live_set_cast_rank_of.sql sha256 1355b9fd…cb84）の認可ガード・audit 流儀
-- 冪等: 可（drop if exists → create・ACL 再付与）
-- 裁定109:
--   ・更新対象は 源氏名(name)・入店日(joined_on) のみ。left_on（退店フロー）・store_id（店移動＝別起票）は含めない
--   ・権限: owner＝org 全店／manager＝自店のみ／staff・cast＝forbidden（set_cast_rank_of と同じ）
--   ・源氏名は店内の is_active 行同士で lower 一致を拒否（'duplicate name'・自分は除外）
--   ・joined_on 必須。left_on があれば joined_on <= left_on（'bad joined_on'）
--   ・audit: 変更列のみ before/after（変更なしなら audit も更新もしない）
-- 教訓43: 新規関数は default privileges で authenticated 等へ EXECUTE が付くため、4者 revoke → 必要分 grant

begin;

drop function if exists public.set_cast_profile(uuid, text, date);

create or replace function public.set_cast_profile(p_cast_id uuid, p_name text, p_joined_on date)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_cast   public.casts;
  v_name   text;
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
begin
  -- null-guard-first
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 対象行（org 照合・現在値の先読み）
  select * into v_cast from public.casts where id = p_cast_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 権限: owner＝org 全店／manager＝自店のみ
  if (v_role = 'owner'
      or (v_role = 'manager' and v_cast.store_id = public.auth_store_id())) is not true then
    raise exception 'forbidden';
  end if;

  -- 入力検証
  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' or length(v_name) > 50 then raise exception 'bad name'; end if;
  if p_joined_on is null then raise exception 'bad joined_on'; end if;
  if v_cast.left_on is not null and p_joined_on > v_cast.left_on then raise exception 'bad joined_on'; end if;

  -- 店内の源氏名重複（is_active 行同士・lower 一致・自分は除外）
  if exists (
    select 1 from public.casts c
    where c.store_id = v_cast.store_id and c.is_active
      and c.id <> v_cast.id and lower(c.name) = lower(v_name)
  ) then
    raise exception 'duplicate name';
  end if;

  -- 変更列のみ audit
  if v_name is distinct from v_cast.name then
    v_before := v_before || jsonb_build_object('name', v_cast.name);
    v_after  := v_after  || jsonb_build_object('name', v_name);
  end if;
  if p_joined_on is distinct from v_cast.joined_on then
    v_before := v_before || jsonb_build_object('joined_on', v_cast.joined_on);
    v_after  := v_after  || jsonb_build_object('joined_on', p_joined_on);
  end if;
  if v_after = '{}'::jsonb then return; end if;  -- 変更なし＝no-op

  update public.casts
     set name = v_name, joined_on = p_joined_on, updated_at = now()
   where id = v_cast.id;

  perform public.audit_log_write('set_cast_profile', 'casts:' || v_cast.id::text,
    v_before, v_after, v_cast.store_id);
end $function$;

comment on function public.set_cast_profile(uuid, text, date) is
  'mig0122 裁定109: 源氏名・入店日の更新（owner=org 全店／manager=自店）。店内 active の源氏名重複は拒否。left_on/store_id は対象外';

-- ACL（教訓43）
revoke all on function public.set_cast_profile(uuid, text, date) from public, anon, authenticated, service_role;
grant execute on function public.set_cast_profile(uuid, text, date) to authenticated, service_role;

commit;

-- ===== 検証バンドル（Ctrl+A → Run・1結果セット・8行すべて報告） =====
-- 期待: ord1=1／ord2=3／ord3=true／ord4=true（anon なし）／ord5=true（authenticated あり）／ord6=（写し）／ord7=true／ord8=0
--   ord8 は「既存の店内 active 源氏名重複」の件数。0 でなければ手貼り後に該当キャストを報告（RPC の重複拒否と矛盾する既存データ）
with f as (
  select p.oid, p.pronargs, p.prosecdef, p.proacl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'set_cast_profile'
)
select 1 as ord, 'overloads'      as item, count(*)::text as val, (count(*) = 1) as ok from f
union all
select 2, 'pronargs',       pronargs::text, pronargs = 3 from f
union all
select 3, 'security_definer', prosecdef::text, prosecdef from f
union all
select 4, 'anon_absent',    (coalesce(proacl::text,'') not like '%anon=%')::text, coalesce(proacl::text,'') not like '%anon=%' from f
union all
select 5, 'authenticated_x', (coalesce(proacl::text,'') like '%authenticated=X%')::text, coalesce(proacl::text,'') like '%authenticated=X%' from f
union all
select 6, 'proacl',         coalesce(proacl::text, '(null)'), true from f
union all
select 7, 'comment_0122',   (obj_description(oid, 'pg_proc') like '%0122%')::text, obj_description(oid, 'pg_proc') like '%0122%' from f
union all
select 8, 'existing_dup_names', count(*)::text, count(*) = 0
  from (select store_id, lower(name) from public.casts where is_active group by 1, 2 having count(*) > 1) d
order by ord;
