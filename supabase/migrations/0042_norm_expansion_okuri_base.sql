-- 0042_norm_expansion_okuri_base.sql
-- ノルマ拡張（売上・指名の2軸追加＝表示のみ・payOf/normPenalty非接続）+ 送りベース額（店設定）
-- 裁定: 未達は表示のみ（罰金非接続）・pay golden 83 不変が回帰ゲート
-- 構成: 再適用可（if not exists / or replace / drop if exists）だが手貼りは1回

begin;

-- ============================================================
-- 1) cast_norms: 新2軸（表示専用列・collect.ts の normByCast には載せない）
-- ============================================================
alter table public.cast_norms
  add column if not exists sales_target bigint not null default 0 check (sales_target >= 0);
alter table public.cast_norms
  add column if not exists shimei_target integer not null default 0 check (shimei_target >= 0);

-- ============================================================
-- 2) set_cast_norm: 4引数版を破棄→6引数版へ置換
--    （or replace のみだと旧シグネチャがオーバーロード残存するため drop 必須）
-- ============================================================
drop function if exists public.set_cast_norm(uuid, text, integer, integer);

create or replace function public.set_cast_norm(
  p_cast_id uuid, p_period text,
  p_days_target integer, p_dohan_target integer,
  p_sales_target bigint, p_shimei_target integer
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if p_sales_target is null or p_sales_target < 0 then raise exception 'bad sales_target'; end if;
  if p_shimei_target is null or p_shimei_target < 0 then raise exception 'bad shimei_target'; end if;
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  select to_jsonb(n) into v_before from public.cast_norms n
    where n.cast_id = p_cast_id and n.period = p_period;
  insert into public.cast_norms
    (org_id, store_id, cast_id, period, days_target, dohan_target, sales_target, shimei_target)
  values
    (v_cast_org, v_cast_store, p_cast_id, p_period, p_days_target, p_dohan_target, p_sales_target, p_shimei_target)
  on conflict (cast_id, period) do update
    set days_target   = excluded.days_target,
        dohan_target  = excluded.dohan_target,
        sales_target  = excluded.sales_target,
        shimei_target = excluded.shimei_target,
        store_id      = excluded.store_id
  returning id into v_id;
  select to_jsonb(n) into v_after from public.cast_norms n where n.id = v_id;
  perform public.audit_log_write('set_cast_norm', 'cast_norms:' || v_id::text, v_before, v_after, v_cast_store);
  return v_id;
end $function$;

revoke all on function public.set_cast_norm(uuid, text, integer, integer, bigint, integer) from public, anon;
grant execute on function public.set_cast_norm(uuid, text, integer, integer, bigint, integer) to authenticated;

-- ============================================================
-- 3) set_store_norm_config: 店採用フラグ×2 + 指名カウント定義（owner 限定）
--    settings_json キー: sales_norm_enabled / shimei_norm_enabled / shimei_norm_scope
--    scope: 'hon'（本指名のみ・既定）| 'hon_jonai'（場内+本指名）
-- ============================================================
create or replace function public.set_store_norm_config(
  p_store_id uuid, p_sales_enabled boolean, p_shimei_enabled boolean, p_shimei_scope text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_store  record;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_sales_enabled is null then raise exception 'bad sales_enabled'; end if;
  if p_shimei_enabled is null then raise exception 'bad shimei_enabled'; end if;
  if p_shimei_scope is null or p_shimei_scope not in ('hon','hon_jonai') then raise exception 'bad shimei_scope'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（okuri_mode と同格）

  v_before := jsonb_build_object(
    'sales_norm_enabled',  coalesce(v_store.settings_json->>'sales_norm_enabled', '') = 'true',
    'shimei_norm_enabled', coalesce(v_store.settings_json->>'shimei_norm_enabled', '') = 'true',
    'shimei_norm_scope',   coalesce(nullif(trim(v_store.settings_json->>'shimei_norm_scope'), ''), 'hon')
  );
  update public.stores
     set settings_json =
       jsonb_set(
         jsonb_set(
           jsonb_set(coalesce(settings_json, '{}'::jsonb),
             '{sales_norm_enabled}',  to_jsonb(p_sales_enabled),  true),
           '{shimei_norm_enabled}', to_jsonb(p_shimei_enabled), true),
         '{shimei_norm_scope}',   to_jsonb(p_shimei_scope),   true)
   where id = p_store_id;
  v_after := jsonb_build_object(
    'sales_norm_enabled',  p_sales_enabled,
    'shimei_norm_enabled', p_shimei_enabled,
    'shimei_norm_scope',   p_shimei_scope
  );
  perform public.audit_log_write('set_store_norm_config', 'stores:' || p_store_id::text, v_before, v_after, p_store_id);
end $function$;

revoke all on function public.set_store_norm_config(uuid, boolean, boolean, text) from public, anon;
grant execute on function public.set_store_norm_config(uuid, boolean, boolean, text) to authenticated;

-- ============================================================
-- 4) set_store_okuri_base: 送りベース額（owner 限定・UI プリフィル専用）
--    settings_json キー: okuri_base_amount（int・既定 0＝未設定）
--    ※ transport_issue / okuriPlan / payOf は一切無改変（額は発行時に都度確定のまま）
-- ============================================================
create or replace function public.set_store_okuri_base(
  p_store_id uuid, p_amount integer
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_store record;
  v_prev  text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'bad amount'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（okuri_mode と同格）

  v_prev := coalesce(nullif(trim(v_store.settings_json->>'okuri_base_amount'), ''), '0');
  update public.stores
     set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{okuri_base_amount}', to_jsonb(p_amount), true)
   where id = p_store_id;

  perform public.audit_log_write('set_store_okuri_base', 'stores:' || p_store_id::text,
    jsonb_build_object('okuri_base_amount', v_prev), jsonb_build_object('okuri_base_amount', p_amount), p_store_id);
end $function$;

revoke all on function public.set_store_okuri_base(uuid, integer) from public, anon;
grant execute on function public.set_store_okuri_base(uuid, integer) to authenticated;

commit;
