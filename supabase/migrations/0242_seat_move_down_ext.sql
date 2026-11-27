-- 0242_seat_move_down_ext（裁定511-19・514-4・#157・R20・起草と手元の試走まで・適用はしない）＝11/27 作り直し（相談役 11:15 の指示）
--   決め（Agoora 2026-11-26 22:20・511-19）：VIP から下の席へ移した後の延長は下の席の単価に戻す。514-4：進行中のブロックも移した先の額（上へ移すときと鏡）。
--   今の本番：check_move_seat は VIP へ上がるときだけ延長パターン（ext_menu_snap・ext_rule_id・ext_fee・ext_min）を VIP 用に再凍結し、最後の延長行を VIP 額にする。下へ移るときは何もしない＝
--     下の席へ移った後の延長（自動の延長・手で足す延長・延長パターン ▾）も VIP の単価のままだった。
--   中身：作り直し 2 本（同じ署名・ACL は今と同じ文で言い直す）。
--     ★1 check_move_seat：VIP から VIP でない席へ（入金の無い卓だけ＝⑤ のまま）、移動先の席種の延長パターンを今の時刻で再凍結（ext_menu_build＝check_open と同じ部品）し、
--        ext_rule_id・ext_fee・ext_unit を移動先の行に。パターンが無ければ店の基本の延長（stores.ext_fee・ext_rule_id 空・メニュー []）。
--        514-4：移した時に進行中の延長の行も移動先の額に直す（自動延長＝今のブロックの行だけ・手動＝最後の延長行を買った時間の中だけ・額 0 なら行を消す）。終わった行は変えない＝④ 返金しない。
--        延長の長さ（ext_min）は自動延長の店で延長に入った後は変えない（ブロックの区切りを動かすと終わったブロックの行が消える・引き直される）。額は移動先の同じ長さの行・無ければ移動先の今の行の額。
--        監査 check_move_seat_pricing の after に ext_min と ext_unit・直した延長の行は check_move_seat_ext_line。
--     ★2 check_time_charge_apply（0218 の後の本番の上に積む）：単価 0（ext_fee = 0）の伝票は、前は延長の行を全部消した＝店の基本の延長額 0 の店へ下ろすと出た VIP の延長行まで消えた。
--        → 終わったブロックの行は凍結のまま残す・進行中のブロックの行だけ消す・新しい行は作らない。ext_fee > 0 の伝票は前と 1 字も変わらない。
--   変えないもの：表・列・索引・ほかの関数（関数 525・表 133 のまま）。
--   翻訳元：本番の check_move_seat（md5(prosrc) 3b16c4b7995db98e807e9741b242c796）・check_time_charge_apply（0218 の後・0ccce4414f4c49e0d965a59ecacc27ee）。差分：docs/tmp/seat_down_1126/diff_live.md。
--   事前確認：docs/tmp/seat_down_1126/0242_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/seat_down_1126/0242_verify.sql。
begin;
set local lock_timeout = '10s';

-- ═══ ★1 check_move_seat（作り直し・同じ署名・CREATE OR REPLACE） ═══
CREATE OR REPLACE FUNCTION public.check_move_seat(p_check_id uuid, p_to_seat_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_seat record; v_before jsonb;
  v_org uuid;  -- ★0057(2)
  -- ★0182（裁定427）: 席種が変わる移動の料金
  v_from record; v_st record; v_paid int; v_ext_n int; r_set record; r_vip record; v_sline record; v_delta int := 0;
  v_rate_old int; v_rate_new int; v_pre jsonb; v_g record; v_bx int; v_disc int; v_base int; v_moved boolean := false;
  v_ext_menu jsonb; v_dow2 int; v_bm2 int; v_settings2 jsonb; v_cutoff2 text; v_cut2 int; v_rule_name text; v_vname text; v_vid uuid; v_vunits int;
  v_from_kind text; v_to_kind text; v_snap_before jsonb; v_eline record; v_vip_ext int;
  v_pick jsonb;  -- ★0187（便 EXT）: 再凍結したメニューから今の時刻の行
  v_d2 int; v_blk int; v_keep_len boolean; v_new_rule uuid; v_new_fee int; v_new_min int; v_new_unit text; v_kfee int; v_keu int;  -- ★0242（裁定511-19・514-4）: 下へ移すとき
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_move_seat');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_to_seat_id is null then raise exception 'bad seat'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（B1/B2 を kiosk に出す＝確定⑦）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- ★裁定(c): 移動先 seats 行ロック（占有取得の直列化・一次防御）
  select s.id, s.org_id, s.store_id, s.is_active, s.kind into v_seat  -- ★0182: +kind
    from public.seats s where s.id = p_to_seat_id
    for update;
  if v_seat.id is null or v_seat.org_id <> v_org then raise exception 'forbidden'; end if;
  if v_seat.store_id <> v_chk.store_id then raise exception 'bad seat'; end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;
  if p_to_seat_id = v_chk.seat_id then raise exception 'same seat'; end if;
  -- 占有チェック（ロック下＝コミット済み状態が確定）: 主席 open ∪ 追加席（自伝票の追加席も含めて拒否＝
  -- 主席との入替は「解除→移動」の2手・org 非限定＝物理占有はより厳しく見る）
  if exists (select 1 from public.checks where seat_id = p_to_seat_id and status = 'open') then
    raise exception 'seat occupied';
  end if;
  if exists (select 1 from public.check_seats where seat_id = p_to_seat_id) then
    raise exception 'seat occupied';
  end if;
  select s.kind into v_from from public.seats s where s.id = v_chk.seat_id;  -- ★0182: 移動元の席種
  v_before := to_jsonb(v_chk);
  begin
    update public.checks set seat_id = p_to_seat_id where id = p_check_id;
  exception when unique_violation then
    -- backstop（checks_one_open_per_seat）＝ロック迂回経路が万一あっても二重主席は構造不能
    raise exception 'seat occupied';
  end;
  perform public.audit_log_write('check_move_seat', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);

  -- ═══ ★0182（裁定427・C2-23）: 席種が変わるときの料金 ═══
  --   ⑤ 入金済みの卓は不変（裁定424 と同じ）／同種間＝不変／④ 下位へ＝VIP 料金の行は残す（返金しない）＝サ率だけ移動時点から新しい率。
  --   ③ サ率＝stores.service_rate_by_seat（0175 ★11・seats.kind がキー・小文字も可・無ければ店の率）を移動時点から。移動前に確定した行は旧率のまま
  --      ＝pay_group ごとに「移動時点の母数（割引後・手数料行を除く）」と「その母数×旧率」を checks.service_pre に凍結し、check_group_due が凍結額＋増分×新率で計算する。
  --   ① 上位へ（セット中＝延長行なし）＝通常セット行を VIP セット料金（pricing_resolve_core 'set'・seat_kind VIP・入店時刻で解決）の行に差し替える（置換・qty 据え置き）。
  --   ② 上位へ（延長中）＝入店時のセット行は変えない。移動した延長行（最後の延長行）から VIP 料金＝VIP 用の延長パターン（seat_kind VIP）があればそれ・無ければ 通常延長額＋（VIP セット−通常セット）（Agoora 確定 10/26 ①）。延長パターンも移動時点で再凍結＝以後の延長（check_extension_add）も VIP 額。
  --      VIP チャージ（vip_charge・入店 1 回）がまだ無ければ check_open と同じ形で 1 行（額>0 のみ）。
  v_from_kind := coalesce(v_from.kind, '卓'); v_to_kind := coalesce(v_seat.kind, '卓');
  select count(*) into v_paid from public.payments where check_id = p_check_id;
  if v_from_kind is distinct from v_to_kind and v_paid = 0 then
    select * into v_st from public.stores where id = v_chk.store_id;
    v_rate_old := v_chk.service_rate;
    v_rate_new := coalesce(nullif(trim(v_st.service_rate_by_seat->>v_to_kind), '')::int,
                           nullif(trim(v_st.service_rate_by_seat->>lower(v_to_kind)), '')::int,
                           v_st.service_rate);
    if v_rate_new < 0 or v_rate_new > 100 then v_rate_new := v_st.service_rate; end if;
    -- ③ 旧率の凍結（pay_group ごと・2 回目以降の移動は前回の凍結分に増分だけ足す）
    if v_rate_new is distinct from v_rate_old then
      v_pre := coalesce(v_chk.service_pre, '{}'::jsonb);
      for v_g in select distinct pay_group from public.check_lines where check_id = p_check_id loop
        select coalesce(sum(line_total) filter (where kind <> 'discount' and fee_kind is distinct from 'pay_fee' and not all_in), 0)::int,   -- ★0210: 込みの行はサ料の母数に入れない（check_group_due と同じ）
               coalesce(sum(line_total) filter (where kind = 'discount' and fee_kind is distinct from 'pay_discount_total'), 0)::int   -- ★0187（便 CASH）: 「合計から」の割引はサ料の母数に入れない
          into v_bx, v_disc
          from public.check_lines where check_id = p_check_id and pay_group = v_g.pay_group;
        if v_g.pay_group = 'A' then
          v_bx := v_bx + coalesce((select sum(r.amount) from public.check_referrals r where r.check_id = p_check_id and r.burden = 'customer'), 0)::int;
        end if;
        v_base := greatest(0, v_bx - v_disc);
        v_pre := v_pre || jsonb_build_object(v_g.pay_group, jsonb_build_object(
          'amount', coalesce((v_pre->v_g.pay_group->>'amount')::int, 0)
                    + round(greatest(0, v_base - coalesce((v_pre->v_g.pay_group->>'base')::int, 0)) * v_rate_old / 100.0)::int,
          'base', v_base));
      end loop;
      update public.checks set service_rate = v_rate_new, service_pre = v_pre where id = p_check_id;
      v_moved := true;
    end if;
    -- ①② 上位へ（VIP）
    if v_to_kind = 'VIP' then
      select * into r_set from public.pricing_resolve_core(v_chk.store_id, v_chk.started_at, 'set', 'VIP', null, v_chk.category_id);
      select count(*) into v_ext_n from public.check_lines where check_id = p_check_id and fee_kind = 'extension';
      if r_set.rule_id is not null and r_set.amount is not null then
        v_delta := case when coalesce(v_chk.first_visit, false) then 0 else greatest(0, r_set.amount - coalesce(v_chk.set_fee, 0)) end;   -- ★0210（相談役 11/25）: 初回の卓は差額を延長に足さない
        if v_ext_n = 0 and not coalesce(v_chk.first_visit, false) then   -- ★0210: 初回の卓はセットを VIP のセットに差し替えない（初回の約束の額を守る）
          select * into v_sline from public.check_lines
           where check_id = p_check_id and time_auto and fee_kind = 'set' and block_no = 0 limit 1;
          if v_sline.id is not null then
            select r.name into v_rule_name from public.pricing_rules r where r.id = r_set.rule_id;
            v_snap_before := to_jsonb(v_sline);
            update public.check_lines
               set unit_price_snapshot = r_set.amount, line_total = r_set.amount * qty,
                   name_snapshot = 'セット料金(' || coalesce(r_set.duration_min, v_chk.set_min) || '分)'
             where id = v_sline.id;
            update public.checks set set_fee = r_set.amount, set_rule_id = r_set.rule_id, set_rule_name = v_rule_name where id = p_check_id;
            perform public.audit_log_write('check_move_seat_set_line', 'check_lines:' || v_sline.id::text, v_snap_before,
              (select to_jsonb(l) from public.check_lines l where l.id = v_sline.id), v_chk.store_id);
            v_moved := true;
          end if;
        end if;
      end if;
      -- ② 延長パターンの再凍結（check_open の ext_menu_snap と鏡像・seat_kind VIP・区分＝伝票の凍結値・時刻＝今）
      select b.biz_dow, b.biz_min into v_dow2, v_bm2 from public.biz_minutes_of(v_chk.store_id, now()) b;
      v_settings2 := coalesce(v_st.settings_json, '{}'::jsonb);
      v_cutoff2 := coalesce(nullif(trim(v_settings2->>'biz_cutoff_hm'), ''), '06:00');
      v_cut2 := split_part(v_cutoff2, ':', 1)::int * 60 + split_part(v_cutoff2, ':', 2)::int;
      -- ★0187（便 EXT）: VIP 用の延長パターンを時間帯を問わず全行（band つき）＝check_open と同じ部品（ext_menu_build・p_vip_only）
      v_ext_menu := public.ext_menu_build(v_chk.store_id, 'VIP', v_chk.category_id, now(), v_chk.ext_min, v_chk.time_per, true);
      v_pick := coalesce(public.ext_menu_pick(v_ext_menu, v_bm2, null, null), v_ext_menu->0);   -- ★0187: 既定＝今の時刻の時間帯に合う行（無ければ先頭＝従来）
      if jsonb_array_length(v_ext_menu) > 0 then
        update public.checks
           set ext_menu_snap = v_ext_menu,
               ext_rule_id = (v_pick->>'rule_id')::uuid,   -- ★0187: 今の時刻の行（従来＝先頭）
               ext_fee = (v_pick->>'amount')::int,
               ext_min = coalesce((v_pick->>'duration_min')::int, ext_min)
         where id = p_check_id;
        v_moved := true;
        v_vip_ext := (v_pick->>'amount')::int;   -- ★0187
      elsif v_delta > 0 then
        v_vip_ext := coalesce(v_chk.ext_fee, 0) + v_delta;
        update public.checks
           set ext_fee = ext_fee + v_delta,
               ext_menu_snap = (select coalesce(jsonb_agg(m.value || jsonb_build_object(
                                  'amount', (m.value->>'amount')::int + v_delta,
                                  'label', '延長 ' || (m.value->>'duration_min') || '分 ¥' || ((m.value->>'amount')::int + v_delta))), '[]'::jsonb)
                                 from jsonb_array_elements(coalesce(ext_menu_snap, '[]'::jsonb)) m)
         where id = p_check_id;
        v_moved := true;
      end if;
      -- ★Agoora 確定 10/26 ①: 延長中の移動＝移動した時点の延長行（最後の延長行）を VIP 額に置き換える（セット行は不変・それより前の延長行も不変）
      if v_ext_n > 0 and v_vip_ext is not null then
        select * into v_eline from public.check_lines
         where check_id = p_check_id and fee_kind = 'extension' order by sort_order desc, created_at desc limit 1;
        if v_eline.id is not null and v_eline.unit_price_snapshot < v_vip_ext then
          v_snap_before := to_jsonb(v_eline);
          update public.check_lines set unit_price_snapshot = v_vip_ext, line_total = v_vip_ext * qty, name_snapshot = name_snapshot || '（VIP）' where id = v_eline.id;
          perform public.audit_log_write('check_move_seat_ext_line', 'check_lines:' || v_eline.id::text, v_snap_before,
            (select to_jsonb(l) from public.check_lines l where l.id = v_eline.id), v_chk.store_id);
          v_moved := true;
        end if;
      end if;
      -- VIP チャージ（入店 1 回の行）＝無ければ 1 行（check_open と同じ形）
      select * into r_vip from public.pricing_resolve_core(v_chk.store_id, now(), 'vip_charge', 'VIP', null, v_chk.category_id);
      if r_vip.rule_id is not null and r_vip.amount is not null
         and not exists (select 1 from public.check_lines where check_id = p_check_id and fee_kind = 'vip_charge') then
        v_vunits := case when coalesce(r_vip.billing_unit, v_chk.time_per) = 'person' then coalesce(v_chk.people, 1) else 1 end;
        if r_vip.amount * v_vunits > 0 then
          select r.name into v_vname from public.pricing_rules r where r.id = r_vip.rule_id;
          insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                          name_snapshot, unit_price_snapshot, qty, line_total,
                                          back_snapshot, sort_order, time_auto, fee_kind, block_no)
          values (v_org, v_chk.store_id, p_check_id, null, 'charge', 'A',
                  coalesce(v_vname, 'VIPチャージ'), r_vip.amount, v_vunits, r_vip.amount * v_vunits,
                  null, 2, true, 'vip_charge', 0)
          returning id into v_vid;
          update public.checks set vip_charge_fee = r_vip.amount, vip_charge_unit = coalesce(r_vip.billing_unit, v_chk.time_per) where id = p_check_id;
          perform public.audit_log_write('check_move_seat_vip_line', 'check_lines:' || v_vid::text, null,
            (select to_jsonb(l) from public.check_lines l where l.id = v_vid), v_chk.store_id);
          v_moved := true;
        end if;
      end if;
    end if;
    -- ★0242（裁定511-19・514-4）: VIP から下の席へ（入金の無い卓だけ＝⑤）＝この先の延長と、移した時に進行中の延長の行を、移動先の席種の額にする（上へ移すときの ② の鏡）。
    --   移す前に終わった行（VIP のセット・終わった VIP の延長行・VIP チャージ）は変えない＝④ 返金しない。サ率は上の ③ のとおり移動時点から移動先の率。
    --   移動先の席種の延長パターンを今の時刻で再凍結（check_open と同じ部品 ext_menu_build）。パターンが無ければ店の基本の延長（stores.ext_fee・ext_rule_id は空・メニュー []）。
    --   延長の長さ（ext_min）：自動延長の店で延長に入った後（延長の行がある・セットの時間を過ぎた）は変えない＝ブロックの区切りを動かさない
    --     （区切りが変わると check_time_charge_apply がブロックを数え直し、終わったブロックの行を消す・引き直す）。額は移動先の同じ長さの行・無ければ移動先の今の行の額（1 ブロックの額）。
    --     セットの時間の中（延長の行が無い）と手動の店は移動先の長さにする（前の版と同じ）。延長の単位（ext_unit）は移動先の行に合わせる。
    if v_from_kind = 'VIP' and v_to_kind <> 'VIP' then
      select b.biz_min into v_bm2 from public.biz_minutes_of(v_chk.store_id, now()) b;
      v_d2 := greatest(0, floor(extract(epoch from (now() - v_chk.started_at)) / 60)::int);   -- 経過（完了分）＝check_time_charge_apply と同じ数え方
      select count(*) into v_ext_n from public.check_lines where check_id = p_check_id and fee_kind = 'extension';
      v_keep_len := coalesce(v_st.time_mode, '') = 'auto' and (v_ext_n > 0 or v_d2 >= v_chk.set_min);
      v_ext_menu := public.ext_menu_build(v_chk.store_id, v_to_kind, v_chk.category_id, now(), v_st.ext_min, v_chk.time_per, false);
      if jsonb_array_length(v_ext_menu) > 0 then
        v_pick := coalesce(case when v_keep_len then public.ext_menu_pick(v_ext_menu, v_bm2, null, v_chk.ext_min) end,
                           public.ext_menu_pick(v_ext_menu, v_bm2, null, null), v_ext_menu->0);
        v_new_rule := (v_pick->>'rule_id')::uuid;
        v_new_fee  := (v_pick->>'amount')::int;
        v_new_min  := case when v_keep_len then v_chk.ext_min else coalesce((v_pick->>'duration_min')::int, v_st.ext_min) end;
        v_new_unit := coalesce(v_pick->>'unit', v_chk.time_per);
      else
        v_ext_menu := '[]'::jsonb; v_new_rule := null; v_new_fee := v_st.ext_fee;
        v_new_min  := case when v_keep_len then v_chk.ext_min else v_st.ext_min end;
        v_new_unit := v_chk.time_per;
      end if;
      update public.checks
         set ext_menu_snap = v_ext_menu, ext_rule_id = v_new_rule, ext_fee = v_new_fee, ext_min = v_new_min, ext_unit = v_new_unit
       where id = p_check_id;
      v_moved := true;
      -- 514-4: 移した時に進行中の延長の行も移動先の額（上へ移すときに最後の延長行を VIP 額にする 10/26 ① の鏡）。額 0 なら行を消す（額>0 のみ実体化）。
      if v_ext_n > 0 then
        v_keu := case when v_new_unit = 'person' then coalesce(v_chk.people, 1) else 1 end;
        if coalesce(v_st.time_mode, '') = 'auto' then
          -- 自動延長：今のブロック（check_time_charge_apply と同じ数え方・区切りは上で変えていない）の行だけ。終わったブロックの行は凍結のまま。
          --   額は check_time_charge_apply が進行中のブロックに付ける額と同じ（ブロックの始まりの時刻の時間帯・選んだ行・長さ＝区切り）
          v_blk := case when v_d2 <= v_chk.set_min then 0 else (v_d2 - v_chk.set_min + v_chk.ext_min - 1) / v_chk.ext_min end;
          if v_blk > 0 and v_d2 < v_chk.set_min + v_blk * v_chk.ext_min then
            select * into v_eline from public.check_lines
             where check_id = p_check_id and time_auto and fee_kind = 'extension' and block_no = v_blk;
            if v_eline.id is not null then
              v_kfee := coalesce((public.ext_menu_pick(v_ext_menu,
                          (select b.biz_min from public.biz_minutes_of(v_chk.store_id, v_chk.started_at + make_interval(mins => v_chk.set_min + (v_blk - 1) * v_chk.ext_min)) b),
                          v_new_rule, v_new_min)->>'amount')::int, v_new_fee);
              if v_new_fee = 0 then v_kfee := 0; end if;   -- check_time_charge_apply（0242 ★2）と同じ：単価 0 の伝票は 0
              v_snap_before := to_jsonb(v_eline);
              if v_kfee * v_keu > 0 then
                update public.check_lines
                   set unit_price_snapshot = v_kfee, qty = v_keu, line_total = v_kfee * v_keu, name_snapshot = regexp_replace(name_snapshot, '（VIP）$', '')
                 where id = v_eline.id;
                perform public.audit_log_write('check_move_seat_ext_line', 'check_lines:' || v_eline.id::text, v_snap_before,
                  (select to_jsonb(l) from public.check_lines l where l.id = v_eline.id), v_chk.store_id);
              else
                delete from public.check_lines where id = v_eline.id;
                perform public.audit_log_write('check_move_seat_ext_line', 'check_lines:' || v_eline.id::text, v_snap_before, null, v_chk.store_id);
              end if;
            end if;
          end if;
        else
          -- 手動の店：最後の延長行（上へ移すときと同じ選び方）を、買った延長の時間の中（入店＋セット＋延長の行の数×長さ が今より後）で、移動先の額より高いときだけ
          select * into v_eline from public.check_lines
           where check_id = p_check_id and fee_kind = 'extension' order by sort_order desc, created_at desc limit 1;
          if v_eline.id is not null and not v_eline.time_auto and v_d2 < v_chk.set_min + v_ext_n * v_chk.ext_min and v_eline.unit_price_snapshot > v_new_fee then
            v_snap_before := to_jsonb(v_eline);
            if v_new_fee > 0 then
              update public.check_lines
                 set unit_price_snapshot = v_new_fee, line_total = v_new_fee * qty, name_snapshot = regexp_replace(name_snapshot, '（VIP）$', '')
               where id = v_eline.id;
              perform public.audit_log_write('check_move_seat_ext_line', 'check_lines:' || v_eline.id::text, v_snap_before,
                (select to_jsonb(l) from public.check_lines l where l.id = v_eline.id), v_chk.store_id);
            else
              delete from public.check_lines where id = v_eline.id;
              perform public.audit_log_write('check_move_seat_ext_line', 'check_lines:' || v_eline.id::text, v_snap_before, null, v_chk.store_id);
            end if;
          end if;
        end if;
      end if;
    end if;
    if v_moved then
      perform public.check_recalc(p_check_id);
      perform public.audit_log_write('check_move_seat_pricing', 'checks:' || p_check_id::text,
        jsonb_build_object('from_kind', v_from_kind, 'to_kind', v_to_kind, 'service_rate', v_rate_old, 'set_fee', v_chk.set_fee, 'ext_fee', v_chk.ext_fee, 'ext_rule_id', v_chk.ext_rule_id),
        (select jsonb_build_object('service_rate', ch.service_rate, 'service_pre', ch.service_pre, 'set_fee', ch.set_fee, 'set_rule_id', ch.set_rule_id, 'ext_fee', ch.ext_fee, 'ext_rule_id', ch.ext_rule_id, 'total', ch.total,
                                   'ext_min', ch.ext_min, 'ext_unit', ch.ext_unit)   -- ★0242: 下へ移した後の延長の単価の確かめ用
           from public.checks ch where ch.id = p_check_id),
        v_chk.store_id);
    end if;
  end if;
end $function$;
revoke execute on function public.check_move_seat(uuid, uuid) from public, anon;
grant execute on function public.check_move_seat(uuid, uuid) to authenticated;

-- ═══ ★2 check_time_charge_apply（作り直し・同じ署名・CREATE OR REPLACE） ═══
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
  v_pick jsonb; v_fee_k int;  -- ★0187（便 EXT）: ブロックごとの額
  v_es_on boolean; v_es_seat text; r_es record; v_nom record; v_bstart timestamptz; v_es_id uuid;  -- ★0218（台帳の残 #47）: 自動延長の店の延長指名料
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_time_charge_apply');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
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
  if coalesce(v_chk.time_end, 'extend') <> 'extend' then v_blocks := 0; end if;   -- ★0210（起票140）: 時間で終わり（end）・時間無制限（unlimited）の初回の卓は延長しない（下で自動の延長の行も消える）。店長以上が check_set_time_end で extend に切り替えた後は今と同じ
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
                                    back_snapshot, sort_order, time_auto, fee_kind, block_no, all_in)   -- ★0210: +all_in
    values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
            case when v_chk.set_price_mode = 'all_in' then '初回料金(' || v_chk.set_min || '分) 税・サ込' else 'セット料金(' || v_chk.set_min || '分)' end, v_chk.set_fee, v_units, v_set_c,   -- ★0210: check_open と同じ名前
            null, v_sort, true, 'set', 0, coalesce(v_chk.set_price_mode, 'base') = 'all_in')
    on conflict (check_id, fee_kind, block_no) where time_auto do update
       set unit_price_snapshot = excluded.unit_price_snapshot,
           qty                 = excluded.qty,
           line_total          = excluded.line_total,
           name_snapshot       = excluded.name_snapshot,
           all_in              = excluded.all_in   -- ★0210
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

  if v_blocks = 0 then
    -- ブロックなし＝額>0 のみ実体化原則（0089 の else 分岐と同義）
    -- ★0242（裁定514-4）: 単価 0（ext_fee = 0）は下のループの中へ移した＝終わったブロックの行は残す（前は全部消した）
    delete from public.check_lines
     where check_id = p_check_id and time_auto and fee_kind = 'extension';
  else
    for v_k in 1..v_blocks loop
      -- ★0242（裁定514-4）: 単価 0 の伝票＝新しい行は作らない（額>0 のみ実体化）・進行中のブロックの行は消す・終わったブロックの行は凍結のまま残す
      --   （VIP から下の席へ移し、移動先にパターンが無く店の基本の延長額が 0 の店で、もう出た VIP の延長行を消さない＝④ 返金しない）。前と同じくメニューの時間帯の行は見ない
      if v_chk.ext_fee = 0 then
        if v_d < v_chk.set_min + v_k * v_chk.ext_min then
          delete from public.check_lines
           where check_id = p_check_id and time_auto and fee_kind = 'extension' and block_no = v_k;
        end if;
        continue;
      end if;
      -- ★0187（便 EXT・Agoora 確定 10/27（2））: このブロックの開始時刻（入店＋セット＋前のブロック）の時間帯に合う行の額（長さ＝ext_min の行だけ・時間帯つき→選択中のパターン→既定）。
      --   0187 前に開いた伝票（band キーなし）・合う行なし＝従来の ext_fee
      v_pick := public.ext_menu_pick(v_chk.ext_menu_snap, (select b.biz_min from public.biz_minutes_of(v_chk.store_id, v_chk.started_at + make_interval(mins => v_chk.set_min + (v_k - 1) * v_chk.ext_min)) b), v_chk.ext_rule_id, v_chk.ext_min);
      v_fee_k := coalesce((v_pick->>'amount')::int, v_chk.ext_fee);
      select coalesce(max(sort_order), 0) + 1 into v_sort
        from public.check_lines where check_id = p_check_id;
      if v_d >= v_chk.set_min + v_k * v_chk.ext_min then
        -- 終了済みブロック＝凍結（既存行 do nothing 不触・無ければ現況 units で初回生成＝R2-7b）
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, time_auto, fee_kind, block_no)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
                '延長料金(' || v_chk.ext_min || '分) #' || v_k, v_fee_k, v_eunits,   -- ★0187: ブロックごとの額
                v_fee_k * v_eunits, null, v_sort, true, 'extension', v_k)
        on conflict (check_id, fee_kind, block_no) where time_auto do nothing;
      else
        -- 進行中ブロック（k=v_blocks のみ到達）＝現況 units で upsert
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, time_auto, fee_kind, block_no)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
                '延長料金(' || v_chk.ext_min || '分) #' || v_k, v_fee_k, v_eunits,   -- ★0187: ブロックごとの額
                v_fee_k * v_eunits, null, v_sort, true, 'extension', v_k)
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

  -- ★0218（起票167 の続き・台帳の残 #47・相談役 11/26 の便 L5 の決め 1〜3 ＝ア）: 自動延長の店の延長指名料。
  --   延長のブロック 1 つごとに、そのブロックの始まりの時刻にいた本指名 1 人につき 1 行（額＝手動の店と同じ pricing_resolve_core(ext_shimei)＝伝票の開始の時刻・卓の席種）。
  --   始まりの時刻にいた本指名＝着席（created_at）がその時刻以前・終わり（ended_at）が無いかその時刻より後・その時刻の種類が hon（kind_changed_at より前は prev_kind）。
  --   行は 1 度作ったら変えない（終わったブロックも進んでいるブロックも凍結＝idem_key＝md5('ext_shimei_auto:' 伝票:ブロック:キャスト)・on conflict do nothing）。
  --   time_auto は false（一意の決まり check_lines_one_time_auto＝伝票×種類×ブロックに 2 人目が当たる）＝block_no で自動の行と分かる（手動の延長指名料は block_no が空）。
  --   動くのは time_mode='auto' かつ延長指名 ON かつ額のある店だけ（OFF・額なし・手動の店は読むだけで何も書かない）。時間で終わり・時間無制限の初回の卓は v_blocks=0＝付かない（延長に切り替えた後に数える）。
  select (st.time_mode = 'auto' and st.ext_shimei_enabled) into v_es_on from public.stores st where st.id = v_chk.store_id;
  if coalesce(v_es_on, false) and v_blocks > 0 then
    select s.kind into v_es_seat from public.seats s where s.id = v_chk.seat_id;
    select * into r_es from public.pricing_resolve_core(v_chk.store_id, v_chk.started_at, 'ext_shimei', v_es_seat, null);
    if r_es.amount is not null then
      -- 時計の逆行などで v_blocks を超えた自動の行は消す（延長の行と同じ決定性）
      delete from public.check_lines
       where check_id = p_check_id and not time_auto and fee_kind = 'ext_shimei' and block_no is not null and block_no > v_blocks;
      for v_k in 1..v_blocks loop
        v_bstart := v_chk.started_at + make_interval(mins => v_chk.set_min + (v_k - 1) * v_chk.ext_min);
        for v_nom in select n.cast_id from public.check_nominations n
                      where n.check_id = p_check_id and n.created_at <= v_bstart
                        and (n.ended_at is null or n.ended_at > v_bstart)
                        and (case when n.kind_changed_at is not null and n.kind_changed_at > v_bstart then n.prev_kind else n.nom_kind end) = 'hon'
                      order by n.position, n.cast_id
        loop
          v_es_id := null;
          select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
          insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                          name_snapshot, unit_price_snapshot, qty, line_total,
                                          back_snapshot, sort_order, time_auto, fee_kind, block_no, cast_id, idem_key)
          values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
                  '延長指名料 #' || v_k, r_es.amount, 1, r_es.amount, null, v_sort, false, 'ext_shimei', v_k, v_nom.cast_id,
                  md5('ext_shimei_auto:' || p_check_id::text || ':' || v_k::text || ':' || v_nom.cast_id::text)::uuid)
          on conflict (idem_key) where idem_key is not null do nothing
          returning id into v_es_id;
          if v_es_id is not null then
            perform public.audit_log_write('check_time_charge_apply', 'check_lines:' || v_es_id::text, null,
              (select to_jsonb(l) from public.check_lines l where l.id = v_es_id), v_chk.store_id);
          end if;
        end loop;
      end loop;
    end if;
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

commit;
