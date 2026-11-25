-- 0215_staff_password_reissue（相談役 11/25 の便 D1・メール無しのスタッフが忘れたとき、店が初期パスワードを出し直す＝その監査の関数 1 本・起草と試走まで・適用はしない）
--   決め（相談役 11/25）：店（オーナー・自店の店長）が初期パスワードを出し直す道を作る。出し直した人には初回の変更の印を付け、監査に残す。本人の変更は DB の監査に残さない。
--   作り：パスワードを変えるのは route（admin.updateUserById・app_metadata.must_change_password=true）。DB の関数は「出してよいか」の柵と監査だけ（パスワードは DB に来ない）。
--     route は関数が通ったときだけパスワードを変える（先に記録＝D8 のパスワードの変更と同じ考え）。返りは相手の auth の id（route が同じ人を変える）。
--   柵：二重防御・オーナーは自社の全店・店長は自店の staff だけ（staff_invite_reissue と同じ形）・相手はメール無し（ログイン ID が合成の @o-….nox.local）の有効なスタッフだけ・デモの会社は断る。
--   課金ゲートの外（B＝ログインの回復・キャストのパスワードの再発行と同じ扱い）。1 日の回数は数えない（決めてほしい点）。
--   翻訳元：0211 の staff_invite_reissue の柵と監査。数：関数 +1・表 ±0。前提＝関数 490・表 128（0211 の後）。当てる直前に本番から数え直す。
--   検証クエリ：docs/tmp/staff_pw_1125/0215_verify.sql（先頭は貼り先証明 select 'nox-project-proof', count(*) from public.orgs）。
begin;
set local lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.staff_password_reissue_note(p_membership_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_st    uuid := public.auth_store_id();
  v_demo  boolean;
  v_m     public.memberships;
  v_u     public.users;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if v_role not in ('owner', 'manager') then raise exception 'forbidden'; end if;
  select is_demo into v_demo from public.orgs where id = v_org;
  if coalesce(v_demo, false) then raise exception 'forbidden'; end if;
  select m.* into v_m from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_membership_id and s.org_id = v_org;   -- memberships に org_id は無い＝店で会社を見る
  if v_m.id is null then raise exception 'not found'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_st is not null and v_m.store_id = v_st)) then raise exception 'forbidden'; end if;
  if v_m.role <> 'staff' or not v_m.is_active then raise exception 'not staff'; end if;
  select * into v_u from public.users where id = v_m.user_id;
  if v_u.id is null or not v_u.is_active or v_u.auth_user_id is null then raise exception 'not found'; end if;
  if lower(coalesce(v_u.email, '')) !~ '@o-[0-9a-f]{8}\.nox\.local$' then raise exception 'has email'; end if;   -- メールのある人は本人が「パスワードを忘れた方」から
  perform public.audit_log_write('staff_password_reissue', 'memberships:' || v_m.id::text, null, jsonb_build_object('user_id', v_u.id, 'must_change', true), v_m.store_id);
  return v_u.auth_user_id;
end $function$;
revoke execute on function public.staff_password_reissue_note(uuid) from public, anon;
grant execute on function public.staff_password_reissue_note(uuid) to authenticated;

commit;
