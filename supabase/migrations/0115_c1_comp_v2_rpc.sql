-- mig0115: C1 §6-3 の書込 RPC＋控除種別の器（裁定86/87/90 系・設計書 docs/NOX_C12設計書v1.1.md）
-- 手貼り1回。再適用可（drop if exists → create or replace・ACL 毎回明示・add column if not exists）
-- 内容:
--   1) set_comp_plan を 14→16引数化（末尾に p_dohan_back_mode default 'per_count'／
--      p_dohan_back_rate default null）。本文は live_c1.sql
--      （全体 sha b7d10efeec5b688b309b95c42b3d608f8e4072571a7fdaaa39765be0d3fc89aa）の逐語 baseline。
--      追加は dohan の mode/rate/pair 検証（hon/jonai と同型）＋
--      ★裁定86-② 解錠ガード: p_dohan_back_mode='rate' は 'dohan rate requires R-2b' で拒否
--      （R-2b 適用時にこのガード1行を外す RPC 差替のみで解錠＝mig 増なし）＋
--      insert/update への dohan_back_mode/dohan_back_rate。
--      ★旧14引数署名を明示 DROP → 新署名へ ACL 再適用（0062/0086/0112 前例）
--   2) set_comp_component 新設（comp_plan_components の唯一の書き手）:
--      ガードは set_comp_plan と同型（null-guard → billing_writable_of → 値検証 →
--      org 照合 → owner のみ=D3a）。kind 2値・mode/amount/rate の pair（表 CHECK と二段）・
--      params object 検査・plan の org/store 整合・is_active coalesce true・audit。
--      'billing locked' ゲート入り＝課金ゲート対象
--   3) C1-2 同梱: deductions.kind 追加（6区分固定語彙・default 'agreed_cost'=送りの既定・
--      設計書 §2-4）。RPC 改修なし＝既存書込は default で現行同値。
--      receivables/advances/transport はテーブル自体が種別＝列不要。
--      → 裁定94 の分離理由（live 未取得）が解消・C1-2 は独立 mig として消滅（台帳追記）
-- 不変: p_dohan_back_* は default で旧14引数呼び出しと挙動同値。既存検証・監査・
--   mig0086/0104 由来の分岐は1バイト不変。money 三面鏡不触。golden 6値不変が受け入れ条件。
-- ★同時更新（教訓21・同 phase 必須）: 課金ゲート名簿 A7 へ set_comp_component +1
--   （対象 106→107・全数 202→203）。billing pin :97→107 / :116→107 / :135→108 /
--   :142→107（:101 除外は 96 のまま）。
-- 正本: docs/NOX_C12設計書v1.1.md §6-3・docs/NOX_裁定台帳.md 裁定86/93/94
-- 単一トランザクション
-- 検証クエリ（適用後に別実行）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   select p.oid::regprocedure, p.pronargs from pg_proc p
--     join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname in ('set_comp_plan','set_comp_component')
--    order by 1;
--     -- 期待: set_comp_plan 1本のみ（nargs=16・旧14引数なし）・set_comp_component 1本（nargs=9）
--   select p.proname, p.proacl from pg_proc p
--     join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname in ('set_comp_plan','set_comp_component');
--     -- 期待: 両方 {postgres=X,authenticated=X,service_role=X}・anon 不在
--   select proname from pg_proc where prosrc like '%billing locked%'
--    and proname in ('set_comp_plan','set_comp_component');
--     -- 期待: 2行
--   select proname from pg_proc where prosrc like '%requires R-2b%';
--     -- 期待: set_comp_plan 1行（解錠ガードの実在）
--   select column_name, column_default from information_schema.columns
--    where table_schema='public' and table_name='deductions' and column_name='kind';
--     -- 期待: 1行・default 'agreed_cost'
--   notify pgrst, 'reload schema';

begin;
select 'nox-project-proof' as proof, count(*) as orgs from public.orgs;

-- ===== 1) set_comp_plan 14→16引数化 =====
drop function if exists public.set_comp_plan(
  uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean,
  text, integer, text, integer);

CREATE OR REPLACE FUNCTION public.set_comp_plan(
  p_id uuid, p_store_id uuid, p_name text, p_base integer,
  p_hon_back integer, p_jonai_back integer, p_dohan_back integer,
  p_sales_slide jsonb, p_point_slide jsonb, p_is_active boolean,
  p_hon_back_mode text DEFAULT 'per_count'::text, p_hon_back_rate integer DEFAULT NULL::integer,
  p_jonai_back_mode text DEFAULT 'per_count'::text, p_jonai_back_rate integer DEFAULT NULL::integer,
  p_dohan_back_mode text DEFAULT 'per_count'::text, p_dohan_back_rate integer DEFAULT NULL::integer)
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
  -- ★mig0115: dohan の方式検証（hon/jonai と同型・列 CHECK と二段）
  if p_dohan_back_mode is null or p_dohan_back_mode not in ('per_count','rate') then
    raise exception 'bad dohan_back_mode';
  end if;
  if p_dohan_back_rate is not null and (p_dohan_back_rate < 0 or p_dohan_back_rate > 100) then
    raise exception 'bad dohan_back_rate';
  end if;
  if (p_dohan_back_mode = 'rate') <> (p_dohan_back_rate is not null) then
    raise exception 'bad dohan_back_rate';
  end if;
  -- ★mig0115（裁定86-②）: dohan の率化は R-2b（同伴 cast_id 必須・分母の行由来化）まで封印。
  --   解錠は本ガード1行を外す RPC 差替のみ（mig 不要）
  if p_dohan_back_mode = 'rate' then
    raise exception 'dohan rate requires R-2b';
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
       hon_back_mode, hon_back_rate, jonai_back_mode, jonai_back_rate,
       dohan_back_mode, dohan_back_rate)
    values
      (public.auth_org_id(), p_store_id, trim(p_name), p_base, p_hon_back, p_jonai_back, p_dohan_back,
       p_sales_slide, p_point_slide, coalesce(p_is_active, true),
       p_hon_back_mode, p_hon_back_rate, p_jonai_back_mode, p_jonai_back_rate,
       p_dohan_back_mode, p_dohan_back_rate)
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
          jonai_back_mode = p_jonai_back_mode, jonai_back_rate = p_jonai_back_rate,
          dohan_back_mode = p_dohan_back_mode, dohan_back_rate = p_dohan_back_rate
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(c) into v_after from public.comp_plans c where c.id = v_id;
  perform public.audit_log_write('set_comp_plan', 'comp_plans:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;

revoke all on function public.set_comp_plan(
  uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean,
  text, integer, text, integer, text, integer) from public, anon;
grant execute on function public.set_comp_plan(
  uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean,
  text, integer, text, integer, text, integer) to authenticated, service_role;

-- ===== 2) set_comp_component 新設 =====
CREATE OR REPLACE FUNCTION public.set_comp_component(
  p_id uuid,
  p_plan_id uuid,
  p_kind text,
  p_mode text,
  p_amount bigint,
  p_rate integer,
  p_params jsonb,
  p_priority integer,
  p_is_active boolean)
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

-- ★Supabase default privileges 対策（教訓43 系）: 4者から一旦 revoke → 必要2者へ grant
revoke all on function public.set_comp_component(
  uuid, uuid, text, text, bigint, integer, jsonb, integer, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_comp_component(
  uuid, uuid, text, text, bigint, integer, jsonb, integer, boolean)
  to authenticated, service_role;

-- ===== 3) C1-2 同梱: deductions.kind（6区分固定語彙・裁定87/94） =====
alter table public.deductions
  add column if not exists kind text not null default 'agreed_cost'
    check (kind in ('unworked','sanction','statutory','agreed_cost',
                    'store_receivable','advance_settlement'));

commit;
-- ===== end mig0115 =====
