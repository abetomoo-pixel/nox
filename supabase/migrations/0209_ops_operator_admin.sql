-- 0209_ops_operator_admin.sql（2026-11-25 昼 直し・CC・【D8】起票155 の 2＝相談役 11/25 の決めに合わせた版・試走は本番 BEGIN … ROLLBACK だけ・貼るのは相談役の合図の後）
-- 名前: 0209 運営者の管理（管理者＝ops_admin／担当＝ops_support・招待で足す・招待の出し直し・止める／戻す・役を変える・認証アプリのリセットの記録・パスワードの変更の記録）
-- 翻訳元: なし（NOX 独自）。型は 0202a の ops_*（service_role 専用・冒頭で運営者の柵・監査は ops_audit_write）と ops_invite_logged（先に記録してから外へ送る）。
--   前の起草 docs/tmp/ops_admin_1124/0209_ops_operator_admin.sql（11/24 夕）からの変更は docs/tmp/ops_admin_1125/READY.md §3。
-- 前提: 0211 の後（関数 490・表 128）。★当てる直前に本番から数え直す（事前確認の count drift の行）。
-- 変えるもの（表 0・関数 +9・列 +3・トリガ +1・既存の関数は作り直さない・auth の表は読むだけ＝消さない・書かない）:
--   ★1 ops_operators に stopped_at・stopped_by（止めた日時と止めた管理者）・mfa_reset_at（認証アプリのリセットを記録した日時＝requireOperator がこれより前にログインしたセッションを通さない）。
--      役（role）と有効（is_active）の列は 0202a のまま（値も 'ops_admin'／'ops_support' のまま＝画面で 管理者／担当）。
--   ★2 ops_operators の service_role の権限を select だけに（insert／update を外す＝書くのは下の関数だけ・最後の管理者の柵を route から越えさせない）。
--   ★3 内部専用 ops_admin_ok（有効な管理者か）・トリガ関数 ops_admin_floor_guard＋遅延の制約トリガ ops_operators_admin_floor（commit の時に有効な管理者が 0 なら 'op last admin'）。
--   ★4 service 専用 7 本（route が requireOperatorApi と役の判定を済ませてから admin で呼ぶ・関数の中でも確かめる）:
--       ops_operator_list・ops_operator_add・ops_operator_reinvite_logged・ops_operator_set_active・ops_operator_set_role・ops_operator_mfa_reset_logged・ops_operator_password_logged
--   担当（ops_support）は ops_operator_password_logged（自分のパスワード）だけ。ほかの 6 本は管理者だけ（'forbidden'）。ほかの ops_*・onb_* は役で分けない（今のまま）。
--   認証アプリの登録を消すのは route の Admin API（auth.admin.mfa.deleteFactor）＝この mig は auth.mfa_factors を消さない（案 B）。関数は先に記録して mfa_reset_at を入れるだけ。
-- 例外の文は 'op …' で始める（lib/nox/ops/labels.ts の opsErrJa は部分一致・長い順＝会社の 'not found'・'bad name'・'accepted' と混ざらないように）。
-- 検証クエリ（貼った後）: docs/tmp/ops_admin_1125/0209_verify.sql（先頭は貼り先証明 select 'nox-project-proof' k, count(*)::text v from public.orgs）
-- 貼る前: docs/tmp/ops_admin_1125/0209_precheck.sql（読むだけ・返りが貼り先証明の 1 行だけなら貼ってよい）
begin;
set local lock_timeout = '10s';

-- ═══ ★1 列 ═══
alter table public.ops_operators
  add column if not exists stopped_at   timestamptz null,   -- 止めた日時（戻したら null）
  add column if not exists stopped_by   uuid null,          -- 止めた管理者の auth の id（FK なし＝ops_audit_logs と同じ）
  add column if not exists mfa_reset_at timestamptz null;   -- 認証アプリのリセットを記録した日時（この時刻より前にログインしたセッションは /ops に入れない＝requireOperator）

-- ═══ ★2 書くのは関数だけ ═══
revoke insert, update on table public.ops_operators from service_role;   -- 0202a の grant select, insert, update → select だけ（route と画面は読むだけ＝require-operator・invite-accept・会社の詳細）

-- ═══ ★3 内部専用と DB の柵 ═══
CREATE OR REPLACE FUNCTION public.ops_admin_ok(p_ops uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p_ops is not null and exists (select 1 from public.ops_operators o where o.auth_user_id = p_ops and o.is_active and o.role = 'ops_admin');
$function$;
revoke all on function public.ops_admin_ok(uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ops_admin_floor_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- commit の時（遅延）に、有効な管理者が 1 人も居なければ止める。関数を通らない道（Supabase の画面で auth のユーザーを消す＝cascade・SQL の直の update）も塞ぐ。
  if not exists (select 1 from public.ops_operators o where o.role = 'ops_admin' and o.is_active) then
    raise exception 'op last admin';
  end if;
  return null;
end $function$;
revoke all on function public.ops_admin_floor_guard() from public, anon, authenticated, service_role;
create constraint trigger ops_operators_admin_floor
  after update of role, is_active or delete on public.ops_operators
  deferrable initially deferred
  for each row
  when (old.role = 'ops_admin' and old.is_active)
  execute function public.ops_admin_floor_guard();

-- ═══ ★4 service 専用 ═══

-- 一覧（管理者だけ）＝運営者の行と auth の状態（招待・受諾・最後のログイン・認証アプリの登録数）。パスワードや認証アプリのキーは返さない（auth は読むだけ）。
CREATE OR REPLACE FUNCTION public.ops_operator_list(p_ops uuid)
 RETURNS TABLE(auth_user_id uuid, email text, name text, role text, is_active boolean, created_at timestamp with time zone, created_by uuid,
               stopped_at timestamp with time zone, stopped_by uuid, mfa_reset_at timestamp with time zone,
               invited_at timestamp with time zone, email_confirmed_at timestamp with time zone, last_sign_in_at timestamp with time zone,
               mfa_verified integer, is_self boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.ops_admin_ok(p_ops) then raise exception 'forbidden'; end if;
  return query
  select o.auth_user_id, o.email, o.name, o.role, o.is_active, o.created_at, o.created_by,
         o.stopped_at, o.stopped_by, o.mfa_reset_at,
         a.invited_at, a.email_confirmed_at, a.last_sign_in_at,
         (select count(*)::int from auth.mfa_factors f where f.user_id = o.auth_user_id and f.status = 'verified'),
         o.auth_user_id = p_ops
    from public.ops_operators o
    left join auth.users a on a.id = o.auth_user_id
   order by o.is_active desc, o.role, o.created_at;
end $function$;
revoke all on function public.ops_operator_list(uuid) from public, anon, authenticated, service_role;
grant execute on function public.ops_operator_list(uuid) to service_role;

-- 足す（管理者だけ）＝route が inviteUserByEmail で作った auth のユーザーを運営者にする（ops_org_create と同じ型＝招待 → 関数・失敗したら route が今回できた auth だけ消す）。
CREATE OR REPLACE FUNCTION public.ops_operator_add(p_ops uuid, p_auth_user_id uuid, p_email text, p_name text, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name  text := btrim(coalesce(p_name, ''));
begin
  if not public.ops_admin_ok(p_ops) then raise exception 'forbidden'; end if;
  if p_role is null or p_role not in ('ops_admin', 'ops_support') then raise exception 'op bad role'; end if;   -- 役は常に明示（原則 7 と同じ考え・既定に頼らない）
  if length(v_name) not between 1 and 40 then raise exception 'op bad name'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'op bad email'; end if;
  if p_auth_user_id is null or not exists (select 1 from auth.users a where a.id = p_auth_user_id and lower(a.email) = v_email) then raise exception 'op bad auth'; end if;
  if exists (select 1 from public.ops_operators o where o.auth_user_id = p_auth_user_id or lower(o.email) = v_email) then raise exception 'op dup'; end if;   -- 止めた人も含む（戻すのは set_active）
  if exists (select 1 from public.users u where u.auth_user_id = p_auth_user_id or lower(u.email) = v_email) then raise exception 'op store user'; end if;   -- 柵のトリガ（ops_users_guard）より先に分かる文で
  insert into public.ops_operators (auth_user_id, email, name, role, is_active, created_by)
  values (p_auth_user_id, v_email, v_name, p_role, true, p_ops);
  perform public.ops_audit_write(p_ops, null, 'ops.operator.add', 'ops_operators:' || p_auth_user_id::text, null,
    jsonb_build_object('email', v_email, 'name', v_name, 'role', p_role), null, null, false);   -- 会社に付かない＝運営の監査だけ
  return jsonb_build_object('auth_user_id', p_auth_user_id, 'email', v_email, 'role', p_role);
end $function$;
revoke all on function public.ops_operator_add(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.ops_operator_add(uuid, uuid, text, text, text) to service_role;

-- 招待の出し直し（管理者だけ）＝先に記録してメールを返す → route が inviteUserByEmail（ops_invite_logged と同じ型）。受諾済み・止めた人は出し直さない。
CREATE OR REPLACE FUNCTION public.ops_operator_reinvite_logged(p_ops uuid, p_target uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email    text;
  v_active   boolean;
  v_accepted boolean;
begin
  if not public.ops_admin_ok(p_ops) then raise exception 'forbidden'; end if;
  select o.email, o.is_active, (a.last_sign_in_at is not null or a.email_confirmed_at is not null)
    into v_email, v_active, v_accepted
    from public.ops_operators o left join auth.users a on a.id = o.auth_user_id
   where o.auth_user_id = p_target;
  if v_email is null then raise exception 'op not found'; end if;
  if not v_active then raise exception 'op stopped'; end if;
  if v_accepted then raise exception 'op accepted'; end if;   -- 受諾済み＝本人が /ops/login の「パスワードをお忘れの方」から
  perform public.ops_audit_write(p_ops, null, 'ops.operator.reinvite', 'ops_operators:' || p_target::text, null, jsonb_build_object('email', v_email), null, null, false);
  return v_email;
end $function$;
revoke all on function public.ops_operator_reinvite_logged(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.ops_operator_reinvite_logged(uuid, uuid) to service_role;

-- 止める／戻す（管理者だけ・理由は任意）。自分は止められない（'op self'）・最後の管理者は止められない（'op last admin'）。auth のユーザーは ban しない（requireOperator が毎回 is_active を見る）。
--   同時に 2 人の管理者が互いを止める形は、有効な管理者の行と相手の行を同じ順でロックしてから柵を見直して塞ぐ（後の方は 'forbidden'）。
CREATE OR REPLACE FUNCTION public.ops_operator_set_active(p_ops uuid, p_target uuid, p_active boolean, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old    record;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.ops_admin_ok(p_ops) then raise exception 'forbidden'; end if;
  if p_active is null then raise exception 'op bad active'; end if;   -- 原則 7＝boolean は常に明示
  if v_reason is not null and length(v_reason) > 200 then raise exception 'op bad reason'; end if;
  if p_target is null then raise exception 'op not found'; end if;
  if p_target = p_ops then raise exception 'op self'; end if;
  perform 1 from public.ops_operators o
   where (o.role = 'ops_admin' and o.is_active) or o.auth_user_id = p_target
   order by o.auth_user_id
     for update;
  if not public.ops_admin_ok(p_ops) then raise exception 'forbidden'; end if;   -- ロックの後に見直す（待っている間に自分が止められた）
  select o.role, o.is_active into v_old from public.ops_operators o where o.auth_user_id = p_target;
  if not found then raise exception 'op not found'; end if;
  if v_old.is_active = p_active then return; end if;   -- 変わらなければ書かない（監査も書かない）
  if not p_active and v_old.role = 'ops_admin'
     and not exists (select 1 from public.ops_operators o where o.role = 'ops_admin' and o.is_active and o.auth_user_id <> p_target) then
    raise exception 'op last admin';
  end if;
  update public.ops_operators
     set is_active  = p_active,
         stopped_at = case when p_active then null else now() end,
         stopped_by = case when p_active then null else p_ops end
   where auth_user_id = p_target;
  perform public.ops_audit_write(p_ops, null, case when p_active then 'ops.operator.resume' else 'ops.operator.stop' end, 'ops_operators:' || p_target::text,
    jsonb_build_object('is_active', v_old.is_active, 'role', v_old.role), jsonb_build_object('is_active', p_active), v_reason, null, false);
end $function$;
revoke all on function public.ops_operator_set_active(uuid, uuid, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.ops_operator_set_active(uuid, uuid, boolean, text) to service_role;

-- 役を変える（管理者だけ）。自分の役は変えない（'op self'）・最後の管理者を担当にしない（'op last admin'）。
CREATE OR REPLACE FUNCTION public.ops_operator_set_role(p_ops uuid, p_target uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old record;
begin
  if not public.ops_admin_ok(p_ops) then raise exception 'forbidden'; end if;
  if p_role is null or p_role not in ('ops_admin', 'ops_support') then raise exception 'op bad role'; end if;
  if p_target is null then raise exception 'op not found'; end if;
  if p_target = p_ops then raise exception 'op self'; end if;
  perform 1 from public.ops_operators o
   where (o.role = 'ops_admin' and o.is_active) or o.auth_user_id = p_target
   order by o.auth_user_id
     for update;
  if not public.ops_admin_ok(p_ops) then raise exception 'forbidden'; end if;
  select o.role, o.is_active into v_old from public.ops_operators o where o.auth_user_id = p_target;
  if not found then raise exception 'op not found'; end if;
  if v_old.role = p_role then return; end if;
  if v_old.role = 'ops_admin' and v_old.is_active
     and not exists (select 1 from public.ops_operators o where o.role = 'ops_admin' and o.is_active and o.auth_user_id <> p_target) then
    raise exception 'op last admin';
  end if;
  update public.ops_operators set role = p_role where auth_user_id = p_target;
  perform public.ops_audit_write(p_ops, null, 'ops.operator.role', 'ops_operators:' || p_target::text,
    jsonb_build_object('role', v_old.role), jsonb_build_object('role', p_role), null, null, false);
end $function$;
revoke all on function public.ops_operator_set_role(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.ops_operator_set_role(uuid, uuid, text) to service_role;

-- 認証アプリのリセットの記録（管理者だけ・理由は必ず・自分は不可）＝先に記録して mfa_reset_at を入れる → route が Admin API（auth.admin.mfa.listFactors → deleteFactor）で登録を消す（案 B）。
--   auth.mfa_factors は数を読むだけ（消さない）。mfa_reset_at より前にログインしたセッションは requireOperator が通さない（ログインからやり直し → /ops/mfa で登録し直す）。
--   戻り＝記録した日時（mfa_reset_at）。
CREATE OR REPLACE FUNCTION public.ops_operator_mfa_reset_logged(p_ops uuid, p_target uuid, p_reason text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_factors integer;
  v_at      timestamptz := now();
begin
  if not public.ops_admin_ok(p_ops) then raise exception 'forbidden'; end if;
  if v_reason is null then raise exception 'op reason required'; end if;
  if length(v_reason) > 200 then raise exception 'op bad reason'; end if;
  if p_target is null or not exists (select 1 from public.ops_operators o where o.auth_user_id = p_target) then raise exception 'op not found'; end if;
  if p_target = p_ops then raise exception 'op self'; end if;
  select count(*)::int into v_factors from auth.mfa_factors f where f.user_id = p_target and f.status = 'verified';   -- 読むだけ
  if v_factors = 0 then raise exception 'op no factor'; end if;   -- 消す物が無い＝何も書かない
  update public.ops_operators set mfa_reset_at = v_at where auth_user_id = p_target;
  perform public.ops_audit_write(p_ops, null, 'ops.operator.mfa_reset', 'ops_operators:' || p_target::text,
    jsonb_build_object('factors', v_factors), jsonb_build_object('reset_at', v_at), v_reason, null, false);   -- キーや factor の id は残さない
  return v_at;
end $function$;
revoke all on function public.ops_operator_mfa_reset_logged(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.ops_operator_mfa_reset_logged(uuid, uuid, text) to service_role;

-- パスワードの変更の記録（管理者も担当も・本人）。パスワードは受けない・残さない。
--   p_via＝'self'（/ops/me で今のパスワードを確かめてから・先に記録 → admin.updateUserById）／'invite'（招待のリンク）／'recovery'（/auth/forgot のリンク）／'other'
--   'invite'・'recovery'・'other' は invite-accept（/auth/set-password）が決めた後に呼ぶ。
CREATE OR REPLACE FUNCTION public.ops_operator_password_logged(p_ops uuid, p_via text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;
  if p_via is null or p_via not in ('self', 'invite', 'recovery', 'other') then raise exception 'op bad via'; end if;
  perform public.ops_audit_write(p_ops, null, 'ops.operator.password', 'ops_operators:' || p_ops::text, null, jsonb_build_object('via', p_via), null, null, false);
end $function$;
revoke all on function public.ops_operator_password_logged(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.ops_operator_password_logged(uuid, text) to service_role;

commit;
