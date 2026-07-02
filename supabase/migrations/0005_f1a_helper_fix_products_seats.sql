-- 0005_f1a_helper_fix_products_seats: F1a — 方式A（auth_org_id を memberships join に差替）
--                ＋ 商品・席マスタ（products/seats/bottle_keeps/stock_logs）＋ 書込 RPC 3本
--                （データモデル設計 §4 の mig0003 相当。実装順により 0005 を付番）
--
-- 翻訳元（BANZEN makanai-shift）:
--  - 0030_pos_p1_menu_schema.sql … テーブル＋店スコープ SELECT RLS＋整合 CHECK の型。
--  - 0031_pos_p1_menu_rpc.sql … upsert RPC の二重防御5点（null guard・入力検証・
--    store の org 照合・hq/manager ロール判定・revoke/grant）。hq→owner に置換。
--    ※ BANZEN の auth_billing_writable() ゲートは NOX では F4（billing 導入）で追加。
--
-- 方式A（F0 セルフレビュー §3・レビュー承認済み）:
--  - auth_org_id() を users 単独参照から memberships join に差替。
--    退職（アクティブ membership ゼロ）で auth_org_id()=null → orgs/users 含む全テーブル 0行＝完全失効。
--    「認可の真実は memberships」に auth_org_id も揃える（他ヘルパー・全ポリシーは不変）。
--
-- products のバック関連カラム（出典明記・レビュー条件(2)）:
--  - データモデル設計 §2.3: type(drink/champ/bottle) / category / name / price / cost /
--    back_mode(unit/rate) / back_value / is_active。
--  - payOf 精密仕様 §2.2（計算の正本・モック抽出）で拡張:
--    back_mode の 'unit' は指名種別ごと単価＝'unit4'（hon/jonai/dohan/free）であるため
--    値名を 'unit4' とし、単価は unit4_json jsonb に持つ。rate モードは back_value=率(%)。
--    本指名商品pt（§0.1/§2.4 の pt 基礎）として hon_pt を追加。
--    → lib/nox/pay.ts の Product 型（productBackOf の入力）と1対1対応。
--  - 在庫数の現在値カラムは持たない（真実は stock_logs の Σdelta＝二重真実の回避。設計 §2.3 どおり）。
--
-- cast プライバシー（認可設計 §2.3）:
--  - products = パターン3（cast も見える・価格表）→ 標準店スコープのみ。
--  - seats / stock_logs = パターン2対象（レジ世界・cast 0行）→ auth_role() <> 'cast' を追加。
--  - bottle_keeps = §2.3 の明示列挙外だがレジ/顧客世界のため安全側でパターン2に分類。
--
-- 監査: 全書込 RPC（set_product / set_seat / product_stock_add）は本体処理後に
--       audit_log_write を perform（内部専用 wrapper の初実戦）。
--       原則「全書込 RPC は perform audit_log_write」に例外を作らない（レビュー指摘反映）:
--       stock_logs は manager 可視（パターン2）・audit_logs は owner 限定＝閲覧スコープが異なるため、
--       在庫操作（ボトル在庫は現金同等の監査対象）も owner の監査系列に載せる。
--       肥大が実測で問題になったら間引きを再判断。
--
-- 適用後の検証（"Success" 表示だけを信用しない）:
--   -- 1) 方式A: prosrc に memberships join が入っていること
--   select prosrc from pg_proc where proname = 'auth_org_id';
--   -- 2) 新テーブル4本の RLS 有効
--   select relname, relrowsecurity from pg_class
--    where relnamespace = 'public'::regnamespace
--      and relname in ('products','seats','bottle_keeps','stock_logs');
--   -- 3) ポリシー一覧（4本・すべて SELECT）
--   select tablename, policyname, cmd from pg_policies
--    where schemaname = 'public'
--      and tablename in ('products','seats','bottle_keeps','stock_logs');
--   -- 4) RPC 3本の存在と anon 遮断（anon が現れないこと）
--   select p.proname, r.rolname
--   from pg_proc p
--   join aclexplode(p.proacl) a on true
--   join pg_roles r on r.oid = a.grantee
--   where p.proname in ('set_product','set_seat','product_stock_add')
--   order by p.proname, r.rolname;
--   -- 5) grant 面（authenticated=SELECT のみ）: verify:nox-grants G1 が自動確認

begin;

-- ══════════════════════════════════════════════════════════════
-- ① 方式A: auth_org_id() を memberships join に差替（全ポリシー不変）
-- ══════════════════════════════════════════════════════════════
create or replace function public.auth_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select u.org_id
  from public.users u
  join public.memberships m on m.user_id = u.id and m.is_active
  where u.auth_user_id = auth.uid() and u.is_active
$$;
-- grant/revoke は 0001 の状態を維持（create or replace は ACL を保持する）。

-- ══════════════════════════════════════════════════════════════
-- ② テーブル4本（CLAUDE.md 標準型: create → RLS → revoke all → grant select）
-- ══════════════════════════════════════════════════════════════

-- ── products（パターン3: cast も見える価格表）─────────────────
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id),
  store_id    uuid not null references public.stores(id),
  type        text not null check (type in ('drink','champ','bottle')),
  category    text,
  name        text not null,
  price       int  not null check (price >= 0),
  cost        int  check (cost is null or cost >= 0),
  back_mode   text not null default 'rate' check (back_mode in ('rate','unit4')),
  back_value  int  check (back_value is null or back_value >= 0), -- rate モード時の率(%)
  unit4_json  jsonb,                                              -- unit4 モード時の {hon,jonai,dohan,free} 単価
  hon_pt      int  not null default 0 check (hon_pt >= 0),        -- 本指名商品pt（精密仕様 §0.1/§2.4）
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- 整合: モードに応じた必須値（RPC 検証と二段＝BANZEN 0030 の CHECK 思想）
  constraint products_rate_value_chk  check (back_mode <> 'rate'  or back_value is not null),
  constraint products_unit4_json_chk  check (back_mode <> 'unit4' or unit4_json is not null)
);
create index if not exists products_store_idx on public.products (store_id, type);
create index if not exists products_org_idx   on public.products (org_id);

-- ── seats（パターン2: レジ世界・cast 0行）─────────────────────
create table if not exists public.seats (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id),
  store_id    uuid not null references public.stores(id),
  name        text not null,
  kind        text check (kind in ('卓','カウンター','VIP')),
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists seats_store_idx on public.seats (store_id, sort_order);
create index if not exists seats_org_idx   on public.seats (org_id);

-- ── bottle_keeps（パターン2扱い・customer FK は customers 作成時の mig で追加）──
create table if not exists public.bottle_keeps (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id),
  store_id    uuid not null references public.stores(id),
  customer_id uuid,                                   -- F3 customers 作成時に FK 追加
  product_id  uuid not null references public.products(id),
  opened_at   timestamptz not null default now(),
  status      text not null default 'active' check (status in ('active','empty','removed')),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists bottle_keeps_store_idx on public.bottle_keeps (store_id, status);
create index if not exists bottle_keeps_org_idx   on public.bottle_keeps (org_id);

-- ── stock_logs（append-only・パターン2・在庫の真実＝Σdelta）───
create table if not exists public.stock_logs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id),
  store_id    uuid not null references public.stores(id),
  product_id  uuid not null references public.products(id),
  delta       int  not null check (delta <> 0),
  reason      text,
  by_user_id  uuid,                                   -- users.id（log 値・FK なし＝audit_logs 同型）
  at          timestamptz not null default now()
);
create index if not exists stock_logs_product_at_idx on public.stock_logs (product_id, at);
create index if not exists stock_logs_org_idx        on public.stock_logs (org_id);

-- ── updated_at トリガ（append-only の stock_logs には付けない）──
drop trigger if exists products_touch_updated_at     on public.products;
drop trigger if exists seats_touch_updated_at        on public.seats;
drop trigger if exists bottle_keeps_touch_updated_at on public.bottle_keeps;
create trigger products_touch_updated_at     before update on public.products     for each row execute function public.touch_updated_at();
create trigger seats_touch_updated_at        before update on public.seats        for each row execute function public.touch_updated_at();
create trigger bottle_keeps_touch_updated_at before update on public.bottle_keeps for each row execute function public.touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
alter table public.products     enable row level security;
alter table public.seats        enable row level security;
alter table public.bottle_keeps enable row level security;
alter table public.stock_logs   enable row level security;

-- products = パターン3（標準店スコープ・cast も自店の価格表を見る）
drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
  );

-- seats = パターン2（cast 0行）
drop policy if exists seats_select on public.seats;
create policy seats_select on public.seats
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and public.auth_role() <> 'cast'
  );

-- bottle_keeps = パターン2扱い（cast 0行）
drop policy if exists bottle_keeps_select on public.bottle_keeps;
create policy bottle_keeps_select on public.bottle_keeps
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and public.auth_role() <> 'cast'
  );

-- stock_logs = パターン2（cast 0行）・append-only（UPDATE/DELETE ポリシー無し）
drop policy if exists stock_logs_select on public.stock_logs;
create policy stock_logs_select on public.stock_logs
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and public.auth_role() <> 'cast'
  );

-- ── grant 標準型（revoke all → SELECT のみ戻す）────────────────
revoke all on table public.products     from public, anon, authenticated;
revoke all on table public.seats        from public, anon, authenticated;
revoke all on table public.bottle_keeps from public, anon, authenticated;
revoke all on table public.stock_logs   from public, anon, authenticated;
grant select on table public.products     to authenticated;
grant select on table public.seats        to authenticated;
grant select on table public.bottle_keeps to authenticated;
grant select on table public.stock_logs   to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ③ 書込 RPC 3本（二重防御・set_product / set_seat は audit_log_write を perform）
-- ══════════════════════════════════════════════════════════════

-- ── set_product（upsert・owner=全店 / manager=自店）────────────
create or replace function public.set_product(
  p_id         uuid,
  p_store_id   uuid,
  p_type       text,
  p_category   text,
  p_name       text,
  p_price      int,
  p_cost       int,
  p_back_mode  text,
  p_back_value int,
  p_unit4      jsonb,
  p_hon_pt     int,
  p_is_active  boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
  v_key    text;
  v_num    numeric;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  -- 入力検証（DB CHECK と二段）
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_type not in ('drink','champ','bottle') then raise exception 'bad type'; end if;
  if p_price is null or p_price < 0 then raise exception 'bad price'; end if;
  if p_cost is not null and p_cost < 0 then raise exception 'bad cost'; end if;
  if p_back_mode not in ('rate','unit4') then raise exception 'bad back_mode'; end if;
  if p_back_mode = 'rate' and (p_back_value is null or p_back_value < 0) then raise exception 'bad back_value'; end if;
  -- unit4 は F2 給与計算の入力素材＝入口で値検証（4キーとも number・0以上・整数）
  if p_back_mode = 'unit4' then
    if p_unit4 is null then raise exception 'bad unit4'; end if;
    foreach v_key in array array['hon','jonai','dohan','free'] loop
      if jsonb_typeof(p_unit4 -> v_key) is distinct from 'number' then raise exception 'bad unit4'; end if;
      v_num := (p_unit4 ->> v_key)::numeric;
      if v_num < 0 or v_num <> trunc(v_num) then raise exception 'bad unit4'; end if;
    end loop;
  end if;
  if p_hon_pt is null or p_hon_pt < 0 then raise exception 'bad hon_pt'; end if;
  -- store の org 照合＋ロール判定（クロステナント遮断）
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if p_id is null then
    insert into public.products
      (org_id, store_id, type, category, name, price, cost, back_mode, back_value, unit4_json, hon_pt, is_active)
    values
      (public.auth_org_id(), p_store_id, p_type, p_category, trim(p_name), p_price, p_cost,
       p_back_mode, p_back_value, p_unit4, p_hon_pt, coalesce(p_is_active, true))
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(p) into v_before from public.products p
      where p.id = p_id and p.org_id = public.auth_org_id() and p.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.products
      set type = p_type, category = p_category, name = trim(p_name), price = p_price, cost = p_cost,
          back_mode = p_back_mode, back_value = p_back_value, unit4_json = p_unit4,
          hon_pt = p_hon_pt, is_active = coalesce(p_is_active, true)
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(p) into v_after from public.products p where p.id = v_id;
  perform public.audit_log_write('set_product', 'products:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $$;
revoke execute on function public.set_product(uuid, uuid, text, text, text, int, int, text, int, jsonb, int, boolean) from public, anon;
grant  execute on function public.set_product(uuid, uuid, text, text, text, int, int, text, int, jsonb, int, boolean) to authenticated;

-- ── set_seat（upsert・owner=全店 / manager=自店）───────────────
create or replace function public.set_seat(
  p_id         uuid,
  p_store_id   uuid,
  p_name       text,
  p_kind       text,
  p_sort_order int,
  p_is_active  boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 40 then raise exception 'bad name'; end if;
  if p_kind is not null and p_kind not in ('卓','カウンター','VIP') then raise exception 'bad kind'; end if;
  if p_sort_order is null or p_sort_order < 0 then raise exception 'bad sort'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if p_id is null then
    insert into public.seats (org_id, store_id, name, kind, sort_order, is_active)
    values (public.auth_org_id(), p_store_id, trim(p_name), p_kind, p_sort_order, coalesce(p_is_active, true))
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(s) into v_before from public.seats s
      where s.id = p_id and s.org_id = public.auth_org_id() and s.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.seats
      set name = trim(p_name), kind = p_kind, sort_order = p_sort_order, is_active = coalesce(p_is_active, true)
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(s) into v_after from public.seats s where s.id = v_id;
  perform public.audit_log_write('set_seat', 'seats:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $$;
revoke execute on function public.set_seat(uuid, uuid, text, text, int, boolean) from public, anon;
grant  execute on function public.set_seat(uuid, uuid, text, text, int, boolean) to authenticated;

-- ── product_stock_add（在庫増減・append-only への唯一の書込経路）──
-- 原則どおり audit_log_write も perform（stock_logs=manager 可視／audit_logs=owner 限定の監査系列）。
create or replace function public.product_stock_add(
  p_product_id uuid,
  p_delta      int,
  p_reason     text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org   uuid;
  v_store uuid;
  v_actor uuid;
  v_id    uuid;
  v_after jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'bad delta'; end if;
  select org_id, store_id into v_org, v_store from public.products where id = p_product_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.stock_logs (org_id, store_id, product_id, delta, reason, by_user_id)
  values (v_org, v_store, p_product_id, p_delta, p_reason, v_actor)
  returning id into v_id;
  select to_jsonb(l) into v_after from public.stock_logs l where l.id = v_id;
  perform public.audit_log_write('product_stock_add', 'stock_logs:' || v_id::text, null, v_after, v_store);
  return v_id;
end $$;
revoke execute on function public.product_stock_add(uuid, int, text) from public, anon;
grant  execute on function public.product_stock_add(uuid, int, text) to authenticated;

commit;
