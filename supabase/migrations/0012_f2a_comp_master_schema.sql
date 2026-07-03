-- 0012_f2a_comp_master_schema: F2a — 報酬設計マスタ6テーブル（comp_plans/cast_plan/cast_norms/
--                              deductions/penalty_config/custom_back_defs）＋RLS＋grant 標準型
--                              （スキーマ編。CRUD RPC は 0013 で提示）
--
-- 翻訳元:
--  - mock/nox-nightwork-app.html … K（待遇プラン: base/honBack/jonaiBack/dohanBack/salesSlide/pointSlide）・
--    sa（cast→plan 割当）・tm（プラン上書き）・ut（ノルマ days/dohan）・Li（控除 per=day/month/rate）・
--    zu（罰金 fineAbsent=10000/fineLate=3000/hoursPerShift=5）・ot（ノルマペナルティ設定）・
--    Xa/Vy（自由バック: basis/value/cond）。
--  - lib/nox/pay.ts の型（CompPlan/PlanOverride/Deduction/PenaltyConfig/NormPenaltyConfig/BackDef/MetricKey）
--    ＝payOf 入力の正本。DB 列はこの型と1対1（basis/cond.metric の値域は MetricKey リテラルを保存）。
--  - 精密仕様 §4.2 S7 … late_grace_min=10 / early_grace_min=30 / over_grace_min=90（店設定・既定値で
--    モック忠実）。punch-match.ts の config 供給元。
--
-- 設計書（データモデル §2.2）との対照と逸脱（§2.2 へ同時追記＝本 mig コミットに含める・F2a plan 承認済み）:
--  ① comp_plans の `slides_json` は pay.ts CompPlan と不整合のため不採用。sales_slide/point_slide の
--     jsonb 2列に確定（[{at,wage}×3]・深い形式検証は 0013 の RPC で実施・DB は array 型チェックのみ）。
--  ② penalty_config に §2.2 に無い4列を追加: hours_per_shift（シミュレーター基準時間）＋
--     grace 3列（late/early/over・#20 S7 裁定）。
--  ③ custom_back_defs は §2.2 に存在しない新設（payOf の customBackDefs 必須入力・モック Xa/Vy 実在・
--     F2a plan 裁定 D4a）。
--
-- 裁定の反映（F2a plan D1〜D5・2026-07-03）:
--  【D1a】comp_plans の cast 可視性＝自分に割当てられたプランのみ。
--       ポリシーに exists(cast_plan) サブクエリを使用。サブクエリは cast_plan の RLS を通るが、
--       cast_plan ポリシーは auth_* ヘルパーのみ参照（comp_plans を参照しない）＝一方向参照であり
--       users↔memberships 型の相互参照（無限再帰・禁止）には該当しない。
--       動作アンカー（castA1a=自プランのみ可視・castA1b=他人プラン0行・manager=全行・
--       退職 cast=0行・staffA1: cast_plan 0行）は verify:nox-rls の F2a 節で必須 assert（レビュー条件）。
--  【D2a】deductions / penalty_config / custom_back_defs＝パターン3（cast も可視・店スコープのみ）。
--       罰金・控除・バック規定は周知されるべき運用情報（労基法91条の周知の筋・F2f シミュレーター入力）。
--  【D5a】cast_plan は PK=cast_id（1 cast=1 plan・モック sa 忠実・変更履歴は audit_logs）。
--  【差し戻し裁定 2026-07-03】cast_plan は staff 0行（パターン1＋staff 遮断）。overrides_json は
--       個別賃金情報であり staff の業務（#24＝attendance_set のみ開放）に参照不要。
--       D6a（get_cast_sales の staff 拒否）と方向統一。owner/manager=全行・cast=自分行のみ・
--       staff=末尾条件で cast_id=null 比較→fail-closed で 0行。
--
-- cast プライバシー分類（認可設計 §2.3）:
--  - cast_plan = パターン1変形（cast は自分の行のみ＋staff 0行＝賃金条件の原本）
--  - cast_norms = パターン1（cast は自分の行のみ）
--  - comp_plans = パターン1変形（cast は割当プランのみ＝D1a）
--  - deductions / penalty_config / custom_back_defs = パターン3（共有・店スコープ）
--
-- 書込はすべて 0013 の SECURITY DEFINER RPC 専任（直書込ポリシー無し・grant は SELECT のみ）。
--
-- 適用後の検証（"Success" 表示だけを信用しない）:
--   -- 0) 貼り先証明（1行返れば正・エラーなら誤貼り先＝即中断）
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- 1) テーブル6本の RLS 有効（全行 relrowsecurity=t）
--   select relname, relrowsecurity from pg_class
--    where relnamespace = 'public'::regnamespace
--      and relname in ('comp_plans','cast_plan','cast_norms','deductions','penalty_config','custom_back_defs')
--    order by relname;
--   -- 2) ポリシー6本・すべて SELECT（cmd=SELECT のみ・書込ポリシーが無いこと）
--   select tablename, policyname, cmd from pg_policies
--    where schemaname = 'public'
--      and tablename in ('comp_plans','cast_plan','cast_norms','deductions','penalty_config','custom_back_defs')
--    order by tablename;
--   -- 3) D1a サブクエリの実測（comp_plans_select の qual に cast_plan への exists が入っていること）
--   select policyname, qual from pg_policies
--    where schemaname = 'public' and tablename = 'comp_plans';
--   -- 4) ACL 実測（6本とも authenticated=SELECT のみ・anon 無し）
--   select relname, coalesce(array_to_string(relacl, ','), '(default)') as acl
--     from pg_class
--    where relnamespace = 'public'::regnamespace
--      and relname in ('comp_plans','cast_plan','cast_norms','deductions','penalty_config','custom_back_defs')
--    order by relname;
--   -- 5) ユニーク2本＋cast_plan PK（1 cast=1 plan の物理保証）
--   select indexname from pg_indexes
--    where schemaname = 'public'
--      and indexname in ('cast_norms_cast_id_period_key','penalty_config_store_id_key','cast_plan_pkey');
--   -- 6) updated_at トリガ6本
--   select tgname from pg_trigger
--    where tgname like '%_touch_updated_at'
--      and tgrelid::regclass::text in ('comp_plans','cast_plan','cast_norms','deductions','penalty_config','custom_back_defs');
--   -- 7) D1a の動作アンカー（cast JWT が要るため SQL Editor では不可）: verify:nox-rls F2a 節で assert
--   -- 8) grant 面の恒久回帰: verify:nox-grants G1（authenticated=SELECT のみ・スキーマ全体）が自動確認

begin;

-- ── comp_plans（待遇プラン・パターン1変形＝D1a）─────────────────
create table if not exists public.comp_plans (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id),
  store_id     uuid not null references public.stores(id),
  name         text not null,
  base         int  not null default 0 check (base >= 0),          -- 保証時給
  hon_back     int  not null default 0 check (hon_back >= 0),      -- 円/本
  jonai_back   int  not null default 0 check (jonai_back >= 0),
  dohan_back   int  not null default 0 check (dohan_back >= 0),
  sales_slide  jsonb not null default '[]' check (jsonb_typeof(sales_slide) = 'array'), -- [{at,wage}×3]（昇順・深い検証は RPC）
  point_slide  jsonb not null default '[]' check (jsonb_typeof(point_slide) = 'array'),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists comp_plans_store_idx on public.comp_plans (store_id);
create index if not exists comp_plans_org_idx   on public.comp_plans (org_id);

-- ── cast_plan（キャスト×プラン割当・パターン1変形＝staff 0行・PK=cast_id＝D5a）──
create table if not exists public.cast_plan (
  cast_id        uuid primary key references public.casts(id),
  org_id         uuid not null references public.orgs(id),
  store_id       uuid not null references public.stores(id),
  plan_id        uuid not null references public.comp_plans(id),
  overrides_json jsonb not null default '{}' check (jsonb_typeof(overrides_json) = 'object'), -- base/各バック上書き（PlanOverride）
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists cast_plan_plan_idx  on public.cast_plan (plan_id);
create index if not exists cast_plan_store_idx on public.cast_plan (store_id);
create index if not exists cast_plan_org_idx   on public.cast_plan (org_id);

-- ── cast_norms（ノルマ・期間別・パターン1）──────────────────────
create table if not exists public.cast_norms (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id),
  store_id     uuid not null references public.stores(id),
  cast_id      uuid not null references public.casts(id),
  period       text not null check (period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'), -- 'YYYY-MM'（時刻規約と同じ text＋正規表現の流儀）
  days_target  int not null default 0 check (days_target >= 0),
  dohan_target int not null default 0 check (dohan_target >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (cast_id, period)
);
create index if not exists cast_norms_store_period_idx on public.cast_norms (store_id, period);
create index if not exists cast_norms_org_idx          on public.cast_norms (org_id);

-- ── deductions（控除マスタ・パターン3）──────────────────────────
create table if not exists public.deductions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id),
  store_id   uuid not null references public.stores(id),
  name       text not null,
  amount     int  not null default 0 check (amount >= 0), -- per='rate' のときは % 値（pay.ts Deduction と同解釈）
  per        text not null check (per in ('day','month','rate')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deductions_store_idx on public.deductions (store_id);
create index if not exists deductions_org_idx   on public.deductions (org_id);

-- ── penalty_config（罰金・ノルマペナルティ・突合閾値＝店1行・パターン3）──
-- 既定値はモック忠実（zu/ot）＋#20 S7（grace 3列）。数値は pay.ts PenaltyConfig/NormPenaltyConfig
-- ＋punch-match.ts PunchMatchConfig の供給元。
create table if not exists public.penalty_config (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id),
  store_id        uuid not null references public.stores(id),
  fine_absent     int not null default 10000 check (fine_absent >= 0),  -- 当欠罰金/回
  fine_late       int not null default 3000  check (fine_late >= 0),    -- 遅刻罰金/回
  hours_per_shift numeric(4,1) not null default 5.0 check (hours_per_shift > 0), -- シミュレーター基準時間（§2.2 追加列②）
  norm_on         boolean not null default true,
  norm_days_flat  int not null default 5000 check (norm_days_flat >= 0),
  norm_days_per   int not null default 2000 check (norm_days_per >= 0),
  norm_dohan_flat int not null default 3000 check (norm_dohan_flat >= 0),
  norm_dohan_per  int not null default 1500 check (norm_dohan_per >= 0),
  late_grace_min  int not null default 10 check (late_grace_min >= 0),  -- in−start がこれを超えたら late（#20 S7）
  early_grace_min int not null default 30 check (early_grace_min >= 0), -- close−out がこれを超えたら early（表示専用）
  over_grace_min  int not null default 90 check (over_grace_min >= 0),  -- out−close がこれを超えたら over（表示専用）
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (store_id)
);
create index if not exists penalty_config_org_idx on public.penalty_config (org_id);

-- ── custom_back_defs（自由設計バック・パターン3・§2.2 新設＝D4a）──
-- basis / cond_json.metric の値域は pay.ts MetricKey のリテラルをそのまま保存
--（'hon','jonai','dohan','days','sales','pt','champCnt','bottleCnt'｜basis のみ 'flat' 追加）。
create table if not exists public.custom_back_defs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id),
  store_id   uuid not null references public.stores(id),
  name       text not null,
  basis      text not null check (basis in ('hon','jonai','dohan','days','sales','pt','champCnt','bottleCnt','flat')),
  value      int  not null default 0 check (value >= 0), -- basis='sales' のときは % 値・'flat' は円・他は 円/回（pay.ts BackDef と同解釈）
  cond_json  jsonb check (cond_json is null or jsonb_typeof(cond_json) = 'object'), -- {metric,min}（達成条件・深い検証は RPC）
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists custom_back_defs_store_idx on public.custom_back_defs (store_id);
create index if not exists custom_back_defs_org_idx   on public.custom_back_defs (org_id);

-- ── updated_at トリガ ───────────────────────────────────────────
drop trigger if exists comp_plans_touch_updated_at       on public.comp_plans;
drop trigger if exists cast_plan_touch_updated_at        on public.cast_plan;
drop trigger if exists cast_norms_touch_updated_at       on public.cast_norms;
drop trigger if exists deductions_touch_updated_at       on public.deductions;
drop trigger if exists penalty_config_touch_updated_at   on public.penalty_config;
drop trigger if exists custom_back_defs_touch_updated_at on public.custom_back_defs;
create trigger comp_plans_touch_updated_at       before update on public.comp_plans       for each row execute function public.touch_updated_at();
create trigger cast_plan_touch_updated_at        before update on public.cast_plan        for each row execute function public.touch_updated_at();
create trigger cast_norms_touch_updated_at       before update on public.cast_norms       for each row execute function public.touch_updated_at();
create trigger deductions_touch_updated_at       before update on public.deductions       for each row execute function public.touch_updated_at();
create trigger penalty_config_touch_updated_at   before update on public.penalty_config   for each row execute function public.touch_updated_at();
create trigger custom_back_defs_touch_updated_at before update on public.custom_back_defs for each row execute function public.touch_updated_at();

-- ── RLS ────────────────────────────────────────────────────────
alter table public.comp_plans       enable row level security;
alter table public.cast_plan        enable row level security;
alter table public.cast_norms       enable row level security;
alter table public.deductions      enable row level security;
alter table public.penalty_config   enable row level security;
alter table public.custom_back_defs enable row level security;

-- パターン1変形（D1a）: comp_plans＝cast は自分に割当てられたプランのみ。
-- exists は cast_plan の RLS（パターン1）を通る＝cast は自分の割当行しか見えないため
-- 「自分の plan_id と一致する行」だけが true になる。一方向参照（再帰なし）。
drop policy if exists comp_plans_select on public.comp_plans;
create policy comp_plans_select on public.comp_plans
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (
      public.auth_role() <> 'cast'
      or exists (
        select 1 from public.cast_plan cp
        where cp.cast_id = public.auth_cast_id()
          and cp.plan_id = comp_plans.id
      )
    )
  );

-- パターン1変形（cast は自分の行のみ＋staff 0行＝差し戻し裁定）: cast_plan
-- staff は末尾条件に落ち、auth_cast_id()=null との比較で fail-closed＝0行。
drop policy if exists cast_plan_select on public.cast_plan;
create policy cast_plan_select on public.cast_plan
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (public.auth_role() in ('owner','manager') or cast_id = public.auth_cast_id())
  );

-- パターン1（cast は自分の行のみ）: cast_norms
drop policy if exists cast_norms_select on public.cast_norms;
create policy cast_norms_select on public.cast_norms
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (public.auth_role() <> 'cast' or cast_id = public.auth_cast_id())
  );

-- パターン3（共有・店スコープのみ＝D2a）: deductions / penalty_config / custom_back_defs
drop policy if exists deductions_select on public.deductions;
create policy deductions_select on public.deductions
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
  );

drop policy if exists penalty_config_select on public.penalty_config;
create policy penalty_config_select on public.penalty_config
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
  );

drop policy if exists custom_back_defs_select on public.custom_back_defs;
create policy custom_back_defs_select on public.custom_back_defs
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
  );

-- ── grant 標準型（revoke all → SELECT のみ戻す）─────────────────
revoke all on table public.comp_plans       from public, anon, authenticated;
revoke all on table public.cast_plan        from public, anon, authenticated;
revoke all on table public.cast_norms       from public, anon, authenticated;
revoke all on table public.deductions       from public, anon, authenticated;
revoke all on table public.penalty_config   from public, anon, authenticated;
revoke all on table public.custom_back_defs from public, anon, authenticated;
grant select on table public.comp_plans       to authenticated;
grant select on table public.cast_plan        to authenticated;
grant select on table public.cast_norms       to authenticated;
grant select on table public.deductions       to authenticated;
grant select on table public.penalty_config   to authenticated;
grant select on table public.custom_back_defs to authenticated;

commit;
