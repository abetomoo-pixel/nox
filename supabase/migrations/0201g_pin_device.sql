-- 0201g_pin_device.sql（2026-11-13 作り直し 4＝相談役の照合：本人による PIN の設定は 24 時間に 5 回まで（成功と 'taken' を数える・'too_many'）・本人の PIN の設定に人ごとの錠（pg_advisory_xact_lock）・kiosk_unlock の端末の行を for update（3 本だけ）・作り直し 3＝相談役の照合：PIN の行が無い本人の 'taken' も監査の記録で数えてロック（staff_pin_self_set／cast_pin_self_set の 2 本だけ）・2026-11-11 夜便・2026-11-12 作り直し＝■14（名前を選んだ入口は端末のロックを見ない・本人の側で数える／本人の PIN の変更のロックの既定 15 分）・2026-11-12 作り直し 2＝ハードの保存の検査は打刻のキーを含む保存だけ／either は IP か位置と半径／明示の null／store_wifi_remove の最後の 1 件・M-156 PIN の重複／推測されやすい PIN／端末ごとのロック＋kiosk_staff_list＋ハードの保存の検査・貼らない＝合図は相談役）
-- 翻訳元: 本番の pg_get_functiondef（docs/tmp/dump_live0201g3.mjs＝7 本）＋ set_store_profile は 0201c の生成物＋生成器 docs/tmp/gen_0201g.cjs（アンカー置換・行の途中にコメントを入れない＝教訓138）
-- 検証クエリ: docs/tmp/0201g_verify.sql（先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）
-- 前提＝0201b・0201c の後（set_store_profile を 0201c の版から作る）・デモの人ごとの PIN が本番に出ていること（便 3＝45723fa2・済）。
-- ★1 kiosk_devices＋fail_count・locked_until（端末ごとのロック）
-- ★2 pin_guessable（推測されやすい PIN）・pin_taken_in_store（同じ店の他の人の PIN と crypt で照合・同じ人の staff_pin と cast_pin は除く）＝内部専用（4 ロール revoke）
-- ★3 set_staff_pin／set_cast_pin＝'pin weak'／'pin taken'（raise）／staff_pin_self_set／cast_pin_self_set＝'weak'／'taken'（taken は失敗として数えロック・監査）
-- ★4 kiosk_unlock＝一致 0 と複数一致（名前を返さない）を端末ごとの失敗として数え、上限でロック（店の pin_lock_max_fail／pin_lock_minutes）・成功で 0 に戻す・監査
-- ★5 kiosk_staff_list＝店長の打刻の許可（manager_punch_enabled）が OFF の店は店長を出さない
-- ★6 set_store_profile＝ハードの保存の検査（打刻のキーを含む保存だけ・patch の値は明示の null も含む・restrict_mode が null は gps・ip＝IP 1 件以上／gps＝位置と半径／both＝両方／either＝どちらか・'ip required'／'range required'）
-- ★7 store_wifi_remove＝消すとハードの条件を満たさなくなる最後の 1 件は消させない（'ip required'）
-- 関数 +2（pin_guessable・pin_taken_in_store）・作り直し 8・表 121 不変・列 kiosk_devices +2。既存の重複は拒否しない（設定のときだけ）。
-- ★教訓132: begin の直後に lock_timeout
begin;
set local lock_timeout = '10s';

-- ═══ ★1 kiosk_devices の失敗回数とロック ═══
alter table public.kiosk_devices add column if not exists fail_count integer not null default 0;
alter table public.kiosk_devices add column if not exists locked_until timestamptz;
alter table public.kiosk_devices add constraint kiosk_devices_fail_count_check check (fail_count >= 0);
comment on column public.kiosk_devices.fail_count is '★0201g（M-156）: PIN だけの解除（kiosk_unlock）の連続失敗（一致 0・複数一致）＝上限で locked_until';

-- ═══ ★2 内部専用の 2 本 ═══
create or replace function public.pin_guessable(p_pin text)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  -- ★0201g（M-156 の追記）: 推測されやすい PIN＝同じ数字・上り下りの連番・2 桁の繰り返し・よく使われる並び（lib/nox/demo/pin.ts の guessablePinOf と同じ規則）
  select p_pin is null or p_pin !~ '^[0-9]{4,6}$'
      or p_pin ~ '^(\d)\1+$'
      or p_pin ~ '^(\d\d)\1$'
      or p_pin = any (array['1212','2121','1122','6969','1004','2000','2001','2020','1010','0101','1313','4545','7777'])
      or position(p_pin in '01234567890123456789') > 0
      or position(p_pin in '98765432109876543210') > 0
$function$;
revoke execute on function public.pin_guessable(text) from public, anon, authenticated, service_role;

create or replace function public.pin_taken_in_store(p_store_id uuid, p_pin text, p_membership_id uuid, p_cast_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  -- ★0201g（M-156）: 同じ店の有効な人（スタッフ＝memberships・キャスト＝casts）の PIN と照合。同じ人（同じ users の staff_pin と cast_pin）は除く。誰の PIN かは返さない
  with me as (
    select coalesce((select m.user_id from public.memberships m where m.id = p_membership_id), (select c.user_id from public.casts c where c.id = p_cast_id)) uid
  )
  select exists (
      select 1 from public.staff_pin sp join public.memberships m on m.id = sp.membership_id join public.users u on u.id = m.user_id, me
       where sp.store_id = p_store_id and m.is_active and u.is_active
         and sp.membership_id is distinct from p_membership_id and (me.uid is null or m.user_id <> me.uid)
         and sp.pin_hash = crypt(p_pin, sp.pin_hash))
   or exists (
      select 1 from public.cast_pin cp join public.casts c on c.id = cp.cast_id, me
       where cp.store_id = p_store_id and c.is_active
         and cp.cast_id is distinct from p_cast_id and (me.uid is null or c.user_id is null or c.user_id <> me.uid)
         and cp.pin_hash = crypt(p_pin, cp.pin_hash))
$function$;
revoke execute on function public.pin_taken_in_store(uuid, text, uuid, uuid) from public, anon, authenticated, service_role;

-- ═══ ★3 PIN の設定 4 本（同じ署名・ACL 不変） ═══
CREATE OR REPLACE FUNCTION public.set_staff_pin(p_membership_id uuid, p_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_org uuid := public.auth_org_id();
  v_mem record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$'   /* ★0191（便 OB-2 ⑤）: PIN 4〜6 桁 */ then raise exception 'bad pin'; end if;
  -- memberships は org 列を持たない＝store 経由で org 照合（他 org は not found＝存在オラクル封じ）
  select m.id, m.store_id, m.role, m.is_active, m.can_register into v_mem
    from public.memberships m join public.stores s on s.id = m.store_id
   where m.id = p_membership_id and s.org_id = v_org;
  if v_mem.id is null then raise exception 'not found'; end if;
  if not v_mem.is_active then raise exception 'inactive membership'; end if;
  if not (v_mem.role in ('owner','admin','manager') or v_mem.role = 'staff' or (v_mem.role = 'cast' and v_mem.can_register)) then   -- ★3 0173（389 追補1）: ON のキャストにレジ端末の PIN・staff は can_register に関わらず（0174 の打刻端末 staff_punch＝PIN 照合・レジ候補は kiosk_login 側で can_register を見る）
    raise exception 'bad target';
  end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_mem.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- ★0201g（M-156・2026-11-11 Agoora 確定）: 推測されやすい PIN と同じ店の他の人の PIN は拒否（誰の PIN かは返さない）
  if public.pin_guessable(p_pin) then raise exception 'pin weak'; end if;
  if public.pin_taken_in_store(v_mem.store_id, p_pin, p_membership_id, null) then raise exception 'pin taken'; end if;

  insert into public.staff_pin (membership_id, org_id, store_id, pin_hash)
  values (p_membership_id, v_org, v_mem.store_id, crypt(p_pin, gen_salt('bf')))
  on conflict (membership_id) do update
    set pin_hash = excluded.pin_hash,
        store_id = excluded.store_id,
        fail_count = 0,
        locked_until = null,
        updated_at = now();

  perform public.audit_log_write('set_staff_pin', 'staff_pin:' || p_membership_id::text,
    null, jsonb_build_object('membership_id', p_membership_id, 'reset', true), v_mem.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.set_cast_pin(p_cast_id uuid, p_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_cast public.casts;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$'   /* ★0191（便 OB-2 ⑤）: PIN 4〜6 桁 */ then raise exception 'bad pin'; end if;
  select c.* into v_cast from public.casts c
    where c.id = p_cast_id and c.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- ★0201g（M-156・2026-11-11 Agoora 確定）: 推測されやすい PIN と同じ店の他の人の PIN は拒否（誰の PIN かは返さない）
  if public.pin_guessable(p_pin) then raise exception 'pin weak'; end if;
  if public.pin_taken_in_store(v_cast.store_id, p_pin, null, p_cast_id) then raise exception 'pin taken'; end if;

  insert into public.cast_pin (cast_id, org_id, store_id, pin_hash)
  values (p_cast_id, v_cast.org_id, v_cast.store_id, crypt(p_pin, gen_salt('bf')))
  on conflict (cast_id) do update
    set pin_hash = excluded.pin_hash,
        store_id = excluded.store_id,
        fail_count = 0,
        locked_until = null,
        updated_at = now();

  perform public.audit_log_write('set_cast_pin', 'cast_pin:' || p_cast_id::text,
    null, jsonb_build_object('cast_id', p_cast_id, 'reset', true), v_cast.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.staff_pin_self_set(p_current text, p_new text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_mid uuid := public.auth_membership_id(); v_mem record; v_pin public.staff_pin;
  v_settings jsonb; v_max integer; v_lock interval;
  v_nt integer; v_nt_at timestamptz;   -- ★0201g 作り直し 3: 行が無い人の 'taken' の数（監査の記録）
  v_nd integer; v_nd_at timestamptz;   -- ★0201g 作り直し 4: 直近 24 時間の本人の設定の試み（成功と 'taken'）の数と、いちばん古い記録の時刻
begin
  if public.auth_org_id() is null or v_mid is null then raise exception 'forbidden'; end if;
  select m.id, m.store_id, m.role, s.org_id, s.settings_json into v_mem from public.memberships m join public.stores s on s.id = m.store_id where m.id = v_mid and m.is_active;
  if v_mem.id is null or v_mem.role not in ('manager','staff') then raise exception 'forbidden'; end if;
  -- ★0201g 作り直し 4（2026-11-13 相談役）: 本人の確かめの直後に人ごとの錠＝同じ人の同時の呼び出しを順に並べる（行が無い人の監査の数え方と 24 時間の上限を、全部が同じ数で読んで照合まで進むのを止める）
  perform pg_advisory_xact_lock(hashtextextended('staff_pin_self:' || v_mid::text, 0));
  if p_new is null or p_new !~ '^[0-9]{4,6}$' then return jsonb_build_object('ok', false, 'reason', 'bad pin'); end if;
  v_settings := coalesce(v_mem.settings_json, '{}'::jsonb);
  v_max  := coalesce(nullif(trim(v_settings->>'pin_lock_max_fail'), '')::int, 5);
  -- ★0201g 作り直し（2026-11-12 Agoora ■14 b・仮置き 4）: ロックの分数の既定を店の設定の既定（15 分＝set_store_pin_policy・端末のロック）に揃える（旧 10）
  v_lock := make_interval(mins => coalesce(nullif(trim(v_settings->>'pin_lock_minutes'), '')::int, 15));
  select * into v_pin from public.staff_pin where membership_id = v_mid for update;
  if found then
    if v_pin.locked_until is not null and v_pin.locked_until > now() then return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_pin.locked_until); end if;
    if p_current is null or v_pin.pin_hash <> crypt(p_current, v_pin.pin_hash) then
      if v_pin.fail_count + 1 >= v_max then
        update public.staff_pin set fail_count = 0, locked_until = now() + v_lock, updated_at = now() where membership_id = v_mid;
      else
        update public.staff_pin set fail_count = v_pin.fail_count + 1, updated_at = now() where membership_id = v_mid;
      end if;
      perform public.audit_log_write('staff_pin_self_fail', 'staff_pin:' || v_mid::text, null, jsonb_build_object('membership_id', v_mid, 'locked', v_pin.fail_count + 1 >= v_max), v_mem.store_id);
      if v_pin.fail_count + 1 >= v_max then return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', now() + v_lock); end if;
      return jsonb_build_object('ok', false, 'reason', 'bad current');
    end if;
  end if;
  -- ★0201g 作り直し 3（2026-11-13 相談役の照合・権限）: PIN の行がまだ無い人は 'taken' を数える行が無い＝監査の記録（staff_pin_self_taken・本人・直近 v_lock の間）で数え、上限なら照合の前に 'locked'（raise せず return＝数えた記録は残る）
  if v_pin.membership_id is null then
    select count(*)::int, (array_agg(a.at order by a.at desc))[v_max] into v_nt, v_nt_at
      from public.audit_logs a where a.action = 'staff_pin_self_taken' and a.target = 'staff_pin:' || v_mid::text and a.at > now() - v_lock;
    if v_nt >= v_max then return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_nt_at + v_lock); end if;
  end if;
  -- ★0201g（M-156）: 推測されやすい PIN＝'weak'（数えない）／同じ店の他の人の PIN＝'taken'（失敗として数えロック・監査＝他人の PIN を探られないように・誰の PIN かは返さない）
  if public.pin_guessable(p_new) then return jsonb_build_object('ok', false, 'reason', 'weak'); end if;
  -- ★0201g 作り直し 4（2026-11-13 相談役・本人による PIN の設定は 24 時間に 5 回まで）: 本人の staff_pin_self_set（成功）と staff_pin_self_taken（'taken'）を直近 24 時間で数え、5 件以上なら照合せずに 'too_many'（raise しない）
  --   使われていない PIN への変更を繰り返して他人の PIN を探るのを止める・'weak' は数えない・retry_at＝窓の中でいちばん古い記録＋24 時間
  select count(*)::int, min(a.at) into v_nd, v_nd_at
    from public.audit_logs a where a.action in ('staff_pin_self_set', 'staff_pin_self_taken') and a.target = 'staff_pin:' || v_mid::text and a.at > now() - interval '24 hours';
  if v_nd >= 5 then return jsonb_build_object('ok', false, 'reason', 'too_many', 'retry_at', v_nd_at + interval '24 hours'); end if;
  if public.pin_taken_in_store(v_mem.store_id, p_new, v_mid, null) then
    if v_pin.membership_id is not null then
      if v_pin.fail_count + 1 >= v_max then
        update public.staff_pin set fail_count = 0, locked_until = now() + v_lock, updated_at = now() where membership_id = v_mid;
      else
        update public.staff_pin set fail_count = v_pin.fail_count + 1, updated_at = now() where membership_id = v_mid;
      end if;
    end if;
    perform public.audit_log_write('staff_pin_self_taken', 'staff_pin:' || v_mid::text, null, jsonb_build_object('membership_id', v_mid, 'reason', 'taken', 'locked', case when v_pin.membership_id is not null then v_pin.fail_count + 1 >= v_max else v_nt + 1 >= v_max end), v_mem.store_id);
    if v_pin.membership_id is not null and v_pin.fail_count + 1 >= v_max then return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', now() + v_lock); end if;
    -- ★0201g 作り直し 3: 行が無い人＝今の 1 回を足して上限なら 'locked'（locked_until＝直近 v_max 回目の記録＋v_lock）
    if v_pin.membership_id is null then
      select count(*)::int, (array_agg(a.at order by a.at desc))[v_max] into v_nt, v_nt_at
        from public.audit_logs a where a.action = 'staff_pin_self_taken' and a.target = 'staff_pin:' || v_mid::text and a.at > now() - v_lock;
      if v_nt >= v_max then return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_nt_at + v_lock); end if;
    end if;
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  insert into public.staff_pin (membership_id, org_id, store_id, pin_hash) values (v_mid, v_mem.org_id, v_mem.store_id, crypt(p_new, gen_salt('bf')))
  on conflict (membership_id) do update set pin_hash = excluded.pin_hash, fail_count = 0, locked_until = null, updated_at = now();
  perform public.audit_log_write('staff_pin_self_set', 'staff_pin:' || v_mid::text, null, jsonb_build_object('membership_id', v_mid, 'self', true), v_mem.store_id);
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.cast_pin_self_set(p_current text, p_new text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_cid uuid := public.auth_cast_id(); v_cast public.casts; v_pin public.cast_pin;
  v_settings jsonb; v_max integer; v_lock interval;
  v_nt integer; v_nt_at timestamptz;   -- ★0201g 作り直し 3: 行が無い人の 'taken' の数（監査の記録）
  v_nd integer; v_nd_at timestamptz;   -- ★0201g 作り直し 4: 直近 24 時間の本人の設定の試み（成功と 'taken'）の数と、いちばん古い記録の時刻
begin
  if public.auth_org_id() is null or v_cid is null then raise exception 'forbidden'; end if;
  select * into v_cast from public.casts where id = v_cid and is_active;
  if v_cast.id is null then raise exception 'forbidden'; end if;
  -- ★0201g 作り直し 4（2026-11-13 相談役）: 本人の確かめの直後に人ごとの錠＝同じ人の同時の呼び出しを順に並べる（行が無い人の監査の数え方と 24 時間の上限を、全部が同じ数で読んで照合まで進むのを止める）
  perform pg_advisory_xact_lock(hashtextextended('cast_pin_self:' || v_cid::text, 0));
  if p_new is null or p_new !~ '^[0-9]{4,6}$' then return jsonb_build_object('ok', false, 'reason', 'bad pin'); end if;
  v_settings := coalesce((select s.settings_json from public.stores s where s.id = v_cast.store_id), '{}'::jsonb);
  v_max  := coalesce(nullif(trim(v_settings->>'pin_lock_max_fail'), '')::int, 5);
  -- ★0201g 作り直し（2026-11-12 Agoora ■14 b・仮置き 4）: ロックの分数の既定を店の設定の既定（15 分＝set_store_pin_policy・端末のロック）に揃える（旧 10）
  v_lock := make_interval(mins => coalesce(nullif(trim(v_settings->>'pin_lock_minutes'), '')::int, 15));
  select * into v_pin from public.cast_pin where cast_id = v_cid for update;
  if found then
    if v_pin.locked_until is not null and v_pin.locked_until > now() then return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_pin.locked_until); end if;
    if p_current is null or v_pin.pin_hash <> crypt(p_current, v_pin.pin_hash) then
      if v_pin.fail_count + 1 >= v_max then
        update public.cast_pin set fail_count = 0, locked_until = now() + v_lock, updated_at = now() where cast_id = v_cid;
      else
        update public.cast_pin set fail_count = v_pin.fail_count + 1, updated_at = now() where cast_id = v_cid;
      end if;
      perform public.audit_log_write('cast_pin_self_fail', 'cast_pin:' || v_cid::text, null, jsonb_build_object('cast_id', v_cid, 'locked', v_pin.fail_count + 1 >= v_max), v_cast.store_id);
      if v_pin.fail_count + 1 >= v_max then return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', now() + v_lock); end if;
      return jsonb_build_object('ok', false, 'reason', 'bad current');
    end if;
  end if;
  -- ★0201g 作り直し 3（2026-11-13 相談役の照合・権限）: PIN の行がまだ無い人は 'taken' を数える行が無い＝監査の記録（cast_pin_self_taken・本人・直近 v_lock の間）で数え、上限なら照合の前に 'locked'（raise せず return＝数えた記録は残る）
  if v_pin.cast_id is null then
    select count(*)::int, (array_agg(a.at order by a.at desc))[v_max] into v_nt, v_nt_at
      from public.audit_logs a where a.action = 'cast_pin_self_taken' and a.target = 'cast_pin:' || v_cid::text and a.at > now() - v_lock;
    if v_nt >= v_max then return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_nt_at + v_lock); end if;
  end if;
  -- ★0201g（M-156）: 推測されやすい PIN＝'weak'（数えない）／同じ店の他の人の PIN＝'taken'（失敗として数えロック・監査＝他人の PIN を探られないように・誰の PIN かは返さない）
  if public.pin_guessable(p_new) then return jsonb_build_object('ok', false, 'reason', 'weak'); end if;
  -- ★0201g 作り直し 4（2026-11-13 相談役・本人による PIN の設定は 24 時間に 5 回まで）: 本人の cast_pin_self_set（成功）と cast_pin_self_taken（'taken'）を直近 24 時間で数え、5 件以上なら照合せずに 'too_many'（raise しない）
  --   使われていない PIN への変更を繰り返して他人の PIN を探るのを止める・'weak' は数えない・retry_at＝窓の中でいちばん古い記録＋24 時間
  select count(*)::int, min(a.at) into v_nd, v_nd_at
    from public.audit_logs a where a.action in ('cast_pin_self_set', 'cast_pin_self_taken') and a.target = 'cast_pin:' || v_cid::text and a.at > now() - interval '24 hours';
  if v_nd >= 5 then return jsonb_build_object('ok', false, 'reason', 'too_many', 'retry_at', v_nd_at + interval '24 hours'); end if;
  if public.pin_taken_in_store(v_cast.store_id, p_new, null, v_cid) then
    if v_pin.cast_id is not null then
      if v_pin.fail_count + 1 >= v_max then
        update public.cast_pin set fail_count = 0, locked_until = now() + v_lock, updated_at = now() where cast_id = v_cid;
      else
        update public.cast_pin set fail_count = v_pin.fail_count + 1, updated_at = now() where cast_id = v_cid;
      end if;
    end if;
    perform public.audit_log_write('cast_pin_self_taken', 'cast_pin:' || v_cid::text, null, jsonb_build_object('cast_id', v_cid, 'reason', 'taken', 'locked', case when v_pin.cast_id is not null then v_pin.fail_count + 1 >= v_max else v_nt + 1 >= v_max end), v_cast.store_id);
    if v_pin.cast_id is not null and v_pin.fail_count + 1 >= v_max then return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', now() + v_lock); end if;
    -- ★0201g 作り直し 3: 行が無い人＝今の 1 回を足して上限なら 'locked'（locked_until＝直近 v_max 回目の記録＋v_lock）
    if v_pin.cast_id is null then
      select count(*)::int, (array_agg(a.at order by a.at desc))[v_max] into v_nt, v_nt_at
        from public.audit_logs a where a.action = 'cast_pin_self_taken' and a.target = 'cast_pin:' || v_cid::text and a.at > now() - v_lock;
      if v_nt >= v_max then return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_nt_at + v_lock); end if;
    end if;
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  insert into public.cast_pin (cast_id, org_id, store_id, pin_hash) values (v_cid, v_cast.org_id, v_cast.store_id, crypt(p_new, gen_salt('bf')))
  on conflict (cast_id) do update set pin_hash = excluded.pin_hash, store_id = excluded.store_id, fail_count = 0, locked_until = null, updated_at = now();
  perform public.audit_log_write('cast_pin_self_set', 'cast_pin:' || v_cid::text, null, jsonb_build_object('cast_id', v_cid, 'self', true), v_cast.store_id);
  return jsonb_build_object('ok', true);
end $function$;

-- ═══ ★4 kiosk_unlock（同じ署名・ACL 不変） ═══
CREATE OR REPLACE FUNCTION public.kiosk_unlock(p_pin text, p_membership_id uuid DEFAULT NULL::uuid, p_device_fp text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
-- ★27 0175 v2（裁定423 候補・R-7）: レジ端末の解除＝誰かを選ばず PIN だけで本人を特定（staff_pin＝owner／admin／manager／staff（★0196 裁定456 の 1＝can_register を見ない）／cast can_register かつ店のキャストのレジ使用 ≥1）。
--   一致 0＝wrong_pin（人を特定できないので失敗回数は数えない）・一致 2 人以上で p_membership_id なし＝ambiguous（候補の名前を返す）・特定できたら kiosk_login（失敗回数・ロック・セッション・audit は従来のまま）
declare
  v_device record; v_n int; v_mid uuid; v_cands jsonb;
  v_res jsonb;   -- ★0201g 作り直し（2026-11-12 Agoora ■14 a）: 名前を選んだ入口の kiosk_login の返り
  v_max int; v_lock interval;   -- ★0201g（M-156）: 端末ごとのロック（店の pin_lock_max_fail／pin_lock_minutes＝set_store_pin_policy と同じ値）
begin
  -- ★0201g 作り直し 4（2026-11-13 相談役）: 端末の行を for update で読む＝同じ端末の同時の解除を順に並べる（失敗回数を全部が同じ値で読んで照合まで進むのを止める）
  select k.* into v_device from public.kiosk_devices k where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */ for update;
  if not found then raise exception 'forbidden'; end if;
  if v_device.device_fp is not null and (p_device_fp is null or p_device_fp <> v_device.device_fp) then raise exception 'device bound'; end if;   -- ★0190（裁定436 ①b）: 束縛済みの端末は同じ fp からだけ（未束縛＝旧 client の間は従来どおり）
  -- ★0201g 作り直し（2026-11-12 Agoora ■14 a）: 名前を選んだ入口（p_membership_id あり）は端末のロックを見ない・端末の失敗回数に数えない
  --   照合と本人の失敗回数・ロック・監査、自店・有効・入れる役割の確かめは kiosk_login（PIN の違いも本人の側で必ず数える）
  if p_membership_id is not null then
    v_res := public.kiosk_login(p_membership_id, p_pin, p_device_fp);
    if coalesce((v_res->>'ok')::boolean, false) then
      return v_res || jsonb_build_object('idle_sec', coalesce((select (st.settings_json->>'kiosk_idle_sec')::int from public.stores st where st.id = v_device.store_id), 900));
    end if;
    return v_res;
  end if;
  -- ★0201g（M-156）: 端末がロック中なら照合しない（PIN だけの入口）
  if v_device.locked_until is not null and v_device.locked_until > now() then return jsonb_build_object('ok', false, 'reason', 'device_locked', 'locked_until', v_device.locked_until); end if;
  select coalesce(nullif(trim(st.settings_json->>'pin_lock_max_fail'), '')::int, 5), make_interval(mins => coalesce(nullif(trim(st.settings_json->>'pin_lock_minutes'), '')::int, 15))
    into v_max, v_lock from public.stores st where st.id = v_device.store_id;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then return jsonb_build_object('ok', false, 'reason', 'bad_pin'); end if;
  select count(*), (array_agg(m.id))[1], jsonb_agg(jsonb_build_object('membership_id', m.id, 'name', u.name, 'role', m.role))
    into v_n, v_mid, v_cands
    from public.staff_pin sp
    join public.memberships m on m.id = sp.membership_id
    join public.users u on u.id = m.user_id
   where sp.store_id = v_device.store_id and m.is_active and u.is_active
     and (sp.locked_until is null or sp.locked_until < now())
     and (m.role in ('owner','admin','manager') or m.role = 'staff'   -- ★0196（裁定456 の 1）: staff は can_register に関係なく PIN で入れる（PIN の入口＝kiosk_login と同じ判定）
          or (m.role = 'cast' and m.can_register and coalesce((select (st.settings_json->>'sys_cast_register')::int from public.stores st where st.id = m.store_id), 0) >= 1))
     and sp.pin_hash = crypt(p_pin, sp.pin_hash)
     and (p_membership_id is null or m.id = p_membership_id);
  -- ★0201g（M-156・2026-11-11 Agoora 確定 (a)）: 一致 0 と複数一致（名前を返さない）＝端末ごとの失敗として数え、上限でロック・監査
  if coalesce(v_n, 0) = 0 or (v_n > 1 and p_membership_id is null) then
    if v_device.fail_count + 1 >= v_max then
      update public.kiosk_devices set fail_count = 0, locked_until = now() + v_lock, updated_at = now() where id = v_device.id;
    else
      update public.kiosk_devices set fail_count = v_device.fail_count + 1, updated_at = now() where id = v_device.id;
    end if;
    perform public.audit_log_write('kiosk_unlock_fail', 'kiosk_devices:' || v_device.id::text, null, jsonb_build_object('reason', case when coalesce(v_n, 0) = 0 then 'wrong_pin' else 'ambiguous' end, 'locked', v_device.fail_count + 1 >= v_max), v_device.store_id);
    if v_device.fail_count + 1 >= v_max then return jsonb_build_object('ok', false, 'reason', 'device_locked', 'locked_until', now() + v_lock); end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;
  update public.kiosk_devices set fail_count = 0, locked_until = null, updated_at = now() where id = v_device.id and (fail_count <> 0 or locked_until is not null);
  return public.kiosk_login(v_mid, p_pin, p_device_fp) /* ★0196: 束縛済みの端末で inner の kiosk_login が 'device bound' にならないよう fp を渡す */ || jsonb_build_object('idle_sec', coalesce((select (st.settings_json->>'kiosk_idle_sec')::int from public.stores st where st.id = v_device.store_id), 900));
end $function$;

-- ═══ ★5 kiosk_staff_list（同じ署名・ACL 不変） ═══
CREATE OR REPLACE FUNCTION public.kiosk_staff_list()
 RETURNS TABLE(membership_id uuid, user_name text, role text, has_pin boolean, last_kind text, last_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- ★5 0174（P172 Q-4 の積み残し）: 打刻端末（kiosk_devices purpose 'punch'）から読める自店のスタッフ（manager／staff・cast は kiosk_cast_list）。
  --   last_kind／last_at＝当営業日の最後の打刻（UI の出勤中／退勤済みの表示）。
  select m.id, u.name, m.role,
         exists (select 1 from public.staff_pin p where p.membership_id = m.id),
         (select sp.kind from public.staff_punches sp
           where sp.membership_id = m.id and sp.biz_date = public.biz_date_of(m.store_id, now())
           order by sp.punched_at desc limit 1),
         (select sp.punched_at from public.staff_punches sp
           where sp.membership_id = m.id and sp.biz_date = public.biz_date_of(m.store_id, now())
           order by sp.punched_at desc limit 1)
  from public.memberships m
  join public.users u on u.id = m.user_id
  where m.store_id = public.auth_kiosk_store_id()
    and m.is_active and u.is_active
    and m.role in ('manager','staff')
    and (m.role = 'staff' or coalesce((select st.manager_punch_enabled from public.stores st where st.id = m.store_id), true))   -- ★0201g（相談役 ■3c）: 店長の打刻の許可が OFF の店は店長を出さない
  order by u.name
$function$;

-- ═══ ★6 set_store_profile（0201c の版＋ハードの保存の検査・同じ署名・ACL 不変） ═══
CREATE OR REPLACE FUNCTION public.set_store_profile(p_store_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid := public.auth_org_id();
  v_store    record;
  v_keys     text[] := array['name','short','ext_shimei_enabled','dohan_auto_hon',
                             'store_code','display_name','show_open_status','shift_cast_confirm',   -- ★1 0147: 末尾 '];' → ','（12 キーを続ける）
                             'biz_type','billing_mode','setup_done',                                  -- ★1 0147: 裁定269-1 の 12 キー（enum 2・bool 10）
                             'sys_hourly','sys_backs','sys_sales_rate','sys_points','sys_sales_slide',   -- ★1
                             'sys_point_slide','sys_norms','sys_penalties','sys_bonus',                   -- ★1（0151 ★4: 末尾 '];' → ','）
                             'slide_apply',                                                               -- ★4 0151: 裁定287-4 の 1 キー（0154 ★7: 末尾 '];' → ','）
                             'settlement_presets',                                                        -- ★7 0154: 裁定294-7 の 1 キー（0153 ★5: 末尾 '];' → ','）
                             'customer_purpose','customer_retention_years',                               -- ★5 0153: 裁定305-11／293-4 の 2 キー（0155 ★4: 末尾 '];' → ','）
                             -- ★0201b ★4（2026-11-11 相談役）: ar_enabled を白名単から外す（売掛の書き手は set_store_receivable_policy の 1 本＝列と ar_enabled を同時に書く）
                             'okuri_base_amount',                                                         -- ★4 0158: 裁定317 の 1 キー（整数 0〜99999）（0164 ★2: 末尾 '];' → ','）
                             -- ★0201b ★3（2026-11-10）: tax_inclusive_display を白名単から外す（税込の表示は stores.price_display が正本＝計算と凍結の実体）
                             'invoice_registered_on','pay_day','use_vip','use_counter','payment_methods','punch_methods',   -- ★2 0164: 裁定331 C 5 項目＋334 フロア機能（列側 7 キー）（0172 ★3: 末尾 '];' → ','）
                             'settlement_cycle','mid_pay','shift_auto_confirm_hours',   -- ★3 0172: 裁定349 の 2 キー（精算方式・途中払い）＋裁定380 の自動確定時間（0173 ★7: 末尾 '];' → ','）
                             'join_mode','cast_register_device','pay_fee_rates','trial_guarantee_days','default_plan_id',   -- ★7 0173: 裁定386／389／393／396 の 5 キー（0175 ★3: 末尾 '];' → ','）
                             'sys_wage_cut_rule','bonus_tier_mode','sales_split','pt_rules_default',                         -- ★3 0175: X13-I ②（就業規則に減給の定め）・裁定404（達成ボーナスの段）・409（売上の分け方）・405（店の既定 pt ルール）
                             'punch_enforce','punch_restrict_mode','punch_lat','punch_lng','punch_radius_m',                 -- ★8 0175（398 打刻設定・列側）
                             'punch_require_shift','punch_round_unit','punch_round_mode','punch_round_consent_version',       -- ★8 0175（398）: 同意版は列に書かず punch_round_consents に 1 行（v2: 末尾 '];' → ','）
                             'service_rate_by_seat','pay_discount_rates','sys_drink_count_back','sales_subtotal_mode','sales_subtotal_includes_shimei',   -- ★11 0175 v2（CN-R ②③⑨⑩）
                             'settlement_week_close_dow','settlement_pay_days_after','daily_pay_cap_tiers',
                             'sys_staff_discount','staff_discount_cap','sys_cast_register',
                             'kiosk_features','kiosk_idle_sec','kiosk_person_idle_minutes',   -- ★0192 M-49
                             'okuri_flat_tiers',
                             'pay_discount_base',
                             'duty_gate',
                             'kind_back_rate','withholding_default_cast','withholding_default_staff','cash_float_default','settlement_close_day',
                             'punch_mode','register_window_before_min','register_window_after_min',
                             'line_notify',
                             'cast_register_scope',
                             'trial_wage','trial_back'];   -- ★0200（裁定473）: 会計できる卓＝all（既定）／own   -- ★0199（裁定459・M-114）: LINE 通知の種類ごとの ON／OFF（object）   -- ★0197（裁定455 の 1・5）: 打刻の 3 択目（'punch'／'store'）と確定シフトの前後の窓（分）   -- ★0191（便 OB-2 ⑤）: 初期設定 v5 の器なし 5 項目   -- ★0190（裁定436）: 打刻ゲート（boolean・既定 true＝false の店はレジの check_* で打刻を見ない）   -- ★0187（便 CASH）: 現金割引の基準（total＝合計から・既定／subtotal＝小計から）   -- ★1 0180（裁定414 追補）: 送り 定額の距離区分（配列・最大 3・{code,name,amount}）                                                                -- ★27 0175 v2 追補 2 同乗 R-7（裁定423 候補）                                     -- ★24／★25 0175 v2 追補 2（裁定421 候補・裁定420）                   -- ★11 0175 v2（CN-R ⑳ 週払い・日払いの上限）
  v_k        text;
  v_before   jsonb := '{}'::jsonb;
  v_after    jsonb := '{}'::jsonb;
  v_name     text;
  v_short    text;
  v_code     text;
  v_disp     text;
  v_ext      boolean;
  v_dohan    boolean;
  v_open     boolean;
  v_confirm  boolean;
  v_settings jsonb;
  v_biz      text;      -- ★2 0147: biz_type（enum text 5 値）
  v_bill     text;      -- ★3 0147: billing_mode（enum text 3 値）
  v_setup_done boolean;   -- ★4 0147: setup_done（show_open_status と同型）
  v_s_hourly boolean;   -- ★4 0147: sys_hourly（show_open_status と同型）
  v_s_backs  boolean;   -- ★4 0147: sys_backs（show_open_status と同型）
  v_s_sales_rate boolean;   -- ★4 0147: sys_sales_rate（show_open_status と同型）
  v_s_points boolean;   -- ★4 0147: sys_points（show_open_status と同型）
  v_s_sales_slide boolean;   -- ★4 0147: sys_sales_slide（show_open_status と同型）
  v_s_point_slide boolean;   -- ★4 0147: sys_point_slide（show_open_status と同型）
  v_s_norms  boolean;   -- ★4 0147: sys_norms（show_open_status と同型）
  v_s_penalties boolean;   -- ★4 0147: sys_penalties（show_open_status と同型）
  v_s_bonus  boolean;   -- ★4 0147: sys_bonus（show_open_status と同型）
  v_slide    text;      -- ★4 0151: slide_apply（enum text 2 値・biz_type と同型）
  v_presets  jsonb;     -- ★7 0154: settlement_presets（配列・最大 10）
  v_pe       jsonb;     -- ★7 0154: settlement_presets の要素
  v_purpose  text;      -- ★5 0153: customer_purpose（display_name と同型・≤200）
  v_years    numeric;   -- ★5 0153: customer_retention_years（整数 1〜10）
  v_ar       boolean;   -- ★4 0155: ar_enabled（show_open_status と同型）
  v_okb      numeric;   -- ★4 0158: okuri_base_amount（整数 0〜99999）
  v_inv_on   date;      -- ★2 0164: invoice_registered_on（'YYYY-MM-DD' か null）
  v_pay_day  numeric;   -- ★2 0164: pay_day（整数 1〜31）
  v_tax_inc  boolean;   -- ★2 0164: tax_inclusive_display
  v_use_vip  boolean;   -- ★2 0164: use_vip
  v_use_ctr  boolean;   -- ★2 0164: use_counter
  v_paym     jsonb;     -- ★2 0164: payment_methods（object・cash／card／emoney／qr・boolean・cash は true）
  v_punch    jsonb;     -- ★2 0164: punch_methods（object・self／proxy／kiosk・boolean・1 つ以上 true）
  v_jk       text;      -- ★2 0164: jsonb の検査用キー
  v_cycle    text;      -- ★3 0172: settlement_cycle（enum text 4 値・slide_apply と同型）
  v_midpay   text;      -- ★3 0172: mid_pay（enum text 2 値）
  v_autoh    numeric;   -- ★3 0172: shift_auto_confirm_hours（整数 0〜168・0＝自動確定しない）
  v_join     text;      -- ★2 0173: join_mode（enum text 2 値）
  v_crdev    text;      -- ★3 0173: cast_register_device（enum text 2 値）
  v_pfr      jsonb;     -- ★6 0173: pay_fee_rates（object・card／emoney／other・整数 0〜100）
  v_pfk      text;      -- ★6 0173: jsonb の検査用キー
  v_pfv      numeric;   -- ★6 0173: 率の検査用
  v_tgd      numeric;   -- ★7 0173: trial_guarantee_days（整数 1〜90）
  v_dpid     uuid;      -- ★7 0173: default_plan_id（自店の有効な comp_plans.id）
  v_wcr      boolean;   -- ★3 0175: sys_wage_cut_rule（show_open_status と同型）
  v_btm      text;      -- ★3 0175: bonus_tier_mode（enum text 2 値 max／sum）
  v_split    text;      -- ★3 0175: sales_split（enum text 2 値 prorate／equal）
  v_ptr      jsonb;     -- ★3 0175: pt_rules_default（object・pt_rules_check）
  v_penf     boolean;   -- ★8 0175: punch_enforce
  v_pmode    text;      -- ★8 0175: punch_restrict_mode（5 値）
  v_plat     double precision;   -- ★8 0175: punch_lat（-90〜90・null 可）
  v_plng     double precision;   -- ★8 0175: punch_lng（-180〜180・null 可）
  v_prad     numeric;   -- ★8 0175: punch_radius_m（整数 10〜100000・null 可）
  -- ★0201g 作り直し（2026-11-12 相談役）: ハードの保存の検査に使う値（patch にキーがあれば patch の値・無ければ店の今の値）
  v_chk_enf  boolean;
  v_chk_mode text;
  v_chk_ip   boolean;
  v_chk_geo  boolean;
  v_preq     text;      -- ★8 0175: punch_require_shift（off／warn／block）
  v_prunit   numeric;   -- ★8 0175: punch_round_unit（1／5／10／15／30）
  v_prmode   text;      -- ★8 0175: punch_round_mode（staff_favor／store_favor／nearest）
  v_pcv      text;      -- ★8 0175: punch_round_consent_version
  v_actor    uuid;      -- ★8 0175: 同意ログの changed_by
  v_srs      jsonb;     -- ★11 v2: service_rate_by_seat
  v_pdr      jsonb;     -- ★11 v2: pay_discount_rates
  v_sdcb     boolean;   -- ★11 v2: sys_drink_count_back
  v_ssm      text;      -- ★11 v2: sales_subtotal_mode
  v_ssis     boolean;   -- ★11 v2: sales_subtotal_includes_shimei
  v_wcd      numeric;   -- ★11 v2: settlement_week_close_dow
  v_pda      numeric;   -- ★11 v2: settlement_pay_days_after
  v_dct      jsonb;     -- ★11 v2: daily_pay_cap_tiers
  v_ssd      numeric;   -- ★24 v2 追補 2: sys_staff_discount（0 承認制／1 上限内は即時／2 不可）
  v_sdc      numeric;   -- ★24 v2 追補 2: staff_discount_cap（円・上限内は即時の上限）
  v_scr      numeric;   -- ★25 v2 追補 2: sys_cast_register（0 OFF／1 注文のみ／2 会計まで）
  v_scope    text;
  v_trw      numeric;   -- ★0201c（裁定480）: trial_wage（体入の時給・整数 0〜100000）
  v_trb      text;      -- ★0201c（裁定480）: trial_back（体入中のバック＝same／none）      -- ★0200（裁定473）: cast_register_scope
  v_kf       jsonb;     -- ★27 v2 R-7: kiosk_features {punch, register, shift}
  v_pdb      text;      -- ★0187: pay_discount_base
  v_dg       boolean;   -- ★0190: duty_gate
  v_oft      jsonb;     -- ★1 0180: okuri_flat_tiers（配列・最大 3）
  v_oe       jsonb;     -- ★1 0180: okuri_flat_tiers の要素
  v_ocodes   text[] := '{}';   -- ★1 0180: code の重複検査
  v_kis      numeric;   -- ★27 v2 R-7: kiosk_idle_sec（60〜900・既定 180）
  v_kpi      numeric;   -- ★0192 M-49: kiosk_person_idle_minutes（1〜120・既定 10＝キオスクの本人でログインの無操作で戻す分）
  v_pmd      text;      -- ★0197: punch_mode（'punch'＝既定／'store'＝打刻しない・店が勤怠を付ける）
  v_rwb      numeric;   -- ★0197: register_window_before_min（0〜240・既定 30）
  v_rwa      numeric;   -- ★0197: register_window_after_min（0〜240・既定 60）
  v_kbr      jsonb;     -- ★0191: kind_back_rate {hon, jonai, free}（整数 0〜100）
  v_wdc      text;      -- ★0191: withholding_default_cast（hostess／none）
  v_wds      text;      -- ★0191: withholding_default_staff（none／other_204）
  v_cfd      numeric;   -- ★0191: cash_float_default（整数 0〜9,999,999）
  v_scd      numeric;   -- ★0191: settlement_close_day（15／20／25／31＝末日）
  v_prevh    numeric;   -- ★11 v2: 表の昇順検査
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;   -- 店ポリシー＝owner 限定（cast_register と同格）
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'bad patch'; end if;
  if p_patch = '{}'::jsonb then raise exception 'bad patch'; end if;

  select id, org_id, name, short, ext_shimei_enabled, dohan_auto_hon, settings_json,   -- ★2 0164: 列を 7 つ続ける
         invoice_registered_on, pay_day, tax_inclusive_display, use_vip, use_counter, payment_methods, punch_methods,   -- ★2 0164: before の現値（0175 ★8: 末尾 ','）
         punch_enforce, punch_restrict_mode, punch_lat, punch_lng, punch_radius_m, punch_require_shift, punch_round_unit, punch_round_mode,   -- ★8 0175（398）: 列側 8 の現値（v2: 末尾 ','）
         service_rate_by_seat   -- ★11 0175 v2（CN-R ②）
    into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> v_org then raise exception 'forbidden'; end if;

  -- 白名単外のキーは黙って無視せず拒否
  for v_k in select jsonb_object_keys(p_patch) loop
    if not (v_k = any(v_keys)) then raise exception 'bad key'; end if;
  end loop;

  v_settings := coalesce(v_store.settings_json, '{}'::jsonb);

  -- ── 列側 ────────────────────────────────────────────────
  if p_patch ? 'name' then
    if jsonb_typeof(p_patch->'name') <> 'string' then raise exception 'bad type'; end if;
    v_name := trim(p_patch->>'name');
    if length(v_name) < 1 or length(v_name) > 50 then raise exception 'bad name'; end if;
    v_before := v_before || jsonb_build_object('name', v_store.name);
    v_after  := v_after  || jsonb_build_object('name', v_name);
  end if;

  if p_patch ? 'short' then
    if jsonb_typeof(p_patch->'short') <> 'string' then raise exception 'bad type'; end if;
    v_short := trim(p_patch->>'short');
    if length(v_short) > 20 then raise exception 'bad short'; end if;
    if v_short = '' then v_short := null; end if;   -- 空欄は null（列は null 可）
    v_before := v_before || jsonb_build_object('short', v_store.short);
    v_after  := v_after  || jsonb_build_object('short', v_short);
  end if;

  if p_patch ? 'ext_shimei_enabled' then
    if jsonb_typeof(p_patch->'ext_shimei_enabled') <> 'boolean' then raise exception 'bad type'; end if;
    v_ext := (p_patch->>'ext_shimei_enabled')::boolean;
    v_before := v_before || jsonb_build_object('ext_shimei_enabled', v_store.ext_shimei_enabled);
    v_after  := v_after  || jsonb_build_object('ext_shimei_enabled', v_ext);
  end if;

  if p_patch ? 'dohan_auto_hon' then
    if jsonb_typeof(p_patch->'dohan_auto_hon') <> 'boolean' then raise exception 'bad type'; end if;
    v_dohan := (p_patch->>'dohan_auto_hon')::boolean;
    v_before := v_before || jsonb_build_object('dohan_auto_hon', v_store.dohan_auto_hon);
    v_after  := v_after  || jsonb_build_object('dohan_auto_hon', v_dohan);
  end if;

  -- ── settings_json 側 ───────────────────────────────────
  if p_patch ? 'store_code' then
    if jsonb_typeof(p_patch->'store_code') <> 'string' then raise exception 'bad type'; end if;
    v_code := trim(p_patch->>'store_code');
    if length(v_code) > 20 then raise exception 'bad store_code'; end if;
    v_before   := v_before || jsonb_build_object('store_code', coalesce(v_settings->>'store_code', ''));
    v_after    := v_after  || jsonb_build_object('store_code', v_code);
    v_settings := jsonb_set(v_settings, '{store_code}', to_jsonb(v_code), true);
  end if;

  if p_patch ? 'display_name' then
    if jsonb_typeof(p_patch->'display_name') <> 'string' then raise exception 'bad type'; end if;
    v_disp := trim(p_patch->>'display_name');
    if length(v_disp) > 50 then raise exception 'bad display_name'; end if;
    v_before   := v_before || jsonb_build_object('display_name', coalesce(v_settings->>'display_name', ''));
    v_after    := v_after  || jsonb_build_object('display_name', v_disp);
    v_settings := jsonb_set(v_settings, '{display_name}', to_jsonb(v_disp), true);
  end if;

  if p_patch ? 'show_open_status' then
    if jsonb_typeof(p_patch->'show_open_status') <> 'boolean' then raise exception 'bad type'; end if;
    v_open := (p_patch->>'show_open_status')::boolean;
    v_before   := v_before || jsonb_build_object('show_open_status',
                    coalesce(v_settings->>'show_open_status', '') = 'true');
    v_after    := v_after  || jsonb_build_object('show_open_status', v_open);
    v_settings := jsonb_set(v_settings, '{show_open_status}', to_jsonb(v_open), true);
  end if;

  if p_patch ? 'shift_cast_confirm' then
    if jsonb_typeof(p_patch->'shift_cast_confirm') <> 'boolean' then raise exception 'bad type'; end if;
    v_confirm := (p_patch->>'shift_cast_confirm')::boolean;
    v_before   := v_before || jsonb_build_object('shift_cast_confirm',
                    coalesce(v_settings->>'shift_cast_confirm', '') = 'true');
    v_after    := v_after  || jsonb_build_object('shift_cast_confirm', v_confirm);
    v_settings := jsonb_set(v_settings, '{shift_cast_confirm}', to_jsonb(v_confirm), true);
  end if;

  -- ── ★2〜★4 0147 追加キー（裁定269-1／270-3）: enum text 2・boolean 10 ────────
  if p_patch ? 'biz_type' then                                                                             -- ★2 0147
    if jsonb_typeof(p_patch->'biz_type') <> 'string' then raise exception 'bad type'; end if;              -- ★2（text 4 キーの行型を写経）
    v_biz := p_patch->>'biz_type';                                                                         -- ★2
    if v_biz is null or v_biz not in ('cabaret','girlsbar','snack','lounge','bar') then raise exception 'bad biz_type'; end if;  -- ★2（mig0042:92 set_store_norm_config の not in (...) を写経）
    v_before   := v_before || jsonb_build_object('biz_type', coalesce(v_settings->>'biz_type', ''));       -- ★2
    v_after    := v_after  || jsonb_build_object('biz_type', v_biz);                                       -- ★2
    v_settings := jsonb_set(v_settings, '{biz_type}', to_jsonb(v_biz), true);                              -- ★2
  end if;                                                                                                  -- ★2

  if p_patch ? 'billing_mode' then                                                                         -- ★3 0147
    if jsonb_typeof(p_patch->'billing_mode') <> 'string' then raise exception 'bad type'; end if;          -- ★3（text 4 キーの行型を写経）
    v_bill := p_patch->>'billing_mode';                                                                    -- ★3
    if v_bill is null or v_bill not in ('table','individual','mixed') then raise exception 'bad billing_mode'; end if;  -- ★3（mig0042:92 写経・'bad billing_mode'）
    v_before   := v_before || jsonb_build_object('billing_mode', coalesce(v_settings->>'billing_mode', '')); -- ★3
    v_after    := v_after  || jsonb_build_object('billing_mode', v_bill);                                  -- ★3
    v_settings := jsonb_set(v_settings, '{billing_mode}', to_jsonb(v_bill), true);                         -- ★3
  end if;                                                                                                  -- ★3

  if p_patch ? 'setup_done' then                                                                               -- ★4 0147: setup_done（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'setup_done') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_setup_done := (p_patch->>'setup_done')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('setup_done',                                                  -- ★4
                    coalesce(v_settings->>'setup_done', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('setup_done', v_setup_done);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{setup_done}', to_jsonb(v_setup_done), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_hourly' then                                                                               -- ★4 0147: sys_hourly（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_hourly') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_hourly := (p_patch->>'sys_hourly')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_hourly',                                                  -- ★4
                    coalesce(v_settings->>'sys_hourly', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_hourly', v_s_hourly);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_hourly}', to_jsonb(v_s_hourly), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_backs' then                                                                               -- ★4 0147: sys_backs（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_backs') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_backs := (p_patch->>'sys_backs')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_backs',                                                  -- ★4
                    coalesce(v_settings->>'sys_backs', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_backs', v_s_backs);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_backs}', to_jsonb(v_s_backs), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_sales_rate' then                                                                               -- ★4 0147: sys_sales_rate（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_sales_rate') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_sales_rate := (p_patch->>'sys_sales_rate')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_sales_rate',                                                  -- ★4
                    coalesce(v_settings->>'sys_sales_rate', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_sales_rate', v_s_sales_rate);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_sales_rate}', to_jsonb(v_s_sales_rate), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_points' then                                                                               -- ★4 0147: sys_points（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_points') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_points := (p_patch->>'sys_points')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_points',                                                  -- ★4
                    coalesce(v_settings->>'sys_points', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_points', v_s_points);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_points}', to_jsonb(v_s_points), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_sales_slide' then                                                                               -- ★4 0147: sys_sales_slide（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_sales_slide') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_sales_slide := (p_patch->>'sys_sales_slide')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_sales_slide',                                                  -- ★4
                    coalesce(v_settings->>'sys_sales_slide', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_sales_slide', v_s_sales_slide);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_sales_slide}', to_jsonb(v_s_sales_slide), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_point_slide' then                                                                               -- ★4 0147: sys_point_slide（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_point_slide') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_point_slide := (p_patch->>'sys_point_slide')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_point_slide',                                                  -- ★4
                    coalesce(v_settings->>'sys_point_slide', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_point_slide', v_s_point_slide);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_point_slide}', to_jsonb(v_s_point_slide), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_norms' then                                                                               -- ★4 0147: sys_norms（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_norms') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_norms := (p_patch->>'sys_norms')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_norms',                                                  -- ★4
                    coalesce(v_settings->>'sys_norms', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_norms', v_s_norms);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_norms}', to_jsonb(v_s_norms), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_penalties' then                                                                               -- ★4 0147: sys_penalties（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_penalties') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_penalties := (p_patch->>'sys_penalties')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_penalties',                                                  -- ★4
                    coalesce(v_settings->>'sys_penalties', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_penalties', v_s_penalties);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_penalties}', to_jsonb(v_s_penalties), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_bonus' then                                                                               -- ★4 0147: sys_bonus（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_bonus') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_bonus := (p_patch->>'sys_bonus')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_bonus',                                                  -- ★4
                    coalesce(v_settings->>'sys_bonus', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_bonus', v_s_bonus);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_bonus}', to_jsonb(v_s_bonus), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'slide_apply' then                                                                          -- ★4 0151（裁定287-4）: biz_type ブロックと同型
    if jsonb_typeof(p_patch->'slide_apply') <> 'string' then raise exception 'bad type'; end if;           -- ★4
    v_slide := p_patch->>'slide_apply';                                                                    -- ★4
    if v_slide is null or v_slide not in ('next','current') then raise exception 'bad slide_apply'; end if; -- ★4（'bad biz_type' と同型）
    v_before   := v_before || jsonb_build_object('slide_apply', coalesce(v_settings->>'slide_apply', ''));  -- ★4
    v_after    := v_after  || jsonb_build_object('slide_apply', v_slide);                                  -- ★4
    v_settings := jsonb_set(v_settings, '{slide_apply}', to_jsonb(v_slide), true);                         -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'settlement_presets' then                                                                   -- ★7 0154（裁定294-7）: 配列・最大 10・要素 {code,name,amount,basis,target}
    v_presets := p_patch->'settlement_presets';                                                            -- ★7
    if jsonb_typeof(v_presets) <> 'array' or jsonb_array_length(v_presets) > 10 then raise exception 'bad type'; end if;   -- ★7
    for v_pe in select e from jsonb_array_elements(v_presets) e loop                                       -- ★7
      if jsonb_typeof(v_pe) <> 'object'                                                                    -- ★7
         or coalesce(jsonb_typeof(v_pe->'code'), '') <> 'string' or length(trim(v_pe->>'code')) = 0       -- ★7: 欠損（null）も拒否
         or coalesce(jsonb_typeof(v_pe->'name'), '') <> 'string'                                           -- ★7
         or coalesce(jsonb_typeof(v_pe->'amount'), '') <> 'number'                                         -- ★7
         or (v_pe->>'amount')::numeric < 0 or (v_pe->>'amount')::numeric <> trunc((v_pe->>'amount')::numeric)   -- ★7: 整数 ≥0
         or coalesce(jsonb_typeof(v_pe->'basis'), '') <> 'string'                                          -- ★7
         or coalesce(jsonb_typeof(v_pe->'target'), '') <> 'string'                                         -- ★7
         or (v_pe->>'target') not in ('late','absent','early','other') then                                -- ★7
        raise exception 'bad type';                                                                        -- ★7
      end if;                                                                                              -- ★7
    end loop;                                                                                              -- ★7
    v_before   := v_before || jsonb_build_object('settlement_presets', coalesce(v_settings->'settlement_presets', '[]'::jsonb));   -- ★7
    v_after    := v_after  || jsonb_build_object('settlement_presets', v_presets);                         -- ★7
    v_settings := jsonb_set(v_settings, '{settlement_presets}', v_presets, true);                          -- ★7
  end if;                                                                                                  -- ★7

  if p_patch ? 'duty_gate' then   -- ★0190（裁定436・相談役案）: 打刻ゲート＝既定 ON（キオスク端末が 0 台の店は client が注意を出す）
    if jsonb_typeof(p_patch->'duty_gate') <> 'boolean' then raise exception 'bad type'; end if;
    v_dg := (p_patch->>'duty_gate')::boolean;
    v_before   := v_before || jsonb_build_object('duty_gate', coalesce((v_settings->>'duty_gate')::boolean, true));
    v_after    := v_after  || jsonb_build_object('duty_gate', v_dg);
    v_settings := jsonb_set(v_settings, '{duty_gate}', to_jsonb(v_dg), true);
  end if;
  if p_patch ? 'pay_discount_base' then   -- ★0187（便 CASH・Agoora 確定 10/27）: 割引対象＝合計から（既定）／小計から（税理士 T15 の回答待ちの仮置き）
    if jsonb_typeof(p_patch->'pay_discount_base') <> 'string' then raise exception 'bad type'; end if;
    v_pdb := p_patch->>'pay_discount_base';
    if v_pdb is null or v_pdb not in ('total','subtotal') then raise exception 'bad pay_discount_base'; end if;
    v_before   := v_before || jsonb_build_object('pay_discount_base', coalesce(v_settings->>'pay_discount_base', 'total'));
    v_after    := v_after  || jsonb_build_object('pay_discount_base', v_pdb);
    v_settings := jsonb_set(v_settings, '{pay_discount_base}', to_jsonb(v_pdb), true);
  end if;

  if p_patch ? 'okuri_flat_tiers' then                                                                   -- ★1 0180（裁定414 追補）: 定額徴収の距離区分＝配列・最大 3・要素 {code,name,amount}（settlement_presets と同型）
    v_oft := p_patch->'okuri_flat_tiers';                                                                -- ★1
    if jsonb_typeof(v_oft) <> 'array' or jsonb_array_length(v_oft) > 3 then raise exception 'bad type'; end if;   -- ★1: 最大 3 段
    v_ocodes := '{}';                                                                                     -- ★1
    for v_oe in select e from jsonb_array_elements(v_oft) e loop                                          -- ★1
      if jsonb_typeof(v_oe) <> 'object'                                                                   -- ★1
         or coalesce(jsonb_typeof(v_oe->'code'), '') <> 'string' or length(trim(v_oe->>'code')) = 0 or length(v_oe->>'code') > 32   -- ★1
         or coalesce(jsonb_typeof(v_oe->'name'), '') <> 'string' or length(trim(v_oe->>'name')) = 0 or length(v_oe->>'name') > 40   -- ★1
         or coalesce(jsonb_typeof(v_oe->'amount'), '') <> 'number'                                        -- ★1
         or (v_oe->>'amount')::numeric < 0 or (v_oe->>'amount')::numeric <> trunc((v_oe->>'amount')::numeric) then   -- ★1: 整数 ≥0
        raise exception 'bad type';                                                                       -- ★1
      end if;                                                                                             -- ★1
      if (v_oe->>'code') = any (v_ocodes) then raise exception 'bad type'; end if;                        -- ★1: code 一意
      v_ocodes := v_ocodes || (v_oe->>'code');                                                            -- ★1
    end loop;                                                                                             -- ★1
    v_before   := v_before || jsonb_build_object('okuri_flat_tiers', coalesce(v_settings->'okuri_flat_tiers', '[]'::jsonb));   -- ★1
    v_after    := v_after  || jsonb_build_object('okuri_flat_tiers', v_oft);                              -- ★1
    v_settings := jsonb_set(v_settings, '{okuri_flat_tiers}', v_oft, true);                               -- ★1
  end if;                                                                                                 -- ★1

  if p_patch ? 'customer_purpose' then                                                                     -- ★5 0153（裁定305-11／293-4）: display_name ブロックと同型
    if jsonb_typeof(p_patch->'customer_purpose') <> 'string' then raise exception 'bad type'; end if;      -- ★5
    v_purpose := trim(p_patch->>'customer_purpose');                                                       -- ★5
    if length(v_purpose) > 200 then raise exception 'bad customer_purpose'; end if;                        -- ★5
    v_before   := v_before || jsonb_build_object('customer_purpose', coalesce(v_settings->>'customer_purpose', ''));   -- ★5
    v_after    := v_after  || jsonb_build_object('customer_purpose', v_purpose);                           -- ★5
    v_settings := jsonb_set(v_settings, '{customer_purpose}', to_jsonb(v_purpose), true);                  -- ★5
  end if;                                                                                                  -- ★5

  if p_patch ? 'customer_retention_years' then                                                             -- ★5 0153（裁定305-11）: 整数 1〜10（settlement_presets の数値検査の型）
    if jsonb_typeof(p_patch->'customer_retention_years') <> 'number' then raise exception 'bad type'; end if;   -- ★5
    v_years := (p_patch->>'customer_retention_years')::numeric;                                            -- ★5
    if v_years < 1 or v_years > 10 or v_years <> trunc(v_years) then raise exception 'bad customer_retention_years'; end if;   -- ★5
    v_before   := v_before || jsonb_build_object('customer_retention_years', coalesce((v_settings->>'customer_retention_years')::int, 5));   -- ★5: 既定 5
    v_after    := v_after  || jsonb_build_object('customer_retention_years', v_years::int);                -- ★5
    v_settings := jsonb_set(v_settings, '{customer_retention_years}', to_jsonb(v_years::int), true);       -- ★5
  end if;                                                                                                  -- ★5

  if p_patch ? 'ar_enabled' then                                                                               -- ★4 0155（裁定309-1）: ar_enabled（show_open_status の 4 行型を写経・owner 限定は関数冒頭で担保）
    if jsonb_typeof(p_patch->'ar_enabled') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_ar := (p_patch->>'ar_enabled')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('ar_enabled',                                                  -- ★4
                    coalesce(v_settings->>'ar_enabled', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('ar_enabled', v_ar);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{ar_enabled}', to_jsonb(v_ar), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'okuri_base_amount' then                                                                    -- ★4 0158（裁定317）: 整数 0〜99999（customer_retention_years の数値検査の型）
    if jsonb_typeof(p_patch->'okuri_base_amount') <> 'number' then raise exception 'bad type'; end if;       -- ★4 0158
    v_okb := (p_patch->>'okuri_base_amount')::numeric;                                                       -- ★4 0158
    if v_okb < 0 or v_okb > 99999 or v_okb <> trunc(v_okb) then raise exception 'bad okuri_base_amount'; end if;   -- ★4 0158
    v_before   := v_before || jsonb_build_object('okuri_base_amount', coalesce(nullif(trim(v_settings->>'okuri_base_amount'), '')::int, 0));   -- ★4 0158: 既定 0（未設定）
    v_after    := v_after  || jsonb_build_object('okuri_base_amount', v_okb::int);                           -- ★4 0158
    v_settings := jsonb_set(v_settings, '{okuri_base_amount}', to_jsonb(v_okb::int), true);                  -- ★4 0158
  end if;                                                                                                  -- ★4 0158

  -- ── ★2 0164: 列側 7 キー（裁定331 C 5 項目＋334 フロア機能） ──────────
  if p_patch ? 'invoice_registered_on' then                                                                -- ★2 0164
    if jsonb_typeof(p_patch->'invoice_registered_on') = 'null' then v_inv_on := null;                       -- ★2 0164: null＝未登録／不明
    elsif jsonb_typeof(p_patch->'invoice_registered_on') <> 'string' or (p_patch->>'invoice_registered_on') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'bad type';   -- ★2 0164
    else v_inv_on := (p_patch->>'invoice_registered_on')::date; end if;                                      -- ★2 0164
    v_before := v_before || jsonb_build_object('invoice_registered_on', v_store.invoice_registered_on);      -- ★2 0164
    v_after  := v_after  || jsonb_build_object('invoice_registered_on', v_inv_on);                           -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'pay_day' then                                                                              -- ★2 0164
    if jsonb_typeof(p_patch->'pay_day') <> 'number' then raise exception 'bad type'; end if;                 -- ★2 0164
    v_pay_day := (p_patch->>'pay_day')::numeric;                                                             -- ★2 0164
    if v_pay_day < 1 or v_pay_day > 31 or v_pay_day <> trunc(v_pay_day) then raise exception 'bad pay_day'; end if;   -- ★2 0164
    v_before := v_before || jsonb_build_object('pay_day', v_store.pay_day);                                  -- ★2 0164
    v_after  := v_after  || jsonb_build_object('pay_day', v_pay_day::int);                                   -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'tax_inclusive_display' then                                                                -- ★2 0164
    if jsonb_typeof(p_patch->'tax_inclusive_display') <> 'boolean' then raise exception 'bad type'; end if;  -- ★2 0164
    v_tax_inc := (p_patch->>'tax_inclusive_display')::boolean;                                               -- ★2 0164
    v_before := v_before || jsonb_build_object('tax_inclusive_display', v_store.tax_inclusive_display);      -- ★2 0164
    v_after  := v_after  || jsonb_build_object('tax_inclusive_display', v_tax_inc);                          -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'use_vip' then                                                                              -- ★2 0164
    if jsonb_typeof(p_patch->'use_vip') <> 'boolean' then raise exception 'bad type'; end if;                -- ★2 0164
    v_use_vip := (p_patch->>'use_vip')::boolean;                                                             -- ★2 0164
    v_before := v_before || jsonb_build_object('use_vip', v_store.use_vip);                                  -- ★2 0164
    v_after  := v_after  || jsonb_build_object('use_vip', v_use_vip);                                        -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'use_counter' then                                                                          -- ★2 0164
    if jsonb_typeof(p_patch->'use_counter') <> 'boolean' then raise exception 'bad type'; end if;            -- ★2 0164
    v_use_ctr := (p_patch->>'use_counter')::boolean;                                                         -- ★2 0164
    v_before := v_before || jsonb_build_object('use_counter', v_store.use_counter);                          -- ★2 0164
    v_after  := v_after  || jsonb_build_object('use_counter', v_use_ctr);                                    -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'payment_methods' then                                                                      -- ★2 0164
    v_paym := p_patch->'payment_methods';                                                                    -- ★2 0164
    if jsonb_typeof(v_paym) <> 'object' then raise exception 'bad type'; end if;                             -- ★2 0164
    for v_jk in select jsonb_object_keys(v_paym) loop                                                        -- ★2 0164
      if v_jk not in ('cash','card','emoney','qr') or jsonb_typeof(v_paym->v_jk) <> 'boolean' then raise exception 'bad payment_methods'; end if;   -- ★2 0164
    end loop;                                                                                                -- ★2 0164
    if coalesce((v_paym->>'cash')::boolean, true) <> true then raise exception 'bad payment_methods'; end if;   -- ★2 0164: 現金は常に使う
    v_paym := v_store.payment_methods || v_paym;                                                             -- ★2 0164: 無いキーは現値のまま
    v_before := v_before || jsonb_build_object('payment_methods', v_store.payment_methods);                  -- ★2 0164
    v_after  := v_after  || jsonb_build_object('payment_methods', v_paym);                                   -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'punch_methods' then                                                                        -- ★2 0164
    v_punch := p_patch->'punch_methods';                                                                     -- ★2 0164
    if jsonb_typeof(v_punch) <> 'object' then raise exception 'bad type'; end if;                            -- ★2 0164
    for v_jk in select jsonb_object_keys(v_punch) loop                                                       -- ★2 0164
      if v_jk not in ('self','proxy','kiosk') or jsonb_typeof(v_punch->v_jk) <> 'boolean' then raise exception 'bad punch_methods'; end if;   -- ★2 0164
    end loop;                                                                                                -- ★2 0164
    v_punch := v_store.punch_methods || v_punch;                                                             -- ★2 0164: 無いキーは現値のまま
    if not (coalesce((v_punch->>'self')::boolean, false) or coalesce((v_punch->>'proxy')::boolean, false) or coalesce((v_punch->>'kiosk')::boolean, false)) then raise exception 'bad punch_methods'; end if;   -- ★2 0164: 1 つ以上
    v_before := v_before || jsonb_build_object('punch_methods', v_store.punch_methods);                      -- ★2 0164
    v_after  := v_after  || jsonb_build_object('punch_methods', v_punch);                                    -- ★2 0164
  end if;                                                                                                  -- ★2 0164

  -- ★3 0172（裁定349）: 精算方式＝monthly／half／weekly／daily（源泉の暦日数＝lib/nox/pay.ts periodDays が読む・既定 monthly＝欠損時）
  if p_patch ? 'settlement_cycle' then                                                                     -- ★3 0172
    if jsonb_typeof(p_patch->'settlement_cycle') <> 'string' then raise exception 'bad type'; end if;      -- ★3 0172
    v_cycle := p_patch->>'settlement_cycle';                                                               -- ★3 0172
    if v_cycle is null or v_cycle not in ('monthly','half','weekly','daily') then raise exception 'bad settlement_cycle'; end if;   -- ★3 0172
    v_before   := v_before || jsonb_build_object('settlement_cycle', coalesce(v_settings->>'settlement_cycle', ''));   -- ★3 0172
    v_after    := v_after  || jsonb_build_object('settlement_cycle', v_cycle);                             -- ★3 0172
    v_settings := jsonb_set(v_settings, '{settlement_cycle}', to_jsonb(v_cycle), true);                    -- ★3 0172
  end if;                                                                                                  -- ★3 0172
  -- ★3 0172（裁定349）: 途中払い＝none／advance（advance＝前払・仮払の口を出す・既定 none）
  if p_patch ? 'mid_pay' then                                                                              -- ★3 0172
    if jsonb_typeof(p_patch->'mid_pay') <> 'string' then raise exception 'bad type'; end if;               -- ★3 0172
    v_midpay := p_patch->>'mid_pay';                                                                       -- ★3 0172
    if v_midpay is null or v_midpay not in ('none','advance') then raise exception 'bad mid_pay'; end if;  -- ★3 0172
    v_before   := v_before || jsonb_build_object('mid_pay', coalesce(v_settings->>'mid_pay', ''));         -- ★3 0172
    v_after    := v_after  || jsonb_build_object('mid_pay', v_midpay);                                     -- ★3 0172
    v_settings := jsonb_set(v_settings, '{mid_pay}', to_jsonb(v_midpay), true);                            -- ★3 0172
  end if;                                                                                                  -- ★3 0172
  -- ★3 0172（裁定380）: 送り返しの自動確定時間＝整数 0〜168（0＝自動確定しない・既定 0＝欠損時）。実行器（cron／RPC）は別起票＝ここは設定の器だけ
  if p_patch ? 'shift_auto_confirm_hours' then                                                             -- ★3 0172
    if jsonb_typeof(p_patch->'shift_auto_confirm_hours') <> 'number' then raise exception 'bad type'; end if;   -- ★3 0172
    v_autoh := (p_patch->>'shift_auto_confirm_hours')::numeric;                                            -- ★3 0172
    if v_autoh <> floor(v_autoh) or v_autoh < 0 or v_autoh > 168 then raise exception 'bad shift_auto_confirm_hours'; end if;   -- ★3 0172
    v_before   := v_before || jsonb_build_object('shift_auto_confirm_hours', coalesce((v_settings->>'shift_auto_confirm_hours')::numeric, 0));   -- ★3 0172
    v_after    := v_after  || jsonb_build_object('shift_auto_confirm_hours', v_autoh::int);                -- ★3 0172
    v_settings := jsonb_set(v_settings, '{shift_auto_confirm_hours}', to_jsonb(v_autoh::int), true);       -- ★3 0172
  end if;                                                                                                  -- ★3 0172

  -- ★2 0173（裁定386）: 途中合流＝join_set（セット終了後の＋は合流セット行・既定）／extend_only（延長のみ）
  if p_patch ? 'join_mode' then                                                                            -- ★2 0173
    if jsonb_typeof(p_patch->'join_mode') <> 'string' then raise exception 'bad type'; end if;             -- ★2 0173
    v_join := p_patch->>'join_mode';                                                                       -- ★2 0173
    if v_join is null or v_join not in ('join_set','extend_only') then raise exception 'bad join_mode'; end if;   -- ★2 0173
    v_before   := v_before || jsonb_build_object('join_mode', coalesce(v_settings->>'join_mode', ''));     -- ★2 0173
    v_after    := v_after  || jsonb_build_object('join_mode', v_join);                                     -- ★2 0173
    v_settings := jsonb_set(v_settings, '{join_mode}', to_jsonb(v_join), true);                            -- ★2 0173
  end if;                                                                                                  -- ★2 0173
  -- ★3 0173（裁定389）: キャストのレジ端末＝store_device（店端末のみ＝kiosk_devices purpose 'register' の登録を流用・既定）／own_phone（自分のスマホからも）。cast_register_enabled（set_store_cast_register）が ON のときだけ効く
  if p_patch ? 'cast_register_device' then                                                                 -- ★3 0173
    if jsonb_typeof(p_patch->'cast_register_device') <> 'string' then raise exception 'bad type'; end if;  -- ★3 0173
    v_crdev := p_patch->>'cast_register_device';                                                           -- ★3 0173
    if v_crdev is null or v_crdev not in ('store_device','own_phone') then raise exception 'bad cast_register_device'; end if;   -- ★3 0173
    v_before   := v_before || jsonb_build_object('cast_register_device', coalesce(v_settings->>'cast_register_device', ''));   -- ★3 0173
    v_after    := v_after  || jsonb_build_object('cast_register_device', v_crdev);                         -- ★3 0173
    v_settings := jsonb_set(v_settings, '{cast_register_device}', to_jsonb(v_crdev), true);                -- ★3 0173
  end if;                                                                                                  -- ★3 0173
  -- ★6 0173（裁定393）: 支払方法別の手数料率＝object {card, emoney, other}（整数 0〜100・cash／ar は持たない・欠損キー＝0＝手数料なし。UI の新規店の初期値がカード 10）
  if p_patch ? 'pay_fee_rates' then                                                                        -- ★6 0173
    if jsonb_typeof(p_patch->'pay_fee_rates') <> 'object' then raise exception 'bad type'; end if;         -- ★6 0173
    v_pfr := p_patch->'pay_fee_rates';                                                                     -- ★6 0173
    for v_pfk in select jsonb_object_keys(v_pfr) loop                                                      -- ★6 0173
      if v_pfk not in ('card','emoney','other') then raise exception 'bad pay_fee_rates'; end if;          -- ★6 0173
      if jsonb_typeof(v_pfr->v_pfk) <> 'number' then raise exception 'bad pay_fee_rates'; end if;          -- ★6 0173
      v_pfv := (v_pfr->>v_pfk)::numeric;                                                                   -- ★6 0173
      if v_pfv <> floor(v_pfv) or v_pfv < 0 or v_pfv > 100 then raise exception 'bad pay_fee_rates'; end if;   -- ★6 0173
    end loop;                                                                                              -- ★6 0173
    v_before   := v_before || jsonb_build_object('pay_fee_rates', coalesce(v_settings->'pay_fee_rates', '{}'::jsonb));   -- ★6 0173
    v_after    := v_after  || jsonb_build_object('pay_fee_rates', v_pfr);                                  -- ★6 0173
    v_settings := jsonb_set(v_settings, '{pay_fee_rates}', v_pfr, true);                                   -- ★6 0173
  end if;                                                                                                  -- ★6 0173
  -- ★7 0173（裁定396）: 体入の保証日数＝整数 1〜90（既定 3＝欠損時・「体入を追加」の期限付き保証の日数）
  if p_patch ? 'trial_guarantee_days' then                                                                 -- ★7 0173
    if jsonb_typeof(p_patch->'trial_guarantee_days') <> 'number' then raise exception 'bad type'; end if;  -- ★7 0173
    v_tgd := (p_patch->>'trial_guarantee_days')::numeric;                                                  -- ★7 0173
    if v_tgd <> floor(v_tgd) or v_tgd < 1 or v_tgd > 90 then raise exception 'bad trial_guarantee_days'; end if;   -- ★7 0173
    v_before   := v_before || jsonb_build_object('trial_guarantee_days', coalesce((v_settings->>'trial_guarantee_days')::numeric, 3));   -- ★7 0173
    v_after    := v_after  || jsonb_build_object('trial_guarantee_days', v_tgd::int);                      -- ★7 0173
    v_settings := jsonb_set(v_settings, '{trial_guarantee_days}', to_jsonb(v_tgd::int), true);             -- ★7 0173
  end if;                                                                                                  -- ★7 0173
  -- ★7 0173（裁定396）: 本採用（体入→在籍）時の既定プラン＝自店の有効な comp_plans.id（null＝未設定＝UI は切替しない）
  if p_patch ? 'default_plan_id' then                                                                      -- ★7 0173
    if jsonb_typeof(p_patch->'default_plan_id') = 'null' then                                              -- ★7 0173
      v_dpid := null;                                                                                      -- ★7 0173
    else                                                                                                   -- ★7 0173
      if jsonb_typeof(p_patch->'default_plan_id') <> 'string' then raise exception 'bad type'; end if;     -- ★7 0173
      begin v_dpid := (p_patch->>'default_plan_id')::uuid; exception when others then raise exception 'bad default_plan_id'; end;   -- ★7 0173
      if not exists (select 1 from public.comp_plans c where c.id = v_dpid and c.store_id = p_store_id and c.org_id = v_org and c.is_active) then   -- ★7 0173
        raise exception 'bad default_plan_id';                                                             -- ★7 0173
      end if;                                                                                              -- ★7 0173
    end if;                                                                                                -- ★7 0173
    v_before   := v_before || jsonb_build_object('default_plan_id', v_settings->'default_plan_id');        -- ★7 0173
    v_after    := v_after  || jsonb_build_object('default_plan_id', v_dpid);                               -- ★7 0173
    v_settings := jsonb_set(v_settings, '{default_plan_id}', coalesce(to_jsonb(v_dpid), 'null'::jsonb), true);   -- ★7 0173
  end if;                                                                                                  -- ★7 0173

  -- ★3 0175（X13-I ②・便 SH-UI-a A-1）: 就業規則に減給の定めがある（雇用のノルマ未達の懲戒減給の提案を出す）＝boolean・既定 false＝欠損時
  if p_patch ? 'sys_wage_cut_rule' then
    if jsonb_typeof(p_patch->'sys_wage_cut_rule') <> 'boolean' then raise exception 'bad type'; end if;
    v_wcr := (p_patch->>'sys_wage_cut_rule')::boolean;
    v_before   := v_before || jsonb_build_object('sys_wage_cut_rule', coalesce((v_settings->>'sys_wage_cut_rule')::boolean, false));
    v_after    := v_after  || jsonb_build_object('sys_wage_cut_rule', v_wcr);
    v_settings := jsonb_set(v_settings, '{sys_wage_cut_rule}', to_jsonb(v_wcr), true);
  end if;
  -- ★3 0175（裁定404）: 達成ボーナス多段の計算＝max（到達した最上段のみ・既定＝欠損時）／sum（到達した全段の合計）
  if p_patch ? 'bonus_tier_mode' then
    if jsonb_typeof(p_patch->'bonus_tier_mode') <> 'string' then raise exception 'bad type'; end if;
    v_btm := p_patch->>'bonus_tier_mode';
    if v_btm is null or v_btm not in ('max','sum') then raise exception 'bad bonus_tier_mode'; end if;
    v_before   := v_before || jsonb_build_object('bonus_tier_mode', coalesce(v_settings->>'bonus_tier_mode', 'max'));
    v_after    := v_after  || jsonb_build_object('bonus_tier_mode', v_btm);
    v_settings := jsonb_set(v_settings, '{bonus_tier_mode}', to_jsonb(v_btm), true);
  end if;
  -- ★3 0175（裁定409）: 複数指名の卓の売上の分け方＝prorate（伝票ごとの分配率・既定＝欠損時）／equal（指名した全員で等分＝cast_sales_aggregate が ratio_weight>0 を 1 と読む）
  if p_patch ? 'sales_split' then
    if jsonb_typeof(p_patch->'sales_split') <> 'string' then raise exception 'bad type'; end if;
    v_split := p_patch->>'sales_split';
    if v_split is null or v_split not in ('prorate','equal') then raise exception 'bad sales_split'; end if;
    v_before   := v_before || jsonb_build_object('sales_split', coalesce(v_settings->>'sales_split', 'prorate'));
    v_after    := v_after  || jsonb_build_object('sales_split', v_split);
    v_settings := jsonb_set(v_settings, '{sales_split}', to_jsonb(v_split), true);
  end if;
  -- ★3 0175（裁定405）: 店の既定 pt 付与ルール（新規プランがコピーする）＝object（pt_rules_check と同じ形）
  if p_patch ? 'pt_rules_default' then
    if jsonb_typeof(p_patch->'pt_rules_default') <> 'object' then raise exception 'bad type'; end if;
    v_ptr := p_patch->'pt_rules_default';
    perform public.pt_rules_check(v_ptr);
    v_before   := v_before || jsonb_build_object('pt_rules_default', coalesce(v_settings->'pt_rules_default', '{}'::jsonb));
    v_after    := v_after  || jsonb_build_object('pt_rules_default', v_ptr);
    v_settings := jsonb_set(v_settings, '{pt_rules_default}', v_ptr, true);
  end if;

  -- ★8 0175（398 打刻設定＝BZ-R）: 列側 8 キー。判定は TS（route /api/punch/self）・DB は値の形だけ見る（BANZEN と同じ）
  if p_patch ? 'punch_enforce' then
    if jsonb_typeof(p_patch->'punch_enforce') <> 'boolean' then raise exception 'bad type'; end if;
    v_penf := (p_patch->>'punch_enforce')::boolean;
    v_before := v_before || jsonb_build_object('punch_enforce', v_store.punch_enforce);
    v_after  := v_after  || jsonb_build_object('punch_enforce', v_penf);
  end if;
  if p_patch ? 'punch_restrict_mode' then
    if jsonb_typeof(p_patch->'punch_restrict_mode') <> 'string' then raise exception 'bad type'; end if;
    v_pmode := p_patch->>'punch_restrict_mode';
    if v_pmode is null or v_pmode not in ('gps','ip','either','both','tablet') then raise exception 'bad punch_restrict_mode'; end if;
    v_before := v_before || jsonb_build_object('punch_restrict_mode', v_store.punch_restrict_mode);
    v_after  := v_after  || jsonb_build_object('punch_restrict_mode', v_pmode);
  end if;
  if p_patch ? 'punch_lat' then
    if jsonb_typeof(p_patch->'punch_lat') not in ('number','null') then raise exception 'bad type'; end if;
    v_plat := (p_patch->>'punch_lat')::double precision;
    if v_plat is not null and (v_plat < -90 or v_plat > 90) then raise exception 'bad punch_lat'; end if;
    v_before := v_before || jsonb_build_object('punch_lat', v_store.punch_lat);
    v_after  := v_after  || jsonb_build_object('punch_lat', v_plat);
  end if;
  if p_patch ? 'punch_lng' then
    if jsonb_typeof(p_patch->'punch_lng') not in ('number','null') then raise exception 'bad type'; end if;
    v_plng := (p_patch->>'punch_lng')::double precision;
    if v_plng is not null and (v_plng < -180 or v_plng > 180) then raise exception 'bad punch_lng'; end if;
    v_before := v_before || jsonb_build_object('punch_lng', v_store.punch_lng);
    v_after  := v_after  || jsonb_build_object('punch_lng', v_plng);
  end if;
  if p_patch ? 'punch_radius_m' then
    if jsonb_typeof(p_patch->'punch_radius_m') not in ('number','null') then raise exception 'bad type'; end if;
    v_prad := (p_patch->>'punch_radius_m')::numeric;
    if v_prad is not null and (v_prad <> floor(v_prad) or v_prad < 10 or v_prad > 100000) then raise exception 'bad punch_radius_m'; end if;
    v_before := v_before || jsonb_build_object('punch_radius_m', v_store.punch_radius_m);
    v_after  := v_after  || jsonb_build_object('punch_radius_m', v_prad::int);
  end if;
  if p_patch ? 'punch_require_shift' then
    if jsonb_typeof(p_patch->'punch_require_shift') <> 'string' then raise exception 'bad type'; end if;
    v_preq := p_patch->>'punch_require_shift';
    if v_preq is null or v_preq not in ('off','warn','block') then raise exception 'bad punch_require_shift'; end if;
    v_before := v_before || jsonb_build_object('punch_require_shift', v_store.punch_require_shift);
    v_after  := v_after  || jsonb_build_object('punch_require_shift', v_preq);
  end if;
  -- ★8 0175（398）: 勤務時間の丸め＝単位 1／5／10／15／30 と方向。単位を 1 より大きくする・方向を変える＝同意版（punch_round_consent_version）必須→punch_round_consents に 1 行（append-only）
  if p_patch ? 'punch_round_unit' or p_patch ? 'punch_round_mode' then
    v_prunit := coalesce((p_patch->>'punch_round_unit')::numeric, v_store.punch_round_unit);
    v_prmode := coalesce(p_patch->>'punch_round_mode', v_store.punch_round_mode);
    if p_patch ? 'punch_round_unit' and jsonb_typeof(p_patch->'punch_round_unit') <> 'number' then raise exception 'bad type'; end if;
    if p_patch ? 'punch_round_mode' and jsonb_typeof(p_patch->'punch_round_mode') <> 'string' then raise exception 'bad type'; end if;
    if v_prunit is null or v_prunit not in (1,5,10,15,30) then raise exception 'bad punch_round_unit'; end if;
    if v_prmode is null or v_prmode not in ('staff_favor','store_favor','nearest') then raise exception 'bad punch_round_mode'; end if;
    if v_prunit::int <> v_store.punch_round_unit or v_prmode <> v_store.punch_round_mode then
      v_pcv := nullif(trim(coalesce(p_patch->>'punch_round_consent_version', '')), '');
      if v_prunit > 1 and v_pcv is null then raise exception 'consent required'; end if;
      select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
      insert into public.punch_round_consents (org_id, store_id, changed_by, old_unit, old_mode, new_unit, new_mode, consent_version)
      values (v_org, p_store_id, v_actor, v_store.punch_round_unit, v_store.punch_round_mode, v_prunit::int, v_prmode, v_pcv);
      v_before := v_before || jsonb_build_object('punch_round_unit', v_store.punch_round_unit, 'punch_round_mode', v_store.punch_round_mode);
      v_after  := v_after  || jsonb_build_object('punch_round_unit', v_prunit::int, 'punch_round_mode', v_prmode, 'punch_round_consent_version', v_pcv);
    end if;
  end if;
  -- ★8 0175（398）: ハード×位置を使う方法は位置と半径が必須（BANZEN の保存検証を DB にも）。Wi-Fi の必須は UI（store_wifi_add は別 RPC）
  -- ★0201g（相談役 ■3d の訂正・2026-11-11／作り直し 2026-11-12 相談役）: ハードの保存の検査は patch が打刻のキー（punch_enforce・punch_restrict_mode・punch_lat・punch_lng・punch_radius_m）を含む保存だけ
  --   値＝patch にキーがあれば patch の値（明示の null も含む＝null で検査をすり抜けない）・無ければ店の今の値。restrict_mode が null は gps（punch_self_impl と同じ）
  --   方法ごとの必須＝ip：店の IP（punch_allow_ip）1 件以上／gps：位置（lat・lng）と半径／both：両方／either：IP 1 件以上か位置と半径（どちらも無ければ 'ip required'）／tablet：検査しない。ハードでなければ検査しない
  if p_patch ?| array['punch_enforce','punch_restrict_mode','punch_lat','punch_lng','punch_radius_m'] then
    v_chk_enf  := case when p_patch ? 'punch_enforce' then v_penf else v_store.punch_enforce end;
    v_chk_mode := coalesce(case when p_patch ? 'punch_restrict_mode' then v_pmode else v_store.punch_restrict_mode end, 'gps');
    v_chk_geo  := (case when p_patch ? 'punch_lat' then v_plat else v_store.punch_lat end) is not null
              and (case when p_patch ? 'punch_lng' then v_plng else v_store.punch_lng end) is not null
              and (case when p_patch ? 'punch_radius_m' then v_prad else v_store.punch_radius_m end) is not null;
    -- 店の IP は v_store に無い（読んだ列だけの record）＝行から読む（for update＝store_wifi_remove と同じ行の錠で順に並べる）
    select coalesce(cardinality(s2.punch_allow_ip), 0) > 0 into v_chk_ip from public.stores s2 where s2.id = p_store_id for update;
    if coalesce(v_chk_enf, false) then
      if v_chk_mode in ('ip','both') and not v_chk_ip then raise exception 'ip required'; end if;
      if v_chk_mode = 'either' and not v_chk_ip and not v_chk_geo then raise exception 'ip required'; end if;
      if v_chk_mode in ('gps','both') and not v_chk_geo then raise exception 'range required'; end if;
    end if;
  end if;

  -- ★11 0175 v2（CN-R ②）: 卓種別のサービス率＝object {"VIP":35}（席種 卓／カウンター／VIP・0〜100 の整数・無い席種は service_rate）＝列側。checks への凍結は開卓時に席種で選ぶ（check_open＝P175）
  if p_patch ? 'service_rate_by_seat' then
    if jsonb_typeof(p_patch->'service_rate_by_seat') <> 'object' then raise exception 'bad type'; end if;
    v_srs := p_patch->'service_rate_by_seat';
    for v_jk in select jsonb_object_keys(v_srs) loop
      if v_jk not in ('卓','カウンター','VIP') or jsonb_typeof(v_srs->v_jk) <> 'number' then raise exception 'bad service_rate_by_seat'; end if;
      if (v_srs->>v_jk)::numeric < 0 or (v_srs->>v_jk)::numeric > 100 or (v_srs->>v_jk)::numeric <> floor((v_srs->>v_jk)::numeric) then raise exception 'bad service_rate_by_seat'; end if;
    end loop;
    v_before := v_before || jsonb_build_object('service_rate_by_seat', v_store.service_rate_by_seat);
    v_after  := v_after  || jsonb_build_object('service_rate_by_seat', v_srs);
  end if;
  -- ★11 0175 v2（CN-R ③）: 支払方法による割引＝object {cash, card, emoney, other}（%・0〜100・小数 1 桁・393 の pay_fee_rates の裏返し＝別キー）。check_pay が cash 等で割引行（fee_kind 'pay_discount'）を立てる
  if p_patch ? 'pay_discount_rates' then
    if jsonb_typeof(p_patch->'pay_discount_rates') <> 'object' then raise exception 'bad type'; end if;
    v_pdr := p_patch->'pay_discount_rates';
    for v_jk in select jsonb_object_keys(v_pdr) loop
      if v_jk not in ('cash','card','emoney','other') or jsonb_typeof(v_pdr->v_jk) <> 'number' then raise exception 'bad pay_discount_rates'; end if;
      if (v_pdr->>v_jk)::numeric < 0 or (v_pdr->>v_jk)::numeric > 100 or (v_pdr->>v_jk)::numeric <> round((v_pdr->>v_jk)::numeric, 1) then raise exception 'bad pay_discount_rates'; end if;
    end loop;
    v_before   := v_before || jsonb_build_object('pay_discount_rates', coalesce(v_settings->'pay_discount_rates', '{}'::jsonb));
    v_after    := v_after  || jsonb_build_object('pay_discount_rates', v_pdr);
    v_settings := jsonb_set(v_settings, '{pay_discount_rates}', v_pdr, true);
  end if;
  -- ★11 0175 v2（CN-R ⑨）: ドリンクバック（本数）の店スイッチ＝既定 true。false＝設定項目・レジの「誰のドリンクか」を出さず、ドリンクは小計の一部として指名種別の率で返る
  if p_patch ? 'sys_drink_count_back' then
    if jsonb_typeof(p_patch->'sys_drink_count_back') <> 'boolean' then raise exception 'bad type'; end if;
    v_sdcb := (p_patch->>'sys_drink_count_back')::boolean;
    v_before   := v_before || jsonb_build_object('sys_drink_count_back', coalesce((v_settings->>'sys_drink_count_back')::boolean, true));
    v_after    := v_after  || jsonb_build_object('sys_drink_count_back', v_sdcb);
    v_settings := jsonb_set(v_settings, '{sys_drink_count_back}', to_jsonb(v_sdcb), true);
  end if;
  -- ★11 0175 v2（CN-R ⑩）: 「売上小計」の範囲＝due（今＝サ料込・丸め後・手数料除く）／pre_tax_service（税サ前・割引前・セット含む）＋指名料を含む（既定 true）
  if p_patch ? 'sales_subtotal_mode' then
    if jsonb_typeof(p_patch->'sales_subtotal_mode') <> 'string' then raise exception 'bad type'; end if;
    v_ssm := p_patch->>'sales_subtotal_mode';
    if v_ssm is null or v_ssm not in ('due','pre_tax_service') then raise exception 'bad sales_subtotal_mode'; end if;
    v_before   := v_before || jsonb_build_object('sales_subtotal_mode', coalesce(v_settings->>'sales_subtotal_mode', 'due'));
    v_after    := v_after  || jsonb_build_object('sales_subtotal_mode', v_ssm);
    v_settings := jsonb_set(v_settings, '{sales_subtotal_mode}', to_jsonb(v_ssm), true);
  end if;
  if p_patch ? 'sales_subtotal_includes_shimei' then
    if jsonb_typeof(p_patch->'sales_subtotal_includes_shimei') <> 'boolean' then raise exception 'bad type'; end if;
    v_ssis := (p_patch->>'sales_subtotal_includes_shimei')::boolean;
    v_before   := v_before || jsonb_build_object('sales_subtotal_includes_shimei', coalesce((v_settings->>'sales_subtotal_includes_shimei')::boolean, true));
    v_after    := v_after  || jsonb_build_object('sales_subtotal_includes_shimei', v_ssis);
    v_settings := jsonb_set(v_settings, '{sales_subtotal_includes_shimei}', to_jsonb(v_ssis), true);
  end if;
  -- ★11 0175 v2（CN-R ⑳ 週払い）: settlement_cycle 'weekly' のときの締日（曜日 0〜6）と支払日（締日から n 日後 0〜31）。monthly は pay_day（既存）
  if p_patch ? 'settlement_week_close_dow' then
    if jsonb_typeof(p_patch->'settlement_week_close_dow') <> 'number' then raise exception 'bad type'; end if;
    v_wcd := (p_patch->>'settlement_week_close_dow')::numeric;
    if v_wcd <> floor(v_wcd) or v_wcd < 0 or v_wcd > 6 then raise exception 'bad settlement_week_close_dow'; end if;
    v_before   := v_before || jsonb_build_object('settlement_week_close_dow', v_settings->'settlement_week_close_dow');
    v_after    := v_after  || jsonb_build_object('settlement_week_close_dow', v_wcd::int);
    v_settings := jsonb_set(v_settings, '{settlement_week_close_dow}', to_jsonb(v_wcd::int), true);
  end if;
  if p_patch ? 'settlement_pay_days_after' then
    if jsonb_typeof(p_patch->'settlement_pay_days_after') <> 'number' then raise exception 'bad type'; end if;
    v_pda := (p_patch->>'settlement_pay_days_after')::numeric;
    if v_pda <> floor(v_pda) or v_pda < 0 or v_pda > 31 then raise exception 'bad settlement_pay_days_after'; end if;
    v_before   := v_before || jsonb_build_object('settlement_pay_days_after', v_settings->'settlement_pay_days_after');
    v_after    := v_after  || jsonb_build_object('settlement_pay_days_after', v_pda::int);
    v_settings := jsonb_set(v_settings, '{settlement_pay_days_after}', to_jsonb(v_pda::int), true);
  end if;
  -- ★11 0175 v2（CN-R ⑳ 日払いの上限）: 勤務時間で上限が変わる表＝array [{hours_min, cap}]（hours_min 昇順・cap 円・最大 10 段・空＝上限なし）。daily_pay_issue が p_worked_hours で読む
  -- ★24 0175 v2（裁定421 候補）: スタッフの割引・手数料カット＝0 承認制（既定）／1 上限内は即時／2 不可。上限＝staff_discount_cap（円・整数 ≥0）
  if p_patch ? 'sys_staff_discount' then
    if jsonb_typeof(p_patch->'sys_staff_discount') <> 'number' then raise exception 'bad type'; end if;
    v_ssd := (p_patch->>'sys_staff_discount')::numeric;
    if v_ssd <> floor(v_ssd) or v_ssd < 0 or v_ssd > 2 then raise exception 'bad sys_staff_discount'; end if;
    v_before   := v_before || jsonb_build_object('sys_staff_discount', v_settings->'sys_staff_discount');
    v_after    := v_after  || jsonb_build_object('sys_staff_discount', v_ssd::int);
    v_settings := jsonb_set(v_settings, '{sys_staff_discount}', to_jsonb(v_ssd::int), true);
  end if;
  if p_patch ? 'staff_discount_cap' then
    if jsonb_typeof(p_patch->'staff_discount_cap') <> 'number' then raise exception 'bad type'; end if;
    v_sdc := (p_patch->>'staff_discount_cap')::numeric;
    if v_sdc <> floor(v_sdc) or v_sdc < 0 or v_sdc > 10000000 then raise exception 'bad staff_discount_cap'; end if;
    v_before   := v_before || jsonb_build_object('staff_discount_cap', v_settings->'staff_discount_cap');
    v_after    := v_after  || jsonb_build_object('staff_discount_cap', v_sdc::int);
    v_settings := jsonb_set(v_settings, '{staff_discount_cap}', to_jsonb(v_sdc::int), true);
  end if;
  -- ★25 0175 v2（裁定420）: キャストのレジ使用＝0 OFF／1 注文のみ／2 会計まで（旧 cast_register_enabled は互換で残す＝set_store_cast_register が両方を書く）
  if p_patch ? 'sys_cast_register' then
    if jsonb_typeof(p_patch->'sys_cast_register') <> 'number' then raise exception 'bad type'; end if;
    v_scr := (p_patch->>'sys_cast_register')::numeric;
    if v_scr <> floor(v_scr) or v_scr < 0 or v_scr > 2 then raise exception 'bad sys_cast_register'; end if;
    v_before   := v_before || jsonb_build_object('sys_cast_register', v_settings->'sys_cast_register');   -- ★0200（裁定473）: 旧キー cast_register_enabled は廃止（書かない・消す）
    v_after    := v_after  || jsonb_build_object('sys_cast_register', v_scr::int);
    v_settings := jsonb_set(v_settings, '{sys_cast_register}', to_jsonb(v_scr::int), true) - 'cast_register_enabled';
  end if;
  -- ★27 0175 v2（裁定423 候補）: キオスクで使える機能＝{punch, register, shift}（boolean・無いキーは true）・無操作で自動ロックする秒数（60〜900・既定 180）
  if p_patch ? 'kiosk_features' then
    if jsonb_typeof(p_patch->'kiosk_features') <> 'object' then raise exception 'bad type'; end if;
    v_kf := p_patch->'kiosk_features';
    if exists (select 1 from jsonb_each(v_kf) e where e.key not in ('punch','register','shift') or jsonb_typeof(e.value) <> 'boolean') then raise exception 'bad kiosk_features'; end if;
    v_before   := v_before || jsonb_build_object('kiosk_features', v_settings->'kiosk_features');
    v_after    := v_after  || jsonb_build_object('kiosk_features', v_kf);
    v_settings := jsonb_set(v_settings, '{kiosk_features}', v_kf, true);
  end if;
  if p_patch ? 'kiosk_idle_sec' then
    if jsonb_typeof(p_patch->'kiosk_idle_sec') <> 'number' then raise exception 'bad type'; end if;
    v_kis := (p_patch->>'kiosk_idle_sec')::numeric;
    if v_kis <> floor(v_kis) or v_kis < 60 or v_kis > 900 then raise exception 'bad kiosk_idle_sec'; end if;
    v_before   := v_before || jsonb_build_object('kiosk_idle_sec', v_settings->'kiosk_idle_sec');
    v_after    := v_after  || jsonb_build_object('kiosk_idle_sec', v_kis::int);
    v_settings := jsonb_set(v_settings, '{kiosk_idle_sec}', to_jsonb(v_kis::int), true);
  end if;
  if p_patch ? 'punch_mode' then   -- ★0197（裁定455 の 1）: 打刻の 3 択目＝'store' のとき punch_methods は無視（白名単は触らない）
    if jsonb_typeof(p_patch->'punch_mode') <> 'string' then raise exception 'bad type'; end if;
    v_pmd := p_patch->>'punch_mode';
    if v_pmd is null or v_pmd not in ('punch','store') then raise exception 'bad punch_mode'; end if;
    v_before   := v_before || jsonb_build_object('punch_mode', coalesce(v_settings->>'punch_mode', 'punch'));
    v_after    := v_after  || jsonb_build_object('punch_mode', v_pmd);
    v_settings := jsonb_set(v_settings, '{punch_mode}', to_jsonb(v_pmd), true);
  end if;
  if p_patch ? 'register_window_before_min' then   -- ★0197（裁定455 の 5）: 確定シフトの開始の何分前からレジを開けるか
    if jsonb_typeof(p_patch->'register_window_before_min') <> 'number' then raise exception 'bad type'; end if;
    v_rwb := (p_patch->>'register_window_before_min')::numeric;
    if v_rwb <> floor(v_rwb) or v_rwb < 0 or v_rwb > 240 then raise exception 'bad register_window_before_min'; end if;
    v_before   := v_before || jsonb_build_object('register_window_before_min', v_settings->'register_window_before_min');
    v_after    := v_after  || jsonb_build_object('register_window_before_min', v_rwb::int);
    v_settings := jsonb_set(v_settings, '{register_window_before_min}', to_jsonb(v_rwb::int), true);
  end if;
  if p_patch ? 'register_window_after_min' then   -- ★0197（裁定455 の 5）: 終了の何分後まで
    if jsonb_typeof(p_patch->'register_window_after_min') <> 'number' then raise exception 'bad type'; end if;
    v_rwa := (p_patch->>'register_window_after_min')::numeric;
    if v_rwa <> floor(v_rwa) or v_rwa < 0 or v_rwa > 240 then raise exception 'bad register_window_after_min'; end if;
    v_before   := v_before || jsonb_build_object('register_window_after_min', v_settings->'register_window_after_min');
    v_after    := v_after  || jsonb_build_object('register_window_after_min', v_rwa::int);
    v_settings := jsonb_set(v_settings, '{register_window_after_min}', to_jsonb(v_rwa::int), true);
  end if;
  if p_patch ? 'kiosk_person_idle_minutes' then   -- ★0192 M-49（kiosk_idle_sec と同型）
    if jsonb_typeof(p_patch->'kiosk_person_idle_minutes') <> 'number' then raise exception 'bad type'; end if;
    v_kpi := (p_patch->>'kiosk_person_idle_minutes')::numeric;
    if v_kpi <> floor(v_kpi) or v_kpi < 1 or v_kpi > 120 then raise exception 'bad kiosk_person_idle_minutes'; end if;
    v_before   := v_before || jsonb_build_object('kiosk_person_idle_minutes', v_settings->'kiosk_person_idle_minutes');
    v_after    := v_after  || jsonb_build_object('kiosk_person_idle_minutes', v_kpi::int);
    v_settings := jsonb_set(v_settings, '{kiosk_person_idle_minutes}', to_jsonb(v_kpi::int), true);
  end if;
  if p_patch ? 'daily_pay_cap_tiers' then
    if jsonb_typeof(p_patch->'daily_pay_cap_tiers') <> 'array' then raise exception 'bad type'; end if;
    v_dct := p_patch->'daily_pay_cap_tiers';
    if jsonb_array_length(v_dct) > 10 then raise exception 'bad daily_pay_cap_tiers'; end if;
    v_prevh := null;
    for v_pe in select * from jsonb_array_elements(v_dct) loop
      if jsonb_typeof(v_pe) <> 'object' or jsonb_typeof(v_pe->'hours_min') <> 'number' or jsonb_typeof(v_pe->'cap') <> 'number' then raise exception 'bad daily_pay_cap_tiers'; end if;
      if (v_pe->>'hours_min')::numeric < 0 or (v_pe->>'cap')::numeric < 0 or (v_pe->>'cap')::numeric <> floor((v_pe->>'cap')::numeric) then raise exception 'bad daily_pay_cap_tiers'; end if;
      if v_prevh is not null and (v_pe->>'hours_min')::numeric <= v_prevh then raise exception 'bad daily_pay_cap_tiers'; end if;
      v_prevh := (v_pe->>'hours_min')::numeric;
    end loop;
    v_before   := v_before || jsonb_build_object('daily_pay_cap_tiers', coalesce(v_settings->'daily_pay_cap_tiers', '[]'::jsonb));
    v_after    := v_after  || jsonb_build_object('daily_pay_cap_tiers', v_dct);
    v_settings := jsonb_set(v_settings, '{daily_pay_cap_tiers}', v_dct, true);
  end if;

  -- ★0191（便 OB-2 ⑤）: 初期設定 v5 の器なし 5 項目（settings_json）
  if p_patch ? 'kind_back_rate' then
    if jsonb_typeof(p_patch->'kind_back_rate') <> 'object' then raise exception 'bad type'; end if;
    v_kbr := p_patch->'kind_back_rate';
    if exists (select 1 from jsonb_each(v_kbr) e where e.key not in ('hon','jonai','free') or jsonb_typeof(e.value) <> 'number' or (e.value::text)::numeric < 0 or (e.value::text)::numeric > 100 or (e.value::text)::numeric <> floor((e.value::text)::numeric)) then raise exception 'bad kind_back_rate'; end if;
    v_before   := v_before || jsonb_build_object('kind_back_rate', coalesce(v_settings->'kind_back_rate', '{}'::jsonb));
    v_after    := v_after  || jsonb_build_object('kind_back_rate', v_kbr);
    v_settings := jsonb_set(v_settings, '{kind_back_rate}', v_kbr, true);
  end if;
  if p_patch ? 'withholding_default_cast' then
    if jsonb_typeof(p_patch->'withholding_default_cast') <> 'string' then raise exception 'bad type'; end if;
    v_wdc := p_patch->>'withholding_default_cast';
    if v_wdc is null or v_wdc not in ('hostess','none') then raise exception 'bad withholding_default_cast'; end if;
    v_before   := v_before || jsonb_build_object('withholding_default_cast', coalesce(v_settings->>'withholding_default_cast', 'hostess'));
    v_after    := v_after  || jsonb_build_object('withholding_default_cast', v_wdc);
    v_settings := jsonb_set(v_settings, '{withholding_default_cast}', to_jsonb(v_wdc), true);
  end if;
  if p_patch ? 'withholding_default_staff' then
    if jsonb_typeof(p_patch->'withholding_default_staff') <> 'string' then raise exception 'bad type'; end if;
    v_wds := p_patch->>'withholding_default_staff';
    if v_wds is null or v_wds not in ('none','other_204') then raise exception 'bad withholding_default_staff'; end if;
    v_before   := v_before || jsonb_build_object('withholding_default_staff', coalesce(v_settings->>'withholding_default_staff', 'none'));
    v_after    := v_after  || jsonb_build_object('withholding_default_staff', v_wds);
    v_settings := jsonb_set(v_settings, '{withholding_default_staff}', to_jsonb(v_wds), true);
  end if;
  if p_patch ? 'cash_float_default' then
    if jsonb_typeof(p_patch->'cash_float_default') <> 'number' then raise exception 'bad type'; end if;
    v_cfd := (p_patch->>'cash_float_default')::numeric;
    if v_cfd <> floor(v_cfd) or v_cfd < 0 or v_cfd > 9999999 then raise exception 'bad cash_float_default'; end if;
    v_before   := v_before || jsonb_build_object('cash_float_default', coalesce(v_settings->'cash_float_default', '0'::jsonb));
    v_after    := v_after  || jsonb_build_object('cash_float_default', v_cfd::int);
    v_settings := jsonb_set(v_settings, '{cash_float_default}', to_jsonb(v_cfd::int), true);
  end if;
  if p_patch ? 'settlement_close_day' then
    if jsonb_typeof(p_patch->'settlement_close_day') <> 'number' then raise exception 'bad type'; end if;
    v_scd := (p_patch->>'settlement_close_day')::numeric;
    if v_scd not in (15, 20, 25, 31) then raise exception 'bad settlement_close_day'; end if;
    v_before   := v_before || jsonb_build_object('settlement_close_day', coalesce(v_settings->'settlement_close_day', '31'::jsonb));
    v_after    := v_after  || jsonb_build_object('settlement_close_day', v_scd::int);
    v_settings := jsonb_set(v_settings, '{settlement_close_day}', to_jsonb(v_scd::int), true);
  end if;

  -- ★0199（裁定459・M-114）: LINE 通知の種類ごとの ON／OFF＝settings_json.line_notify＝{notice, shift_published, shift_changed, remind} の boolean だけ（client の lib/nox/line/notify-kinds.ts と同じ鍵名）。
  --   知らない鍵／boolean 以外／object 以外＝'bad line_notify'。送られた object で置換（鍵の欠けは client の既定＝お知らせだけ ON）。DB 既定値なし。
  if p_patch ? 'line_notify' then
    if jsonb_typeof(p_patch->'line_notify') <> 'object' then raise exception 'bad line_notify'; end if;
    for v_jk in select jsonb_object_keys(p_patch->'line_notify') loop
      if v_jk not in ('notice','shift_published','shift_changed','remind') or jsonb_typeof(p_patch->'line_notify'->v_jk) <> 'boolean' then raise exception 'bad line_notify'; end if;
    end loop;
    v_before   := v_before || jsonb_build_object('line_notify', coalesce(v_settings->'line_notify', 'null'::jsonb));
    v_after    := v_after  || jsonb_build_object('line_notify', p_patch->'line_notify');
    v_settings := jsonb_set(v_settings, '{line_notify}', p_patch->'line_notify', true);
  end if;

  -- ★0200（裁定473・M-131）: 会計できる卓＝cast_register_scope＝'all'（既定＝全卓）／'own'（自分が着卓中／指名されている卓だけ）。キャストの RPC と RLS は auth_cast_check_allowed で判定
  if p_patch ? 'cast_register_scope' then
    if jsonb_typeof(p_patch->'cast_register_scope') <> 'string' then raise exception 'bad type'; end if;
    v_scope := p_patch->>'cast_register_scope';
    if v_scope is null or v_scope not in ('all','own') then raise exception 'bad cast_register_scope'; end if;
    v_before   := v_before || jsonb_build_object('cast_register_scope', coalesce(v_settings->>'cast_register_scope', ''));
    v_after    := v_after  || jsonb_build_object('cast_register_scope', v_scope);
    v_settings := jsonb_set(v_settings, '{cast_register_scope}', to_jsonb(v_scope), true);
  end if;

  -- ── 1 回で書く（patch に無い列は現値のまま） ──────────
  -- ★0201c（裁定480 の 1）: 体験入店の条件＝体入の時給（trial_wage）・体入中のバック（trial_back＝same＝本採用の既定プランと同じ／none＝なし）。日数は既存の trial_guarantee_days（出勤日数として読む＝裁定480 の 4）・本採用時のプランは既存の default_plan_id。
  if p_patch ? 'trial_wage' then
    if jsonb_typeof(p_patch->'trial_wage') <> 'number' then raise exception 'bad type'; end if;
    v_trw := (p_patch->>'trial_wage')::numeric;
    if v_trw <> floor(v_trw) or v_trw < 0 or v_trw > 100000 then raise exception 'bad trial_wage'; end if;
    v_before   := v_before || jsonb_build_object('trial_wage', v_settings->'trial_wage');
    v_after    := v_after  || jsonb_build_object('trial_wage', v_trw::int);
    v_settings := jsonb_set(v_settings, '{trial_wage}', to_jsonb(v_trw::int), true);
  end if;
  if p_patch ? 'trial_back' then
    if jsonb_typeof(p_patch->'trial_back') <> 'string' then raise exception 'bad type'; end if;
    v_trb := p_patch->>'trial_back';
    if v_trb is null or v_trb not in ('same','none') then raise exception 'bad trial_back'; end if;
    v_before   := v_before || jsonb_build_object('trial_back', coalesce(v_settings->>'trial_back', ''));
    v_after    := v_after  || jsonb_build_object('trial_back', v_trb);
    v_settings := jsonb_set(v_settings, '{trial_back}', to_jsonb(v_trb), true);
  end if;

  update public.stores set
    name               = case when p_patch ? 'name'               then v_name  else name end,
    short              = case when p_patch ? 'short'              then v_short else short end,
    ext_shimei_enabled = case when p_patch ? 'ext_shimei_enabled' then v_ext    else ext_shimei_enabled end,
    dohan_auto_hon     = case when p_patch ? 'dohan_auto_hon'     then v_dohan  else dohan_auto_hon end,
    invoice_registered_on = case when p_patch ? 'invoice_registered_on' then v_inv_on  else invoice_registered_on end,   -- ★2 0164
    pay_day            = case when p_patch ? 'pay_day'            then v_pay_day::int else pay_day end,                   -- ★2 0164
    tax_inclusive_display = case when p_patch ? 'tax_inclusive_display' then v_tax_inc else tax_inclusive_display end,   -- ★2 0164
    use_vip            = case when p_patch ? 'use_vip'            then v_use_vip else use_vip end,                        -- ★2 0164
    use_counter        = case when p_patch ? 'use_counter'        then v_use_ctr else use_counter end,                    -- ★2 0164
    payment_methods    = case when p_patch ? 'payment_methods'    then v_paym    else payment_methods end,                -- ★2 0164
    punch_methods      = case when p_patch ? 'punch_methods'      then v_punch   else punch_methods end,                  -- ★2 0164
    punch_enforce       = case when p_patch ? 'punch_enforce'       then v_penf  else punch_enforce end,                     -- ★8 0175（398）
    punch_restrict_mode = case when p_patch ? 'punch_restrict_mode' then v_pmode else punch_restrict_mode end,               -- ★8 0175
    punch_lat           = case when p_patch ? 'punch_lat'           then v_plat  else punch_lat end,                         -- ★8 0175
    punch_lng           = case when p_patch ? 'punch_lng'           then v_plng  else punch_lng end,                         -- ★8 0175
    punch_radius_m      = case when p_patch ? 'punch_radius_m'      then v_prad::int else punch_radius_m end,                -- ★8 0175
    punch_require_shift = case when p_patch ? 'punch_require_shift' then v_preq  else punch_require_shift end,               -- ★8 0175
    punch_round_unit    = case when p_patch ? 'punch_round_unit' or p_patch ? 'punch_round_mode' then v_prunit::smallint else punch_round_unit end,   -- ★8 0175
    punch_round_mode    = case when p_patch ? 'punch_round_unit' or p_patch ? 'punch_round_mode' then v_prmode else punch_round_mode end,   -- ★8 0175
    service_rate_by_seat = case when p_patch ? 'service_rate_by_seat' then v_srs else service_rate_by_seat end,                      -- ★11 0175 v2（CN-R ②）
    settings_json      = v_settings
  where id = p_store_id;

  perform public.audit_log_write('set_store_profile', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$;

-- ═══ ★7 store_wifi_remove（本番の定義＝0175・同じ署名・ACL 不変） ═══
CREATE OR REPLACE FUNCTION public.store_wifi_remove(p_store_id uuid, p_ip text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★8 0175（398）: 店 Wi-Fi の削除。owner／自店 manager・audit
declare
  v_org uuid := public.auth_org_id();
  v_row record;
  -- ★0201g 作り直し（2026-11-12 相談役）: 最後の 1 件の検査に使う店の今の値
  v_chk record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_ip is null or trim(p_ip) = '' then raise exception 'bad ip'; end if;
  select s.id, s.org_id, s.punch_allow_ip into v_row from public.stores s where s.id = p_store_id;
  if v_row.id is null or v_row.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  -- ★0201g 作り直し（2026-11-12 相談役）: 消すとハードの打刻の条件を満たさなくなる最後の 1 件は消させない＝'ip required'（set_store_profile の保存の検査と同じ条件）
  --   ハード×ip／both で最後の 1 件・ハード×either で位置と半径が無くて最後の 1 件（restrict_mode が null は gps＝IP を使わない）。登録されていない IP（何も消えない）は止めない
  --   行の錠（for update）で同時の削除と set_store_profile を順に並べる
  select s.punch_enforce, coalesce(s.punch_restrict_mode, 'gps') mode,
         trim(p_ip) = any(coalesce(s.punch_allow_ip, '{}'::text[])) hit,
         coalesce(cardinality(array_remove(s.punch_allow_ip, trim(p_ip))), 0) n_after,
         (s.punch_lat is not null and s.punch_lng is not null and s.punch_radius_m is not null) geo
    into v_chk from public.stores s where s.id = p_store_id for update;
  if coalesce(v_chk.punch_enforce, false) and v_chk.hit and v_chk.n_after = 0
     and (v_chk.mode in ('ip','both') or (v_chk.mode = 'either' and not v_chk.geo)) then
    raise exception 'ip required';
  end if;
  update public.stores set punch_allow_ip = array_remove(punch_allow_ip, trim(p_ip)), updated_at = now() where id = p_store_id;
  perform public.audit_log_write('store_wifi_remove', 'stores:' || p_store_id::text,
    jsonb_build_object('punch_allow_ip', v_row.punch_allow_ip), jsonb_build_object('punch_allow_ip', (select s.punch_allow_ip from public.stores s where s.id = p_store_id)), p_store_id);
end $function$;

commit;
