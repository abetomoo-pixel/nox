-- 0205 本体（単一トランザクション）
-- 0205_jst_dates 版 2（起票145・起票147 案 A・相談役 11/24 2:20 の ■2・2026-11-24 起草・未適用＝相談役が本体を読んでから合図）
-- 翻訳元: 本番の pg_get_functiondef（2026-11-24 読取）＝本体はそのまま・次だけを替えた（生成器 docs/tmp/0205/gen_0205.cjs）
--   営業日の今日（今ある public.biz_date_of(店, now())＝店の締めの時刻で切り替わる日）: set_cast_plan の今日・set_cast_guarantee の保証の開始日の下限
--   set_cast_plan を起票147 の案 A に: 日付なし＝営業日の月の 1 日から（開いた行が今月の 1 日以降に始まれば上書き・前なら前の月の末日で閉じて今月の 1 日から）・
--     日付の下限＝最後に確定した期の翌日（確定済みは 'period finalized'）・今月がもう確定済みなら日付なしも断る・開いた行の開始日以前は今までどおり断る
--   暦の JST の今日 (now() at time zone 'Asia/Tokyo')::date: withholding_rate_of・customer_anonymize_candidates・customer_list_summary
--   cast_plan.valid_from の列の既定（CURRENT_DATE）は替えない: 列の既定は行の店を読めない＝営業日にできない。版 2 の set_cast_plan は開始日を必ず渡す＝関数から既定を使う道は無くなる（検証で確かめる）
-- 貼る前: 0205_precheck.sql（読むだけ）・貼った後: 0205_verify.sql（先頭に貼り先証明）

begin;
set local lock_timeout = '5s';

-- ── set_cast_plan(uuid, uuid, jsonb, date)：営業日・案 A（ほかは本番の本体のまま・権限は CREATE OR REPLACE で保たれる）
CREATE OR REPLACE FUNCTION public.set_cast_plan(p_cast_id uuid, p_plan_id uuid, p_overrides jsonb, p_valid_from date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_cur_from    date;  -- ★mig0116: 現在行の valid_from
  v_emp         text;  -- ★5 0154: casts.employment（'委託'|'雇用'|null）
  v_rule        text;  -- ★5 0154: pay_rule（欠損＝'actual'）
  v_today       date;  -- ★0205 v2: 営業日の今日（biz_date_of＝店の締めの時刻で切り替わる日）
  v_month1      date;  -- ★0205 v2: 営業日の月の 1 日（日付なしの開始日）
  v_last_end    date;  -- ★0205 v2: 自店で最後に確定した期の末日（set_cast_employment と同じ取り方）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- overrides 検証（②: キー制限＋値検証。null は {} と同義に正規化しない＝null 拒否）
  if p_overrides is null or jsonb_typeof(p_overrides) <> 'object' then raise exception 'bad overrides'; end if;
  for v_key in select jsonb_object_keys(p_overrides) loop
    if v_key not in ('base','honBack','jonaiBack','dohanBack',
                     'honBackMode','honBackRate','jonaiBackMode','jonaiBackRate',   -- ★5 0154: 末尾 ') then' → ','（3 キーを続ける）
                     'pay_rule','per_shift_amount','fixed_amount',                    -- ★5 0154: 裁定294-5 の 3 キー（0153 ★8: 末尾 ') then' → ','）
                     'productBackFixedHon','productBackFixedJonai','productBackFixedFree') then   -- ★8 0153: 裁定305-12 の 3 キー（number ≥0 整数＝既存分岐）
      raise exception 'bad overrides';
    end if;
    if v_key in ('honBackMode','jonaiBackMode') then
      -- ★mig0086: 方式キーは文字列2値
      if jsonb_typeof(p_overrides -> v_key) <> 'string'
         or (p_overrides ->> v_key) not in ('per_count','rate') then
        raise exception 'bad overrides';
      end if;
    elsif v_key = 'pay_rule' then                                                     -- ★5 0154: 報酬型キーは文字列 4 値（honBackMode と同型）
      if jsonb_typeof(p_overrides -> v_key) <> 'string'                                -- ★5
         or (p_overrides ->> v_key) not in ('actual','shift_guarantee','fixed','per_shift') then   -- ★5
        raise exception 'bad overrides';                                                -- ★5
      end if;                                                                           -- ★5
    else
      if jsonb_typeof(p_overrides -> v_key) <> 'number' then raise exception 'bad overrides'; end if;
      v_num := (p_overrides ->> v_key)::numeric;
      if v_num < 0 or v_num <> trunc(v_num) then raise exception 'bad overrides'; end if;
      -- ★mig0086: 率キーは 0..100
      if v_key in ('honBackRate','jonaiBackRate') and v_num > 100 then
        raise exception 'bad overrides';
      end if;
    end if;
  end loop;
  -- ★mig0086: 原子性（設計v1）＝mode だけ上書きして値が plan 側から来る合成を拒否。
  --   mode='rate' → rate 必須／mode='per_count' → 円/本値必須／rate 単独（mode なし・mode≠rate）拒否。
  if (p_overrides ? 'honBackMode') then
    if (p_overrides ->> 'honBackMode') = 'rate' and not (p_overrides ? 'honBackRate') then
      raise exception 'bad overrides';
    end if;
    if (p_overrides ->> 'honBackMode') = 'per_count' and not (p_overrides ? 'honBack') then
      raise exception 'bad overrides';
    end if;
  end if;
  if (p_overrides ? 'honBackRate')
     and (not (p_overrides ? 'honBackMode') or (p_overrides ->> 'honBackMode') <> 'rate') then
    raise exception 'bad overrides';
  end if;
  if (p_overrides ? 'jonaiBackMode') then
    if (p_overrides ->> 'jonaiBackMode') = 'rate' and not (p_overrides ? 'jonaiBackRate') then
      raise exception 'bad overrides';
    end if;
    if (p_overrides ->> 'jonaiBackMode') = 'per_count' and not (p_overrides ? 'jonaiBack') then
      raise exception 'bad overrides';
    end if;
  end if;
  if (p_overrides ? 'jonaiBackRate')
     and (not (p_overrides ? 'jonaiBackMode') or (p_overrides ->> 'jonaiBackMode') <> 'rate') then
    raise exception 'bad overrides';
  end if;
  -- cast の org/store 照合＋ロール判定（manager 以上・自店のみ）
  select org_id, store_id, employment into v_cast_org, v_cast_store, v_emp from public.casts where id = p_cast_id;   -- ★5 0154: employment を併読
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
  -- ★5 0154（裁定294-5）: 報酬型 × 雇用区分（shift_guarantee／fixed＝雇用のみ・per_shift＝委託のみ・欠損＝'actual'＝検査なし）
  v_rule := coalesce(p_overrides ->> 'pay_rule', 'actual');                                                                 -- ★5
  if v_rule in ('shift_guarantee','fixed') and v_emp is distinct from '雇用' then raise exception 'bad pay_rule for employment'; end if;   -- ★5
  if v_rule = 'per_shift' and v_emp is distinct from '委託' then raise exception 'bad pay_rule for employment'; end if;                    -- ★5

  select to_jsonb(cp) into v_before from public.cast_plan cp
   where cp.cast_id = p_cast_id and cp.valid_to is null;

  -- ★0205 v2（起票147 案 A・相談役 11/24 2:20）: 今日＝営業日（biz_date_of）。日付なし＝営業日の月の 1 日から。日付の下限＝最後に確定した期の翌日。
  v_today  := public.biz_date_of(v_cast_store, now());
  v_month1 := date_trunc('month', v_today)::date;
  select max(coalesce(r.period_end, pb.period_end)) into v_last_end
    from public.payroll_runs r, lateral public.period_bounds(r.period) pb
   where r.store_id = v_cast_store and r.status in ('finalized','paid');
  v_cur_from := null;
  select cp.valid_from into v_cur_from from public.cast_plan cp
   where cp.cast_id = p_cast_id and cp.valid_to is null;

  if p_valid_from is null then
    -- ★0205 v2: 日付なし＝今月（営業日の月）の 1 日から。今月の 1 日が確定済みの期に入る（今月がもう確定済み）なら断る
    if v_last_end is not null and v_month1 <= v_last_end then raise exception 'period finalized'; end if;
    if v_cur_from is null then
      -- 行が無い人（初期設定など）＝今月の 1 日から 1 行（閉じた行が今月にかかるときは、その翌日から）
      insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json, valid_from)
      values (p_cast_id, v_cast_org, v_cast_store, p_plan_id, p_overrides,
              greatest(v_month1, coalesce((select max(cp.valid_to) + 1 from public.cast_plan cp where cp.cast_id = p_cast_id), v_month1)));
    elsif v_cur_from >= v_month1 then
      -- 開いた行が今月の 1 日以降に始まる＝その場で上書き（前の月に掛からない）
      update public.cast_plan
         set plan_id = p_plan_id, overrides_json = p_overrides, store_id = v_cast_store, updated_at = now()
       where cast_id = p_cast_id and valid_to is null;
    else
      -- それより前に始まる＝前の月の末日で閉じて、今月の 1 日から新しい行（確定していない前の月の下書きは変えない）
      update public.cast_plan
         set valid_to = v_month1 - 1, updated_at = now()
       where cast_id = p_cast_id and valid_to is null;
      insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json, valid_from)
      values (p_cast_id, v_cast_org, v_cast_store, p_plan_id, p_overrides, v_month1);
    end if;
  else
    -- ★mig0116（裁定96-④）: 履歴生成。★0205 v2: 下限＝最後に確定した期の翌日（今日より前でも、確定していない期なら選べる）。開いた行の開始日以前は今までどおり断る
    if v_last_end is not null and p_valid_from <= v_last_end then raise exception 'period finalized'; end if;
    if v_cur_from is not null then
      if p_valid_from <= v_cur_from then raise exception 'bad valid_from'; end if;
      update public.cast_plan
         set valid_to = p_valid_from - 1, updated_at = now()
       where cast_id = p_cast_id and valid_to is null;
    end if;
    insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json, valid_from)
    values (p_cast_id, v_cast_org, v_cast_store, p_plan_id, p_overrides, p_valid_from);
  end if;

  select to_jsonb(cp) into v_after from public.cast_plan cp
   where cp.cast_id = p_cast_id and cp.valid_to is null;
  perform public.audit_log_write('set_cast_plan', 'cast_plan:' || p_cast_id::text, v_before, v_after, v_cast_store);
  return p_cast_id;
end $function$;

-- ── set_cast_guarantee(uuid, integer, date, date)：営業日（ほかは本番の本体のまま・権限は CREATE OR REPLACE で保たれる）
CREATE OR REPLACE FUNCTION public.set_cast_guarantee(p_cast_id uuid, p_amount integer, p_start date, p_end date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast_org    uuid;
  v_cast_store  uuid;
  v_plan_org    uuid;
  v_plan_store  uuid;
  v_plan_active boolean;
  v_before      jsonb;
  v_after       jsonb;
  v_c           public.cast_plan%rowtype;   -- ★3 0151: 現在行 C（valid_to is null・for update）
  v_prev        public.cast_plan%rowtype;   -- ★3 0151: C の直前の非保証行（guarantee が true でない・valid_from 降順の先頭）
  v_back_ov     jsonb;                       -- ★3 0151: 戻し行の overrides_json
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- ★3 0151（裁定287-3）: 引数検証（overrides 検証ループは p_overrides が無いため写さない）
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  if p_start is null or p_start < public.biz_date_of((select c.store_id from public.casts c where c.id = p_cast_id), now()) then raise exception 'bad valid_from'; end if;   -- ★0205 v2: 下限＝営業日の今日（店の締めの時刻・人が無いときは biz_date_of が 'forbidden'）
  if p_end is null or p_end < p_start then raise exception 'bad valid_to'; end if;
  -- cast の org/store 照合＋ロール判定（manager 以上・自店のみ）
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- ★3 0151: 現在行 C（valid_to is null）を for update で特定。無ければ 'no plan'
  select * into v_c from public.cast_plan cp
   where cp.cast_id = p_cast_id and cp.valid_to is null
   for update;
  if v_c.id is null then raise exception 'no plan'; end if;
  -- plan の org/store 照合＋inactive 遮断（set_cast_plan と同じ・plan は C と同じ）
  select org_id, store_id, is_active into v_plan_org, v_plan_store, v_plan_active
    from public.comp_plans where id = v_c.plan_id;   -- ★3 0151: plan は C と同じ
  if v_plan_org is null or v_plan_org <> public.auth_org_id() or v_plan_store <> v_cast_store then
    raise exception 'forbidden';
  end if;
  if not v_plan_active then raise exception 'plan inactive'; end if;

  -- ★3 0151（裁定289-6）: 'guarantee exists'＝①p_start〜p_end と重なる別の保証行（valid_to null か valid_to >= p_start、かつ valid_from <= p_end）
  --   または ②valid_from > p_start の別の保証行（既存の予定より前に差し込めない）。C 自身は除く。延長＝前の保証行の valid_to < p_start かつ後続なし＝通る
  if exists (select 1 from public.cast_plan cp
              where cp.cast_id = p_cast_id and cp.id <> v_c.id
                and coalesce(cp.overrides_json->>'guarantee', '') = 'true'
                and (((cp.valid_to is null or cp.valid_to >= p_start) and cp.valid_from <= p_end)
                     or cp.valid_from > p_start)) then
    raise exception 'guarantee exists';
  end if;
  if p_start < v_c.valid_from then raise exception 'bad valid_from'; end if;   -- ★3 (c)

  select to_jsonb(cp) into v_before from public.cast_plan cp
   where cp.cast_id = p_cast_id and cp.valid_to is null;

  -- ★3 0151: 戻し行の overrides_json＝C と同じ。C 自身が保証行なら guarantee を外し base を直前の非保証行の値に戻す（無ければ base キーを外す）
  if coalesce(v_c.overrides_json->>'guarantee', '') = 'true' then
    select * into v_prev from public.cast_plan cp
     where cp.cast_id = p_cast_id and cp.valid_from < v_c.valid_from
       and coalesce(cp.overrides_json->>'guarantee', '') <> 'true'
     order by cp.valid_from desc
     limit 1;
    v_back_ov := (v_c.overrides_json - 'guarantee') - 'base';
    if v_prev.id is not null and (v_prev.overrides_json ? 'base') then
      v_back_ov := v_back_ov || jsonb_build_object('base', v_prev.overrides_json->'base');
    end if;
  else
    v_back_ov := v_c.overrides_json;
  end if;

  if p_start > v_c.valid_from then
    -- ★3 (a): C を p_start-1 で閉じ、保証行を insert
    update public.cast_plan
       set valid_to = p_start - 1, updated_at = now()
     where id = v_c.id;
    insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json, valid_from, valid_to)
    values (p_cast_id, v_cast_org, v_cast_store, v_c.plan_id,
            v_c.overrides_json || jsonb_build_object('base', p_amount, 'guarantee', true), p_start, p_end);
  else
    -- ★3 (b): p_start = C.valid_from＝C を保証行に書き換える
    update public.cast_plan
       set valid_to = p_end,
           overrides_json = v_c.overrides_json || jsonb_build_object('base', p_amount, 'guarantee', true),
           updated_at = now()
     where id = v_c.id;
  end if;
  -- ★3: 戻し行（valid_from = p_end+1・valid_to null・plan と overrides は C と同じ＝上の規則）
  insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json, valid_from)
  values (p_cast_id, v_cast_org, v_cast_store, v_c.plan_id, v_back_ov, p_end + 1);

  select to_jsonb(cp) into v_after from public.cast_plan cp
   where cp.cast_id = p_cast_id and cp.valid_to is null;
  perform public.audit_log_write('set_cast_guarantee', 'cast_plan:' || p_cast_id::text, v_before, v_after, v_cast_store);
  return p_cast_id;
end $function$;

-- ── withholding_rate_of(text, date)：暦の JST（ほかは本番の本体のまま・権限は CREATE OR REPLACE で保たれる）
CREATE OR REPLACE FUNCTION public.withholding_rate_of(p_kind text, p_pay_date date)
 RETURNS withholding_rates
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
-- ★0188（裁定433 ①）: 支払日に有効な税率表の行（valid_from ≤ 支払日 の最新）。無ければ null
  select r.* from public.withholding_rates r
   where r.kind = p_kind and r.valid_from <= coalesce(p_pay_date, (now() at time zone 'Asia/Tokyo')::date)
   order by r.valid_from desc limit 1
$function$;

-- ── customer_anonymize_candidates(uuid)：暦の JST（ほかは本番の本体のまま・権限は CREATE OR REPLACE で保たれる）
CREATE OR REPLACE FUNCTION public.customer_anonymize_candidates(p_store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(customer_id uuid, store_id uuid, name text, last_visit_at timestamp with time zone, retention_until date, is_active boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  return query
    select cu.id, cu.store_id, cu.name, cu.last_visit_at, cu.retention_until, cu.is_active
      from public.customers cu
     where cu.org_id = public.auth_org_id()
       and (p_store_id is null or cu.store_id = p_store_id)
       and cu.anonymized_at is null
       and cu.retention_until is not null
       and cu.retention_until <= (now() at time zone 'Asia/Tokyo')::date
     order by cu.retention_until, cu.name;
end $function$;

-- ── customer_list_summary(uuid, boolean)：暦の JST（ほかは本番の本体のまま・権限は CREATE OR REPLACE で保たれる）
CREATE OR REPLACE FUNCTION public.customer_list_summary(p_store_id uuid DEFAULT NULL::uuid, p_include_dormant boolean DEFAULT false)
 RETURNS TABLE(customer_id uuid, name text, furigana text, cast_id uuid, is_active boolean, visits integer, last_visit timestamp with time zone, total_spend bigint, active_bottles integer, open_receivable bigint, days_since integer, churn_tier text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_store uuid := public.auth_store_id();
  v_cast  uuid := public.auth_cast_id();
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  return query
  with visible as (
    select cu.*
    from public.customers cu
    where cu.org_id = v_org
      and (v_role = 'owner' or cu.store_id = v_store)           -- 店スコープ
      and (
        v_role in ('owner','manager')
        or (v_role = 'staff' and public.auth_staff_can_crm())
        or (v_role = 'cast'  and cu.cast_id = v_cast)            -- 担当客のみ
      )
      and (p_store_id is null or cu.store_id = p_store_id)       -- owner の店絞り込み任意
      and (cu.is_active or (p_include_dormant and v_role <> 'cast'))  -- 休眠込みは owner/manager のみ・cast には返さない
  ),
  agg as (
    select
      v.id, v.name, v.furigana, v.cast_id, v.is_active,
      (select count(*)::int from public.checks c
         where c.customer_id = v.id and c.status = 'closed') as visits,
      (select max(c.started_at) from public.checks c
         where c.customer_id = v.id and c.status = 'closed') as last_visit,
      (select coalesce(sum(c.total), 0)::bigint from public.checks c
         where c.customer_id = v.id and c.status = 'closed') as total_spend,
      (select count(*)::int from public.bottle_keeps b
         where b.customer_id = v.id and b.status = 'active') as active_bottles,
      (select coalesce(sum(r.amount), 0)::bigint from public.receivables r
         where r.customer_id = v.id and r.status = 'open') as open_receivable
    from visible v
  )
  select
    a.id, a.name, a.furigana, a.cast_id, a.is_active,
    a.visits, a.last_visit, a.total_spend, a.active_bottles, a.open_receivable,
    case when a.last_visit is null then null
         else ((now() at time zone 'Asia/Tokyo')::date - a.last_visit::date) end as days_since,
    case
      when a.last_visit is null then 'none'
      when ((now() at time zone 'Asia/Tokyo')::date - a.last_visit::date) >= 60 then 'high'
      when ((now() at time zone 'Asia/Tokyo')::date - a.last_visit::date) >= 30 then 'mid'
      else 'none'
    end as churn_tier
  from agg a
  order by a.last_visit desc nulls last;
end $function$;

commit;
