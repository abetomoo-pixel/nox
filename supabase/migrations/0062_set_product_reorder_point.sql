-- mig0062_set_product_reorder_point.sql
-- set_product に p_reorder_point を追加（在庫台帳 v1 の発注点編集経路）
-- 底本: dev live pg_get_functiondef（2026-07-24 CC 取得）逐語。差分は reorder_point の4点のみ
--       （引数末尾追加 / 入力検証 / insert 列 / update 列）。他は一字不変。
-- 署名変更のため旧12引数版を drop → 13引数版 create（mig0021 前例）。ACL 再適用込み。
-- 冪等: 再実行可（drop if exists / create or replace）

begin;

drop function if exists public.set_product(uuid, uuid, text, text, text, integer, integer, text, integer, jsonb, integer, boolean);

CREATE OR REPLACE FUNCTION public.set_product(p_id uuid, p_store_id uuid, p_type text, p_category text, p_name text, p_price integer, p_cost integer, p_back_mode text, p_back_value integer, p_unit4 jsonb, p_hon_pt integer, p_is_active boolean, p_reorder_point integer DEFAULT NULL::integer)
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
  -- store の org 照合＋ロール判定（クロステナント遮断）
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if p_id is null then
    insert into public.products
      (org_id, store_id, type, category, name, price, back_mode, back_value, unit4_json, hon_pt, is_active, reorder_point)
    values
      (public.auth_org_id(), p_store_id, p_type, p_category, trim(p_name), p_price,
       p_back_mode, p_back_value, p_unit4, p_hon_pt, coalesce(p_is_active, true), p_reorder_point)
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
          hon_pt = p_hon_pt, is_active = coalesce(p_is_active, true), reorder_point = p_reorder_point
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

revoke execute on function public.set_product(uuid, uuid, text, text, text, integer, integer, text, integer, jsonb, integer, boolean, integer) from public, anon;
grant execute on function public.set_product(uuid, uuid, text, text, text, integer, integer, text, integer, jsonb, integer, boolean, integer) to authenticated;

commit;
