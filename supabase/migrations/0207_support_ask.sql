-- 0207_support_ask（起票152 の続き・相談役 11/24 夕の便【7】・起草と試走まで・適用はしない）
--   運営が /ops で「サポート許可を頼む」→ オーナーの「要承認」（🔔 の数と HOME のカード）に 1 行 → オーナーがサポート許可の画面で日数を選ぶ（押しただけで許可にしない）。
--   決め（相談役 11/24 夕）：要承認に出す・新しい表と運営専用の関数・オーナーの「今は出さない」・運営の「取り下げ」・運営のひとこと（短い文）・LINE では知らせない・
--     頼めるのは「導入完了の後で許可が無いとき」（期限切れも含む）だけ。0204 とは独立。
--   翻訳元：0202a の ops_* の型（service_role 専用・冒頭 ops_operator_ok・監査は ops_audit_write）・0202b のオーナーの窓口の型（二重防御・オーナーだけ・audit_log_write）。
--   前提：関数 483・表 127（0203 版 4 の後の本番）。後：関数 486・表 128。
--   support_grant_set／support_grant_revoke は作り直さない（頼みの後に許可が出たら「済んだ頼み」＝読む側と次の頼みで閉じる）。
--   検証クエリ：docs/tmp/0207/0207_verify.sql（先頭は貼り先証明 select 'nox-project-proof', count(*) from public.orgs）。
begin;
set local lock_timeout = '10s';

-- ═══ 表 ops_support_requests（テーブル追加の標準型＝作る→索引→RLS→SELECT の方針→revoke all→grant select） ═══
create table public.ops_support_requests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  requested_by  uuid not null,                       -- 運営者の auth の id（ops_operators.auth_user_id）
  message       text null check (message is null or char_length(message) between 1 and 200),   -- 運営のひとこと（短い文）
  requested_at  timestamptz not null default now(),
  closed_at     timestamptz null,                    -- null＝開いている
  close_reason  text null check (close_reason is null or close_reason in ('withdrawn', 'dismissed', 'superseded')),   -- 取り下げ／今は出さない／頼みの後に許可が出た（次の頼みで閉じる）
  closed_by     uuid null,                           -- 取り下げ＝運営者の auth の id・今は出さない＝users.id
  constraint ops_support_requests_close_check check ((closed_at is null) = (close_reason is null))
);
create unique index ops_support_requests_one_open on public.ops_support_requests (org_id) where closed_at is null;   -- 開いている頼みは会社に 1 つ（重ねて届かない）
create index ops_support_requests_org_idx on public.ops_support_requests (org_id, requested_at desc);
alter table public.ops_support_requests enable row level security;
create policy ops_support_requests_select on public.ops_support_requests for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_role() = 'owner');   -- オーナーだけが自社の頼みを読む（運営は service）
revoke all on table public.ops_support_requests from public, anon, authenticated;
grant select on table public.ops_support_requests to authenticated;
comment on table public.ops_support_requests is '★0207（起票152）: 運営からオーナーへのサポート許可の頼み（会社に開いた頼みは 1 つ・書くのは ops_support_request／ops_support_request_withdraw／support_request_dismiss だけ）';

-- ═══ 運営：頼む（service_role 専用） ═══
CREATE OR REPLACE FUNCTION public.ops_support_request(p_ops uuid, p_org uuid, p_message text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org   public.orgs;
  v_open  public.ops_support_requests;
  v_msg   text := nullif(btrim(coalesce(p_message, '')), '');
  v_id    uuid;
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;
  select * into v_org from public.orgs where id = p_org;
  if v_org.id is null then raise exception 'not found'; end if;
  if v_org.is_demo then raise exception 'forbidden (demo)'; end if;   -- デモの会社では頼まない（行を作らない）
  if v_org.onboarding_state <> 'done' then raise exception 'not needed'; end if;   -- 導入中は頼まなくても代行できる
  if exists (select 1 from public.ops_support_grants g where g.org_id = p_org and g.revoked_at is null and g.expires_at > now()) then raise exception 'not needed'; end if;   -- 今は許可の間
  if v_msg is not null and char_length(v_msg) > 200 then raise exception 'bad message'; end if;
  select * into v_open from public.ops_support_requests where org_id = p_org and closed_at is null for update;
  if v_open.id is not null then
    if exists (select 1 from public.ops_support_grants g where g.org_id = p_org and g.granted_at >= v_open.requested_at) then
      update public.ops_support_requests set closed_at = now(), close_reason = 'superseded', closed_by = null where id = v_open.id;   -- 頼みの後に許可が出た＝済んだ頼み（許可が切れた後の頼み直し）
    else
      return v_open.id;   -- くり返し押しても重ねて届かない（同じ頼みを返す）
    end if;
  end if;
  insert into public.ops_support_requests (org_id, requested_by, message) values (p_org, p_ops, v_msg) returning id into v_id;
  perform public.ops_audit_write(p_ops, p_org, 'ops.support_request', 'orgs:' || p_org::text, null, jsonb_build_object('id', v_id, 'message', v_msg), null, null, true);
  return v_id;
end $function$;
revoke execute on function public.ops_support_request(uuid, uuid, text) from public, anon, authenticated;

-- ═══ 運営：取り下げ（service_role 専用） ═══
CREATE OR REPLACE FUNCTION public.ops_support_request_withdraw(p_ops uuid, p_org uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;
  update public.ops_support_requests set closed_at = now(), close_reason = 'withdrawn', closed_by = p_ops
   where org_id = p_org and closed_at is null returning id into v_id;
  if v_id is null then return false; end if;   -- 開いている頼みが無い＝何もしない（二度押し）
  perform public.ops_audit_write(p_ops, p_org, 'ops.support_request_withdraw', 'orgs:' || p_org::text, jsonb_build_object('id', v_id), null, null, null, true);
  return true;
end $function$;
revoke execute on function public.ops_support_request_withdraw(uuid, uuid) from public, anon, authenticated;

-- ═══ オーナー：今は出さない（authenticated・二重防御・オーナーだけ） ═══
CREATE OR REPLACE FUNCTION public.support_request_dismiss()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_user uuid;
  v_id   uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  select u.id into v_user from public.users u where u.auth_user_id = auth.uid() and u.is_active;
  update public.ops_support_requests set closed_at = now(), close_reason = 'dismissed', closed_by = v_user
   where org_id = v_org and closed_at is null returning id into v_id;
  if v_id is null then return false; end if;
  perform public.audit_log_write('support_request_dismiss', 'orgs:' || v_org::text, jsonb_build_object('id', v_id), null, null);
  return true;
end $function$;
revoke execute on function public.support_request_dismiss() from public, anon;
grant execute on function public.support_request_dismiss() to authenticated;

commit;
