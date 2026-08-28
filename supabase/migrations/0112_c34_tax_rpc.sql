-- mig0112: C3/C4 の書込 RPC（§6-3・裁定90）
-- 手貼り1回。再適用可（drop if exists → create or replace・ACL は毎回明示適用）
-- 内容:
--   1) set_pricing_rule を 13→14引数化（末尾に p_tax_category text default 'taxable_10'）。
--      本文は live_c3_rpc.sql（全体 sha 26c7899433c82872f1b861e1183aaab14f0eba1fcf3bc2f7be2cc3ba5eba034e）
--      の pg_get_functiondef 逐語を baseline に、追加は3点のみ:
--      p_tax_category の検証／insert の tax_category／update の tax_category。
--      ★旧13引数署名を明示 DROP（overload 罠・0062/0086 前例）→ 新署名へ ACL 再適用
--   2) set_store_tax_config 新設: stores の C4 4分離列＋card_surcharge_rate の書込。
--      ガード構造は set_store_pricing と同型（null-guard → billing_writable_of →
--      値検証 → org/role 判定 → 合成 jsonb 監査）。追加ガード:
--      registered ⊂ taxable（表制約と二重）／registered 時は invoice_reg_no 必須／
--      invoice_reg_no 形式 ^T[0-9]{13}$。'billing locked' ゲート入り＝課金ゲート対象。
-- 不変: p_tax_category default 'taxable_10' により既存呼び出し（13引数）と挙動同値。
--   set_pricing_rule の既存検証・監査・mig0104/0107 由来の分岐は1バイト不変。
--   money 三面鏡不触。
-- ★同時更新（教訓21・本 mig と同じ phase で必須）:
--   課金ゲート名簿 A8 へ set_store_tax_config を +1（対象 105→106・全数 200→201）。
--   billing suite の pin :94/:103/:111 と :130（106→107）を同時更新。
--   billing golden 51 が動くのは想定内（裁定90 予告済み）。
-- 正本: docs/NOX_C34設計書v1.md §6-3・docs/NOX_裁定台帳.md 裁定90
-- 単一トランザクション
-- 検証クエリ（適用後に別実行）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   select p.oid::regprocedure, p.pronargs from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('set_pricing_rule','set_store_tax_config')
--    order by 1;
--     -- 期待: set_pricing_rule 1本のみ（nargs=14・旧13引数が残っていないこと）
--     --       set_store_tax_config 1本（nargs=7）
--   select p.proname, p.proacl from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('set_pricing_rule','set_store_tax_config');
--     -- 期待: 両方 {postgres=X,authenticated=X,service_role=X}・anon 不在
--   select proname from pg_proc where prosrc like '%billing locked%'
--    and proname in ('set_pricing_rule','set_store_tax_config');
--     -- 期待: 2行
--   notify pgrst, 'reload schema';

begin;
select 'nox-project-proof' as proof, count(*) as orgs from public.orgs;

-- ===== 1) set_pricing_rule 13→14引数化 =====
-- 旧署名の明示 DROP（overload 罠回避・0062/0086 前例）
drop function if exists public.set_pricing_rule(
  uuid, uuid, text, text, integer, integer, integer, uuid,
  integer, integer, integer, boolean, text);

CREATE OR REPLACE FUNCTION public.set_pricing_rule(
  p_id uuid, p_store_id uuid, p_fee_kind text, p_seat_kind text,
  p_dow_mask integer, p_time_from_min integer, p_time_to_min integer,
  p_rank_id uuid, p_amount integer, p_duration_min integer,
  p_priority integer, p_is_active boolean, p_name text DEFAULT NULL::text,
  p_tax_category text DEFAULT 'taxable_10')
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
  if p_fee_kind is null
     or p_fee_kind not in ('set','extension','dohan','hon_shimei','jonai_shimei') then
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

  if p_id is null then
    insert into public.pricing_rules
      (org_id, store_id, fee_kind, seat_kind, dow_mask,
       time_from_min, time_to_min, rank_id, amount, duration_min,
       priority, is_active, name, tax_category)
    values
      (v_org, p_store_id, p_fee_kind, p_seat_kind, p_dow_mask,
       p_time_from_min, p_time_to_min, p_rank_id, p_amount, p_duration_min,
       p_priority, p_is_active, v_name, p_tax_category)
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

revoke all on function public.set_pricing_rule(
  uuid, uuid, text, text, integer, integer, integer, uuid,
  integer, integer, integer, boolean, text, text) from public, anon;
grant execute on function public.set_pricing_rule(
  uuid, uuid, text, text, integer, integer, integer, uuid,
  integer, integer, integer, boolean, text, text) to authenticated, service_role;

-- ===== 2) set_store_tax_config 新設 =====
CREATE OR REPLACE FUNCTION public.set_store_tax_config(
  p_store_id uuid,
  p_business_tax_status text,
  p_price_display text,
  p_invoice_status text,
  p_invoice_reg_no text,
  p_tax_rounding text,
  p_card_surcharge_rate integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid; v_before jsonb; v_after jsonb; v_reg text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- 原則7: UI は常に全値明示送信＝null は拒否
  --（invoice_reg_no と card_surcharge_rate のみ null 許容＝設計上の「未設定/無効」）
  if p_business_tax_status is null
     or p_business_tax_status not in ('taxable','exempt') then
    raise exception 'bad tax config';
  end if;
  if p_price_display is null
     or p_price_display not in ('tax_included','tax_excluded') then
    raise exception 'bad tax config';
  end if;
  if p_invoice_status is null
     or p_invoice_status not in ('registered','unregistered') then
    raise exception 'bad tax config';
  end if;
  if p_tax_rounding is null
     or p_tax_rounding not in ('floor','round','ceil') then
    raise exception 'bad tax config';
  end if;
  v_reg := nullif(btrim(p_invoice_reg_no), '');
  if v_reg is not null and v_reg !~ '^T[0-9]{13}$' then
    raise exception 'bad registration number';
  end if;
  -- registered ⊂ taxable（表制約 stores_invoice_requires_taxable と二重・T5）
  if p_invoice_status = 'registered' and p_business_tax_status <> 'taxable' then
    raise exception 'invoice requires taxable';
  end if;
  -- registered 時は登録番号必須（適格簡易請求書の記載要件・T5）
  if p_invoice_status = 'registered' and v_reg is null then
    raise exception 'registration number required';
  end if;
  if p_card_surcharge_rate is not null
     and (p_card_surcharge_rate < 1 or p_card_surcharge_rate > 100) then
    raise exception 'bad tax config';
  end if;
  select org_id into v_org from public.stores where id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- 監査は税設定6列のみの合成 jsonb（set_store_pricing の7キー合成と同型）
  select jsonb_build_object(
           'business_tax_status', business_tax_status, 'price_display', price_display,
           'invoice_status', invoice_status, 'invoice_reg_no', invoice_reg_no,
           'tax_rounding', tax_rounding, 'card_surcharge_rate', card_surcharge_rate)
    into v_before from public.stores where id = p_store_id;
  update public.stores
     set business_tax_status = p_business_tax_status,
         price_display       = p_price_display,
         invoice_status      = p_invoice_status,
         invoice_reg_no      = v_reg,
         tax_rounding        = p_tax_rounding,
         card_surcharge_rate = p_card_surcharge_rate
   where id = p_store_id;
  select jsonb_build_object(
           'business_tax_status', business_tax_status, 'price_display', price_display,
           'invoice_status', invoice_status, 'invoice_reg_no', invoice_reg_no,
           'tax_rounding', tax_rounding, 'card_surcharge_rate', card_surcharge_rate)
    into v_after from public.stores where id = p_store_id;
  perform public.audit_log_write('set_store_tax_config', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$;

revoke all on function public.set_store_tax_config(
  uuid, text, text, text, text, text, integer) from public, anon;
grant execute on function public.set_store_tax_config(
  uuid, text, text, text, text, text, integer) to authenticated, service_role;

commit;
-- ===== end mig0112 =====
