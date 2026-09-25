-- 0153_customers_keep.sql
-- 裁定305（2026-09-25・0153 顧客複数・ボトルキープの設計 305-1〜12）＋293-4（保持期間・利用目的）＋296 追補2（商品バック区分別固定額）＝2026-09-25 起草（CC 写経・便 M153-2）。
-- 写経元（★以外は 1 バイト不変＝改行コードを除く（299-11）・docs/tmp/gen_0153.py で機械生成）:
--   live 全文（docs/tmp/0153_pre_live.md）＝check_open（a53eb290）／check_merge（f79dc159）／bottle_keep_register（993efa9a）／bottle_keep_update（e680a3bb）
--   適用済み mig の全文＝check_close（0152・31ff9cca）／demo_org_reset（0152・677cb575）／set_comp_plan（0134・8d6b6879）／set_cast_plan（0154・842f7e57）／set_store_profile（0154・e1048e17）
--   （md5 は $$ 内の先頭 8 桁・突合 q0925_ag_0153.mjs が live prosrc（CR 除去）と照合する）
--   ★1  check_customers（check_seats 型・position・unique(check_id, customer_id)／(check_id, position)・RLS cast 0 行・grant SELECT）
--   ★2  check_lines.customer_id（→customers ON DELETE SET NULL）
--   ★3  bottle_keeps.bottle_name（≤60）／last_used_at（305-6）
--   ★4  customers.last_visit_at／retention_until／deleted_at／anonymized_at（305-11）
--   ★5  set_store_profile 白名単 +2（customer_purpose text ≤200／customer_retention_years int 1〜10）
--   ★6  comp_plans.product_back_fixed_hon／jonai／free（integer null ≥0・CHECK）（305-12）
--   ★7  set_comp_plan 改稿（+3 引数＝署名 19・旧 19 引数版は drop）
--   ★8  set_cast_plan 白名単 +3（productBackFixedHon／Jonai／Free＝number ≥0 整数）
--   ★9  check_close 改稿（plan_fixed の区分別解決＝商品 unit4 → cast_plan 区分別 → comp_plans 区分別 → 一律・同伴＝本指名／last_visit_at・retention_until の更新）
--   ★10 check_open 改稿（p_customer_id → check_customers position 0）
--   ★11 check_merge 改稿（from の check_customers を into へ・重複 skip・position 詰め直し・check_lines.customer_id は保持）
--   ★12 check_customer_add／★13 check_customer_remove／★14 check_line_set_customer／★15 check_customer_names（305-1〜4）
--   ★16 bottle_keep_register 改稿（+p_bottle_name・+p_check_line_id＝署名 9・旧 7 引数版は drop）／★17 bottle_keep_update 改稿（+p_bottle_name＝署名 7・旧 6 引数版は drop）
--   ★18 bottle_keep_out（305-5／305-7・kiosk 腕・冪等＝check_lines.idem_key）／★19 check_lines_kind_check +'keep_out'（11 値）
--   ★20 customer_sales_summary（305-9・均等割り・端数は position 0）／★21 demo_org_reset c_wipe／c_load +check_customers／★22 revoke／grant
--   不触の md5 控え（CR 除去・docs/tmp/0153_pre.md B-1）: customer_assign_cast accfb2a6／customer_list_summary ab424336／customer_note_add d02f065a／customer_note_remove 4fc94eb6／
--     customer_register 8a0c30c7／customer_set_grade 57f44d0c／customer_summary 3371b5dc／customer_update 36bc688d／customer_visit_history 1c2a1097／get_cast_customer_ranking a1b8307c／
--     reservation_create 1d45f0f1／reservation_to_check 0580778f／reservation_update 3542fea6／receivable_collect 46af248c／check_pay e4088d7d／store_cohort_aggregate 6fb2c5fe／store_hourly_aggregate b3b05011
--
-- 要裁定 (4)＝裁定307 で確定（2026-09-25・Agoora 承認・改稿なし・貼付版 sha256 417c5952dfc3a9203c1b05004d7e9b21d9df13f82e49cdf6e4ad23f326190b11）:
--   (1) 307-1 読取 2 本（check_customer_names／customer_sales_summary）はゲート行なし＝名簿 B(f)（裁定261 の読取は課金停止中も通す）。referral_payouts_unpaid の A は 0152 の写経の名残＝起票（次の mig で B(f) へ・本便では触らない）。
--   (2) 307-2 起草どおり（bottle_keep_register の p_check_line_id＝購入行の customer_id を持ち主に・伝票に紐づく顧客でなければ 'not on check'・列は足さない）。
--   (3) 307-3 起草どおり（check_customer_add／remove／line_set＝check_open と同じ腕・kiosk 腕なし）。
--   (4) 307-4 305-12 の unit4 最優先は plan_fixed の cast にも効く＝仕様（live の組 0・golden 3 fixture 不変を突合で実測。以後この組が出たら商品側が勝つ＝期待値の張り替えで対応）。
--   307-5 下の不触 md5 控え customer_assign_cast は accfb2a6 が正（旧記載 accbf2a6 は転記ミス・本文への影響なし）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref を目視確認・先頭に貼り先証明）:
--   select 'nox-project-proof', count(*) from public.orgs;                                                          -- 3
--   select proname, pg_get_function_identity_arguments(oid), prosecdef, proacl from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('check_customer_add','check_customer_remove','check_line_set_customer','check_customer_names','bottle_keep_out','customer_sales_summary',
--                     'bottle_keep_register','bottle_keep_update','set_comp_plan','set_cast_plan','set_store_profile','check_open','check_merge','check_close','demo_org_reset') order by 1;   -- 15 行（旧署名は消えている）
--   select table_name, column_name from information_schema.columns where table_schema='public' and
--     ((table_name='check_lines' and column_name='customer_id') or (table_name='bottle_keeps' and column_name in ('bottle_name','last_used_at'))
--      or (table_name='customers' and column_name in ('last_visit_at','retention_until','deleted_at','anonymized_at'))
--      or (table_name='comp_plans' and column_name like 'product_back_fixed_%')) order by 1,2;                             -- 10 行
--   select pg_get_constraintdef(oid) from pg_constraint where conname='check_lines_kind_check';                          -- 'keep_out' を含む 11 値
--   select count(*) from pg_policies where tablename='check_customers';                                                  -- 1（select）
--   -- 不触の md5 が上の控えと一致・動作＝突合 docs/tmp/q0925_ag_0153.mjs（BEGIN…ROLLBACK）・suite の張り替えは手貼り後

begin;

-- ══════════════════════════════════════════════════════════════
-- ★1 check_customers（写経元＝check_seats（mig0053）・position＝紐づけ順・0 が「最初の顧客」＝checks.customer_id と同値（305-1））
-- ══════════════════════════════════════════════════════════════
create table if not exists public.check_customers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id),
  store_id    uuid not null references public.stores(id),
  check_id    uuid not null references public.checks(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.users(id),
  constraint check_customers_check_customer_uniq unique (check_id, customer_id),
  constraint check_customers_check_position_uniq unique (check_id, position),
  constraint check_customers_position_check check (position >= 0)
);
create index if not exists check_customers_check_idx    on public.check_customers (check_id);
create index if not exists check_customers_customer_idx on public.check_customers (customer_id);
create index if not exists check_customers_org_store_idx on public.check_customers (org_id, store_id);

alter table public.check_customers enable row level security;
-- ★1: check_seats_select の写経から cast 腕を外す（RLS cast 0 行＝顧客名は ★15 の RPC だけが出す）
drop policy if exists check_customers_select on public.check_customers;
create policy check_customers_select on public.check_customers for select using (
  org_id = public.auth_org_id()
  and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
  and (public.auth_role() in ('owner','manager')
       or (public.auth_role() = 'staff' and public.auth_staff_can_register()))
);
-- 新テーブル grant 規約（0003 型）: revoke all → SELECT のみ戻す
revoke all on table public.check_customers from public, anon, authenticated;
grant select on table public.check_customers to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ★2〜★4 列追加（CHECK 変更なし＝kind pin は ★19 のみ）
-- ══════════════════════════════════════════════════════════════
alter table public.check_lines  add column if not exists customer_id uuid references public.customers(id) on delete set null;   -- ★2（305-2 注文者・既定 null）
create index if not exists check_lines_customer_idx on public.check_lines (customer_id) where customer_id is not null;         -- ★2
alter table public.bottle_keeps add column if not exists bottle_name text;                                                    -- ★3（305-6）
alter table public.bottle_keeps add column if not exists last_used_at timestamptz;                                            -- ★3（305-5 で更新）
alter table public.bottle_keeps drop constraint if exists bottle_keeps_bottle_name_len;
alter table public.bottle_keeps add constraint bottle_keeps_bottle_name_len check (bottle_name is null or length(bottle_name) <= 60);   -- ★3
alter table public.customers add column if not exists last_visit_at   timestamptz;   -- ★4（305-11・check_close で更新）
alter table public.customers add column if not exists retention_until date;          -- ★4（last_visit_at ＋ customer_retention_years・既定 5）
alter table public.customers add column if not exists deleted_at      timestamptz;   -- ★4（削除・匿名化の RPC は 0155）
alter table public.customers add column if not exists anonymized_at   timestamptz;   -- ★4

-- ══════════════════════════════════════════════════════════════
-- ★6 comp_plans 区分別固定額 3 列（296 追補2・null＝一律 product_back_fixed を使う＝既存プラン不変）
-- ══════════════════════════════════════════════════════════════
alter table public.comp_plans add column if not exists product_back_fixed_hon   integer;
alter table public.comp_plans add column if not exists product_back_fixed_jonai integer;
alter table public.comp_plans add column if not exists product_back_fixed_free  integer;
alter table public.comp_plans drop constraint if exists comp_plans_product_back_fixed_hon_check;
alter table public.comp_plans drop constraint if exists comp_plans_product_back_fixed_jonai_check;
alter table public.comp_plans drop constraint if exists comp_plans_product_back_fixed_free_check;
alter table public.comp_plans add constraint comp_plans_product_back_fixed_hon_check   check (product_back_fixed_hon   is null or product_back_fixed_hon   >= 0);
alter table public.comp_plans add constraint comp_plans_product_back_fixed_jonai_check check (product_back_fixed_jonai is null or product_back_fixed_jonai >= 0);
alter table public.comp_plans add constraint comp_plans_product_back_fixed_free_check  check (product_back_fixed_free  is null or product_back_fixed_free  >= 0);

-- ══════════════════════════════════════════════════════════════
-- ★19 check_lines_kind_check（10 値 → 11 値＝+'keep_out'・305-5）
-- ══════════════════════════════════════════════════════════════
alter table public.check_lines drop constraint check_lines_kind_check;
alter table public.check_lines add constraint check_lines_kind_check
  check (kind in ('set','time','charge','drink','champ','bottle','custom','discount','food','other','keep_out'));   -- ★19 +keep_out（0152 の 10 値 → 11 値）

-- ══════════════════════════════════════════════════════════════
-- ★5 set_store_profile（0154 全文・白名単 +2・ブロック +2 のみ★）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_store_profile(p_store_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid := public.auth_org_id();
  v_store    record;
  v_keys     text[] := array['name','short','ext_shimei_enabled','dohan_auto_hon',
                             'store_code','display_name','show_open_status','shift_cast_confirm',   -- ★1 0147: 末尾 '];' → ','（12 キーを続ける）
                             'biz_type','billing_mode','setup_done',                                  -- ★1 0147: 裁定269-1 の 12 キー（enum 2・bool 10）
                             'sys_hourly','sys_backs','sys_sales_rate','sys_points','sys_sales_slide',   -- ★1
                             'sys_point_slide','sys_norms','sys_penalties','sys_bonus',                   -- ★1（0151 ★4: 末尾 '];' → ','）
                             'slide_apply',                                                               -- ★4 0151: 裁定287-4 の 1 キー（0154 ★7: 末尾 '];' → ','）
                             'settlement_presets',                                                        -- ★7 0154: 裁定294-7 の 1 キー（0153 ★5: 末尾 '];' → ','）
                             'customer_purpose','customer_retention_years'];                              -- ★5 0153: 裁定305-11／293-4 の 2 キー
  v_k        text;
  v_before   jsonb := '{}'::jsonb;
  v_after    jsonb := '{}'::jsonb;
  v_name     text;
  v_short    text;
  v_code     text;
  v_disp     text;
  v_ext      boolean;
  v_dohan    boolean;
  v_open     boolean;
  v_confirm  boolean;
  v_settings jsonb;
  v_biz      text;      -- ★2 0147: biz_type（enum text 5 値）
  v_bill     text;      -- ★3 0147: billing_mode（enum text 3 値）
  v_setup_done boolean;   -- ★4 0147: setup_done（show_open_status と同型）
  v_s_hourly boolean;   -- ★4 0147: sys_hourly（show_open_status と同型）
  v_s_backs  boolean;   -- ★4 0147: sys_backs（show_open_status と同型）
  v_s_sales_rate boolean;   -- ★4 0147: sys_sales_rate（show_open_status と同型）
  v_s_points boolean;   -- ★4 0147: sys_points（show_open_status と同型）
  v_s_sales_slide boolean;   -- ★4 0147: sys_sales_slide（show_open_status と同型）
  v_s_point_slide boolean;   -- ★4 0147: sys_point_slide（show_open_status と同型）
  v_s_norms  boolean;   -- ★4 0147: sys_norms（show_open_status と同型）
  v_s_penalties boolean;   -- ★4 0147: sys_penalties（show_open_status と同型）
  v_s_bonus  boolean;   -- ★4 0147: sys_bonus（show_open_status と同型）
  v_slide    text;      -- ★4 0151: slide_apply（enum text 2 値・biz_type と同型）
  v_presets  jsonb;     -- ★7 0154: settlement_presets（配列・最大 10）
  v_pe       jsonb;     -- ★7 0154: settlement_presets の要素
  v_purpose  text;      -- ★5 0153: customer_purpose（display_name と同型・≤200）
  v_years    numeric;   -- ★5 0153: customer_retention_years（整数 1〜10）
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;   -- 店ポリシー＝owner 限定（cast_register と同格）
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'bad patch'; end if;
  if p_patch = '{}'::jsonb then raise exception 'bad patch'; end if;

  select id, org_id, name, short, ext_shimei_enabled, dohan_auto_hon, settings_json
    into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> v_org then raise exception 'forbidden'; end if;

  -- 白名単外のキーは黙って無視せず拒否
  for v_k in select jsonb_object_keys(p_patch) loop
    if not (v_k = any(v_keys)) then raise exception 'bad key'; end if;
  end loop;

  v_settings := coalesce(v_store.settings_json, '{}'::jsonb);

  -- ── 列側 ────────────────────────────────────────────────
  if p_patch ? 'name' then
    if jsonb_typeof(p_patch->'name') <> 'string' then raise exception 'bad type'; end if;
    v_name := trim(p_patch->>'name');
    if length(v_name) < 1 or length(v_name) > 50 then raise exception 'bad name'; end if;
    v_before := v_before || jsonb_build_object('name', v_store.name);
    v_after  := v_after  || jsonb_build_object('name', v_name);
  end if;

  if p_patch ? 'short' then
    if jsonb_typeof(p_patch->'short') <> 'string' then raise exception 'bad type'; end if;
    v_short := trim(p_patch->>'short');
    if length(v_short) > 20 then raise exception 'bad short'; end if;
    if v_short = '' then v_short := null; end if;   -- 空欄は null（列は null 可）
    v_before := v_before || jsonb_build_object('short', v_store.short);
    v_after  := v_after  || jsonb_build_object('short', v_short);
  end if;

  if p_patch ? 'ext_shimei_enabled' then
    if jsonb_typeof(p_patch->'ext_shimei_enabled') <> 'boolean' then raise exception 'bad type'; end if;
    v_ext := (p_patch->>'ext_shimei_enabled')::boolean;
    v_before := v_before || jsonb_build_object('ext_shimei_enabled', v_store.ext_shimei_enabled);
    v_after  := v_after  || jsonb_build_object('ext_shimei_enabled', v_ext);
  end if;

  if p_patch ? 'dohan_auto_hon' then
    if jsonb_typeof(p_patch->'dohan_auto_hon') <> 'boolean' then raise exception 'bad type'; end if;
    v_dohan := (p_patch->>'dohan_auto_hon')::boolean;
    v_before := v_before || jsonb_build_object('dohan_auto_hon', v_store.dohan_auto_hon);
    v_after  := v_after  || jsonb_build_object('dohan_auto_hon', v_dohan);
  end if;

  -- ── settings_json 側 ───────────────────────────────────
  if p_patch ? 'store_code' then
    if jsonb_typeof(p_patch->'store_code') <> 'string' then raise exception 'bad type'; end if;
    v_code := trim(p_patch->>'store_code');
    if length(v_code) > 20 then raise exception 'bad store_code'; end if;
    v_before   := v_before || jsonb_build_object('store_code', coalesce(v_settings->>'store_code', ''));
    v_after    := v_after  || jsonb_build_object('store_code', v_code);
    v_settings := jsonb_set(v_settings, '{store_code}', to_jsonb(v_code), true);
  end if;

  if p_patch ? 'display_name' then
    if jsonb_typeof(p_patch->'display_name') <> 'string' then raise exception 'bad type'; end if;
    v_disp := trim(p_patch->>'display_name');
    if length(v_disp) > 50 then raise exception 'bad display_name'; end if;
    v_before   := v_before || jsonb_build_object('display_name', coalesce(v_settings->>'display_name', ''));
    v_after    := v_after  || jsonb_build_object('display_name', v_disp);
    v_settings := jsonb_set(v_settings, '{display_name}', to_jsonb(v_disp), true);
  end if;

  if p_patch ? 'show_open_status' then
    if jsonb_typeof(p_patch->'show_open_status') <> 'boolean' then raise exception 'bad type'; end if;
    v_open := (p_patch->>'show_open_status')::boolean;
    v_before   := v_before || jsonb_build_object('show_open_status',
                    coalesce(v_settings->>'show_open_status', '') = 'true');
    v_after    := v_after  || jsonb_build_object('show_open_status', v_open);
    v_settings := jsonb_set(v_settings, '{show_open_status}', to_jsonb(v_open), true);
  end if;

  if p_patch ? 'shift_cast_confirm' then
    if jsonb_typeof(p_patch->'shift_cast_confirm') <> 'boolean' then raise exception 'bad type'; end if;
    v_confirm := (p_patch->>'shift_cast_confirm')::boolean;
    v_before   := v_before || jsonb_build_object('shift_cast_confirm',
                    coalesce(v_settings->>'shift_cast_confirm', '') = 'true');
    v_after    := v_after  || jsonb_build_object('shift_cast_confirm', v_confirm);
    v_settings := jsonb_set(v_settings, '{shift_cast_confirm}', to_jsonb(v_confirm), true);
  end if;

  -- ── ★2〜★4 0147 追加キー（裁定269-1／270-3）: enum text 2・boolean 10 ────────
  if p_patch ? 'biz_type' then                                                                             -- ★2 0147
    if jsonb_typeof(p_patch->'biz_type') <> 'string' then raise exception 'bad type'; end if;              -- ★2（text 4 キーの行型を写経）
    v_biz := p_patch->>'biz_type';                                                                         -- ★2
    if v_biz is null or v_biz not in ('cabaret','girlsbar','snack','lounge','bar') then raise exception 'bad biz_type'; end if;  -- ★2（mig0042:92 set_store_norm_config の not in (...) を写経）
    v_before   := v_before || jsonb_build_object('biz_type', coalesce(v_settings->>'biz_type', ''));       -- ★2
    v_after    := v_after  || jsonb_build_object('biz_type', v_biz);                                       -- ★2
    v_settings := jsonb_set(v_settings, '{biz_type}', to_jsonb(v_biz), true);                              -- ★2
  end if;                                                                                                  -- ★2

  if p_patch ? 'billing_mode' then                                                                         -- ★3 0147
    if jsonb_typeof(p_patch->'billing_mode') <> 'string' then raise exception 'bad type'; end if;          -- ★3（text 4 キーの行型を写経）
    v_bill := p_patch->>'billing_mode';                                                                    -- ★3
    if v_bill is null or v_bill not in ('table','individual','mixed') then raise exception 'bad billing_mode'; end if;  -- ★3（mig0042:92 写経・'bad billing_mode'）
    v_before   := v_before || jsonb_build_object('billing_mode', coalesce(v_settings->>'billing_mode', '')); -- ★3
    v_after    := v_after  || jsonb_build_object('billing_mode', v_bill);                                  -- ★3
    v_settings := jsonb_set(v_settings, '{billing_mode}', to_jsonb(v_bill), true);                         -- ★3
  end if;                                                                                                  -- ★3

  if p_patch ? 'setup_done' then                                                                               -- ★4 0147: setup_done（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'setup_done') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_setup_done := (p_patch->>'setup_done')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('setup_done',                                                  -- ★4
                    coalesce(v_settings->>'setup_done', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('setup_done', v_setup_done);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{setup_done}', to_jsonb(v_setup_done), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_hourly' then                                                                               -- ★4 0147: sys_hourly（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_hourly') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_hourly := (p_patch->>'sys_hourly')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_hourly',                                                  -- ★4
                    coalesce(v_settings->>'sys_hourly', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_hourly', v_s_hourly);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_hourly}', to_jsonb(v_s_hourly), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_backs' then                                                                               -- ★4 0147: sys_backs（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_backs') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_backs := (p_patch->>'sys_backs')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_backs',                                                  -- ★4
                    coalesce(v_settings->>'sys_backs', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_backs', v_s_backs);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_backs}', to_jsonb(v_s_backs), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_sales_rate' then                                                                               -- ★4 0147: sys_sales_rate（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_sales_rate') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_sales_rate := (p_patch->>'sys_sales_rate')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_sales_rate',                                                  -- ★4
                    coalesce(v_settings->>'sys_sales_rate', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_sales_rate', v_s_sales_rate);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_sales_rate}', to_jsonb(v_s_sales_rate), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_points' then                                                                               -- ★4 0147: sys_points（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_points') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_points := (p_patch->>'sys_points')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_points',                                                  -- ★4
                    coalesce(v_settings->>'sys_points', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_points', v_s_points);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_points}', to_jsonb(v_s_points), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_sales_slide' then                                                                               -- ★4 0147: sys_sales_slide（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_sales_slide') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_sales_slide := (p_patch->>'sys_sales_slide')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_sales_slide',                                                  -- ★4
                    coalesce(v_settings->>'sys_sales_slide', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_sales_slide', v_s_sales_slide);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_sales_slide}', to_jsonb(v_s_sales_slide), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_point_slide' then                                                                               -- ★4 0147: sys_point_slide（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_point_slide') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_point_slide := (p_patch->>'sys_point_slide')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_point_slide',                                                  -- ★4
                    coalesce(v_settings->>'sys_point_slide', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_point_slide', v_s_point_slide);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_point_slide}', to_jsonb(v_s_point_slide), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_norms' then                                                                               -- ★4 0147: sys_norms（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_norms') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_norms := (p_patch->>'sys_norms')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_norms',                                                  -- ★4
                    coalesce(v_settings->>'sys_norms', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_norms', v_s_norms);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_norms}', to_jsonb(v_s_norms), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_penalties' then                                                                               -- ★4 0147: sys_penalties（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_penalties') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_penalties := (p_patch->>'sys_penalties')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_penalties',                                                  -- ★4
                    coalesce(v_settings->>'sys_penalties', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_penalties', v_s_penalties);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_penalties}', to_jsonb(v_s_penalties), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_bonus' then                                                                               -- ★4 0147: sys_bonus（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_bonus') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_bonus := (p_patch->>'sys_bonus')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_bonus',                                                  -- ★4
                    coalesce(v_settings->>'sys_bonus', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_bonus', v_s_bonus);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_bonus}', to_jsonb(v_s_bonus), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'slide_apply' then                                                                          -- ★4 0151（裁定287-4）: biz_type ブロックと同型
    if jsonb_typeof(p_patch->'slide_apply') <> 'string' then raise exception 'bad type'; end if;           -- ★4
    v_slide := p_patch->>'slide_apply';                                                                    -- ★4
    if v_slide is null or v_slide not in ('next','current') then raise exception 'bad slide_apply'; end if; -- ★4（'bad biz_type' と同型）
    v_before   := v_before || jsonb_build_object('slide_apply', coalesce(v_settings->>'slide_apply', ''));  -- ★4
    v_after    := v_after  || jsonb_build_object('slide_apply', v_slide);                                  -- ★4
    v_settings := jsonb_set(v_settings, '{slide_apply}', to_jsonb(v_slide), true);                         -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'settlement_presets' then                                                                   -- ★7 0154（裁定294-7）: 配列・最大 10・要素 {code,name,amount,basis,target}
    v_presets := p_patch->'settlement_presets';                                                            -- ★7
    if jsonb_typeof(v_presets) <> 'array' or jsonb_array_length(v_presets) > 10 then raise exception 'bad type'; end if;   -- ★7
    for v_pe in select e from jsonb_array_elements(v_presets) e loop                                       -- ★7
      if jsonb_typeof(v_pe) <> 'object'                                                                    -- ★7
         or coalesce(jsonb_typeof(v_pe->'code'), '') <> 'string' or length(trim(v_pe->>'code')) = 0       -- ★7: 欠損（null）も拒否
         or coalesce(jsonb_typeof(v_pe->'name'), '') <> 'string'                                           -- ★7
         or coalesce(jsonb_typeof(v_pe->'amount'), '') <> 'number'                                         -- ★7
         or (v_pe->>'amount')::numeric < 0 or (v_pe->>'amount')::numeric <> trunc((v_pe->>'amount')::numeric)   -- ★7: 整数 ≥0
         or coalesce(jsonb_typeof(v_pe->'basis'), '') <> 'string'                                          -- ★7
         or coalesce(jsonb_typeof(v_pe->'target'), '') <> 'string'                                         -- ★7
         or (v_pe->>'target') not in ('late','absent','early','other') then                                -- ★7
        raise exception 'bad type';                                                                        -- ★7
      end if;                                                                                              -- ★7
    end loop;                                                                                              -- ★7
    v_before   := v_before || jsonb_build_object('settlement_presets', coalesce(v_settings->'settlement_presets', '[]'::jsonb));   -- ★7
    v_after    := v_after  || jsonb_build_object('settlement_presets', v_presets);                         -- ★7
    v_settings := jsonb_set(v_settings, '{settlement_presets}', v_presets, true);                          -- ★7
  end if;                                                                                                  -- ★7

  if p_patch ? 'customer_purpose' then                                                                     -- ★5 0153（裁定305-11／293-4）: display_name ブロックと同型
    if jsonb_typeof(p_patch->'customer_purpose') <> 'string' then raise exception 'bad type'; end if;      -- ★5
    v_purpose := trim(p_patch->>'customer_purpose');                                                       -- ★5
    if length(v_purpose) > 200 then raise exception 'bad customer_purpose'; end if;                        -- ★5
    v_before   := v_before || jsonb_build_object('customer_purpose', coalesce(v_settings->>'customer_purpose', ''));   -- ★5
    v_after    := v_after  || jsonb_build_object('customer_purpose', v_purpose);                           -- ★5
    v_settings := jsonb_set(v_settings, '{customer_purpose}', to_jsonb(v_purpose), true);                  -- ★5
  end if;                                                                                                  -- ★5

  if p_patch ? 'customer_retention_years' then                                                             -- ★5 0153（裁定305-11）: 整数 1〜10（settlement_presets の数値検査の型）
    if jsonb_typeof(p_patch->'customer_retention_years') <> 'number' then raise exception 'bad type'; end if;   -- ★5
    v_years := (p_patch->>'customer_retention_years')::numeric;                                            -- ★5
    if v_years < 1 or v_years > 10 or v_years <> trunc(v_years) then raise exception 'bad customer_retention_years'; end if;   -- ★5
    v_before   := v_before || jsonb_build_object('customer_retention_years', coalesce((v_settings->>'customer_retention_years')::int, 5));   -- ★5: 既定 5
    v_after    := v_after  || jsonb_build_object('customer_retention_years', v_years::int);                -- ★5
    v_settings := jsonb_set(v_settings, '{customer_retention_years}', to_jsonb(v_years::int), true);       -- ★5
  end if;                                                                                                  -- ★5

  -- ── 1 回で書く（patch に無い列は現値のまま） ──────────
  update public.stores set
    name               = case when p_patch ? 'name'               then v_name  else name end,
    short              = case when p_patch ? 'short'              then v_short else short end,
    ext_shimei_enabled = case when p_patch ? 'ext_shimei_enabled' then v_ext    else ext_shimei_enabled end,
    dohan_auto_hon     = case when p_patch ? 'dohan_auto_hon'     then v_dohan  else dohan_auto_hon end,
    settings_json      = v_settings
  where id = p_store_id;

  perform public.audit_log_write('set_store_profile', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★7 set_comp_plan（0134 全文・+3 引数＝旧署名 drop・検証／insert／update の 3 列のみ★）
-- ══════════════════════════════════════════════════════════════
drop function if exists public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer);   -- ★7: 旧 19 引数版（0134）
CREATE OR REPLACE FUNCTION public.set_comp_plan(p_id uuid, p_store_id uuid, p_name text, p_base integer, p_hon_back integer, p_jonai_back integer, p_dohan_back integer, p_sales_slide jsonb, p_point_slide jsonb, p_is_active boolean, p_hon_back_mode text DEFAULT 'per_count'::text, p_hon_back_rate integer DEFAULT NULL::integer, p_jonai_back_mode text DEFAULT 'per_count'::text, p_jonai_back_rate integer DEFAULT NULL::integer, p_dohan_back_mode text DEFAULT 'per_count'::text, p_dohan_back_rate integer DEFAULT NULL::integer, p_product_back_mode text DEFAULT 'product_rule'::text, p_product_back_rate integer DEFAULT NULL::integer, p_product_back_fixed integer DEFAULT NULL::integer, p_product_back_fixed_hon integer DEFAULT NULL::integer, p_product_back_fixed_jonai integer DEFAULT NULL::integer, p_product_back_fixed_free integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- 入力検証（DB CHECK と二段）
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_base is null or p_base < 0 then raise exception 'bad base'; end if;
  if p_hon_back is null or p_hon_back < 0 then raise exception 'bad hon_back'; end if;
  if p_jonai_back is null or p_jonai_back < 0 then raise exception 'bad jonai_back'; end if;
  if p_dohan_back is null or p_dohan_back < 0 then raise exception 'bad dohan_back'; end if;
  -- ★mig0086: 方式（円/本｜率）検証＝列 CHECK と同値を RPC 権威でも実施
  if p_hon_back_mode is null or p_hon_back_mode not in ('per_count','rate') then
    raise exception 'bad hon_back_mode';
  end if;
  if p_hon_back_rate is not null and (p_hon_back_rate < 0 or p_hon_back_rate > 100) then
    raise exception 'bad hon_back_rate';
  end if;
  if (p_hon_back_mode = 'rate') <> (p_hon_back_rate is not null) then
    raise exception 'bad hon_back_rate';
  end if;
  if p_jonai_back_mode is null or p_jonai_back_mode not in ('per_count','rate') then
    raise exception 'bad jonai_back_mode';
  end if;
  if p_jonai_back_rate is not null and (p_jonai_back_rate < 0 or p_jonai_back_rate > 100) then
    raise exception 'bad jonai_back_rate';
  end if;
  if (p_jonai_back_mode = 'rate') <> (p_jonai_back_rate is not null) then
    raise exception 'bad jonai_back_rate';
  end if;
  -- ★mig0115: dohan の方式検証（hon/jonai と同型・列 CHECK と二段）
  if p_dohan_back_mode is null or p_dohan_back_mode not in ('per_count','rate') then
    raise exception 'bad dohan_back_mode';
  end if;
  if p_dohan_back_rate is not null and (p_dohan_back_rate < 0 or p_dohan_back_rate > 100) then
    raise exception 'bad dohan_back_rate';
  end if;
  if (p_dohan_back_mode = 'rate') <> (p_dohan_back_rate is not null) then
    raise exception 'bad dohan_back_rate';
  end if;
  -- ★mig0115（裁定86-②）: dohan の率化は R-2b（同伴 cast_id 必須・分母の行由来化）まで封印。
  --   解錠は本ガード1行を外す RPC 差替のみ（mig 不要）
  if p_dohan_back_mode = 'rate' then
    raise exception 'dohan rate requires R-2b';
  end if;
  -- ★0134（裁定113/123）: 商品販売バック方式の検証＝列 CHECK（0132）と二段
  --   product_rule=商品ごと / plan_rate=売上×率 / plan_fixed=販売数×固定額（円/1点）
  if p_product_back_mode is null or p_product_back_mode not in ('product_rule','plan_rate','plan_fixed') then
    raise exception 'bad product_back_mode';
  end if;
  if p_product_back_rate is not null and (p_product_back_rate < 0 or p_product_back_rate > 100) then
    raise exception 'bad product_back_rate';
  end if;
  if (p_product_back_mode = 'plan_rate') <> (p_product_back_rate is not null) then
    raise exception 'bad product_back_rate';
  end if;
  if p_product_back_fixed is not null and p_product_back_fixed < 0 then
    raise exception 'bad product_back_fixed';
  end if;
  if (p_product_back_mode = 'plan_fixed') <> (p_product_back_fixed is not null) then
    raise exception 'bad product_back_fixed';
  end if;
  -- ★7 0153（296 追補2／305-12）: 区分別固定額＝null 可・≥0・plan_fixed のときだけ指定できる（null＝一律 product_back_fixed）
  if p_product_back_fixed_hon is not null and p_product_back_fixed_hon < 0 then raise exception 'bad product_back_fixed_hon'; end if;
  if p_product_back_fixed_jonai is not null and p_product_back_fixed_jonai < 0 then raise exception 'bad product_back_fixed_jonai'; end if;
  if p_product_back_fixed_free is not null and p_product_back_fixed_free < 0 then raise exception 'bad product_back_fixed_free'; end if;
  if p_product_back_mode <> 'plan_fixed' and (p_product_back_fixed_hon is not null or p_product_back_fixed_jonai is not null or p_product_back_fixed_free is not null) then
    raise exception 'bad product_back_fixed_hon';
  end if;
  perform public.comp_plan_slide_check(p_sales_slide);
  perform public.comp_plan_slide_check(p_point_slide);
  -- store の org 照合＋ロール判定（owner のみ＝D3a）
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  -- ★mig0104（裁定77）: 同店内の名前重複（大小無視）を拒否＝cast_ranks の duplicate name と同型
  if exists (select 1 from public.comp_plans c
              where c.store_id = p_store_id
                and lower(c.name) = lower(trim(p_name))
                and c.id is distinct from p_id) then
    raise exception 'duplicate name';
  end if;

  if p_id is null then
    insert into public.comp_plans
      (org_id, store_id, name, base, hon_back, jonai_back, dohan_back, sales_slide, point_slide, is_active,
       hon_back_mode, hon_back_rate, jonai_back_mode, jonai_back_rate,
       dohan_back_mode, dohan_back_rate,
       product_back_mode, product_back_rate, product_back_fixed,  -- ★0134（0153 ★7: 末尾 ')' → ','）
       product_back_fixed_hon, product_back_fixed_jonai, product_back_fixed_free)  -- ★7 0153
    values
      (public.auth_org_id(), p_store_id, trim(p_name), p_base, p_hon_back, p_jonai_back, p_dohan_back,
       p_sales_slide, p_point_slide, coalesce(p_is_active, true),
       p_hon_back_mode, p_hon_back_rate, p_jonai_back_mode, p_jonai_back_rate,
       p_dohan_back_mode, p_dohan_back_rate,
       p_product_back_mode, p_product_back_rate, p_product_back_fixed,  -- ★0134（0153 ★7: 末尾 ')' → ','）
       p_product_back_fixed_hon, p_product_back_fixed_jonai, p_product_back_fixed_free)  -- ★7 0153
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(c) into v_before from public.comp_plans c
      where c.id = p_id and c.org_id = public.auth_org_id() and c.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.comp_plans
      set name = trim(p_name), base = p_base, hon_back = p_hon_back, jonai_back = p_jonai_back,
          dohan_back = p_dohan_back, sales_slide = p_sales_slide, point_slide = p_point_slide,
          is_active = coalesce(p_is_active, true),
          hon_back_mode = p_hon_back_mode, hon_back_rate = p_hon_back_rate,
          jonai_back_mode = p_jonai_back_mode, jonai_back_rate = p_jonai_back_rate,
          dohan_back_mode = p_dohan_back_mode, dohan_back_rate = p_dohan_back_rate,
          product_back_mode = p_product_back_mode, product_back_rate = p_product_back_rate,  -- ★0134
          product_back_fixed = p_product_back_fixed,                                         -- ★0134（0153 ★7: 末尾 ',' を足す）
          product_back_fixed_hon = p_product_back_fixed_hon, product_back_fixed_jonai = p_product_back_fixed_jonai,   -- ★7 0153
          product_back_fixed_free = p_product_back_fixed_free                                -- ★7 0153
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(c) into v_after from public.comp_plans c where c.id = v_id;
  perform public.audit_log_write('set_comp_plan', 'comp_plans:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★8 set_cast_plan（0154 全文・白名単 +3 のみ★）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_cast_plan(p_cast_id uuid, p_plan_id uuid, p_overrides jsonb, p_valid_from date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast_org    uuid;
  v_cast_store  uuid;
  v_plan_org    uuid;
  v_plan_store  uuid;
  v_plan_active boolean;
  v_before      jsonb;
  v_after       jsonb;
  v_key         text;
  v_num         numeric;
  v_cur_from    date;  -- ★mig0116: 現在行の valid_from
  v_emp         text;  -- ★5 0154: casts.employment（'委託'|'雇用'|null）
  v_rule        text;  -- ★5 0154: pay_rule（欠損＝'actual'）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- overrides 検証（②: キー制限＋値検証。null は {} と同義に正規化しない＝null 拒否）
  if p_overrides is null or jsonb_typeof(p_overrides) <> 'object' then raise exception 'bad overrides'; end if;
  for v_key in select jsonb_object_keys(p_overrides) loop
    if v_key not in ('base','honBack','jonaiBack','dohanBack',
                     'honBackMode','honBackRate','jonaiBackMode','jonaiBackRate',   -- ★5 0154: 末尾 ') then' → ','（3 キーを続ける）
                     'pay_rule','per_shift_amount','fixed_amount',                    -- ★5 0154: 裁定294-5 の 3 キー（0153 ★8: 末尾 ') then' → ','）
                     'productBackFixedHon','productBackFixedJonai','productBackFixedFree') then   -- ★8 0153: 裁定305-12 の 3 キー（number ≥0 整数＝既存分岐）
      raise exception 'bad overrides';
    end if;
    if v_key in ('honBackMode','jonaiBackMode') then
      -- ★mig0086: 方式キーは文字列2値
      if jsonb_typeof(p_overrides -> v_key) <> 'string'
         or (p_overrides ->> v_key) not in ('per_count','rate') then
        raise exception 'bad overrides';
      end if;
    elsif v_key = 'pay_rule' then                                                     -- ★5 0154: 報酬型キーは文字列 4 値（honBackMode と同型）
      if jsonb_typeof(p_overrides -> v_key) <> 'string'                                -- ★5
         or (p_overrides ->> v_key) not in ('actual','shift_guarantee','fixed','per_shift') then   -- ★5
        raise exception 'bad overrides';                                                -- ★5
      end if;                                                                           -- ★5
    else
      if jsonb_typeof(p_overrides -> v_key) <> 'number' then raise exception 'bad overrides'; end if;
      v_num := (p_overrides ->> v_key)::numeric;
      if v_num < 0 or v_num <> trunc(v_num) then raise exception 'bad overrides'; end if;
      -- ★mig0086: 率キーは 0..100
      if v_key in ('honBackRate','jonaiBackRate') and v_num > 100 then
        raise exception 'bad overrides';
      end if;
    end if;
  end loop;
  -- ★mig0086: 原子性（設計v1）＝mode だけ上書きして値が plan 側から来る合成を拒否。
  --   mode='rate' → rate 必須／mode='per_count' → 円/本値必須／rate 単独（mode なし・mode≠rate）拒否。
  if (p_overrides ? 'honBackMode') then
    if (p_overrides ->> 'honBackMode') = 'rate' and not (p_overrides ? 'honBackRate') then
      raise exception 'bad overrides';
    end if;
    if (p_overrides ->> 'honBackMode') = 'per_count' and not (p_overrides ? 'honBack') then
      raise exception 'bad overrides';
    end if;
  end if;
  if (p_overrides ? 'honBackRate')
     and (not (p_overrides ? 'honBackMode') or (p_overrides ->> 'honBackMode') <> 'rate') then
    raise exception 'bad overrides';
  end if;
  if (p_overrides ? 'jonaiBackMode') then
    if (p_overrides ->> 'jonaiBackMode') = 'rate' and not (p_overrides ? 'jonaiBackRate') then
      raise exception 'bad overrides';
    end if;
    if (p_overrides ->> 'jonaiBackMode') = 'per_count' and not (p_overrides ? 'jonaiBack') then
      raise exception 'bad overrides';
    end if;
  end if;
  if (p_overrides ? 'jonaiBackRate')
     and (not (p_overrides ? 'jonaiBackMode') or (p_overrides ->> 'jonaiBackMode') <> 'rate') then
    raise exception 'bad overrides';
  end if;
  -- cast の org/store 照合＋ロール判定（manager 以上・自店のみ）
  select org_id, store_id, employment into v_cast_org, v_cast_store, v_emp from public.casts where id = p_cast_id;   -- ★5 0154: employment を併読
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- plan の org/store 照合＋inactive 遮断（廃止プランへの新規割当は誤操作経路）
  -- 既存の cast_plan 行には触れない＝プラン廃止（is_active=false）で既割当は壊れない設計。
  select org_id, store_id, is_active into v_plan_org, v_plan_store, v_plan_active
    from public.comp_plans where id = p_plan_id;
  if v_plan_org is null or v_plan_org <> public.auth_org_id() or v_plan_store <> v_cast_store then
    raise exception 'forbidden';
  end if;
  if not v_plan_active then raise exception 'plan inactive'; end if;
  -- ★5 0154（裁定294-5）: 報酬型 × 雇用区分（shift_guarantee／fixed＝雇用のみ・per_shift＝委託のみ・欠損＝'actual'＝検査なし）
  v_rule := coalesce(p_overrides ->> 'pay_rule', 'actual');                                                                 -- ★5
  if v_rule in ('shift_guarantee','fixed') and v_emp is distinct from '雇用' then raise exception 'bad pay_rule for employment'; end if;   -- ★5
  if v_rule = 'per_shift' and v_emp is distinct from '委託' then raise exception 'bad pay_rule for employment'; end if;                    -- ★5

  select to_jsonb(cp) into v_before from public.cast_plan cp
   where cp.cast_id = p_cast_id and cp.valid_to is null;

  if p_valid_from is null then
    -- ★mig0114/0116: null＝現在行の上書き（0114 と同値の経路・完全互換）
    insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json)
    values (p_cast_id, v_cast_org, v_cast_store, p_plan_id, p_overrides)
    on conflict (cast_id) where valid_to is null do update
      set plan_id = excluded.plan_id, overrides_json = excluded.overrides_json,
          store_id = excluded.store_id;
  else
    -- ★mig0116（裁定96-④）: 履歴生成。過去日と現在行 valid_from 以前を拒否
    if p_valid_from < current_date then raise exception 'bad valid_from'; end if;
    v_cur_from := null;
    select cp.valid_from into v_cur_from from public.cast_plan cp
     where cp.cast_id = p_cast_id and cp.valid_to is null;
    if v_cur_from is not null then
      if p_valid_from <= v_cur_from then raise exception 'bad valid_from'; end if;
      update public.cast_plan
         set valid_to = p_valid_from - 1, updated_at = now()
       where cast_id = p_cast_id and valid_to is null;
    end if;
    insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json, valid_from)
    values (p_cast_id, v_cast_org, v_cast_store, p_plan_id, p_overrides, p_valid_from);
  end if;

  select to_jsonb(cp) into v_after from public.cast_plan cp
   where cp.cast_id = p_cast_id and cp.valid_to is null;
  perform public.audit_log_write('set_cast_plan', 'cast_plan:' || p_cast_id::text, v_before, v_after, v_cast_store);
  return p_cast_id;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★9 check_close（0152 全文・宣言 3 行＋解決 1 箇所＋凍結 1 箇所＋顧客更新 1 箇所のみ★）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_close(p_check_id uuid, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_g record; v_due int; v_paid int; v_lines int;
  v_cast_ids uuid[]; v_weights int[]; v_n int; v_sumw int := 0;
  v_drink int[]; v_champ int[]; v_bottle int[]; v_pt int[];
  v_alloc int[]; v_rem int[]; v_used boolean[];
  v_line record; v_unit int; v_rest int; v_best int; i int; c int;
  v_org uuid;  -- ★0057(2)
  v_kinds text[]; v_dohans boolean[];  -- ★0119 裁定100: キャスト別種別/同伴
  v_bizdate date;                       -- ★0132 裁定113: 伝票営業日(started_at 起点)
  v_modes text[]; v_rates int[];        -- ★0132: cast 別の商品バック方式/率
  v_salesbase int[];                    -- ★0132: 同腕の按分売上母数(plan_rate/plan_fixed 監査用)
  v_units int[]; v_fixeds int[];        -- ★0133 裁定123: 同腕の按分本数Σ / cast 別の円/本固定額
  v_mode text; v_rate int; v_fixed int; -- ★0132/0133: 解決作業用
  v_ov jsonb[]; v_pf_hon int[]; v_pf_jonai int[]; v_pf_free int[]; v_fixedamt int[];   -- ★9 0153（305-12）: cast 別の overrides／プラン区分別／plan_fixed の凍結額
  v_ovj jsonb; v_pfh int; v_pfj int; v_pff int; v_reg text; v_funit int;               -- ★9 0153: 解決作業用
  v_years int;                                                                          -- ★9 0153（305-11）: customer_retention_years（既定 5）
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  -- 冪等: 同一キーで closed 済みなら成功を返す
  if v_chk.status = 'closed' then
    if p_idem_key is not null and v_chk.close_idem_key = p_idem_key then return p_check_id; end if;
    raise exception 'not open';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_lines from public.check_lines where check_id = p_check_id;
  if v_lines = 0 then raise exception 'empty check'; end if;

  -- 全 group 充足(∀g: paid(g) ≥ due(g))＋ total 確定
  perform public.check_recalc(p_check_id);
  for v_g in select distinct pay_group from public.check_lines where check_id = p_check_id
  loop
    v_due := public.check_group_due(p_check_id, v_g.pay_group);
    select coalesce(sum(amount), 0)::int into v_paid
      from public.payments where check_id = p_check_id and pay_group = v_g.pay_group;
    if v_paid < v_due then raise exception 'balance remaining'; end if;
  end loop;
  v_before := to_jsonb(v_chk);

  -- 分配(最大剰余法・精密仕様 §2.2.1・back_snapshot 凍結値・pt は nom_kind='hon' の行のみ=裁定100)
  select array_agg(cast_id order by position, created_at, id),
         array_agg(ratio_weight order by position, created_at, id),
         array_agg(nom_kind order by position, created_at, id),
         array_agg(is_dohan order by position, created_at, id)
    into v_cast_ids, v_weights, v_kinds, v_dohans
    from public.check_nominations where check_id = p_check_id;
  if v_cast_ids is not null then
    v_n := array_length(v_cast_ids, 1);
    for i in 1..v_n loop v_sumw := v_sumw + v_weights[i]; end loop;
    if v_sumw > 0 then  -- ★0124 判断B: 全 weight 0(全員 ended 等)=按分なし(整数除算ガード)
    v_drink := array_fill(0, array[v_n]); v_champ := array_fill(0, array[v_n]);
    v_bottle := array_fill(0, array[v_n]); v_pt := array_fill(0, array[v_n]);
    v_salesbase := array_fill(0, array[v_n]);  -- ★0132
    v_units := array_fill(0, array[v_n]);      -- ★0133
    -- ★0132 裁定113: 伝票営業日(started_at)時点の cast_plan から商品バック方式を cast 別に解決。
    --   解決不能(割当なし)=既定 product_rule。重複有効行は valid_from 降順の先頭(決定的・close は止めない)。
    v_bizdate := public.biz_date_of(v_chk.store_id, v_chk.started_at);
    v_modes := array_fill('product_rule'::text, array[v_n]);
    v_rates := array_fill(0, array[v_n]);
    v_fixeds := array_fill(0, array[v_n]);     -- ★0133
    v_ov := array_fill('{}'::jsonb, array[v_n]); v_pf_hon := array_fill(null::int, array[v_n]); v_pf_jonai := array_fill(null::int, array[v_n]);   -- ★9 0153
    v_pf_free := array_fill(null::int, array[v_n]); v_fixedamt := array_fill(0, array[v_n]);                                                        -- ★9 0153
    for i in 1..v_n loop
      select p.product_back_mode, coalesce(p.product_back_rate, 0), coalesce(p.product_back_fixed, 0),
             coalesce(cp.overrides_json, '{}'::jsonb), p.product_back_fixed_hon, p.product_back_fixed_jonai, p.product_back_fixed_free   -- ★9 0153: 区分別の器を併読
        into v_mode, v_rate, v_fixed, v_ovj, v_pfh, v_pfj, v_pff
        from public.cast_plan cp
        join public.comp_plans p on p.id = cp.plan_id
       where cp.cast_id = v_cast_ids[i]
         and cp.org_id = v_chk.org_id
         and cp.valid_from <= v_bizdate
         and (cp.valid_to is null or cp.valid_to >= v_bizdate)
       order by cp.valid_from desc
       limit 1;
      if found then v_modes[i] := v_mode; v_rates[i] := v_rate; v_fixeds[i] := v_fixed;
        v_ov[i] := v_ovj; v_pf_hon[i] := v_pfh; v_pf_jonai[i] := v_pfj; v_pf_free[i] := v_pff;   -- ★9 0153
      end if;
    end loop;
    for v_line in
      select * from public.check_lines
       where check_id = p_check_id and product_id is not null
         and kind in ('drink','champ','bottle') and back_snapshot is not null
         -- ★mig0070: キャストドリンクは按分から除外(凍結値で判定・キー無し=false=按分対象)
         and coalesce((check_lines.back_snapshot ->> 'back_exempt')::boolean, false) = false
    loop
      -- 分配単価(productBackOf と同一規則・凍結値)。★0119: unit4 はキャスト別キーで集計ループ内に解決
      if (v_line.back_snapshot ->> 'back_mode') is distinct from 'unit4' then
        v_unit := round(v_line.unit_price_snapshot
                        * coalesce((v_line.back_snapshot ->> 'back_value')::numeric, 0) / 100.0)::int;
      end if;
      -- 数量の最大剰余法分配(床=整数除算・剰余降順→position 昇順)
      v_alloc := array_fill(0, array[v_n]); v_rem := array_fill(0, array[v_n]);
      v_used := array_fill(false, array[v_n]);
      v_rest := v_line.qty;
      for i in 1..v_n loop
        v_alloc[i] := (v_line.qty * v_weights[i]) / v_sumw;
        v_rem[i]   := (v_line.qty * v_weights[i]) % v_sumw;
        v_rest := v_rest - v_alloc[i];
      end loop;
      for c in 1..v_rest loop
        v_best := 0;
        for i in 1..v_n loop
          if not v_used[i] and (v_best = 0 or v_rem[i] > v_rem[v_best]) then v_best := i; end if;
        end loop;
        v_used[v_best] := true;
        v_alloc[v_best] := v_alloc[v_best] + 1;
      end loop;
      -- 集計(★0132: cast 別 mode で分岐。同一行集合・同一 v_alloc=同腕)
      for i in 1..v_n loop
        if v_alloc[i] > 0 then
          if v_modes[i] = 'plan_rate' then
            -- ★0132: 売上按分のみ凍結(商品3列は加算しない)
            v_salesbase[i] := v_salesbase[i] + v_line.unit_price_snapshot * v_alloc[i];
          elsif v_modes[i] = 'plan_fixed' then
            -- ★0133: 売上按分(監査用)+按分本数を凍結(商品3列は加算しない)
            v_salesbase[i] := v_salesbase[i] + v_line.unit_price_snapshot * v_alloc[i];
            v_units[i] := v_units[i] + v_alloc[i];
            -- ★9 0153（305-12／296 追補2）: 1 本あたり固定額の解決順＝商品 unit4（back_mode='unit4'）→ cast_plan 区分別 → comp_plans 区分別 → 一律。同伴＝本指名（unit4 は自分の dohan キー）
            v_reg := public.nom_unit4_key(v_kinds[i], v_dohans[i]);
            v_funit := null;
            if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
              v_funit := (v_line.back_snapshot -> 'unit4' ->> v_reg)::int;
            end if;
            if v_reg = 'dohan' then v_reg := 'hon'; end if;
            if v_funit is null then v_funit := (v_ov[i] ->> ('productBackFixed' || initcap(v_reg)))::int; end if;
            if v_funit is null then v_funit := case v_reg when 'hon' then v_pf_hon[i] when 'jonai' then v_pf_jonai[i] else v_pf_free[i] end; end if;
            if v_funit is null then v_funit := v_fixeds[i]; end if;
            v_fixedamt[i] := v_fixedamt[i] + v_funit * v_alloc[i];
          elsif v_modes[i] = 'product_rule' then
            if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
              v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> public.nom_unit4_key(v_kinds[i], v_dohans[i]))::int, 0);
            end if;
            if v_line.kind = 'drink'  then v_drink[i]  := v_drink[i]  + v_unit * v_alloc[i]; end if;
            if v_line.kind = 'champ'  then v_champ[i]  := v_champ[i]  + v_unit * v_alloc[i]; end if;
            if v_line.kind = 'bottle' then v_bottle[i] := v_bottle[i] + v_unit * v_alloc[i]; end if;
          end if;
          -- pt は3択の射程外=全 mode 共通(裁定113)
          if v_kinds[i] = 'hon' then  -- ★0119: pt は本指名キャストの行のみ
            v_pt[i] := v_pt[i] + coalesce((v_line.back_snapshot ->> 'hon_pt')::int, 0) * v_alloc[i];
          end if;
        end if;
      end loop;
    end loop;
    -- ★0132/0133: mode 別の凍結書込(ゼロ専用行は作らない)
    for i in 1..v_n loop
      if v_modes[i] = 'plan_rate' then
        if v_pt[i] > 0 or v_salesbase[i] > 0 then
          insert into public.check_cast_backs
            (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc,
             source_mode, product_sales_base, calculated_back_amount)
          values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                  0, 0, 0, v_pt[i],
                  'plan_rate', v_salesbase[i],
                  round((v_salesbase[i]::numeric * v_rates[i]) / 100.0)::int);
        end if;
      elsif v_modes[i] = 'plan_fixed' then
        -- ★0133: 1本あたり固定額=按分本数Σ×固定額を凍結(plan_rate と同型・payOf 例外を廃止)
        if v_pt[i] > 0 or v_salesbase[i] > 0 or v_units[i] > 0 then
          insert into public.check_cast_backs
            (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc,
             source_mode, product_sales_base, calculated_back_amount)
          values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                  0, 0, 0, v_pt[i],
                  'plan_fixed', v_salesbase[i], v_fixedamt[i]);   -- ★9 0153: 区分別の解決額Σ（全部 null なら v_units×一律と同値＝従来）
        end if;
      else
        if v_drink[i] + v_champ[i] + v_bottle[i] + v_pt[i] > 0 then
          insert into public.check_cast_backs
            (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc,
             source_mode, product_sales_base, calculated_back_amount)
          values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                  v_drink[i], v_champ[i], v_bottle[i], v_pt[i],
                  'product_rule', null, null);
        end if;
      end if;
    end loop;
    end if;  -- ★0124 判断B ガード終端
  end if;

  -- ★14 0152（裁定298-10）: 紹介の凍結（frozen_at）＋ 未払 1 件（amount>0 のみ＝298-6 D11・unpaid・withholding 0・営業日＝started_at 起点）。二重 insert は not exists と unique(check_id) の二重化
  update public.check_referrals set frozen_at = now() where check_id = p_check_id and frozen_at is null;
  insert into public.referral_payouts (org_id, store_id, referrer_id, check_id, biz_date, amount, withholding, status)
  select r.org_id, r.store_id, r.referrer_id, r.check_id, public.biz_date_of(v_chk.store_id, v_chk.started_at), r.amount, 0, 'unpaid'
    from public.check_referrals r
   where r.check_id = p_check_id and r.amount > 0
     and not exists (select 1 from public.referral_payouts p where p.check_id = p_check_id);
  -- ★9 0153（305-11／293-4）: 伝票に紐づく顧客の last_visit_at＝now()・retention_until＝＋店設定 customer_retention_years（既定 5）
  select coalesce(nullif(s.settings_json->>'customer_retention_years', '')::int, 5) into v_years from public.stores s where s.id = v_chk.store_id;
  update public.customers cu
     set last_visit_at = now(), retention_until = (now() + make_interval(years => coalesce(v_years, 5)))::date, updated_at = now()
   where cu.id in (select cc.customer_id from public.check_customers cc where cc.check_id = p_check_id)
      or cu.id = v_chk.customer_id;
  update public.checks
     set status = 'closed', closed_at = now(), close_idem_key = p_idem_key
   where id = p_check_id;
  -- ★mig0053(B1 相席・transient): 追加席の占有を解放(解放経路=ロック不要・money 非干渉)
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_close', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
  return p_check_id;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★10 check_open（live 全文・新規開栓の直後に 1 箇所のみ★）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_open(p_seat_id uuid, p_people integer DEFAULT NULL::integer, p_nom_type text DEFAULT 'free'::text, p_customer_id uuid DEFAULT NULL::uuid, p_set_rule_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_seat record; v_id uuid; v_actor uuid;
  v_rate int; v_unit int; v_mode text;
  v_smin int; v_sfee int; v_emin int; v_efee int; v_tper text;
  v_org uuid;  -- ★0057(2)
  r_set record; r_ext record; r_doh record; v_dfee int;  -- ★0084
  v_units int;  -- ★0089
  v_dow2 smallint; v_bm2 int; v_cut2 int; v_settings2 jsonb; v_cutoff2 text; v_seatk text;  -- ★mig0098
  v_ext_menu jsonb;  -- ★mig0098 R2-1: 延長メニュー凍結
  v_bts text; v_pd text; v_trnd text;  -- ★mig0113: 税設定の凍結
  v_cat_name text;  -- ★mig0128(裁定116-2): 区分名の凍結用
  v_rule_name text;  -- ★mig0129(裁定119): 適用ルール名の凍結用
  r_vip record; v_vfee int; v_vunit text; v_vname text; v_vunits int; v_vid uuid;  -- ★mig0130(裁定118): vip_charge
  v_sunit text; v_eunit text;  -- ★mig0130: set/ext の実効課金単位(rule.billing_unit ?? time_per)
begin
  -- ★0057(1): null guard 二重化（認証者でも register kiosk でもない→遮断）
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_people is not null and p_people <= 0 then raise exception 'bad people'; end if;
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  -- ★mig0053（裁定(c)）: seats 行ロック＝同一卓への占有変更（open/相席追加/移動/予約来店）を直列化。
  --   for update of s＝seats 行のみ（stores を巻き込まない）。org 不一致等は直後の raise で
  --   即 rollback＝ロックは解放される。
  select s.id, s.org_id, s.store_id, s.is_active, s.kind,
         st.service_rate, st.round_unit, st.round_mode,
         st.set_min, st.set_fee, st.ext_min, st.ext_fee, st.time_per,
         st.dohan_fee,
         st.business_tax_status, st.price_display, st.tax_rounding  -- ★mig0113
    into v_seat
    from public.seats s join public.stores st on st.id = s.store_id
    where s.id = p_seat_id
    for update of s;
  if v_seat.id is null or v_seat.org_id <> v_org then raise exception 'forbidden'; end if;
  perform public.assert_day_open(v_seat.store_id, public.biz_date_of(v_seat.store_id, now()));
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_seat.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_seat.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_seat.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（register device × 有効 operator セッション＝裁定11 単一判定点）
          or (v_seat.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;

  -- 顧客紐付け（束2）: 同 org・卓の店と同店のみ許可（越境封鎖）
  if p_customer_id is not null then
    if not exists (
      select 1 from public.customers cu
      where cu.id = p_customer_id
        and cu.org_id = v_org
        and cu.store_id = v_seat.store_id
    ) then
      raise exception 'invalid customer';
    end if;
  end if;

  -- 既存 open を再利用（0038/0040 型・自然冪等）
  -- ★mig0053（B1 相席）: 主席 ∪ 追加席の union＝追加席タップでもホスト伝票を返す（同一会計挙動）。
  --   追加席腕は open の check に限定（transient の防御深度）＋org 限定（返す伝票は org 内のみ）。
  select x.check_id into v_id from (
    select id as check_id from public.checks
      where seat_id = p_seat_id and status = 'open' and org_id = v_org
    union
    select cs.check_id from public.check_seats cs
      join public.checks c on c.id = cs.check_id
      where cs.seat_id = p_seat_id and c.status = 'open' and c.org_id = v_org
  ) x
  limit 1;
  if v_id is not null then return v_id; end if;

  -- ★mig0128(裁定116-2): 区分検証(同 org・同店・active のみ)。null=全区分=現行同値。
  --   配置は既存 open 再利用の後=区分は「新規開栓の凍結時」にのみ意味を持つ
  --   (再利用返却の冪等挙動は不変)。名称も同時取得=checks へ凍結(マスタ改名は非遡及)
  if p_category_id is not null then
    select pc.name into v_cat_name
      from public.pricing_categories pc
     where pc.id = p_category_id
       and pc.org_id = v_org
       and pc.store_id = v_seat.store_id
       and pc.is_active;
    if v_cat_name is null then raise exception 'bad category'; end if;
  end if;

  -- ★mig0084: 料金ルール解決（設計書 v1.2・凍結=開栓時）。
  --   now() はトランザクション内不変＝下の insert の started_at (default now()) と
  --   同一時刻＝解決時刻と凍結時刻が厳密に一致（帯境界の競合なし）。
  --   0行＝各変数 null → 下の coalesce で stores フォールバック＝ルール0件の店は
  --   改稿前と完全同値（golden 構造保証）。dohan のみ nullable スナップ
  --   （ルール0件は null 凍結・check_dohan_add 時に stores 現在値へフォールバック）。
  --   ルール一致だが duration_min null の場合は額のみルール・分数は stores 既定。
  --   ★mig0128: 区分を3呼びすべてへ引渡し(裁定116-2・区分も開栓凍結=裁定117)
  --   ★mig0130(裁定118): 4呼び目=vip_charge(VIP 限定は seat_kind 条件で表現=特殊分岐なし)
  select * into r_set from public.pricing_resolve_core(v_seat.store_id, now(), 'set',        v_seat.kind, null, p_category_id);
  select * into r_ext from public.pricing_resolve_core(v_seat.store_id, now(), 'extension',  v_seat.kind, null, p_category_id);
  select * into r_doh from public.pricing_resolve_core(v_seat.store_id, now(), 'dohan',      v_seat.kind, null, p_category_id);
  select * into r_vip from public.pricing_resolve_core(v_seat.store_id, now(), 'vip_charge', v_seat.kind, null, p_category_id);  -- ★mig0130

  -- ★mig0098 R2-5: 開卓時ルール手動選択（override）。null=自動一致（現行完全互換）。
  --   検証: 同店・fee_kind='set'・is_active（他店/他種/無効は 'bad rule'）。選び直し不可＝
  --   開卓やり直し（void→再開卓）の現行運用（設計書 R2-5）
  --   ★mig0128: override は明示選択につき区分フィルタ不適用（区分違いのルールも指名可）
  --   ★mig0130: billing_unit も指名ルールから取得(select へ追加)
  if p_set_rule_id is not null then
    select r.amount as amount, r.duration_min as duration_min, r.id as rule_id,
           r.billing_unit as billing_unit into r_set
      from public.pricing_rules r
     where r.id = p_set_rule_id and r.store_id = v_seat.store_id
       and r.fee_kind = 'set' and r.is_active;
    if r_set.rule_id is null then raise exception 'bad rule'; end if;
  end if;

  -- ★mig0129(裁定119): 適用セットルールの凍結。r_set.rule_id は自動解決 or override 確定値。
  --   name null ルールは null 凍結(UI 非表示規則)・フォールバック(rule_id null)は両列 null
  --   =0129 以前の既存伝票と同表現(区別しない・「基本料金」誤表示経路を作らない)
  if r_set.rule_id is not null then
    select r.name into v_rule_name
      from public.pricing_rules r
     where r.id = r_set.rule_id;
  end if;

  -- ★mig0098 R2-1/R2-2/R2-4: 延長メニュー全件を開栓時に凍結（priority 順・limit なし）。
  --   ★鏡像規律: 下の where は pricing_resolve_core（extension・rank null 呼び）と同一式。
  --     core は limit 1・こちらは全件列挙という差のみ。条件を変えるときは必ず同時改修
  --     （core 側は pin 保全のため不触＝相互参照は本コメントと R2 設計書 v1.1 が正）
  --   ★mig0128(教訓52): 区分条件・区分優先順を core と同時挿入(鏡像2点セット)。
  --     以後 resolve 条件を変えるときは core+本 where の同時改修が必須
  --   ★mig0130: 各項目へ unit キー(実効単位=rule.billing_unit ?? time_per)を凍結追加
  select b.biz_dow, b.biz_min into v_dow2, v_bm2
    from public.biz_minutes_of(v_seat.store_id, now()) b;
  select s.settings_json into v_settings2 from public.stores s where s.id = v_seat.store_id;
  v_cutoff2 := coalesce(nullif(trim(coalesce(v_settings2, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  v_cut2 := split_part(v_cutoff2, ':', 1)::int * 60 + split_part(v_cutoff2, ':', 2)::int;
  v_seatk := coalesce(v_seat.kind, '卓');
  select coalesce(jsonb_agg(jsonb_build_object(
           'rule_id', r.id,
           'duration_min', coalesce(r.duration_min, v_seat.ext_min),
           'amount', r.amount,
           'unit', coalesce(r.billing_unit, v_seat.time_per),  -- ★mig0130: 実効単位の凍結
           'label', '延長 ' || coalesce(r.duration_min, v_seat.ext_min) || '分 ¥' || r.amount)
         order by r.priority asc, (r.category_id is not null) desc,  -- ★mig0128: 同 priority 内区分一致優先(core と鏡像)
                  r.created_at asc, r.id asc), '[]'::jsonb)
    into v_ext_menu
    from public.pricing_rules r
   where r.store_id = v_seat.store_id
     and r.is_active
     and r.fee_kind = 'extension'
     and (r.seat_kind is null or r.seat_kind = v_seatk)
     and (r.rank_id is null)  -- core は rank null 呼び＝(rank_id is null or rank_id = null) と等価
     and (r.category_id is null or r.category_id = p_category_id)  -- ★mig0128(教訓52 鏡像)
     and (r.dow_mask is null or ((r.dow_mask >> v_dow2) & 1) = 1)
     and (r.time_from_min is null
          or ( (case when r.time_from_min <  v_cut2 then r.time_from_min + 1440 else r.time_from_min::int end) <= v_bm2
           and v_bm2 < (case when r.time_to_min <= v_cut2 then r.time_to_min + 1440 else r.time_to_min::int end) ));

  -- 【決定1】店設定のスナップショット（E1 mig0051: 読み元を settings_json から stores 列へ。
  --   既定 10/100/down は列 default と同値＝挙動不変。列 CHECK が正・下の raise は防御深度
  --   ＝列の型変更/削除事故の検知用に残置）
  --   B4 mig0052: 時間制5値（set_min/set_fee/ext_min/ext_fee/time_per）を同スナップへ追補
  --   （非遡及＝open 中伝票は旧料金表・time_mode は運用トグルゆえ非スナップ＝裁定(g)）
  --   ★mig0084: set/extension は pricing_rules 解決値を優先・0行は stores（＝「基本料金」）
  --   ★mig0113: 税設定3値を同スナップへ追補（非遡及＝open 中伝票は旧税設定）
  --   ★mig0128: 区分2値（category_id/category_name）を同スナップへ追補（非遡及・開栓凍結）
  --   ★mig0129: 適用ルール2値（set_rule_id/set_rule_name）を同スナップへ追補（非遡及・開栓凍結）
  --   ★mig0130: 単位系4値（set_unit/ext_unit/vip_charge_fee/vip_charge_unit）を同スナップへ追補
  --     (実効単位=rule.billing_unit ?? time_per・vip はルール0件=両値 null=dohan_fee 同型)
  v_rate := v_seat.service_rate;
  v_unit := v_seat.round_unit;
  v_mode := v_seat.round_mode;
  v_smin := coalesce(r_set.duration_min, v_seat.set_min);
  v_sfee := coalesce(r_set.amount,       v_seat.set_fee);
  v_emin := coalesce(r_ext.duration_min, v_seat.ext_min);
  v_efee := coalesce(r_ext.amount,       v_seat.ext_fee);
  v_tper := v_seat.time_per;
  v_dfee := r_doh.amount;  -- ★0行= null（裁定②）
  v_bts  := v_seat.business_tax_status;  -- ★mig0113
  v_pd   := v_seat.price_display;        -- ★mig0113
  v_trnd := v_seat.tax_rounding;         -- ★mig0113
  v_sunit := coalesce(r_set.billing_unit, v_tper);  -- ★mig0130
  v_eunit := coalesce(r_ext.billing_unit, v_tper);  -- ★mig0130
  v_vfee  := r_vip.amount;  -- ★mig0130: 0行=null(dohan 同型)
  v_vunit := case when r_vip.rule_id is not null
                  then coalesce(r_vip.billing_unit, v_tper) end;  -- ★mig0130
  if v_rate < 0 or v_unit < 1 or v_mode not in ('up','down','round') then
    raise exception 'bad store settings';
  end if;
  if v_smin < 1 or v_emin < 1 or v_sfee < 0 or v_efee < 0 or v_tper not in ('table','person') then
    raise exception 'bad store settings';
  end if;
  -- ★mig0113: 防御深度（列 CHECK が正・型変更/削除事故の検知用）
  if v_bts not in ('taxable','exempt') or v_pd not in ('tax_included','tax_excluded')
     or v_trnd not in ('floor','round','ceil') then
    raise exception 'bad store settings';
  end if;
  -- ★mig0130: 防御深度(単位2値)
  if v_sunit not in ('person','table') or v_eunit not in ('person','table') then
    raise exception 'bad store settings';
  end if;

  -- ★0057(4): actor＝operator 優先（checks.created_by NOT NULL を kiosk でも充足）
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  insert into public.checks (org_id, store_id, seat_id, people, nom_type,
                             service_rate, round_unit, round_mode,
                             set_min, set_fee, ext_min, ext_fee, time_per,
                             dohan_fee,
                             created_by, customer_id, ext_menu_snap,
                             business_tax_status, price_display, tax_rounding,  -- ★mig0113
                             category_id, category_name,  -- ★mig0128
                             set_rule_id, set_rule_name,  -- ★mig0129
                             set_unit, ext_unit, vip_charge_fee, vip_charge_unit)  -- ★mig0130
  values (v_org, v_seat.store_id, p_seat_id, p_people, p_nom_type,
          v_rate, v_unit, v_mode,
          v_smin, v_sfee, v_emin, v_efee, v_tper,
          v_dfee,
          v_actor, p_customer_id, v_ext_menu,
          v_bts, v_pd, v_trnd,  -- ★mig0113
          p_category_id, v_cat_name,  -- ★mig0128
          r_set.rule_id, v_rule_name,  -- ★mig0129
          v_sunit, v_eunit, v_vfee, v_vunit)  -- ★mig0130
  on conflict (seat_id) where status = 'open' do nothing
  returning id into v_id;
  if v_id is null then
    -- 競合＝先着の open を返す（0038 申し送り）
    select id into v_id from public.checks
      where seat_id = p_seat_id and status = 'open' and org_id = v_org
      limit 1;
    return v_id;
  end if;
  -- ★10 0153（裁定305-1）: 開栓時の顧客＝check_customers の position 0（checks.customer_id と併存＝同値）
  if p_customer_id is not null then
    insert into public.check_customers (org_id, store_id, check_id, customer_id, position, created_by)
    values (v_org, v_seat.store_id, v_id, p_customer_id, 0, v_actor);
  end if;
  -- ★mig0089: 開卓時に set 行を自動挿入（両モード共通・額>0 のみ＝時間課金を使わない
  --   店は現行同値）。auto 店は以後 check_time_charge_apply が同行を upsert 再計算。
  --   ★mig0130: units は set 実効単位(v_sunit)起点(既存店=billing_unit null→time_per=現行同値)
  v_units := case when v_sunit = 'person' then coalesce(p_people, 1) else 1 end;
  if v_sfee * v_units > 0 then
    insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                    name_snapshot, unit_price_snapshot, qty, line_total,
                                    back_snapshot, sort_order, time_auto, fee_kind, block_no)
    values (v_org, v_seat.store_id, v_id, null, 'time', 'A',
            'セット料金(' || v_smin || '分)', v_sfee, v_units, v_sfee * v_units,
            null, 1, true, 'set', 0);  -- ★mig0098 R2-7c: null 再生産の停止（0097b 吸収の本命側）
    perform public.check_recalc(v_id);
    -- ★_r2: 行単位 audit（原則6）。manual 店は apply が来ない＝ここが唯一の書込記録
    perform public.audit_log_write('check_open_set_line',
      'check_lines:' || (select l.id::text from public.check_lines l
                          where l.check_id = v_id and l.time_auto and l.fee_kind = 'set'),
      null,
      (select to_jsonb(l) from public.check_lines l
        where l.check_id = v_id and l.time_auto and l.fee_kind = 'set'),
      v_seat.store_id);
  end if;
  -- ★mig0130(裁定118): vip_charge 行の開栓時1回生成(額>0 のみ実体化・apply 非対象=裁定7)。
  --   kind='charge'・time_auto=true・block_no=0(0097b 教訓: null block_no の再生産禁止・
  --   部分ユニーク3列 (check_id,fee_kind,block_no) where time_auto と整合)・
  --   名称=coalesce(ルール名,'VIPチャージ')。back_snapshot=null=給与不干渉
  if r_vip.rule_id is not null then
    v_vunits := case when v_vunit = 'person' then coalesce(p_people, 1) else 1 end;
    if v_vfee * v_vunits > 0 then
      select r.name into v_vname from public.pricing_rules r where r.id = r_vip.rule_id;
      insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                      name_snapshot, unit_price_snapshot, qty, line_total,
                                      back_snapshot, sort_order, time_auto, fee_kind, block_no)
      values (v_org, v_seat.store_id, v_id, null, 'charge', 'A',
              coalesce(v_vname, 'VIPチャージ'), v_vfee, v_vunits, v_vfee * v_vunits,
              null, 2, true, 'vip_charge', 0)
      returning id into v_vid;
      perform public.check_recalc(v_id);
      -- 行単位 audit(原則6・set 行と同型=apply が来ない行につき唯一の書込記録)
      perform public.audit_log_write('check_open_vip_line',
        'check_lines:' || v_vid::text, null,
        (select to_jsonb(l) from public.check_lines l where l.id = v_vid),
        v_seat.store_id);
    end if;
  end if;
  perform public.audit_log_write('check_open', 'checks:' || v_id::text, null,
    (select to_jsonb(c) from public.checks c where c.id = v_id)
      || case when p_set_rule_id is not null
              then jsonb_build_object('override_rule_id', p_set_rule_id)
              else '{}'::jsonb end,
    v_seat.store_id);
  return v_id;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★11 check_merge（live 全文・席の付け替え直後に 1 箇所のみ★）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_merge(p_from_check_id uuid, p_into_check_id uuid, p_reason text, p_idem_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid; v_from public.checks; v_into public.checks; v_lines int; v_noms int; v_seats int;
begin
  if p_from_check_id is null or p_into_check_id is null or p_idem_key is null then raise exception 'forbidden'; end if;
  v_org := public.auth_org_id();
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_from_check_id = p_into_check_id then raise exception 'forbidden'; end if;

  select * into v_from from public.checks where id = p_from_check_id for update;
  if not found then raise exception 'forbidden'; end if;
  select * into v_into from public.checks where id = p_into_check_id for update;
  if not found then raise exception 'forbidden'; end if;
  if v_from.store_id <> v_into.store_id then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.stores s where s.id = v_from.store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;

  if not public.flag_enabled('reopen_flow', v_from.store_id) then raise exception 'feature_disabled:reopen_flow'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_from.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then raise exception 'reason_required'; end if;

  -- 冪等: 同一キーで既に merged なら into を返す
  if v_from.status = 'merged' and v_from.merge_idem_key is not distinct from p_idem_key and v_from.merged_into = p_into_check_id then
    return p_into_check_id;
  end if;

  if v_from.status <> 'open' or v_into.status <> 'open' then raise exception 'merge_conflict:status'; end if;
  if exists (select 1 from public.check_referrals where check_id = p_from_check_id) then raise exception 'referral on from'; end if;   -- ★16 0152（裁定298-3）: from 側の紹介は先に remove させる
  if exists (select 1 from public.payments where check_id in (p_from_check_id, p_into_check_id))
     or exists (select 1 from public.receivables where check_id in (p_from_check_id, p_into_check_id)) then
    raise exception 'merge_conflict:money';
  end if;
  if exists (select 1 from public.check_nominations a join public.check_nominations b on a.cast_id = b.cast_id
              where a.check_id = p_from_check_id and b.check_id = p_into_check_id) then
    raise exception 'merge_conflict:cast';
  end if;
  if exists (select 1 from public.check_lines l where l.check_id in (p_from_check_id, p_into_check_id) and l.pay_group <> 'A') then
    raise exception 'merge_conflict:pay_group';
  end if;

  select count(*) into v_lines from public.check_lines where check_id = p_from_check_id;
  select count(*) into v_noms  from public.check_nominations where check_id = p_from_check_id;
  select count(*) into v_seats from public.check_seats where check_id = p_from_check_id;

  -- C③-20: from の自動時間料金行(set/vip_charge/extension・time_auto)は手動行へ変換して移す
  -- (into の自動行と check_lines_one_time_auto (check_id, fee_kind, block_no) WHERE time_auto が衝突するため。金額は凍結値のまま残す)
  update public.check_lines set time_auto = false, block_no = null
   where check_id = p_from_check_id and time_auto;
  update public.check_lines       set check_id = p_into_check_id where check_id = p_from_check_id;
  update public.check_nominations set check_id = p_into_check_id where check_id = p_from_check_id;
  update public.check_seats       set check_id = p_into_check_id where check_id = p_from_check_id;
  -- ★11 0153（裁定305）: from の顧客を into の末尾へ（into に既にいる顧客は skip・position は into の max+1 から from の position 順に詰める・check_lines.customer_id は行と一緒に移る）
  insert into public.check_customers (org_id, store_id, check_id, customer_id, position, created_by)
  select f.org_id, f.store_id, p_into_check_id, f.customer_id,
         (select coalesce(max(t.position), -1) from public.check_customers t where t.check_id = p_into_check_id) + row_number() over (order by f.position),
         f.created_by
    from public.check_customers f
   where f.check_id = p_from_check_id
     and not exists (select 1 from public.check_customers t where t.check_id = p_into_check_id and t.customer_id = f.customer_id)
   order by f.position;
  delete from public.check_customers where check_id = p_from_check_id;
  if v_into.customer_id is null then
    update public.checks set customer_id = (select f0.customer_id from public.check_customers f0 where f0.check_id = p_into_check_id and f0.position = 0) where id = p_into_check_id;
  end if;
  -- from の主席(checks.seat_id)は into の追加席へ(check_seats は UNIQUE(seat_id)=主席は未登録のため衝突しない)
  if v_from.seat_id is not null and v_from.seat_id <> v_into.seat_id then
    insert into public.check_seats (org_id, store_id, check_id, seat_id)
    values (v_org, v_from.store_id, p_into_check_id, v_from.seat_id)
    on conflict (seat_id) do update set check_id = excluded.check_id;
  end if;
  update public.checks set status = 'merged', merged_into = p_into_check_id, merge_idem_key = p_idem_key
   where id = p_from_check_id;
  perform public.check_recalc(p_into_check_id);

  perform public.audit_log_write('check_merge', 'checks:' || p_into_check_id::text,
    jsonb_build_object('from', p_from_check_id, 'into', p_into_check_id, 'from_total', v_from.total, 'into_total', v_into.total),
    jsonb_build_object('moved_lines', v_lines, 'moved_nominations', v_noms, 'moved_seats', v_seats, 'from_seat_id', v_from.seat_id,
                       'into_total', (select c.total from public.checks c where c.id = p_into_check_id)),
    v_from.store_id, p_reason);
  return p_into_check_id;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★12 check_customer_add（305-1: 末尾 position・'exists'・position 0 なら checks.customer_id も埋める）
-- ══════════════════════════════════════════════════════════════
create or replace function public.check_customer_add(p_check_id uuid, p_customer_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_org uuid := public.auth_org_id(); v_pos int; v_id uuid; v_actor uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_check_id is null or p_customer_id is null then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- 顧客は同 org・同店（check_open の 'invalid customer' と同型）
  if not exists (select 1 from public.customers cu where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = v_chk.store_id) then
    raise exception 'invalid customer';
  end if;
  if exists (select 1 from public.check_customers where check_id = p_check_id and customer_id = p_customer_id) then raise exception 'exists'; end if;
  select coalesce(max(cc.position), -1) + 1 into v_pos from public.check_customers cc where cc.check_id = p_check_id;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.check_customers (org_id, store_id, check_id, customer_id, position, created_by)
  values (v_org, v_chk.store_id, p_check_id, p_customer_id, v_pos, v_actor)
  returning id into v_id;
  -- 305-1: 最初の顧客＝checks.customer_id（併存・同値）
  if v_pos = 0 and v_chk.customer_id is null then
    update public.checks set customer_id = p_customer_id where id = p_check_id;
  end if;
  perform public.audit_log_write('check_customer_add', 'check_customers:' || v_id::text, null,
    (select to_jsonb(c) from public.check_customers c where c.id = v_id), v_chk.store_id);
  return v_id;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★13 check_customer_remove（305-3: 行の注文者を null に戻す・position 詰め直し・checks.customer_id は新 position 0 へ追従）
-- ══════════════════════════════════════════════════════════════
create or replace function public.check_customer_remove(p_check_id uuid, p_customer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_org uuid := public.auth_org_id(); v_row public.check_customers; v_lines int; v_first uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_check_id is null or p_customer_id is null then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select * into v_row from public.check_customers where check_id = p_check_id and customer_id = p_customer_id;
  if v_row.id is null then raise exception 'not on check'; end if;
  -- 305-3: その顧客が注文者の行は null に戻す（拒否しない）
  update public.check_lines set customer_id = null where check_id = p_check_id and customer_id = p_customer_id;
  get diagnostics v_lines = row_count;
  delete from public.check_customers where id = v_row.id;
  -- position 詰め直し（unique(check_id, position) を避けるため 2 段＝一旦 +1000 して並べ直す）
  update public.check_customers c set position = c.position + 1000 where c.check_id = p_check_id;   -- position は予約語（POSITION()）＝式では別名で参照する
  update public.check_customers c
     set position = r.rn - 1
    from (select x.id, row_number() over (order by x.position) rn from public.check_customers x where x.check_id = p_check_id) r
   where c.id = r.id;
  -- 305-3: position 0 が繰り上がったら checks.customer_id も追従（誰もいなければ null）
  select f0.customer_id into v_first from public.check_customers f0 where f0.check_id = p_check_id and f0.position = 0;
  update public.checks set customer_id = v_first where id = p_check_id and customer_id is distinct from v_first;
  perform public.audit_log_write('check_customer_remove', 'check_customers:' || v_row.id::text, to_jsonb(v_row),
    jsonb_build_object('lines_cleared', v_lines, 'new_first_customer', v_first), v_chk.store_id);
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★14 check_line_set_customer（305-2: 注文行の顧客＝後付け・null＝解除・伝票に付いていない顧客は 'not on check'）
-- ══════════════════════════════════════════════════════════════
create or replace function public.check_line_set_customer(p_line_id uuid, p_customer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_line record; v_chk record; v_org uuid := public.auth_org_id();
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_line_id is null then raise exception 'forbidden'; end if;
  select * into v_line from public.check_lines where id = p_line_id;
  if v_line.id is null or v_line.org_id <> v_org then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = v_line.check_id;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  if p_customer_id is not null and not exists (select 1 from public.check_customers where check_id = v_chk.id and customer_id = p_customer_id) then
    raise exception 'not on check';
  end if;
  update public.check_lines set customer_id = p_customer_id where id = p_line_id;
  perform public.audit_log_write('check_line_set_customer', 'check_lines:' || p_line_id::text,
    jsonb_build_object('customer_id', v_line.customer_id), jsonb_build_object('customer_id', p_customer_id), v_chk.store_id);
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★15 check_customer_names（305-4: 顧客名＋active なキープのボトル名だけ・can_register の cast にも開放・電話／メモ／誕生日／グレードは返さない・読取＝ゲート行なし＝要裁定 (1)）
-- ══════════════════════════════════════════════════════════════
create or replace function public.check_customer_names(p_check_id uuid)
returns table(customer_id uuid, pos integer, name text, bottle_names text[])   -- pos＝check_customers.position（RETURNS TABLE の列名に予約語 position は使えない）
language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_org uuid := public.auth_org_id();
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if p_check_id is null then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) is not true then
    raise exception 'forbidden';
  end if;
  return query
    select cc.customer_id, cc.position, cu.name,
           coalesce((select array_agg(coalesce(b.bottle_name, p.name) order by b.opened_at)
                       from public.bottle_keeps b join public.products p on p.id = b.product_id
                      where b.customer_id = cc.customer_id and b.status = 'active'), '{}'::text[])
      from public.check_customers cc join public.customers cu on cu.id = cc.customer_id
     where cc.check_id = p_check_id
     order by cc.position;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★16 bottle_keep_register（live 全文・署名 +2＝旧 7 引数版 drop・検証 1 箇所＋insert 1 箇所のみ★）
-- ══════════════════════════════════════════════════════════════
drop function if exists public.bottle_keep_register(uuid, uuid, uuid, text, integer, date, text);   -- ★16: 旧 7 引数版（0094）
CREATE OR REPLACE FUNCTION public.bottle_keep_register(p_store_id uuid, p_customer_id uuid, p_product_id uuid, p_note text DEFAULT NULL::text, p_remaining_pct integer DEFAULT NULL::integer, p_expires_on date DEFAULT NULL::date, p_shelf_no text DEFAULT NULL::text, p_bottle_name text DEFAULT NULL::text, p_check_line_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid;  -- ★0057(2): 初期化は null guard 後の coalesce 代入へ
  v_role      text := public.auth_role();
  v_store_org uuid;
  v_prod      record;
  v_id        uuid;
  v_line      record;  -- ★16 0153: 購入行（p_check_line_id）
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- store の org 照合（クロステナント遮断・set_product 型）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  -- ゲート（check_open 同型・can_register 準拠＝会計オペ）
  if (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())
          or (v_role = 'staff' and p_store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (v_role = 'cast' and p_store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（bottle_keep_register 足す＝確定②）
          or (p_store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;

  -- 顧客は同 org・同店（越境封鎖・null も不成立で raise）
  if not exists (
    select 1 from public.customers cu
    where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = p_store_id
  ) then
    raise exception 'invalid customer';
  end if;

  -- product 検証（check_add_line 同型: 同 org・同店・is_active）
  select * into v_prod from public.products where id = p_product_id;
  if v_prod.id is null or v_prod.org_id <> v_org
     or v_prod.store_id <> p_store_id then raise exception 'bad item'; end if;
  if not v_prod.is_active then raise exception 'inactive item'; end if;

  -- ★mig0094: 追加3列の入力検証（CHECK と同値・エラー文言を関数側で統一）
  if p_remaining_pct is not null and (p_remaining_pct < 0 or p_remaining_pct > 100) then
    raise exception 'bad remaining';
  end if;

  -- ★16 0153（305-6）: ボトル名（≤60・空→null）
  if p_bottle_name is not null and length(p_bottle_name) > 60 then raise exception 'bad bottle_name'; end if;
  -- ★16 0153: 購入行との紐づけ＝同店・同商品の行で、その行の伝票に紐づく顧客に限る（'bad line'／'not on check'）→ 行の注文者を持ち主にする（要裁定 (2)）
  if p_check_line_id is not null then
    select l.id, l.check_id, l.store_id, l.product_id into v_line from public.check_lines l where l.id = p_check_line_id and l.org_id = v_org;
    if v_line.id is null or v_line.store_id <> p_store_id or v_line.product_id is distinct from p_product_id then raise exception 'bad line'; end if;
    if not exists (select 1 from public.check_customers cc where cc.check_id = v_line.check_id and cc.customer_id = p_customer_id) then raise exception 'not on check'; end if;
    update public.check_lines set customer_id = p_customer_id where id = p_check_line_id;
  end if;
  insert into public.bottle_keeps (org_id, store_id, customer_id, product_id, status, opened_at, note, remaining_pct, expires_on, shelf_no, bottle_name)   -- ★16: 末尾 ')' → ', bottle_name)'
  values (v_org, p_store_id, p_customer_id, p_product_id, 'active', now(), p_note, p_remaining_pct, p_expires_on, p_shelf_no, nullif(trim(coalesce(p_bottle_name, '')), ''))   -- ★16
  returning id into v_id;

  perform public.audit_log_write('bottle_keep_register', 'bottle_keeps:' || v_id::text, null,
    (select to_jsonb(b) from public.bottle_keeps b where b.id = v_id), p_store_id);
  return v_id;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★17 bottle_keep_update（live 全文・署名 +1＝旧 6 引数版 drop・検証 1 行＋update 1 列のみ★）
-- ══════════════════════════════════════════════════════════════
drop function if exists public.bottle_keep_update(uuid, integer, date, text, text, text);   -- ★17: 旧 6 引数版（0094）
CREATE OR REPLACE FUNCTION public.bottle_keep_update(p_id uuid, p_remaining_pct integer, p_expires_on date, p_shelf_no text, p_status text, p_note text, p_bottle_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.bottle_keeps;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if p_status is null or p_status not in ('active','empty','removed') then raise exception 'bad status'; end if;
  if p_remaining_pct is not null and (p_remaining_pct < 0 or p_remaining_pct > 100) then
    raise exception 'bad remaining';
  end if;
  if p_bottle_name is not null and length(p_bottle_name) > 60 then raise exception 'bad bottle_name'; end if;   -- ★17 0153（305-6）

  select * into v_row from public.bottle_keeps where id = p_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  update public.bottle_keeps
     set remaining_pct = p_remaining_pct, expires_on = p_expires_on,
         shelf_no = p_shelf_no, status = p_status, note = p_note,
         bottle_name = nullif(trim(coalesce(p_bottle_name, '')), '')   -- ★17 0153: 末尾 ',' を足して 1 列
   where id = p_id;

  perform public.audit_log_write('bottle_keep_update', 'bottle_keeps:' || p_id::text, to_jsonb(v_row),
    (select to_jsonb(b) from public.bottle_keeps b where b.id = p_id), v_row.store_id);
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★18 bottle_keep_out（305-5／305-7・冪等・status active のみ・'keep not active'・在庫は減らさない＝product_id null＝在庫トリガ非発火）
-- ══════════════════════════════════════════════════════════════
create or replace function public.bottle_keep_out(p_keep_id uuid, p_check_id uuid, p_idem_key uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_keep record; v_pname text; v_id uuid; v_sort int;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1): null guard 二重化（認証者でも register kiosk でもない→遮断）
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_keep_id is null or p_check_id is null or p_idem_key is null then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（305-7）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  -- 冪等: 同一キーの行があればその id を返す（check_lines.idem_key＝0119 の器）
  select id into v_id from public.check_lines where check_id = p_check_id and idem_key = p_idem_key;
  if v_id is not null then return v_id; end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select b.*, p.name as product_name into v_keep from public.bottle_keeps b join public.products p on p.id = b.product_id
   where b.id = p_keep_id and b.org_id = v_org;
  if v_keep.id is null or v_keep.store_id <> v_chk.store_id then raise exception 'forbidden'; end if;
  if v_keep.status <> 'active' then raise exception 'keep not active'; end if;
  v_pname := coalesce(v_keep.bottle_name, v_keep.product_name);
  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  -- kind 'keep_out'・qty 1・unit_price 0・line_total 0・back_snapshot null（バック 0）・product_id null（在庫は販売時に減算済み＝トリガ非発火）・印字名「キープ出し」
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot, sort_order, customer_id, idem_key)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'keep_out', 'A',
          'キープ出し ' || v_pname, 0, 1, 0, null, v_sort, v_keep.customer_id, p_idem_key)
  returning id into v_id;
  update public.bottle_keeps set last_used_at = now(), updated_at = now() where id = p_keep_id;   -- 305-5
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('bottle_keep_out', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id) || jsonb_build_object('keep_id', p_keep_id), v_chk.store_id);
  return v_id;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★20 customer_sales_summary（305-9・owner／manager 自店・読取＝ゲート行なし＝要裁定 (1)）
-- ══════════════════════════════════════════════════════════════
create or replace function public.customer_sales_summary(p_store_id uuid, p_from date, p_to date)
returns table(customer_id uuid, name text, amount bigint, check_count integer)
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.auth_org_id(); v_store_org uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if p_store_id is null or p_from is null or p_to is null or p_from > p_to then raise exception 'bad range'; end if;
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  return query
    with chk as (
      select c.id from public.checks c
       where c.store_id = p_store_id and c.status = 'closed'
         and public.biz_date_of(p_store_id, c.started_at) between p_from and p_to
    ), cc as (
      select x.check_id, x.customer_id, x.position, count(*) over (partition by x.check_id) as n
        from public.check_customers x join chk on chk.id = x.check_id
    ), direct as (
      select l.check_id, l.customer_id, l.line_total::bigint as amt
        from public.check_lines l join chk on chk.id = l.check_id
       where l.customer_id is not null
    ), split as (
      select l.check_id, cc.customer_id,
             (l.line_total / cc.n)::bigint + case when cc.position = 0 then (l.line_total - (l.line_total / cc.n) * cc.n)::bigint else 0 end as amt
        from public.check_lines l join chk on chk.id = l.check_id join cc on cc.check_id = l.check_id
       where l.customer_id is null
    ), u as (
      select * from direct union all select * from split
    )
    select u.customer_id, cu.name, sum(u.amt)::bigint, count(distinct u.check_id)::int
      from u join public.customers cu on cu.id = u.customer_id
     group by u.customer_id, cu.name
     order by sum(u.amt) desc, cu.name;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★21 demo_org_reset（0152 全文・c_wipe +1（'check_seats' の隣）／c_load +1（'checks' の後）のみ★）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.demo_org_reset(p_org_id uuid, p_payload jsonb, p_mode text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- ★4 削除順（docs/tmp/0149_pre.md w2 の 1〜68 に stores 直前の memberships を加えた 69 手・53 手目＝stock_logs 再削除・裁定278-1）（0152 ★20: +3＝72 手・0153 ★21: +check_customers＝73 手）
  c_wipe constant text[] := array[
    'advances','approvals','ar_collections','attendance','attendance_incentives','audit_logs','bottle_keeps','cast_norms','cast_pin','cast_plan',
    'cast_sensitive','cast_tax_profiles','cast_unavailable_days','check_cast_backs','check_nominations','check_seats','check_customers','comp_plan_components','comp_plans','custom_back_defs','customer_notes',
    'daily_reports','deductions','drink_claims','feature_flags','kiosk_sessions','notices','payment_records','payments','payroll_adjustments','payslips',
    'penalty_config','pricing_rules','print_jobs','printer_config','product_costs','punches','receipt_issues','receivables','reservations','shift_rules',
    'shifts','staff_pin','staff_shift_deadlines','staff_shifts','staffing_needs','stock_logs','store_business_hours','store_sales_targets','transport','trials',
    'withholding_payments','check_referrals','referral_payouts','check_lines','stock_logs','checks','customers','kiosk_devices','payroll_runs','pricing_categories','products','seats',
    'shift_periods','shift_wishes','staff_shift_wishes','casts','product_categories','staff_shift_patterns','cast_ranks','referrers','memberships','stores'];
  -- ★4 投入順（削除順の逆・53 手目の stock_logs 再削除を除く 68 表・stores 直後に memberships）（0152 ★20: +3＝71 表・0153 ★21: +check_customers（'checks' の後）＝72 表）
  c_load constant text[] := array[
    'stores','memberships','referrers','cast_ranks','staff_shift_patterns','product_categories','casts','staff_shift_wishes','shift_wishes','shift_periods','seats','products',
    'pricing_categories','payroll_runs','kiosk_devices','customers','checks','check_customers','check_lines','check_referrals','referral_payouts','withholding_payments','trials','transport','store_sales_targets',
    'store_business_hours','stock_logs','staffing_needs','staff_shifts','staff_shift_deadlines','staff_pin','shifts','shift_rules','reservations','receivables',
    'receipt_issues','punches','product_costs','printer_config','print_jobs','pricing_rules','penalty_config','payslips','payroll_adjustments','payments',
    'payment_records','notices','kiosk_sessions','feature_flags','drink_claims','deductions','daily_reports','customer_notes','custom_back_defs','comp_plans',
    'comp_plan_components','check_seats','check_nominations','check_cast_backs','cast_unavailable_days','cast_tax_profiles','cast_sensitive','cast_plan','cast_pin','cast_norms',
    'bottle_keeps','audit_logs','attendance_incentives','attendance','ar_collections','approvals','advances'];
  c_keep constant text[] := array['orgs','org_billing','users'];                             -- ★4 残す 3 表（payload にあれば 'bad table'・裁定278-1）
  v_demo     boolean;
  v_t        text;
  v_key      text;
  v_n        integer;
  v_deleted  jsonb := '{}'::jsonb;
  v_inserted jsonb := '{}'::jsonb;
begin
  -- ★3 冒頭ガード（この順）
  if p_mode is null or p_mode not in ('all','wipe','load') then raise exception 'bad mode'; end if;
  select is_demo into v_demo from public.orgs where id = p_org_id;
  if v_demo is null or v_demo <> true then raise exception 'not demo'; end if;
  if p_mode in ('all','load') and (p_payload is null or jsonb_typeof(p_payload) <> 'object') then raise exception 'bad payload'; end if;

  -- ★4 payload のキー検査（投入配列に無い・残す 3 表 → 'bad table'）
  if p_mode in ('all','load') then
    for v_key in select jsonb_object_keys(p_payload) loop
      if v_key = any (c_keep) or not (v_key = any (c_load)) then raise exception 'bad table'; end if;
    end loop;
    -- ★6 stock_logs: トリガ生成分（sale／sale_remove）は payload に入れない
    if p_payload ? 'stock_logs' and exists (
      select 1 from jsonb_array_elements(p_payload->'stock_logs') e where e->>'reason' in ('sale','sale_remove')
    ) then raise exception 'bad stock_logs'; end if;
    -- ★6 全表・全要素の org_id 検査（投入前に一括＝1 行でも不一致なら何も書かない）
    foreach v_t in array c_load loop
      if v_t = 'memberships' then continue; end if;   -- ★D 例外（裁定279-1）: org_id 列なし＝投入直前に store_id／user_id で検査
      if p_payload ? v_t then
        if jsonb_typeof(p_payload->v_t) <> 'array' then raise exception 'bad payload'; end if;
        if exists (select 1 from jsonb_array_elements(p_payload->v_t) e where (e->>'org_id') is null or (e->>'org_id')::uuid <> p_org_id) then
          raise exception 'org mismatch';
        end if;
      end if;
    end loop;
  end if;

  -- ★5 wipe（固定の表順・format('%I') と配列要素のみ）
  if p_mode in ('all','wipe') then
    foreach v_t in array c_wipe loop
      if v_t = 'memberships' then   -- ★C 例外（裁定279-1）: org_id 列なし＝p_org_id の stores に属する行
        delete from public.memberships where store_id in (select id from public.stores where org_id = p_org_id);
      else
        execute format('delete from public.%I where org_id = $1', v_t) using p_org_id;
      end if;
      get diagnostics v_n = row_count;
      v_deleted := v_deleted || jsonb_build_object(v_t, coalesce((v_deleted->>v_t)::integer, 0) + v_n);   -- stock_logs は 2 回分を合算
    end loop;
  end if;

  -- ★6 load（投入順・表ごと 1 文の jsonb_populate_recordset）
  if p_mode in ('all','load') then
    foreach v_t in array c_load loop
      if p_payload ? v_t then
        -- ★D 例外（裁定279-1）: memberships は投入直前（stores は投入済み）に store_id／user_id の所属を検査
        if v_t = 'memberships' then
          if jsonb_typeof(p_payload->'memberships') <> 'array' then raise exception 'bad payload'; end if;
          if exists (
            select 1 from jsonb_array_elements(p_payload->'memberships') e
             where (e->>'store_id') is null or (e->>'user_id') is null
                or not exists (select 1 from public.stores s where s.id = (e->>'store_id')::uuid and s.org_id = p_org_id)
                or not exists (select 1 from public.users  u where u.id = (e->>'user_id')::uuid  and u.org_id = p_org_id)
          ) then raise exception 'org mismatch'; end if;
        end if;
        execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', v_t, v_t) using (p_payload->v_t);
        get diagnostics v_n = row_count;
        v_inserted := v_inserted || jsonb_build_object(v_t, v_n);
        -- ★7 check_lines 投入の直後: トリガが at=now()（本 tx）で作った sale 行の at を対応する明細の created_at へ
        --    結合＝(store_id, product_id, delta=-qty) の区画内で行番号を突き合わせる（stock_logs に check_id／line_id は無い＝相談役の判断点）
        if v_t = 'check_lines' then
          with s as (
            select sl.id, sl.store_id, sl.product_id, sl.delta,
                   row_number() over (partition by sl.store_id, sl.product_id, sl.delta order by sl.id) as rn
              from public.stock_logs sl
             where sl.org_id = p_org_id and sl.reason = 'sale' and sl.at = now()
          ), l as (
            select l.created_at, l.store_id, l.product_id, -l.qty as delta,
                   row_number() over (partition by l.store_id, l.product_id, -l.qty order by l.created_at, l.id) as rn
              from public.check_lines l
             where l.org_id = p_org_id and l.product_id is not null and l.qty <> 0
          )
          update public.stock_logs sl
             set at = l.created_at
            from s join l on l.store_id = s.store_id and l.product_id = s.product_id and l.delta = s.delta and l.rn = s.rn
           where sl.id = s.id;
        end if;
      end if;
    end loop;
  end if;

  -- ★8 末尾
  if p_mode <> 'wipe' then
    update public.orgs set demo_reset_at = now() where id = p_org_id;
  end if;
  perform public.audit_log_write_service(p_org_id, null, 'demo.reset',
    'orgs:' || p_org_id::text,
    null,
    jsonb_build_object('mode', p_mode, 'deleted', v_deleted, 'inserted', v_inserted), null);
  return jsonb_build_object('mode', p_mode, 'deleted', v_deleted, 'inserted', v_inserted);
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★22 revoke／grant（0154 ★10 の形）＝ 新 RPC 公開 6 本／改稿 2 本（署名変更）＋改稿 5 本（署名不変＝live proacl の再掲）
-- ══════════════════════════════════════════════════════════════
revoke all on function public.check_customer_add(uuid,uuid) from public, anon;
grant execute on function public.check_customer_add(uuid,uuid) to authenticated, service_role;
revoke all on function public.check_customer_remove(uuid,uuid) from public, anon;
grant execute on function public.check_customer_remove(uuid,uuid) to authenticated, service_role;
revoke all on function public.check_line_set_customer(uuid,uuid) from public, anon;
grant execute on function public.check_line_set_customer(uuid,uuid) to authenticated, service_role;
revoke all on function public.check_customer_names(uuid) from public, anon;
grant execute on function public.check_customer_names(uuid) to authenticated, service_role;
revoke all on function public.bottle_keep_out(uuid,uuid,uuid) from public, anon;
grant execute on function public.bottle_keep_out(uuid,uuid,uuid) to authenticated, service_role;
revoke all on function public.customer_sales_summary(uuid,date,date) from public, anon;
grant execute on function public.customer_sales_summary(uuid,date,date) to authenticated, service_role;
revoke all on function public.bottle_keep_register(uuid,uuid,uuid,text,integer,date,text,text,uuid) from public, anon;
grant execute on function public.bottle_keep_register(uuid,uuid,uuid,text,integer,date,text,text,uuid) to authenticated, service_role;
revoke all on function public.bottle_keep_update(uuid,integer,date,text,text,text,text) from public, anon;
grant execute on function public.bottle_keep_update(uuid,integer,date,text,text,text,text) to authenticated, service_role;
revoke all on function public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer) to authenticated, service_role;
revoke all on function public.set_cast_plan(uuid,uuid,jsonb,date) from public, anon;
grant execute on function public.set_cast_plan(uuid,uuid,jsonb,date) to authenticated, service_role;
revoke all on function public.set_store_profile(uuid,jsonb) from public, anon;
grant execute on function public.set_store_profile(uuid,jsonb) to authenticated, service_role;
revoke all on function public.check_open(uuid,integer,text,uuid,uuid,uuid) from public, anon;
grant execute on function public.check_open(uuid,integer,text,uuid,uuid,uuid) to authenticated, service_role;
revoke all on function public.check_merge(uuid,uuid,text,uuid) from public, anon;
grant execute on function public.check_merge(uuid,uuid,text,uuid) to authenticated, service_role;
revoke all on function public.check_close(uuid,uuid) from public, anon;
grant execute on function public.check_close(uuid,uuid) to authenticated, service_role;
revoke all on function public.demo_org_reset(uuid,jsonb,text) from public, anon;
grant execute on function public.demo_org_reset(uuid,jsonb,text) to service_role;   -- live proacl の再掲（postgres, service_role）

commit;

-- 検証（Run 後・貼り先証明を先頭に）
select 'nox-project-proof', count(*) from public.orgs;
select proname, pg_get_function_identity_arguments(oid), prosecdef, proacl from pg_proc where pronamespace='public'::regnamespace
  and proname in ('check_customer_add','check_customer_remove','check_line_set_customer','check_customer_names','bottle_keep_out','customer_sales_summary',
                  'bottle_keep_register','bottle_keep_update','set_comp_plan','set_cast_plan','set_store_profile','check_open','check_merge','check_close','demo_org_reset') order by 1;
select pg_get_constraintdef(oid) from pg_constraint where conname='check_lines_kind_check';
select count(*) from pg_policies where tablename='check_customers';
