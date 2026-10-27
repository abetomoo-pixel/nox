-- 0182_check_move_seat_pricing.sql — 裁定427（席移動で席種が変わるときの料金・C2-23・便 ON-4・2026-10-26 起草・適用は Agoora 手貼り＝流していない）
-- 翻訳元: live pg_get_functiondef（2026-10-26 15:4x・check_move_seat／check_group_due）＋生成器 docs/tmp/gen_0182.cjs の文字列（手打ちなし）。
--   ★1 checks +service_pre jsonb（既定 '{}'＝pay_group ごとに {amount, base}＝席移動前に旧率で確定したサ料と母数・既存行は空＝挙動不変）。
--   ★2 check_group_due＝サ料＝凍結額＋（母数−凍結母数）×現在率（service_pre が空なら従来と同式＝golden 不変）。ACL は内部専用のまま（create or replace）。
--   ★3 check_move_seat＝裁定427 ①〜⑤（本文は台帳 4525 行）。同種間・入金済みは不変。ACL（authenticated）は create or replace で保つ。
--   client（レジの席移動の確認ダイアログ・VIP 差し替えの案内）はフラグ SEAT_MOVE_PRICING_APPLIED（lib/nox/rules-0175/flag.ts）＝手貼り後に true。
-- 検証（Success の後・形で見る）: 末尾 ===== verify =====。
begin;
select 'nox-project-proof', count(*) from public.orgs;   -- 貼り先証明（hiqbfagmkrdpmlqhkmsu）

-- ═══ ★1 列 ═══
alter table public.checks add column if not exists service_pre jsonb not null default '{}'::jsonb;
alter table public.checks drop constraint if exists checks_service_pre_obj;
alter table public.checks add constraint checks_service_pre_obj check (jsonb_typeof(service_pre) = 'object');
comment on column public.checks.service_pre is '★0182（裁定427 ③）: 席移動で率が変わる前に旧率で確定したサ料＝{"A":{"amount":円,"base":母数}}（pay_group ごと・空＝従来どおり checks.service_rate だけ）';

-- ═══ ★2 check_group_due ═══
CREATE OR REPLACE FUNCTION public.check_group_due(p_check_id uuid, p_pay_group text, p_exclude_pay_fee boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rate int; v_unit int; v_mode text; v_bx int; v_disc int; v_net int;
  v_unit2 int; v_mode2 text;  -- ★0178: open のときだけ上書きする作業変数
  v_bts text; v_pd text; v_trnd text;  -- ★mig0113: 凍結税設定
  v_bx10 int; v_bx8 int; v_sv int; v_base10 int; v_tax int;  -- ★mig0113: 外税分岐
  v_ref int := 0;  -- ★12 0152（裁定298-9）: burden='customer' の紹介料（pay_group 'A'・taxable_10 の母数に加算）
  v_pf int := 0;   -- ★6 0173（裁定393）: 手数料行の合計（サ料の母数から除く・税の母数には乗る＝内税対象）
  v_pre_amt int := 0; v_pre_base int := 0;  -- ★0182（裁定427 ③）: 席移動前に凍結したサ料（pay_group ごと＝checks.service_pre）
begin
  select service_rate, round_unit, round_mode,
         business_tax_status, price_display, tax_rounding  -- ★mig0113
    into v_rate, v_unit, v_mode, v_bts, v_pd, v_trnd
    from public.checks where id = p_check_id;
  if not found then raise exception 'not found'; end if;
  -- ★0182（裁定427 ③）: 席移動で率が変わった伝票＝移動前の母数（base）までは旧率で確定した額（amount）・それより先の増分だけ現在の率
  select coalesce((c.service_pre->p_pay_group->>'amount')::int, 0), coalesce((c.service_pre->p_pay_group->>'base')::int, 0)
    into v_pre_amt, v_pre_base
    from public.checks c where c.id = p_check_id;
  -- ★29 0175 v2（裁定424 候補・便 SH-UI-c2 C2-16）: 端数調整（丸め単位・丸め方）は凍結しない＝開いている伝票は店設定の現在値を読む（税率・サ料・外税／内税は凍結値のまま）。確定済み（closed）は凍結値＝確定時の額のまま
  -- ★0178（便 ON-1・2026-10-26）: 0175 ★29 の欠陥＝closed（該当行なし）のとき select … into が v_unit／v_mode を NULL にし、確定済み伝票の due が NULL（cast_sales_aggregate の g.due > 0 で売上 0・demo 6 店 5,176 件で実測）→ 行があるときだけ上書き
  select s.round_unit, s.round_mode into v_unit2, v_mode2
    from public.checks c join public.stores s on s.id = c.store_id
   where c.id = p_check_id and c.status = 'open';
  if found then v_unit := v_unit2; v_mode := v_mode2; end if;
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
    v_sv     := v_pre_amt + round(greatest(0, v_net - v_pf - v_pre_base) * v_rate / 100.0)::int;   -- サ料（★0182: 凍結額＋増分×現在率・service_pre が空なら従来と同式）
    v_base10 := greatest(0, v_bx10 - v_disc) + v_sv;
    v_tax    := public.check_tax_round(v_base10 * 10 / 100.0, v_trnd)
              + public.check_tax_round(v_bx8   *  8 / 100.0, v_trnd);
    return public.check_round_amount(v_net + v_sv + v_tax, v_unit, v_mode);
  end if;
  return public.check_round_amount(v_net + v_pre_amt + round(greatest(0, v_net - v_pf - v_pre_base) * v_rate / 100.0), v_unit, v_mode);   -- ★0182: 同上（内税）
end $function$;
revoke all on function public.check_group_due(uuid, text, boolean) from public, anon, authenticated, service_role;   -- 内部専用（0178 と同じ）

-- ═══ ★3 check_move_seat ═══
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
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
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
        select coalesce(sum(line_total) filter (where kind <> 'discount' and fee_kind is distinct from 'pay_fee'), 0)::int,
               coalesce(sum(line_total) filter (where kind = 'discount'), 0)::int
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
        v_delta := greatest(0, r_set.amount - coalesce(v_chk.set_fee, 0));
        if v_ext_n = 0 then
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
      select coalesce(jsonb_agg(jsonb_build_object(
               'rule_id', r.id,
               'duration_min', coalesce(r.duration_min, v_chk.ext_min),
               'amount', r.amount,
               'unit', coalesce(r.billing_unit, v_chk.time_per),
               'is_default', r.is_default_ext,
               'label', '延長 ' || coalesce(r.duration_min, v_chk.ext_min) || '分 ¥' || r.amount)
             order by r.is_default_ext desc, r.priority asc, (r.category_id is not null) desc, r.created_at asc, r.id asc), '[]'::jsonb)
        into v_ext_menu
        from public.pricing_rules r
       where r.store_id = v_chk.store_id
         and r.is_active
         and r.fee_kind = 'extension'
         and r.seat_kind = 'VIP'   -- ★VIP 用だけ（seat_kind null の汎用は「無ければ差額」の経路）
         and (r.rank_id is null)
         and (r.category_id is null or r.category_id = v_chk.category_id)
         and (r.dow_mask is null or ((r.dow_mask >> v_dow2) & 1) = 1)
         and (r.time_from_min is null
              or ( (case when r.time_from_min <  v_cut2 then r.time_from_min + 1440 else r.time_from_min::int end) <= v_bm2
               and v_bm2 < (case when r.time_to_min <= v_cut2 then r.time_to_min + 1440 else r.time_to_min::int end) ));
      if jsonb_array_length(v_ext_menu) > 0 then
        update public.checks
           set ext_menu_snap = v_ext_menu,
               ext_rule_id = (select (m.value->>'rule_id')::uuid from jsonb_array_elements(v_ext_menu) m limit 1),
               ext_fee = (select (m.value->>'amount')::int from jsonb_array_elements(v_ext_menu) m limit 1),
               ext_min = coalesce((select (m.value->>'duration_min')::int from jsonb_array_elements(v_ext_menu) m limit 1), ext_min)
         where id = p_check_id;
        v_moved := true;
        v_vip_ext := (v_ext_menu->0->>'amount')::int;
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
    if v_moved then
      perform public.check_recalc(p_check_id);
      perform public.audit_log_write('check_move_seat_pricing', 'checks:' || p_check_id::text,
        jsonb_build_object('from_kind', v_from_kind, 'to_kind', v_to_kind, 'service_rate', v_rate_old, 'set_fee', v_chk.set_fee, 'ext_fee', v_chk.ext_fee, 'ext_rule_id', v_chk.ext_rule_id),
        (select jsonb_build_object('service_rate', ch.service_rate, 'service_pre', ch.service_pre, 'set_fee', ch.set_fee, 'set_rule_id', ch.set_rule_id, 'ext_fee', ch.ext_fee, 'ext_rule_id', ch.ext_rule_id, 'total', ch.total)
           from public.checks ch where ch.id = p_check_id),
        v_chk.store_id);
    end if;
  end if;
end $function$;
revoke execute on function public.check_move_seat(uuid, uuid) from public, anon;
grant execute on function public.check_move_seat(uuid, uuid) to authenticated;

commit;
-- ===== verify =====（Success の後に 1 文で貼る）
-- select 'nox-project-proof' as k, count(*)::text as v from public.orgs
-- union all select 'service_pre', count(*)::text from information_schema.columns where table_schema='public' and table_name='checks' and column_name='service_pre'
-- union all select 'move_seat has 0182', (position('★0182' in prosrc) > 0)::text from pg_proc where pronamespace='public'::regnamespace and proname='check_move_seat'
-- union all select 'group_due has 0182', (position('v_pre_amt' in prosrc) > 0)::text from pg_proc where pronamespace='public'::regnamespace and proname='check_group_due'
-- union all select 'group_due acl', coalesce(proacl::text, '(null)') from pg_proc where pronamespace='public'::regnamespace and proname='check_group_due'
-- union all select 'move_seat acl', coalesce(proacl::text, '(null)') from pg_proc where pronamespace='public'::regnamespace and proname='check_move_seat';
-- ===== end 0182 =====
