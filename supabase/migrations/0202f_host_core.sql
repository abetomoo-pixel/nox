-- 0202f_host_core.sql（2026-11-22 未明 起草・CC・相談役 0:15 の ■3＝起草と試走まで・適用しない・式は相談役が前後の比べを読んでから合図）
-- 名前: 0202f ホストの骨格（歩合の段の表 comp_plans.commission_tiers・日給の保証 guarantee_min の params.unit）
-- 翻訳元: なし（NOX 独自・docs/tmp/host_core_plan_1120.md の A-1 と B）
-- 前提: 0202e の後（関数 478・表 126）。関数と表の数は変わらない（列 1・作り直し 2）。
-- 変えるもの:
--   ★1 comp_plans に commission_tiers（jsonb・null 既定）。計算（lib/nox/pay.ts）は表があるプランだけ「売上の全額 × 届いた段の率・丸め 1 回」・既定の表を使わない。null＝今のまま。
--   ★2 comp_plan_ext_set の鍵に commission_tiers（検査＝昇順・整数・0〜100・10 段まで・null で外す）。ほかの鍵と検査は 1 字も変えない（生成器 docs/tmp/gen_0202f.cjs で本番の今の本文から作った）。
--   ★3 set_comp_component：guarantee_min の params.unit は 'month'・'day' だけ（unit なし＝今のまま・'day'＝額 × 出勤日数は pay.ts）。
-- 検証クエリ（貼った後）: docs/tmp/0202f_verify.sql（先頭は貼り先証明）
begin;
set local lock_timeout = '10s';

alter table public.comp_plans add column commission_tiers jsonb null;

CREATE OR REPLACE FUNCTION public.comp_plan_ext_set(p_plan_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★12 0175 v2（CN-R ⑥⑦⑬⑭⑮⑰⑱⑳）: CANON 拡張の列を jsonb patch で書く（set_comp_plan の引数は増やさない＝overload 罠を避ける）。owner のみ（set_comp_plan と同格）・鍵が無い列は変えない・audit。
--   鍵＝pay_rate_tiers（comp_plan_pay_rate_check）／slide_streak_n（1〜12・連続 N 期）／reward_axis（sales／pt／pay_rate／null＝店の軸・裁定412 追補）／assess_grace_months（0〜24・入店後 N か月は査定免除）／
--       hon_back_unit／jonai_back_unit／dohan_back_unit（per_check／per_hour／per_30min／per_extension／per_set）／product_back_rate_by_kind（{free,hon,jonai,vip}＝%）／product_back_fixed_vip（円）／product_back_rate_vip（%）／
--       reservation_back_tiers（[{at, rate}]＝小計帯ごとの率・at 昇順・SNACK CITY）
declare
  v_org uuid := public.auth_org_id();
  v_row record; v_k text; v_before jsonb; v_after jsonb; v_e jsonb; v_prev numeric;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then raise exception 'bad patch'; end if;
  select * into v_row from public.comp_plans where id = p_plan_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;
  for v_k in select jsonb_object_keys(p_patch) loop
    if v_k not in ('pay_rate_tiers','slide_streak_n','reward_axis','assess_grace_months','hon_back_unit','jonai_back_unit','dohan_back_unit','product_back_rate_by_kind','product_back_fixed_vip','product_back_rate_vip','reservation_back_tiers','back_rate_tiers','commission_tiers') then raise exception 'bad key'; end if;   -- ★0202f: 歩合の段の表
  end loop;
  if p_patch ? 'pay_rate_tiers' then perform public.comp_plan_pay_rate_check(p_patch->'pay_rate_tiers'); end if;
  if p_patch ? 'slide_streak_n' and (jsonb_typeof(p_patch->'slide_streak_n') <> 'number' or (p_patch->>'slide_streak_n')::numeric not between 1 and 12 or (p_patch->>'slide_streak_n')::numeric <> floor((p_patch->>'slide_streak_n')::numeric)) then raise exception 'bad slide_streak_n'; end if;
  if p_patch ? 'reward_axis' and jsonb_typeof(p_patch->'reward_axis') <> 'null' and (p_patch->>'reward_axis') not in ('sales','pt','pay_rate') then raise exception 'bad reward_axis'; end if;
  if p_patch ? 'assess_grace_months' and (jsonb_typeof(p_patch->'assess_grace_months') <> 'number' or (p_patch->>'assess_grace_months')::numeric not between 0 and 24 or (p_patch->>'assess_grace_months')::numeric <> floor((p_patch->>'assess_grace_months')::numeric)) then raise exception 'bad assess_grace_months'; end if;
  for v_k in select unnest(array['hon_back_unit','jonai_back_unit','dohan_back_unit']) loop
    if p_patch ? v_k and (p_patch->>v_k) not in ('per_check','per_hour','per_30min','per_extension','per_set','hourly_add') then raise exception 'bad back_unit'; end if;   -- ★v2 最終（CSV BELLEZZA）: hourly_add＝額を当日の時給に加算（本指名 1 件で当日時給 +200 円）
  end loop;
  if p_patch ? 'product_back_rate_by_kind' then
    if jsonb_typeof(p_patch->'product_back_rate_by_kind') <> 'object' then raise exception 'bad product_back_rate_by_kind'; end if;
    for v_k in select jsonb_object_keys(p_patch->'product_back_rate_by_kind') loop
      if v_k not in ('free','hon','jonai','vip') or jsonb_typeof(p_patch->'product_back_rate_by_kind'->v_k) <> 'number' or (p_patch->'product_back_rate_by_kind'->>v_k)::numeric not between 0 and 100 then raise exception 'bad product_back_rate_by_kind'; end if;
    end loop;
  end if;
  if p_patch ? 'product_back_fixed_vip' and jsonb_typeof(p_patch->'product_back_fixed_vip') <> 'null' and (jsonb_typeof(p_patch->'product_back_fixed_vip') <> 'number' or (p_patch->>'product_back_fixed_vip')::numeric < 0) then raise exception 'bad product_back_fixed_vip'; end if;
  if p_patch ? 'product_back_rate_vip' and jsonb_typeof(p_patch->'product_back_rate_vip') <> 'null' and (jsonb_typeof(p_patch->'product_back_rate_vip') <> 'number' or (p_patch->>'product_back_rate_vip')::numeric not between 0 and 100) then raise exception 'bad product_back_rate_vip'; end if;
  -- ★v2 最終（CSV SCANDAL）: back_rate_tiers＝{hon:[{at, rate}], jonai:[{at, rate}]}（売上小計帯→バック率・at 昇順・各 10 段まで）
  if p_patch ? 'back_rate_tiers' then
    if jsonb_typeof(p_patch->'back_rate_tiers') <> 'object' then raise exception 'bad back_rate_tiers'; end if;
    for v_k in select jsonb_object_keys(p_patch->'back_rate_tiers') loop
      if v_k not in ('hon','jonai') or jsonb_typeof(p_patch->'back_rate_tiers'->v_k) <> 'array' or jsonb_array_length(p_patch->'back_rate_tiers'->v_k) > 10 then raise exception 'bad back_rate_tiers'; end if;
      v_prev := null;
      for v_e in select * from jsonb_array_elements(p_patch->'back_rate_tiers'->v_k) loop
        if jsonb_typeof(v_e) <> 'object' or jsonb_typeof(v_e->'at') <> 'number' or jsonb_typeof(v_e->'rate') <> 'number' or (select count(*) from jsonb_object_keys(v_e)) <> 2 then raise exception 'bad back_rate_tiers'; end if;
        if (v_e->>'at')::numeric < 0 or (v_e->>'rate')::numeric not between 0 and 100 then raise exception 'bad back_rate_tiers'; end if;
        if v_prev is not null and (v_e->>'at')::numeric <= v_prev then raise exception 'bad back_rate_tiers'; end if;
        v_prev := (v_e->>'at')::numeric;
      end loop;
    end loop;
  end if;
  if p_patch ? 'reservation_back_tiers' then
    if jsonb_typeof(p_patch->'reservation_back_tiers') <> 'array' or jsonb_array_length(p_patch->'reservation_back_tiers') > 10 then raise exception 'bad reservation_back_tiers'; end if;
    v_prev := null;
    for v_e in select * from jsonb_array_elements(p_patch->'reservation_back_tiers') loop
      if jsonb_typeof(v_e) <> 'object' or jsonb_typeof(v_e->'at') <> 'number' or jsonb_typeof(v_e->'rate') <> 'number' or (select count(*) from jsonb_object_keys(v_e)) <> 2 then raise exception 'bad reservation_back_tiers'; end if;
      if (v_e->>'at')::numeric < 0 or (v_e->>'rate')::numeric not between 0 and 100 then raise exception 'bad reservation_back_tiers'; end if;
      if v_prev is not null and (v_e->>'at')::numeric <= v_prev then raise exception 'bad reservation_back_tiers'; end if;
      v_prev := (v_e->>'at')::numeric;
    end loop;
  end if;
  if p_patch ? 'commission_tiers' and jsonb_typeof(p_patch->'commission_tiers') <> 'null' then   -- ★0202f: [{at, rate}]・at は 0 以上の整数の昇順・rate は 0〜100 の整数・10 段まで（null＝外す＝既定の表に戻る）
    if jsonb_typeof(p_patch->'commission_tiers') <> 'array' or jsonb_array_length(p_patch->'commission_tiers') not between 1 and 10 then raise exception 'bad commission_tiers'; end if;
    v_prev := null;
    for v_e in select * from jsonb_array_elements(p_patch->'commission_tiers') loop
      if jsonb_typeof(v_e) <> 'object' or coalesce(jsonb_typeof(v_e->'at'), '') <> 'number' or coalesce(jsonb_typeof(v_e->'rate'), '') <> 'number' or (select count(*) from jsonb_object_keys(v_e)) <> 2 then raise exception 'bad commission_tiers'; end if;
      if (v_e->>'at')::numeric < 0 or (v_e->>'at')::numeric <> floor((v_e->>'at')::numeric) or (v_e->>'rate')::numeric not between 0 and 100 or (v_e->>'rate')::numeric <> floor((v_e->>'rate')::numeric) then raise exception 'bad commission_tiers'; end if;
      if v_prev is not null and (v_e->>'at')::numeric <= v_prev then raise exception 'bad commission_tiers'; end if;
      v_prev := (v_e->>'at')::numeric;
    end loop;
  end if;
  v_before := to_jsonb(v_row);
  update public.comp_plans set
    pay_rate_tiers           = case when p_patch ? 'pay_rate_tiers'           then p_patch->'pay_rate_tiers' else pay_rate_tiers end,
    slide_streak_n           = case when p_patch ? 'slide_streak_n'           then (p_patch->>'slide_streak_n')::smallint else slide_streak_n end,
    reward_axis              = case when p_patch ? 'reward_axis'              then nullif(p_patch->>'reward_axis', '') else reward_axis end,
    assess_grace_months      = case when p_patch ? 'assess_grace_months'      then (p_patch->>'assess_grace_months')::smallint else assess_grace_months end,
    hon_back_unit            = case when p_patch ? 'hon_back_unit'            then p_patch->>'hon_back_unit' else hon_back_unit end,
    jonai_back_unit          = case when p_patch ? 'jonai_back_unit'          then p_patch->>'jonai_back_unit' else jonai_back_unit end,
    dohan_back_unit          = case when p_patch ? 'dohan_back_unit'          then p_patch->>'dohan_back_unit' else dohan_back_unit end,
    product_back_rate_by_kind = case when p_patch ? 'product_back_rate_by_kind' then p_patch->'product_back_rate_by_kind' else product_back_rate_by_kind end,
    product_back_fixed_vip   = case when p_patch ? 'product_back_fixed_vip'   then nullif(p_patch->>'product_back_fixed_vip', '')::int else product_back_fixed_vip end,
    product_back_rate_vip    = case when p_patch ? 'product_back_rate_vip'    then nullif(p_patch->>'product_back_rate_vip', '')::numeric else product_back_rate_vip end,
    reservation_back_tiers   = case when p_patch ? 'reservation_back_tiers'   then p_patch->'reservation_back_tiers' else reservation_back_tiers end,
    back_rate_tiers          = case when p_patch ? 'back_rate_tiers'          then p_patch->'back_rate_tiers' else back_rate_tiers end,   -- ★v2 最終（SCANDAL）
    commission_tiers         = case when p_patch ? 'commission_tiers'         then (case when jsonb_typeof(p_patch->'commission_tiers') = 'null' then null else p_patch->'commission_tiers' end) else commission_tiers end,   -- ★0202f
    updated_at = now()
  where id = p_plan_id;
  select to_jsonb(c) into v_after from public.comp_plans c where c.id = p_plan_id;
  perform public.audit_log_write('comp_plan_ext_set', 'comp_plans:' || p_plan_id::text, v_before, v_after, v_row.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.set_comp_component(p_id uuid, p_plan_id uuid, p_kind text, p_mode text, p_amount bigint, p_rate integer, p_params jsonb, p_priority integer, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan_org   uuid;
  v_plan_store uuid;
  v_id         uuid;
  v_before     jsonb;
  v_after      jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- 入力検証（表 CHECK と二段）
  if p_kind is null or p_kind not in ('guarantee_min','achievement_bonus') then
    raise exception 'bad kind';
  end if;
  if p_mode is null or p_mode not in ('amount','rate') then raise exception 'bad mode'; end if;
  if p_amount is not null and p_amount < 0 then raise exception 'bad amount'; end if;
  if (p_mode = 'amount') <> (p_amount is not null) then raise exception 'bad amount'; end if;
  if p_rate is not null and (p_rate < 0 or p_rate > 100) then raise exception 'bad rate'; end if;
  if (p_mode = 'rate') <> (p_rate is not null) then raise exception 'bad rate'; end if;
  if p_params is null or jsonb_typeof(p_params) <> 'object' then raise exception 'bad params'; end if;
  if p_kind = 'guarantee_min' and p_params ? 'unit' and coalesce(p_params->>'unit', '') not in ('month', 'day') then raise exception 'bad unit'; end if;   -- ★0202f: 日給の保証（'day'＝額 × 出勤日数・'month' と unit なし＝今のまま）
  if p_priority is null then raise exception 'bad priority'; end if;
  -- plan の org/store 照合＋ロール判定（owner のみ＝set_comp_plan の D3a と同型）
  select org_id, store_id into v_plan_org, v_plan_store
    from public.comp_plans where id = p_plan_id;
  if v_plan_org is null or v_plan_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;

  if p_id is null then
    insert into public.comp_plan_components
      (org_id, store_id, plan_id, kind, mode, amount, rate, params, priority, is_active)
    values
      (v_plan_org, v_plan_store, p_plan_id, p_kind, p_mode, p_amount, p_rate,
       p_params, p_priority, coalesce(p_is_active, true))
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(c) into v_before from public.comp_plan_components c
      where c.id = p_id and c.org_id = v_plan_org and c.plan_id = p_plan_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.comp_plan_components
       set kind = p_kind, mode = p_mode, amount = p_amount, rate = p_rate,
           params = p_params, priority = p_priority,
           is_active = coalesce(p_is_active, true), updated_at = now()
     where id = p_id;
    v_id := p_id;
  end if;
  select to_jsonb(c) into v_after from public.comp_plan_components c where c.id = v_id;
  perform public.audit_log_write('set_comp_component',
    'comp_plan_components:' || v_id::text, v_before, v_after, v_plan_store);
  return v_id;
end $function$;

commit;
