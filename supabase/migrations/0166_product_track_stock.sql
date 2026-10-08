-- 0166_product_track_stock.sql
-- マイグレーション名: 0166_product_track_stock（便 X-13a・目視 NG X-13-8「在庫管理なしの商品」・2026-10-08 起草）
-- 生成: 手書き（写経元なし＝新列 1・新規 RPC 1・既存関数は不触）。検証クエリは末尾。
--
-- 器:
--   ★1 products.track_stock boolean not null default true（既存行は true＝従来どおり在庫を管理する）。
--        false＝在庫を管理しない（client: 一覧・レジ・在庫画面で在庫「—」・発注点非表示・棚卸し対象外）。
--        ★stock_on_check_line（販売時の stock_logs 自動行）は不触＝false でも sale 行は積まれるが画面には出さない（減らす対象の表示が無い）。
--          トリガ側の抑止は X-13b で裁定（必要なら 0167）。
--   ★2 新規 RPC set_product_track_stock(p_product_id uuid, p_track boolean) returns void＝課金ゲート内蔵（規則A形）・owner ∨ manager 自店・
--        変更なしは no-op（監査も書かない）・変更時は products.track_stock を更新し audit_log_write('set_product_track_stock', 'products:<id>', before, after, store_id)。
--        set_product（15 引数）は不触＝署名変更なし。
--   ★3 grants: public／anon revoke・authenticated grant（公開 RPC）。名簿 A8 相当（商品マスタ＝A6）に +1＝303→304・'billing locked' 154→155。
--
-- demo 表への影響: products に NOT NULL 列が増える＝demo_org_reset の jsonb_populate_recordset は欠けた列を NULL にする（default は効かない）ため、
--   payload の products 行に track_stock を持たせる（gen-demo＝便 X-13a で先行して true を入れた＝列が無い間は無視される・適用後は NOT NULL を満たす）。
--   false にする銘柄（ソフトドリンク・サワー・ハイボール・生ビール等）は X-13b で payload へ。
--
-- 名簿・suite への影響（手貼り後の suite 便で反映）: 関数 303 → 304（公開・ゲート内蔵＝名簿 A +1）。表 83 不変。
--   pin が変わる suite: billing（対象 154→155・全数 303→304・形 155・述語参照 156）／anon-guard（probe +1＝anon BLOCKED）／grants（G4d 新 RPC の ACL）／0158（関数 304）。
--
-- 検証クエリ（Run 後・下の commit; の後ろ・貼り先証明を先頭に・値は形だけ返す）:
--   select 'nox-project-proof', count(*) from public.orgs;                                                                                         -- 9
--   select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='products' and column_name='track_stock';   -- boolean／NO／true
--   select count(*) filter (where track_stock) as on_count, count(*) as total from public.products;                                               -- on_count＝total（既存は全部 true）
--   select left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname='set_product_track_stock';                                          -- 新設（md5 は手貼り案内の値）
--   select prosrc like '%billing locked%' from pg_proc where proname='set_product_track_stock';                                                    -- true
--   select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions, (select count(*) from pg_tables where schemaname='public') tables;   -- 304／83
begin;

-- ★1 products.track_stock
alter table public.products add column if not exists track_stock boolean not null default true;
comment on column public.products.track_stock is '0166: 在庫を管理するか（false＝在庫「—」・発注点非表示・棚卸し対象外・販売しても画面上の在庫は動かない）。既定 true。';

-- ★2 set_product_track_stock（公開 RPC・課金ゲート内蔵・owner ∨ manager 自店・監査）
create or replace function public.set_product_track_stock(p_product_id uuid, p_track boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid;
  v_store  uuid;
  v_before boolean;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_product_id is null or p_track is null then raise exception 'bad args'; end if;
  select p.org_id, p.store_id, p.track_stock into v_org, v_store, v_before from public.products p where p.id = p_product_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_store = public.auth_store_id())) then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if v_before = p_track then return; end if;  -- 変更なし＝no-op（監査も書かない）
  update public.products set track_stock = p_track, updated_at = now() where id = p_product_id;
  perform public.audit_log_write('set_product_track_stock', 'products:' || p_product_id::text,
    jsonb_build_object('track_stock', v_before), jsonb_build_object('track_stock', p_track), v_store);
end $$;

-- ★3 grants（公開 RPC＝public／anon revoke・authenticated grant）
revoke all on function public.set_product_track_stock(uuid, boolean) from public, anon;
grant execute on function public.set_product_track_stock(uuid, boolean) to authenticated;

commit;
-- ===== end 0166 =====
