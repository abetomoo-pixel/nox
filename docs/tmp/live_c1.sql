-- docs/tmp/live_c1.sql — C1-1 起草の底本（set_comp_plan/set_cast_plan 全文＋関連スキーマ実測）
-- 貼り先証明: {"t":"nox-project-proof","n":3} / 取得日 2026-08-28 / dev DB mig0001〜0113
-- pg_get_functiondef 逐語（LF 正規化のみ）

-- ============ 1. 書換対象 RPC（overload・proacl・全文） ============

-- ──────── set_comp_plan（overload 1 本） ────────
--   set_comp_plan(uuid,uuid,text,integer,integer,integer,integer,jsonb,jsonb,boolean,text,integer,text,integer)  nargs=14  secdef=true  acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}  cfg={search_path=public}
CREATE OR REPLACE FUNCTION public.set_comp_plan(p_id uuid, p_store_id uuid, p_name text, p_base integer, p_hon_back integer, p_jonai_back integer, p_dohan_back integer, p_sales_slide jsonb, p_point_slide jsonb, p_is_active boolean, p_hon_back_mode text DEFAULT 'per_count'::text, p_hon_back_rate integer DEFAULT NULL::integer, p_jonai_back_mode text DEFAULT 'per_count'::text, p_jonai_back_rate integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- 入力検証（DB CHECK と二段）
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_base is null or p_base < 0 then raise exception 'bad base'; end if;
  if p_hon_back is null or p_hon_back < 0 then raise exception 'bad hon_back'; end if;
  if p_jonai_back is null or p_jonai_back < 0 then raise exception 'bad jonai_back'; end if;
  if p_dohan_back is null or p_dohan_back < 0 then raise exception 'bad dohan_back'; end if;
  -- ★mig0086: 方式（円/本｜率）検証＝列 CHECK と同値を RPC 権威でも実施
  if p_hon_back_mode is null or p_hon_back_mode not in ('per_count','rate') then
    raise exception 'bad hon_back_mode';
  end if;
  if p_hon_back_rate is not null and (p_hon_back_rate < 0 or p_hon_back_rate > 100) then
    raise exception 'bad hon_back_rate';
  end if;
  if (p_hon_back_mode = 'rate') <> (p_hon_back_rate is not null) then
    raise exception 'bad hon_back_rate';
  end if;
  if p_jonai_back_mode is null or p_jonai_back_mode not in ('per_count','rate') then
    raise exception 'bad jonai_back_mode';
  end if;
  if p_jonai_back_rate is not null and (p_jonai_back_rate < 0 or p_jonai_back_rate > 100) then
    raise exception 'bad jonai_back_rate';
  end if;
  if (p_jonai_back_mode = 'rate') <> (p_jonai_back_rate is not null) then
    raise exception 'bad jonai_back_rate';
  end if;
  perform public.comp_plan_slide_check(p_sales_slide);
  perform public.comp_plan_slide_check(p_point_slide);
  -- store の org 照合＋ロール判定（owner のみ＝D3a）
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  -- ★mig0104（裁定77）: 同店内の名前重複（大小無視）を拒否＝cast_ranks の duplicate name と同型
  if exists (select 1 from public.comp_plans c
              where c.store_id = p_store_id
                and lower(c.name) = lower(trim(p_name))
                and c.id is distinct from p_id) then
    raise exception 'duplicate name';
  end if;

  if p_id is null then
    insert into public.comp_plans
      (org_id, store_id, name, base, hon_back, jonai_back, dohan_back, sales_slide, point_slide, is_active,
       hon_back_mode, hon_back_rate, jonai_back_mode, jonai_back_rate)
    values
      (public.auth_org_id(), p_store_id, trim(p_name), p_base, p_hon_back, p_jonai_back, p_dohan_back,
       p_sales_slide, p_point_slide, coalesce(p_is_active, true),
       p_hon_back_mode, p_hon_back_rate, p_jonai_back_mode, p_jonai_back_rate)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(c) into v_before from public.comp_plans c
      where c.id = p_id and c.org_id = public.auth_org_id() and c.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.comp_plans
      set name = trim(p_name), base = p_base, hon_back = p_hon_back, jonai_back = p_jonai_back,
          dohan_back = p_dohan_back, sales_slide = p_sales_slide, point_slide = p_point_slide,
          is_active = coalesce(p_is_active, true),
          hon_back_mode = p_hon_back_mode, hon_back_rate = p_hon_back_rate,
          jonai_back_mode = p_jonai_back_mode, jonai_back_rate = p_jonai_back_rate
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(c) into v_after from public.comp_plans c where c.id = v_id;
  perform public.audit_log_write('set_comp_plan', 'comp_plans:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$



-- ──────── set_cast_plan（overload 1 本） ────────
--   set_cast_plan(uuid,uuid,jsonb)  nargs=3  secdef=true  acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}  cfg={search_path=public}
CREATE OR REPLACE FUNCTION public.set_cast_plan(p_cast_id uuid, p_plan_id uuid, p_overrides jsonb)
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

  select to_jsonb(cp) into v_before from public.cast_plan cp where cp.cast_id = p_cast_id;
  insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json)
  values (p_cast_id, v_cast_org, v_cast_store, p_plan_id, p_overrides)
  on conflict (cast_id) do update
    set plan_id = excluded.plan_id, overrides_json = excluded.overrides_json,
        store_id = excluded.store_id;
  select to_jsonb(cp) into v_after from public.cast_plan cp where cp.cast_id = p_cast_id;
  perform public.audit_log_write('set_cast_plan', 'cast_plan:' || p_cast_id::text, v_before, v_after, v_cast_store);
  return p_cast_id;
end $function$


-- ============ 2. スキーマ全列（ordinal_position 順） ============
-- ── comp_plans（17 列） ──
--   # 1 id                   uuid                       null=NO default=gen_random_uuid()
--   # 2 org_id               uuid                       null=NO default=-
--   # 3 store_id             uuid                       null=NO default=-
--   # 4 name                 text                       null=NO default=-
--   # 5 base                 integer                    null=NO default=0
--   # 6 hon_back             integer                    null=NO default=0
--   # 7 jonai_back           integer                    null=NO default=0
--   # 8 dohan_back           integer                    null=NO default=0
--   # 9 sales_slide          jsonb                      null=NO default='[]'::jsonb
--   #10 point_slide          jsonb                      null=NO default='[]'::jsonb
--   #11 is_active            boolean                    null=NO default=true
--   #12 created_at           timestamp with time zone   null=NO default=now()
--   #13 updated_at           timestamp with time zone   null=NO default=now()
--   #14 hon_back_mode        text                       null=NO default='per_count'::text
--   #15 hon_back_rate        integer                    null=YES default=-
--   #16 jonai_back_mode      text                       null=NO default='per_count'::text
--   #17 jonai_back_rate      integer                    null=YES default=-
-- ── cast_plan（7 列） ──
--   # 1 cast_id              uuid                       null=NO default=-
--   # 2 org_id               uuid                       null=NO default=-
--   # 3 store_id             uuid                       null=NO default=-
--   # 4 plan_id              uuid                       null=NO default=-
--   # 5 overrides_json       jsonb                      null=NO default='{}'::jsonb
--   # 6 created_at           timestamp with time zone   null=NO default=now()
--   # 7 updated_at           timestamp with time zone   null=NO default=now()
-- ── cast_norms（11 列） ──
--   # 1 id                   uuid                       null=NO default=gen_random_uuid()
--   # 2 org_id               uuid                       null=NO default=-
--   # 3 store_id             uuid                       null=NO default=-
--   # 4 cast_id              uuid                       null=NO default=-
--   # 5 period               text                       null=NO default=-
--   # 6 days_target          integer                    null=NO default=0
--   # 7 dohan_target         integer                    null=NO default=0
--   # 8 created_at           timestamp with time zone   null=NO default=now()
--   # 9 updated_at           timestamp with time zone   null=NO default=now()
--   #10 sales_target         bigint                     null=NO default=0
--   #11 shimei_target        integer                    null=NO default=0
-- ── stores の receivable/policy 系列名 grep: 0 件 ──
--   （0件＝receivable_policy 列は未作成・裁定89 の器は C1 で新設）

-- ============ 3. comp_plans の RLS（mig0105＝comp_plan_components が継承すべき現物） ============
-- policy: comp_plans_select  cmd=SELECT  roles="{authenticated}"
--   qual: ((org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR ((auth_role() = 'manager'::text) AND (store_id = auth_store_id())) OR ((auth_role() = 'cast'::text) AND (store_id = auth_store_id()) AND (EXISTS ( SELECT 1    FROM cast_plan cp   WHERE ((cp.cast_id = auth_cast_id()) AND (cp.plan_id = comp_plans.id)))))))
--   with_check: -
-- grants: authenticated=SELECT, service_role=DELETE, service_role=INSERT, service_role=REFERENCES, service_role=SELECT, service_role=TRIGGER, service_role=TRUNCATE, service_role=UPDATE
