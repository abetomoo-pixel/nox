-- =====================================================================
-- NOX mig0082  kiosk_register_state の商品並び順是正（0081 の kiosk 側結線）
--
-- 底本: live pg_get_functiondef（2026-08-05 CC 供出・LF 正規化済み
--   sha256 c7a85677538c818b28526677b57645484c2360e07fcc16b86159c251000c2607）。
--   ★変更は products サブクエリの1ブロックのみ。他は live と1バイトも
--   変えていない（seats/categories/casts/checks・ガード・宣言すべて不変）。
--
-- 変更内容（裁定 2026-08-05）:
--   旧: order by p.type のみ＝カテゴリ内の商品順が実質不定
--   新: left join product_categories を足し、
--       order by coalesce(pc.sort_order, 2147483647), p.sort_order, p.name
--       ＝カテゴリ順 → 商品 sort_order → name の完全決定順。
--       未分類（category_id null）は最後。
--   返却 JSON に 'sort_order' を追加＝client の groupProducts が
--   register と同一経路で並べられる二重保険（0081 client 実装の
--   縮退パス undefined→0 が実値で埋まる）。
--
-- 冪等性: create or replace のみ＝再適用可。ただし手貼りは1回とする。
-- スキーマ変更なし（関数1本の置換）。
-- =====================================================================


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
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'type', p.type, 'price', p.price, 'category_id', p.category_id, 'sort_order', p.sort_order)
                       order by coalesce(pc.sort_order, 2147483647), p.sort_order, p.name)
        from public.products p
        left join public.product_categories pc on pc.id = p.category_id
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

notify pgrst, 'reload schema';
