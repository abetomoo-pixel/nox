-- 0132: 裁定113 商品販売バック3方式(product_rule / plan_rate / plan_fixed)
-- 内容: comp_plans 3列 + check_cast_backs 3列(nullable snap) + biz_date_of 新設 + check_close 分岐
-- 前提: mig0131 適用済み。冪等可。BEGIN/COMMIT 一括。
-- 注意(本番時): CHECK 追加は comp_plans / check_cast_backs の全行スキャン(0130 の check_lines より軽量)。
-- 裁定113 確定: ④記録先=check_cast_backs / plan_rate 母数=close 同腕按分凍結 /
--   plan_fixed=期間固定(payOf 側・close は 3列0 凍結のみ) / drink_claims 完全不干渉 /
--   pt(hon_pt_alloc)は3択の射程外=全 mode 共通 / 旧行 source_mode null=product_rule 扱い
begin;

-- ============================================================
-- §1 comp_plans: 3列追加(mig0086 の mode/rate pair 流儀を踏襲)
-- ============================================================
alter table public.comp_plans
  add column if not exists product_back_mode  text not null default 'product_rule',
  add column if not exists product_back_rate  int,
  add column if not exists product_back_fixed int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'comp_plans_product_back_mode_check') then
    alter table public.comp_plans add constraint comp_plans_product_back_mode_check
      check (product_back_mode = any (array['product_rule'::text, 'plan_rate'::text, 'plan_fixed'::text]));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comp_plans_product_back_rate_check') then
    alter table public.comp_plans add constraint comp_plans_product_back_rate_check
      check ((product_back_rate is null) or ((product_back_rate >= 0) and (product_back_rate <= 100)));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comp_plans_product_back_rate_pair_check') then
    alter table public.comp_plans add constraint comp_plans_product_back_rate_pair_check
      check ((product_back_mode = 'plan_rate'::text) = (product_back_rate is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comp_plans_product_back_fixed_check') then
    alter table public.comp_plans add constraint comp_plans_product_back_fixed_check
      check ((product_back_fixed is null) or (product_back_fixed >= 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comp_plans_product_back_fixed_pair_check') then
    alter table public.comp_plans add constraint comp_plans_product_back_fixed_pair_check
      check ((product_back_mode = 'plan_fixed'::text) = (product_back_fixed is not null));
  end if;
end $$;

-- ============================================================
-- §2 check_cast_backs: 3列追加(nullable+読み手フォールバック=snap 後方互換原則)
--    null=旧行=product_rule 扱い。「基本料金」型の誤表示経路を作らない。
-- ============================================================
alter table public.check_cast_backs
  add column if not exists source_mode            text,
  add column if not exists product_sales_base     int,
  add column if not exists calculated_back_amount int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'check_cast_backs_source_mode_check') then
    alter table public.check_cast_backs add constraint check_cast_backs_source_mode_check
      check ((source_mode is null) or (source_mode = any (array['product_rule'::text, 'plan_rate'::text, 'plan_fixed'::text])));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'check_cast_backs_product_sales_base_check') then
    alter table public.check_cast_backs add constraint check_cast_backs_product_sales_base_check
      check ((product_sales_base is null) or (product_sales_base >= 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'check_cast_backs_calculated_back_amount_check') then
    alter table public.check_cast_backs add constraint check_cast_backs_calculated_back_amount_check
      check ((calculated_back_amount is null) or (calculated_back_amount >= 0));
  end if;
end $$;

-- ============================================================
-- §3 biz_date_of 新設(営業日 date ヘルパー)
--    本体=biz_minutes_of の settings 読み・cutoff 検証・営業日式の逐語写し+date 返却のみ。
--    鏡像三点: biz_minutes_of / biz_date_of / TS bizDateOf(教訓52 型・台帳注記)。
--    ACL: grant なし(definer 内部呼び出し専用。クライアント経路が要る時に別途 grant)。
-- ============================================================
create or replace function public.biz_date_of(p_store_id uuid, p_at timestamp with time zone)
 returns date
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_settings jsonb;
  v_cutoff   text;
  v_cut_min  integer;
  v_local    timestamp;
begin
  select s.settings_json into v_settings
    from public.stores s where s.id = p_store_id;
  if not found then raise exception 'forbidden'; end if;

  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'bad store settings';
  end if;
  v_cut_min := split_part(v_cutoff, ':', 1)::int * 60 + split_part(v_cutoff, ':', 2)::int;

  v_local := p_at at time zone 'Asia/Tokyo';

  -- 営業日の暦日 = (現地時刻 - cutoff) の日付(biz_minutes_of と同式)
  return (v_local - make_interval(mins => v_cut_min))::date;
end $function$;

revoke execute on function public.biz_date_of(uuid, timestamp with time zone) from public, anon, authenticated;

-- ============================================================
-- §4 check_close: 3択分岐(執行点=③)。同 arity=OR REPLACE(DROP 不要)。
--    ベース=2026-09-04 live 逐語(docs/tmp/113prep_live.sql)。変更点は ★0132 コメント。
-- ============================================================
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
  v_salesbase int[];                    -- ★0132: plan_rate の按分売上母数(同腕凍結)
  v_mode text; v_rate int;              -- ★0132: 解決作業用
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
    -- ★0132 裁定113: 伝票営業日(started_at)時点の cast_plan から商品バック方式を cast 別に解決。
    --   解決不能(割当なし)=既定 product_rule。重複有効行は valid_from 降順の先頭(決定的・close は止めない)。
    v_bizdate := public.biz_date_of(v_chk.store_id, v_chk.started_at);
    v_modes := array_fill('product_rule'::text, array[v_n]);
    v_rates := array_fill(0, array[v_n]);
    for i in 1..v_n loop
      select p.product_back_mode, coalesce(p.product_back_rate, 0)
        into v_mode, v_rate
        from public.cast_plan cp
        join public.comp_plans p on p.id = cp.plan_id
       where cp.cast_id = v_cast_ids[i]
         and cp.org_id = v_chk.org_id
         and cp.valid_from <= v_bizdate
         and (cp.valid_to is null or cp.valid_to >= v_bizdate)
       order by cp.valid_from desc
       limit 1;
      if found then v_modes[i] := v_mode; v_rates[i] := v_rate; end if;
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
          elsif v_modes[i] = 'product_rule' then
            if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
              v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> public.nom_unit4_key(v_kinds[i], v_dohans[i]))::int, 0);
            end if;
            if v_line.kind = 'drink'  then v_drink[i]  := v_drink[i]  + v_unit * v_alloc[i]; end if;
            if v_line.kind = 'champ'  then v_champ[i]  := v_champ[i]  + v_unit * v_alloc[i]; end if;
            if v_line.kind = 'bottle' then v_bottle[i] := v_bottle[i] + v_unit * v_alloc[i]; end if;
          end if;
          -- ★0132: plan_fixed は商品系加算なし(期間固定は payOf 側)。
          -- pt は3択の射程外=全 mode 共通(裁定113)
          if v_kinds[i] = 'hon' then  -- ★0119: pt は本指名キャストの行のみ
            v_pt[i] := v_pt[i] + coalesce((v_line.back_snapshot ->> 'hon_pt')::int, 0) * v_alloc[i];
          end if;
        end if;
      end loop;
    end loop;
    -- ★0132: mode 別の凍結書込(ゼロ専用行は作らない)
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
        if v_pt[i] > 0 then
          insert into public.check_cast_backs
            (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc,
             source_mode, product_sales_base, calculated_back_amount)
          values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                  0, 0, 0, v_pt[i],
                  'plan_fixed', null, null);
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

  update public.checks
     set status = 'closed', closed_at = now(), close_idem_key = p_idem_key
   where id = p_check_id;
  -- ★mig0053(B1 相席・transient): 追加席の占有を解放(解放経路=ロック不要・money 非干渉)
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_close', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
  return p_check_id;
end $function$;

-- ACL 再明示(現状同値: authenticated のみ・anon なし)
revoke execute on function public.check_close(uuid, uuid) from public, anon;
grant execute on function public.check_close(uuid, uuid) to authenticated, service_role;

commit;
