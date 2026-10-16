-- 0173_register_payment.sql — 裁定385／386／389（＋追補1／2）／391／392／393＋396 の店設定 2 キー（便 M173・2026-10-16 起草・適用は Agoora 手貼り）
-- 翻訳元: live（nox 本番 ref hiqbfagmkrdpmlqhkmsu・2026-10-16 読取＝docs/tmp/0173_live.json）の関数定義に★差分（生成器 docs/tmp/gen_0173.mjs・手打ちなし）。
--   ★1 385 延長パターン: pricing_rules.is_default_ext（1 店 1 本＝部分ユニーク）・set_pricing_rule 17 引数（新規の extension は 1 店 3 本まで）・
--      pricing_resolve_core／check_open（既定を先頭＝自動延長は既定を自動適用・ext_menu_snap に is_default）・check_set_ext_rule（新設＝自動延長後の切替・確定ブロックを新単価で引き直し）
--   ★2 386 途中合流: 店設定 join_mode（join_set 既定／extend_only）・checks.set_frozen・check_set_people（セット終了後の＋＝合流セット行／−は引き直さない）・check_time_charge_apply（凍結セット行は不触）
--   ★3 389 キャストのレジ運用: 店設定 cast_register_device（store_device 既定／own_phone）・report_can_close／daily_report_close の cast 枝・daily_report_reclose／cash_diff_approve は cast 拒否（追補2）・
--      daily_reports の select policy に cast 枝・checks.opened_by_membership／payments.by_membership／daily_reports.closed_by_membership・kiosk_login／kiosk_operator_list／staff_pin_status／set_staff_pin の候補に ON のキャスト（追補1）
--   ★4 391 日報 2 分類: daily_report_aggregate +'set_ext_nom'／'products'・daily_reports +set_ext_nom／products・daily_report_close が凍結
--   ★5 392 会計前キープ: bottle_keeps.status +'pending'・bottle_keep_register 10 引数（p_status）・check_line_set_customer 3 引数（p_keep）・check_close pending→active・check_void pending 削除・customer_summary +pending_bottles
--   ★6 393 支払手数料: 店設定 pay_fee_rates（{card, emoney, other}・欠損＝0＝手数料なし・UI の新規店の初期値はカード 10）・check_lines.fee_kind +'pay_fee'・check_pay 8 引数（p_fee_key・手数料行＋受取額）・
--      check_group_due 3 引数（p_exclude_pay_fee・手数料はサ料の母数から除く）・daily_report_aggregate +'pay_fee_total'・daily_reports +pay_fee_total・cast_sales_aggregate は手数料を除外
--   ★7 396 体入: 店設定 trial_guarantee_days（1〜90・既定 3）・default_plan_id（自店の有効プラン・null 可）＝set_store_profile の白名単（0174 と同じ関数を二重に改稿しないため同乗）
--   既存データの書換え 0（新列は既定／null・既存の bottle_keeps は active のまま・既存の延長ルールは is_default_ext false＝解決順不変・手数料は率が無い店で 0）。
--   署名が変わる 6 本（set_pricing_rule／check_pay／bottle_keep_register／check_line_set_customer／check_group_due／customer_summary）は旧版を drop してから create（overload 罠）。
-- 検証（Success の後・形で見る）: 末尾 ===== verify ===== のクエリ 13 本（貼り先証明・列・CHECK・index・policy・引数・md5 24 本・proacl・関数 312／表 87／'billing locked' 160）。
-- md5 pin（prosrc・\r 除去・先頭 8 桁）＝写経元: pricing_resolve_core 771d2f7a・set_pricing_rule 7007357e・check_open f306b0a0・check_time_charge_apply bd4449ad・check_set_people 9aecc4e9・set_store_profile 67e96c04・report_can_close b0a55c40・daily_report_reclose d71dde13・cash_diff_approve e38899bf・daily_report_close 744912a1・check_pay 05ca579b・kiosk_login 819e0c5c・kiosk_operator_list a893463b・staff_pin_status feee1cee・set_staff_pin bba30898・daily_report_aggregate b1e6b158・bottle_keep_register e9028559・check_line_set_customer 5af12065・check_close 69cf2a19・check_void 62daaccf・customer_summary 3371b5dc・check_group_due 6c1ef055・cast_sales_aggregate e232dac8
begin;
select 'nox-project-proof', count(*) from public.orgs;   -- 貼り先証明（nox 本番＝9 行）

-- ═══ 列・CHECK・index・policy ═══════════════════════════════════════════════
-- ★1 385
alter table public.pricing_rules add column if not exists is_default_ext boolean not null default false;
create unique index if not exists pricing_rules_default_ext_uidx on public.pricing_rules (store_id) where fee_kind = 'extension' and is_default_ext and is_active;
-- ★2 386
alter table public.checks add column if not exists set_frozen boolean not null default false;
-- ★3 389
alter table public.checks add column if not exists opened_by_membership uuid references public.memberships(id) on delete set null;
alter table public.payments add column if not exists by_membership uuid references public.memberships(id) on delete set null;
alter table public.daily_reports add column if not exists closed_by_membership uuid references public.memberships(id) on delete set null;
drop policy if exists daily_reports_select on public.daily_reports;
create policy daily_reports_select on public.daily_reports for select to authenticated
  using (org_id = public.auth_org_id()
         and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
         and (public.auth_role() <> 'cast' or public.auth_cast_can_register()));   -- ★3 0173（裁定389）: ON のキャストは自店の日報を読める（締め画面）
-- ★4 391・★6 393
alter table public.daily_reports add column if not exists set_ext_nom integer;
alter table public.daily_reports add column if not exists products integer;
alter table public.daily_reports add column if not exists pay_fee_total integer;
-- ★5 392
alter table public.bottle_keeps drop constraint if exists bottle_keeps_status_check;
alter table public.bottle_keeps add constraint bottle_keeps_status_check check (status = any (array['active'::text, 'empty'::text, 'removed'::text, 'pending'::text]));
-- ★6 393
alter table public.check_lines drop constraint if exists check_lines_fee_kind_check;
alter table public.check_lines add constraint check_lines_fee_kind_check check (fee_kind is null or fee_kind = any (array['set'::text, 'extension'::text, 'dohan'::text, 'hon_shimei'::text, 'jonai_shimei'::text, 'ext_shimei'::text, 'vip_charge'::text, 'pay_fee'::text]));

-- ═══ 旧署名の drop（overload 罠） ═════════════════════════════════════════════
drop function if exists public.set_pricing_rule(uuid, uuid, text, text, integer, integer, integer, uuid, integer, integer, integer, boolean, text, text, uuid, text);
drop function if exists public.check_pay(uuid, text, integer, text, integer, uuid, text);
drop function if exists public.bottle_keep_register(uuid, uuid, uuid, text, integer, date, text, text, uuid);
drop function if exists public.check_line_set_customer(uuid, uuid);
drop function if exists public.check_group_due(uuid, text);
drop function if exists public.customer_summary(uuid);

-- ═══ check_group_due ═══
CREATE OR REPLACE FUNCTION public.check_group_due(p_check_id uuid, p_pay_group text, p_exclude_pay_fee boolean DEFAULT false)   -- ★6 0173（裁定393）: true＝手数料行を無かったことにする（キャスト売上の母数）
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rate int; v_unit int; v_mode text; v_bx int; v_disc int; v_net int;
  v_bts text; v_pd text; v_trnd text;  -- ★mig0113: 凍結税設定
  v_bx10 int; v_bx8 int; v_sv int; v_base10 int; v_tax int;  -- ★mig0113: 外税分岐
  v_ref int := 0;  -- ★12 0152（裁定298-9）: burden='customer' の紹介料（pay_group 'A'・taxable_10 の母数に加算）
  v_pf int := 0;   -- ★6 0173（裁定393）: 手数料行の合計（サ料の母数から除く・税の母数には乗る＝内税対象）
begin
  select service_rate, round_unit, round_mode,
         business_tax_status, price_display, tax_rounding  -- ★mig0113
    into v_rate, v_unit, v_mode, v_bts, v_pd, v_trnd
    from public.checks where id = p_check_id;
  if not found then raise exception 'not found'; end if;
  -- 通常小計（割引前・discount line を除外）
  select coalesce(sum(line_total), 0)::int into v_bx
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind <> 'discount'
     and (not p_exclude_pay_fee or fee_kind is distinct from 'pay_fee');   -- ★12 0152（裁定298-8）: 0148 ★10 の referral 除外を削除（kind 'referral' は CHECK から撤去）・★6 0173: 除外指定
  if not p_exclude_pay_fee then
    select coalesce(sum(line_total), 0)::int into v_pf
      from public.check_lines
     where check_id = p_check_id and pay_group = p_pay_group and fee_kind = 'pay_fee';   -- ★6 0173
  end if;
  -- ★12 0152（裁定298-9）: burden='customer' の紹介料は pay_group 'A' の小計（サ料・税の母数）に加算（burden='store' は乗らない）
  if p_pay_group = 'A' then
    select coalesce(sum(amount), 0)::int into v_ref
      from public.check_referrals
     where check_id = p_check_id and burden = 'customer';
    v_bx := v_bx + v_ref;
  end if;
  -- 割引合計（正の値で格納された discount line の合計）
  select coalesce(sum(line_total), 0)::int into v_disc
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind = 'discount';
  v_net := greatest(0, v_bx - v_disc);   -- 過剰割引でも負にしない（0 clamp）
  if v_net = 0 then return 0; end if;     -- 旧 v_bx=0 と等価（discount 無しなら v_net=v_bx）
  -- ★mig0113: 外税（tax_excluded × taxable のみ）。内税/exempt は下の従来行＝1バイト不変。
  --   規則（設計書 v1 §3 細則）: 税率別に check_tax_round を1回ずつ（伝票×税率×1回＝T5）。
  --   discount は taxable_10 基底へ適用（clamp・8% への按分は F5）。サ料は taxable_10 基底（T6）。
  --   exempt/out_of_scope 行は税 0。TS 鏡像: receipt.ts / check-calc.ts（三面鏡・同時改修）。
  if v_pd = 'tax_excluded' and v_bts = 'taxable' then
    select coalesce(sum(line_total) filter (where tax_category = 'taxable_10'), 0)::int,
           coalesce(sum(line_total) filter (where tax_category = 'taxable_8'),  0)::int
      into v_bx10, v_bx8
      from public.check_lines
     where check_id = p_check_id and pay_group = p_pay_group and kind <> 'discount'
       and (not p_exclude_pay_fee or fee_kind is distinct from 'pay_fee');   -- ★12 0152（裁定298-8）: 同上・★6 0173: 除外指定
    v_bx10 := v_bx10 + v_ref;                                              -- ★12 0152（裁定298-9）: taxable_10 の母数にも加算
    v_sv     := round((v_net - v_pf) * v_rate / 100.0)::int;              -- サ料（従来と同式・★6 0173: 手数料行はサ料の母数から除く＝pay_fee 無しなら同値）
    v_base10 := greatest(0, v_bx10 - v_disc) + v_sv;
    v_tax    := public.check_tax_round(v_base10 * 10 / 100.0, v_trnd)
              + public.check_tax_round(v_bx8   *  8 / 100.0, v_trnd);
    return public.check_round_amount(v_net + v_sv + v_tax, v_unit, v_mode);
  end if;
  return public.check_round_amount(v_net + round((v_net - v_pf) * v_rate / 100.0), v_unit, v_mode);   -- ★6 0173: 同上
end $function$;
revoke execute on function public.check_group_due(uuid, text, boolean) from public, anon, authenticated, service_role;   -- 内部専用（live ACL {postgres=X/postgres} を踏襲）

-- ═══ pricing_resolve_core ═══
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
   order by (p_fee_kind = 'extension' and r.is_default_ext) desc,  -- ★1 0173（裁定385）: 延長は既定パターン優先（is_default_ext が無い店は順序不変）
            r.priority asc,
            (r.category_id is not null) desc,  -- ★mig0128: 同 priority 内は区分一致 > null(全区分)。既存全 null=順序不変
            r.created_at asc, r.id asc
   limit 1;
end $function$;
revoke execute on function public.pricing_resolve_core(uuid, timestamp with time zone, text, text, uuid, uuid) from public, anon, authenticated, service_role;   -- 内部専用（live ACL {postgres=X/postgres,service_role=X/postgres} を踏襲）
grant execute on function public.pricing_resolve_core(uuid, timestamp with time zone, text, text, uuid, uuid) to service_role;

-- ═══ set_pricing_rule ═══
CREATE OR REPLACE FUNCTION public.set_pricing_rule(p_id uuid, p_store_id uuid, p_fee_kind text, p_seat_kind text, p_dow_mask integer, p_time_from_min integer, p_time_to_min integer, p_rank_id uuid, p_amount integer, p_duration_min integer, p_priority integer, p_is_active boolean, p_name text DEFAULT NULL::text, p_tax_category text DEFAULT 'taxable_10'::text, p_category_id uuid DEFAULT NULL::uuid, p_billing_unit text DEFAULT NULL::text, p_is_default_ext boolean DEFAULT false)   -- ★1 0173（裁定385）: 延長の既定パターン
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
    -- ★mig0131(#56): 上限 1440 分(24時間)。実データ逆転1件(¥30/5000分)が起票根拠。
    --   UI 側の事前警告は別途 UI レーン
    if p_duration_min > 1440 then raise exception 'bad duration'; end if;
  end if;
  if p_priority is null then raise exception 'bad priority'; end if;
  if p_is_active is null then raise exception 'bad active'; end if;
  -- ★1 0173（裁定385）: 延長パターン＝1 店 3 本まで（新規追加時のみ検査＝既存の超過は不変）・既定（is_default_ext）は extension だけ・既定は 1 本（他を false に）
  if p_is_default_ext is null then raise exception 'bad default_ext'; end if;
  if p_is_default_ext and p_fee_kind <> 'extension' then raise exception 'bad default_ext'; end if;
  if p_id is null and p_fee_kind = 'extension' and p_is_active
     and (select count(*) from public.pricing_rules r where r.store_id = p_store_id and r.fee_kind = 'extension' and r.is_active) >= 3 then
    raise exception 'too many extension';
  end if;
  if p_is_default_ext and p_is_active then
    update public.pricing_rules set is_default_ext = false, updated_at = now()
     where store_id = p_store_id and fee_kind = 'extension' and is_default_ext and id is distinct from p_id;   -- 部分ユニーク index と二段
  end if;
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
       priority, is_active, name, tax_category, category_id, billing_unit, is_default_ext)   -- ★1 0173
    values
      (v_org, p_store_id, p_fee_kind, p_seat_kind, p_dow_mask,
       p_time_from_min, p_time_to_min, p_rank_id, p_amount, p_duration_min,
       p_priority, p_is_active, v_name, p_tax_category, p_category_id, p_billing_unit, p_is_default_ext)   -- ★1 0173
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
           is_default_ext = p_is_default_ext,  -- ★1 0173（裁定385）
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
revoke execute on function public.set_pricing_rule(uuid, uuid, text, text, integer, integer, integer, uuid, integer, integer, integer, boolean, text, text, uuid, text, boolean) from public, anon;
grant execute on function public.set_pricing_rule(uuid, uuid, text, text, integer, integer, integer, uuid, integer, integer, integer, boolean, text, text, uuid, text, boolean) to authenticated;

-- ═══ check_open ═══
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
           'is_default', r.is_default_ext,  -- ★1 0173（裁定385）: 既定パターン（レジの選択は手動延長時のみ・自動延長は既定を自動適用）
           'label', '延長 ' || coalesce(r.duration_min, v_seat.ext_min) || '分 ¥' || r.amount)
         order by r.is_default_ext desc, r.priority asc, (r.category_id is not null) desc,  -- ★1 0173: 既定を先頭（core と鏡像）・★mig0128: 同 priority 内区分一致優先(core と鏡像)
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
                             created_by, customer_id, ext_menu_snap, opened_by_membership,   -- ★3 0173（裁定389）: 操作者の membership（cast 含む・kiosk は null）
                             business_tax_status, price_display, tax_rounding,  -- ★mig0113
                             category_id, category_name,  -- ★mig0128
                             set_rule_id, set_rule_name,  -- ★mig0129
                             set_unit, ext_unit, vip_charge_fee, vip_charge_unit)  -- ★mig0130
  values (v_org, v_seat.store_id, p_seat_id, p_people, p_nom_type,
          v_rate, v_unit, v_mode,
          v_smin, v_sfee, v_emin, v_efee, v_tper,
          v_dfee,
          v_actor, p_customer_id, v_ext_menu, public.auth_membership_id(),   -- ★3 0173
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
revoke execute on function public.check_open(uuid, integer, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.check_open(uuid, integer, text, uuid, uuid, uuid) to authenticated;

-- ═══ check_time_charge_apply ═══
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
  if coalesce(v_chk.set_frozen, false) then
    null;   -- ★2 0173（裁定386）: セット終了後に人数が変わった伝票＝セット行は凍結（引き直さない・削除もしない）
  elsif v_set_c > 0 then
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
revoke execute on function public.check_time_charge_apply(uuid) from public, anon;
grant execute on function public.check_time_charge_apply(uuid) to authenticated;

-- ═══ check_set_people ═══
CREATE OR REPLACE FUNCTION public.check_set_people(p_check_id uuid, p_people integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_paycnt int; v_units int; v_mode text;  -- ★mig0097
  v_join text; v_added int; v_sort int; v_frozen boolean := false;  -- ★2 0173（裁定386）
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
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
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
  -- ★2 0173（裁定386）: セット終了後（started_at＋set_min 経過）の人数変更＝セット料金を引き直さない（checks.set_frozen＝apply／manual 再計算の対象外）。
  --   ＋は店設定 join_mode＝'join_set'（既定）なら合流セット行（人数単位・増えた人数×セット単価・time_auto=false）／'extend_only' なら延長だけ（apply が人数に追随）。−は不変。
  select coalesce(nullif(s.settings_json->>'join_mode', ''), 'join_set') into v_join from public.stores s where s.id = v_chk.store_id;
  if coalesce(v_chk.set_frozen, false) then
    v_frozen := true;
  elsif coalesce(v_chk.set_min, 0) > 0 and now() >= v_chk.started_at + make_interval(mins => v_chk.set_min)
     and p_people is distinct from v_chk.people then
    v_frozen := true;
    update public.checks set set_frozen = true where id = p_check_id;
  end if;
  if v_frozen and v_join = 'join_set' and coalesce(p_people, 1) > coalesce(v_chk.people, 1)
     and coalesce(v_chk.set_unit, v_chk.time_per) = 'person' and coalesce(v_chk.set_fee, 0) > 0 then
    v_added := coalesce(p_people, 1) - coalesce(v_chk.people, 1);
    select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
    insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                    name_snapshot, unit_price_snapshot, qty, line_total,
                                    back_snapshot, sort_order, time_auto, fee_kind)
    values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'set', 'A',
            '合流セット(' || v_chk.set_min || '分)', v_chk.set_fee, v_added, v_chk.set_fee * v_added,
            null, v_sort, false, 'set');
    perform public.check_recalc(p_check_id);
  end if;
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
  elsif not v_frozen and coalesce(v_chk.set_unit, v_chk.time_per) = 'person' then   -- ★2 0173: 凍結後は引き直さない
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
revoke execute on function public.check_set_people(uuid, integer) from public, anon;
grant execute on function public.check_set_people(uuid, integer) to authenticated;

-- ═══ set_store_profile ═══
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
                             'customer_purpose','customer_retention_years',                               -- ★5 0153: 裁定305-11／293-4 の 2 キー（0155 ★4: 末尾 '];' → ','）
                             'ar_enabled',                                                                -- ★4 0155: 裁定309-1 の 1 キー（boolean・新規店の既定は false＝ar_policy_ok の coalesce）（0158 ★4: 末尾 '];' → ','）
                             'okuri_base_amount',                                                         -- ★4 0158: 裁定317 の 1 キー（整数 0〜99999）（0164 ★2: 末尾 '];' → ','）
                             'invoice_registered_on','pay_day','tax_inclusive_display','use_vip','use_counter','payment_methods','punch_methods',   -- ★2 0164: 裁定331 C 5 項目＋334 フロア機能（列側 7 キー）（0172 ★3: 末尾 '];' → ','）
                             'settlement_cycle','mid_pay','shift_auto_confirm_hours',   -- ★3 0172: 裁定349 の 2 キー（精算方式・途中払い）＋裁定380 の自動確定時間（0173 ★7: 末尾 '];' → ','）
                             'join_mode','cast_register_device','pay_fee_rates','trial_guarantee_days','default_plan_id'];   -- ★7 0173: 裁定386／389／393／396 の 5 キー
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
  v_ar       boolean;   -- ★4 0155: ar_enabled（show_open_status と同型）
  v_okb      numeric;   -- ★4 0158: okuri_base_amount（整数 0〜99999）
  v_inv_on   date;      -- ★2 0164: invoice_registered_on（'YYYY-MM-DD' か null）
  v_pay_day  numeric;   -- ★2 0164: pay_day（整数 1〜31）
  v_tax_inc  boolean;   -- ★2 0164: tax_inclusive_display
  v_use_vip  boolean;   -- ★2 0164: use_vip
  v_use_ctr  boolean;   -- ★2 0164: use_counter
  v_paym     jsonb;     -- ★2 0164: payment_methods（object・cash／card／emoney／qr・boolean・cash は true）
  v_punch    jsonb;     -- ★2 0164: punch_methods（object・self／proxy／kiosk・boolean・1 つ以上 true）
  v_jk       text;      -- ★2 0164: jsonb の検査用キー
  v_cycle    text;      -- ★3 0172: settlement_cycle（enum text 4 値・slide_apply と同型）
  v_midpay   text;      -- ★3 0172: mid_pay（enum text 2 値）
  v_autoh    numeric;   -- ★3 0172: shift_auto_confirm_hours（整数 0〜168・0＝自動確定しない）
  v_join     text;      -- ★2 0173: join_mode（enum text 2 値）
  v_crdev    text;      -- ★3 0173: cast_register_device（enum text 2 値）
  v_pfr      jsonb;     -- ★6 0173: pay_fee_rates（object・card／emoney／other・整数 0〜100）
  v_pfk      text;      -- ★6 0173: jsonb の検査用キー
  v_pfv      numeric;   -- ★6 0173: 率の検査用
  v_tgd      numeric;   -- ★7 0173: trial_guarantee_days（整数 1〜90）
  v_dpid     uuid;      -- ★7 0173: default_plan_id（自店の有効な comp_plans.id）
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;   -- 店ポリシー＝owner 限定（cast_register と同格）
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'bad patch'; end if;
  if p_patch = '{}'::jsonb then raise exception 'bad patch'; end if;

  select id, org_id, name, short, ext_shimei_enabled, dohan_auto_hon, settings_json,   -- ★2 0164: 列を 7 つ続ける
         invoice_registered_on, pay_day, tax_inclusive_display, use_vip, use_counter, payment_methods, punch_methods   -- ★2 0164: before の現値
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

  if p_patch ? 'ar_enabled' then                                                                               -- ★4 0155（裁定309-1）: ar_enabled（show_open_status の 4 行型を写経・owner 限定は関数冒頭で担保）
    if jsonb_typeof(p_patch->'ar_enabled') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_ar := (p_patch->>'ar_enabled')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('ar_enabled',                                                  -- ★4
                    coalesce(v_settings->>'ar_enabled', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('ar_enabled', v_ar);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{ar_enabled}', to_jsonb(v_ar), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'okuri_base_amount' then                                                                    -- ★4 0158（裁定317）: 整数 0〜99999（customer_retention_years の数値検査の型）
    if jsonb_typeof(p_patch->'okuri_base_amount') <> 'number' then raise exception 'bad type'; end if;       -- ★4 0158
    v_okb := (p_patch->>'okuri_base_amount')::numeric;                                                       -- ★4 0158
    if v_okb < 0 or v_okb > 99999 or v_okb <> trunc(v_okb) then raise exception 'bad okuri_base_amount'; end if;   -- ★4 0158
    v_before   := v_before || jsonb_build_object('okuri_base_amount', coalesce(nullif(trim(v_settings->>'okuri_base_amount'), '')::int, 0));   -- ★4 0158: 既定 0（未設定）
    v_after    := v_after  || jsonb_build_object('okuri_base_amount', v_okb::int);                           -- ★4 0158
    v_settings := jsonb_set(v_settings, '{okuri_base_amount}', to_jsonb(v_okb::int), true);                  -- ★4 0158
  end if;                                                                                                  -- ★4 0158

  -- ── ★2 0164: 列側 7 キー（裁定331 C 5 項目＋334 フロア機能） ──────────
  if p_patch ? 'invoice_registered_on' then                                                                -- ★2 0164
    if jsonb_typeof(p_patch->'invoice_registered_on') = 'null' then v_inv_on := null;                       -- ★2 0164: null＝未登録／不明
    elsif jsonb_typeof(p_patch->'invoice_registered_on') <> 'string' or (p_patch->>'invoice_registered_on') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'bad type';   -- ★2 0164
    else v_inv_on := (p_patch->>'invoice_registered_on')::date; end if;                                      -- ★2 0164
    v_before := v_before || jsonb_build_object('invoice_registered_on', v_store.invoice_registered_on);      -- ★2 0164
    v_after  := v_after  || jsonb_build_object('invoice_registered_on', v_inv_on);                           -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'pay_day' then                                                                              -- ★2 0164
    if jsonb_typeof(p_patch->'pay_day') <> 'number' then raise exception 'bad type'; end if;                 -- ★2 0164
    v_pay_day := (p_patch->>'pay_day')::numeric;                                                             -- ★2 0164
    if v_pay_day < 1 or v_pay_day > 31 or v_pay_day <> trunc(v_pay_day) then raise exception 'bad pay_day'; end if;   -- ★2 0164
    v_before := v_before || jsonb_build_object('pay_day', v_store.pay_day);                                  -- ★2 0164
    v_after  := v_after  || jsonb_build_object('pay_day', v_pay_day::int);                                   -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'tax_inclusive_display' then                                                                -- ★2 0164
    if jsonb_typeof(p_patch->'tax_inclusive_display') <> 'boolean' then raise exception 'bad type'; end if;  -- ★2 0164
    v_tax_inc := (p_patch->>'tax_inclusive_display')::boolean;                                               -- ★2 0164
    v_before := v_before || jsonb_build_object('tax_inclusive_display', v_store.tax_inclusive_display);      -- ★2 0164
    v_after  := v_after  || jsonb_build_object('tax_inclusive_display', v_tax_inc);                          -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'use_vip' then                                                                              -- ★2 0164
    if jsonb_typeof(p_patch->'use_vip') <> 'boolean' then raise exception 'bad type'; end if;                -- ★2 0164
    v_use_vip := (p_patch->>'use_vip')::boolean;                                                             -- ★2 0164
    v_before := v_before || jsonb_build_object('use_vip', v_store.use_vip);                                  -- ★2 0164
    v_after  := v_after  || jsonb_build_object('use_vip', v_use_vip);                                        -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'use_counter' then                                                                          -- ★2 0164
    if jsonb_typeof(p_patch->'use_counter') <> 'boolean' then raise exception 'bad type'; end if;            -- ★2 0164
    v_use_ctr := (p_patch->>'use_counter')::boolean;                                                         -- ★2 0164
    v_before := v_before || jsonb_build_object('use_counter', v_store.use_counter);                          -- ★2 0164
    v_after  := v_after  || jsonb_build_object('use_counter', v_use_ctr);                                    -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'payment_methods' then                                                                      -- ★2 0164
    v_paym := p_patch->'payment_methods';                                                                    -- ★2 0164
    if jsonb_typeof(v_paym) <> 'object' then raise exception 'bad type'; end if;                             -- ★2 0164
    for v_jk in select jsonb_object_keys(v_paym) loop                                                        -- ★2 0164
      if v_jk not in ('cash','card','emoney','qr') or jsonb_typeof(v_paym->v_jk) <> 'boolean' then raise exception 'bad payment_methods'; end if;   -- ★2 0164
    end loop;                                                                                                -- ★2 0164
    if coalesce((v_paym->>'cash')::boolean, true) <> true then raise exception 'bad payment_methods'; end if;   -- ★2 0164: 現金は常に使う
    v_paym := v_store.payment_methods || v_paym;                                                             -- ★2 0164: 無いキーは現値のまま
    v_before := v_before || jsonb_build_object('payment_methods', v_store.payment_methods);                  -- ★2 0164
    v_after  := v_after  || jsonb_build_object('payment_methods', v_paym);                                   -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'punch_methods' then                                                                        -- ★2 0164
    v_punch := p_patch->'punch_methods';                                                                     -- ★2 0164
    if jsonb_typeof(v_punch) <> 'object' then raise exception 'bad type'; end if;                            -- ★2 0164
    for v_jk in select jsonb_object_keys(v_punch) loop                                                       -- ★2 0164
      if v_jk not in ('self','proxy','kiosk') or jsonb_typeof(v_punch->v_jk) <> 'boolean' then raise exception 'bad punch_methods'; end if;   -- ★2 0164
    end loop;                                                                                                -- ★2 0164
    v_punch := v_store.punch_methods || v_punch;                                                             -- ★2 0164: 無いキーは現値のまま
    if not (coalesce((v_punch->>'self')::boolean, false) or coalesce((v_punch->>'proxy')::boolean, false) or coalesce((v_punch->>'kiosk')::boolean, false)) then raise exception 'bad punch_methods'; end if;   -- ★2 0164: 1 つ以上
    v_before := v_before || jsonb_build_object('punch_methods', v_store.punch_methods);                      -- ★2 0164
    v_after  := v_after  || jsonb_build_object('punch_methods', v_punch);                                    -- ★2 0164
  end if;                                                                                                  -- ★2 0164

  -- ★3 0172（裁定349）: 精算方式＝monthly／half／weekly／daily（源泉の暦日数＝lib/nox/pay.ts periodDays が読む・既定 monthly＝欠損時）
  if p_patch ? 'settlement_cycle' then                                                                     -- ★3 0172
    if jsonb_typeof(p_patch->'settlement_cycle') <> 'string' then raise exception 'bad type'; end if;      -- ★3 0172
    v_cycle := p_patch->>'settlement_cycle';                                                               -- ★3 0172
    if v_cycle is null or v_cycle not in ('monthly','half','weekly','daily') then raise exception 'bad settlement_cycle'; end if;   -- ★3 0172
    v_before   := v_before || jsonb_build_object('settlement_cycle', coalesce(v_settings->>'settlement_cycle', ''));   -- ★3 0172
    v_after    := v_after  || jsonb_build_object('settlement_cycle', v_cycle);                             -- ★3 0172
    v_settings := jsonb_set(v_settings, '{settlement_cycle}', to_jsonb(v_cycle), true);                    -- ★3 0172
  end if;                                                                                                  -- ★3 0172
  -- ★3 0172（裁定349）: 途中払い＝none／advance（advance＝前払・仮払の口を出す・既定 none）
  if p_patch ? 'mid_pay' then                                                                              -- ★3 0172
    if jsonb_typeof(p_patch->'mid_pay') <> 'string' then raise exception 'bad type'; end if;               -- ★3 0172
    v_midpay := p_patch->>'mid_pay';                                                                       -- ★3 0172
    if v_midpay is null or v_midpay not in ('none','advance') then raise exception 'bad mid_pay'; end if;  -- ★3 0172
    v_before   := v_before || jsonb_build_object('mid_pay', coalesce(v_settings->>'mid_pay', ''));         -- ★3 0172
    v_after    := v_after  || jsonb_build_object('mid_pay', v_midpay);                                     -- ★3 0172
    v_settings := jsonb_set(v_settings, '{mid_pay}', to_jsonb(v_midpay), true);                            -- ★3 0172
  end if;                                                                                                  -- ★3 0172
  -- ★3 0172（裁定380）: 送り返しの自動確定時間＝整数 0〜168（0＝自動確定しない・既定 0＝欠損時）。実行器（cron／RPC）は別起票＝ここは設定の器だけ
  if p_patch ? 'shift_auto_confirm_hours' then                                                             -- ★3 0172
    if jsonb_typeof(p_patch->'shift_auto_confirm_hours') <> 'number' then raise exception 'bad type'; end if;   -- ★3 0172
    v_autoh := (p_patch->>'shift_auto_confirm_hours')::numeric;                                            -- ★3 0172
    if v_autoh <> floor(v_autoh) or v_autoh < 0 or v_autoh > 168 then raise exception 'bad shift_auto_confirm_hours'; end if;   -- ★3 0172
    v_before   := v_before || jsonb_build_object('shift_auto_confirm_hours', coalesce((v_settings->>'shift_auto_confirm_hours')::numeric, 0));   -- ★3 0172
    v_after    := v_after  || jsonb_build_object('shift_auto_confirm_hours', v_autoh::int);                -- ★3 0172
    v_settings := jsonb_set(v_settings, '{shift_auto_confirm_hours}', to_jsonb(v_autoh::int), true);       -- ★3 0172
  end if;                                                                                                  -- ★3 0172

  -- ★2 0173（裁定386）: 途中合流＝join_set（セット終了後の＋は合流セット行・既定）／extend_only（延長のみ）
  if p_patch ? 'join_mode' then                                                                            -- ★2 0173
    if jsonb_typeof(p_patch->'join_mode') <> 'string' then raise exception 'bad type'; end if;             -- ★2 0173
    v_join := p_patch->>'join_mode';                                                                       -- ★2 0173
    if v_join is null or v_join not in ('join_set','extend_only') then raise exception 'bad join_mode'; end if;   -- ★2 0173
    v_before   := v_before || jsonb_build_object('join_mode', coalesce(v_settings->>'join_mode', ''));     -- ★2 0173
    v_after    := v_after  || jsonb_build_object('join_mode', v_join);                                     -- ★2 0173
    v_settings := jsonb_set(v_settings, '{join_mode}', to_jsonb(v_join), true);                            -- ★2 0173
  end if;                                                                                                  -- ★2 0173
  -- ★3 0173（裁定389）: キャストのレジ端末＝store_device（店端末のみ＝kiosk_devices purpose 'register' の登録を流用・既定）／own_phone（自分のスマホからも）。cast_register_enabled（set_store_cast_register）が ON のときだけ効く
  if p_patch ? 'cast_register_device' then                                                                 -- ★3 0173
    if jsonb_typeof(p_patch->'cast_register_device') <> 'string' then raise exception 'bad type'; end if;  -- ★3 0173
    v_crdev := p_patch->>'cast_register_device';                                                           -- ★3 0173
    if v_crdev is null or v_crdev not in ('store_device','own_phone') then raise exception 'bad cast_register_device'; end if;   -- ★3 0173
    v_before   := v_before || jsonb_build_object('cast_register_device', coalesce(v_settings->>'cast_register_device', ''));   -- ★3 0173
    v_after    := v_after  || jsonb_build_object('cast_register_device', v_crdev);                         -- ★3 0173
    v_settings := jsonb_set(v_settings, '{cast_register_device}', to_jsonb(v_crdev), true);                -- ★3 0173
  end if;                                                                                                  -- ★3 0173
  -- ★6 0173（裁定393）: 支払方法別の手数料率＝object {card, emoney, other}（整数 0〜100・cash／ar は持たない・欠損キー＝0＝手数料なし。UI の新規店の初期値がカード 10）
  if p_patch ? 'pay_fee_rates' then                                                                        -- ★6 0173
    if jsonb_typeof(p_patch->'pay_fee_rates') <> 'object' then raise exception 'bad type'; end if;         -- ★6 0173
    v_pfr := p_patch->'pay_fee_rates';                                                                     -- ★6 0173
    for v_pfk in select jsonb_object_keys(v_pfr) loop                                                      -- ★6 0173
      if v_pfk not in ('card','emoney','other') then raise exception 'bad pay_fee_rates'; end if;          -- ★6 0173
      if jsonb_typeof(v_pfr->v_pfk) <> 'number' then raise exception 'bad pay_fee_rates'; end if;          -- ★6 0173
      v_pfv := (v_pfr->>v_pfk)::numeric;                                                                   -- ★6 0173
      if v_pfv <> floor(v_pfv) or v_pfv < 0 or v_pfv > 100 then raise exception 'bad pay_fee_rates'; end if;   -- ★6 0173
    end loop;                                                                                              -- ★6 0173
    v_before   := v_before || jsonb_build_object('pay_fee_rates', coalesce(v_settings->'pay_fee_rates', '{}'::jsonb));   -- ★6 0173
    v_after    := v_after  || jsonb_build_object('pay_fee_rates', v_pfr);                                  -- ★6 0173
    v_settings := jsonb_set(v_settings, '{pay_fee_rates}', v_pfr, true);                                   -- ★6 0173
  end if;                                                                                                  -- ★6 0173
  -- ★7 0173（裁定396）: 体入の保証日数＝整数 1〜90（既定 3＝欠損時・「体入を追加」の期限付き保証の日数）
  if p_patch ? 'trial_guarantee_days' then                                                                 -- ★7 0173
    if jsonb_typeof(p_patch->'trial_guarantee_days') <> 'number' then raise exception 'bad type'; end if;  -- ★7 0173
    v_tgd := (p_patch->>'trial_guarantee_days')::numeric;                                                  -- ★7 0173
    if v_tgd <> floor(v_tgd) or v_tgd < 1 or v_tgd > 90 then raise exception 'bad trial_guarantee_days'; end if;   -- ★7 0173
    v_before   := v_before || jsonb_build_object('trial_guarantee_days', coalesce((v_settings->>'trial_guarantee_days')::numeric, 3));   -- ★7 0173
    v_after    := v_after  || jsonb_build_object('trial_guarantee_days', v_tgd::int);                      -- ★7 0173
    v_settings := jsonb_set(v_settings, '{trial_guarantee_days}', to_jsonb(v_tgd::int), true);             -- ★7 0173
  end if;                                                                                                  -- ★7 0173
  -- ★7 0173（裁定396）: 本採用（体入→在籍）時の既定プラン＝自店の有効な comp_plans.id（null＝未設定＝UI は切替しない）
  if p_patch ? 'default_plan_id' then                                                                      -- ★7 0173
    if jsonb_typeof(p_patch->'default_plan_id') = 'null' then                                              -- ★7 0173
      v_dpid := null;                                                                                      -- ★7 0173
    else                                                                                                   -- ★7 0173
      if jsonb_typeof(p_patch->'default_plan_id') <> 'string' then raise exception 'bad type'; end if;     -- ★7 0173
      begin v_dpid := (p_patch->>'default_plan_id')::uuid; exception when others then raise exception 'bad default_plan_id'; end;   -- ★7 0173
      if not exists (select 1 from public.comp_plans c where c.id = v_dpid and c.store_id = p_store_id and c.org_id = v_org and c.is_active) then   -- ★7 0173
        raise exception 'bad default_plan_id';                                                             -- ★7 0173
      end if;                                                                                              -- ★7 0173
    end if;                                                                                                -- ★7 0173
    v_before   := v_before || jsonb_build_object('default_plan_id', v_settings->'default_plan_id');        -- ★7 0173
    v_after    := v_after  || jsonb_build_object('default_plan_id', v_dpid);                               -- ★7 0173
    v_settings := jsonb_set(v_settings, '{default_plan_id}', coalesce(to_jsonb(v_dpid), 'null'::jsonb), true);   -- ★7 0173
  end if;                                                                                                  -- ★7 0173

  -- ── 1 回で書く（patch に無い列は現値のまま） ──────────
  update public.stores set
    name               = case when p_patch ? 'name'               then v_name  else name end,
    short              = case when p_patch ? 'short'              then v_short else short end,
    ext_shimei_enabled = case when p_patch ? 'ext_shimei_enabled' then v_ext    else ext_shimei_enabled end,
    dohan_auto_hon     = case when p_patch ? 'dohan_auto_hon'     then v_dohan  else dohan_auto_hon end,
    invoice_registered_on = case when p_patch ? 'invoice_registered_on' then v_inv_on  else invoice_registered_on end,   -- ★2 0164
    pay_day            = case when p_patch ? 'pay_day'            then v_pay_day::int else pay_day end,                   -- ★2 0164
    tax_inclusive_display = case when p_patch ? 'tax_inclusive_display' then v_tax_inc else tax_inclusive_display end,   -- ★2 0164
    use_vip            = case when p_patch ? 'use_vip'            then v_use_vip else use_vip end,                        -- ★2 0164
    use_counter        = case when p_patch ? 'use_counter'        then v_use_ctr else use_counter end,                    -- ★2 0164
    payment_methods    = case when p_patch ? 'payment_methods'    then v_paym    else payment_methods end,                -- ★2 0164
    punch_methods      = case when p_patch ? 'punch_methods'      then v_punch   else punch_methods end,                  -- ★2 0164
    settings_json      = v_settings
  where id = p_store_id;

  perform public.audit_log_write('set_store_profile', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$;
revoke execute on function public.set_store_profile(uuid, jsonb) from public, anon;
grant execute on function public.set_store_profile(uuid, jsonb) to authenticated;

-- ═══ report_can_close ═══
CREATE OR REPLACE FUNCTION public.report_can_close(p_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (public.auth_role() = 'owner'
       and exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = public.auth_org_id()))
    or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())
    or (public.auth_role() = 'staff' and p_store_id = public.auth_store_id() and public.auth_staff_can_close())
    or (public.auth_role() = 'cast' and p_store_id = public.auth_store_id() and public.auth_cast_can_register()),   -- ★3 0173（裁定389）: ON のキャストは日次の締め（close だけ＝reclose／cash_diff_approve は呼び元で cast 拒否）
    false)
$function$;
revoke execute on function public.report_can_close(uuid) from public, anon, authenticated, service_role;   -- 内部専用（live ACL {postgres=X/postgres} を踏襲）

-- ═══ daily_report_reclose ═══
CREATE OR REPLACE FUNCTION public.daily_report_reclose(p_report_id uuid, p_expense integer DEFAULT NULL::integer, p_cash_payout integer DEFAULT NULL::integer, p_cash_float integer DEFAULT NULL::integer, p_counted_cash integer DEFAULT NULL::integer, p_note text DEFAULT NULL::text, p_force boolean DEFAULT false, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record; v_agg jsonb; v_before jsonb; v_diff int; v_ar int;
  v_expense int; v_payout int; v_float int; v_counted int; v_flag boolean;
  v_ar_card int; v_ar_other int;  -- ★D45
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_row from public.daily_reports where id = p_report_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() = 'cast' or not public.report_can_close(v_row.store_id) then raise exception 'forbidden'; end if;   -- ★3 0173（389 追補2）: 再締めは cast に開かない
  v_flag := public.flag_enabled('reopen_flow', v_row.store_id);
  if v_flag then
    -- 冪等: 同一キーで既に再締め済みなら静かに返す
    if p_idem_key is not null and v_row.reclose_idem_key is not distinct from p_idem_key and v_row.reclosed_at is not null then
      return p_report_id;
    end if;
    if not (v_row.reopened_at is not null and v_row.reclosed_at is null) then raise exception 'not_reopened'; end if;
  end if;
  v_before := to_jsonb(v_row);

  -- 再集計は凍結済みの cutoff / rate を使う（範囲定義・税率は初回締めから不変）
  v_agg := public.daily_report_aggregate(v_row.store_id, v_row.biz_date, v_row.biz_cutoff_hm, v_row.card_tax_rate);
  v_ar  := (v_agg->>'ar_collected')::int;
  v_ar_card  := (v_agg->>'ar_collected_card')::int;   -- ★D45
  v_ar_other := (v_agg->>'ar_collected_other')::int;  -- ★D45
  if (v_agg->>'open_checks')::int > 0 and not p_force then
    raise exception 'open checks remain';
  end if;

  v_expense := coalesce(p_expense, v_row.expense);
  v_payout  := coalesce(p_cash_payout, v_row.cash_payout);
  v_float   := coalesce(p_cash_float, v_row.cash_float);
  v_counted := coalesce(p_counted_cash, v_row.counted_cash);
  if v_expense < 0 or v_payout < 0 or v_float < 0 or (v_counted is not null and v_counted < 0) then
    raise exception 'bad amount';
  end if;
  v_diff := case when v_counted is null then null
                 else v_counted - (v_float + (v_agg->>'cash')::int + v_ar - v_expense - v_payout) end;

  update public.daily_reports set
    cash = (v_agg->>'cash')::int, card_gross = (v_agg->>'card')::int, card_tax = (v_agg->>'card_tax')::int,
    uri = (v_agg->>'uri')::int, other = (v_agg->>'other')::int, drink_sales = (v_agg->>'drink_sales')::int,
    dohan_checks = (v_agg->>'dohan_checks')::int, slips = (v_agg->>'slips')::int, guests = (v_agg->>'guests')::int,
    open_checks_count = (v_agg->>'open_checks')::int, ar_collected = v_ar,
    ar_collected_card = v_ar_card, ar_collected_other = v_ar_other,  -- ★D45
    expense = v_expense, cash_payout = v_payout, cash_float = v_float,
    counted_cash = v_counted, diff = v_diff,
    note = coalesce(p_note, note),
    reclosed_count = reclosed_count + 1,
    reclosed_at = case when v_flag then now() else reclosed_at end,
    reclosed_by = case when v_flag then public.auth_membership_id() else reclosed_by end,
    reclose_idem_key = case when v_flag then p_idem_key else reclose_idem_key end,
    -- 差異が動いたら承認は無効(再承認が要る)
    diff_reason = case when v_diff is distinct from v_row.diff then null else diff_reason end,
    diff_approved_by = case when v_diff is distinct from v_row.diff then null else diff_approved_by end,
    diff_approved_at = case when v_diff is distinct from v_row.diff then null else diff_approved_at end
  where id = p_report_id;
  perform public.audit_log_write('daily_report_reclose', 'daily_reports:' || p_report_id::text, v_before,
    (select to_jsonb(d) from public.daily_reports d where d.id = p_report_id), v_row.store_id);
  return p_report_id;
end $function$;
revoke execute on function public.daily_report_reclose(uuid, integer, integer, integer, integer, text, boolean, uuid) from public, anon;
grant execute on function public.daily_report_reclose(uuid, integer, integer, integer, integer, text, boolean, uuid) to authenticated;

-- ═══ cash_diff_approve ═══
CREATE OR REPLACE FUNCTION public.cash_diff_approve(p_store_id uuid, p_biz_date date, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid; v_row public.daily_reports; v_before jsonb;
begin
  if p_store_id is null or p_biz_date is null then raise exception 'forbidden'; end if;
  v_org := public.auth_org_id();
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if not public.flag_enabled('reopen_flow', p_store_id) then raise exception 'feature_disabled:reopen_flow'; end if;
  if public.auth_role() = 'cast' or not public.report_can_close(p_store_id) then raise exception 'forbidden'; end if;   -- ★3 0173（裁定389）: 現金差異の承認は店長以上のまま
  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then raise exception 'reason_required'; end if;

  select * into v_row from public.daily_reports
   where store_id = p_store_id and biz_date = p_biz_date and org_id = v_org for update;
  if not found then raise exception 'not closed'; end if;
  if v_row.reopened_at is not null and v_row.reclosed_at is null then raise exception 'reopened'; end if;
  if v_row.counted_cash is null then raise exception 'not_counted'; end if;
  if coalesce(v_row.diff, 0) = 0 then raise exception 'no_diff'; end if;
  if v_row.diff_approved_at is not null then raise exception 'already_approved'; end if;
  v_before := to_jsonb(v_row);

  update public.daily_reports
     set diff_reason = p_reason, diff_approved_by = public.auth_membership_id(), diff_approved_at = now()
   where id = v_row.id;

  perform public.audit_log_write('cash_diff_approve', 'daily_reports:' || v_row.id::text, v_before,
    (select to_jsonb(d) from public.daily_reports d where d.id = v_row.id), p_store_id, p_reason);
  return v_row.id;
end $function$;
revoke execute on function public.cash_diff_approve(uuid, date, text) from public, anon;
grant execute on function public.cash_diff_approve(uuid, date, text) to authenticated;

-- ═══ daily_report_close ═══
CREATE OR REPLACE FUNCTION public.daily_report_close(p_store_id uuid, p_biz_date date, p_expense integer DEFAULT 0, p_cash_payout integer DEFAULT 0, p_cash_float integer DEFAULT 0, p_counted_cash integer DEFAULT NULL::integer, p_note text DEFAULT NULL::text, p_force boolean DEFAULT false, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid; v_settings jsonb; v_cutoff text; v_rate int;
  v_exist record; v_agg jsonb; v_actor uuid; v_id uuid; v_diff int; v_ar int;
  v_ar_card int; v_ar_other int;  -- ★D45
  v_refcash int := 0;  -- ★17 0152（裁定298-10）: 当日現金払いの紹介料（渡した額＝amount−withholding）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  if coalesce(p_expense, -1) < 0 or coalesce(p_cash_payout, -1) < 0 or coalesce(p_cash_float, -1) < 0 then
    raise exception 'bad amount';
  end if;
  if p_counted_cash is not null and p_counted_cash < 0 then raise exception 'bad amount'; end if;
  -- E1 mig0051: 税率は stores.card_tax_rate 列読み（列 CHECK 0..100 が構造保証・既定 5 は列 default と同値）
  select org_id, settings_json, card_tax_rate into v_owner, v_settings, v_rate
    from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())
          or (public.auth_role() = 'cast' and p_store_id = public.auth_store_id() and public.auth_cast_can_register())) then   -- ★3 0173（裁定389）: ON のキャストは通常の締め
    raise exception 'forbidden';
  end if;

  -- 冪等: 同一 (store, biz_date) の既存行＝同一キーなら成功・別キーは reclose を促す
  select * into v_exist from public.daily_reports
    where store_id = p_store_id and biz_date = p_biz_date;
  if v_exist.id is not null then
    if p_idem_key is not null and v_exist.close_idem_key = p_idem_key then return v_exist.id; end if;
    raise exception 'already closed';
  end if;

  -- 設定スナップショット（cutoff 既定 06:00＝json のまま／税率＝列読み・raise は防御深度で残置）
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_rate < 0 then
    raise exception 'bad store settings';
  end if;

  v_agg := public.daily_report_aggregate(p_store_id, p_biz_date, v_cutoff, v_rate);
  v_ar  := (v_agg->>'ar_collected')::int;
  v_ar_card  := (v_agg->>'ar_collected_card')::int;   -- ★D45
  v_ar_other := (v_agg->>'ar_collected_other')::int;  -- ★D45
  -- ★17 0152（裁定298-10）: paid_via 'cash_daily' の紹介料＝支払日時の営業日で集計（渡した額＝amount−withholding）
  select coalesce(sum(amount - withholding), 0)::int into v_refcash
    from public.referral_payouts
   where store_id = p_store_id and status = 'paid' and paid_via = 'cash_daily'
     and public.biz_date_of(p_store_id, paid_at) = p_biz_date;

  -- 【決定1】open 伝票が範囲内に残る場合は既定拒否・p_force で強行（残数を記録）
  if (v_agg->>'open_checks')::int > 0 and not p_force then
    raise exception 'open checks remain';
  end if;

  -- 【決定2＋B6】diff = counted − (float + cash + ar_collected − expense − payout)
  --   （モック H=Oi−q に回収現金を理論在高へ加算＝ドロワー実査整合）。counted 未入力時は null。
  --   ★D45: card/other 回収は理論在高に加算しない（式不変）。
  v_diff := case when p_counted_cash is null then null
                 else p_counted_cash - (coalesce(p_cash_float,0) + (v_agg->>'cash')::int + v_ar
                                        - coalesce(p_expense,0) - coalesce(p_cash_payout,0) - v_refcash) end;   -- ★17 0152（要裁定(1)）: 紹介料の当日現金払いはドロワーから出た額

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.daily_reports
    (org_id, store_id, biz_date,
     cash, card_gross, card_tax, uri, other, drink_sales, dohan_checks, slips, guests,
     open_checks_count, ar_collected, expense, cash_payout, cash_float, counted_cash, diff, note,
     biz_cutoff_hm, card_tax_rate, close_idem_key, closed_by,
     ar_collected_card, ar_collected_other,  -- ★D45
     referral_cash_payout,  -- ★17 0152（0173: 末尾 ')' → ','）
     set_ext_nom, products, pay_fee_total, closed_by_membership)  -- ★4／★6／★3 0173（裁定391／393／389）
  values
    (public.auth_org_id(), p_store_id, p_biz_date,
     (v_agg->>'cash')::int, (v_agg->>'card')::int, (v_agg->>'card_tax')::int,
     (v_agg->>'uri')::int, (v_agg->>'other')::int, (v_agg->>'drink_sales')::int,
     (v_agg->>'dohan_checks')::int, (v_agg->>'slips')::int, (v_agg->>'guests')::int,
     (v_agg->>'open_checks')::int, v_ar,
     coalesce(p_expense,0), coalesce(p_cash_payout,0), coalesce(p_cash_float,0),
     p_counted_cash, v_diff, p_note,
     v_cutoff, v_rate, p_idem_key, v_actor,
     v_ar_card, v_ar_other,  -- ★D45
     v_refcash,  -- ★17 0152（0173: 末尾 ')' → ','）
     (v_agg->>'set_ext_nom')::int, (v_agg->>'products')::int, (v_agg->>'pay_fee_total')::int, public.auth_membership_id())  -- ★4／★6／★3 0173
  returning id into v_id;
  perform public.audit_log_write('daily_report_close', 'daily_reports:' || v_id::text, null,
    (select to_jsonb(d) from public.daily_reports d where d.id = v_id), p_store_id);
  return v_id;
end $function$;
revoke execute on function public.daily_report_close(uuid, date, integer, integer, integer, integer, text, boolean, uuid) from public, anon;
grant execute on function public.daily_report_close(uuid, date, integer, integer, integer, integer, text, boolean, uuid) to authenticated;

-- ═══ kiosk_login ═══
CREATE OR REPLACE FUNCTION public.kiosk_login(p_membership_id uuid, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_device  public.kiosk_devices;
  v_mem     record;
  v_pin     public.staff_pin;
  v_ip      text;
  v_sid     uuid;
  v_newfail integer;
  v_settings jsonb;
  v_max     integer;
  v_lock    interval;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'register';
  if not found then raise exception 'forbidden'; end if;
  -- ★mig0108（M-11b ②）: ロック閾値を店設定から読む（既定 5回 / 15分＝改稿前のハードコードと同値）
  select s.settings_json into v_settings from public.stores s where s.id = v_device.store_id;
  v_max  := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_max_fail'), '')::int, 5);
  v_lock := make_interval(mins => coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_minutes'), '')::int, 15));
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  -- 形式不正 PIN は失敗カウント外（kiosk_punch 逐語・PIN 桁数＝cast_pin 現行4桁に揃える＝確定＋）
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;

  -- 操作担当候補＝自店 active membership・owner/manager/staff(can_register)（cast は kiosk 不使用・
  -- 他店/他 org は not_found＝存在オラクル封じ）
  select m.id, m.user_id, m.role, u.name as user_name into v_mem
    from public.memberships m join public.users u on u.id = m.user_id
   where m.id = p_membership_id and m.store_id = v_device.store_id and m.is_active
     and u.is_active
     and (m.role in ('owner','manager') or (m.role = 'staff' and m.can_register)
          or (m.role = 'cast' and m.can_register and coalesce((select s.settings_json->>'cast_register_enabled' from public.stores s where s.id = m.store_id), '') = 'true'));   -- ★3 0173（389 追補1）: レジ端末の候補に ON のキャスト
  if v_mem.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select p.* into v_pin from public.staff_pin p
    where p.membership_id = p_membership_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;

  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked',
                              'locked_until', v_pin.locked_until);
  end if;

  if v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then
    v_newfail := v_pin.fail_count + 1;
    if v_newfail >= v_max then
      update public.staff_pin
         set fail_count = 0, locked_until = now() + v_lock, updated_at = now()
       where membership_id = p_membership_id;
    else
      update public.staff_pin
         set fail_count = v_newfail, updated_at = now()
       where membership_id = p_membership_id;
    end if;
    insert into public.audit_logs
      (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values
      (v_device.org_id, v_device.store_id, null, 'kiosk_login',
       'staff_pin:' || p_membership_id::text, null,
       jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', p_membership_id,
                          'result', 'wrong_pin', 'fail_count', v_newfail,
                          'locked', v_newfail >= v_max),
       v_ip);
    if v_newfail >= v_max then
      return jsonb_build_object('ok', false, 'reason', 'locked',
                                'locked_until', now() + v_lock);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  -- PIN 一致: カウンタ復元 → 既存セッションを閉じて差し替え → 新セッション発行
  update public.staff_pin
     set fail_count = 0, locked_until = null, updated_at = now()
   where membership_id = p_membership_id;

  update public.kiosk_sessions set ended_at = now()
   where device_id = v_device.id and ended_at is null;

  -- ★mig0108（M-11b ①・レジ端末）: 端末の最終アクセスを記録（打刻端末は mig0109 の kiosk_punch 側）
  update public.kiosk_devices
     set last_seen_at = now(), last_ip = v_ip
   where id = v_device.id;

  insert into public.kiosk_sessions (org_id, store_id, device_id, membership_id, operator_user_id)
  values (v_device.org_id, v_device.store_id, v_device.id, p_membership_id, v_mem.user_id)
  returning id into v_sid;

  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, v_mem.user_id, 'kiosk_login',
     'kiosk_sessions:' || v_sid::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', p_membership_id,
                        'operator_user_id', v_mem.user_id, 'result', 'ok'),
     v_ip);

  return jsonb_build_object('ok', true, 'session_id', v_sid,
                            'operator_name', v_mem.user_name, 'role', v_mem.role,
                            'idle_minutes', 15);
end $function$;
revoke execute on function public.kiosk_login(uuid, text) from public, anon;
grant execute on function public.kiosk_login(uuid, text) to authenticated;

-- ═══ kiosk_operator_list ═══
CREATE OR REPLACE FUNCTION public.kiosk_operator_list()
 RETURNS TABLE(membership_id uuid, user_name text, role text, has_pin boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.id, u.name, m.role,
         exists (select 1 from public.staff_pin p where p.membership_id = m.id)
  from public.memberships m
  join public.users u on u.id = m.user_id
  where m.store_id = public.auth_kiosk_register_store_id()
    and m.is_active and u.is_active
    and (m.role in ('owner','manager') or (m.role = 'staff' and m.can_register)
         or (m.role = 'cast' and m.can_register and coalesce((select s.settings_json->>'cast_register_enabled' from public.stores s where s.id = m.store_id), '') = 'true'))   -- ★3 0173（389 追補1）
  order by u.name
$function$;
revoke execute on function public.kiosk_operator_list() from public, anon;
grant execute on function public.kiosk_operator_list() to authenticated;

-- ═══ staff_pin_status ═══
CREATE OR REPLACE FUNCTION public.staff_pin_status(p_store_id uuid)
 RETURNS TABLE(membership_id uuid, has_pin boolean, fail_count integer, locked_until timestamp with time zone, pin_updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and p_store_id = v_st)) then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;
  return query
  select m.id,
         (p.membership_id is not null),
         coalesce(p.fail_count, 0),
         p.locked_until,
         p.updated_at
    from public.memberships m
    left join public.staff_pin p on p.membership_id = m.id
   where m.store_id = p_store_id
     and m.is_active
     and (m.role in ('owner','manager') or m.role = 'staff'
          or (m.role = 'cast' and m.can_register and coalesce((select s.settings_json->>'cast_register_enabled' from public.stores s where s.id = m.store_id), '') = 'true'))   -- ★3 0173（389 追補1）: PIN 管理の一覧に ON のキャスト・staff は can_register に関わらず（0174 の打刻端末 staff_punch＝PIN 照合）
   order by m.role, m.id;
end $function$;
revoke execute on function public.staff_pin_status(uuid) from public, anon;
grant execute on function public.staff_pin_status(uuid) to authenticated;

-- ═══ set_staff_pin ═══
CREATE OR REPLACE FUNCTION public.set_staff_pin(p_membership_id uuid, p_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_org uuid := public.auth_org_id();
  v_mem record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'bad pin'; end if;
  -- memberships は org 列を持たない＝store 経由で org 照合（他 org は not found＝存在オラクル封じ）
  select m.id, m.store_id, m.role, m.is_active, m.can_register into v_mem
    from public.memberships m join public.stores s on s.id = m.store_id
   where m.id = p_membership_id and s.org_id = v_org;
  if v_mem.id is null then raise exception 'not found'; end if;
  if not v_mem.is_active then raise exception 'inactive membership'; end if;
  if not (v_mem.role in ('owner','manager') or v_mem.role = 'staff' or (v_mem.role = 'cast' and v_mem.can_register)) then   -- ★3 0173（389 追補1）: ON のキャストにレジ端末の PIN・staff は can_register に関わらず（0174 の打刻端末 staff_punch＝PIN 照合・レジ候補は kiosk_login 側で can_register を見る）
    raise exception 'bad target';
  end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_mem.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  insert into public.staff_pin (membership_id, org_id, store_id, pin_hash)
  values (p_membership_id, v_org, v_mem.store_id, crypt(p_pin, gen_salt('bf')))
  on conflict (membership_id) do update
    set pin_hash = excluded.pin_hash,
        store_id = excluded.store_id,
        fail_count = 0,
        locked_until = null,
        updated_at = now();

  perform public.audit_log_write('set_staff_pin', 'staff_pin:' || p_membership_id::text,
    null, jsonb_build_object('membership_id', p_membership_id, 'reset', true), v_mem.store_id);
end $function$;
revoke execute on function public.set_staff_pin(uuid, text) from public, anon;
grant execute on function public.set_staff_pin(uuid, text) to authenticated;

-- ═══ daily_report_aggregate ═══
CREATE OR REPLACE FUNCTION public.daily_report_aggregate(p_store_id uuid, p_biz_date date, p_cutoff_hm text, p_tax_rate integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org   uuid;
  v_start timestamptz;
  v_end   timestamptz;
  v jsonb;
begin
  select org_id into v_org from public.stores where id = p_store_id;
  if v_org is null then raise exception 'not found'; end if;
  -- [D cutoff JST, D+1 cutoff JST)
  v_start := ((p_biz_date::text || ' ' || p_cutoff_hm) )::timestamp at time zone 'Asia/Tokyo';
  v_end   := (((p_biz_date + 1)::text || ' ' || p_cutoff_hm))::timestamp at time zone 'Asia/Tokyo';
  select jsonb_build_object(
    'open_checks', (select count(*) from public.checks c
                     where c.org_id = v_org and c.store_id = p_store_id and c.status = 'open'
                       and c.started_at >= v_start and c.started_at < v_end),
    'slips',  (select count(*) from public.checks c
                where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
                  and c.started_at >= v_start and c.started_at < v_end),
    'guests', (select coalesce(sum(c.people), 0) from public.checks c
                where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
                  and c.started_at >= v_start and c.started_at < v_end),
    'dohan_checks', (select count(*) from public.checks c
                where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed' and c.nom_type = 'dohan'
                  and c.started_at >= v_start and c.started_at < v_end),
    'cash',  (select coalesce(sum(p.amount), 0) from public.payments p
               join public.checks c on c.id = p.check_id
               where c.org_id = v_org and p.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and p.method = 'cash'
                 and c.started_at >= v_start and c.started_at < v_end),
    'card',  (select coalesce(sum(p.amount), 0) from public.payments p
               join public.checks c on c.id = p.check_id
               where c.org_id = v_org and p.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and p.method = 'card'
                 and c.started_at >= v_start and c.started_at < v_end),
    'uri',   (select coalesce(sum(p.amount), 0) from public.payments p
               join public.checks c on c.id = p.check_id
               where c.org_id = v_org and p.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and p.method = 'ar'
                 and c.started_at >= v_start and c.started_at < v_end),
    'other', (select coalesce(sum(p.amount), 0) from public.payments p
               join public.checks c on c.id = p.check_id
               where c.org_id = v_org and p.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and p.method = 'other'
                 and c.started_at >= v_start and c.started_at < v_end),
    'drink_sales', (select coalesce(sum(l.line_total), 0) from public.check_lines l
               join public.checks c on c.id = l.check_id
               where c.org_id = v_org and l.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and l.kind in ('drink','champ')
                 and c.started_at >= v_start and c.started_at < v_end),
    -- ★4 0173（裁定391）: 売上内訳 2 分類＝セット・延長・指名（kind set／time／charge＝手数料行 pay_fee も上段）／商品（drink／champ／bottle／custom／food／other／keep_out）。discount はどちらにも乗せない
    'set_ext_nom', (select coalesce(sum(l.line_total), 0) from public.check_lines l
               join public.checks c on c.id = l.check_id
               where c.org_id = v_org and l.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and l.kind in ('set','time','charge')
                 and c.started_at >= v_start and c.started_at < v_end),
    'products', (select coalesce(sum(l.line_total), 0) from public.check_lines l
               join public.checks c on c.id = l.check_id
               where c.org_id = v_org and l.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and l.kind in ('drink','champ','bottle','custom','food','other','keep_out')
                 and c.started_at >= v_start and c.started_at < v_end),
    -- ★6 0173（裁定393）: 支払手数料の合計（客負担・fee_kind 'pay_fee'・カード入金 card は手数料込みの受取額のまま＝現金差異に影響なし）
    'pay_fee_total', (select coalesce(sum(l.line_total), 0) from public.check_lines l
               join public.checks c on c.id = l.check_id
               where c.org_id = v_org and l.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and l.fee_kind = 'pay_fee'
                 and c.started_at >= v_start and c.started_at < v_end),
    -- ★B6（mig0055）: 回収現金（別掲・biz_date 直・method='cash' のみ＝理論在高加算対象）。
    --   checks/payments 非依存＝発生日 uri との二重計上は起きない（別経路・突合は receivables 直 SELECT）。
    'ar_collected', (select coalesce(sum(x.amount), 0) from public.ar_collections x
               where x.org_id = v_org and x.store_id = p_store_id
                 and x.biz_date = p_biz_date and x.method = 'cash'),
    -- ★D45（mig0143）: 回収 card／other（別掲・biz_date 直・理論在高には加算しない＝ドロワー非加算）。
    'ar_collected_card', (select coalesce(sum(x.amount), 0) from public.ar_collections x
               where x.org_id = v_org and x.store_id = p_store_id
                 and x.biz_date = p_biz_date and x.method = 'card'),
    'ar_collected_other', (select coalesce(sum(x.amount), 0) from public.ar_collections x
               where x.org_id = v_org and x.store_id = p_store_id
                 and x.biz_date = p_biz_date and x.method = 'other')
  ) into v;
  return v || jsonb_build_object('card_tax', round(((v->>'card')::int) * p_tax_rate / 100.0)::int);
end $function$;
revoke execute on function public.daily_report_aggregate(uuid, date, text, integer) from public, anon, authenticated, service_role;   -- 内部専用（live ACL {postgres=X/postgres} を踏襲）

-- ═══ bottle_keep_register ═══
CREATE OR REPLACE FUNCTION public.bottle_keep_register(p_store_id uuid, p_customer_id uuid, p_product_id uuid, p_note text DEFAULT NULL::text, p_remaining_pct integer DEFAULT NULL::integer, p_expires_on date DEFAULT NULL::date, p_shelf_no text DEFAULT NULL::text, p_bottle_name text DEFAULT NULL::text, p_check_line_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'active'::text)   -- ★5 0173（裁定392）: pending＝会計前（レジの「キープ」）
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
  if p_status is null or p_status not in ('active','pending') then raise exception 'bad status'; end if;   -- ★5 0173（裁定392）

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
  -- ★5 0173（裁定392）: status＝p_status（'active'／'pending'）
  insert into public.bottle_keeps (org_id, store_id, customer_id, product_id, status, opened_at, note, remaining_pct, expires_on, shelf_no, bottle_name, check_line_id)   -- ★16: 末尾 ')' → ', bottle_name)'（0158 ★7: +check_line_id）
  values (v_org, p_store_id, p_customer_id, p_product_id, p_status, now(), p_note, p_remaining_pct, p_expires_on, p_shelf_no, nullif(trim(coalesce(p_bottle_name, '')), ''), p_check_line_id)   -- ★16（0158 ★7: 購入行との紐づけ＝裁定314）
  returning id into v_id;

  perform public.audit_log_write('bottle_keep_register', 'bottle_keeps:' || v_id::text, null,
    (select to_jsonb(b) from public.bottle_keeps b where b.id = v_id), p_store_id);
  return v_id;
end $function$;
revoke execute on function public.bottle_keep_register(uuid, uuid, uuid, text, integer, date, text, text, uuid, text) from public, anon;
grant execute on function public.bottle_keep_register(uuid, uuid, uuid, text, integer, date, text, text, uuid, text) to authenticated;

-- ═══ check_line_set_customer ═══
CREATE OR REPLACE FUNCTION public.check_line_set_customer(p_line_id uuid, p_customer_id uuid, p_keep boolean DEFAULT false)   -- ★5 0173（裁定392）: p_keep＝レジの「キープ」＝会計前キープ行
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- ★5 0173（裁定392）: キープはレジで押した時点で顧客のキープ一覧に出る（status 'pending'＝会計前）。外す（customer null）と pending 行は消える。
  --   会計（check_close）で active・伝票取消（check_void）で削除。既に active の行がある購入行には作らない。
  if p_customer_id is null then
    delete from public.bottle_keeps where check_line_id = p_line_id and status = 'pending';
  elsif coalesce(p_keep, false) then
    if exists (select 1 from public.bottle_keeps b where b.check_line_id = p_line_id and b.status = 'pending') then
      update public.bottle_keeps set customer_id = p_customer_id, updated_at = now() where check_line_id = p_line_id and status = 'pending';
    elsif not exists (select 1 from public.bottle_keeps b where b.check_line_id = p_line_id) then
      if v_line.product_id is null then raise exception 'bad line'; end if;
      perform public.bottle_keep_register(p_store_id => v_chk.store_id, p_customer_id => p_customer_id, p_product_id => v_line.product_id,
                                          p_check_line_id => p_line_id, p_status => 'pending');
    end if;
  end if;
  perform public.audit_log_write('check_line_set_customer', 'check_lines:' || p_line_id::text,
    jsonb_build_object('customer_id', v_line.customer_id), jsonb_build_object('customer_id', p_customer_id), v_chk.store_id);
end $function$;
revoke execute on function public.check_line_set_customer(uuid, uuid, boolean) from public, anon;
grant execute on function public.check_line_set_customer(uuid, uuid, boolean) to authenticated;

-- ═══ check_close ═══
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
  v_prev_kinds text[]; v_kind_chg timestamptz[]; v_k text;  -- ★0169（裁定341）: 場内→本指名の切替前に出た行は旧区分で計算（非遡及）
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
         array_agg(is_dohan order by position, created_at, id),
         array_agg(prev_kind order by position, created_at, id),       -- ★0169
         array_agg(kind_changed_at order by position, created_at, id)  -- ★0169
    into v_cast_ids, v_weights, v_kinds, v_dohans, v_prev_kinds, v_kind_chg
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
          v_k := case when v_kind_chg[i] is not null and v_line.created_at < v_kind_chg[i] then coalesce(v_prev_kinds[i], v_kinds[i]) else v_kinds[i] end;  -- ★0169: 行の作成が切替より前＝旧区分（既出のドリンクは注文時点の率）
          if v_modes[i] = 'plan_rate' then
            -- ★0132: 売上按分のみ凍結(商品3列は加算しない)
            v_salesbase[i] := v_salesbase[i] + v_line.unit_price_snapshot * v_alloc[i];
          elsif v_modes[i] = 'plan_fixed' then
            -- ★0133: 売上按分(監査用)+按分本数を凍結(商品3列は加算しない)
            v_salesbase[i] := v_salesbase[i] + v_line.unit_price_snapshot * v_alloc[i];
            v_units[i] := v_units[i] + v_alloc[i];
            -- ★9 0153（305-12／296 追補2）: 1 本あたり固定額の解決順＝商品 unit4（back_mode='unit4'）→ cast_plan 区分別 → comp_plans 区分別 → 一律。同伴＝本指名（unit4 は自分の dohan キー）
            v_reg := public.nom_unit4_key(v_k, v_dohans[i]);
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
              v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> public.nom_unit4_key(v_k, v_dohans[i]))::int, 0);
            end if;
            if v_line.kind = 'drink'  then v_drink[i]  := v_drink[i]  + v_unit * v_alloc[i]; end if;
            if v_line.kind = 'champ'  then v_champ[i]  := v_champ[i]  + v_unit * v_alloc[i]; end if;
            if v_line.kind = 'bottle' then v_bottle[i] := v_bottle[i] + v_unit * v_alloc[i]; end if;
          end if;
          -- pt は3択の射程外=全 mode 共通(裁定113)
          if v_k = 'hon' then  -- ★0119: pt は本指名キャストの行のみ（★0169: 行時点の区分）
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
  -- ★5 0173（裁定392）: 会計でキープ確定＝この伝票の購入行に紐づく pending → active
  update public.bottle_keeps b
     set status = 'active', opened_at = now(), updated_at = now()
   where b.status = 'pending'
     and b.check_line_id in (select l.id from public.check_lines l where l.check_id = p_check_id);
  update public.checks
     set status = 'closed', closed_at = now(), close_idem_key = p_idem_key
   where id = p_check_id;
  -- ★mig0053(B1 相席・transient): 追加席の占有を解放(解放経路=ロック不要・money 非干渉)
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_close', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
  return p_check_id;
end $function$;
revoke execute on function public.check_close(uuid, uuid) from public, anon;
grant execute on function public.check_close(uuid, uuid) to authenticated;

-- ═══ check_void ═══
CREATE OR REPLACE FUNCTION public.check_void(p_check_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_backs jsonb; v_actor uuid; v_settled int;
  v_pending_claims jsonb;  -- 【F3f】
  v_refp jsonb;  -- ★15 0152（裁定298-10）: 紹介料の支払行（監査痕跡）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'bad reason'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status not in ('open','closed') then raise exception 'not voidable'; end if;

  -- 回収済み・一部でも給与天引き済み（deducted_amount>0）・一部でも現金回収済み（collected_amount>0）の売掛があれば
  -- void 拒否（宙吊り/幻影防止＝条件3＋partial。★mig0092: collected_amount>0 を追加＝ar_collections 幻影の封鎖）
  select count(*) into v_settled from public.receivables
    where check_id = p_check_id and (status in ('collected','deducted') or deducted_amount > 0 or collected_amount > 0);
  if v_settled > 0 then raise exception 'receivable settled'; end if;

  -- 監査痕跡: 削除する check_cast_backs を before に含める
  select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_backs
    from public.check_cast_backs b where b.check_id = p_check_id;
  -- 【F3f】監査痕跡: 自動 reject する pending claims も before に含める（cast_backs と同型・per-claim audit は書かない）
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_pending_claims
    from public.drink_claims d where d.check_id = p_check_id and d.status = 'pending';
  v_before := to_jsonb(v_chk) || jsonb_build_object('cast_backs', v_backs)
                              || jsonb_build_object('pending_claims', v_pending_claims);

  -- ★15 0152（裁定298-10）: 支払行を before に含め、unpaid は 'voided'（paid は据え置き＝返金は手動・要裁定(8)）
  select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_refp
    from public.referral_payouts p where p.check_id = p_check_id;
  v_before := v_before || jsonb_build_object('referral_payouts', v_refp);
  update public.referral_payouts set status = 'voided'
    where check_id = p_check_id and status = 'unpaid';
  update public.receivables set status = 'voided'
    where check_id = p_check_id and status = 'open';
  delete from public.check_cast_backs where check_id = p_check_id;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  -- 【F3f】void 時 pending claim 自動 reject（宙吊り防止＝receivables 'voided' と同型思想・approved は残置＝
  --        給与除外は collect.ts の void フィルタが単一責任点）
  update public.drink_claims
     set status = 'rejected', decided_by = v_actor, decided_at = now()
   where check_id = p_check_id and status = 'pending';
  -- ★5 0173（裁定392）: 伝票取消＝会計前キープ（pending）を削除
  delete from public.bottle_keeps b
   where b.status = 'pending'
     and b.check_line_id in (select l.id from public.check_lines l where l.check_id = p_check_id);
  update public.checks
     set status = 'void', voided_at = now(), voided_by = v_actor, void_reason = trim(p_reason)
   where id = p_check_id;
  -- ★mig0053（B1 相席・transient）: 追加席の占有を解放（解放経路＝ロック不要・money 非干渉）
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_void', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
end $function$;
revoke execute on function public.check_void(uuid, text) from public, anon;
grant execute on function public.check_void(uuid, text) to authenticated;

-- ═══ customer_summary ═══
CREATE OR REPLACE FUNCTION public.customer_summary(p_customer_id uuid)
 RETURNS TABLE(customer_id uuid, visits integer, last_visit timestamp with time zone, total_spend bigint, active_bottles integer, open_receivable bigint, pending_bottles integer)   -- ★5 0173（裁定392）: +pending_bottles（会計前・注記用）
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_cust public.customers;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  select * into v_cust from public.customers where id = p_customer_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 可視ガード（RLS と同じ判定を RPC 内で再現＝definer 迂回の物理保証）
  if not (
    (v_role = 'owner')
    or (v_role = 'manager' and v_cust.store_id = public.auth_store_id())
    or (v_role = 'staff' and public.auth_staff_can_crm() and v_cust.store_id = public.auth_store_id())
    or (v_role = 'cast'  and v_cust.cast_id = public.auth_cast_id())   -- 担当客のみ
  ) then
    raise exception 'forbidden';
  end if;

  return query
  select
    p_customer_id,
    (select count(*)::int from public.checks c
       where c.customer_id = p_customer_id and c.status = 'closed'),
    (select max(c.started_at) from public.checks c
       where c.customer_id = p_customer_id and c.status = 'closed'),
    (select coalesce(sum(c.total), 0)::bigint from public.checks c
       where c.customer_id = p_customer_id and c.status = 'closed'),
    (select count(*)::int from public.bottle_keeps b
       where b.customer_id = p_customer_id and b.status = 'active'),
    (select coalesce(sum(r.amount), 0)::bigint from public.receivables r
       where r.customer_id = p_customer_id and r.status = 'open'),
    (select count(*)::int from public.bottle_keeps b
       where b.customer_id = p_customer_id and b.status = 'pending');   -- ★5 0173（裁定392）
end $function$;
revoke execute on function public.customer_summary(uuid) from public, anon;
grant execute on function public.customer_summary(uuid) to authenticated;

-- ═══ check_pay ═══
CREATE OR REPLACE FUNCTION public.check_pay(p_check_id uuid, p_method text, p_amount integer, p_pay_group text DEFAULT 'A'::text, p_tendered integer DEFAULT NULL::integer, p_idem_key uuid DEFAULT NULL::uuid, p_method_detail text DEFAULT NULL::text, p_fee_key text DEFAULT NULL::text)   -- ★6 0173（裁定393）: 手数料率のキー（card／emoney／other・null＝method から）
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_grp text; v_due int; v_paid int; v_id uuid; v_actor uuid;
  v_recv uuid; v_first_cast uuid;
  v_detail text;  -- 【F4c】
  v_org uuid;  -- ★0057(2)
  v_fkey text; v_rate int := 0; v_fee int := 0; v_fee_eff int := 0; v_due2 int; v_sort int; v_fid uuid; v_settings jsonb;  -- ★6 0173（裁定393）
  v_mem uuid;  -- ★3 0173（裁定389）: 操作者の membership
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_method is null or p_method not in ('cash','card','ar','other') then raise exception 'bad method'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  -- 【F4c】detail は全 method で受理（card/other のみ表示は UI 責務）・空→null・50字
  v_detail := nullif(trim(coalesce(p_method_detail, '')), '');
  if v_detail is not null and char_length(v_detail) > 50 then raise exception 'bad detail'; end if;
  -- tendered は cash のみ・お預かり ≥ 充当額（レビュー指摘: 未満は矛盾）
  if p_tendered is not null then
    if p_method <> 'cash' or p_tendered < p_amount then raise exception 'bad tendered'; end if;
  end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;

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

  -- 冪等: 同一キー再送は既存 payment を返す（別伝票のキー再利用は拒否）。
  -- org/ロール照合の後に置く（照合前だと org 外ユーザーがキーの存在確認に使えてしまう＝レビュー指摘）。
  -- status 判定より前に置く（close 後に届いた正当な再送にも既存 id を返す）。
  if p_idem_key is not null then
    select id, check_id into v_id, v_recv from public.payments where idem_key = p_idem_key;
    if v_id is not null then
      if v_recv <> p_check_id then raise exception 'bad idem key'; end if;
      return v_id;
    end if;
  end if;

  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  -- 【決定3】残額検証は group 単位（過入金なし＝超過は明示拒否）
  v_due := public.check_group_due(p_check_id, v_grp);
  select coalesce(sum(amount), 0)::int into v_paid
    from public.payments where check_id = p_check_id and pay_group = v_grp;
  if v_due - v_paid <= 0 then raise exception 'no balance'; end if;
  if p_amount > v_due - v_paid then raise exception 'exceeds balance'; end if;

  -- ★6 0173（裁定393）: 支払方法別の手数料＝店設定 pay_fee_rates（card／emoney／other・cash／ar は対象外・欠損＝0）。
  --   手数料＝round(p_amount×率/100)（1 円未満四捨五入・併用時はその方法で入金する分だけ）→ 伝票行（kind 'charge'・fee_kind 'pay_fee'・同じ pay_group・内税対象）
  --   → check_recalc → 受取額（payments.amount）＝p_amount＋due の増分（丸め単位に従う）。キャスト売上（cast_sales_aggregate）は除外・日報は pay_fee_total。
  if p_method in ('card','other') then
    v_fkey := coalesce(p_fee_key, case when p_method = 'card' then 'card' else 'other' end);
    if v_fkey not in ('card','emoney','other') then raise exception 'bad fee_key'; end if;
    if (p_method = 'card') <> (v_fkey = 'card') then raise exception 'bad fee_key'; end if;
    select s.settings_json into v_settings from public.stores s where s.id = v_chk.store_id;
    v_rate := coalesce(nullif(coalesce(v_settings, '{}'::jsonb)->'pay_fee_rates'->>v_fkey, '')::int, 0);
    if v_rate > 0 then
      v_fee := round(p_amount * v_rate / 100.0)::int;
      if v_fee > 0 then
        select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, time_auto, fee_kind, tax_category)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', v_grp,
                (case v_fkey when 'card' then 'カード手数料 ' when 'emoney' then '電子マネー手数料 ' else '決済手数料 ' end) || v_rate || '%',
                v_fee, 1, v_fee, null, v_sort, false, 'pay_fee', 'taxable_10')
        returning id into v_fid;
        perform public.check_recalc(p_check_id);
        v_due2 := public.check_group_due(p_check_id, v_grp);
        v_fee_eff := greatest(0, v_due2 - v_due);
      end if;
    end if;
  end if;

  -- ★0057(4): actor＝operator 優先（payments.by_user_id NOT NULL を kiosk でも充足）
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  v_mem := public.auth_membership_id();   -- ★3 0173（裁定389）: kiosk は null
  insert into public.payments (org_id, store_id, check_id, pay_group, method, amount, tendered, idem_key, by_user_id, method_detail, by_membership)   -- ★3 0173: +by_membership
  values (v_chk.org_id, v_chk.store_id, p_check_id, v_grp, p_method, p_amount + v_fee_eff, p_tendered, p_idem_key, v_actor, v_detail, v_mem)   -- ★6 0173: 受取額＝入金額＋手数料（due の増分）
  returning id into v_id;
  perform public.audit_log_write('check_pay', 'payments:' || v_id::text, null,
    (select to_jsonb(p) from public.payments p where p.id = v_id) || jsonb_build_object('pay_fee', v_fee, 'pay_fee_eff', v_fee_eff, 'pay_fee_rate', v_rate, 'pay_fee_line_id', v_fid), v_chk.store_id);   -- ★6 0173: 手数料の痕跡

  -- 売掛: receivables を生成（cast は先頭指名・customer は伝票から＝サーバ導出）
  if p_method = 'ar' then
    select cast_id into v_first_cast from public.check_nominations
      where check_id = p_check_id order by position, created_at, id limit 1;
    if not public.ar_policy_ok(v_chk.store_id, p_amount) then raise exception 'ar disabled'; end if;   -- ★3 0155（裁定309-1）: 0055:165 の 1 行＝店設定 ar_enabled=false なら売掛不可
    insert into public.receivables (org_id, store_id, check_id, customer_id, cast_id, amount)
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_chk.customer_id, v_first_cast, p_amount)
    returning id into v_recv;
    perform public.audit_log_write('receivable_open', 'receivables:' || v_recv::text, null,
      (select to_jsonb(r) from public.receivables r where r.id = v_recv), v_chk.store_id);
  end if;
  return v_id;
end $function$;
revoke execute on function public.check_pay(uuid, text, integer, text, integer, uuid, text, text) from public, anon;
grant execute on function public.check_pay(uuid, text, integer, text, integer, uuid, text, text) to authenticated;

-- ═══ cast_sales_aggregate ═══
CREATE OR REPLACE FUNCTION public.cast_sales_aggregate(p_store_id uuid, p_from date, p_to date)
 RETURNS TABLE(cast_id uuid, biz_date date, sales integer, hon integer, jonai integer, dohan integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid;
  v_settings jsonb;
  v_cutoff   text;
begin
  if p_from is null or p_to is null or p_from > p_to then raise exception 'bad range'; end if;
  if p_to - p_from > 92 then raise exception 'bad range'; end if; -- 給与期間の常識的上限(四半期)
  select s.org_id, s.settings_json into v_org, v_settings from public.stores s where s.id = p_store_id;
  if v_org is null then raise exception 'not found'; end if;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;

  return query
  with target_checks as (
    -- SL6a: closed のみ(void/open 除外)。SL5a: biz_date=(JST(started_at)−cutoff)::date【2】
    select c.id as check_id,
           c.nom_type,
           (timezone('Asia/Tokyo', c.started_at) - (v_cutoff || ':00')::interval)::date as bdate
    from public.checks c
    where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
      and (timezone('Asia/Tokyo', c.started_at) - (v_cutoff || ':00')::interval)::date between p_from and p_to
  ),
  noms as (
    -- SL4a: nomination の無い伝票(フリー卓)はここで自然に脱落=非帰属
    select n.check_id, n.cast_id as cid, n.ratio_weight, n.position, n.nom_kind, n.is_dohan  -- ★0119
    from public.check_nominations n
    join target_checks tc on tc.check_id = n.check_id
    where n.org_id = v_org
  ),
  wsum as (
    select nm.check_id, sum(nm.ratio_weight)::bigint as w_total
    from noms nm group by nm.check_id
  ),
  groups as materialized (
    -- SL2a: 金額基盤=group due(check_group_due 再利用・サ料込・100円丸め後・カードTAX 非含)
    select tc.check_id, tc.bdate, l.pay_group,
           public.check_group_due(tc.check_id, l.pay_group, true) as due   -- ★6 0173（裁定393）: 手数料行を除外（キャストの売上・ノルマ・歩合・スライドに乗せない）
    from target_checks tc
    join (select distinct cl.check_id, cl.pay_group from public.check_lines cl where cl.org_id = v_org) l
      on l.check_id = tc.check_id
  ),
  alloc as (
    -- SL1a: weight 按分・整数演算のみ【1】 base=div(due×w, W)・rem=(due×w) mod W
    select g.check_id, g.bdate, g.pay_group, nm.cid,
           ((g.due::bigint * nm.ratio_weight) / ws.w_total)::int  as base_part,
           ((g.due::bigint * nm.ratio_weight) % ws.w_total)       as rem_part,
           nm.position,
           g.due
    from groups g
    join noms nm on nm.check_id = g.check_id
    join wsum ws on ws.check_id = g.check_id
    where g.due > 0 and ws.w_total > 0 -- 全 weight 0 は按分不能=按分なし(★0124: ended/全0 名簿を許容・w_total ガードが権威)
  ),
  ranked as (
    select a.*,
           row_number() over (partition by a.check_id, a.pay_group
                              order by a.rem_part desc, a.position asc) as rk,
           a.due - sum(a.base_part) over (partition by a.check_id, a.pay_group) as remainder_units
    from alloc a
  ),
  parts as (
    select r.cid, r.bdate,
           r.base_part + case when r.rk <= r.remainder_units then 1 else 0 end as part
    from ranked r
  ),
  sales_by_day as (
    select p.cid, p.bdate, sum(p.part)::int as sales_sum
    from parts p group by p.cid, p.bdate
  ),
  counts_by_day as (
    -- SL8a/D9a: 伝票単位カウント(distinct check)・★0119 裁定100: 種別は名簿行(キャスト別)・attendance 不参加
    --   0118 backfill により既存伝票は旧 checks.nom_type 由来と同値
    select nm.cid, tc.bdate,
           count(distinct tc.check_id) filter (where nm.nom_kind = 'hon')::int   as hon_cnt,
           count(distinct tc.check_id) filter (where nm.nom_kind = 'jonai')::int as jonai_cnt,
           count(distinct tc.check_id) filter (where nm.is_dohan)::int           as dohan_cnt
    from noms nm
    join target_checks tc on tc.check_id = nm.check_id
    group by nm.cid, tc.bdate
  )
  select coalesce(s.cid, k.cid),
         coalesce(s.bdate, k.bdate),
         coalesce(s.sales_sum, 0),
         coalesce(k.hon_cnt, 0),
         coalesce(k.jonai_cnt, 0),
         coalesce(k.dohan_cnt, 0)
  from sales_by_day s
  full outer join counts_by_day k on k.cid = s.cid and k.bdate = s.bdate
  order by 2, 1;
end $function$;
revoke execute on function public.cast_sales_aggregate(uuid, date, date) from public, anon, authenticated, service_role;   -- 内部専用（live ACL {postgres=X/postgres} を踏襲）

-- ═══ check_set_ext_rule（新設・★1 385 追補） ═══
CREATE OR REPLACE FUNCTION public.check_set_ext_rule(p_check_id uuid, p_rule_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★1 0173（裁定385 追補）: 自動延長後の延長パターン切替＝checks.ext_min／ext_fee／ext_unit を ext_menu_snap の別パターンへ・
--   確定済み（time_auto）の延長ブロックは新単価で引き直す（qty＝人数／卓はそのまま・分数が違うパターンへの切替は単価だけ引き直し＝ブロック数は不変・仮決め）。
--   ゲート＝check_set_people と同型（owner／manager／staff can_register／cast can_register／kiosk 腕）。
declare
  v_chk record; v_org uuid; v_emin int; v_efee int; v_eunit text; v_before jsonb; v_n int;
begin
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_rule_id is null then raise exception 'bad rule'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select (m.value->>'duration_min')::int, (m.value->>'amount')::int, m.value->>'unit'
    into v_emin, v_efee, v_eunit
    from jsonb_array_elements(coalesce(v_chk.ext_menu_snap, '[]'::jsonb)) m
   where (m.value->>'rule_id')::uuid = p_rule_id;
  if v_emin is null or v_efee is null or v_emin < 1 or v_efee < 0 then raise exception 'bad rule'; end if;
  if v_eunit is not null and v_eunit not in ('person','table') then raise exception 'bad time settings'; end if;
  v_before := to_jsonb(v_chk);
  update public.checks
     set ext_min = v_emin, ext_fee = v_efee, ext_unit = coalesce(v_eunit, ext_unit)
   where id = p_check_id;
  update public.check_lines
     set unit_price_snapshot = v_efee, line_total = v_efee * qty, name_snapshot = '延長料金(' || v_emin || '分)'
   where check_id = p_check_id and time_auto and fee_kind = 'extension';
  get diagnostics v_n = row_count;
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_set_ext_rule', 'checks:' || p_check_id::text,
    v_before || jsonb_build_object('repriced_blocks', v_n),
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
end $function$;
revoke execute on function public.check_set_ext_rule(uuid, uuid) from public, anon;
grant execute on function public.check_set_ext_rule(uuid, uuid) to authenticated;

commit;
-- ===== verify（Success の後に 1 つずつ・値ではなく形を見る） =====
-- 1 貼り先証明
select 'nox-project-proof', count(*) from public.orgs;                                                                                         -- 9
-- 2 列（7 本）
select table_name, column_name, data_type, column_default from information_schema.columns where table_schema='public'
   and ((table_name='pricing_rules' and column_name='is_default_ext') or (table_name='checks' and column_name in ('set_frozen','opened_by_membership'))
        or (table_name='payments' and column_name='by_membership') or (table_name='daily_reports' and column_name in ('closed_by_membership','set_ext_nom','products','pay_fee_total')))
 order by 1, 2;                                                                                                                                 -- 8 行
-- 3 CHECK（pending／pay_fee）
select conname, pg_get_constraintdef(oid) from pg_constraint where conname in ('bottle_keeps_status_check','check_lines_fee_kind_check') order by 1;   -- 2 行・'pending'／'pay_fee' を含む
-- 4 index・policy
select indexname from pg_indexes where tablename='pricing_rules' and indexname='pricing_rules_default_ext_uidx';                              -- 1 行
select policyname, qual from pg_policies where tablename='daily_reports';                                                                      -- 1 行・auth_cast_can_register を含む
-- 5 引数（署名が変わった 6 本＋新設 1 本＝各 1 行・旧版なし）
select proname, pg_get_function_identity_arguments(oid) from pg_proc where pronamespace='public'::regnamespace
   and proname in ('set_pricing_rule','check_pay','bottle_keep_register','check_line_set_customer','check_group_due','customer_summary','check_set_ext_rule') order by 1;   -- 7 行
-- 6 md5（24 本）
select proname, left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where pronamespace='public'::regnamespace
   and proname in ('check_group_due','pricing_resolve_core','set_pricing_rule','check_open','check_time_charge_apply','check_set_people','set_store_profile','report_can_close','daily_report_reclose','cash_diff_approve','daily_report_close','kiosk_login','kiosk_operator_list','staff_pin_status','set_staff_pin','daily_report_aggregate','bottle_keep_register','check_line_set_customer','check_close','check_void','customer_summary','check_pay','cast_sales_aggregate','check_set_ext_rule') order by 1;
  -- check_group_due 5c667792
  -- pricing_resolve_core 4779acc3
  -- set_pricing_rule d41e22d9
  -- check_open 82dfd091
  -- check_time_charge_apply 8305089f
  -- check_set_people 1f6b9fd8
  -- set_store_profile 45012c75
  -- report_can_close 12b4ad7a
  -- daily_report_reclose a140f36c
  -- cash_diff_approve 12810b5f
  -- daily_report_close f599bd09
  -- kiosk_login 90ab95a4
  -- kiosk_operator_list e9c868bf
  -- staff_pin_status c70866bf
  -- set_staff_pin bda3b520
  -- daily_report_aggregate ca2dd22d
  -- bottle_keep_register 6cce7d77
  -- check_line_set_customer 644cd7ba
  -- check_close f94dc8c3
  -- check_void 4eb77409
  -- customer_summary c83aa2af
  -- check_pay c11691b8
  -- cast_sales_aggregate 34a0bf1e
  -- check_set_ext_rule 02b145a6
-- 7 proacl（公開 RPC は authenticated／service_role のみ・anon なし・内部専用は null）
select proname, proacl::text from pg_proc where pronamespace='public'::regnamespace
   and proname in ('check_group_due','pricing_resolve_core','set_pricing_rule','check_open','check_time_charge_apply','check_set_people','set_store_profile','report_can_close','daily_report_reclose','cash_diff_approve','daily_report_close','kiosk_login','kiosk_operator_list','staff_pin_status','set_staff_pin','daily_report_aggregate','bottle_keep_register','check_line_set_customer','check_close','check_void','customer_summary','check_pay','cast_sales_aggregate','check_set_ext_rule') order by 1;                                            -- 24 行
-- 8 既存データ不変
select status, count(*) from public.bottle_keeps group by 1;                                                                                   -- active だけ（既存行）
select count(*) from public.pricing_rules where is_default_ext;                                                                                -- 0
select count(*) from public.checks where set_frozen;                                                                                           -- 0
-- 9 名簿
select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions,
       (select count(*) from pg_tables where schemaname='public') tables,
       (select count(*) from pg_proc where pronamespace='public'::regnamespace and prosrc like '%billing locked%') gated;                       -- 312／87／160
-- ===== end 0173 =====
