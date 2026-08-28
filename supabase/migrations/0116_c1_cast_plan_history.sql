-- mig0116: set_cast_plan 4引数化＝期間履歴の生成（裁定96-④・設計書 docs/NOX_C12設計書v1.1.md 挙動段）
-- 手貼り1回。再適用可（drop if exists → create or replace・ACL 毎回明示）
-- 内容: set_cast_plan(uuid,uuid,jsonb) → (uuid,uuid,jsonb,date DEFAULT NULL) へ。
--   baseline は mig0114 収蔵版の本文逐語（0114 sha ea7329108ebdf8f391e32a3736736dc0dc97f874cd5f6e2900cdffd1e6a48ccb）。
--   p_valid_from = null … 現在行の上書き（0114 と1バイト同値の経路・完全互換）
--   p_valid_from 指定 … 履歴生成: 現在行を valid_from-1日 で閉じ、新行を同日から開く。
--     拒否: 過去日（< current_date）／現在行の valid_from 以前（'bad valid_from'）。
--     現在行が無いキャストは新行のみ（閉じる対象なし）。
--   給与期間への適用は「期間開始日時点で有効な行」1本＝期中変更は翌期から（裁定96-④・
--     選択ロジックは collect.ts 側・本 mig は器のみ）。
--   ★旧3引数署名を明示 DROP → 新署名へ ACL 再適用（0062/0086/0112/0115 前例）
-- 不変: null 経路は 0114 と同値・部分 unique 2本（0114）が履歴の整合を保証。
--   money 三面鏡不触。golden 6値（5931/125802/55233/64/64/53）不変が受け入れ条件。
-- 正本: docs/NOX_C12設計書v1.1.md・docs/NOX_裁定台帳.md 裁定93/96
-- 単一トランザクション
-- 検証クエリ（適用後に別実行）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   select p.oid::regprocedure, p.pronargs from pg_proc p
--     join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='set_cast_plan';
--     -- 期待: 1本のみ・(uuid,uuid,jsonb,date)・nargs=4（旧3引数なし）
--   select proacl from pg_proc where proname='set_cast_plan';
--     -- 期待: {postgres=X,authenticated=X,service_role=X}・anon 不在
--   select proname from pg_proc where proname='set_cast_plan' and prosrc like '%bad valid_from%';
--     -- 期待: 1行
--   notify pgrst, 'reload schema';

begin;
select 'nox-project-proof' as proof, count(*) as orgs from public.orgs;

drop function if exists public.set_cast_plan(uuid, uuid, jsonb);

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
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- overrides 検証（②: キー制限＋値検証。null は {} と同義に正規化しない＝null 拒否）
  if p_overrides is null or jsonb_typeof(p_overrides) <> 'object' then raise exception 'bad overrides'; end if;
  for v_key in select jsonb_object_keys(p_overrides) loop
    if v_key not in ('base','honBack','jonaiBack','dohanBack',
                     'honBackMode','honBackRate','jonaiBackMode','jonaiBackRate') then
      raise exception 'bad overrides';
    end if;
    if v_key in ('honBackMode','jonaiBackMode') then
      -- ★mig0086: 方式キーは文字列2値
      if jsonb_typeof(p_overrides -> v_key) <> 'string'
         or (p_overrides ->> v_key) not in ('per_count','rate') then
        raise exception 'bad overrides';
      end if;
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

  select to_jsonb(cp) into v_before from public.cast_plan cp
   where cp.cast_id = p_cast_id and cp.valid_to is null;

  if p_valid_from is null then
    -- ★mig0114/0116: null＝現在行の上書き（0114 と同値の経路・完全互換）
    insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json)
    values (p_cast_id, v_cast_org, v_cast_store, p_plan_id, p_overrides)
    on conflict (cast_id) where valid_to is null do update
      set plan_id = excluded.plan_id, overrides_json = excluded.overrides_json,
          store_id = excluded.store_id;
  else
    -- ★mig0116（裁定96-④）: 履歴生成。過去日と現在行 valid_from 以前を拒否
    if p_valid_from < current_date then raise exception 'bad valid_from'; end if;
    v_cur_from := null;
    select cp.valid_from into v_cur_from from public.cast_plan cp
     where cp.cast_id = p_cast_id and cp.valid_to is null;
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

revoke all on function public.set_cast_plan(uuid, uuid, jsonb, date)
  from public, anon;
grant execute on function public.set_cast_plan(uuid, uuid, jsonb, date)
  to authenticated, service_role;

commit;
-- ===== end mig0116 =====
