-- 0201e2_kiosk_checks_fix.sql（2026-11-12 夜・CC 起草・貼らない＝合図は相談役）
-- 翻訳元: 本番の auth_cast_register_active（0201e ★3・md5 は検証で照合）
-- 事象: 0201e の後、キオスクの端末のセッション（auth_store_id() が null）で伝票（checks ほか 6 表）を読むと 'forbidden'
--       ＝ポリシーのキャストの枝の auth_cast_register_active() が biz_date_of(null, now()) を呼び、biz_date_of が店なしで raise（line 10）。
--       Postgres は OR／AND の評価順を保証しない＝auth_role()='cast' が偽でも関数が呼ばれる。キオスクのレジが伝票を読めない（本番 2026-11-12 夜に読取で再現）。
-- 直し: CASE で「キャストで店がある」ときだけ中を評価する（CASE は分岐の評価順を保証）。署名・ACL・中身の判定は不変。
-- 検証クエリ: docs/tmp/0201e2_verify.sql（先頭に貼り先証明）
begin;
set local lock_timeout = '10s';
create or replace function public.auth_cast_register_active()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  -- ★0201e ★3（相談役 11/11 の 4＝案 B）: 退勤後のキャストは伝票を読めない＝レジの許可（auth_cast_can_register）∧ 今日の営業日に出勤中
  -- ★0201e2（2026-11-12 夜）: キャスト以外・店なし（キオスクの端末のセッション）は中を評価しない＝biz_date_of(null) の 'forbidden' を出さない
  select case when public.auth_role() = 'cast' and public.auth_store_id() is not null
    then coalesce(public.auth_cast_can_register()
      and public.on_duty_of('cast', public.auth_cast_id(), public.auth_store_id(), public.biz_date_of(public.auth_store_id(), now())), false)
    else false end
$function$;
revoke execute on function public.auth_cast_register_active() from public, anon;
grant execute on function public.auth_cast_register_active() to authenticated;
commit;
