-- 0013_f2a_comp_master_rpc: F2a — 報酬設計マスタ CRUD RPC 6本（set_comp_plan/set_cast_plan/
--                           set_cast_norm/set_deduction/set_penalty_config/set_custom_back_def）
--                           ＋slide 検証内部ヘルパー1本（mig0012 スキーマの書込面）
--
-- 翻訳元:
--  - mock/nox-nightwork-app.html … 設定画面の K/sa/tm/ut/Li/zu/ot/Xa 各 setter（UI 直書込）を
--    SECURITY DEFINER RPC に置換（NOX は直書込ポリシー無し＝RPC 専任）。
--  - lib/nox/pay.ts … CompPlan/PlanOverride/Deduction/BackDef/MetricKey（引数値域の正本）。
--    overrides/cond のキーは pay.ts のリテラル（camelCase）をそのまま保存＝TS 側マッピング不要。
--
-- 0012 レビューからの持ち越し検証事項の対応（本 mig のレビュー照合点）:
--  ① slide 深い検証 … 内部ヘルパー comp_plan_slide_check（array・0〜3要素（空＝スライドなしプラン＝
--     保証時給のみを許容・意図的緩和）・各要素は at/wage の2キーのみ・整数0以上・at 昇順 strict）。
--     原則8＝公開 RPC から渡された値の検証のみ＝null guard 不要型。内部専用＝4ロール revoke。
--  ② overrides_json キー制限 … PlanOverride（Pick<CompPlan,'base'|'honBack'|'jonaiBack'|'dohanBack'>）
--     の4キーのみ許可・値は整数0以上。
--  ③ cond_json 検証 … null または {metric, min} の2キーちょうど・metric は MetricKey 8値・min は整数0以上。
--  ④ D3a ロール分岐 … set_comp_plan / set_penalty_config＝owner のみ（賃金原本）。
--     set_cast_plan / set_cast_norm / set_deduction / set_custom_back_def＝manager 以上（自店のみ）。
--  ⑤ 原則6 … 全6 RPC とも本体処理後に perform audit_log_write（例外なし）。
--  ⑥ 原則7 … set_penalty_config は全引数 null 拒否（設定行の部分 null が既定値へ黙ってリセットされる
--     事故面を RPC 入口で遮断＝coalesce を使わない）。is_active 系は set_product 前例の
--     coalesce(p_is_active, true) を踏襲（UI から明示値を渡す規約は CLAUDE.md 原則7）。
--
-- 二重防御（全 RPC 共通・CLAUDE.md）:
--  - 冒頭 null guard（auth_org_id() is null → forbidden）
--  - 入力検証 → store/cast/plan の org 照合（クロステナント遮断）→ ロール判定（auth_role() ハードコード）
--  - revoke from public, anon ＋ grant to authenticated（内部ヘルパーは4ロール revoke・grant なし）
--  - upsert は自然冪等（同値上書き・set_product 前例＝冪等キー不要）
--
-- 適用後の検証（"Success" 表示だけを信用しない）:
--   -- 0) 貼り先証明（1行返れば正・エラーなら誤貼り先＝即中断）
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- 1) prosrc 実測（7本・承認版との一字照合）
--   select proname, prosrc from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('set_comp_plan','set_cast_plan','set_cast_norm','set_deduction',
--                      'set_penalty_config','set_custom_back_def','comp_plan_slide_check')
--    order by proname;
--   -- 2) ACL 実測（公開6本＝authenticated のみ・内部1本＝grant なし（proacl に anon/authenticated/
--   --    service_role が現れないこと））
--   select proname, proacl from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('set_comp_plan','set_cast_plan','set_cast_norm','set_deduction',
--                      'set_penalty_config','set_custom_back_def','comp_plan_slide_check')
--    order by proname;
--   -- 3) 動作アンカー（JWT が要るため SQL Editor では不可・F2a-1 verify 追記コミットで実施）:
--   --    verify:nox-anon-guard … 公開6本の anon BLOCKED＋内部1本の anon/authenticated 両 BLOCKED。
--   --    verify:nox-rls … ①公開6 RPC すべてに成功経路アンカー最低1本（insert 成功→行実在・
--   --      upsert 上書き→値反映・audit_logs に action 行が増えること＝audit_log_write 呼出しと
--   --      jsonb 経路は実行時にしか検証されない・拒否系のみでは不足＝相談役指定 2026-07-03）
--   --    ②D3a 分岐（manager から set_comp_plan/set_penalty_config が forbidden・owner 成功）
--   --    ③クロス店 set_cast_plan 拒否 ④inactive プランへの set_cast_plan → 'plan inactive' 拒否
--   --    ⑤D1a 動作アンカー（castA1a=自プランのみ・castA1b=0行・manager=全行・退職 cast=0行）
--   --    ⑥staffA1: cast_plan 0行

begin;

-- ══════════════════════════════════════════════════════════════
-- 内部ヘルパー: comp_plan_slide_check（slide jsonb の深い検証・raise で拒否）
-- 原則8: 公開 RPC から渡された値で検証するだけ＝null guard 不要型（check_round_amount 型）。
-- 規則: array・要素0〜3・各要素は {at, wage} の2キーちょうど・両方 整数0以上・at は昇順 strict。
-- ══════════════════════════════════════════════════════════════
create or replace function public.comp_plan_slide_check(p_slide jsonb)
returns void language plpgsql immutable as $$
declare
  v_len  int;
  v_i    int;
  v_elem jsonb;
  v_at   numeric;
  v_wage numeric;
  v_prev numeric := null;
begin
  if p_slide is null or jsonb_typeof(p_slide) <> 'array' then raise exception 'bad slide'; end if;
  v_len := jsonb_array_length(p_slide);
  if v_len > 3 then raise exception 'bad slide'; end if;
  for v_i in 0 .. v_len - 1 loop
    v_elem := p_slide -> v_i;
    if jsonb_typeof(v_elem) <> 'object' then raise exception 'bad slide'; end if;
    if (select count(*) from jsonb_object_keys(v_elem)) <> 2
       or v_elem -> 'at' is null or v_elem -> 'wage' is null then
      raise exception 'bad slide';
    end if;
    if jsonb_typeof(v_elem -> 'at') <> 'number' or jsonb_typeof(v_elem -> 'wage') <> 'number' then
      raise exception 'bad slide';
    end if;
    v_at   := (v_elem ->> 'at')::numeric;
    v_wage := (v_elem ->> 'wage')::numeric;
    if v_at < 0 or v_at <> trunc(v_at) or v_wage < 0 or v_wage <> trunc(v_wage) then
      raise exception 'bad slide';
    end if;
    if v_prev is not null and v_at <= v_prev then raise exception 'bad slide'; end if; -- 昇順 strict
    v_prev := v_at;
  end loop;
end $$;
revoke execute on function public.comp_plan_slide_check(jsonb) from public, anon, authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- set_comp_plan（upsert・owner のみ＝D3a・賃金原本）
-- ══════════════════════════════════════════════════════════════
create or replace function public.set_comp_plan(
  p_id          uuid,
  p_store_id    uuid,
  p_name        text,
  p_base        int,
  p_hon_back    int,
  p_jonai_back  int,
  p_dohan_back  int,
  p_sales_slide jsonb,
  p_point_slide jsonb,
  p_is_active   boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  -- 入力検証（DB CHECK と二段）
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_base is null or p_base < 0 then raise exception 'bad base'; end if;
  if p_hon_back is null or p_hon_back < 0 then raise exception 'bad hon_back'; end if;
  if p_jonai_back is null or p_jonai_back < 0 then raise exception 'bad jonai_back'; end if;
  if p_dohan_back is null or p_dohan_back < 0 then raise exception 'bad dohan_back'; end if;
  perform public.comp_plan_slide_check(p_sales_slide);
  perform public.comp_plan_slide_check(p_point_slide);
  -- store の org 照合＋ロール判定（owner のみ＝D3a）
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;

  if p_id is null then
    insert into public.comp_plans
      (org_id, store_id, name, base, hon_back, jonai_back, dohan_back, sales_slide, point_slide, is_active)
    values
      (public.auth_org_id(), p_store_id, trim(p_name), p_base, p_hon_back, p_jonai_back, p_dohan_back,
       p_sales_slide, p_point_slide, coalesce(p_is_active, true))
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(c) into v_before from public.comp_plans c
      where c.id = p_id and c.org_id = public.auth_org_id() and c.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.comp_plans
      set name = trim(p_name), base = p_base, hon_back = p_hon_back, jonai_back = p_jonai_back,
          dohan_back = p_dohan_back, sales_slide = p_sales_slide, point_slide = p_point_slide,
          is_active = coalesce(p_is_active, true)
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(c) into v_after from public.comp_plans c where c.id = v_id;
  perform public.audit_log_write('set_comp_plan', 'comp_plans:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $$;
revoke execute on function public.set_comp_plan(uuid, uuid, text, int, int, int, int, jsonb, jsonb, boolean) from public, anon;
grant  execute on function public.set_comp_plan(uuid, uuid, text, int, int, int, int, jsonb, jsonb, boolean) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- set_cast_plan（upsert on PK cast_id・manager 以上・クロス店割当遮断）
-- overrides_json は PlanOverride の4キー（base/honBack/jonaiBack/dohanBack）のみ・整数0以上。
-- ══════════════════════════════════════════════════════════════
create or replace function public.set_cast_plan(
  p_cast_id   uuid,
  p_plan_id   uuid,
  p_overrides jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cast_org    uuid;
  v_cast_store  uuid;
  v_plan_org    uuid;
  v_plan_store  uuid;
  v_plan_active boolean;
  v_before      jsonb;
  v_after       jsonb;
  v_key         text;
  v_num         numeric;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  -- overrides 検証（②: キー制限＋値検証。null は {} と同義に正規化しない＝null 拒否）
  if p_overrides is null or jsonb_typeof(p_overrides) <> 'object' then raise exception 'bad overrides'; end if;
  for v_key in select jsonb_object_keys(p_overrides) loop
    if v_key not in ('base','honBack','jonaiBack','dohanBack') then raise exception 'bad overrides'; end if;
    if jsonb_typeof(p_overrides -> v_key) <> 'number' then raise exception 'bad overrides'; end if;
    v_num := (p_overrides ->> v_key)::numeric;
    if v_num < 0 or v_num <> trunc(v_num) then raise exception 'bad overrides'; end if;
  end loop;
  -- cast の org/store 照合＋ロール判定（manager 以上・自店のみ）
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- plan の org/store 照合＋inactive 遮断（廃止プランへの新規割当は誤操作経路）
  -- 既存の cast_plan 行には触れない＝プラン廃止（is_active=false）で既割当は壊れない設計。
  select org_id, store_id, is_active into v_plan_org, v_plan_store, v_plan_active
    from public.comp_plans where id = p_plan_id;
  if v_plan_org is null or v_plan_org <> public.auth_org_id() or v_plan_store <> v_cast_store then
    raise exception 'forbidden';
  end if;
  if not v_plan_active then raise exception 'plan inactive'; end if;

  select to_jsonb(cp) into v_before from public.cast_plan cp where cp.cast_id = p_cast_id;
  insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json)
  values (p_cast_id, v_cast_org, v_cast_store, p_plan_id, p_overrides)
  on conflict (cast_id) do update
    set plan_id = excluded.plan_id, overrides_json = excluded.overrides_json,
        store_id = excluded.store_id;
  select to_jsonb(cp) into v_after from public.cast_plan cp where cp.cast_id = p_cast_id;
  perform public.audit_log_write('set_cast_plan', 'cast_plan:' || p_cast_id::text, v_before, v_after, v_cast_store);
  return p_cast_id;
end $$;
revoke execute on function public.set_cast_plan(uuid, uuid, jsonb) from public, anon;
grant  execute on function public.set_cast_plan(uuid, uuid, jsonb) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- set_cast_norm（upsert on (cast_id, period)・manager 以上）
-- ══════════════════════════════════════════════════════════════
create or replace function public.set_cast_norm(
  p_cast_id      uuid,
  p_period       text,
  p_days_target  int,
  p_dohan_target int
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cast_org   uuid;
  v_cast_store uuid;
  v_id         uuid;
  v_before     jsonb;
  v_after      jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_period is null or p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  if p_days_target is null or p_days_target < 0 then raise exception 'bad days_target'; end if;
  if p_dohan_target is null or p_dohan_target < 0 then raise exception 'bad dohan_target'; end if;
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  select to_jsonb(n) into v_before from public.cast_norms n
    where n.cast_id = p_cast_id and n.period = p_period;
  insert into public.cast_norms (org_id, store_id, cast_id, period, days_target, dohan_target)
  values (v_cast_org, v_cast_store, p_cast_id, p_period, p_days_target, p_dohan_target)
  on conflict (cast_id, period) do update
    set days_target = excluded.days_target, dohan_target = excluded.dohan_target,
        store_id = excluded.store_id
  returning id into v_id;
  select to_jsonb(n) into v_after from public.cast_norms n where n.id = v_id;
  perform public.audit_log_write('set_cast_norm', 'cast_norms:' || v_id::text, v_before, v_after, v_cast_store);
  return v_id;
end $$;
revoke execute on function public.set_cast_norm(uuid, text, int, int) from public, anon;
grant  execute on function public.set_cast_norm(uuid, text, int, int) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- set_deduction（upsert・manager 以上）
-- ══════════════════════════════════════════════════════════════
create or replace function public.set_deduction(
  p_id        uuid,
  p_store_id  uuid,
  p_name      text,
  p_amount    int,
  p_per       text,
  p_is_active boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_per not in ('day','month','rate') then raise exception 'bad per'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'bad amount'; end if;
  if p_per = 'rate' and p_amount > 100 then raise exception 'bad amount'; end if; -- rate は % 値（100 超は設定ミス）
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if p_id is null then
    insert into public.deductions (org_id, store_id, name, amount, per, is_active)
    values (public.auth_org_id(), p_store_id, trim(p_name), p_amount, p_per, coalesce(p_is_active, true))
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(d) into v_before from public.deductions d
      where d.id = p_id and d.org_id = public.auth_org_id() and d.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.deductions
      set name = trim(p_name), amount = p_amount, per = p_per, is_active = coalesce(p_is_active, true)
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(d) into v_after from public.deductions d where d.id = v_id;
  perform public.audit_log_write('set_deduction', 'deductions:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $$;
revoke execute on function public.set_deduction(uuid, uuid, text, int, text, boolean) from public, anon;
grant  execute on function public.set_deduction(uuid, uuid, text, int, text, boolean) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- set_penalty_config（upsert on unique(store_id)・owner のみ＝D3a）
-- 原則7 強化: 全引数 null 拒否（設定行の部分 null が既定値へ黙ってリセットされる事故面を入口で遮断）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.set_penalty_config(
  p_store_id        uuid,
  p_fine_absent     int,
  p_fine_late       int,
  p_hours_per_shift numeric,
  p_norm_on         boolean,
  p_norm_days_flat  int,
  p_norm_days_per   int,
  p_norm_dohan_flat int,
  p_norm_dohan_per  int,
  p_late_grace_min  int,
  p_early_grace_min int,
  p_over_grace_min  int
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_fine_absent is null or p_fine_absent < 0 then raise exception 'bad fine_absent'; end if;
  if p_fine_late is null or p_fine_late < 0 then raise exception 'bad fine_late'; end if;
  if p_hours_per_shift is null or p_hours_per_shift <= 0 or p_hours_per_shift > 24 then raise exception 'bad hours_per_shift'; end if;
  if p_norm_on is null then raise exception 'bad norm_on'; end if;
  if p_norm_days_flat is null or p_norm_days_flat < 0 then raise exception 'bad norm_days_flat'; end if;
  if p_norm_days_per is null or p_norm_days_per < 0 then raise exception 'bad norm_days_per'; end if;
  if p_norm_dohan_flat is null or p_norm_dohan_flat < 0 then raise exception 'bad norm_dohan_flat'; end if;
  if p_norm_dohan_per is null or p_norm_dohan_per < 0 then raise exception 'bad norm_dohan_per'; end if;
  if p_late_grace_min is null or p_late_grace_min < 0 then raise exception 'bad late_grace_min'; end if;
  if p_early_grace_min is null or p_early_grace_min < 0 then raise exception 'bad early_grace_min'; end if;
  if p_over_grace_min is null or p_over_grace_min < 0 then raise exception 'bad over_grace_min'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;

  select to_jsonb(pc) into v_before from public.penalty_config pc where pc.store_id = p_store_id;
  insert into public.penalty_config
    (org_id, store_id, fine_absent, fine_late, hours_per_shift, norm_on,
     norm_days_flat, norm_days_per, norm_dohan_flat, norm_dohan_per,
     late_grace_min, early_grace_min, over_grace_min)
  values
    (public.auth_org_id(), p_store_id, p_fine_absent, p_fine_late, p_hours_per_shift, p_norm_on,
     p_norm_days_flat, p_norm_days_per, p_norm_dohan_flat, p_norm_dohan_per,
     p_late_grace_min, p_early_grace_min, p_over_grace_min)
  on conflict (store_id) do update
    set fine_absent = excluded.fine_absent, fine_late = excluded.fine_late,
        hours_per_shift = excluded.hours_per_shift, norm_on = excluded.norm_on,
        norm_days_flat = excluded.norm_days_flat, norm_days_per = excluded.norm_days_per,
        norm_dohan_flat = excluded.norm_dohan_flat, norm_dohan_per = excluded.norm_dohan_per,
        late_grace_min = excluded.late_grace_min, early_grace_min = excluded.early_grace_min,
        over_grace_min = excluded.over_grace_min
  returning id into v_id;
  select to_jsonb(pc) into v_after from public.penalty_config pc where pc.id = v_id;
  perform public.audit_log_write('set_penalty_config', 'penalty_config:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $$;
revoke execute on function public.set_penalty_config(uuid, int, int, numeric, boolean, int, int, int, int, int, int, int) from public, anon;
grant  execute on function public.set_penalty_config(uuid, int, int, numeric, boolean, int, int, int, int, int, int, int) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- set_custom_back_def（upsert・manager 以上）
-- cond_json は null または {metric, min} の2キーちょうど（③）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.set_custom_back_def(
  p_id        uuid,
  p_store_id  uuid,
  p_name      text,
  p_basis     text,
  p_value     int,
  p_cond      jsonb,
  p_is_active boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
  v_min    numeric;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_basis not in ('hon','jonai','dohan','days','sales','pt','champCnt','bottleCnt','flat') then
    raise exception 'bad basis';
  end if;
  if p_value is null or p_value < 0 then raise exception 'bad value'; end if;
  if p_basis = 'sales' and p_value > 100 then raise exception 'bad value'; end if; -- sales は % 値
  if p_cond is not null then
    if jsonb_typeof(p_cond) <> 'object'
       or (select count(*) from jsonb_object_keys(p_cond)) <> 2
       or p_cond -> 'metric' is null or p_cond -> 'min' is null then
      raise exception 'bad cond';
    end if;
    if jsonb_typeof(p_cond -> 'metric') <> 'string'
       or (p_cond ->> 'metric') not in ('hon','jonai','dohan','days','sales','pt','champCnt','bottleCnt') then
      raise exception 'bad cond';
    end if;
    if jsonb_typeof(p_cond -> 'min') <> 'number' then raise exception 'bad cond'; end if;
    v_min := (p_cond ->> 'min')::numeric;
    if v_min < 0 or v_min <> trunc(v_min) then raise exception 'bad cond'; end if;
  end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if p_id is null then
    insert into public.custom_back_defs (org_id, store_id, name, basis, value, cond_json, is_active)
    values (public.auth_org_id(), p_store_id, trim(p_name), p_basis, p_value, p_cond, coalesce(p_is_active, true))
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(b) into v_before from public.custom_back_defs b
      where b.id = p_id and b.org_id = public.auth_org_id() and b.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.custom_back_defs
      set name = trim(p_name), basis = p_basis, value = p_value, cond_json = p_cond,
          is_active = coalesce(p_is_active, true)
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(b) into v_after from public.custom_back_defs b where b.id = v_id;
  perform public.audit_log_write('set_custom_back_def', 'custom_back_defs:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $$;
revoke execute on function public.set_custom_back_def(uuid, uuid, text, text, int, jsonb, boolean) from public, anon;
grant  execute on function public.set_custom_back_def(uuid, uuid, text, text, int, jsonb, boolean) to authenticated;

commit;
