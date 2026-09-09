-- 0135_c1_feature_flags_audit_reason.sql
-- C層① 機能フラグ器(設計書 v1・裁定179〜182/C①-1〜4)+ #62 audit_logs.reason 同梱。
-- 内容: (1) audit_logs.reason 追加 (2) audit_log_write / _service に p_reason 末尾追加(既存5/7引数呼出は無改修で通る)
--       (3) feature_flags 新表(二層・部分 unique 2本・RLS select・ACL) (4) flag_enabled 読取(B(f)) (5) flag_set 書込(A8・課金ゲート)
-- 名簿: flag_set→A8 店設定 13→14(対象 113→114) / flag_enabled→B(f) 読取 43→44(除外 101→102) / 全数 214→216 / 述語参照 114→115
-- ACL: audit_log_write / _service は現状同値(postgres のみ・authenticated grant なし)を再明示。
-- 前提: mig0134 適用済み。冪等可(IF NOT EXISTS / DROP IF EXISTS / OR REPLACE)。BEGIN/COMMIT 一括。
-- 手貼り: Run 前に ref 目視。先頭の nox-project-proof=3 を確認。CC 走行中は貼らない(教訓56)。

begin;

select 'nox-project-proof' as k, count(*)::text as v from public.orgs;

-- ---------- (1) audit_logs.reason ----------
alter table public.audit_logs add column if not exists reason text;

-- ---------- (2) audit_log_write +p_reason ----------
drop function if exists public.audit_log_write(text, text, jsonb, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.audit_log_write(p_action text, p_target text DEFAULT NULL::text, p_before jsonb DEFAULT NULL::jsonb, p_after jsonb DEFAULT NULL::jsonb, p_store_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org   uuid;
  v_actor uuid;
  v_ip    text;
  v_id    uuid;
begin
  -- 二重防御①: 冒頭 null guard（NULL 比較の素通り防止）
  -- ★0057(2): kiosk 経由は device org を供給（人間は coalesce 第1腕＝従来どおり・両方 null は従来どおり raise）
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());
  if v_org is null then
    raise exception 'forbidden';
  end if;
  -- ★0057(4): actor＝operator（kiosk セッション）優先・従来式 fallback
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  -- ip はベストエフォート（PostgREST 経由時のみ request.headers が入る）
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  -- ★0135(#62): reason 列(横断設計書 §3・解除系は呼出側で必須検証)
  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip, reason)
  values
    (v_org, p_store_id, v_actor, p_action, p_target, p_before, p_after, v_ip, nullif(trim(p_reason), ''))
  returning id into v_id;
  return v_id;
end $function$;

revoke execute on function public.audit_log_write(text, text, jsonb, jsonb, uuid, text) from public, anon, authenticated, service_role;

-- ---------- (2') audit_log_write_service +p_reason ----------
drop function if exists public.audit_log_write_service(uuid, uuid, text, text, jsonb, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.audit_log_write_service(p_org_id uuid, p_actor uuid, p_action text, p_target text DEFAULT NULL::text, p_before jsonb DEFAULT NULL::jsonb, p_after jsonb DEFAULT NULL::jsonb, p_store_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if p_org_id is null then raise exception 'forbidden'; end if; -- org 明示必須
  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip, reason)
  values
    (p_org_id, p_store_id, p_actor, p_action, p_target, p_before, p_after, null, nullif(trim(p_reason), ''))
  returning id into v_id;
  return v_id;
end $function$;

revoke execute on function public.audit_log_write_service(uuid, uuid, text, text, jsonb, jsonb, uuid, text) from public, anon, authenticated, service_role;

-- ---------- (3) feature_flags ----------
create table if not exists public.feature_flags (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id),
  store_id   uuid null references public.stores(id),
  key        text not null,
  enabled    boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  constraint feature_flags_key_check check (key in ('staff_shift','reopen_flow','qr_order','notify'))
);

create unique index if not exists feature_flags_org_key_uidx
  on public.feature_flags (org_id, key) where store_id is null;
create unique index if not exists feature_flags_org_store_key_uidx
  on public.feature_flags (org_id, store_id, key) where store_id is not null;

alter table public.feature_flags enable row level security;

drop policy if exists feature_flags_select on public.feature_flags;
create policy feature_flags_select on public.feature_flags
  for select to authenticated
  using (org_id = public.auth_org_id());

revoke all on table public.feature_flags from public, anon, authenticated;
grant select on table public.feature_flags to authenticated;
grant all on table public.feature_flags to service_role;

-- ---------- (4) flag_enabled(読取・B(f)・非ゲート) ----------
CREATE OR REPLACE FUNCTION public.flag_enabled(p_key text, p_store_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_val boolean;
begin
  -- 読取関数=raise せず false(fail-closed)
  if p_key is null then return false; end if;
  v_org := public.auth_org_id();
  if v_org is null then return false; end if;
  if p_store_id is not null then
    if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then
      return false;
    end if;
    select f.enabled into v_val from public.feature_flags f
      where f.org_id = v_org and f.store_id = p_store_id and f.key = p_key;
    if v_val is not null then return v_val; end if;
  end if;
  select f.enabled into v_val from public.feature_flags f
    where f.org_id = v_org and f.store_id is null and f.key = p_key;
  return coalesce(v_val, false);
end $function$;

revoke execute on function public.flag_enabled(text, uuid) from public, anon;
grant execute on function public.flag_enabled(text, uuid) to authenticated, service_role;

-- ---------- (5) flag_set(書込・A8 店設定・課金ゲート・owner のみ) ----------
CREATE OR REPLACE FUNCTION public.flag_set(p_key text, p_store_id uuid, p_enabled boolean, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org    uuid;
  v_actor  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  -- 二重防御①: null guard
  if p_key is null or p_enabled is null then raise exception 'forbidden'; end if;
  v_org := public.auth_org_id();
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  -- owner のみ(裁定182・manager 不可)
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  -- key whitelist(列 CHECK と二段)
  if p_key not in ('staff_shift','reopen_flow','qr_order','notify') then raise exception 'unknown_key'; end if;
  -- store の org 照合
  if p_store_id is not null then
    if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then
      raise exception 'forbidden';
    end if;
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  select to_jsonb(f) into v_before from public.feature_flags f
    where f.org_id = v_org and f.key = p_key and f.store_id is not distinct from p_store_id;

  if v_before is null then
    insert into public.feature_flags (org_id, store_id, key, enabled, updated_at, updated_by)
      values (v_org, p_store_id, p_key, p_enabled, now(), v_actor)
      returning id into v_id;
  else
    update public.feature_flags
      set enabled = p_enabled, updated_at = now(), updated_by = v_actor
      where org_id = v_org and key = p_key and store_id is not distinct from p_store_id
      returning id into v_id;
  end if;

  select to_jsonb(f) into v_after from public.feature_flags f where f.id = v_id;
  perform public.audit_log_write('flag_toggle',
    'feature_flags:' || p_key || coalesce(':' || p_store_id::text, ''),
    v_before, v_after, p_store_id, p_reason);
  return v_id;
end $function$;

revoke execute on function public.flag_set(text, uuid, boolean, text) from public, anon;
grant execute on function public.flag_set(text, uuid, boolean, text) to authenticated, service_role;

commit;

-- ---------- 検証(1結果セット) ----------
select 'nox-project-proof' as k, count(*)::text as v from public.orgs
union all select 'audit_reason_col', count(*)::text from information_schema.columns
  where table_schema='public' and table_name='audit_logs' and column_name='reason'
union all select 'audit_log_write_pronargs', string_agg(pronargs::text, ',') from pg_proc
  where pronamespace='public'::regnamespace and proname='audit_log_write'
union all select 'audit_log_write_service_pronargs', string_agg(pronargs::text, ',') from pg_proc
  where pronamespace='public'::regnamespace and proname='audit_log_write_service'
union all select 'feature_flags_table', count(*)::text from pg_tables
  where schemaname='public' and tablename='feature_flags'
union all select 'feature_flags_uidx', count(*)::text from pg_indexes
  where schemaname='public' and tablename='feature_flags' and indexname like 'feature_flags_org%uidx'
union all select 'feature_flags_policy', count(*)::text from pg_policies
  where schemaname='public' and tablename='feature_flags'
union all select 'flag_fns', string_agg(proname || '/' || pronargs, ',' order by proname) from pg_proc
  where pronamespace='public'::regnamespace and proname in ('flag_enabled','flag_set')
union all select 'flag_set_gate', count(*)::text from pg_proc
  where pronamespace='public'::regnamespace and proname='flag_set' and prosrc like '%billing_writable_of(v_org)%';
-- 期待: proof=3 / audit_reason_col=1 / audit_log_write_pronargs=6 / _service=8 / table=1 / uidx=2 / policy=1 /
--       flag_fns=flag_enabled/2,flag_set/4 / flag_set_gate=1
