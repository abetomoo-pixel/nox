-- 0031_cast_customer_ranking: B-2 — cast ごとの指名客ランキング（回数軸）
-- get_cast_customer_ranking(p_store_id, p_period, p_cast_id): 指定 cast を指名した客を回数順に返す。
-- 集計元・窓計算・cutoff・スコープは get_cast_ranking(mig0011) を完全踏襲（窓一致で UI 側の脱落差分計算が成立）。
-- 客なし指名（checks.customer_id null）は構造的に脱落（= get_cast_ranking 総数 − 本 RPC 客付き合計）。
-- owner/manager のみ（cast 別金額/客データは castMng 領域＝get_cast_sales の staff forbidden 前例 D6a に倣う）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・先頭に貼り先証明）:
--   0) 貼り先証明:
--      select 'nox-project-proof', count(*) from public.orgs;
--   1) シグネチャ（(uuid, text, uuid) 1本のみ・overload なし）+ prosrc + ACL を1結果セットで:
--      select
--        (select string_agg(pg_get_function_identity_arguments(p.oid), ' | ')
--           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--           where n.nspname='public' and p.proname='get_cast_customer_ranking') as sigs,
--        (select pg_get_functiondef('get_cast_customer_ranking(uuid, text, uuid)'::regprocedure)) as def,
--        (select string_agg(grantee||'='||privilege_type, ', ')
--           from information_schema.routine_privileges
--           where routine_name='get_cast_customer_ranking') as grants;
--      → sigs = 'p_store_id uuid, p_period text, p_cast_id uuid' のみ
--      → def に customer_id is not null と p_cast_id 絞りと staff forbidden
--      → grants に anon/public なし・authenticated=EXECUTE
--   2) notify pgrst, 'reload schema';
--   3) 動作アンカー（owner/manager 返却・staff forbidden・窓一致で脱落差分成立）は verify 段で実測。

begin;

create or replace function public.get_cast_customer_ranking(
  p_store_id uuid,
  p_period text,
  p_cast_id uuid
)
 returns table(customer_id uuid, customer_name text, hon_count integer, jonai_count integer, dohan_count integer, total_count integer)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_org      uuid;
  v_role     text;
  v_settings jsonb;
  v_cutoff   text;
  v_first    date;
  v_start    timestamptz;
  v_end      timestamptz;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_period is null or p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  select s.org_id, s.settings_json into v_org, v_settings from public.stores s where s.id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- owner は org 全店・manager は自店のみ
  if not (public.auth_role() = 'owner' or p_store_id = public.auth_store_id()) then
    raise exception 'forbidden';
  end if;
  v_role := public.auth_role();
  if v_role = 'staff' then raise exception 'forbidden'; end if;       -- D6a: cast 別客データは castMng 領域
  if v_role not in ('owner','manager') then raise exception 'forbidden'; end if;  -- cast 本人も初版は不可
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;
  select pb.period_start into v_first from public.period_bounds(p_period) pb;  -- ★写像単一ソース（get_cast_ranking と同一）
  v_start := ((v_first::text || ' ' || v_cutoff))::timestamp at time zone 'Asia/Tokyo';
  v_end   := ((((v_first + interval '1 month')::date)::text || ' ' || v_cutoff))::timestamp at time zone 'Asia/Tokyo';

  return query
  with nom_counts as (
    select c.customer_id as cust,
           count(*) filter (where c.nom_type = 'hon')   as hon,
           count(*) filter (where c.nom_type = 'jonai') as jonai,
           count(*) filter (where c.nom_type = 'dohan') as dohan
    from public.check_nominations n
    join public.checks c on c.id = n.check_id
    where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
      and c.started_at >= v_start and c.started_at < v_end
      and n.org_id = v_org
      and n.cast_id = p_cast_id                    -- ★対象 cast 絞り
      and c.customer_id is not null                -- ★客なし指名は脱落
    group by c.customer_id
  )
  select nc.cust,
         cu.name,
         coalesce(nc.hon, 0)::int,
         coalesce(nc.jonai, 0)::int,
         coalesce(nc.dohan, 0)::int,
         (coalesce(nc.hon, 0) + coalesce(nc.jonai, 0) + coalesce(nc.dohan, 0))::int as total_count
  from nom_counts nc
  join public.customers cu on cu.id = nc.cust    -- 客名解決（is_active 不問・過去/休眠客も名前表示）
  order by (coalesce(nc.hon, 0) + coalesce(nc.jonai, 0) + coalesce(nc.dohan, 0)) desc,
           cu.name asc;
end $function$;

-- grant（drop→create でないが新規なので明示 revoke public,anon + grant authenticated）
revoke all on function public.get_cast_customer_ranking(uuid, text, uuid) from public, anon;
grant execute on function public.get_cast_customer_ranking(uuid, text, uuid) to authenticated;

commit;
