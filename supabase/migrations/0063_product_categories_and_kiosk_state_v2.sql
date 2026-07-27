-- mig0063_product_categories_and_kiosk_state_v2.sql
-- 純増⑦: 商品カテゴリマスタ + kiosk_register_state v2（カテゴリ/滞在タイマー）
-- 内容: (1) product_categories 新設（RLS=products 同型パターン3・grants=0055 規範）
--       (2) products.category_id FK 追加（旧 category text は据置・deprecated）
--       (3) set_product_category RPC 新設（owner/manager自店・二重防御・audit）
--       (4) set_product を14引数へ（p_category_id 追加・13引数版 drop・ACL 再適用）
--       (5) kiosk_register_state v2（署名不変・categories 配列 + products.category_id + checks.started_at）
-- 冪等: 再実行可

begin;

-- ============================================================
-- (1) product_categories
-- ============================================================
create table if not exists public.product_categories (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id),
  store_id    uuid not null references public.stores(id),
  name        text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index if not exists product_categories_store_name_uq
  on public.product_categories (store_id, lower(name));

alter table public.product_categories enable row level security;

-- RLS: products_select 同型（パターン3＝cast も見える価格表の編成情報）
drop policy if exists product_categories_select on public.product_categories;
create policy product_categories_select on public.product_categories
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
  );
-- 書込ポリシーは作らない（RPC 経由のみ）

-- grants 標準型（0055 規範逐語・revoke all で REFERENCES/TRIGGER 取りこぼし防止＝0049→0050 教訓）
revoke all on table public.product_categories from public, anon, authenticated;
grant select on table public.product_categories to authenticated;

-- ============================================================
-- (2) products.category_id（旧 category text 列は据置＝deprecated・将来 drop）
-- ============================================================
alter table public.products
  add column if not exists category_id uuid references public.product_categories(id) on delete set null;

comment on column public.products.category is 'deprecated: 未使用のフリーテキスト。0063 以降は category_id（product_categories FK）を使用';

-- ============================================================
-- (3) set_product_category RPC
-- ============================================================
create or replace function public.set_product_category(
  p_id uuid, p_store_id uuid, p_name text, p_sort_order integer, p_is_active boolean)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 40 then raise exception 'bad name'; end if;
  if p_sort_order is null then raise exception 'bad sort_order'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- 同店重複名の明示拒否（unique index は backstop）
  if exists (select 1 from public.product_categories pc
              where pc.store_id = p_store_id
                and lower(pc.name) = lower(trim(p_name))
                and pc.id is distinct from p_id) then
    raise exception 'duplicate name';
  end if;

  if p_id is null then
    insert into public.product_categories (org_id, store_id, name, sort_order, is_active)
    values (public.auth_org_id(), p_store_id, trim(p_name), p_sort_order, coalesce(p_is_active, true))
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(pc) into v_before from public.product_categories pc
      where pc.id = p_id and pc.org_id = public.auth_org_id() and pc.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.product_categories
       set name = trim(p_name), sort_order = p_sort_order, is_active = coalesce(p_is_active, true)
     where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;

  select to_jsonb(pc) into v_after from public.product_categories pc where pc.id = v_id;
  perform public.audit_log_write('set_product_category', 'product_categories:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;

revoke execute on function public.set_product_category(uuid, uuid, text, integer, boolean) from public, anon;
grant execute on function public.set_product_category(uuid, uuid, text, integer, boolean) to authenticated;

-- ============================================================
-- (4) set_product 14引数（底本=0062 逐語・差分は category_id の4点のみ）
-- ============================================================
drop function if exists public.set_product(uuid, uuid, text, text, text, integer, integer, text, integer, jsonb, integer, boolean, integer);

CREATE OR REPLACE FUNCTION public.set_product(p_id uuid, p_store_id uuid, p_type text, p_category text, p_name text, p_price integer, p_cost integer, p_back_mode text, p_back_value integer, p_unit4 jsonb, p_hon_pt integer, p_is_active boolean, p_reorder_point integer DEFAULT NULL::integer, p_category_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- 発注点（在庫台帳 v1・null=しきい無し）
  if p_reorder_point is not null and p_reorder_point < 0 then raise exception 'bad reorder_point'; end if;
  -- カテゴリ（0063・null=未分類。同 org かつ同一店のカテゴリのみ許可＝クロス店割当遮断）
  if p_category_id is not null then
    if not exists (select 1 from public.product_categories pc
                    where pc.id = p_category_id
                      and pc.org_id = public.auth_org_id()
                      and pc.store_id = p_store_id) then
      raise exception 'bad category';
    end if;
  end if;
  -- store の org 照合＋ロール判定（クロステナント遮断）
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if p_id is null then
    insert into public.products
      (org_id, store_id, type, category, name, price, back_mode, back_value, unit4_json, hon_pt, is_active, reorder_point, category_id)
    values
      (public.auth_org_id(), p_store_id, p_type, p_category, trim(p_name), p_price,
       p_back_mode, p_back_value, p_unit4, p_hon_pt, coalesce(p_is_active, true), p_reorder_point, p_category_id)
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
          hon_pt = p_hon_pt, is_active = coalesce(p_is_active, true), reorder_point = p_reorder_point,
          category_id = p_category_id
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;

  -- 原価は別テーブル（台帳#40）。null は「原価なし」＝行を消す（products.cost の null と同義）。
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

revoke execute on function public.set_product(uuid, uuid, text, text, text, integer, integer, text, integer, jsonb, integer, boolean, integer, uuid) from public, anon;
grant execute on function public.set_product(uuid, uuid, text, text, text, integer, integer, text, integer, jsonb, integer, boolean, integer, uuid) to authenticated;

-- ============================================================
-- (5) kiosk_register_state v2（署名不変・create or replace のみ）
--     追加: categories 配列 / products.category_id / checks.started_at
--     非開示原則（back/customer/by_user_id）は不変。0059(b) タイマー契約に非抵触。
-- ============================================================
CREATE OR REPLACE FUNCTION public.kiosk_register_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
begin
  -- ★正ガード先行のみ（is null 述語は三値化しない＝fail-closed。F0 §7.1 教訓）
  v_store := public.auth_kiosk_register_store_id();
  if v_store is null or public.auth_kiosk_operator() is null then
    raise exception 'forbidden';
  end if;

  return jsonb_build_object(
    'seats', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind)
                       order by s.sort_order)
        from public.seats s
       where s.store_id = v_store and s.is_active), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', pc.id, 'name', pc.name, 'sort_order', pc.sort_order)
                       order by pc.sort_order, pc.name)
        from public.product_categories pc
       where pc.store_id = v_store and pc.is_active), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'type', p.type, 'price', p.price, 'category_id', p.category_id)
                       order by p.type)
        from public.products p
       where p.store_id = v_store and p.is_active), '[]'::jsonb),
    'casts', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
        from public.casts c
       where c.store_id = v_store and c.is_active), '[]'::jsonb),
    'checks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ck.id,
               'seat_id', ck.seat_id,
               'extra_seat_ids', coalesce((
                 select jsonb_agg(cs.seat_id order by cs.created_at)
                   from public.check_seats cs where cs.check_id = ck.id), '[]'::jsonb),
               'total', ck.total,
               'started_at', ck.started_at) order by ck.started_at)
        from public.checks ck
       where ck.store_id = v_store and ck.status = 'open'), '[]'::jsonb)
  );
end $function$;

commit;
