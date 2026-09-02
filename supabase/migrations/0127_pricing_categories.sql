-- =============================================================
-- mig0127: 裁定116-1 料金区分の器
--   pricing_categories 新設+pricing_rules.category_id 列(null=全区分)
--   +set_pricing_category RPC(唯一の書込経路)
--   底本: live 実測(pricing_rules policy/権限/set_pricing_rule 逐語・2026-09-02)
--   挙動変化ゼロ: resolve/check_open/set_pricing_rule は一切触らない(116-2 で原子的に対応)
--   冪等: 可(if not exists / drop policy if exists / create or replace)
-- =============================================================
begin;

-- [0] audit 新 action フェイルファスト(恒久注意・0125/0126 の型。NOX は現状 CHECK なし=素通り想定)
do $mig$
declare v_chk text;
begin
  select pg_get_constraintdef(c.oid) into v_chk
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname = 'audit_logs'
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%action%';
  if v_chk is not null then
    raise exception 'audit_logs.action CHECK が存在: % — 本 mig と同時更新が必要', v_chk;
  end if;
end
$mig$;

-- [1] 器: pricing_categories(設計書 v2 §4・命名は pricing_rules 実勢に整合=is_active/updated_at)
create table if not exists public.pricing_categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  store_id   uuid not null,
  name       text not null,                     -- 「通常」「初来店」等(trim 済み・1〜40字=RPC 権威)
  sort       integer not null default 100,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- active 内で同名禁止(部分 unique・RPC 側の事前チェックの backstop)
create unique index if not exists pricing_categories_store_name_active_uidx
  on public.pricing_categories (store_id, name)
  where is_active;

-- [2] RLS+権限: pricing_rules の鏡写し
--   select policy 1本(org ∧ (owner ∨ manager 自店))・書込 policy なし
--   テーブル権限: authenticated は select のみ・書込は definer RPC 経由に限定
--   ※新テーブルは Supabase が authenticated へ全権 auto-grant するため明示剥奪(恒久原則)
--   ※kiosk の区分リスト取得は kiosk 系 definer RPC で対応(116-2/UI 時)——本 policy は manage 系のみで足りる
alter table public.pricing_categories enable row level security;

drop policy if exists pricing_categories_select on public.pricing_categories;
create policy pricing_categories_select
  on public.pricing_categories for select to authenticated
  using ( (org_id = public.auth_org_id())
          and ( (public.auth_role() = 'owner')
                or (public.auth_role() = 'manager'
                    and store_id = public.auth_store_id()) ) );

revoke all on table public.pricing_categories from public, anon;
revoke insert, update, delete on table public.pricing_categories from authenticated;
grant  select on table public.pricing_categories to authenticated;

-- [3] pricing_rules.category_id(null=全区分。既存行は全て null=挙動不変)
--   物理削除は行わない運用(設計書 v2 §7)につき FK は素の restrict。
--   区分と rule の store 一致ガードは set_pricing_rule の 116-2 改修で RPC 権威として実装(本 mig では列のみ)
alter table public.pricing_rules
  add column if not exists category_id uuid null
  references public.pricing_categories(id);

-- [4] set_pricing_category(insert/update 兼用・停止=is_active false。物理削除 RPC は設けない)
create or replace function public.set_pricing_category(
  p_id uuid, p_store_id uuid, p_name text, p_sort integer, p_is_active boolean)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_id   uuid;
  v_before jsonb;
  v_after  jsonb;
  v_name   text;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or p_store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;

  -- 検証(RPC 権威・set_pricing_rule の型)
  v_name := nullif(btrim(p_name), '');
  if v_name is null or length(v_name) > 40 then raise exception 'bad name'; end if;
  if p_sort is null then raise exception 'bad sort'; end if;
  if p_is_active is null then raise exception 'bad active'; end if;
  if p_is_active and exists (
       select 1 from public.pricing_categories c
        where c.store_id = p_store_id and c.name = v_name and c.is_active
          and (p_id is null or c.id <> p_id)) then
    raise exception 'duplicate name';
  end if;

  if p_id is null then
    insert into public.pricing_categories (org_id, store_id, name, sort, is_active)
    values (v_org, p_store_id, v_name, p_sort, p_is_active)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(c) into v_before
      from public.pricing_categories c
     where c.id = p_id and c.org_id = v_org and c.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.pricing_categories
       set name = v_name, sort = p_sort, is_active = p_is_active,
           updated_at = now()
     where id = p_id;
    v_id := p_id;
  end if;

  select to_jsonb(c) into v_after
    from public.pricing_categories c where c.id = v_id;

  perform public.audit_log_write(
    p_action   => 'set_pricing_category',
    p_target   => 'pricing_categories:' || v_id::text,
    p_before   => v_before,
    p_after    => v_after,
    p_store_id => p_store_id
  );
  return v_id;
end $function$;

-- [5] 関数権限(新設定型)
revoke all on function public.set_pricing_category(uuid, uuid, text, integer, boolean)
  from public, anon;
grant execute on function public.set_pricing_category(uuid, uuid, text, integer, boolean)
  to authenticated;

commit;

-- [6] 検証バンドル(単一結果セット・全列 true で緑)
select
  (select c.relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relname='pricing_categories')          as rls_enabled,
  (select count(*) = 1 from pg_policy pol
     join pg_class c on c.oid = pol.polrelid
    where c.relname='pricing_categories')                                  as policy_exactly_one,
  (select count(*) = 1 from information_schema.columns
    where table_schema='public' and table_name='pricing_rules'
      and column_name='category_id' and is_nullable='YES')                 as rules_category_col,
  (select count(*) = 1 from pg_constraint con
     join pg_class c on c.oid = con.conrelid
    where c.relname='pricing_rules' and con.contype='f'
      and con.confrelid = 'public.pricing_categories'::regclass)           as rules_category_fk,
  (select count(*) = 1 from pg_indexes
    where schemaname='public' and tablename='pricing_categories'
      and indexname='pricing_categories_store_name_active_uidx')           as partial_unique_idx,
  not has_table_privilege('anon','public.pricing_categories','select')     as tbl_anon_no_select,
  has_table_privilege('authenticated','public.pricing_categories','select') as tbl_auth_select,
  not has_table_privilege('authenticated','public.pricing_categories','insert') as tbl_auth_no_insert,
  not has_table_privilege('authenticated','public.pricing_categories','update') as tbl_auth_no_update,
  not has_table_privilege('authenticated','public.pricing_categories','delete') as tbl_auth_no_delete,
  (select count(*) = 1
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='set_pricing_category'
      and p.prokind='f')                                                   as fn_exactly_one,
  (select position('duplicate name' in p.prosrc) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='set_pricing_category'
      and p.prokind='f')                                                   as prosrc_dup_guard,
  not has_function_privilege('anon',
      'public.set_pricing_category(uuid,uuid,text,integer,boolean)',
      'execute')                                                           as fn_anon_revoked,
  has_function_privilege('authenticated',
      'public.set_pricing_category(uuid,uuid,text,integer,boolean)',
      'execute')                                                           as fn_auth_granted;
