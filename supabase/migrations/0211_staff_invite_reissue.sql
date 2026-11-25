-- 0211_staff_invite_reissue（起票157 の続き＝スタッフの招待の出し直し・取り消し・メールの結果の記録・相談役 2026-11-25 朝の決め・起草と試走まで・適用はしない）
--   番号は仮（0209＝運営者の管理・0210＝初回料金に予約済み）。当てる直前に本番の番号と数を数え直す。
--   決め（相談役 11/25 朝）：招待のメールは POST /api/staff/invite の中で RPC の後に Resend の API で送る（案 A）。出し直すと前のリンクは無効・期限は出し直しから 14 日・
--     「取り消す」も作る・出し直しとメールの送り直しは 1 つの招待につき 1 日 5 回まで（DB の関数で数える）・送った記録の表は作らない（監査＝audit_log_write に残す）。
--   中身：
--     1. staff_invites に revoked_at（取り消した時刻・null＝取り消していない）1 列。表は増えない。
--     2. staff_invite_reissue(p_invite_id, p_mode)＝トークンを替える（前のリンクは引けなくなる）・期限は今から 14 日・1 日 5 回まで・柵は staff_invite_create と同じ・課金ゲート（A）・audit。
--        p_mode＝'link'（リンクを出し直す＝画面に出すだけ）／'mail'（メールを送り直す＝route が続けて送る）。どちらも同じ数に入る（合わせて 1 日 5 回）。
--        回数は audit_logs の 'staff_invite_reissue' を数える（表を作らない）＝索引 audit_logs_action_target_at_idx (action, target, at desc) に乗る・
--        SECURITY DEFINER（所有者 postgres＝bypassrls・audit_logs は force rls でない）なので audit_logs の RLS（owner だけ）は数えるのに効かない＝manager の出し直しも数えられる。
--        同じ招待を同時に 2 回押しても数がずれないよう、招待の行を for update で先に取ってから数える。「1 日」は暦の JST（0 時で戻る）。
--     3. staff_invite_revoke(p_invite_id)＝取り消し（revoked_at・トークンを誰も知らない値に替える・期限を今に縮める＝受ける画面では「見つからないか、期限切れ」）。
--        課金ゲートは入れない（B(h)＝縮退専用・staff_deactivate と同じ扱い＝止まっている店でも未受諾の招待を止められる）。2 回目は何もしない（書かない＝監査も書かない）。
--     4. staff_invite_mail_note(p_invite_id, p_kind, p_status, p_reason)＝メールを送った結果を監査に 1 行（'staff_invite_mail'）。宛先・トークン・URL は入れない。課金ゲート（A）。
--   初回のパスワード変更の印は DB に置かない＝Auth の app_metadata（must_change_password）に置く（plan.md §5）＝この mig に入らない。
--   staff_invite_create／staff_invite_accept は変えない（取り消した行は期限が過ぎているので create の 'invite exists' に当たらず、accept の 'bad token' に当たる）。
--   翻訳元：0176 の staff_invite_create（同じ柵・トークンの作り方・sha256）・0176 member_profile_self_save（デモ org の forbidden）・0208 の set_cast_rank_shift_time（形）。
--   前提：関数 487・表 128（今の本番 483／127 に 0207（+3 関数・+1 表）と 0208（+1 関数）が当たった後）。後：関数 490・表 128。**当てる直前に数え直す**。
--   検証クエリ：docs/tmp/staff_invite_1125/0211_verify.sql（先頭は貼り先証明 select 'nox-project-proof', count(*) from public.orgs）。
begin;
set local lock_timeout = '10s';

-- ═══ 1. 列（取り消し） ═══
alter table public.staff_invites add column revoked_at timestamptz null;
comment on column public.staff_invites.revoked_at is '★0211（起票157 の続き）: 取り消した時刻（null＝取り消していない）。取り消した行はトークンを替え、期限を取り消しの時刻に縮める';

-- ═══ 2. 出し直し ═══
CREATE OR REPLACE FUNCTION public.staff_invite_reissue(p_invite_id uuid, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0211（起票157 の続き・相談役 11/25 朝）: 未受諾・未取り消しの招待のトークンを替える（前のリンクは使えなくなる）・期限は今から 14 日。
--   owner／自店の manager（manager は role 'staff' の招待だけ）＝staff_invite_create と同じ柵。デモ org は forbidden。1 つの招待につき暦の JST の 1 日 5 回まで（'too many'）。
--   戻り＝id・平文のトークン（1 回だけ・DB は sha256）・期限・宛先・名前・店・役割・今日の残り。p_mode は 'link'／'mail'（監査に残すだけ・数は合わせて 1 つ）。
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_i     public.staff_invites;
  v_demo  boolean;
  v_from  timestamptz;
  v_n     integer;
  v_token text;
  v_exp   timestamptz;
  c_limit constant integer := 5;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_mode is null or p_mode not in ('link', 'mail') then raise exception 'bad mode'; end if;
  select is_demo into v_demo from public.orgs where id = v_org;
  if coalesce(v_demo, false) then raise exception 'forbidden'; end if;
  select * into v_i from public.staff_invites where id = p_invite_id and org_id = v_org for update;   -- 先に行を取る＝同時の 2 回でも数がずれない
  if v_i.id is null then raise exception 'not found'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_i.store_id = public.auth_store_id() and v_i.role = 'staff')) then raise exception 'forbidden'; end if;
  if v_i.accepted_at is not null then raise exception 'already accepted'; end if;
  if v_i.revoked_at is not null then raise exception 'revoked'; end if;
  if exists (select 1 from public.users u where u.org_id = v_org and lower(u.email) = v_i.email and u.is_active) then raise exception 'email in use'; end if;
  if exists (select 1 from public.staff_invites i where i.org_id = v_org and i.email = v_i.email and i.id <> v_i.id
               and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) then raise exception 'invite exists'; end if;   -- 期限切れの古い招待を出し直して、同じ宛先の有効な招待を 2 つにしない
  v_from := (date_trunc('day', now() at time zone 'Asia/Tokyo')) at time zone 'Asia/Tokyo';   -- 暦の JST の今日の 0 時
  select count(*)::int into v_n from public.audit_logs a
   where a.action = 'staff_invite_reissue' and a.target = 'staff_invites:' || v_i.id::text and a.at >= v_from;
  if v_n >= c_limit then raise exception 'too many'; end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_exp := now() + interval '14 days';
  update public.staff_invites set token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), expires_at = v_exp where id = v_i.id;
  perform public.audit_log_write('staff_invite_reissue', 'staff_invites:' || v_i.id::text,
    jsonb_build_object('expires_at', v_i.expires_at),
    jsonb_build_object('mode', p_mode, 'expires_at', v_exp, 'n_today', v_n + 1), v_i.store_id);
  return jsonb_build_object('id', v_i.id, 'token', v_token, 'expires_at', v_exp, 'email', v_i.email, 'name', v_i.name,
                            'store_id', v_i.store_id, 'role', v_i.role, 'left_today', c_limit - v_n - 1);
end $function$;
revoke execute on function public.staff_invite_reissue(uuid, text) from public, anon;
grant execute on function public.staff_invite_reissue(uuid, text) to authenticated;

-- ═══ 3. 取り消し ═══
CREATE OR REPLACE FUNCTION public.staff_invite_revoke(p_invite_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0211（起票157 の続き・相談役 11/25 朝）: 未受諾の招待を取り消す＝revoked_at・トークンを誰も知らない値に替える・期限を今に縮める（受ける画面は「見つからないか、期限切れ」）。
--   柵は staff_invite_create と同じ。課金ゲートなし（B(h) 縮退専用）。取り消し済みは何もしない（書かない）。戻り＝招待の id
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_i    public.staff_invites;
  v_now  timestamptz := now();
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  select * into v_i from public.staff_invites where id = p_invite_id and org_id = v_org for update;
  if v_i.id is null then raise exception 'not found'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_i.store_id = public.auth_store_id() and v_i.role = 'staff')) then raise exception 'forbidden'; end if;
  if v_i.accepted_at is not null then raise exception 'already accepted'; end if;
  if v_i.revoked_at is not null then return v_i.id; end if;   -- 2 回目は何もしない
  update public.staff_invites
     set revoked_at = v_now,
         expires_at = least(expires_at, v_now),
         token_hash = encode(sha256(convert_to('revoked:' || gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex')
   where id = v_i.id;
  perform public.audit_log_write('staff_invite_revoke', 'staff_invites:' || v_i.id::text,
    jsonb_build_object('expires_at', v_i.expires_at),
    jsonb_build_object('revoked_at', v_now), v_i.store_id);
  return v_i.id;
end $function$;
revoke execute on function public.staff_invite_revoke(uuid) from public, anon;
grant execute on function public.staff_invite_revoke(uuid) to authenticated;

-- ═══ 4. メールの結果の記録（監査に 1 行・表は作らない） ═══
CREATE OR REPLACE FUNCTION public.staff_invite_mail_note(p_invite_id uuid, p_kind text, p_status text, p_reason text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0211（起票157 の続き・相談役 11/25 朝）: 招待のメールを送った結果を監査に 1 行（action 'staff_invite_mail'）。route が送った後に呼ぶ。
--   p_kind＝'create'（発行）／'reissue'（送り直し）・p_status＝'sent'／'failed'／'skipped'・p_reason＝英小文字と数字と _ の 40 字まで（例 rate_429・timeout・no_key・demo・test_domain）。
--   宛先・トークン・URL は入れない（招待の行と staff_invite_create の監査にある）。柵は staff_invite_create と同じ・課金ゲート（A）
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_i    public.staff_invites;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_kind is null or p_kind not in ('create', 'reissue') then raise exception 'bad kind'; end if;
  if p_status is null or p_status not in ('sent', 'failed', 'skipped') then raise exception 'bad status'; end if;
  if p_reason is not null and p_reason !~ '^[a-z0-9_]{1,40}$' then raise exception 'bad reason'; end if;
  select * into v_i from public.staff_invites where id = p_invite_id and org_id = v_org;
  if v_i.id is null then raise exception 'not found'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_i.store_id = public.auth_store_id() and v_i.role = 'staff')) then raise exception 'forbidden'; end if;
  perform public.audit_log_write('staff_invite_mail', 'staff_invites:' || v_i.id::text, null,
    jsonb_build_object('kind', p_kind, 'status', p_status, 'reason', p_reason), v_i.store_id);
end $function$;
revoke execute on function public.staff_invite_mail_note(uuid, text, text, text) from public, anon;
grant execute on function public.staff_invite_mail_note(uuid, text, text, text) to authenticated;

commit;
