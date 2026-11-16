-- 0201m_kiosk_unlock_people.sql（2026-11-13 夜・CC 起草・貼らない＝合図は相談役）店の端末のロック中に「名前を選んで入る」一覧＝レジに入れる人（相談役■6・report_kiosk_lock_1113.md）
-- 翻訳元: kiosk_staff_list（0201g の版＝打刻の一覧＝店長とスタッフだけ・店長の打刻の許可 OFF の店は店長を出さない）とは別に、kiosk_login（0201 の版＝supabase/migrations/0201_punch_rules_pin.sql）が通す人と同じ条件の読取を 1 本足す
-- 検証クエリ: docs/tmp/0201m_verify.sql（1 回の SELECT で全行・先頭は貼り先証明 select 'nox-project-proof', count(*) from public.orgs;）
-- 事前確認: docs/tmp/0201m_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）・手順書 docs/tmp/handpaste_0201m.md
-- 前提＝0201d の後（関数 449・表 122）。0201j・体入の mig（0201l）とは関数が重ならない＝順は問わない（数の期待だけ直す）。
-- ★1 kiosk_unlock_people()＝店の端末（auth_kiosk_store_id）から読める自店の人＝kiosk_login が通す人と同じ条件：有効な所属・有効な利用者・役割 owner／admin／manager／staff・cast は本人の can_register かつ店のレジ使用（sys_cast_register）≥1・PIN の行がある
--     （店長の打刻の許可（manager_punch_enabled）は見ない＝レジの入口の判定に入っていないため。端末でない接続は auth_kiosk_store_id が null＝0 行）
-- ★2 ACL＝authenticated だけ（anon・public は revoke）・書込なし＝監査なし・課金のゲートなし（読取＝B(f) と同列）
-- 関数 +1（449→450）・表は不変。既存の行は書き換えない（控え不要）。
-- ★教訓132: begin の直後に lock_timeout
begin;
set local lock_timeout = '10s';

create or replace function public.kiosk_unlock_people()
returns table(membership_id uuid, user_name text, role text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- ★0201m（相談役■6・2026-11-13）: 店の端末のロック中に「名前を選んで入る」一覧＝kiosk_login が通す人と同じ条件（0201_punch_rules_pin.sql の kiosk_login の操作担当の候補）。端末でない接続は 0 行
  select m.id, u.name, m.role
    from public.memberships m
    join public.users u on u.id = m.user_id
   where m.store_id = public.auth_kiosk_store_id()
     and m.is_active and u.is_active
     and (m.role in ('owner','admin','manager','staff')
          or (m.role = 'cast' and m.can_register
              and coalesce((select (s.settings_json->>'sys_cast_register')::int from public.stores s where s.id = m.store_id), 0) >= 1))
     and exists (select 1 from public.staff_pin p where p.membership_id = m.id)
   order by u.name
$function$;
revoke all on function public.kiosk_unlock_people() from public, anon;
grant execute on function public.kiosk_unlock_people() to authenticated;

commit;
