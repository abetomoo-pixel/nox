-- 0203_multi_store.sql 版 4（2026-11-23 夜・相談役 11/23 21:20 の ■1＝シフトの無い打刻（鍵と列）・契約の確認を出す（鍵）も写さない＝2 店目は「許す」「出さない」で始まる）（版 3＝2026-11-23 夕・相談役 11/23 16:40 の ■2＝打刻の制限の方式・強制・勤務時間の丸めは写さない＝2 店目は制限なし・丸めないで始まる）（版 2＝2026-11-23・相談役 11/23 14:10 の ■2＝写す鍵の名簿・ランクは名前で結ぶか止める・付け替えられない ID を残さない・デモは会社の支払日を書かない）（版 1＝2026-11-22 夜・相談役 21:40 の ■2＝2 号店の段 1・段 2・枝 multi-store-1122・起草と試走まで＝貼らない・合図は相談役）
-- ★1 orgs.pay_day（支払日は会社で 1 つ・1〜31・null 可）＝会社の店の pay_day がそろっていればその値で埋める。stores.pay_day は残す（旗 false の間の読み・set_org_pay_day が同じ値に合わせる）
-- ★2 set_org_pay_day（owner だけ・会社の全店の stores.pay_day も同じ値に・監査）
-- ★3 ops_store_add（service 専用＝4 ロール revoke → service_role・運営が会社に店を足す・初期設定の前・写す内容は 2 店目の setup_drafts に {copy} として入れるだけ＝行は写さない）
--     オーナーの所属は足さない（有効な所属が 2 行になると auth_store_id が黙って 1 行を返す＝部分一意の索引は外さない）。請求の数量の同期はしない（起票141）
-- ★4 store_copy_settings（authenticated・owner だけ・1 店目→2 店目・part＝pricing／products／comp／settings／hours・写し先のその part は空であること・ID を付け替え・1 トランザクション・監査 1 行）
--     写さない＝キャスト・スタッフ・顧客・ボトル・売掛・伝票・勤怠・給与・日報・Wi-Fi と位置（punch_allow_ip／punch_lat／punch_lng／punch_radius_m）・端末・LINE（line_config／line_monthly_limit）・臨時の日・必要人数・席
-- ★5 notice_create_at／notice_create_targets_at（店を指定してお知らせ＝owner は会社の店・manager は自店だけ。中身は notice_create（0088）／notice_create_targets（0200）と同じ）
-- お金の計算の式（pay.ts・payroll の計算・源泉）には触れない。締め日は月末のまま（period_bounds 不変）。既存の関数は作り直さない（表 0・関数 +5）。
-- 翻訳元: ops_org_create（0202a）・notice_create（0088）・notice_create_targets（0200）・本番の列の一覧（2026-11-22 読取）。
-- 検証クエリ（貼った後・先頭は貼り先証明）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='orgs' and column_name='pay_day';   -- integer・YES
--   select count(*) filter (where pay_day is not null) filled, count(*) total from public.orgs;                                                            -- 本番は全社が埋まる見込み
--   select p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef from pg_proc p where p.proname in ('set_org_pay_day','ops_store_add','store_copy_settings','notice_create_at','notice_create_targets_at') order by 1;   -- 5 本・すべて true
--   select p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'execute') from pg_proc p cross join pg_roles r where p.proname in ('ops_store_add','store_copy_settings') and r.rolname in ('anon','authenticated','service_role') order by 1, 2;
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';   -- 478 → 483
begin;
set local lock_timeout = '10s';

-- ═══ ★1 orgs.pay_day ═══
alter table public.orgs add column pay_day integer;
alter table public.orgs add constraint orgs_pay_day_check check (pay_day is null or pay_day between 1 and 31);
comment on column public.orgs.pay_day is '★0203（2 号店の段 1）: 支払日（翌月 N 日）は会社で 1 つ。表示と案内だけ（計算には使わない＝334）。stores.pay_day は旗の前の読みのために残し、set_org_pay_day が同じ値に合わせる';
update public.orgs o set pay_day = x.d
from (select s.org_id, min(s.pay_day) d from public.stores s group by s.org_id having count(distinct s.pay_day) = 1) x
where x.org_id = o.id;

-- ═══ ★2 set_org_pay_day ═══
CREATE OR REPLACE FUNCTION public.set_org_pay_day(p_pay_day integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid := public.auth_org_id();
  v_before integer;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  -- ★版 2（■2-d）: デモの会社は毎朝の入れ直しで stores だけ payload に戻る（orgs は残す）＝会社の支払日を書くと翌朝ずれる。デモは今の道（店の設定の pay_day）のまま
  if exists (select 1 from public.orgs where id = v_org and is_demo) then raise exception 'forbidden (demo)'; end if;
  if p_pay_day is null or p_pay_day not between 1 and 31 then raise exception 'bad pay day'; end if;
  select pay_day into v_before from public.orgs where id = v_org;
  update public.orgs set pay_day = p_pay_day where id = v_org;
  update public.stores set pay_day = p_pay_day where org_id = v_org and pay_day is distinct from p_pay_day;   -- 旗の前の読み（stores.pay_day）も同じ値に
  perform public.audit_log_write('set_org_pay_day', 'orgs:' || v_org::text, jsonb_build_object('pay_day', v_before), jsonb_build_object('pay_day', p_pay_day), public.auth_store_id());
end $function$;
revoke execute on function public.set_org_pay_day(integer) from public, anon;
grant execute on function public.set_org_pay_day(integer) to authenticated;

-- ═══ ★3 ops_store_add（service 専用） ═══
CREATE OR REPLACE FUNCTION public.ops_store_add(p_ops uuid, p_org_id uuid, p_store_name text, p_biz_type text, p_copy_from uuid, p_copy_parts text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org   public.orgs;
  v_store uuid;
  v_sname text := btrim(coalesce(p_store_name, ''));
  v_src   public.stores;
  v_parts text[];
  v_pay   integer;
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;
  select * into v_org from public.orgs where id = p_org_id;
  if v_org.id is null then raise exception 'not found'; end if;
  if v_org.is_demo then raise exception 'forbidden (demo)'; end if;
  if length(v_sname) not between 1 and 40 then raise exception 'bad name'; end if;
  if exists (select 1 from public.stores s where s.org_id = p_org_id and s.name = v_sname) then raise exception 'dup store'; end if;
  if p_biz_type is null or p_biz_type not in ('cabaret', 'girlsbar', 'snack', 'lounge', 'bar', 'host') then raise exception 'bad biz type'; end if;
  if p_copy_from is not null then
    select * into v_src from public.stores where id = p_copy_from;
    if v_src.id is null or v_src.org_id <> p_org_id then raise exception 'bad copy from'; end if;
    if coalesce(v_src.settings_json->>'setup_done', '') <> 'true' then raise exception 'copy from not ready'; end if;
    select array_agg(distinct x order by x) into v_parts from unnest(coalesce(p_copy_parts, '{}'::text[])) x;
    if coalesce(cardinality(v_parts), 0) = 0 or exists (select 1 from unnest(v_parts) x where x not in ('pricing', 'products', 'comp', 'settings', 'hours')) then raise exception 'bad parts'; end if;
  elsif coalesce(cardinality(p_copy_parts), 0) > 0 then
    raise exception 'bad parts';
  end if;
  v_pay := coalesce(v_org.pay_day, (select min(s.pay_day) from public.stores s where s.org_id = p_org_id), 25);
  insert into public.stores (org_id, name, short, settings_json, pay_day)
  values (p_org_id, v_sname, left(v_sname, 8), jsonb_build_object('biz_type', p_biz_type, 'setup_done', false), v_pay)
  returning id into v_store;
  if p_copy_from is not null then
    insert into public.setup_drafts (org_id, store_id, data, updated_by, updated_at)
    values (p_org_id, v_store, jsonb_build_object('copy', jsonb_build_object('from', p_copy_from, 'parts', to_jsonb(v_parts), 'by', 'ops', 'at', now())), null, now());
  end if;
  perform public.ops_audit_write(p_ops, p_org_id, 'ops.store.add', 'stores:' || v_store::text, null,
    jsonb_build_object('store', v_sname, 'biz_type', p_biz_type, 'copy_from', p_copy_from, 'parts', to_jsonb(v_parts)), null, v_store, false);
  insert into public.audit_logs (org_id, store_id, actor_user_id, actor_ops_id, action, target, before_json, after_json, reason)
  values (p_org_id, v_store, null, p_ops, 'ops.store.add', 'stores:' || v_store::text, null,
          jsonb_build_object('store', v_sname, 'biz_type', p_biz_type, 'copy_from', p_copy_from, 'parts', to_jsonb(v_parts)), null);
  return jsonb_build_object('store_id', v_store, 'parts', to_jsonb(v_parts));
end $function$;
revoke all on function public.ops_store_add(uuid, uuid, text, text, uuid, text[]) from public, anon, authenticated, service_role;
grant execute on function public.ops_store_add(uuid, uuid, text, text, uuid, text[]) to service_role;

-- ═══ ★4 store_copy_settings（owner だけ） ═══
CREATE OR REPLACE FUNCTION public.store_copy_settings(p_src uuid, p_dst uuid, p_parts text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid := public.auth_org_id();
  v_s public.stores; v_d public.stores;
  v_parts text[];
  v_n jsonb := '{}'::jsonb;
  v_k int;
  -- ★版 2（相談役 11/23 14:10 の ■2-a）: 写す鍵の名簿（名簿に無い鍵は写さない＝lib/nox/ops/store-copy-keys.ts と同じ・検査 nox-multi-store が突き合わせる）
  v_pricing_keys text[] := array['dohan_auto_hon','ext_shimei_enabled','join_mode','service_rate_by_seat'];
  v_comp_keys text[] := array['bonus_tier_mode','cast_register_enabled','default_plan_id','kind_back_rate','mid_pay','norm_axes','pay_time_basis','pay_time_basis_next','pay_time_basis_next_from','pt_rules_default','reward_axis','sales_back_default_off','sales_basis','sales_norm_enabled','sales_split','sales_subtotal_includes_shimei','sales_subtotal_mode','shimei_norm_enabled','shimei_norm_scope','slide_apply','staff_discount_cap','sys_backs','sys_bonus','sys_cast_register','sys_drink_count_back','sys_hourly','sys_norms','sys_penalties','sys_point_slide','sys_points','sys_sales_rate','sys_sales_slide','sys_staff_discount','sys_wage_cut_rule','trial_back','trial_guarantee_days','trial_wage','withholding_default_cast','withholding_default_staff'];
  v_settings_keys text[] := array['ar_enabled','billing_mode','cash_float_default','cast_register_scope','customer_purpose','customer_retention_years','daily_pay_cap_tiers','drink_claim','duty_gate','invoice_reg_no','invoice_registered_on','mynumber_retention_years','okuri_base_amount','okuri_flat_tiers','okuri_mode','pay_discount_base','pay_discount_rates','pay_fee_rates','payment_methods','payslip_visibility','pin_lock_max_fail','pin_lock_minutes','punch_correction_request','punch_methods','punch_mode','ranking','ranking_show_others','receipt_footer','register_window_after_min','register_window_before_min','reservation_request','settlement_close_day','settlement_cycle','settlement_pay_days_after','settlement_presets','settlement_week_close_dow','shift_auto_confirm_hours','shift_cast_confirm','shift_request_mode','show_open_status'];   -- ★版 4: シフトの無い打刻・契約の確認を出すも写さない（相談役 11/23 21:20 の ■1）・版 3: 打刻の制限の方式・強制・丸めは写さない
  v_hours_keys text[] := array['biz_cutoff_hm','close_hm'];
  v_sj jsonb;
  v_def text;
  v_plans jsonb := '[]'::jsonb;   -- ★12:00 の ■2-b
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  select * into v_s from public.stores where id = p_src;
  select * into v_d from public.stores where id = p_dst;
  if v_s.id is null or v_d.id is null or v_s.org_id <> v_org or v_d.org_id <> v_org or p_src = p_dst then raise exception 'forbidden'; end if;
  if coalesce(v_s.settings_json->>'setup_done', '') <> 'true' then raise exception 'src not ready'; end if;
  if coalesce(v_d.settings_json->>'setup_done', '') = 'true' then raise exception 'dst done'; end if;
  select array_agg(distinct x order by x) into v_parts from unnest(coalesce(p_parts, '{}'::text[])) x;
  if coalesce(cardinality(v_parts), 0) = 0 or exists (select 1 from unnest(v_parts) x where x not in ('pricing', 'products', 'comp', 'settings', 'hours')) then raise exception 'bad parts'; end if;
  -- 写し先のその part は空であること（二重に写さない）
  if 'pricing' = any(v_parts) and (exists (select 1 from public.pricing_rules where store_id = p_dst) or exists (select 1 from public.pricing_categories where store_id = p_dst)) then raise exception 'not empty: pricing'; end if;
  if 'products' = any(v_parts) and (exists (select 1 from public.products where store_id = p_dst) or exists (select 1 from public.product_categories where store_id = p_dst)) then raise exception 'not empty: products'; end if;
  if 'comp' = any(v_parts) and (exists (select 1 from public.comp_plans where store_id = p_dst) or exists (select 1 from public.custom_back_defs where store_id = p_dst) or exists (select 1 from public.penalty_config where store_id = p_dst)) then raise exception 'not empty: comp'; end if;
  if 'hours' = any(v_parts) and exists (select 1 from public.store_business_hours where store_id = p_dst) then raise exception 'not empty: hours'; end if;

  create temp table if not exists _nox_copy_map (old uuid primary key, new uuid not null) on commit drop;
  truncate _nox_copy_map;

  -- ランク（料金の指名料と待遇のスライドが指す）＝pricing か comp を写すとき
  --   ★版 2（■2-b）: 写し先にランクが無ければ写して付け替える。写し先にランクがあれば、名前が同じランクに結ぶ（結べないランクが 1 つでもあれば止める）
  if 'pricing' = any(v_parts) or 'comp' = any(v_parts) then
    if not exists (select 1 from public.cast_ranks where store_id = p_dst) then
      insert into _nox_copy_map select r.id, gen_random_uuid() from public.cast_ranks r where r.store_id = p_src;
      insert into public.cast_ranks (id, org_id, store_id, name, sort_order, is_active)
      select m.new, v_org, p_dst, r.name, r.sort_order, r.is_active from public.cast_ranks r join _nox_copy_map m on m.old = r.id where r.store_id = p_src;
      get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('cast_ranks', v_k);
    else
      if exists (select 1 from public.cast_ranks r where r.store_id = p_src and not exists (select 1 from public.cast_ranks d where d.store_id = p_dst and d.name = r.name)) then
        raise exception 'not empty: ranks';
      end if;
      insert into _nox_copy_map select r.id, (select d.id from public.cast_ranks d where d.store_id = p_dst and d.name = r.name order by d.sort_order, d.id limit 1) from public.cast_ranks r where r.store_id = p_src;
      v_n := v_n || jsonb_build_object('cast_ranks_by_name', (select count(*) from public.cast_ranks r where r.store_id = p_src));
    end if;
  end if;

  if 'pricing' = any(v_parts) then
    insert into _nox_copy_map select c.id, gen_random_uuid() from public.pricing_categories c where c.store_id = p_src;
    insert into public.pricing_categories (id, org_id, store_id, name, sort, is_active)
    select m.new, v_org, p_dst, c.name, c.sort, c.is_active from public.pricing_categories c join _nox_copy_map m on m.old = c.id where c.store_id = p_src;
    get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('pricing_categories', v_k);
    insert into public.pricing_rules (org_id, store_id, fee_kind, seat_kind, dow_mask, time_from_min, time_to_min, rank_id, amount, duration_min, priority, is_active, name, tax_category, category_id, billing_unit, is_default_ext, vip_timing, vip_ext_amount)
    select v_org, p_dst, r.fee_kind, r.seat_kind, r.dow_mask, r.time_from_min, r.time_to_min, (select m.new from _nox_copy_map m where m.old = r.rank_id), r.amount, r.duration_min, r.priority, r.is_active, r.name, r.tax_category,
           (select m.new from _nox_copy_map m where m.old = r.category_id), r.billing_unit, r.is_default_ext, r.vip_timing, r.vip_ext_amount
    from public.pricing_rules r where r.store_id = p_src;
    get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('pricing_rules', v_k);
    update public.stores d set hon_fee = s.hon_fee, jonai_fee = s.jonai_fee, dohan_fee = s.dohan_fee, service_rate = s.service_rate, service_rate_by_seat = s.service_rate_by_seat,
           set_min = s.set_min, set_fee = s.set_fee, ext_min = s.ext_min, ext_fee = s.ext_fee, time_mode = s.time_mode, time_per = s.time_per, round_unit = s.round_unit, round_mode = s.round_mode,
           card_tax_rate = s.card_tax_rate, ext_shimei_enabled = s.ext_shimei_enabled, dohan_auto_hon = s.dohan_auto_hon,   -- ★版 2: 席の有無（use_vip・use_counter）は写さない＝席は 2 店目のもの
           settings_json = coalesce(d.settings_json, '{}'::jsonb) || (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(coalesce(s.settings_json, '{}'::jsonb)) e where e.key = any(v_pricing_keys)),
           updated_at = now()
    from public.stores s where s.id = p_src and d.id = p_dst;
  end if;

  if 'products' = any(v_parts) then
    insert into _nox_copy_map select c.id, gen_random_uuid() from public.product_categories c where c.store_id = p_src;
    insert into public.product_categories (id, org_id, store_id, name, sort_order, is_active, default_back_rate, default_track_stock)
    select m.new, v_org, p_dst, c.name, c.sort_order, c.is_active, c.default_back_rate, c.default_track_stock from public.product_categories c join _nox_copy_map m on m.old = c.id where c.store_id = p_src;
    get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('product_categories', v_k);
    insert into public.products (org_id, store_id, type, category, name, price, back_mode, back_value, unit4_json, hon_pt, is_active, reorder_point, category_id, back_exempt_from_split, sort_order, tax_category, track_stock, pt, back_rate_by_kind)
    select v_org, p_dst, p.type, p.category, p.name, p.price, p.back_mode, p.back_value, p.unit4_json, p.hon_pt, p.is_active, p.reorder_point, (select m.new from _nox_copy_map m where m.old = p.category_id),
           p.back_exempt_from_split, p.sort_order, p.tax_category, p.track_stock, p.pt, p.back_rate_by_kind
    from public.products p where p.store_id = p_src;
    get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('products', v_k);
  end if;

  if 'comp' = any(v_parts) then
    insert into _nox_copy_map select c.id, gen_random_uuid() from public.comp_plans c where c.store_id = p_src;
    insert into public.comp_plans (id, org_id, store_id, name, base, hon_back, jonai_back, dohan_back, sales_slide, point_slide, is_active, hon_back_mode, hon_back_rate, jonai_back_mode, jonai_back_rate, dohan_back_mode, dohan_back_rate,
           product_back_mode, product_back_rate, product_back_fixed, product_back_fixed_hon, product_back_fixed_jonai, product_back_fixed_free, slide_period, slide_basis, slide_rank_ids, norm_days_target, norm_dohan_target,
           norm_sales_target, norm_shimei_target, slide_apply, slide_method, pt_rules, pay_rate_tiers, slide_streak_n, reward_axis, assess_grace_months, hon_back_unit, jonai_back_unit, dohan_back_unit, product_back_rate_by_kind,
           product_back_fixed_vip, product_back_rate_vip, reservation_back_tiers, back_rate_tiers, advance_loan_agreed, advance_loan_agreed_at, commission_tiers)
    select m.new, v_org, p_dst, c.name, c.base, c.hon_back, c.jonai_back, c.dohan_back, c.sales_slide, c.point_slide, c.is_active, c.hon_back_mode, c.hon_back_rate, c.jonai_back_mode, c.jonai_back_rate, c.dohan_back_mode, c.dohan_back_rate,
           c.product_back_mode, c.product_back_rate, c.product_back_fixed, c.product_back_fixed_hon, c.product_back_fixed_jonai, c.product_back_fixed_free, c.slide_period, c.slide_basis,
           coalesce((select array_agg(m2.new order by o) from unnest(c.slide_rank_ids) with ordinality u(x, o) join _nox_copy_map m2 on m2.old = x), '{}'::uuid[]),   -- ランクを付け替え（★版 2: 付け替えられない ID は残さない・空は空の配列＝NOT NULL）
           c.norm_days_target, c.norm_dohan_target, c.norm_sales_target, c.norm_shimei_target, c.slide_apply, c.slide_method, c.pt_rules, c.pay_rate_tiers, c.slide_streak_n, c.reward_axis, c.assess_grace_months,
           c.hon_back_unit, c.jonai_back_unit, c.dohan_back_unit, c.product_back_rate_by_kind, c.product_back_fixed_vip, c.product_back_rate_vip, c.reservation_back_tiers, c.back_rate_tiers,
           false, null, c.commission_tiers   -- 前借りの同意は店ごと（写さない）
    from public.comp_plans c join _nox_copy_map m on m.old = c.id where c.store_id = p_src;
    get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('comp_plans', v_k);
    insert into public.comp_plan_components (org_id, store_id, plan_id, kind, mode, amount, rate, params, priority, is_active)
    select v_org, p_dst, m.new, x.kind, x.mode, x.amount, x.rate, x.params, x.priority, x.is_active from public.comp_plan_components x join _nox_copy_map m on m.old = x.plan_id where x.store_id = p_src;
    get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('comp_plan_components', v_k);
    insert into public.plan_norm_tiers (org_id, store_id, plan_id, week_days_min, week_days_max, days_required, hours_required)
    select v_org, p_dst, m.new, x.week_days_min, x.week_days_max, x.days_required, x.hours_required from public.plan_norm_tiers x join _nox_copy_map m on m.old = x.plan_id where x.store_id = p_src;
    insert into public.plan_rate_bands (org_id, store_id, plan_id, target, from_min, to_min, value_amount, value_rate, priority, is_active)
    select v_org, p_dst, m.new, x.target, x.from_min, x.to_min, x.value_amount, x.value_rate, x.priority, x.is_active from public.plan_rate_bands x join _nox_copy_map m on m.old = x.plan_id where x.store_id = p_src;
    insert into public.plan_event_bonuses (org_id, store_id, plan_id, kind, day_from, day_to, target, add_rate, add_amount, label, is_active)
    select v_org, p_dst, m.new, x.kind, x.day_from, x.day_to, x.target, x.add_rate, x.add_amount, x.label, x.is_active from public.plan_event_bonuses x join _nox_copy_map m on m.old = x.plan_id where x.store_id = p_src;
    insert into public.custom_back_defs (org_id, store_id, name, basis, value, cond_json, is_active)
    select v_org, p_dst, x.name, x.basis, x.value, x.cond_json, x.is_active from public.custom_back_defs x where x.store_id = p_src;
    get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('custom_back_defs', v_k);
    insert into public.penalty_config (org_id, store_id, fine_absent, fine_late, hours_per_shift, norm_on, norm_days_flat, norm_days_per, norm_dohan_flat, norm_dohan_per, late_grace_min, early_grace_min, over_grace_min,
           norm_shimei_flat, norm_shimei_per, norm_sales_flat, norm_sales_per, norm_sales_unit)
    select v_org, p_dst, x.fine_absent, x.fine_late, x.hours_per_shift, x.norm_on, x.norm_days_flat, x.norm_days_per, x.norm_dohan_flat, x.norm_dohan_per, x.late_grace_min, x.early_grace_min, x.over_grace_min,
           x.norm_shimei_flat, x.norm_shimei_per, x.norm_sales_flat, x.norm_sales_per, x.norm_sales_unit
    from public.penalty_config x where x.store_id = p_src;
    -- 待遇の鍵（制度の ON／OFF・体入の条件など）＝default_plan_id は付け替え（無ければ外す）
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_sj from jsonb_each(coalesce(v_s.settings_json, '{}'::jsonb)) e where e.key = any(v_comp_keys) and e.key <> 'default_plan_id';
    v_def := v_s.settings_json->>'default_plan_id';
    if v_def is not null and exists (select 1 from _nox_copy_map m where m.old::text = v_def) then
      v_sj := v_sj || jsonb_build_object('default_plan_id', (select m.new from _nox_copy_map m where m.old::text = v_def));
    end if;
    update public.stores set settings_json = coalesce(settings_json, '{}'::jsonb) || v_sj, updated_at = now() where id = p_dst;
  end if;

  if 'hours' = any(v_parts) then
    insert into public.store_business_hours (org_id, store_id, dow, is_closed, open_hm, close_hm)
    select v_org, p_dst, h.dow, h.is_closed, h.open_hm, h.close_hm from public.store_business_hours h where h.store_id = p_src;
    get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('store_business_hours', v_k);
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_sj from jsonb_each(coalesce(v_s.settings_json, '{}'::jsonb)) e where e.key = any(v_hours_keys);
    update public.stores set settings_json = coalesce(settings_json, '{}'::jsonb) || v_sj, open_time = v_s.open_time, updated_at = now() where id = p_dst;
  end if;

  if 'settings' = any(v_parts) then
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_sj from jsonb_each(coalesce(v_s.settings_json, '{}'::jsonb)) e
    where e.key = any(v_settings_keys);   -- ★版 2: 写す鍵の名簿だけ
    update public.stores d set settings_json = coalesce(d.settings_json, '{}'::jsonb) || v_sj,
           business_tax_status = s.business_tax_status, price_display = s.price_display, invoice_status = s.invoice_status, invoice_reg_no = s.invoice_reg_no, invoice_registered_on = s.invoice_registered_on,
           tax_rounding = s.tax_rounding, card_surcharge_rate = s.card_surcharge_rate, receivable_policy = s.receivable_policy, tax_inclusive_display = s.tax_inclusive_display,
           payment_methods = s.payment_methods, punch_methods = s.punch_methods,   -- ★版 4: シフトの無い打刻も写さない・版 3: 打刻の強制・制限の方式・丸めは写さない
           manager_punch_enabled = s.manager_punch_enabled, legal_name = s.legal_name, trade_name = coalesce(d.trade_name, d.name),   -- ★版 2: 屋号は店ごと（2 店目の店名）
           receipt_default_desc = s.receipt_default_desc, updated_at = now()
    from public.stores s where s.id = p_src and d.id = p_dst;
    v_n := v_n || jsonb_build_object('settings_keys', (select count(*) from jsonb_object_keys(v_sj)));
  end if;

  -- ★12:00 の ■2-b: 待遇のプランの付け替えの対応（作った順＝初期設定の「基本プラン」→「体験入店」の順）と 1 店目の既定のプラン＝画面はこの ID で結ぶ（名前で探さない）
  if 'comp' = any(v_parts) then
    v_plans := (select coalesce(jsonb_agg(jsonb_build_object('src', c.id, 'dst', m.new, 'active', c.is_active) order by c.created_at, c.id), '[]'::jsonb)
                from public.comp_plans c join _nox_copy_map m on m.old = c.id where c.store_id = p_src);
  end if;
  perform public.audit_log_write('store_copy_settings', 'stores:' || p_dst::text, null,
    jsonb_build_object('src', p_src, 'parts', to_jsonb(v_parts), 'counts', v_n), p_dst);
  return jsonb_build_object('parts', to_jsonb(v_parts), 'counts', v_n, 'plans', v_plans,
    'default_src', case when 'comp' = any(v_parts) then coalesce(v_s.settings_json->'default_plan_id', 'null'::jsonb) else 'null'::jsonb end);
end $function$;
revoke execute on function public.store_copy_settings(uuid, uuid, text[]) from public, anon;
grant execute on function public.store_copy_settings(uuid, uuid, text[]) to authenticated;

-- ═══ ★5 notice_create_at／notice_create_targets_at（店を指定） ═══
CREATE OR REPLACE FUNCTION public.notice_create_at(p_store_id uuid, p_title text, p_body text, p_audience text, p_pinned boolean, p_until date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0203: notice_create（0088）と同じ中身で、出す店を指定する（owner は会社の店・manager は自店だけ）
declare
  v_org uuid := public.auth_org_id();
  v_actor uuid; v_title text; v_body text; v_id uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if not (public.auth_role() in ('owner','manager')) then raise exception 'forbidden'; end if;
  if p_store_id is null or not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' and p_store_id <> public.auth_store_id() then raise exception 'forbidden'; end if;
  v_title := trim(coalesce(p_title, ''));
  if length(v_title) = 0 or length(v_title) > 80 then raise exception 'bad title'; end if;
  v_body := trim(coalesce(p_body, ''));
  if length(v_body) = 0 or length(v_body) > 4000 then raise exception 'bad body'; end if;
  if p_audience is null or p_audience not in ('all','cast','staff') then raise exception 'bad audience'; end if;
  if p_pinned is null then raise exception 'bad pinned'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.notices (org_id, store_id, title, body, audience, pinned, until, created_by)
  values (v_org, p_store_id, v_title, v_body, p_audience, p_pinned, p_until, v_actor)
  returning id into v_id;
  perform public.audit_log_write('notice_create', 'notices:' || v_id::text, null,
    (select to_jsonb(n) from public.notices n where n.id = v_id), p_store_id);
  return v_id;
end $function$;
revoke execute on function public.notice_create_at(uuid, text, text, text, boolean, date) from public, anon;
grant execute on function public.notice_create_at(uuid, text, text, text, boolean, date) to authenticated;

CREATE OR REPLACE FUNCTION public.notice_create_targets_at(p_store_id uuid, p_title text, p_body text, p_cast_ids uuid[] DEFAULT NULL::uuid[], p_staff_ids uuid[] DEFAULT NULL::uuid[], p_pinned boolean DEFAULT false, p_until date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0203: notice_create_targets（0200）と同じ中身で、出す店を指定する（宛先はその店の有効なキャスト・店長とスタッフだけ）
declare
  v_org uuid := public.auth_org_id();
  v_store uuid := p_store_id;
  v_actor uuid; v_id uuid; v_title text; v_body text;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if not (public.auth_role() in ('owner','manager')) then raise exception 'forbidden'; end if;
  if v_store is null or not exists (select 1 from public.stores s where s.id = v_store and s.org_id = v_org) then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' and v_store <> public.auth_store_id() then raise exception 'forbidden'; end if;
  v_title := trim(coalesce(p_title, '')); if length(v_title) = 0 or length(v_title) > 80 then raise exception 'bad title'; end if;
  v_body := trim(coalesce(p_body, '')); if length(v_body) = 0 or length(v_body) > 4000 then raise exception 'bad body'; end if;
  if p_pinned is null then raise exception 'bad pinned'; end if;
  if coalesce(cardinality(p_cast_ids), 0) + coalesce(cardinality(p_staff_ids), 0) < 1 or coalesce(cardinality(p_cast_ids), 0) + coalesce(cardinality(p_staff_ids), 0) > 200 then raise exception 'bad targets'; end if;
  if exists (select 1 from unnest(coalesce(p_cast_ids, '{}'::uuid[])) x(id) where not exists (select 1 from public.casts c where c.id = x.id and c.org_id = v_org and c.store_id = v_store and c.is_active)) then raise exception 'bad targets'; end if;
  if exists (select 1 from unnest(coalesce(p_staff_ids, '{}'::uuid[])) x(id) where not exists (select 1 from public.memberships m where m.id = x.id and m.store_id = v_store and m.is_active and m.role in ('manager','staff'))) then raise exception 'bad targets'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.notices (org_id, store_id, title, body, audience, pinned, until, created_by, cast_ids, staff_ids)
  values (v_org, v_store, v_title, v_body, 'targets', p_pinned, p_until, v_actor,
          case when coalesce(cardinality(p_cast_ids), 0) > 0 then (select array_agg(distinct x) from unnest(p_cast_ids) x) else null end,
          case when coalesce(cardinality(p_staff_ids), 0) > 0 then (select array_agg(distinct x) from unnest(p_staff_ids) x) else null end)
  returning id into v_id;
  perform public.audit_log_write('notice_create_targets', 'notices:' || v_id::text, null, jsonb_build_object('title', v_title, 'targets', coalesce(cardinality(p_cast_ids), 0) + coalesce(cardinality(p_staff_ids), 0)), v_store);
  return v_id;
end $function$;
revoke execute on function public.notice_create_targets_at(uuid, text, text, uuid[], uuid[], boolean, date) from public, anon;
grant execute on function public.notice_create_targets_at(uuid, text, text, uuid[], uuid[], boolean, date) to authenticated;

commit;
