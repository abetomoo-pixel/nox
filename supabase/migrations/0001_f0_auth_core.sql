-- 0001_f0_auth_core: F0 土台 — コアテーブル（orgs/stores/users/memberships/casts）
--                    ＋ 認可ヘルパー（auth_org_id/auth_role/auth_store_id/auth_cast_id）＋ RLS
--
-- 翻訳元（BANZEN makanai-shift）:
--  - 0002_phase1_rls.sql … ヘルパー4本の実定義（language sql stable security definer set search_path=public）
--                          ＋ SELECT ポリシーの型。tenant→org / hq→owner / staff_id→cast_id に置換。
--  - 0025_rpc_anon_guard_critical.sql … revoke は public だけでは不足（anon に直 grant される）
--                          ＝ revoke from public, anon を最初から適用。
--
-- 方針:
--  - 認可の真実は memberships（user × store × role の多対多）。
--    「1ユーザー1アクティブ」は部分ユニークインデックスで担保（案A）。
--    F4 のマルチ店舗切替は本インデックスの drop ＋ ヘルパー差し替えのみで拡張（スキーマ変更なし）。
--  - ヘルパーは SECURITY DEFINER（RLS バイパス）＝ポリシーから呼んでも無限再帰しない。
--  - 書き込み(INSERT/UPDATE/DELETE)ポリシーは作らない＝クライアント直書き不可。
--    投入は service キー（seed/管理）または後続フェーズの SECURITY DEFINER RPC。
--  - UUID は gen_random_uuid()（core）。pgcrypto は使わない。
--  - real_name/birthday/mynumber は casts に置かない（F2b で cast_sensitive に分離・閲覧RPC＋アクセスログ）。
--
-- 適用後の検証（"Success" 表示だけを信用しない）:
--   select proname, prosrc from pg_proc
--    where proname in ('auth_org_id','auth_role','auth_store_id','auth_cast_id');
--   select tablename, policyname from pg_policies where schemaname='public';

begin;

-- ── 共通: updated_at 自動更新 ────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── orgs（運営会社＝BANZEN の tenants）──────────────────────
create table if not exists public.orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  plan       text not null default 'early'  check (plan in ('early','standard','premium')),
  status     text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── stores ───────────────────────────────────────────────────
create table if not exists public.stores (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id),
  name          text not null,
  short         text,
  open_time     text,
  settings_json jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists stores_org_id_idx on public.stores (org_id);

-- ── users（ログインユーザー。cast も user を持つ）────────────
create table if not exists public.users (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id),
  auth_user_id uuid not null unique,          -- Supabase Auth の uid
  email        text not null,
  name         text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, email)
);
create index if not exists users_org_id_idx on public.users (org_id);

-- ── memberships（認可の真実: user × store × role 多対多）─────
-- 退職者は is_active=false で即時失効（ヘルパーが is_active のみ引くため）。
create table if not exists public.memberships (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id),
  store_id   uuid not null references public.stores(id),
  role       text not null check (role in ('owner','manager','staff','cast')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, store_id)                  -- 同一店の重複所属を禁止
);
create index if not exists memberships_user_id_idx  on public.memberships (user_id);
create index if not exists memberships_store_id_idx on public.memberships (store_id);
-- 案A: 1ユーザー1アクティブ membership。
-- F4 マルチ店舗切替時はこのインデックスを drop し、ヘルパーを「現在店選択」実装に差し替えるだけで拡張。
create unique index if not exists memberships_one_active_per_user_idx
  on public.memberships (user_id) where is_active;

-- ── casts（キャスト＝業務データ。源氏名のみ・センシティブは F2b で分離）──
create table if not exists public.casts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id),
  store_id   uuid not null references public.stores(id),
  user_id    uuid references public.users(id), -- cast がログインする場合の紐付け
  name       text not null,                    -- 源氏名
  kind       text,
  employment text check (employment in ('委託','雇用')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists casts_org_id_idx   on public.casts (org_id);
create index if not exists casts_store_id_idx on public.casts (store_id);
create index if not exists casts_user_id_idx  on public.casts (user_id);
-- auth_cast_id() の一意性担保: 1ユーザーにつきアクティブな cast 行は1つ
create unique index if not exists casts_one_active_per_user_idx
  on public.casts (user_id) where is_active;

-- ── updated_at トリガ ─────────────────────────────────────────
drop trigger if exists orgs_touch_updated_at        on public.orgs;
drop trigger if exists stores_touch_updated_at      on public.stores;
drop trigger if exists users_touch_updated_at       on public.users;
drop trigger if exists memberships_touch_updated_at on public.memberships;
drop trigger if exists casts_touch_updated_at       on public.casts;
create trigger orgs_touch_updated_at        before update on public.orgs        for each row execute function public.touch_updated_at();
create trigger stores_touch_updated_at      before update on public.stores      for each row execute function public.touch_updated_at();
create trigger users_touch_updated_at       before update on public.users       for each row execute function public.touch_updated_at();
create trigger memberships_touch_updated_at before update on public.memberships for each row execute function public.touch_updated_at();
create trigger casts_touch_updated_at       before update on public.casts       for each row execute function public.touch_updated_at();

-- ── 認可ヘルパー（BANZEN 0002 の型を memberships 経由に翻訳）──
-- SECURITY DEFINER＝RLS バイパス＝ポリシーから呼んでも無限再帰しない。
-- 無効ユーザー・無所属は null を返し、ポリシー側で fail-closed（0行）。

create or replace function public.auth_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select u.org_id
  from public.users u
  where u.auth_user_id = auth.uid() and u.is_active
$$;

create or replace function public.auth_role()
returns text language sql stable security definer set search_path = public as $$
  select m.role
  from public.memberships m
  join public.users u on u.id = m.user_id
  where u.auth_user_id = auth.uid() and u.is_active and m.is_active
$$;

create or replace function public.auth_store_id()
returns uuid language sql stable security definer set search_path = public as $$
  select m.store_id
  from public.memberships m
  join public.users u on u.id = m.user_id
  where u.auth_user_id = auth.uid() and u.is_active and m.is_active
$$;

create or replace function public.auth_cast_id()
returns uuid language sql stable security definer set search_path = public as $$
  select c.id
  from public.casts c
  join public.users u on u.id = c.user_id
  where u.auth_user_id = auth.uid() and u.is_active and c.is_active
$$;

-- ── 二重防御: revoke は public と anon の両方（0025 教訓）─────
revoke execute on function public.auth_org_id()   from public, anon;
revoke execute on function public.auth_role()     from public, anon;
revoke execute on function public.auth_store_id() from public, anon;
revoke execute on function public.auth_cast_id()  from public, anon;
revoke execute on function public.touch_updated_at() from public, anon;

grant execute on function public.auth_org_id()   to authenticated;
grant execute on function public.auth_role()     to authenticated;
grant execute on function public.auth_store_id() to authenticated;
grant execute on function public.auth_cast_id()  to authenticated;

-- テーブル側も anon を遮断（Supabase 既定 grant への防御。RLS の「ポリシー無し=0行」に依存しない二重化）
revoke all on table public.orgs        from anon;
revoke all on table public.stores      from anon;
revoke all on table public.users       from anon;
revoke all on table public.memberships from anon;
revoke all on table public.casts       from anon;

-- ── RLS 有効化 ────────────────────────────────────────────────
alter table public.orgs        enable row level security;
alter table public.stores      enable row level security;
alter table public.users       enable row level security;
alter table public.memberships enable row level security;
alter table public.casts       enable row level security;

-- ── orgs: 自 org のみ ─────────────────────────────────────────
drop policy if exists orgs_select on public.orgs;
create policy orgs_select on public.orgs
  for select to authenticated
  using (id = public.auth_org_id());

-- ── stores: owner=org 全店 / 他=自店のみ（標準店スコープの id 版）──
drop policy if exists stores_select on public.stores;
create policy stores_select on public.stores
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or id = public.auth_store_id())
  );

-- ── users: owner=org 全員 / 本人 / manager=自店に membership を持つ user ──
-- （manager 分岐の exists は memberships ポリシーを再帰参照しない前提で安全:
--   memberships ポリシーは users を参照しないこと＝相互参照は Postgres RLS の無限再帰）
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (
      public.auth_role() = 'owner'
      or auth_user_id = auth.uid()
      or (public.auth_role() = 'manager' and exists (
            select 1 from public.memberships m
            where m.user_id = users.id
              and m.store_id = public.auth_store_id()
              and m.is_active))
    )
  );

-- ── memberships: owner=org 全店分 / manager=自店分のみ ────────
-- staff/cast の自分行 self 参照は入れない（users との相互参照＝無限再帰になるため）。
-- 本人のロール/店は認可ヘルパー経由で取得する。
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select to authenticated
  using (
    (public.auth_role() = 'owner'
      and store_id in (select id from public.stores where org_id = public.auth_org_id()))
    or (public.auth_role() = 'manager' and store_id = public.auth_store_id())
  );

-- ── casts: 標準店スコープ ＋ cast プライバシー パターン1 ─────
-- cast は自分の行のみ（他キャストの行は 0 行）。F1f 以降の金額系テーブルはこの型を複製する。
drop policy if exists casts_select on public.casts;
create policy casts_select on public.casts
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (public.auth_role() <> 'cast' or id = public.auth_cast_id())
  );

commit;
