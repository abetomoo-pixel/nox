-- mig0114: C1-1 報酬モデル v2 の器（裁定86/89/93・設計書 docs/NOX_C12設計書v1.1.md §6-1）
-- 手貼り1回。再適用可（if not exists・DO ブロック冪等ガード・create or replace・ACL 毎回明示）
-- 内容:
--   1) comp_plans: dohan_back_mode/dohan_back_rate を追加し hon/jonai と対称化
--      （mode/rate/pair の3 CHECK は hon 系と同型。裁定86-②の rate 解錠ガードは
--      v2 RPC 側＝現行 RPC はこの列を書かない＝全行 default per_count のまま）
--   2) comp_plan_components 新設（裁定86-①・行型・v2.0 kind 2種）。
--      RLS は comp_plans_select（mig0105）の qual を継承・grants は新テーブル規約
--   3) cast_plan の期間化（裁定86-③・裁定93=部分 unique＋RPC ガード方式）:
--      id 新設→PK を cast_id 単独から id へ付替え・valid_from/valid_to 追加・
--      既存行 backfill（valid_from=適用日・valid_to=null）・部分 unique 2本
--      （現行行 cast_id 一意 where valid_to is null／(cast_id, valid_from) 一意）
--   4) set_cast_plan 書換（PK 変更追随・意味論は現行と同値）:
--      baseline=live_c1.sql（全体 sha b7d10efeec5b688b309b95c42b3d608f8e4072571a7fdaaa39765be0d3fc89aa）
--      の逐語。差分は on conflict の推論先を部分 unique（cast_id where valid_to is null）へ、
--      audit の before/after select に and valid_to is null を足した2点のみ
--      ＝「現在行の上書き」という現行意味論を維持（履歴の生成は挙動段の v2 RPC）
--   5) stores.receivable_policy 新設（裁定89・既定 customer_only=現行運用と同値）
-- スコープ注記: 設計書 §6-1 の「控除種別の器」は C1-2 へ分離（裁定94・対象テーブルの
--   live 未取得のため記憶で書かない）。
-- 不変: 全て default=現行挙動。comp_plans 既存17列不触・payroll fixture（mkPlan 2行）は
--   mode 列未指定＝default per_count のまま。玲奈 golden 5931/125802 は TS リテラル
--   fixture＝DB 非経由（live_c1.sql §4 実測）。golden 6値（5931/125802/55233/64/64/52）
--   不変が受け入れ条件。money 三面鏡不触。
-- 正本: docs/NOX_C12設計書v1.1.md・docs/NOX_裁定台帳.md 裁定86/89/93/94
-- 単一トランザクション
-- 検証クエリ（適用後に別実行）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.cast_plan'::regclass order by 1;
--     -- 期待: cast_plan_pkey が PRIMARY KEY (id)・旧 (cast_id) PK が無い
--   select indexname from pg_indexes
--    where schemaname='public' and tablename='cast_plan' order by 1;
--     -- 期待: cast_plan_current_uidx / cast_plan_cast_from_uidx を含む
--   select count(*) as rows_all, count(*) filter (where valid_to is null) as rows_current
--     from public.cast_plan;
--     -- 期待: rows_all = rows_current（既存行は全て現在行として backfill）
--   select conname from pg_constraint where conrelid='public.comp_plans'::regclass
--      and conname like '%dohan_back_%' order by 1;
--     -- 期待: dohan_back_mode_check / dohan_back_pair_check / dohan_back_rate_check（3行）
--   select polname, roles, cmd from pg_policies
--    where schemaname='public' and tablename='comp_plan_components';
--     -- 期待: comp_plan_components_select（SELECT・authenticated）1行
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema='public' and table_name='comp_plan_components'
--      and grantee in ('anon','authenticated') order by 1,2;
--     -- 期待: authenticated=SELECT の1行のみ（anon 0行）
--   select column_name, column_default from information_schema.columns
--    where table_schema='public' and table_name='stores' and column_name='receivable_policy';
--     -- 期待: 1行・default 'customer_only'
--   select proname from pg_proc where proname='set_cast_plan' and prosrc like '%valid_to%';
--     -- 期待: 1行
--   notify pgrst, 'reload schema';

begin;
select 'nox-project-proof' as proof, count(*) as orgs from public.orgs;

-- ===== 1) comp_plans: dohan 対称化 =====
alter table public.comp_plans
  add column if not exists dohan_back_mode text not null default 'per_count',
  add column if not exists dohan_back_rate integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='comp_plans_dohan_back_mode_check') then
    alter table public.comp_plans add constraint comp_plans_dohan_back_mode_check
      check (dohan_back_mode in ('per_count','rate'));
  end if;
  if not exists (select 1 from pg_constraint where conname='comp_plans_dohan_back_rate_check') then
    alter table public.comp_plans add constraint comp_plans_dohan_back_rate_check
      check (dohan_back_rate is null or (dohan_back_rate >= 0 and dohan_back_rate <= 100));
  end if;
  if not exists (select 1 from pg_constraint where conname='comp_plans_dohan_back_pair_check') then
    alter table public.comp_plans add constraint comp_plans_dohan_back_pair_check
      check ((dohan_back_mode = 'rate') = (dohan_back_rate is not null));
  end if;
end $$;

-- ===== 2) comp_plan_components 新設 =====
create table if not exists public.comp_plan_components (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id),
  store_id   uuid not null references public.stores(id),
  plan_id    uuid not null references public.comp_plans(id),
  kind       text not null check (kind in ('guarantee_min','achievement_bonus')),
  mode       text not null check (mode in ('amount','rate')),
  amount     bigint check (amount is null or amount >= 0),
  rate       integer check (rate is null or (rate >= 0 and rate <= 100)),
  params     jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  priority   integer not null default 100,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comp_plan_components_amount_pair_check check ((mode = 'amount') = (amount is not null)),
  constraint comp_plan_components_rate_pair_check   check ((mode = 'rate')   = (rate   is not null))
);

create index if not exists comp_plan_components_plan_idx
  on public.comp_plan_components (plan_id, priority);

-- 新テーブル規約: public/anon 全 revoke・authenticated は SELECT のみ（RLS ゲート）。
-- ★Supabase default privileges は authenticated/service_role へ全権を自動 grant する（教訓43 系）
revoke all on table public.comp_plan_components from public, anon;
revoke all on table public.comp_plan_components from authenticated;
grant select on table public.comp_plan_components to authenticated;

alter table public.comp_plan_components enable row level security;

-- RLS: comp_plans_select（mig0105）の qual を plan_id 参照で継承（裁定81 の可視範囲）
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname='public' and tablename='comp_plan_components'
                    and policyname='comp_plan_components_select') then
    create policy comp_plan_components_select on public.comp_plan_components
      for select to authenticated
      using (
        org_id = public.auth_org_id()
        and (
          public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and store_id = public.auth_store_id())
          or (public.auth_role() = 'cast' and store_id = public.auth_store_id()
              and exists (select 1 from public.cast_plan cp
                           where cp.cast_id = public.auth_cast_id()
                             and cp.plan_id = comp_plan_components.plan_id))
        )
      );
  end if;
end $$;

-- ===== 3) cast_plan の期間化（裁定93: 部分 unique＋RPC ガード） =====
alter table public.cast_plan
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists valid_from date not null default current_date,
  add column if not exists valid_to date;

do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conname='cast_plan_pkey'
     and conrelid='public.cast_plan'::regclass;
  if v_def = 'PRIMARY KEY (cast_id)' then
    alter table public.cast_plan drop constraint cast_plan_pkey;
    alter table public.cast_plan add constraint cast_plan_pkey primary key (id);
  end if;
end $$;

create unique index if not exists cast_plan_current_uidx
  on public.cast_plan (cast_id) where valid_to is null;
create unique index if not exists cast_plan_cast_from_uidx
  on public.cast_plan (cast_id, valid_from);

-- ===== 4) set_cast_plan 書換（PK 変更追随・現在行上書きの同値意味論） =====
CREATE OR REPLACE FUNCTION public.set_cast_plan(p_cast_id uuid, p_plan_id uuid, p_overrides jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast_org    uuid;
  v_cast_store  uuid;
  v_plan_org    uuid;
  v_plan_store  uuid;
  v_plan_active boolean;
  v_before      jsonb;
  v_after       jsonb;
  v_key         text;
  v_num         numeric;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- overrides 検証（②: キー制限＋値検証。null は {} と同義に正規化しない＝null 拒否）
  if p_overrides is null or jsonb_typeof(p_overrides) <> 'object' then raise exception 'bad overrides'; end if;
  for v_key in select jsonb_object_keys(p_overrides) loop
    if v_key not in ('base','honBack','jonaiBack','dohanBack',
                     'honBackMode','honBackRate','jonaiBackMode','jonaiBackRate') then
      raise exception 'bad overrides';
    end if;
    if v_key in ('honBackMode','jonaiBackMode') then
      -- ★mig0086: 方式キーは文字列2値
      if jsonb_typeof(p_overrides -> v_key) <> 'string'
         or (p_overrides ->> v_key) not in ('per_count','rate') then
        raise exception 'bad overrides';
      end if;
    else
      if jsonb_typeof(p_overrides -> v_key) <> 'number' then raise exception 'bad overrides'; end if;
      v_num := (p_overrides ->> v_key)::numeric;
      if v_num < 0 or v_num <> trunc(v_num) then raise exception 'bad overrides'; end if;
      -- ★mig0086: 率キーは 0..100
      if v_key in ('honBackRate','jonaiBackRate') and v_num > 100 then
        raise exception 'bad overrides';
      end if;
    end if;
  end loop;
  -- ★mig0086: 原子性（設計v1）＝mode だけ上書きして値が plan 側から来る合成を拒否。
  --   mode='rate' → rate 必須／mode='per_count' → 円/本値必須／rate 単独（mode なし・mode≠rate）拒否。
  if (p_overrides ? 'honBackMode') then
    if (p_overrides ->> 'honBackMode') = 'rate' and not (p_overrides ? 'honBackRate') then
      raise exception 'bad overrides';
    end if;
    if (p_overrides ->> 'honBackMode') = 'per_count' and not (p_overrides ? 'honBack') then
      raise exception 'bad overrides';
    end if;
  end if;
  if (p_overrides ? 'honBackRate')
     and (not (p_overrides ? 'honBackMode') or (p_overrides ->> 'honBackMode') <> 'rate') then
    raise exception 'bad overrides';
  end if;
  if (p_overrides ? 'jonaiBackMode') then
    if (p_overrides ->> 'jonaiBackMode') = 'rate' and not (p_overrides ? 'jonaiBackRate') then
      raise exception 'bad overrides';
    end if;
    if (p_overrides ->> 'jonaiBackMode') = 'per_count' and not (p_overrides ? 'jonaiBack') then
      raise exception 'bad overrides';
    end if;
  end if;
  if (p_overrides ? 'jonaiBackRate')
     and (not (p_overrides ? 'jonaiBackMode') or (p_overrides ->> 'jonaiBackMode') <> 'rate') then
    raise exception 'bad overrides';
  end if;
  -- cast の org/store 照合＋ロール判定（manager 以上・自店のみ）
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- plan の org/store 照合＋inactive 遮断（廃止プランへの新規割当は誤操作経路）
  -- 既存の cast_plan 行には触れない＝プラン廃止（is_active=false）で既割当は壊れない設計。
  select org_id, store_id, is_active into v_plan_org, v_plan_store, v_plan_active
    from public.comp_plans where id = p_plan_id;
  if v_plan_org is null or v_plan_org <> public.auth_org_id() or v_plan_store <> v_cast_store then
    raise exception 'forbidden';
  end if;
  if not v_plan_active then raise exception 'plan inactive'; end if;

  -- ★mig0114: 期間化後も意味論は「現在行（valid_to is null）の上書き」＝現行と同値。
  --   履歴行の生成（現在行を閉じて新期間を開く）は v2 RPC（挙動段）の責務。
  select to_jsonb(cp) into v_before from public.cast_plan cp
   where cp.cast_id = p_cast_id and cp.valid_to is null;
  insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json)
  values (p_cast_id, v_cast_org, v_cast_store, p_plan_id, p_overrides)
  on conflict (cast_id) where valid_to is null do update
    set plan_id = excluded.plan_id, overrides_json = excluded.overrides_json,
        store_id = excluded.store_id;
  select to_jsonb(cp) into v_after from public.cast_plan cp
   where cp.cast_id = p_cast_id and cp.valid_to is null;
  perform public.audit_log_write('set_cast_plan', 'cast_plan:' || p_cast_id::text, v_before, v_after, v_cast_store);
  return p_cast_id;
end $function$;

-- ===== 5) stores.receivable_policy（裁定89・既定=現行運用と同値） =====
alter table public.stores
  add column if not exists receivable_policy text not null default 'customer_only'
    check (receivable_policy in ('disabled','customer_only','cast_liability_allowed'));

commit;
-- ===== end mig0114 =====
