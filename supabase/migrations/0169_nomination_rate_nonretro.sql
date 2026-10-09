-- 0169_nomination_rate_nonretro.sql
-- マイグレーション名: 0169_nomination_rate_nonretro（裁定341＝レジの場内→本指名の切替は非遡及が既定・便 P168 起草・2026-10-09・適用は Agoora 手貼り）
-- 生成器: scratchpad/gen_0169.py（手打ち禁止）。写経元＝live pg_get_functiondef（docs/tmp/0169_live_check_set_nominations.sql＝md5 1dbd13ca／0169_live_check_close.sql＝3f4e73b5）。★以外は 1 バイト不変（299-11）。
--
-- 現状（読取 2026-10-09）: 商品バック（check_cast_backs）は会計時（check_close）に check_nominations の現在の nom_kind で全行を計算する＝場内→本指名に切り替えると既出のドリンク行も本指名の率になる（遡及）。
-- 器:
--   ★1 check_nominations.prev_kind text null／kind_changed_at timestamptz null＝場内→本指名に切り替えたときの旧区分と時刻（check_set_nominations が記録・他の遷移は引継ぎ）。
--   ★2 check_set_nominations 改稿（1dbd13ca→新）: 旧行の切替記録を退避・引継ぎ、場内→本指名の遷移で prev_kind='jonai'／kind_changed_at=now() を書く。監査 before/after にも 2 キー。
--   ★3 check_close 改稿（3f4e73b5→新）: 行の created_at が kind_changed_at より前なら旧区分（prev_kind）で unit4 のキーと pt を解決＝既出のドリンクは注文時点の率のまま。
--        plan_rate／plan_fixed（売上按分・固定額）の母数は区分に依らない＝不変。
--   ★4 新規 RPC check_nomination_rate_apply(p_check_id uuid, p_cast_id uuid) returns void＝「この伝票の既出ドリンクも本指名の率にする」（店長以上・課金ゲート・open のみ）：
--        切替記録（prev_kind／kind_changed_at）を消す＝会計時に全行が現在の区分で計算される。audit 'check_nomination_rate_apply'（note '指名切替に伴う率変更'）。記録なしは no-op。
--   ★5 grants: 新 RPC＝public／anon revoke・authenticated grant。改稿 2 本は create or replace＝ACL 不変。
--
-- 名簿・suite への影響（手貼り後の便 P169 で反映）: 関数 305→306（新 RPC＝ゲート内蔵・名簿 A1 +1）・'billing locked' 156→157。表 83 不変。
--   pin が変わる suite: billing（157／158／157）／anon-guard（probe +1）／grants（公開 +1）／0158（check_close・check_set_nominations の md5 控えがあれば）／r2b・pb（check_close 挙動 pin＝golden 不変の見込み＝切替なしの伝票は従来と同値）。
--
-- 検証クエリ（Run 後・下の commit; の後ろ・貼り先証明を先頭に・値は形だけ返す）:
--   select 'nox-project-proof', count(*) from public.orgs;                                                                                         -- 9
--   select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='check_nominations' and column_name in ('prev_kind','kind_changed_at') order by 1;   -- 2 行・YES
--   select proname, left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname in ('check_set_nominations','check_close','check_nomination_rate_apply') order by 1;   -- 3 行（md5 は手貼り案内の値）
--   select prosrc like '%billing locked%' from pg_proc where proname='check_nomination_rate_apply';                                                -- true
--   select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions, (select count(*) from pg_tables where schemaname='public') tables;   -- 306／83
begin;

-- ★1 check_nominations の 2 列（NULL＝切替記録なし）
alter table public.check_nominations add column if not exists prev_kind text null;
alter table public.check_nominations add column if not exists kind_changed_at timestamptz null;
alter table public.check_nominations drop constraint if exists check_nominations_prev_kind_check;
alter table public.check_nominations add constraint check_nominations_prev_kind_check check (prev_kind is null or prev_kind in ('hon','jonai','free'));
comment on column public.check_nominations.prev_kind is '0169（裁定341）: 場内→本指名に切り替える前の区分（kind_changed_at より前に出た行はこの区分で計算）';
comment on column public.check_nominations.kind_changed_at is '0169（裁定341）: 場内→本指名に切り替えた時刻（NULL＝記録なし＝全行を現在の区分で計算）';

-- ★2 check_set_nominations（★以外は live 1dbd13ca の 1 バイト不変）
CREATE OR REPLACE FUNCTION public.check_set_nominations(p_check_id uuid, p_nominations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_after jsonb;
  v_elem jsonb; v_cast record; v_w numeric; v_pos int := 0; v_cast_id uuid;
  v_org uuid;  -- ★0057(2)
  v_kind text; v_dohan boolean; v_auto boolean; v_summary text;  -- ★0119 裁定100
  -- ★0124 裁定111
  v_prev jsonb; v_old jsonb; v_old_kind text; v_old_dohan boolean;
  v_old_prev text; v_old_chg timestamptz;  -- ★0169（裁定341）: 場内→本指名の切替記録（旧行から引継ぎ）
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

  v_before := jsonb_build_object('nom_type', v_chk.nom_type, 'nominations',
    (select coalesce(jsonb_agg(jsonb_build_object('cast_id', cast_id, 'weight', ratio_weight, 'nom_kind', nom_kind, 'is_dohan', is_dohan, 'ended_at', ended_at, 'prev_kind', prev_kind, 'kind_changed_at', kind_changed_at) order by position), '[]'::jsonb)
       from public.check_nominations where check_id = p_check_id));

  -- ★0124 判断A'/C: 旧名簿を cast 別に退避(キー欠落=既存値保持・ended_at 引継ぎ・遷移検知の基準)
  select coalesce(jsonb_object_agg(cast_id::text, jsonb_build_object(
           'nom_kind', nom_kind, 'is_dohan', is_dohan, 'ended_at', ended_at, 'prev_kind', prev_kind, 'kind_changed_at', kind_changed_at)), '{}'::jsonb)  -- ★0169: 旧行の切替記録も退避
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
    v_old_prev := v_old ->> 'prev_kind'; v_old_chg := (v_old ->> 'kind_changed_at')::timestamptz;  -- ★0169

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
    insert into public.check_nominations (org_id, store_id, check_id, cast_id, ratio_weight, position, nom_kind, is_dohan, ended_at, prev_kind, kind_changed_at)  -- ★0169
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_id, v_w::int, v_pos, v_kind, v_dohan, v_ended_at,
            case when v_old_kind = 'jonai' and v_kind = 'hon' then 'jonai' else v_old_prev end,   -- ★0169（裁定341）: 場内→本指名の切替＝旧区分と時刻を記録（他の遷移は引継ぎ）
            case when v_old_kind = 'jonai' and v_kind = 'hon' then now() else v_old_chg end);
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

  v_after := jsonb_build_object('nom_type', v_summary, 'nominations', p_nominations, 'derived', v_derived,
    'kind_switch', (select coalesce(jsonb_agg(jsonb_build_object('cast_id', cast_id, 'prev_kind', prev_kind, 'kind_changed_at', kind_changed_at) order by position), '[]'::jsonb)
                      from public.check_nominations where check_id = p_check_id and kind_changed_at is not null));  -- ★0169: 監査 after に切替記録（場内→本指名）
  perform public.audit_log_write('check_set_nominations', 'checks:' || p_check_id::text,
    v_before, v_after, v_chk.store_id);
end $function$;

-- ★3 check_close（★以外は live 3f4e73b5 の 1 バイト不変）
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
  update public.checks
     set status = 'closed', closed_at = now(), close_idem_key = p_idem_key
   where id = p_check_id;
  -- ★mig0053(B1 相席・transient): 追加席の占有を解放(解放経路=ロック不要・money 非干渉)
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_close', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
  return p_check_id;
end $function$;

-- ★4 check_nomination_rate_apply（公開 RPC・課金ゲート内蔵・店長以上・監査）
create or replace function public.check_nomination_rate_apply(p_check_id uuid, p_cast_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chk    record;
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_before jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if p_check_id is null or p_cast_id is null then raise exception 'bad args'; end if;
  select * into v_chk from public.checks where id = p_check_id and org_id = v_org;
  if v_chk.id is null then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_chk.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select jsonb_build_object('cast_id', cast_id, 'prev_kind', prev_kind, 'kind_changed_at', kind_changed_at)
    into v_before from public.check_nominations where check_id = p_check_id and cast_id = p_cast_id;
  if v_before is null then raise exception 'not found'; end if;
  if v_before ->> 'kind_changed_at' is null then return; end if;  -- 切替記録なし＝no-op（監査も書かない）
  update public.check_nominations set prev_kind = null, kind_changed_at = null where check_id = p_check_id and cast_id = p_cast_id;
  perform public.audit_log_write('check_nomination_rate_apply', 'checks:' || p_check_id::text, v_before,
    jsonb_build_object('cast_id', p_cast_id, 'prev_kind', null, 'kind_changed_at', null, 'note', '指名切替に伴う率変更'), v_chk.store_id);
end $$;

-- ★5 grants（新 RPC＝public／anon revoke・authenticated grant・改稿 2 本は ACL 不変）
revoke all on function public.check_nomination_rate_apply(uuid, uuid) from public, anon;
grant execute on function public.check_nomination_rate_apply(uuid, uuid) to authenticated;

commit;
-- ===== end 0169 =====
