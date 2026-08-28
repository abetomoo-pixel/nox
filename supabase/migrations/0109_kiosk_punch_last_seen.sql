-- mig0109: kiosk_punch の打刻端末 最終アクセス（M-11b ①の打刻側・起票#31 ①）
-- 再適用可（create or replace のみ・ACL は replace で保持）・手貼り1回
-- ★収蔵原本の由来: 相談役掲出版 0109_kiosk_punch_last_seen.sql
--   （sha256 ba9b3082…b691f1・4305B）の CREATE 〜 $function$ 部を逐語。
--   dev は適用済みで、収蔵時に pg_get_functiondef と 100行/100行 完全一致を実測。
--   規約ブロック（貼り先証明・検証クエリ）は掲出版に無かったため 0091 と同型で補完した
--   ＝関数本文は無改変・begin/commit の中に proof select を1本足しただけ。
-- 内容: kiosk_punch の PIN 一致（成功）経路でのみ
--   kiosk_devices.last_seen_at = now() / last_ip = v_ip を更新する。
--   0108 が kiosk_login（レジ端末）側に入れたものの打刻端末版。
-- 不変: 署名 kiosk_punch(uuid, text, text)・SECURITY DEFINER・
--   search_path = public, extensions・返却 jsonb の形・ACL いずれも改稿前と同一。
--   money 三面鏡不触。失敗経路（bad_pin / not_found / no_pin / wrong_pin / locked）は
--   両列を触らない＝端末の「最終アクセス」は成功打刻のみを表す。
-- 正本: docs/NOX_裁定台帳.md 起票#31 ①。baseline = live_M11b.sql（sha 08c822d8…6c777d）
-- 単一トランザクション
-- 検証クエリ（適用後に別実行）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   select prosrc from pg_proc where proname = 'kiosk_punch';
--     -- 期待: last_seen_at / last_ip の update が PIN 一致後に1箇所ずつ
--   select proacl from pg_proc where proname = 'kiosk_punch';
--     -- 期待: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='kiosk_devices'
--      and column_name in ('last_seen_at','last_ip');
--     -- 期待: 2行（mig0108 で追加済み＝0109 の前提）
--   notify pgrst, 'reload schema';

begin;
select 'nox-project-proof' as proof, count(*) as orgs from public.orgs;

CREATE OR REPLACE FUNCTION public.kiosk_punch(p_cast_id uuid, p_pin text, p_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_device   public.kiosk_devices;
  v_cast     public.casts;
  v_pin      public.cast_pin;
  v_ip       text;
  v_punch_id uuid;
  v_newfail  integer;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'punch';
  if not found then raise exception 'forbidden'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  -- 形式不正 PIN は失敗カウント外（UI は4桁パッド前提・総当たりは4桁一致のみ計上）
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;

  -- 対象 cast は自店 active のみ（他店/他 org は not_found＝存在オラクル封じ）
  select c.* into v_cast from public.casts c
    where c.id = p_cast_id and c.store_id = v_device.store_id and c.is_active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select p.* into v_pin from public.cast_pin p
    where p.cast_id = p_cast_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;

  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked',
                              'locked_until', v_pin.locked_until);
  end if;

  if v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then
    v_newfail := v_pin.fail_count + 1;
    if v_newfail >= 5 then
      update public.cast_pin
         set fail_count = 0, locked_until = now() + interval '15 minutes', updated_at = now()
       where cast_id = p_cast_id;
    else
      update public.cast_pin
         set fail_count = v_newfail, updated_at = now()
       where cast_id = p_cast_id;
    end if;
    insert into public.audit_logs
      (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values
      (v_device.org_id, v_device.store_id, null, 'kiosk_punch',
       'cast_pin:' || p_cast_id::text, null,
       jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', p_cast_id,
                          'result', 'wrong_pin', 'fail_count', v_newfail,
                          'locked', v_newfail >= 5),
       v_ip);
    if v_newfail >= 5 then
      return jsonb_build_object('ok', false, 'reason', 'locked',
                                'locked_until', now() + interval '15 minutes');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  -- PIN 一致: カウンタ復元 → 盲目記録 INSERT（punch_self 逐語型・source='kiosk'）
  update public.cast_pin
     set fail_count = 0, locked_until = null, updated_at = now()
   where cast_id = p_cast_id;

  -- 0109: 打刻端末の最終アクセス（成功経路のみ・引き継ぎv18 §3 のとおり）
  update public.kiosk_devices
     set last_seen_at = now(), last_ip = v_ip
   where id = v_device.id;

  insert into public.punches (org_id, store_id, cast_id, type, lat, lng, ip, source)
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_type, null, null, v_ip, 'kiosk')
  returning id into v_punch_id;

  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, null, 'kiosk_punch',
     'punches:' || v_punch_id::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', p_cast_id,
                        'type', p_type, 'result', 'ok'),
     v_ip);

  return jsonb_build_object('ok', true, 'punch_id', v_punch_id, 'punched_at', now());
end $function$;

commit;
-- ===== end mig0109 =====
