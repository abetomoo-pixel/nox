-- mig 0124 NOX 裁定111: 名簿操作を正・課金は派生(指名料/同伴料の遷移派生・ended_at・延長指名料・全0按分ガード)
-- 底本: docs/dp/live_0124prep.sql(sha256 1e293101…・4関数)+dump0124prep v2(2026-09-02)。記憶からの再構成なし
-- 冪等: 可(add column if not exists / drop constraint if exists+add / create or replace 同シグネチャ=grant 保持・overload 増殖なし)
-- 監査: 新 action 名なし(派生は check_set_nominations の v_after.derived へ・延長フックは既存 'check_extension_add' 再利用)
-- 同梱範囲(教訓50): check_nominations の CHECK/trigger 確認・check_lines/pricing_rules の fee_kind CHECK 両替え・下流除算(check_close)ガード
begin;

-- ============================================================
-- 器1: check_nominations.ended_at(裁定111-5。按分の正本は weight・ended_at は「以後の按分から外した」事実記録)
-- ============================================================
alter table public.check_nominations add column if not exists ended_at timestamptz;

-- ============================================================
-- 器2: stores.ext_shimei_enabled(裁定111-7・判断E: manual 店の check_extension_add フックのみが読む)
-- ============================================================
alter table public.stores add column if not exists ext_shimei_enabled boolean not null default false;

-- ============================================================
-- 器3: fee_kind CHECK 両替え(判断D: 'ext_shimei' 追加。check_lines/pricing_rules を同一 mig で=教訓50)
-- ============================================================
alter table public.check_lines drop constraint if exists check_lines_fee_kind_check;
alter table public.check_lines add constraint check_lines_fee_kind_check
  check ((fee_kind is null) or (fee_kind = any (array['set'::text, 'extension'::text, 'dohan'::text, 'hon_shimei'::text, 'jonai_shimei'::text, 'ext_shimei'::text])));

alter table public.pricing_rules drop constraint if exists pricing_rules_fee_kind_check;
alter table public.pricing_rules add constraint pricing_rules_fee_kind_check
  check (fee_kind = any (array['set'::text, 'extension'::text, 'dohan'::text, 'hon_shimei'::text, 'jonai_shimei'::text, 'ext_shimei'::text]));
-- pricing_rules_check1(rank は hon/jonai_shimei のみ)・check2(duration は set/extension のみ)は無変更=判断D(ext_shimei は rank 非対応・duration 不要)

-- ============================================================
-- 器4: check_set_nominations 書換(判断A'/B/C/H)
--   A': ended/nom_kind/is_dohan とも「キー欠落=既存値保持」(kiosk はキー無送信=既存バグ是正)。
--       ended 明示 true=旧 ended_at 引継ぎ(なければ now())・明示 false=解除(null)
--   B : 按分合計0判定を active(ended_at is null)行のみへ。全員 ended=許可(按分なし)
--   C : 遷移ベース派生(reconcile なし=明細側取消は復活しない・裁定111-4)。行形は check_shimei_add/check_dohan_add と同形
--   H : dohan_count は該当 cast の dohan 行がちょうど1本のときのみ qty 同期
--   派生(insert/delete/qty)発生時のみ 'has payments' 保守側ガード(純粋な名簿編集は従来どおり通す)
-- ============================================================
create or replace function public.check_set_nominations(p_check_id uuid, p_nominations jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_chk record; v_before jsonb; v_after jsonb;
  v_elem jsonb; v_cast record; v_w numeric; v_pos int := 0; v_cast_id uuid;
  v_org uuid;  -- ★0057(2)
  v_kind text; v_dohan boolean; v_auto boolean; v_summary text;  -- ★0119 裁定100
  -- ★0124 裁定111
  v_prev jsonb; v_old jsonb; v_old_kind text; v_old_dohan boolean;
  v_ended boolean; v_ended_at timestamptz;
  v_active_cnt int := 0; v_sumw_active numeric := 0;
  v_paycnt int; v_dohan_fee int; v_seat_kind text;
  v_fee_kind text; v_name text; v_price int; r_fee record;
  v_sort int; v_lid uuid; v_dcnt int; v_oldqty int; v_qty int;
  v_line_changed boolean := false; v_derived jsonb := '[]'::jsonb;
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_nominations is null or jsonb_typeof(p_nominations) <> 'array' then raise exception 'bad nominations'; end if;
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

  v_before := jsonb_build_object('nom_type', v_chk.nom_type, 'nominations',
    (select coalesce(jsonb_agg(jsonb_build_object('cast_id', cast_id, 'weight', ratio_weight, 'nom_kind', nom_kind, 'is_dohan', is_dohan, 'ended_at', ended_at) order by position), '[]'::jsonb)
       from public.check_nominations where check_id = p_check_id));

  -- ★0124 判断A'/C: 旧名簿を cast 別に退避(キー欠落=既存値保持・ended_at 引継ぎ・遷移検知の基準)
  select coalesce(jsonb_object_agg(cast_id::text, jsonb_build_object(
           'nom_kind', nom_kind, 'is_dohan', is_dohan, 'ended_at', ended_at)), '{}'::jsonb)
    into v_prev
    from public.check_nominations where check_id = p_check_id;

  select count(*) into v_paycnt from public.payments where check_id = p_check_id;  -- ★0124: 派生時のみの保守側ガード用
  select st.dohan_auto_hon, st.dohan_fee into v_auto, v_dohan_fee
    from public.stores st where st.id = v_chk.store_id;  -- ★0119/★0124
  select s.kind into v_seat_kind from public.seats s where s.id = v_chk.seat_id;  -- ★0124 判断C: check_shimei_add と同型の席種解決

  delete from public.check_nominations where check_id = p_check_id;
  for v_elem in select * from jsonb_array_elements(p_nominations)
  loop
    if jsonb_typeof(v_elem) <> 'object' then raise exception 'bad nominations'; end if;
    if jsonb_typeof(v_elem -> 'weight') is distinct from 'number' then raise exception 'bad weight'; end if;
    v_w := (v_elem ->> 'weight')::numeric;
    if v_w < 0 or v_w <> trunc(v_w) then raise exception 'bad weight'; end if;  -- ★0123 裁定110: 0 を許可(小数は拒否)

    v_cast_id := (v_elem ->> 'cast_id')::uuid;
    select * into v_cast from public.casts where id = v_cast_id;
    if v_cast.id is null or v_cast.org_id <> v_org
       or v_cast.store_id <> v_chk.store_id or not v_cast.is_active then
      raise exception 'bad cast';
    end if;
    if exists (select 1 from public.check_nominations where check_id = p_check_id and cast_id = v_cast_id) then
      raise exception 'dup cast';  -- 名簿は 1伝票×1キャスト 1行(種別・同伴・ended は行の属性)
    end if;

    v_old := v_prev -> v_cast_id::text;  -- null=新規 cast
    v_old_kind  := coalesce(v_old ->> 'nom_kind', 'free');
    v_old_dohan := coalesce((v_old ->> 'is_dohan')::boolean, false);

    -- ★0124 判断A'/C: キー欠落=既存値保持(新規 cast は free/false)。kiosk の free 落ち既存バグ是正
    if v_elem ? 'nom_kind' then
      v_kind := v_elem ->> 'nom_kind';
      if v_kind is null or v_kind not in ('hon','jonai','free') then raise exception 'bad nom_kind'; end if;
    else
      v_kind := v_old_kind;
    end if;
    if v_elem ? 'is_dohan' then
      if jsonb_typeof(v_elem -> 'is_dohan') <> 'boolean' then raise exception 'bad is_dohan'; end if;
      v_dohan := (v_elem ->> 'is_dohan')::boolean;
    else
      v_dohan := v_old_dohan;
    end if;
    if coalesce(v_auto, false) and v_dohan and v_kind = 'free' then v_kind := 'hon'; end if; -- 同伴時の本指名自動付与(jonai 明示は昇格しない)

    -- ★0124 判断A': ended キー欠落=既存値保持・true=旧値引継ぎ(なければ now())・false=解除
    if v_elem ? 'ended' then
      if jsonb_typeof(v_elem -> 'ended') <> 'boolean' then raise exception 'bad ended'; end if;
      v_ended := (v_elem ->> 'ended')::boolean;
      if v_ended then
        v_ended_at := coalesce((v_old ->> 'ended_at')::timestamptz, now());
      else
        v_ended_at := null;
      end if;
    else
      v_ended_at := (v_old ->> 'ended_at')::timestamptz;
    end if;
    if v_ended_at is null then
      v_active_cnt := v_active_cnt + 1;
      v_sumw_active := v_sumw_active + v_w;
    end if;

    -- ★0121 裁定107: 種別と weight(金額按分)は独立(裁定105)
    insert into public.check_nominations (org_id, store_id, check_id, cast_id, ratio_weight, position, nom_kind, is_dohan, ended_at)
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_id, v_w::int, v_pos, v_kind, v_dohan, v_ended_at);
    v_pos := v_pos + 1;

    -- ★0124 判断C: 種別の遷移ベース派生(reconcile なし=明細側で取消した行は復活しない=裁定111-4)
    if v_kind is distinct from v_old_kind then
      if v_old_kind in ('hon','jonai') then
        if v_paycnt > 0 then raise exception 'has payments'; end if;
        delete from public.check_lines
         where check_id = p_check_id and cast_id = v_cast_id
           and fee_kind = case v_old_kind when 'hon' then 'hon_shimei' else 'jonai_shimei' end;
        if found then
          v_line_changed := true;
          v_derived := v_derived || jsonb_build_object('op', 'remove', 'cast_id', v_cast_id,
            'fee_kind', case v_old_kind when 'hon' then 'hon_shimei' else 'jonai_shimei' end);
        end if;
      end if;
      if v_kind in ('hon','jonai') then
        v_fee_kind := case v_kind when 'hon' then 'hon_shimei' else 'jonai_shimei' end;
        if not exists (select 1 from public.check_lines
                        where check_id = p_check_id and cast_id = v_cast_id and fee_kind = v_fee_kind) then  -- 既存あれば追加しない(裁定111-1)
          if v_paycnt > 0 then raise exception 'has payments'; end if;
          -- 価格解決=check_shimei_add と同一(live・started_at 凍結軸・現在席・rank)
          select * into r_fee from public.pricing_resolve_core(
            v_chk.store_id, v_chk.started_at, v_fee_kind, v_seat_kind, v_cast.rank_id);
          if r_fee.amount is not null then
            v_price := r_fee.amount;
          else
            select case when v_kind = 'hon' then st.hon_fee else st.jonai_fee end
              into v_price from public.stores st where st.id = v_chk.store_id;
          end if;
          v_name := case v_kind when 'hon' then '本指名料' else '場内指名料' end;
          select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
          insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                          name_snapshot, unit_price_snapshot, qty, line_total,
                                          back_snapshot, sort_order, fee_kind, cast_id)
          values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
                  v_name, v_price, 1, v_price, null, v_sort, v_fee_kind, v_cast_id)
          returning id into v_lid;
          v_line_changed := true;
          v_derived := v_derived || jsonb_build_object('op', 'add', 'cast_id', v_cast_id,
            'fee_kind', v_fee_kind, 'line_id', v_lid);
        end if;
      end if;
    end if;

    -- ★0124 判断C/H: 同伴の遷移ベース派生(裁定111-2)。dohan_count=行内人数ステッパー(既定1)
    v_qty := null;
    if v_elem ? 'dohan_count' then
      if jsonb_typeof(v_elem -> 'dohan_count') <> 'number' then raise exception 'bad count'; end if;
      if (v_elem ->> 'dohan_count')::numeric <> trunc((v_elem ->> 'dohan_count')::numeric)
         or (v_elem ->> 'dohan_count')::numeric <= 0 then raise exception 'bad count'; end if;
      v_qty := (v_elem ->> 'dohan_count')::numeric::int;
    end if;
    if v_dohan and not v_old_dohan then
      if not exists (select 1 from public.check_lines
                      where check_id = p_check_id and cast_id = v_cast_id and fee_kind = 'dohan') then
        if v_paycnt > 0 then raise exception 'has payments'; end if;
        v_price := coalesce(v_chk.dohan_fee, v_dohan_fee);  -- check_dohan_add と同一(snap 優先)
        select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, fee_kind, cast_id)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
                '同伴料', v_price, coalesce(v_qty, 1), v_price * coalesce(v_qty, 1), null, v_sort, 'dohan', v_cast_id)
        returning id into v_lid;
        v_line_changed := true;
        v_derived := v_derived || jsonb_build_object('op', 'add', 'cast_id', v_cast_id,
          'fee_kind', 'dohan', 'line_id', v_lid, 'qty', coalesce(v_qty, 1));
      end if;
    elsif (not v_dohan) and v_old_dohan then
      if v_paycnt > 0 then raise exception 'has payments'; end if;
      delete from public.check_lines
       where check_id = p_check_id and cast_id = v_cast_id and fee_kind = 'dohan';
      if found then
        v_line_changed := true;
        v_derived := v_derived || jsonb_build_object('op', 'remove', 'cast_id', v_cast_id, 'fee_kind', 'dohan');
      end if;
    elsif v_dohan and v_old_dohan and v_qty is not null then
      select count(*) into v_dcnt from public.check_lines
       where check_id = p_check_id and cast_id = v_cast_id and fee_kind = 'dohan';
      if v_dcnt = 1 then  -- ★判断H: ちょうど1本のときのみ qty 同期(取消済み・複数行は no-op)
        select id, qty into v_lid, v_oldqty from public.check_lines
         where check_id = p_check_id and cast_id = v_cast_id and fee_kind = 'dohan';
        if v_oldqty <> v_qty then
          if v_paycnt > 0 then raise exception 'has payments'; end if;
          update public.check_lines set qty = v_qty, line_total = unit_price_snapshot * v_qty where id = v_lid;
          v_line_changed := true;
          v_derived := v_derived || jsonb_build_object('op', 'qty', 'cast_id', v_cast_id,
            'fee_kind', 'dohan', 'line_id', v_lid, 'qty', v_qty);
        end if;
      end if;
    end if;
  end loop;

  -- ★0124 判断B: active(ended 除く)行が有るのに按分合計 0 は拒否(裁定110 の趣旨を active に対して維持)。全員 ended=許可(按分なし)
  if v_active_cnt > 0 and v_sumw_active = 0 then raise exception 'bad weight'; end if;

  if v_line_changed then perform public.check_recalc(p_check_id); end if;  -- ★0124: 派生で明細が動いたときのみ

  v_summary := public.nom_type_summary(p_check_id);  -- ★0119: checks.nom_type は派生サマリ(正本は名簿行)
  update public.checks set nom_type = v_summary where id = p_check_id;

  v_after := jsonb_build_object('nom_type', v_summary, 'nominations', p_nominations, 'derived', v_derived);
  perform public.audit_log_write('check_set_nominations', 'checks:' || p_check_id::text,
    v_before, v_after, v_chk.store_id);
end $function$;

-- ============================================================
-- 器5: check_extension_add フック(裁定111-7・判断D/E/G)
--   manual 専用の既存前提は不変。ext_shimei_enabled ∧ pricing_rules(fee_kind='ext_shimei')ヒット時のみ、
--   active 本指名 cast ごとに1行(qty=1・cast_id 付き)。rank 非対応=null 渡し・live 解決・ヒットなし=skip
-- ============================================================
create or replace function public.check_extension_add(p_check_id uuid, p_rule_id uuid default null::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_chk record; v_mode text; v_units int; v_sort int; v_paycnt int; v_id uuid;
  v_emin int; v_efee int;  -- ★mig0098 R2-1: 選択メニュー(null=既定スナップ)
  v_org uuid;
  v_seat_kind text; r_fee record; v_nom record; v_sort2 int; v_id2 uuid;  -- ★0124 裁定111-7
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

  v_units := case when v_chk.time_per = 'person' then coalesce(v_chk.people, 1) else 1 end;

  -- ★mig0098 R2-1: p_rule_id null=既定(checks スナップ ext_min/ext_fee=現行完全互換)。
  --   指定時は ext_menu_snap(開栓時凍結)から解決=live pricing_rules は読まない(凍結原則 R2-4)。
  --   snap に無い id・旧伝票(snap null)への指定は 'bad rule'
  v_emin := v_chk.ext_min;
  v_efee := v_chk.ext_fee;
  if p_rule_id is not null then
    select (m.value->>'duration_min')::int, (m.value->>'amount')::int into v_emin, v_efee
      from jsonb_array_elements(coalesce(v_chk.ext_menu_snap, '[]'::jsonb)) m
     where (m.value->>'rule_id')::uuid = p_rule_id;
    if v_emin is null or v_efee is null or v_emin < 1 or v_efee < 0 then
      raise exception 'bad rule';
    end if;
  end if;
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

-- ============================================================
-- 器6: check_close の全0按分ガード(判断B 必須同梱。cast_sales_aggregate/allocDue の w_total ガードと同型)
--   変更は sumw 計算直後の if 包みのみ。分配ロジック本体は底本逐語のまま
-- ============================================================
create or replace function public.check_close(p_check_id uuid, p_idem_key uuid default null::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_chk record; v_before jsonb; v_g record; v_due int; v_paid int; v_lines int;
  v_cast_ids uuid[]; v_weights int[]; v_n int; v_sumw int := 0;
  v_drink int[]; v_champ int[]; v_bottle int[]; v_pt int[];
  v_alloc int[]; v_rem int[]; v_used boolean[];
  v_line record; v_unit int; v_rest int; v_best int; i int; c int;
  v_org uuid;  -- ★0057(2)
  v_kinds text[]; v_dohans boolean[];  -- ★0119 裁定100: キャスト別種別/同伴
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
      -- 集計
      for i in 1..v_n loop
        if v_alloc[i] > 0 then
          if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
            v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> public.nom_unit4_key(v_kinds[i], v_dohans[i]))::int, 0);
          end if;
          if v_line.kind = 'drink'  then v_drink[i]  := v_drink[i]  + v_unit * v_alloc[i]; end if;
          if v_line.kind = 'champ'  then v_champ[i]  := v_champ[i]  + v_unit * v_alloc[i]; end if;
          if v_line.kind = 'bottle' then v_bottle[i] := v_bottle[i] + v_unit * v_alloc[i]; end if;
          if v_kinds[i] = 'hon' then  -- ★0119: pt は本指名キャストの行のみ
            v_pt[i] := v_pt[i] + coalesce((v_line.back_snapshot ->> 'hon_pt')::int, 0) * v_alloc[i];
          end if;
        end if;
      end loop;
    end loop;
    for i in 1..v_n loop
      if v_drink[i] + v_champ[i] + v_bottle[i] + v_pt[i] > 0 then
        insert into public.check_cast_backs
          (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc)
        values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                v_drink[i], v_champ[i], v_bottle[i], v_pt[i]);
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

-- ============================================================
-- 器7: cast_sales_aggregate の stale コメント書換(挙動無変更・w_total ガードは元から権威)
-- ============================================================
create or replace function public.cast_sales_aggregate(p_store_id uuid, p_from date, p_to date)
 returns table(cast_id uuid, biz_date date, sales integer, hon integer, jonai integer, dohan integer)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
  groups as (
    -- SL2a: 金額基盤=group due(check_group_due 再利用・サ料込・100円丸め後・カードTAX 非含)
    select tc.check_id, tc.bdate, l.pay_group,
           public.check_group_due(tc.check_id, l.pay_group) as due
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

commit;

-- ============================================================
-- 検証バンドル(単一結果セット。撤去確認はコード断片=恒久注意2)
-- ============================================================
select ord, tag, ok from (

  select 1 as ord, 'col: check_nominations.ended_at (timestamptz/nullable)' as tag,
         exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='check_nominations'
                    and column_name='ended_at' and data_type='timestamp with time zone'
                    and is_nullable='YES') as ok
  union all
  select 2, 'col: stores.ext_shimei_enabled (boolean/not null/default false)',
         exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='stores'
                    and column_name='ext_shimei_enabled' and data_type='boolean'
                    and is_nullable='NO' and column_default like 'false%')
  union all
  select 3, 'check: check_lines_fee_kind_check に ext_shimei',
         exists (select 1 from pg_constraint
                  where conrelid='public.check_lines'::regclass
                    and conname='check_lines_fee_kind_check'
                    and pg_get_constraintdef(oid) like '%ext_shimei%')
  union all
  select 4, 'check: pricing_rules_fee_kind_check に ext_shimei',
         exists (select 1 from pg_constraint
                  where conrelid='public.pricing_rules'::regclass
                    and conname='pricing_rules_fee_kind_check'
                    and pg_get_constraintdef(oid) like '%ext_shimei%')
  union all
  select 5, 'csn: active 判定あり(v_active_cnt > 0 and v_sumw_active = 0)',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='check_set_nominations' and p.prokind='f'
                    and p.prosrc like '%v_active_cnt > 0 and v_sumw_active = 0%')
  union all
  select 6, 'csn: 旧全0判定の撤去(コード断片 v_pos > 0 and v_sumw = 0 が無い)',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='check_set_nominations' and p.prokind='f'
                    and p.prosrc like '%v_pos > 0 and v_sumw = 0%')
  union all
  select 7, 'csn: キー欠落=保持(v_elem ? のキー存在分岐)',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='check_set_nominations' and p.prokind='f'
                    and p.prosrc like '%v_elem ? ''nom_kind''%'
                    and p.prosrc like '%v_elem ? ''ended''%')
  union all
  select 8, 'csn: 遷移派生あり(pricing_resolve_core 呼び)',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='check_set_nominations' and p.prokind='f'
                    and p.prosrc like '%pricing_resolve_core%')
  union all
  select 9, 'cea: ext_shimei フックあり(enabled 参照+延長指名料)',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='check_extension_add' and p.prokind='f'
                    and p.prosrc like '%ext_shimei_enabled%'
                    and p.prosrc like '%延長指名料%')
  union all
  select 10, 'close: 全0按分ガードあり(if v_sumw > 0 then)',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='check_close' and p.prokind='f'
                    and p.prosrc like '%if v_sumw > 0 then%')
  union all
  select 11, 'csa: stale コメント撤去(断片: weight>=1 を強制済み が無い)',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='cast_sales_aggregate' and p.prokind='f'
                    and p.prosrc like '%weight>=1 を強制済み%')
  union all
  select 12, 'overload なし: 4関数とも定義ちょうど1本',
         (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.prokind='f'
             and p.proname in ('check_set_nominations','check_extension_add','check_close','cast_sales_aggregate')) = 4
  union all
  select 13, 'check_nominations: trigger 0 本のまま(教訓50 同 mig 確認)',
         (select count(*) from pg_trigger
           where tgrelid='public.check_nominations'::regclass and not tgisinternal) = 0

) v order by ord;
