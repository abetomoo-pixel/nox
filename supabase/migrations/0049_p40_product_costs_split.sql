-- 0049_p40_product_costs_split.sql
-- 台帳#40 裁定＝案C：products.cost を product_costs へ退避し、products から cost 列を落とす。
-- 目的：cast および staff に原価を構造的に見せない（列が存在しない＝select("*") でも導出不能）。
-- 非idempotent：再実行厳禁（backfill と drop column が1回きり）。
--
-- live 調査で確定した前提（2026-07-17）：
--   - cost 固有の構造依存は products_cost_check 1本のみ（view/matview/index/trigger/default/generated はゼロ）
--   - cost に触る DB 関数は set_product 1本のみ（新規/更新兼用 upsert）
--   - payOf / lib / seed-f0 は cost 非依存
--
-- 適用順（変更禁止）：
--   1) product_costs 作成 → index → trigger → RLS → policy → grant
--   2) backfill（products.cost is not null のみ）
--   3) set_product 置換（署名12引数のまま＝overload 掃除不要・G22罠回避）
--   4) products.cost drop（products_cost_check は自動消滅・CASCADE 不要）

begin;

-- 1) 新テーブル -----------------------------------------------------------------
create table if not exists public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  org_id     uuid not null,
  store_id   uuid not null,
  cost       integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_costs_cost_check check (cost >= 0)
);

comment on table public.product_costs is
  '原価（台帳#40）。products から分離＝cast/staff に構造的非開示。write 経路は set_product のみ。org_id/store_id は products 行と同一値を set_product が書く（構造保証）。';

create index if not exists product_costs_org_idx   on public.product_costs (org_id);
create index if not exists product_costs_store_idx on public.product_costs (store_id);

drop trigger if exists product_costs_touch_updated_at on public.product_costs;
create trigger product_costs_touch_updated_at
  before update on public.product_costs
  for each row execute function public.touch_updated_at();

alter table public.product_costs enable row level security;

drop policy if exists product_costs_select on public.product_costs;
create policy product_costs_select on public.product_costs
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (
      public.auth_role() = 'owner'
      or (public.auth_role() = 'manager' and store_id = public.auth_store_id())
    )
  );
-- auth_org_id() が null のとき org_id = null は false 評価＝anon/未解決は fail-closed。

-- grant：Supabase は新テーブルに authenticated 全権限を自動付与するため書込を明示 revoke。
revoke all on public.product_costs from public;
revoke all on public.product_costs from anon;
revoke insert, update, delete, truncate on public.product_costs from authenticated;
grant select on public.product_costs to authenticated;

-- 2) backfill -------------------------------------------------------------------
insert into public.product_costs (product_id, org_id, store_id, cost)
select p.id, p.org_id, p.store_id, p.cost
  from public.products p
 where p.cost is not null
on conflict (product_id) do nothing;

-- 3) set_product 置換（署名12引数のまま） ----------------------------------------
create or replace function public.set_product(
  p_id uuid, p_store_id uuid, p_type text, p_category text, p_name text,
  p_price integer, p_cost integer, p_back_mode text, p_back_value integer,
  p_unit4 jsonb, p_hon_pt integer, p_is_active boolean
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner    uuid;
  v_id       uuid;
  v_before   jsonb;
  v_after    jsonb;
  v_key      text;
  v_num      numeric;
  v_old_cost integer;
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
      (org_id, store_id, type, category, name, price, back_mode, back_value, unit4_json, hon_pt, is_active)
    values
      (public.auth_org_id(), p_store_id, p_type, p_category, trim(p_name), p_price,
       p_back_mode, p_back_value, p_unit4, p_hon_pt, coalesce(p_is_active, true))
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(p) into v_before from public.products p
      where p.id = p_id and p.org_id = public.auth_org_id() and p.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    -- 監査の形を #40 前と揃える：cost キーを合成（過去 audit 行との互換）
    select c.cost into v_old_cost from public.product_costs c where c.product_id = p_id;
    v_before := v_before || jsonb_build_object('cost', v_old_cost);
    update public.products
      set type = p_type, category = p_category, name = trim(p_name), price = p_price,
          back_mode = p_back_mode, back_value = p_back_value, unit4_json = p_unit4,
          hon_pt = p_hon_pt, is_active = coalesce(p_is_active, true)
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;

  -- 原価は別テーブル（台帳#40）。null は「原価なし」＝行を消す（旧 products.cost の null と同義）。
  if p_cost is null then
    delete from public.product_costs where product_id = v_id;
  else
    insert into public.product_costs (product_id, org_id, store_id, cost)
    values (v_id, public.auth_org_id(), p_store_id, p_cost)
    on conflict (product_id) do update
      set cost = excluded.cost, org_id = excluded.org_id, store_id = excluded.store_id;
  end if;

  select to_jsonb(p) into v_after from public.products p where p.id = v_id;
  v_after := v_after || jsonb_build_object('cost', p_cost);
  perform public.audit_log_write('set_product', 'products:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;

-- 4) 列 drop --------------------------------------------------------------------
-- products_cost_check（conkey={8}）はここで自動消滅する。明示 drop / CASCADE は不要。
alter table public.products drop column cost;

commit;
