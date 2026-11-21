-- 0202a_ops_v1.sql（2026-11-20 夕 起草・CC・相談役 ⑩＝起草と試走まで・適用しない）
-- 名前: 0202a 運営コンソール 版 1（裁定476 改の段 1・2・5 の一部と ■C ①の列）＝運営者の表・運営の監査・経路（紹介コード）・導入の状態・service 専用の ops_* 関数
-- 翻訳元: なし（NOX 独自・docs/tmp/lane5_plan_1110.md の 0202 の段 1・2・5・docs/tmp/ops_console_scan.md §3・案 docs/tmp/console_plan_1120.md §2 版 1）
-- 前提: 0201u の後（関数 455・表 122）。0201t（未適用）・0201v（未適用）とは独立（0201t の後なら関数の数は +6）。
-- 変えるもの（店の側の既存の関数と RLS は 1 本も作り直さない＝店の動きに効かない）:
--   ★1 表 ops_operators（運営者＝auth のユーザーと 1 対 1・店の users と別）・★2 表 ops_audit_logs（会社をまたぐ運営の監査）・audit_logs に actor_ops_id（店の側の監査に「運営」）
--   ★3 orgs に経路（agency_code・agency_code_source・agency_code_at）と導入の状態（onboarding_state・onboarding_done_at・onboarding_done_by・onboarding_done_kind）
--   ★4 柵のトリガ ops_users_guard（運営者の auth id で users を作らない・users のある auth id を運営者にしない）
--   ★5 内部専用 ops_operator_ok・ops_audit_write（4 ロール revoke・grant なし）
--   ★6 service 専用 ops_org_list・ops_org_create・ops_org_set_agency_code・ops_onboarding_set・ops_invite_logged（4 ロール revoke → service_role に grant）
--   ★直し（相談役 11/20 18:05 の照合）: ops_onboarding_set は導入中→導入完了だけ（完了から戻すのは 'cannot reopen'）・ops_org_set_agency_code の監査は運営の監査だけ・ops.org.create の店の側の監査は経路とテスターの印を外す・ops_org_list は NOX-CHECK- も検証用
-- 表 2・関数 8（関数 455→463・表 122→124）。新しい表は RLS 有効・ポリシーなし・public／anon／authenticated に grant なし（service_role だけ）。
-- 検証クエリ（貼った後）: docs/tmp/0202a_verify.sql（先頭は貼り先証明 select 'nox-project-proof', count(*) from public.orgs;）
begin;
set local lock_timeout = '10s';

-- ═══ ★1 運営者 ═══
create table public.ops_operators (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  name         text not null default '運営',
  role         text not null default 'ops_admin' check (role in ('ops_admin', 'ops_support')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid null
);
alter table public.ops_operators enable row level security;   -- ポリシーは作らない（service_role だけが読める）
revoke all on table public.ops_operators from public, anon, authenticated, service_role;
grant select, insert, update on table public.ops_operators to service_role;

-- ═══ ★2 運営の監査（会社をまたぐ・会社に付かない操作も）＋店の側の監査に運営の列 ═══
create table public.ops_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  ops_user_id uuid not null,
  org_id      uuid null references public.orgs(id) on delete set null,
  action      text not null,
  target      text null,
  before_json jsonb null,
  after_json  jsonb null,
  reason      text null,
  ip          text null
);
create index ops_audit_logs_at_idx on public.ops_audit_logs (at desc);
create index ops_audit_logs_org_at_idx on public.ops_audit_logs (org_id, at desc);
alter table public.ops_audit_logs enable row level security;   -- ポリシーは作らない
revoke all on table public.ops_audit_logs from public, anon, authenticated, service_role;
grant select, insert on table public.ops_audit_logs to service_role;   -- 消さない・直さない

alter table public.audit_logs add column if not exists actor_ops_id uuid null;   -- 運営が代行した行＝運営者の auth id（店の監査の画面で「運営」）

-- ═══ ★3 会社の経路（紹介コード）と導入の状態 ═══
alter table public.orgs
  add column if not exists agency_code        text null,
  add column if not exists agency_code_source text null,
  add column if not exists agency_code_at     timestamptz null,
  add column if not exists onboarding_state   text not null default 'done',
  add column if not exists onboarding_done_at timestamptz null,
  add column if not exists onboarding_done_by uuid null,
  add column if not exists onboarding_done_kind text null;   -- 完了にした行い手（owner＝users.id／ops＝運営者の auth id）
alter table public.orgs add constraint orgs_agency_code_check check (agency_code is null or (length(agency_code) between 1 and 40 and agency_code = btrim(agency_code)));   -- 受け取ったコードはそのまま（大文字小文字は変えない）
alter table public.orgs add constraint orgs_agency_code_source_check check (agency_code_source is null or agency_code_source in ('signup', 'ops'));
alter table public.orgs add constraint orgs_onboarding_done_kind_check check (onboarding_done_kind is null or onboarding_done_kind in ('owner', 'ops'));
alter table public.orgs add constraint orgs_onboarding_state_check check (onboarding_state in ('onboarding', 'done'));   -- 今ある会社は 'done'（既定）・コンソールで作る会社は 'onboarding'

-- ═══ ★4 柵：運営者と店のユーザーを同じ auth id に乗せない ═══
CREATE OR REPLACE FUNCTION public.ops_users_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_table_name = 'users' then
    if new.auth_user_id is not null and exists (select 1 from public.ops_operators o where o.auth_user_id = new.auth_user_id) then
      raise exception 'operator cannot be a store user';
    end if;
  elsif tg_table_name = 'ops_operators' then
    if exists (select 1 from public.users u where u.auth_user_id = new.auth_user_id) then
      raise exception 'store user cannot be an operator';
    end if;
  end if;
  return new;
end $function$;
revoke all on function public.ops_users_guard() from public, anon, authenticated, service_role;
create trigger users_ops_guard before insert or update of auth_user_id on public.users for each row execute function public.ops_users_guard();
create trigger ops_operators_users_guard before insert or update of auth_user_id on public.ops_operators for each row execute function public.ops_users_guard();

-- ═══ ★5 内部専用 ═══
CREATE OR REPLACE FUNCTION public.ops_operator_ok(p_ops uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p_ops is not null and exists (select 1 from public.ops_operators o where o.auth_user_id = p_ops and o.is_active);
$function$;
revoke all on function public.ops_operator_ok(uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ops_audit_write(p_ops uuid, p_org uuid, p_action text, p_target text, p_before jsonb, p_after jsonb, p_reason text, p_store uuid, p_store_side boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;   -- 行を書く内部関数＝冒頭の柵（原則 8）
  insert into public.ops_audit_logs (ops_user_id, org_id, action, target, before_json, after_json, reason)
  values (p_ops, p_org, p_action, p_target, p_before, p_after, p_reason);
  if p_org is not null and coalesce(p_store_side, true) then   -- 会社に付く操作は店の側の監査にも（actor_user_id は null・actor_ops_id に運営者）
    insert into public.audit_logs (org_id, store_id, actor_user_id, actor_ops_id, action, target, before_json, after_json, reason)
    values (p_org, p_store, null, p_ops, p_action, p_target, p_before, p_after, p_reason);
  end if;
end $function$;
revoke all on function public.ops_audit_write(uuid, uuid, text, text, jsonb, jsonb, text, uuid, boolean) from public, anon, authenticated, service_role;

-- ═══ ★6 service 専用（route が requireOperator（getUser → aal2 → ops_operators）を済ませてから admin client で呼ぶ・関数の中でも運営者を確かめる） ═══
CREATE OR REPLACE FUNCTION public.ops_org_list(p_ops uuid)
 RETURNS TABLE(org_id uuid, org_name text, kind text, store_count integer, billing_status text, trial_ends_at timestamp with time zone, has_subscription boolean,
               agency_code text, onboarding_state text, onboarding_done_at timestamp with time zone,
               owner_email text, owner_invited_at timestamp with time zone, owner_accepted boolean,
               setup_done_stores integer, setup_step_max integer, setup_draft_at timestamp with time zone,
               line_login_stores integer, line_notify_stores integer, line_richmenu_stores integer, line_links integer,
               cast_count integer, staff_count integer, last_used_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;
  return query
  select o.id, o.name,
         case when o.is_demo then 'demo' when o.name like 'NOX-VERIFY-%' or o.name like 'NOX-CHECK-%' then 'verify'   -- 確かめ用の会社（コンソールで作る・予約の名前には入れない＝相談役 11/20 18:05 ④）
              when b.status = 'trialing' then 'trial'
              when b.status = 'active' and b.stripe_subscription_id is null then 'tester'
              else coalesce(b.status, 'none') end,
         (select count(*)::int from public.stores s where s.org_id = o.id),
         b.status, b.trial_ends_at, b.stripe_subscription_id is not null,
         o.agency_code, o.onboarding_state, o.onboarding_done_at,
         ow.email, ow.invited_at, (ow.last_sign_in_at is not null or ow.email_confirmed_at is not null),
         (select count(*)::int from public.stores s where s.org_id = o.id and coalesce(s.settings_json->>'setup_done', 'false') = 'true'),
         (select max(case when jsonb_typeof(d.data->'S'->'step') = 'number' then (d.data->'S'->>'step')::int end) from public.setup_drafts d where d.org_id = o.id),
         (select max(d.updated_at) from public.setup_drafts d where d.org_id = o.id),
         (select count(*)::int from public.stores s where s.org_id = o.id and coalesce(s.line_config->>'login_channel_id', '') <> '' and coalesce(s.line_config->>'liff_id', '') <> ''),
         (select count(*)::int from public.stores s where s.org_id = o.id and coalesce(s.line_config->>'access_token_ref', '') <> ''),
         (select count(*)::int from public.stores s where s.org_id = o.id and coalesce(s.line_config->>'richmenu_id_default', '') <> ''),
         (select count(*)::int from public.line_links l where l.org_id = o.id and l.blocked_at is null),
         (select count(*)::int from public.casts c where c.org_id = o.id and c.is_active),
         (select count(*)::int from public.memberships m join public.stores s on s.id = m.store_id where s.org_id = o.id and m.is_active and m.role in ('manager', 'staff')),
         greatest((select max(a.last_sign_in_at) from public.users u join auth.users a on a.id = u.auth_user_id where u.org_id = o.id),
                  (select max(k.last_seen_at) from public.kiosk_sessions k where k.org_id = o.id)),
         o.created_at
    from public.orgs o
    left join public.org_billing b on b.org_id = o.id
    left join lateral (
      select a.email::text, a.invited_at, a.last_sign_in_at, a.email_confirmed_at
        from public.memberships m join public.users u on u.id = m.user_id join public.stores s on s.id = m.store_id
        join auth.users a on a.id = u.auth_user_id
       where s.org_id = o.id and m.role = 'owner' and m.is_active
       order by m.created_at limit 1) ow on true
   order by o.created_at desc;
end $function$;
revoke all on function public.ops_org_list(uuid) from public, anon, authenticated, service_role;
grant execute on function public.ops_org_list(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.ops_org_create(p_ops uuid, p_org_name text, p_store_name text, p_biz_type text, p_owner_email text, p_owner_auth_user_id uuid, p_agency_code text, p_tester boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org   uuid;
  v_store uuid;
  v_user  uuid;
  v_mem   uuid;
  v_name  text := btrim(coalesce(p_org_name, ''));
  v_sname text := btrim(coalesce(p_store_name, ''));
  v_email text := lower(btrim(coalesce(p_owner_email, '')));
  v_code  text := nullif(p_agency_code, '');
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;
  if p_tester is null then raise exception 'bad tester'; end if;                                          -- 原則 7＝boolean は常に明示
  if length(v_name) not between 1 and 60 or length(v_sname) not between 1 and 60 then raise exception 'bad name'; end if;
  if v_name like 'NOX-DEMO%' or v_name like 'NOX-VERIFY%' then raise exception 'reserved name'; end if;
  if p_biz_type is null or p_biz_type not in ('cabaret', 'girlsbar', 'snack', 'lounge', 'bar', 'host') then raise exception 'bad biz type'; end if;   -- create-org.mjs の 5 つ＋ホスト（テスターの候補にホストクラブ＝相談役 11/20 18:12・デモの HOST と同じ値 'host'）
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad email'; end if;
  if v_code is not null and (length(v_code) > 40 or v_code <> btrim(v_code)) then raise exception 'bad code'; end if;
  if p_owner_auth_user_id is null or not exists (select 1 from auth.users a where a.id = p_owner_auth_user_id and lower(a.email) = v_email) then raise exception 'bad owner auth'; end if;   -- route が招待で作った auth のユーザー
  if exists (select 1 from public.users u where lower(u.email) = v_email) then raise exception 'dup email'; end if;
  if exists (select 1 from auth.users a where lower(a.email) = v_email and a.id <> p_owner_auth_user_id) then raise exception 'dup email'; end if;
  if exists (select 1 from public.orgs o where o.name = v_name) then raise exception 'dup org'; end if;
  insert into public.orgs (name, agency_code, agency_code_source, agency_code_at, onboarding_state)
  values (v_name, v_code, case when v_code is null then null else 'ops' end, case when v_code is null then null else now() end, 'onboarding')
  returning id into v_org;
  insert into public.org_billing (org_id, status, trial_ends_at)   -- テスター＝active・契約なし（裁定500-5 の (b)）／ふつう＝お試し 1 か月（裁定475）
  values (v_org, case when p_tester then 'active' else 'trialing' end, now() + interval '1 month');
  insert into public.stores (org_id, name, short, settings_json)
  values (v_org, v_sname, left(v_sname, 8), jsonb_build_object('biz_type', p_biz_type, 'setup_done', false))
  returning id into v_store;
  insert into public.users (org_id, auth_user_id, email, name) values (v_org, p_owner_auth_user_id, v_email, 'オーナー') returning id into v_user;
  insert into public.memberships (user_id, store_id, role, can_register, can_crm, can_shift) values (v_user, v_store, 'owner', false, false, false) returning id into v_mem;
  perform public.ops_audit_write(p_ops, v_org, 'ops.org.create', 'orgs:' || v_org::text, null,
    jsonb_build_object('org', v_name, 'store', v_sname, 'biz_type', p_biz_type, 'owner_email', v_email, 'agency_code', v_code, 'tester', p_tester), null, v_store, false);   -- 運営の監査には全部
  insert into public.audit_logs (org_id, store_id, actor_user_id, actor_ops_id, action, target, before_json, after_json, reason)   -- 店の側の監査は経路とテスターの印を外す（相談役 11/20 18:05 ②＝運営と代理店の間のこと・オーナーが読む監査に出さない）
  values (v_org, v_store, null, p_ops, 'ops.org.create', 'orgs:' || v_org::text, null,
          jsonb_build_object('org', v_name, 'store', v_sname, 'biz_type', p_biz_type, 'owner_email', v_email), null);
  return jsonb_build_object('org_id', v_org, 'store_id', v_store, 'user_id', v_user, 'membership_id', v_mem);
end $function$;
revoke all on function public.ops_org_create(uuid, text, text, text, text, uuid, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.ops_org_create(uuid, text, text, text, text, uuid, text, boolean) to service_role;

CREATE OR REPLACE FUNCTION public.ops_org_set_agency_code(p_ops uuid, p_org_id uuid, p_code text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  record;
  v_code text := nullif(p_code, '');
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;
  select id, is_demo, agency_code into v_org from public.orgs where id = p_org_id;
  if v_org.id is null then raise exception 'not found'; end if;
  if v_org.is_demo then raise exception 'demo'; end if;
  if v_code is not null and (length(v_code) > 40 or v_code <> btrim(v_code)) then raise exception 'bad code'; end if;
  if v_org.agency_code is not distinct from v_code then return; end if;   -- 変わらなければ書かない（監査も書かない）
  update public.orgs set agency_code = v_code, agency_code_source = case when v_code is null then null else 'ops' end, agency_code_at = case when v_code is null then null else now() end
   where id = p_org_id;
  perform public.ops_audit_write(p_ops, p_org_id, 'ops.agency_code', 'orgs:' || p_org_id::text,
    jsonb_build_object('agency_code', v_org.agency_code), jsonb_build_object('agency_code', v_code), nullif(btrim(coalesce(p_reason, '')), ''), null, false);   -- 運営の監査だけ（店の側の監査に出さない＝相談役 11/20 18:05 ②）・Yuiba へは送らない（帰属の正は Yuiba）
end $function$;
revoke all on function public.ops_org_set_agency_code(uuid, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.ops_org_set_agency_code(uuid, uuid, text, text) to service_role;

CREATE OR REPLACE FUNCTION public.ops_onboarding_set(p_ops uuid, p_org_id uuid, p_state text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org record;
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;
  if p_state is null or p_state not in ('onboarding', 'done') then raise exception 'bad state'; end if;
  select id, is_demo, onboarding_state into v_org from public.orgs where id = p_org_id;
  if v_org.id is null then raise exception 'not found'; end if;
  if v_org.is_demo then raise exception 'demo'; end if;
  if v_org.onboarding_state = p_state then return; end if;
  if v_org.onboarding_state = 'done' then raise exception 'cannot reopen'; end if;   -- 運営は導入中→導入完了だけ（版 2 で運営が導入中の会社に書けるため・戻す道は 0202b でオーナーのサポート許可とひも付ける＝相談役 11/20 18:05 ①）
  update public.orgs set onboarding_state = p_state,
         onboarding_done_at = case when p_state = 'done' then now() else null end,
         onboarding_done_by = case when p_state = 'done' then p_ops else null end,
         onboarding_done_kind = case when p_state = 'done' then 'ops' else null end
   where id = p_org_id;
  perform public.ops_audit_write(p_ops, p_org_id, 'ops.onboarding', 'orgs:' || p_org_id::text,
    jsonb_build_object('onboarding_state', v_org.onboarding_state), jsonb_build_object('onboarding_state', p_state), null, null, true);
end $function$;
revoke all on function public.ops_onboarding_set(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.ops_onboarding_set(uuid, uuid, text) to service_role;

CREATE OR REPLACE FUNCTION public.ops_invite_logged(p_ops uuid, p_org_id uuid, p_kind text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email    text;
  v_accepted boolean;
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;
  if p_kind is null or p_kind not in ('email', 'link') then raise exception 'bad kind'; end if;
  select a.email::text, (a.last_sign_in_at is not null or a.email_confirmed_at is not null) into v_email, v_accepted
    from public.memberships m join public.users u on u.id = m.user_id join public.stores s on s.id = m.store_id join auth.users a on a.id = u.auth_user_id
   where s.org_id = p_org_id and m.role = 'owner' and m.is_active order by m.created_at limit 1;
  if v_email is null then raise exception 'no owner'; end if;
  if v_accepted then raise exception 'accepted'; end if;   -- 受諾済み＝出し直さない（パスワードを忘れたら /auth/forgot）
  perform public.ops_audit_write(p_ops, p_org_id, 'ops.org.reinvite', 'orgs:' || p_org_id::text, null, jsonb_build_object('kind', p_kind, 'owner_email', v_email), null, null, true);
  return v_email;   -- route はこのメールに inviteUserByEmail（link なら generateLink）
end $function$;
revoke all on function public.ops_invite_logged(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.ops_invite_logged(uuid, uuid, text) to service_role;

commit;
