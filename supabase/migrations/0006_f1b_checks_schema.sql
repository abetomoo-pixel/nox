-- 0006_f1b_checks_schema: F1b — レジ会計スキーマ（checks/check_nominations/check_lines/payments/
--                          check_cast_backs/receivables）＋RLS＋部分ユニーク＋整合 CHECK
--                          （データモデル設計 §4 の mig0004 相当・スキーマ編。RPC は 0007 で提示）
--
-- 翻訳元（BANZEN makanai-shift）:
--  - 0032_pos_p2_checkout_schema.sql … orders/order_items/payments の型
--    （*_snapshot 列・サーバ計算列・status/void 監査列・SELECT のみ RLS・直書込ポリシー無し）。
--  - 0038_pos_p5_seats_schema.sql … 「1卓1 open 伝票」部分ユニーク＋pay_group。
--
-- 設計書との対応と逸脱（§2.4 へ同時追記・レビュー承認済み）:
--  ① checks.status に 'void' を追加（open/closed/void。確定後の訂正は金額書換でなく void 運用）。
--  ② check_cast_backs 新設（close 時に確定するキャスト別バック記録＝F2 給与入力の集計元・パターン1）。
--  ③ check_lines.back_snapshot（add_line 時点の商品バック設定コピー＝マスタ変更から凍結）。
--  ④ kind に 'charge' を追加（時間制 set/ext・指名料・同伴料等の料金行。モック実測）。
--  ⑤ total 定義: total = Σ_group Tp(Bx_g + round(Bx_g × service_rate%))。消費税計算なし（内税表記）。
--     サ料・丸めは pay_group 単位。カードTAX は請求に乗せない（F1e 日報の集計項目）。
--  ＋ receivables.check_id（void 連動用の来歴）と status 'voided'、ratio は整数重み ratio_weight。
--
-- 今回の決定3点（レビュー条件）:
--  【1】サ料・丸め設定のスナップショット: checks に service_rate/round_unit/round_mode を持ち、
--      check_open 時に stores.settings_json からコピー（既定 10 / 100 / 'down'＝モック初期値）。
--      recalc・close 判定は checks の凍結値のみを読む（open 中の店設定変更で total が動かない）。
--  【2】allocateQty のタイブレーク（0007 と精密仕様に同一定義）:
--      整数剰余 r_i = (qty × w_i) mod Σw を比較し、r_i 降順・同値は指名 position 昇順で残数配布。
--      浮動小数を使わない＝TS/SQL で決定的に同一結果。
--  【3】check_pay の残額検証は group 単位（amount ≤ hl(group) − paid(group)）。
--      close は全 group 充足（∀g: paid(g) ≥ hl(g)）で伝票単位1回。
--
-- cast プライバシー（認可設計 §2.3・新設時から適用）:
--  - checks / check_nominations / check_lines / payments / receivables = パターン2（cast 0行）。
--  - check_cast_backs = パターン1（cast は自分の行のみ＝「自分のバックだけ見える」経路）。
--
-- 書込はすべて 0007 の SECURITY DEFINER RPC 専任（直書込ポリシー無し・grant は SELECT のみ）。
--
-- 適用後の検証（"Success" 表示だけを信用しない）:
--   -- 1) テーブル6本の RLS 有効
--   select relname, relrowsecurity from pg_class
--    where relnamespace = 'public'::regnamespace
--      and relname in ('checks','check_nominations','check_lines','payments','check_cast_backs','receivables');
--   -- 2) ポリシー6本・すべて SELECT
--   select tablename, policyname, cmd from pg_policies
--    where schemaname = 'public'
--      and tablename in ('checks','check_nominations','check_lines','payments','check_cast_backs','receivables');
--   -- 3) 部分ユニーク2本（1卓1open・payments冪等キー）
--   select indexname, indexdef from pg_indexes
--    where schemaname = 'public'
--      and indexname in ('checks_one_open_per_seat','payments_idem_key_uidx');
--   -- 4) grant 面: verify:nox-grants G1（authenticated=SELECT のみ・スキーマ全体）が自動確認

begin;

-- ── checks（伝票）──────────────────────────────────────────────
create table if not exists public.checks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id),
  store_id       uuid not null references public.stores(id),
  seat_id        uuid not null references public.seats(id),
  status         text not null default 'open' check (status in ('open','closed','void')),
  started_at     timestamptz not null default now(),
  people         int  check (people is null or people > 0),
  nom_type       text not null default 'free' check (nom_type in ('hon','jonai','dohan','free')),
  customer_id    uuid,                             -- F3 customers 作成時に FK 追加
  merged_into    uuid references public.checks(id),-- 相席統合先（F1b は列のみ・統合 RPC は後続）
  total          int  not null default 0 check (total >= 0), -- サーバ計算（Σ_group hl・凍結設定で算出）
  -- 【決定1】open 時に stores.settings_json からスナップショット（recalc は凍結値のみを読む）
  service_rate   int  not null check (service_rate >= 0),
  round_unit     int  not null check (round_unit >= 1),
  round_mode     text not null check (round_mode in ('up','down','round')),
  close_idem_key uuid,
  closed_at      timestamptz,
  voided_at      timestamptz,
  voided_by      uuid references public.users(id),
  void_reason    text,
  created_by     uuid not null references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists checks_store_status_idx  on public.checks (store_id, status);
create index if not exists checks_store_started_idx on public.checks (store_id, started_at);
create index if not exists checks_org_idx           on public.checks (org_id);
-- 「1卓1 open 伝票」（BANZEN 0038 踏襲・競合時は再 SELECT で既存を返す＝0007）
create unique index if not exists checks_one_open_per_seat
  on public.checks (seat_id) where status = 'open';

-- ── check_nominations（指名・整数重みで分配）───────────────────
create table if not exists public.check_nominations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id),
  store_id     uuid not null references public.stores(id),
  check_id     uuid not null references public.checks(id),
  cast_id      uuid not null references public.casts(id),
  ratio_weight int  not null check (ratio_weight > 0), -- 整数重み（6:4 等・正規化は計算時）
  position     int  not null default 0,                -- 分配タイブレークの決定性（昇順）
  created_at   timestamptz not null default now(),
  unique (check_id, cast_id)
);
create index if not exists check_nominations_check_idx on public.check_nominations (check_id, position);
create index if not exists check_nominations_org_idx   on public.check_nominations (org_id);

-- ── check_lines（明細・スナップショット）───────────────────────
create table if not exists public.check_lines (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id),
  store_id            uuid not null references public.stores(id),
  check_id            uuid not null references public.checks(id),
  product_id          uuid references public.products(id),  -- charge/custom 行は null
  kind                text not null check (kind in ('set','time','charge','drink','champ','bottle','custom')),
  pay_group           text not null default 'A' check (length(pay_group) between 1 and 20),
  name_snapshot       text not null,                        -- add_line 時にサーバが products から書く
  unit_price_snapshot int  not null check (unit_price_snapshot >= 0),
  qty                 int  not null check (qty > 0),
  line_total          int  not null check (line_total >= 0), -- = unit_price_snapshot × qty（サーバ計算）
  back_snapshot       jsonb,                                 -- {back_mode,back_value,unit4,hon_pt}（商品行のみ）
  sort_order          int  not null default 0,
  created_at          timestamptz not null default now()
);
create index if not exists check_lines_check_idx on public.check_lines (check_id, sort_order);
create index if not exists check_lines_org_idx   on public.check_lines (org_id);

-- ── payments（入金・部分入金可・group 充当）────────────────────
create table if not exists public.payments (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id),
  store_id   uuid not null references public.stores(id),
  check_id   uuid not null references public.checks(id),
  pay_group  text not null default 'A' check (length(pay_group) between 1 and 20),
  method     text not null check (method in ('cash','card','ar','other')),
  amount     int  not null check (amount > 0),   -- 充当額（【決定3】group 残額以下を RPC で強制）
  tendered   int  check (tendered is null or tendered >= 0), -- 現金お預かり（釣銭=tendered−amount）
  idem_key   uuid,                                -- 冪等キー（同一キー再送は既存行を返す＝0007）
  by_user_id uuid not null references public.users(id),
  paid_at    timestamptz not null default now()
);
create index if not exists payments_check_idx on public.payments (check_id, pay_group);
create index if not exists payments_org_idx   on public.payments (org_id);
create unique index if not exists payments_idem_key_uidx
  on public.payments (idem_key) where idem_key is not null;

-- ── check_cast_backs（close 時確定のキャスト別バック・パターン1）──
create table if not exists public.check_cast_backs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id),
  store_id     uuid not null references public.stores(id),
  check_id     uuid not null references public.checks(id),
  cast_id      uuid not null references public.casts(id),
  drink_back   int  not null default 0 check (drink_back >= 0),
  champ_back   int  not null default 0 check (champ_back >= 0),
  bottle_back  int  not null default 0 check (bottle_back >= 0),
  hon_pt_alloc int  not null default 0 check (hon_pt_alloc >= 0), -- 伝票 nom_type='hon' のみ加算
  created_at   timestamptz not null default now(),
  unique (check_id, cast_id)
);
create index if not exists check_cast_backs_cast_idx on public.check_cast_backs (cast_id, created_at);
create index if not exists check_cast_backs_org_idx  on public.check_cast_backs (org_id);

-- ── receivables（売掛の器・check_pay(method='ar') が生成）───────
-- 売掛規制（風営法2025・上限/可否設定）は F3 ゲート（台帳）。
create table if not exists public.receivables (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id),
  store_id         uuid not null references public.stores(id),
  check_id         uuid references public.checks(id),      -- 来歴（void 連動用）
  customer_id      uuid,                                    -- F3 customers 作成時に FK 追加
  cast_id          uuid references public.casts(id),
  amount           int  not null check (amount > 0),
  deduct_from_cast boolean not null default false,
  status           text not null default 'open' check (status in ('open','collected','deducted','voided')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists receivables_store_status_idx on public.receivables (store_id, status);
create index if not exists receivables_org_idx          on public.receivables (org_id);

-- ── updated_at トリガ（可変テーブルのみ）───────────────────────
drop trigger if exists checks_touch_updated_at      on public.checks;
drop trigger if exists receivables_touch_updated_at on public.receivables;
create trigger checks_touch_updated_at      before update on public.checks      for each row execute function public.touch_updated_at();
create trigger receivables_touch_updated_at before update on public.receivables for each row execute function public.touch_updated_at();

-- ── RLS ────────────────────────────────────────────────────────
alter table public.checks            enable row level security;
alter table public.check_nominations enable row level security;
alter table public.check_lines       enable row level security;
alter table public.payments          enable row level security;
alter table public.check_cast_backs  enable row level security;
alter table public.receivables       enable row level security;

-- パターン2（cast 0行）: checks / check_nominations / check_lines / payments / receivables
drop policy if exists checks_select on public.checks;
create policy checks_select on public.checks
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and public.auth_role() <> 'cast'
  );

drop policy if exists check_nominations_select on public.check_nominations;
create policy check_nominations_select on public.check_nominations
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and public.auth_role() <> 'cast'
  );

drop policy if exists check_lines_select on public.check_lines;
create policy check_lines_select on public.check_lines
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and public.auth_role() <> 'cast'
  );

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and public.auth_role() <> 'cast'
  );

drop policy if exists receivables_select on public.receivables;
create policy receivables_select on public.receivables
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and public.auth_role() <> 'cast'
  );

-- パターン1（cast は自分の行のみ）: check_cast_backs
drop policy if exists check_cast_backs_select on public.check_cast_backs;
create policy check_cast_backs_select on public.check_cast_backs
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (public.auth_role() <> 'cast' or cast_id = public.auth_cast_id())
  );

-- ── grant 標準型（revoke all → SELECT のみ戻す）─────────────────
revoke all on table public.checks            from public, anon, authenticated;
revoke all on table public.check_nominations from public, anon, authenticated;
revoke all on table public.check_lines       from public, anon, authenticated;
revoke all on table public.payments          from public, anon, authenticated;
revoke all on table public.check_cast_backs  from public, anon, authenticated;
revoke all on table public.receivables       from public, anon, authenticated;
grant select on table public.checks            to authenticated;
grant select on table public.check_nominations to authenticated;
grant select on table public.check_lines       to authenticated;
grant select on table public.payments          to authenticated;
grant select on table public.check_cast_backs  to authenticated;
grant select on table public.receivables       to authenticated;

commit;
