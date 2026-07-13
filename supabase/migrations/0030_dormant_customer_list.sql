-- 0030_dormant_customer_list: B-3 — customer_list_summary に p_include_dormant 追加（休眠客の掘り起こし）
-- customer_list_summary に p_include_dormant 引数を追加（休眠客の掘り起こし用）。
-- default false のため既存呼び出しは無改修。
-- cast ロールは p_include_dormant=true でも休眠を返さない（二層目・掘り起こしは owner/manager の経営判断）。
-- シグネチャ変更のため旧関数を明示 drop（overload 封じ）→ create → grant 再付与。
--
-- 適用後の検証（"Success" 表示だけを信用しない・先頭に貼り先証明）:
--   -- 0) 貼り先証明（nox プロジェクトであること・エラーなら誤貼り先＝即中断）
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- 1) シグネチャ確認（(uuid, boolean) の1行のみ＝旧 (uuid) が残っていない）
--   select proname, pg_get_function_identity_arguments(p.oid) from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname = 'customer_list_summary';
--   -- 2) 定義実測（p_include_dormant が入っていること）
--   select prosrc like '%p_include_dormant%' from pg_proc where proname = 'customer_list_summary';
--   -- 3) ACL（authenticated のみ・anon/public 不在）
--   select p.proname, r.rolname from pg_proc p
--    join aclexplode(p.proacl) a on true
--    join pg_roles r on r.oid = a.grantee
--    where p.proname = 'customer_list_summary'
--    order by r.rolname;
--   -- 4) PostgREST スキーマキャッシュ更新
--   notify pgrst, 'reload schema';
--   -- 5) 動作アンカー（JWT が要るため SQL Editor では不可）: verify 段（後続コミット）で実測。

begin;

-- 旧シグネチャ drop（overload 防止・mig0029 前例）
drop function if exists public.customer_list_summary(uuid);

create or replace function public.customer_list_summary(
  p_store_id uuid default null::uuid,
  p_include_dormant boolean default false
)
 returns table(customer_id uuid, name text, furigana text, cast_id uuid, is_active boolean, visits integer, last_visit timestamp with time zone, total_spend bigint, active_bottles integer, open_receivable bigint, days_since integer, churn_tier text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_store uuid := public.auth_store_id();
  v_cast  uuid := public.auth_cast_id();
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  return query
  with visible as (
    select cu.*
    from public.customers cu
    where cu.org_id = v_org
      and (v_role = 'owner' or cu.store_id = v_store)           -- 店スコープ
      and (
        v_role in ('owner','manager')
        or (v_role = 'staff' and public.auth_staff_can_crm())
        or (v_role = 'cast'  and cu.cast_id = v_cast)            -- 担当客のみ
      )
      and (p_store_id is null or cu.store_id = p_store_id)       -- owner の店絞り込み任意
      and (cu.is_active or (p_include_dormant and v_role <> 'cast'))  -- 休眠込みは owner/manager のみ・cast には返さない
  ),
  agg as (
    select
      v.id, v.name, v.furigana, v.cast_id, v.is_active,
      (select count(*)::int from public.checks c
         where c.customer_id = v.id and c.status = 'closed') as visits,
      (select max(c.started_at) from public.checks c
         where c.customer_id = v.id and c.status = 'closed') as last_visit,
      (select coalesce(sum(c.total), 0)::bigint from public.checks c
         where c.customer_id = v.id and c.status = 'closed') as total_spend,
      (select count(*)::int from public.bottle_keeps b
         where b.customer_id = v.id and b.status = 'active') as active_bottles,
      (select coalesce(sum(r.amount), 0)::bigint from public.receivables r
         where r.customer_id = v.id and r.status = 'open') as open_receivable
    from visible v
  )
  select
    a.id, a.name, a.furigana, a.cast_id, a.is_active,
    a.visits, a.last_visit, a.total_spend, a.active_bottles, a.open_receivable,
    case when a.last_visit is null then null
         else (current_date - a.last_visit::date) end as days_since,
    case
      when a.last_visit is null then 'none'
      when (current_date - a.last_visit::date) >= 60 then 'high'
      when (current_date - a.last_visit::date) >= 30 then 'mid'
      else 'none'
    end as churn_tier
  from agg a
  order by a.last_visit desc nulls last;
end $function$;

-- grant 再付与（drop で消滅・mig0023 と同状態へ再現）
revoke all on function public.customer_list_summary(uuid, boolean) from public, anon;
grant execute on function public.customer_list_summary(uuid, boolean) to authenticated;

commit;
