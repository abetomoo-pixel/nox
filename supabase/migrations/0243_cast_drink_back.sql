-- 0243_cast_drink_back_e（裁定511-21a・511-21b・#153／#164・R23）＝決め e の版（11/27・相談役 11:15・推し・別名＝0243_cast_drink_back.sql とどちらか 1 本だけを当てる）
--   決め e：ドリンクバック OFF の店で本人のドリンク申告も ON のとき、同じ 1 杯にバックが 2 回付かないようにする＝按分を残し、キャストドリンクの本人の申告を断る（'drink back off'）。
--     止める所＝drink_claim_submit（申告の時）・drink_claim_decide（承認の時の backstop・却下はいつでも）。普通のドリンクの申告と ON の店は今のまま。
--   決め（Agoora 2026-11-26 22:20）：21a＝ドリンクバックが OFF の店のキャストドリンクは普通のドリンクと同じ扱い。21b＝同じ杯に申告と「キャストに付ける」が重なるときは、後から付けたほうを断る。
--   今の本番：
--     21a＝check_close はキャストドリンクの行（back_snapshot.back_exempt）を按分から外す。ドリンクバック OFF の店（settings_json.sys_drink_count_back＝false）は画面に「誰のドリンクか」を出さない＝その行のバックはどのキャストにも付かなかった。
--     21b＝本人の申告（drink_claim_submit・行に結び付かない）と「キャストに付ける」（drink_claim_submit_proxy・行に結び付く承認済み）は互いを見ない＝同じ杯に 2 回バックが付きえた。
--   中身：
--     ★1 check_close の作り直し（21a）：OFF の店はキャストドリンクの行も分配率で按分する（「キャストに付ける」で付いた行は除く）。OFF の判定は画面の drinkCountBackOn と同じ（JSON の false だけ・鍵なし＝ON）。
--        これから締める伝票だけ（締めた伝票の check_cast_backs は凍結値＝変えない）。
--     ★2 drink_claim_submit（21b）：同じ伝票・同じキャスト・同じ商品に「キャストに付ける」が先にあれば 'already attributed' で断る。
--     ★3 drink_claim_submit_proxy（21b）：同じ伝票・同じキャスト・同じ商品に申告（承認待ちか承認済み）が先にあれば 'already declared' で断る。
--     ★4 drink_claim_decide（21b）：申告を承認する前に、同じ組の「キャストに付ける」（承認済み）があれば 'already attributed' で断る（backstop・却下はいつでも）。
--        ★2・★3 は伝票ごとの advisory lock（hashtext('nox.drink_claim:' || 伝票 id)）で一列にする。2 杯目からは同じ道で付ける（申告なら承認のときの杯数・付けるなら行ごと）。
--   重なり：check_close を作り直す起草はほかに無い（docs/tmp/*_1126 を見た）。0241 は check_close に触れない。
--   変えないもの：表・列・索引・ほかの関数（数を変えない＝当てる位置の関数 528・表 133 のまま・0231・0246・0228・0229 の後）。
--   翻訳元：本番の check_close（md5(prosrc) 76d78028890e62a454c6166c22371df9）・drink_claim_submit（df08190fa7e05c4678248ec75d9394d8）・drink_claim_submit_proxy（3bbaf3bfdf8a590fd195e749cbce8fd7）・drink_claim_decide（4573ced4a5e7f476f671c03faef7a562）。
--   差分：docs/tmp/drink_back_1126/diff_live.md。事前確認：docs/tmp/drink_back_1126/e/0243_precheck.sql（親の 0243_precheck.sql の数だけを当てる位置の 528 に直した物）（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/drink_back_1126/e/0243_verify.sql。
begin;
set local lock_timeout = '10s';

-- ═══ ★1 check_close（作り直し・同じ署名・CREATE OR REPLACE） ═══
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
  v_dcb_off boolean := false;                                                           -- ★0243（裁定511-21a）: ドリンクバック（本数で払う）が OFF の店
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_close');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if public.auth_role() = 'cast' and public.auth_cast_register_level() < 2 then raise exception 'forbidden'; end if;   -- ★0200（裁定473）: 「注文のみ」の cast は締め不可（check_pay と同型）
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0200（裁定473）: 会計できる卓（all／own）
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
    -- ★0243（裁定511-21a）: 店の「ドリンクバック（本数で払う）」＝settings_json.sys_drink_count_back が JSON の false のときだけ OFF（画面の drinkCountBackOn と同じ判定・鍵なし＝ON）
    select coalesce(jsonb_typeof(s.settings_json->'sys_drink_count_back') = 'boolean' and (s.settings_json->>'sys_drink_count_back') = 'false', false)
      into v_dcb_off from public.stores s where s.id = v_chk.store_id;
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
         -- ★0243（裁定511-21a）: ドリンクバック OFF の店は、キャストドリンクも普通のドリンクと同じく按分する（OFF の店は「誰のドリンクか」を出さない＝前はどのキャストにも付かなかった）。
         --   「キャストに付ける」で付いた行（行に結び付いた承認済みの drink_claims）は除く＝同じ杯に 2 回付けない
         and (coalesce((check_lines.back_snapshot ->> 'back_exempt')::boolean, false) = false
              or (v_dcb_off and not exists (select 1 from public.drink_claims d
                                             where d.check_line_id = check_lines.id and d.status = 'approved')))
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

-- ═══ ★2 drink_claim_submit（作り直し・同じ署名・CREATE OR REPLACE） ═══
CREATE OR REPLACE FUNCTION public.drink_claim_submit(p_check_id uuid, p_product_id uuid, p_qty integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast uuid; v_crow record; v_chk record; v_prod record; v_actor uuid; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'no cast for caller'; end if;   -- cast セルフ専用
  if p_qty is null or p_qty <= 0 then raise exception 'bad qty'; end if;
  select org_id, store_id into v_crow from public.casts where id = v_cast;
  -- 対象 check（自店・open・cast は指名有無問わず申告可）
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() or v_chk.store_id <> v_crow.store_id then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- 対象 product（自 org・自店・drink/champ）
  select * into v_prod from public.products where id = p_product_id;
  if v_prod.id is null or v_prod.org_id <> public.auth_org_id() or v_prod.store_id <> v_crow.store_id
     or v_prod.type not in ('drink','champ') then
    raise exception 'bad product';
  end if;
  -- ★0243 決め e（11/27・相談役の推し）: ドリンクバック OFF の店（settings_json.sys_drink_count_back が JSON の false）のキャストドリンク（products.back_exempt_from_split）は、
  --   締めで指名の分配率どおりに按分する（0243 ★1＝裁定511-21a）＝本人の申告は断る（同じ杯にバックを 2 回付けない・按分のほうを残す）。普通のドリンクと ON の店は今のまま
  if coalesce(v_prod.back_exempt_from_split, false) and exists (select 1 from public.stores s where s.id = v_crow.store_id
                   and jsonb_typeof(s.settings_json->'sys_drink_count_back') = 'boolean' and (s.settings_json->>'sys_drink_count_back') = 'false') then
    raise exception 'drink back off';
  end if;
  -- ★0243（裁定511-21b）: 同じ伝票・同じキャスト・同じ商品に「キャストに付ける」（行に結び付いた承認済み）が先にあれば、後からの申告を断る（同じ杯にバックを 2 回付けない）。
  --   同じ伝票の申告と「キャストに付ける」は伝票ごとの advisory lock で一列にする（drink_claim_submit_proxy と同じ鍵）
  perform pg_advisory_xact_lock(hashtext('nox.drink_claim:' || p_check_id::text));
  if exists (select 1 from public.drink_claims d
              where d.check_id = p_check_id and d.cast_id = v_cast and d.product_id = p_product_id
                and d.check_line_id is not null and d.status = 'approved') then
    raise exception 'already attributed';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.drink_claims (org_id, store_id, check_id, cast_id, product_id, qty, back_amount, status, requested_by)
  values (v_crow.org_id, v_crow.store_id, p_check_id, v_cast, p_product_id, p_qty, 0, 'pending', v_actor)
  returning id into v_id;
  perform public.audit_log_write('drink_claim_submit', 'drink_claims:' || v_id::text, null,
    (select to_jsonb(d) from public.drink_claims d where d.id = v_id), v_crow.store_id);
  return v_id;
end $function$;
revoke execute on function public.drink_claim_submit(uuid, uuid, integer) from public, anon;
grant execute on function public.drink_claim_submit(uuid, uuid, integer) to authenticated;

-- ═══ ★3 drink_claim_submit_proxy（作り直し・同じ署名・CREATE OR REPLACE） ═══
CREATE OR REPLACE FUNCTION public.drink_claim_submit_proxy(p_line_id uuid, p_cast_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line record; v_chk record; v_cast record;
  v_actor uuid; v_unit int; v_back int; v_id uuid; v_key text;  -- ★0119
begin
  -- 冒頭 null ガード。kiosk 腕を意図的に持たない＝0059 非開示原則
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;

  select * into v_line from public.check_lines where id = p_line_id;
  if v_line.id is null or v_line.org_id <> public.auth_org_id() then
    raise exception 'forbidden';  -- 存在オラクル封じ
  end if;

  select * into v_chk from public.checks where id = v_line.check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;

  -- 黒服 can_register 以上（cast 腕なし＝代理起票は店側の行為）
  if (public.auth_role() = 'owner'
      or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
      or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
          and public.auth_staff_can_register())) is not true then
    raise exception 'forbidden';
  end if;

  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  if v_line.product_id is null or v_line.back_snapshot is null
     or v_line.kind not in ('drink','champ','bottle') then
    raise exception 'bad line';
  end if;

  -- ★mig0070: 経路排他の判定を凍結値へ（products の現価は読まない）
  if coalesce((v_line.back_snapshot ->> 'back_exempt')::boolean, false) is not true then
    raise exception 'not exempt product';
  end if;

  if exists (select 1 from public.drink_claims d
              where d.check_line_id = v_line.id and d.status = 'approved') then
    raise exception 'already claimed';
  end if;

  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id()
     or v_cast.store_id <> v_chk.store_id or not v_cast.is_active then
    raise exception 'bad cast';
  end if;

  -- ★0243（裁定511-21b）: 同じ伝票・同じキャスト・同じ商品の申告（行に結び付かない・承認待ちか承認済み）が先にあれば、後からの「キャストに付ける」を断る（同じ杯にバックを 2 回付けない）。
  --   2 杯目からも同じ道で付ける（申告なら承認のときの杯数を直す・「キャストに付ける」なら行ごとに付ける）。伝票ごとの advisory lock（drink_claim_submit と同じ鍵）
  perform pg_advisory_xact_lock(hashtext('nox.drink_claim:' || v_chk.id::text));
  if exists (select 1 from public.drink_claims d
              where d.check_id = v_chk.id and d.cast_id = p_cast_id and d.product_id = v_line.product_id
                and d.check_line_id is null and d.status in ('pending','approved')) then
    raise exception 'already declared';
  end if;

  -- ★焼付け＝伝票凍結値（check_close と同一の真実。マスタ現価では読まない）
  -- ★0119 裁定100: 代理起票キャスト自身の名簿行のキー（名簿に無ければ伝票の派生サマリ）
  select public.nom_unit4_key(n.nom_kind, n.is_dohan) into v_key
    from public.check_nominations n where n.check_id = v_chk.id and n.cast_id = p_cast_id;
  v_key := coalesce(v_key, v_chk.nom_type);
  if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
    v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> v_key)::int, 0);
  else
    v_unit := round(v_line.unit_price_snapshot
                    * coalesce((v_line.back_snapshot ->> 'back_value')::numeric, 0) / 100.0)::int;
  end if;
  v_back := v_unit * v_line.qty;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  insert into public.drink_claims
    (org_id, store_id, check_id, check_line_id, cast_id, product_id, qty, back_amount,
     status, requested_by, decided_by, decided_at)
  values
    (v_chk.org_id, v_chk.store_id, v_chk.id, v_line.id, p_cast_id, v_line.product_id,
     v_line.qty, v_back, 'approved', v_actor, v_actor, now())
  returning id into v_id;

  perform public.audit_log_write('drink_claim_submit_proxy', 'drink_claims:' || v_id::text, null,
    (select to_jsonb(d) from public.drink_claims d where d.id = v_id), v_chk.store_id);
  return v_id;
end $function$;
revoke execute on function public.drink_claim_submit_proxy(uuid, uuid) from public, anon;
grant execute on function public.drink_claim_submit_proxy(uuid, uuid) to authenticated;

-- ═══ ★4 drink_claim_decide（作り直し・同じ署名・CREATE OR REPLACE） ═══
CREATE OR REPLACE FUNCTION public.drink_claim_decide(p_claim_id uuid, p_approve boolean, p_qty_override integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cl record; v_actor uuid; v_before jsonb; v_qty int; v_nom text; v_prod record; v_unit int; v_back int;
  v_chk_status text;  -- 【F3f】
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_approve is null then raise exception 'bad approve'; end if;
  select * into v_cl from public.drink_claims where id = p_claim_id;
  if v_cl.id is null or v_cl.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if; -- 存在オラクル封じ
  -- 承認は黒服 can_register 以上・自店（代理型＝auth_cast_id チェックなし）
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cl.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_cl.store_id = public.auth_store_id()
              and public.auth_staff_can_register())) then
    raise exception 'forbidden';
  end if;
  if v_cl.status <> 'pending' then raise exception 'already decided'; end if;
  -- 【F3f】void 伝票への事後承認/却下を封じる（open/closed は従来どおり＝close 非依存思想は不変。
  --        check_void が pending を自動 reject するため本ガードは主にレース/残置行の backstop）
  select status into v_chk_status from public.checks where id = v_cl.check_id;
  if v_chk_status = 'void' then raise exception 'check voided'; end if;
  v_before := to_jsonb(v_cl);
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if p_approve then
    -- ★0243（裁定511-21b）: 申告（行に結び付かない）を承認する前に、同じ伝票・同じキャスト・同じ商品の「キャストに付ける」（承認済み）があれば断る＝同じ杯に 2 回付けない。
    --   0243 の後は申告と「付ける」が同時に生きることは無い（後からのほうを申告・付けるの時に断る）＝ここは backstop（0243 の前にできた行）。時刻では比べない（同じトランザクションの行は同じ時刻）。却下はいつでもできる
    if v_cl.check_line_id is null and exists (select 1 from public.drink_claims d
              where d.check_id = v_cl.check_id and d.cast_id = v_cl.cast_id and d.product_id = v_cl.product_id
                and d.check_line_id is not null and d.status = 'approved') then
      raise exception 'already attributed';
    end if;
    -- 杯数修正（承認時訂正・null は申告 qty のまま）
    if p_qty_override is not null then
      if p_qty_override <= 0 then raise exception 'bad qty'; end if;
      v_qty := p_qty_override;
    else
      v_qty := v_cl.qty;
    end if;
    -- ★バック額焼付け（check_close の unit 計算と同一規則・products を承認時点で直読み）
    -- ★0119 裁定100: 申請キャスト自身の名簿行のキー（名簿に無ければ伝票の派生サマリ）
    select public.nom_unit4_key(n.nom_kind, n.is_dohan) into v_nom
      from public.check_nominations n where n.check_id = v_cl.check_id and n.cast_id = v_cl.cast_id;
    if v_nom is null then select nom_type into v_nom from public.checks where id = v_cl.check_id; end if;
    select * into v_prod from public.products where id = v_cl.product_id;
    -- ★0243 決め e（11/27）: backstop＝承認の時に店がドリンクバック OFF でキャストドリンクなら断る（OFF にする前の申告・決め e の前の申告）＝按分と 2 回付けない。却下はいつでもできる
    if coalesce(v_prod.back_exempt_from_split, false) and exists (select 1 from public.stores s where s.id = v_cl.store_id
                   and jsonb_typeof(s.settings_json->'sys_drink_count_back') = 'boolean' and (s.settings_json->>'sys_drink_count_back') = 'false') then
      raise exception 'drink back off';
    end if;
    if v_prod.back_mode = 'unit4' then
      v_unit := coalesce((v_prod.unit4_json ->> v_nom)::int, 0);                             -- unit4[キャスト別キー]（check_close 同一）
    else
      v_unit := round(v_prod.price * coalesce(v_prod.back_value, 0)::numeric / 100.0)::int;  -- rate（check_close 同一）
    end if;
    v_back := v_unit * v_qty;
    update public.drink_claims
       set status = 'approved', qty = v_qty, back_amount = v_back, decided_by = v_actor, decided_at = now()
     where id = p_claim_id;
    perform public.audit_log_write('drink_claim_approve', 'drink_claims:' || p_claim_id::text, v_before,
      (select to_jsonb(d) from public.drink_claims d where d.id = p_claim_id), v_cl.store_id);
  else
    update public.drink_claims
       set status = 'rejected', decided_by = v_actor, decided_at = now()
     where id = p_claim_id;
    perform public.audit_log_write('drink_claim_reject', 'drink_claims:' || p_claim_id::text, v_before,
      (select to_jsonb(d) from public.drink_claims d where d.id = p_claim_id), v_cl.store_id);
  end if;
end $function$;
revoke execute on function public.drink_claim_decide(uuid, boolean, integer) from public, anon;
grant execute on function public.drink_claim_decide(uuid, boolean, integer) to authenticated;

commit;
