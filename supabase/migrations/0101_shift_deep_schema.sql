-- =============================================================
-- mig0101_shift_deep_schema.sql（SD設計書v1・スキーマ編）
-- 対象: NOX dev (hiqbfagmkrdpmlqhkmsu) → 将来本番手貼り
-- 取扱: 非冪等扱い＝本番手貼り1回（記述自体は再実行安全形だが規約上1回）
-- 手順: 新規タブ→全文貼付→Ctrl+A→Run（教訓18）
-- 適用後に別途単発: notify pgrst, 'reload schema';
-- =============================================================

-- ▼貼り先・前提証明（不一致なら即例外＝以降は実行されない）
do $$
begin
  if to_regclass('public.casts') is null
     or to_regclass('public.receipt_issues') is null then
    raise exception 'WRONG PROJECT: NOX dev ではない（casts/receipt_issues 不在）';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='shifts'
                   and column_name='wish_id') then
    raise exception 'PREREQ: mig0008 相当未適用（shifts.wish_id 不在）';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='staffing_needs'
                   and column_name='from_min') then
    raise exception 'PREREQ: mig0095 未適用（staffing_needs.from_min 不在）';
  end if;
  if to_regclass('public.shift_periods') is not null then
    raise exception 'ALREADY: shift_periods 既存（再実行の疑い・中止）';
  end if;
end $$;

begin;

-- -------------------------------------------------------------
-- 1) shifts.status CHECK 拡張: planned / proposed / confirmed（裁定①）
--    4段対応: 希望=shift_wishes → 管理者確認=planned →
--             キャスト確認=proposed → 確定=confirmed
--    給与分母は confirmed のみ（SD-4・collect.ts 不変）
-- -------------------------------------------------------------
alter table public.shifts drop constraint if exists shifts_status_check;
alter table public.shifts add constraint shifts_status_check
  check (status = any (array['planned'::text,'proposed'::text,'confirmed'::text]));

-- -------------------------------------------------------------
-- 2) shifts.source（manual|auto・SD-8: auto のみ一括取消の前提）
-- -------------------------------------------------------------
alter table public.shifts add column if not exists source text not null default 'manual';
alter table public.shifts drop constraint if exists shifts_source_check;
alter table public.shifts add constraint shifts_source_check
  check (source = any (array['manual'::text,'auto'::text]));

-- -------------------------------------------------------------
-- 3) shift_periods（計画ライフサイクル・裁定②）
--    status: draft(下書き)→open(募集中)→closed(締切)→published(公開)
--    RLS は staffing_needs 型（cast は0行＝管理側の概念）
-- -------------------------------------------------------------
create table if not exists public.shift_periods (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id),
  store_id      uuid not null references public.stores(id),
  start_date    date not null,
  end_date      date not null,
  wish_deadline date,
  status        text not null default 'draft',
  created_by    uuid not null references public.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint shift_periods_range_chk  check (start_date <= end_date),
  constraint shift_periods_status_chk
    check (status = any (array['draft'::text,'open'::text,'closed'::text,'published'::text]))
);
create index if not exists shift_periods_org_idx         on public.shift_periods (org_id);
create index if not exists shift_periods_store_start_idx on public.shift_periods (store_id, start_date);
drop trigger if exists shift_periods_touch_updated_at on public.shift_periods;
create trigger shift_periods_touch_updated_at
  before update on public.shift_periods
  for each row execute function public.touch_updated_at();
alter table public.shift_periods enable row level security;
drop policy if exists shift_periods_select on public.shift_periods;
create policy shift_periods_select on public.shift_periods
  for select to authenticated
  using ( org_id = public.auth_org_id()
          and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
          and public.auth_role() <> 'cast' );
revoke all on public.shift_periods from public, anon, authenticated;
grant select on public.shift_periods to authenticated;

-- -------------------------------------------------------------
-- 4) shift_rules（店舗単位・貪欲法 鍵①「最低月間時間未達」の源・裁定①）
--    null = 無制限
-- -------------------------------------------------------------
create table if not exists public.shift_rules (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id),
  store_id        uuid not null references public.stores(id),
  max_consec_days integer,
  min_month_min   integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint shift_rules_store_key    unique (store_id),
  constraint shift_rules_consec_chk   check (max_consec_days is null or max_consec_days > 0),
  constraint shift_rules_monthmin_chk check (min_month_min  is null or min_month_min  > 0)
);
create index if not exists shift_rules_org_idx on public.shift_rules (org_id);
drop trigger if exists shift_rules_touch_updated_at on public.shift_rules;
create trigger shift_rules_touch_updated_at
  before update on public.shift_rules
  for each row execute function public.touch_updated_at();
alter table public.shift_rules enable row level security;
drop policy if exists shift_rules_select on public.shift_rules;
create policy shift_rules_select on public.shift_rules
  for select to authenticated
  using ( org_id = public.auth_org_id()
          and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
          and public.auth_role() <> 'cast' );
revoke all on public.shift_rules from public, anon, authenticated;
grant select on public.shift_rules to authenticated;

-- -------------------------------------------------------------
-- 5) shifts.period_id（auto 入替/取消の削除スコープ・null=期間外/従来行）
-- -------------------------------------------------------------
alter table public.shifts add column if not exists period_id uuid references public.shift_periods(id);
create index if not exists shifts_period_idx on public.shifts (period_id) where period_id is not null;

commit;

-- ▼末尾診断（Run の表示がこれ・期待値をコメント併記）
select
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname='shifts_status_check')                 as status_check,     -- planned/proposed/confirmed
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname='shifts_source_check')                 as source_check,     -- manual/auto
  to_regclass('public.shift_periods')                    as periods,          -- not null
  to_regclass('public.shift_rules')                      as rules,            -- not null
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='shifts'
      and column_name in ('source','period_id'))         as shifts_new_cols,  -- 2
  (select count(*) from pg_policies
    where tablename in ('shift_periods','shift_rules'))  as new_policies,     -- 2
  (select string_agg(privilege_type, ',' order by privilege_type)
     from information_schema.role_table_grants
    where table_name='shift_periods' and grantee='authenticated')
                                                         as periods_auth,     -- SELECT のみ
  (select string_agg(privilege_type, ',' order by privilege_type)
     from information_schema.role_table_grants
    where table_name='shift_rules' and grantee='authenticated')
                                                         as rules_auth;       -- SELECT のみ
