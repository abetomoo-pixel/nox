-- =============================================================
-- mig0130: 裁定118 — VIP 方式B(vip_charge)+課金単位(billing_unit)+#52 吸収
--   設計正本=docs/NOX裁定118設計書_v1.md(+v1.1 追記=ext_unit/apply 改修/§3-④ 6種是正)
--   底本=docs/tmp/118prep_live.sql(sha 00764f9a…15ad・起草直前 live 逐語)
--   1) CHECK 7種化(check_lines/pricing_rules)+pricing_rules.billing_unit
--   2) checks へ set_unit/ext_unit/vip_charge_fee/vip_charge_unit(nullable snap・
--      null→time_per フォールバック=既存伝票完全同値)
--   3) pricing_resolve_core: RETURNS へ billing_unit(DROP 必須)・whitelist 7種
--   4) pricing_resolve: 6引数化(#52)・RETURNS core 同型・whitelist 7種同期・旧 DROP
--   5) set_pricing_rule: 16引数化(p_billing_unit)・whitelist 6種(+vip_charge・
--      ext_shimei 除外=0124 設計維持)・'bad unit kind'/'bad unit'・区分に vip_charge
--   6) check_open: 4呼び目+実効単位2系統+ext_menu unit キー+4列凍結+vip 行生成
--   7) check_time_charge_apply: set/ext 単位2系統化(既存伝票=null→time_per 同値)
--   8) check_extension_add: ext_unit/メニュー unit キー対応
--   9) check_set_people: set_unit 起点+person 単位 vip 行の両モード追随
--   前提: mig0129 適用済み。冪等: 可。golden 6値不変 gate。
--   audit: 新アクション 'check_open_vip_line'(audit 系に action CHECK なし=live 実測済み)
--   ACL: DROP 再作成3本(core=grant なし/ラッパ・set_pricing_rule=authenticated)は
--   live 再現。OR REPLACE 4本(check_open/apply/ext_add/set_people)は ACL 自動保持
--   (check_open のみ既知につき明示再設定)。A6 名簿: 変更なし(新設 RPC なし)。
-- =============================================================
begin;

-- 0) fail-fast: オーバーロード残置検知+0129 前提
do $mig$
declare v_n int;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'check_open';
  if v_n <> 1 then raise exception 'mig0130 precondition: check_open overload count=%', v_n; end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'pricing_resolve_core';
  if v_n <> 1 then raise exception 'mig0130 precondition: pricing_resolve_core overload count=%', v_n; end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'pricing_resolve';
  if v_n <> 1 then raise exception 'mig0130 precondition: pricing_resolve overload count=%', v_n; end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_pricing_rule';
  if v_n <> 1 then raise exception 'mig0130 precondition: set_pricing_rule overload count=%', v_n; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'checks'
                    and column_name = 'set_rule_name') then
    raise exception 'mig0130 precondition: checks.set_rule_name missing(0129 未適用)';
  end if;
end $mig$;

-- 1) fee_kind CHECK 7種化(既存値は旧6種⊂新7種=検証パス・drop/add の冪等型)
alter table public.check_lines drop constraint if exists check_lines_fee_kind_check;
alter table public.check_lines add constraint check_lines_fee_kind_check
  check (fee_kind is null or fee_kind in
    ('set','extension','dohan','hon_shimei','jonai_shimei','ext_shimei','vip_charge'));

alter table public.pricing_rules drop constraint if exists pricing_rules_fee_kind_check;
alter table public.pricing_rules add constraint pricing_rules_fee_kind_check
  check (fee_kind in
    ('set','extension','dohan','hon_shimei','jonai_shimei','ext_shimei','vip_charge'));

-- 2) pricing_rules.billing_unit(null=店既定 time_per フォールバック=裁定118-2)
alter table public.pricing_rules add column if not exists billing_unit text;
alter table public.pricing_rules drop constraint if exists pricing_rules_billing_unit_check;
alter table public.pricing_rules add constraint pricing_rules_billing_unit_check
  check (billing_unit is null or billing_unit in ('person','table'));

-- 3) checks へ凍結4列(nullable snap・既存伝票=null→読み手 time_per フォールバック)
alter table public.checks add column if not exists set_unit text;
alter table public.checks add column if not exists ext_unit text;
alter table public.checks add column if not exists vip_charge_fee integer;
alter table public.checks add column if not exists vip_charge_unit text;
alter table public.checks drop constraint if exists checks_set_unit_check;
alter table public.checks add constraint checks_set_unit_check
  check (set_unit is null or set_unit in ('person','table'));
alter table public.checks drop constraint if exists checks_ext_unit_check;
alter table public.checks add constraint checks_ext_unit_check
  check (ext_unit is null or ext_unit in ('person','table'));
alter table public.checks drop constraint if exists checks_vip_charge_fee_check;
alter table public.checks add constraint checks_vip_charge_fee_check
  check (vip_charge_fee is null or vip_charge_fee >= 0);
alter table public.checks drop constraint if exists checks_vip_charge_unit_check;
alter table public.checks add constraint checks_vip_charge_unit_check
  check (vip_charge_unit is null or vip_charge_unit in ('person','table'));

-- 4) pricing_resolve_core: RETURNS 変更=DROP 必須(教訓48: 呼び手全数走査済み=
--    record 受け5本自動追随・列指定はラッパ1本のみ=本 mig で作り直し)
drop function if exists public.pricing_resolve_core(uuid, timestamp with time zone, text, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.pricing_resolve_core(p_store_id uuid, p_at timestamp with time zone, p_fee_kind text, p_seat_kind text DEFAULT NULL::text, p_rank_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(amount integer, duration_min smallint, rule_id uuid, billing_unit text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dow  smallint;
  v_bm   integer;
  v_cut  integer;
  v_seat text;
  v_settings jsonb;
  v_cutoff   text;
begin
  if p_fee_kind is null
     or p_fee_kind not in ('set','extension','dohan','hon_shimei','jonai_shimei','ext_shimei','vip_charge') then  -- ★0124b: ext_shimei / ★mig0130(裁定118): vip_charge 追加
    raise exception 'bad fee kind';
  end if;
  select b.biz_dow, b.biz_min into v_dow, v_bm
    from public.biz_minutes_of(p_store_id, coalesce(p_at, now())) b;
  -- cutoff 分(帯の営業日拡張に使用・ヘルパーと同じイディオム)
  select s.settings_json into v_settings
    from public.stores s where s.id = p_store_id;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  v_cut := split_part(v_cutoff, ':', 1)::int * 60 + split_part(v_cutoff, ':', 2)::int;
  v_seat := coalesce(p_seat_kind, '卓');
  return query
  select r.amount, r.duration_min, r.id, r.billing_unit  -- ★mig0130: billing_unit 追加(RETURNS 拡張)
    from public.pricing_rules r
   where r.store_id = p_store_id
     and r.is_active
     and r.fee_kind = p_fee_kind
     and (r.seat_kind is null or r.seat_kind = v_seat)
     and (r.rank_id  is null or r.rank_id  = p_rank_id)
     and (r.category_id is null or r.category_id = p_category_id)  -- ★mig0128(裁定116-2)。★教訓52 鏡像: check_open 内 ext_menu_snap の where と同時改修必須
     and (r.dow_mask is null or ((r.dow_mask >> v_dow) & 1) = 1)
     and (r.time_from_min is null
          or ( (case when r.time_from_min <  v_cut then r.time_from_min + 1440 else r.time_from_min::int end) <= v_bm
           and v_bm < (case when r.time_to_min <= v_cut then r.time_to_min + 1440 else r.time_to_min::int end) ))
   order by r.priority asc,
            (r.category_id is not null) desc,  -- ★mig0128: 同 priority 内は区分一致 > null(全区分)。既存全 null=順序不変
            r.created_at asc, r.id asc
   limit 1;
end $function$;

revoke all on function public.pricing_resolve_core(uuid, timestamp with time zone, text, text, uuid, uuid) from public, anon, authenticated;
-- grant なし=内部関数(live 実測再現: postgres/service_role のみ)

-- 5) pricing_resolve(公開ラッパ): 6引数化+whitelist 7種 core 完全同期(#52 消化)
drop function if exists public.pricing_resolve(uuid, timestamp with time zone, text, text, uuid);

CREATE OR REPLACE FUNCTION public.pricing_resolve(p_store_id uuid, p_at timestamp with time zone, p_fee_kind text, p_seat_kind text DEFAULT NULL::text, p_rank_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(amount integer, duration_min smallint, rule_id uuid, billing_unit text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or p_store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;
  -- ★mig0130(裁定118-3=#52 消化): whitelist を core と完全同期(7種)・6引数化。
  --   非対称解消=区分/ext_shimei/vip_charge のプレビュー解決が可能に
  if p_fee_kind is null
     or p_fee_kind not in ('set','extension','dohan','hon_shimei','jonai_shimei','ext_shimei','vip_charge') then
    raise exception 'bad fee kind';
  end if;

  -- ★mig0084: 解決部を pricing_resolve_core へ移設（帯判定ロジックの単一ソース化）。
  --   auth・エラー面・返却は改稿前と完全同値＝pricing 段43 不変。
  --   ★mig0130: RETURNS を core と同型へ(billing_unit 露出)・p_category_id 引渡し
  return query
  select * from public.pricing_resolve_core(p_store_id, coalesce(p_at, now()),
                                            p_fee_kind, p_seat_kind, p_rank_id, p_category_id);
end $function$;

revoke all on function public.pricing_resolve(uuid, timestamp with time zone, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.pricing_resolve(uuid, timestamp with time zone, text, text, uuid, uuid) to authenticated;
-- ★live 実測再現: authenticated のみ・anon なし

-- 6) set_pricing_rule 16引数化 ------------------------------------
drop function if exists public.set_pricing_rule(uuid, uuid, text, text, integer, integer, integer, uuid, integer, integer, integer, boolean, text, text, uuid);

CREATE OR REPLACE FUNCTION public.set_pricing_rule(p_id uuid, p_store_id uuid, p_fee_kind text, p_seat_kind text, p_dow_mask integer, p_time_from_min integer, p_time_to_min integer, p_rank_id uuid, p_amount integer, p_duration_min integer, p_priority integer, p_is_active boolean, p_name text DEFAULT NULL::text, p_tax_category text DEFAULT 'taxable_10'::text, p_category_id uuid DEFAULT NULL::uuid, p_billing_unit text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_settings jsonb;
  v_cutoff   text;
  v_cut  integer;
  v_ef   integer;
  v_et   integer;
  v_id   uuid;
  v_before jsonb;
  v_after  jsonb;
  v_name   text;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or p_store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;

  -- 検証（テーブル CHECK と同値＋cutoff 跨ぎ禁止＝RPC 権威）
  -- ★mig0130(裁定118): vip_charge 追加=6種。ext_shimei は引き続き除外
  --   (0124 直 insert 設計=UI から作らせない fail-closed の維持)
  if p_fee_kind is null
     or p_fee_kind not in ('set','extension','dohan','hon_shimei','jonai_shimei','vip_charge') then
    raise exception 'bad fee kind';
  end if;
  if p_seat_kind is not null and p_seat_kind not in ('卓','カウンター','VIP') then
    raise exception 'bad seat kind';
  end if;
  if p_dow_mask is not null and (p_dow_mask < 1 or p_dow_mask > 127) then
    raise exception 'bad dow';
  end if;
  if (p_time_from_min is null) <> (p_time_to_min is null) then
    raise exception 'bad time';
  end if;
  if p_time_from_min is not null then
    if p_time_from_min < 0 or p_time_from_min > 1439
       or p_time_to_min < 0 or p_time_to_min > 1439 then
      raise exception 'bad time';
    end if;
    select s.settings_json into v_settings
      from public.stores s where s.id = p_store_id;
    v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
    v_cut := split_part(v_cutoff, ':', 1)::int * 60 + split_part(v_cutoff, ':', 2)::int;
    v_ef := case when p_time_from_min <  v_cut then p_time_from_min + 1440 else p_time_from_min end;
    v_et := case when p_time_to_min   <= v_cut then p_time_to_min   + 1440 else p_time_to_min   end;
    if v_ef >= v_et then raise exception 'bad time'; end if;   -- 空帯・cutoff 跨ぎを一括拒否
  end if;
  if p_rank_id is not null then
    if p_fee_kind not in ('hon_shimei','jonai_shimei') then
      raise exception 'bad rank';
    end if;
    if not exists (select 1 from public.cast_ranks cr
                    where cr.id = p_rank_id and cr.store_id = p_store_id) then
      raise exception 'bad rank';
    end if;
    -- ★mig0104（裁定77）: 停止中ランクの新規参照を拒否。既存行の rank_id と同じ値の再送は据え置き
    if not exists (select 1 from public.cast_ranks cr
                    where cr.id = p_rank_id and cr.store_id = p_store_id and cr.is_active)
       and (p_id is null
            or p_rank_id is distinct from (select r.rank_id from public.pricing_rules r where r.id = p_id)) then
      raise exception 'inactive rank';
    end if;
  end if;
  if p_amount is null or p_amount < 0 then raise exception 'bad amount'; end if;
  if p_duration_min is not null then
    if p_fee_kind not in ('set','extension') then raise exception 'bad duration'; end if;
    if p_duration_min < 1 then raise exception 'bad duration'; end if;
  end if;
  if p_priority is null then raise exception 'bad priority'; end if;
  if p_is_active is null then raise exception 'bad active'; end if;
  -- ★mig0107（P-1）: 表示名（任意・trim・1〜40 文字・空は null）
  v_name := nullif(btrim(p_name), '');
  if v_name is not null and length(v_name) > 40 then raise exception 'bad name'; end if;
  -- ★mig0112（C3）: 税区分（enum 4値・裁定90-②＝DB は4値受理・UI 露出3値）
  if p_tax_category is null
     or p_tax_category not in ('taxable_10','taxable_8','exempt','out_of_scope') then
    raise exception 'bad tax category';
  end if;
  -- ★mig0128（裁定116-2）: 区分は set/extension/dohan のみ受理。
  --   shimei 系は resolve 呼び出し元が未区分対応＝死蔵設定の予防（fail-closed・将来レーンで解除）
  --   ★mig0130(裁定118-4): vip_charge へ区分を許可(4種へ)
  if p_category_id is not null then
    if p_fee_kind not in ('set','extension','dohan','vip_charge') then
      raise exception 'bad category kind';
    end if;
    if not exists (select 1 from public.pricing_categories pc
                    where pc.id = p_category_id and pc.org_id = v_org and pc.store_id = p_store_id) then
      raise exception 'bad category';
    end if;
    -- ★mig0104 rank 型の踏襲: 停止中区分の新規参照を拒否。既存行と同値の再送は据え置き
    if not exists (select 1 from public.pricing_categories pc
                    where pc.id = p_category_id and pc.org_id = v_org and pc.store_id = p_store_id and pc.is_active)
       and (p_id is null
            or p_category_id is distinct from (select r.category_id from public.pricing_rules r where r.id = p_id)) then
      raise exception 'inactive category';
    end if;
  end if;
  -- ★mig0130(裁定118-2): 課金単位は set/extension/vip_charge のみ受理(dohan/shimei は
  --   'bad unit kind'=fail-closed)。値は2値('bad unit')。null=店既定 time_per フォールバック
  if p_billing_unit is not null then
    if p_fee_kind not in ('set','extension','vip_charge') then
      raise exception 'bad unit kind';
    end if;
    if p_billing_unit not in ('person','table') then
      raise exception 'bad unit';
    end if;
  end if;

  if p_id is null then
    insert into public.pricing_rules
      (org_id, store_id, fee_kind, seat_kind, dow_mask,
       time_from_min, time_to_min, rank_id, amount, duration_min,
       priority, is_active, name, tax_category, category_id, billing_unit)
    values
      (v_org, p_store_id, p_fee_kind, p_seat_kind, p_dow_mask,
       p_time_from_min, p_time_to_min, p_rank_id, p_amount, p_duration_min,
       p_priority, p_is_active, v_name, p_tax_category, p_category_id, p_billing_unit)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(r) into v_before
      from public.pricing_rules r
     where r.id = p_id and r.org_id = v_org and r.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.pricing_rules
       set fee_kind      = p_fee_kind,
           seat_kind     = p_seat_kind,
           dow_mask      = p_dow_mask,
           time_from_min = p_time_from_min,
           time_to_min   = p_time_to_min,
           rank_id       = p_rank_id,
           amount        = p_amount,
           duration_min  = p_duration_min,
           priority      = p_priority,
           is_active     = p_is_active,
           name          = v_name,
           tax_category  = p_tax_category,
           category_id   = p_category_id,  -- ★mig0128
           billing_unit  = p_billing_unit,  -- ★mig0130
           updated_at    = now()
     where id = p_id;
    v_id := p_id;
  end if;

  select to_jsonb(r) into v_after
    from public.pricing_rules r where r.id = v_id;

  perform public.audit_log_write(
    p_action   => 'set_pricing_rule',
    p_target   => 'pricing_rules:' || v_id::text,
    p_before   => v_before,
    p_after    => v_after,
    p_store_id => p_store_id
  );
  return v_id;
end $function$;

revoke all on function public.set_pricing_rule(uuid, uuid, text, text, integer, integer, integer, uuid, integer, integer, integer, boolean, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_pricing_rule(uuid, uuid, text, text, integer, integer, integer, uuid, integer, integer, integer, boolean, text, text, uuid, text) to authenticated;

-- (続き: check_open / check_time_charge_apply / check_extension_add / check_set_people は
--  本ファイル後半に連続収載・commit は最終行)

-- 7) check_open(同 arity・OR REPLACE=ACL 保持だが既知につき明示再設定) ---------
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

revoke all on function public.check_open(uuid, integer, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.check_open(uuid, integer, text, uuid, uuid, uuid) to authenticated;

-- 8) check_time_charge_apply(同 arity・OR REPLACE=ACL 自動保持・ACL 文なし) -----
--    ★mig0130: units 2系統化=set 行は set_unit・ext ブロックは ext_unit 起点。
--    既存伝票=両列 null→time_per フォールバック=改稿前と完全同値(golden 保証)。
--    返却 jsonb は 'units'(set 側)据え置き+'ext_units' 追加
CREATE OR REPLACE FUNCTION public.check_time_charge_apply(p_check_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_sort int; v_paycnt int;
  v_d int; v_units int; v_blocks int; v_set_c int; v_ext_c int; v_total int;
  v_set_id uuid; v_ext_id uuid; v_k int;  -- ★mig0097: block ループ用
  v_org uuid;  -- ★0057(2)
  v_eunits int;  -- ★mig0130: ext 実効単位の units
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select * into v_chk from public.checks where id = p_check_id;
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
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- 裁定(c): 入金後に合計が動く経路を塞ぐ（check_remove_line と同じ保守側。
  -- check_add_line の非対称は裁定台帳に既知事項として記録済み＝今回は触らない）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  -- 防御深度: スナップ5値の妥当性（checks 列 CHECK が正・型/列事故の検知用＝E1【決定1】流儀）
  -- ★mig0130: 実効単位2値も防御対象へ(null は time_per へ収束=旧伝票互換)
  if v_chk.set_min < 1 or v_chk.ext_min < 1 or v_chk.set_fee < 0 or v_chk.ext_fee < 0
     or v_chk.time_per not in ('table','person')
     or coalesce(v_chk.set_unit, v_chk.time_per) not in ('table','person')
     or coalesce(v_chk.ext_unit, v_chk.time_per) not in ('table','person') then
    raise exception 'bad time settings';
  end if;

  -- サーバ計算（モック Lp 写し・経過は「完了分」＝floor・浮動小数を金額に持ち込まない）
  -- ★mig0089: 式は改稿前と逐語同一＝金額不変（行の持ち方だけ分離）
  v_d := floor(extract(epoch from (now() - v_chk.started_at)) / 60)::int;
  if v_d < 0 then v_d := 0; end if; -- 時計逆行の防御（blocks 負値化の芽を摘む）
  -- people CHECK 現物 = (people is null or people > 0) ＝下限あり → coalesce で十分（相談役指示1）
  -- ★mig0130: units 2系統化(set=set_unit・ext=ext_unit・null→time_per=現行同値)
  v_units  := case when coalesce(v_chk.set_unit, v_chk.time_per) = 'person'
                   then coalesce(v_chk.people, 1) else 1 end;
  v_eunits := case when coalesce(v_chk.ext_unit, v_chk.time_per) = 'person'
                   then coalesce(v_chk.people, 1) else 1 end;
  v_blocks := case when v_d <= v_chk.set_min then 0
                   else (v_d - v_chk.set_min + v_chk.ext_min - 1) / v_chk.ext_min end;
  v_set_c := v_chk.set_fee * v_units;
  -- ★mig0097: v_ext_c は式では出せない（凍結ブロックの units は現況と異なり得る）＝
  --   行生成の後に Σline_total で実測確定し、v_total もそこで算出する

  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_before
    from public.check_lines l where l.check_id = p_check_id and l.time_auto;

  -- ★mig0089: legacy 合算1行（fee_kind null）の移行吸収＝apply 自身が delete。
  --   closed 伝票は本 RPC が触れない（not open ガード）＝歴史は不変
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind is null;

  -- ★mig0097: 旧形式の合算 extension 行（block_no null）の移行吸収（0089 の fee_kind null 吸収と
  --   同型）。closed 伝票は本 RPC が触れない＝歴史不変
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind = 'extension' and block_no is null;

  -- ★mig0097b: check_open 由来の block_no null な set 行の移行吸収（extension null 吸収と対称）。
  --   3列ユニークは NULL distinct のため null set 行には効かず、放置すると block_no=0 行との
  --   二重化（set 額の過大計上）が起きる＝実バグの封鎖。null しか無い初回 apply でも、
  --   null+0 の二重化が既に起きた伝票でも、この delete→直後の 0 行 upsert で単一行へ収束する。
  --   check_open 側の block_no=0 化（再生産の停止）は 0098（R2-a・check_open 改稿）で実施。
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind = 'set' and block_no is null;

  -- set 行（額>0 のみ実体化・0 なら既存 auto set 行を削除＝総額保存則）
  -- ★mig0097: block_no=0 固定（R2-7 改訂）・conflict 推論は3列。set=全遡及（現況 units）の意味論不変
  if v_set_c > 0 then
    select coalesce(max(sort_order), 0) + 1 into v_sort
      from public.check_lines where check_id = p_check_id;
    insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                    name_snapshot, unit_price_snapshot, qty, line_total,
                                    back_snapshot, sort_order, time_auto, fee_kind, block_no)
    values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
            'セット料金(' || v_chk.set_min || '分)', v_chk.set_fee, v_units, v_set_c,
            null, v_sort, true, 'set', 0)
    on conflict (check_id, fee_kind, block_no) where time_auto do update
       set unit_price_snapshot = excluded.unit_price_snapshot,
           qty                 = excluded.qty,
           line_total          = excluded.line_total,
           name_snapshot       = excluded.name_snapshot
    returning id into v_set_id;
  else
    delete from public.check_lines
     where check_id = p_check_id and time_auto and fee_kind = 'set';
  end if;

  -- extension 行（★mig0097 R2-7/R2-7b: ブロック単位＝終了済みは凍結・進行中のみ現況 units）
  --   時計逆行等で v_blocks を超えた行が残った場合は削除（決定性の維持）
  --   ★mig0130: ext の units は v_eunits(ext_unit 起点)
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind = 'extension'
     and block_no is not null and block_no > v_blocks;

  if v_blocks = 0 or v_chk.ext_fee = 0 then
    -- ブロックなし or 単価0＝額>0 のみ実体化原則（0089 の else 分岐と同義）
    delete from public.check_lines
     where check_id = p_check_id and time_auto and fee_kind = 'extension';
  else
    for v_k in 1..v_blocks loop
      select coalesce(max(sort_order), 0) + 1 into v_sort
        from public.check_lines where check_id = p_check_id;
      if v_d >= v_chk.set_min + v_k * v_chk.ext_min then
        -- 終了済みブロック＝凍結（既存行 do nothing 不触・無ければ現況 units で初回生成＝R2-7b）
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, time_auto, fee_kind, block_no)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
                '延長料金(' || v_chk.ext_min || '分) #' || v_k, v_chk.ext_fee, v_eunits,
                v_chk.ext_fee * v_eunits, null, v_sort, true, 'extension', v_k)
        on conflict (check_id, fee_kind, block_no) where time_auto do nothing;
      else
        -- 進行中ブロック（k=v_blocks のみ到達）＝現況 units で upsert
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, time_auto, fee_kind, block_no)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
                '延長料金(' || v_chk.ext_min || '分) #' || v_k, v_chk.ext_fee, v_eunits,
                v_chk.ext_fee * v_eunits, null, v_sort, true, 'extension', v_k)
        on conflict (check_id, fee_kind, block_no) where time_auto do update
           set unit_price_snapshot = excluded.unit_price_snapshot,
               qty                 = excluded.qty,
               line_total          = excluded.line_total,
               name_snapshot       = excluded.name_snapshot;
      end if;
    end loop;
    select l.id into v_ext_id from public.check_lines l
     where l.check_id = p_check_id and l.time_auto and l.fee_kind = 'extension'
     order by l.block_no desc limit 1;
  end if;

  -- ★mig0097: ext は行実測で確定（凍結行の units 混在を正しく合算）
  select coalesce(sum(l.line_total), 0)::int into v_ext_c from public.check_lines l
   where l.check_id = p_check_id and l.time_auto and l.fee_kind = 'extension';
  v_total := v_set_c + v_ext_c;

    perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_time_charge_apply', 'checks:' || p_check_id::text,
    v_before,
    (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
       from public.check_lines l where l.check_id = p_check_id and l.time_auto),
    v_chk.store_id);

  return jsonb_build_object('elapsed_min', v_d, 'units', v_units, 'blocks', v_blocks,
                            'set_c', v_set_c, 'ext_c', v_ext_c, 'total', v_total,
                            'set_line_id', v_set_id, 'ext_line_id', v_ext_id,
                            'ext_units', v_eunits);  -- ★mig0130: 追加キー('units' は set 側で据え置き)
end $function$;

-- 9) check_extension_add(同 arity・OR REPLACE=ACL 自動保持・ACL 文なし) --------
CREATE OR REPLACE FUNCTION public.check_extension_add(p_check_id uuid, p_rule_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_mode text; v_units int; v_sort int; v_paycnt int; v_id uuid;
  v_emin int; v_efee int;  -- ★mig0098 R2-1: 選択メニュー(null=既定スナップ)
  v_org uuid;
  v_seat_kind text; r_fee record; v_nom record; v_sort2 int; v_id2 uuid;  -- ★0124 裁定111-7
  v_eunit text; v_eunit_menu text;  -- ★mig0130: 実効単位(メニュー unit キー/ext_unit/time_per)
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3)型: kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  if v_chk.ext_min < 1 or v_chk.ext_fee < 0 or v_chk.time_per not in ('table','person') then
    raise exception 'bad time settings';
  end if;
  -- ★manual 専用(auto 店は check_time_charge_apply が権威=二重計上封じ)
  select time_mode into v_mode from public.stores where id = v_chk.store_id;
  if v_mode is distinct from 'manual' then raise exception 'auto mode'; end if;

  -- ★mig0098 R2-1: p_rule_id null=既定(checks スナップ ext_min/ext_fee=現行完全互換)。
  --   指定時は ext_menu_snap(開栓時凍結)から解決=live pricing_rules は読まない(凍結原則 R2-4)。
  --   snap に無い id・旧伝票(snap null)への指定は 'bad rule'
  --   ★mig0130: 単位も凍結値から=既定は checks.ext_unit・メニュー指定は項目の unit キー。
  --     旧 snap(unit キーなし)・旧伝票(ext_unit null)は time_per フォールバック=現行同値
  v_emin := v_chk.ext_min;
  v_efee := v_chk.ext_fee;
  v_eunit := coalesce(v_chk.ext_unit, v_chk.time_per);  -- ★mig0130
  if p_rule_id is not null then
    select (m.value->>'duration_min')::int, (m.value->>'amount')::int,
           nullif(m.value->>'unit', '') into v_emin, v_efee, v_eunit_menu
      from jsonb_array_elements(coalesce(v_chk.ext_menu_snap, '[]'::jsonb)) m
     where (m.value->>'rule_id')::uuid = p_rule_id;
    if v_emin is null or v_efee is null or v_emin < 1 or v_efee < 0 then
      raise exception 'bad rule';
    end if;
    v_eunit := coalesce(v_eunit_menu, v_chk.ext_unit, v_chk.time_per);  -- ★mig0130
  end if;
  -- ★mig0130: 防御深度(凍結値の妥当性)
  if v_eunit not in ('person','table') then raise exception 'bad time settings'; end if;
  v_units := case when v_eunit = 'person' then coalesce(v_chk.people, 1) else 1 end;  -- ★mig0130: ext_unit 起点
  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.check_lines where check_id = p_check_id;
  -- 1押し=1行(time_auto=false=部分ユニーク非対象・客確認の記録が行数で残る・取消は remove_line)
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, time_auto, fee_kind)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
          '延長料金(' || v_emin || '分)', v_efee, v_units,
          v_efee * v_units, null, v_sort, false, 'extension')
  returning id into v_id;

  -- ★0124 裁定111-7 判断D/E/G: 延長指名料。ext_shimei は指名料の性質=延長人数(v_units)非連動・qty=1/cast
  if (select st.ext_shimei_enabled from public.stores st where st.id = v_chk.store_id) then
    select s.kind into v_seat_kind from public.seats s where s.id = v_chk.seat_id;
    select * into r_fee from public.pricing_resolve_core(
      v_chk.store_id, v_chk.started_at, 'ext_shimei', v_seat_kind, null);  -- rank 非対応(判断D)
    if r_fee.amount is not null then  -- ルールヒットなし=課金しない(skip)
      for v_nom in select cast_id from public.check_nominations
                    where check_id = p_check_id and nom_kind = 'hon' and ended_at is null
                    order by position
      loop
        select coalesce(max(sort_order), 0) + 1 into v_sort2
          from public.check_lines where check_id = p_check_id;
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, fee_kind, cast_id)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
                '延長指名料', r_fee.amount, 1, r_fee.amount, null, v_sort2, 'ext_shimei', v_nom.cast_id)
        returning id into v_id2;
        perform public.audit_log_write('check_extension_add', 'check_lines:' || v_id2::text, null,
          (select to_jsonb(l) from public.check_lines l where l.id = v_id2), v_chk.store_id);
      end loop;
    end if;
  end if;

  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_extension_add', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$;

-- 10) check_set_people(同 arity・OR REPLACE=ACL 自動保持・ACL 文なし) ----------
CREATE OR REPLACE FUNCTION public.check_set_people(p_check_id uuid, p_people integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_paycnt int; v_units int; v_mode text;  -- ★mig0097
  v_before jsonb;
  v_org uuid;
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_people is not null and p_people <= 0 then raise exception 'bad people'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3)型: kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- person 制の units 変動＝入金後の合計変動を塞ぐ（apply/shimei と同じ保守側）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;

  v_before := to_jsonb(v_chk);

  -- ★mig0097 R2-7b: 2段 apply（auto 店のみ）。①旧 units で経過ブロックを生成・凍結→②people 更新→
  --   ③進行中ブロックのみ新 units で upsert。放置伝票（apply 未発生のまま複数ブロック経過）でも
  --   変更前ブロックが旧人数で確定する＝時点起算の厳密化（設計書 v1.1 正本）
  select s.time_mode into v_mode from public.stores s where s.id = v_chk.store_id;
  if v_mode = 'auto' then
    perform public.check_time_charge_apply(p_check_id);
  end if;

  update public.checks set people = p_people where id = p_check_id;

  -- 開卓時 set 行の即時追随（auto 店は次回 apply でも同値に収束＝二重権威にならない。
  --   manual 店はここが唯一の再計算点。行が無い（set額0 等）場合は何もしない）
  --   ★mig0130: 判定は set 実効単位(checks.set_unit・null=time_per フォールバック=現行同値)
  if v_mode = 'auto' then
    -- ③進行中ブロック＋set 行を新 units で再計算（set=全遡及・ext=時点起算は apply が担う）
    perform public.check_time_charge_apply(p_check_id);
  elsif coalesce(v_chk.set_unit, v_chk.time_per) = 'person' then
    v_units := coalesce(p_people, 1);
    update public.check_lines
       set qty = v_units, line_total = unit_price_snapshot * v_units
     where check_id = p_check_id and time_auto and fee_kind = 'set';
    perform public.check_recalc(p_check_id);
  end if;

  -- ★mig0130(裁定118-8): person 単位 vip_charge 行の人数追随(両モード共通)。
  --   apply は vip 行を触らない(裁定7)ためここが唯一の追随点。table 単位・vip なし伝票は不触。
  --   旧伝票=vip_charge_unit null=不触(現行同値)
  if v_chk.vip_charge_unit = 'person' then
    v_units := coalesce(p_people, 1);
    update public.check_lines
       set qty = v_units, line_total = unit_price_snapshot * v_units
     where check_id = p_check_id and time_auto and fee_kind = 'vip_charge';
    if found then perform public.check_recalc(p_check_id); end if;
  end if;

  perform public.audit_log_write('check_set_people', 'checks:' || p_check_id::text,
    v_before, (select to_jsonb(c) from public.checks c where c.id = p_check_id),
    v_chk.store_id);
end $function$;

commit;
