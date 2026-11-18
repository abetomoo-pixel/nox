-- 0201r_kiosk_cast_pin_lock5（2026-11-18 夜 起草・CC・相談役 ②・起草と試走まで＝貼らない・明日の朝に手貼り）。生成器＝docs/tmp/gen_0201r.mjs（底本＝docs/tmp/live_0201r/ の本番の定義＝CR を除いた md5 を照合）。
--   a 店の端末の入口 3 本：レジか締めの許可があるキャストは staff_pin が無いとき cast_pin で入れる・一覧に出る（失敗とロックは cast_pin の行）。
--   b ロックの長さの既定 5 分（関数 7 本）。c テーブルチャージ（fee_kind の CHECK 2 つ）。d 連携のリンクの発行し直しで前のリンクを期限切れに。
--   関数 454・表 122 のまま（作り直しだけ）。前提＝0201q の後。
-- 検証クエリ＝docs/tmp/0201r_verify.sql（先頭は貼り先証明）
begin;
set local lock_timeout = '10s';
CREATE OR REPLACE FUNCTION public.kiosk_login(p_membership_id uuid, p_pin text, p_device_fp text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_device  public.kiosk_devices;
  v_mem     record;
  v_pin     public.staff_pin;
  v_cast_pin uuid;   -- ★0201r（相談役 ② a）: staff_pin が無いキャストは cast_pin（打刻の PIN）で照合＝その cast_id（null＝staff_pin を使う）
  v_ip      text;
  v_sid     uuid;
  v_newfail integer;
  v_settings jsonb;
  v_max     integer;
  v_lock    interval;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */;
  if not found then raise exception 'forbidden'; end if;
  if v_device.device_fp is not null and (p_device_fp is null or p_device_fp <> v_device.device_fp) then raise exception 'device bound'; end if;   -- ★0190（裁定436 ①b）: 束縛済みの端末は同じ fp からだけ（未束縛＝旧 client の間は従来どおり）
  -- ★mig0108（M-11b ②）: ロック閾値を店設定から読む（既定 5回 / 15分＝改稿前のハードコードと同値）
  select s.settings_json into v_settings from public.stores s where s.id = v_device.store_id;
  v_max  := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_max_fail'), '')::int, 5);
  v_lock := make_interval(mins => coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_minutes'), '')::int, 5)   /* ★0201r（相談役 ② b）: 既定 5 分にそろえる（旧 10） */);   -- ★0190 K-1（裁定437）: 既定 10 分（5 回失敗＝pin_lock_max_fail の既定 5 のまま）
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  -- 形式不正 PIN は失敗カウント外（kiosk_punch 逐語・PIN 桁数＝cast_pin 現行4桁に揃える＝確定＋）
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then   -- ★0201（M-133）: 4 桁固定 → 4〜6 桁（set_staff_pin・kiosk_unlock と同じ）
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;

  -- 操作担当候補＝自店 active membership・owner/admin/manager/staff（★0196 裁定456 の 1＝staff は can_register を見ない）・cast は can_register かつ店のレジ使用（M-93）・
  -- 他店/他 org は not_found＝存在オラクル封じ）
  select m.id, m.user_id, m.role, u.name as user_name into v_mem
    from public.memberships m join public.users u on u.id = m.user_id
   where m.id = p_membership_id and m.store_id = v_device.store_id and m.is_active
     and u.is_active
     and (m.role in ('owner','admin','manager') or m.role = 'staff'   -- ★0196（裁定456 の 1）: staff は can_register に関係なく PIN で入れる（本人セッションの入口＝レジ操作の許可とは別・kiosk_operator_list は can_register のまま）
          or (m.role = 'cast' and (m.can_register or m.cast_can_close) and coalesce((select (s.settings_json->>'sys_cast_register')::int from public.stores s where s.id = m.store_id), 0) >= 1)   /* ★0201r（相談役 ② a）: レジか締めの許可 */ /* ★0201（裁定473・相談役 11/10）: 旧キー cast_register_enabled の OR を外す（0200 で旧キーは消えた＝正本は sys_cast_register） */);   -- ★0196 M-93（裁定455 差し替え）: castRegisterLevelOf と同じ判定（sys_cast_register>=1 または旧キー true）
  if v_mem.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select p.* into v_pin from public.staff_pin p
    where p.membership_id = p_membership_id
    for update;
  if not found then
    -- ★0201r（相談役 ② a）: レジか締めの許可があるキャストで staff_pin が無い＝打刻の PIN（cast_pin）で照合する（失敗とロックも cast_pin の行で数える）
    if v_mem.role = 'cast' then
      select cp.cast_id, cp.pin_hash, cp.fail_count, cp.locked_until
        into v_cast_pin, v_pin.pin_hash, v_pin.fail_count, v_pin.locked_until
        from public.cast_pin cp join public.casts ca on ca.id = cp.cast_id
       where ca.user_id = v_mem.user_id and ca.store_id = v_device.store_id
       for update of cp;
    end if;
    if v_cast_pin is null then
      return jsonb_build_object('ok', false, 'reason', 'no_pin');
    end if;
  end if;

  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked',
                              'locked_until', v_pin.locked_until);
  end if;

  if v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then
    v_newfail := v_pin.fail_count + 1;
    if v_cast_pin is not null then   -- ★0201r: cast_pin の行で数える
      if v_newfail >= v_max then
        update public.cast_pin set fail_count = 0, locked_until = now() + v_lock, updated_at = now() where cast_id = v_cast_pin;
      else
        update public.cast_pin set fail_count = v_newfail, updated_at = now() where cast_id = v_cast_pin;
      end if;
    elsif v_newfail >= v_max then
      update public.staff_pin
         set fail_count = 0, locked_until = now() + v_lock, updated_at = now()
       where membership_id = p_membership_id;
    else
      update public.staff_pin
         set fail_count = v_newfail, updated_at = now()
       where membership_id = p_membership_id;
    end if;
    insert into public.audit_logs
      (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values
      (v_device.org_id, v_device.store_id, null, 'kiosk_login',
       case when v_cast_pin is not null then 'cast_pin:' || v_cast_pin::text else 'staff_pin:' || p_membership_id::text end, null,   -- ★0201r
       jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', p_membership_id,
                          'result', 'wrong_pin', 'fail_count', v_newfail,
                          'locked', v_newfail >= v_max),
       v_ip);
    if v_newfail >= v_max then
      return jsonb_build_object('ok', false, 'reason', 'locked',
                                'locked_until', now() + v_lock);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  -- PIN 一致: カウンタ復元 → 既存セッションを閉じて差し替え → 新セッション発行
  if v_cast_pin is not null then   -- ★0201r
    update public.cast_pin set fail_count = 0, locked_until = null, updated_at = now() where cast_id = v_cast_pin;
  else
    update public.staff_pin
       set fail_count = 0, locked_until = null, updated_at = now()
     where membership_id = p_membership_id;
  end if;

  update public.kiosk_sessions set ended_at = now()
   where device_id = v_device.id and ended_at is null;

  -- ★mig0108（M-11b ①・レジ端末）: 端末の最終アクセスを記録（打刻端末は mig0109 の kiosk_punch 側）
  update public.kiosk_devices
     set last_seen_at = now(), last_ip = v_ip
   where id = v_device.id;

  insert into public.kiosk_sessions (org_id, store_id, device_id, membership_id, operator_user_id)
  values (v_device.org_id, v_device.store_id, v_device.id, p_membership_id, v_mem.user_id)
  returning id into v_sid;

  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, v_mem.user_id, 'kiosk_login',
     'kiosk_sessions:' || v_sid::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', p_membership_id,
                        'operator_user_id', v_mem.user_id, 'result', 'ok'),
     v_ip);

  return jsonb_build_object('ok', true, 'session_id', v_sid,
                            'operator_name', v_mem.user_name, 'role', v_mem.role,
                            'idle_minutes', 15);
end $function$;

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
  select coalesce(nullif(trim(st.settings_json->>'pin_lock_max_fail'), '')::int, 5), make_interval(mins => coalesce(nullif(trim(st.settings_json->>'pin_lock_minutes'), '')::int, 5)   /* ★0201r（相談役 ② b）: 既定 5 分にそろえる（旧 15） */)
    into v_max, v_lock from public.stores st where st.id = v_device.store_id;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then return jsonb_build_object('ok', false, 'reason', 'bad_pin'); end if;
  select count(*), (array_agg(x.mid))[1], jsonb_agg(jsonb_build_object('membership_id', x.mid, 'name', x.uname, 'role', x.role))
    into v_n, v_mid, v_cands
    from (
      select m.id as mid, u.name as uname, m.role
        from public.staff_pin sp
        join public.memberships m on m.id = sp.membership_id
        join public.users u on u.id = m.user_id
       where sp.store_id = v_device.store_id and m.is_active and u.is_active
         and (sp.locked_until is null or sp.locked_until < now())
         and (m.role in ('owner','admin','manager') or m.role = 'staff'   -- ★0196（裁定456 の 1）: staff は can_register に関係なく PIN で入れる（PIN の入口＝kiosk_login と同じ判定）
              or (m.role = 'cast' and (m.can_register or m.cast_can_close) and coalesce((select (st.settings_json->>'sys_cast_register')::int from public.stores st where st.id = m.store_id), 0) >= 1))   -- ★0201r: レジか締めの許可
         and sp.pin_hash = crypt(p_pin, sp.pin_hash)
         and (p_membership_id is null or m.id = p_membership_id)
      union all
      -- ★0201r（相談役 ② a）: staff_pin が無い、レジか締めの許可があるキャスト＝打刻の PIN（cast_pin）で照合
      select m.id, u.name, m.role
        from public.cast_pin cp
        join public.casts ca on ca.id = cp.cast_id
        join public.memberships m on m.user_id = ca.user_id and m.store_id = ca.store_id and m.role = 'cast'
        join public.users u on u.id = m.user_id
       where ca.store_id = v_device.store_id and m.is_active and u.is_active
         and (m.can_register or m.cast_can_close) and coalesce((select (st.settings_json->>'sys_cast_register')::int from public.stores st where st.id = m.store_id), 0) >= 1
         and not exists (select 1 from public.staff_pin sp2 where sp2.membership_id = m.id)
         and (cp.locked_until is null or cp.locked_until < now())
         and cp.pin_hash = crypt(p_pin, cp.pin_hash)
         and (p_membership_id is null or m.id = p_membership_id)
    ) x;
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

CREATE OR REPLACE FUNCTION public.kiosk_unlock_people()
 RETURNS TABLE(membership_id uuid, user_name text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- ★0201m（相談役■6・2026-11-13）: 店の端末のロック中に「名前を選んで入る」一覧＝kiosk_login が通す人と同じ条件（0201_punch_rules_pin.sql の kiosk_login の操作担当の候補）。端末でない接続は 0 行
  select m.id, u.name, m.role
    from public.memberships m
    join public.users u on u.id = m.user_id
   where m.store_id = public.auth_kiosk_store_id()
     and m.is_active and u.is_active
     and (m.role in ('owner','admin','manager','staff')
          or (m.role = 'cast' and (m.can_register or m.cast_can_close)   -- ★0201r（相談役 ② a）: レジか締めの許可
              and coalesce((select (s.settings_json->>'sys_cast_register')::int from public.stores s where s.id = m.store_id), 0) >= 1))
     and (exists (select 1 from public.staff_pin p where p.membership_id = m.id)
          or (m.role = 'cast' and exists (select 1 from public.cast_pin cp join public.casts ca on ca.id = cp.cast_id where ca.user_id = m.user_id and ca.store_id = m.store_id)))   -- ★0201r: staff_pin が無いキャストは cast_pin
   order by u.name
$function$;

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
  v_lock := make_interval(mins => coalesce(nullif(trim(v_settings->>'pin_lock_minutes'), '')::int, 5)   /* ★0201r（相談役 ② b）: 既定 5 分にそろえる（旧 15） */);
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

CREATE OR REPLACE FUNCTION public.set_store_pin_policy(p_store_id uuid, p_max_fail integer, p_lock_minutes integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store  record;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_max_fail is null or p_max_fail < 3 or p_max_fail > 10 then raise exception 'bad max_fail'; end if;
  if p_lock_minutes is null or p_lock_minutes < 5 or p_lock_minutes > 60 then raise exception 'bad lock_minutes'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（D3a）

  v_before := jsonb_build_object(
    'pin_lock_max_fail', coalesce(nullif(trim(v_store.settings_json->>'pin_lock_max_fail'), '')::int, 5),
    'pin_lock_minutes',  coalesce(nullif(trim(v_store.settings_json->>'pin_lock_minutes'), '')::int, 5)   /* ★0201r（相談役 ② b）: 既定 5 分にそろえる（旧 15） */
  );
  update public.stores
     set settings_json =
       jsonb_set(
         jsonb_set(coalesce(settings_json, '{}'::jsonb),
           '{pin_lock_max_fail}', to_jsonb(p_max_fail), true),
         '{pin_lock_minutes}',  to_jsonb(p_lock_minutes), true)
   where id = p_store_id;
  v_after := jsonb_build_object('pin_lock_max_fail', p_max_fail, 'pin_lock_minutes', p_lock_minutes);
  perform public.audit_log_write('set_store_pin_policy', 'stores:' || p_store_id::text, v_before, v_after, p_store_id);
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
  v_lock := make_interval(mins => coalesce(nullif(trim(v_settings->>'pin_lock_minutes'), '')::int, 5)   /* ★0201r（相談役 ② b）: 既定 5 分にそろえる（旧 15） */);
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

CREATE OR REPLACE FUNCTION public.kiosk_punch(p_cast_id uuid, p_pin text, p_type text, p_okuri boolean DEFAULT NULL::boolean, p_day_deductions jsonb DEFAULT NULL::jsonb)
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
  v_okuri    boolean;  -- ★4 0156（裁定309-9）
  v_lock     interval; -- ★0192 M-46: ロック時間＝店設定 pin_lock_minutes（既定 10 分＝kiosk_login と揃える）
  v_d        record;   -- ★0196（§9-2）: 出勤時の「今日の控除」
  v_biz      date;
  v_default  boolean;
  v_dd       record;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */;
  if not found then raise exception 'forbidden'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  if p_day_deductions is not null and (jsonb_typeof(p_day_deductions) <> 'array' or p_type <> 'in') then raise exception 'bad day deductions'; end if;   -- ★0196（§9-2）: 出勤のときだけ受理
  if p_day_deductions is not null and public.auth_kiosk_operator() is null then raise exception 'forbidden'; end if;   -- ★0198（裁定461）: 今日の控除の選択は店側だけ＝端末では操作担当（staff 以上）が解錠中のときだけ受理（cast の PIN だけなら forbidden）
  v_lock := make_interval(mins => coalesce(nullif(trim(coalesce((select s.settings_json from public.stores s where s.id = v_device.store_id), '{}'::jsonb)->>'pin_lock_minutes'), '')::int, 5)   /* ★0201r（相談役 ② b）: 既定 5 分にそろえる（旧 10） */);   -- ★0192 M-46
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  -- 形式不正 PIN は失敗カウント外（UI は4桁パッド前提・総当たりは4桁一致のみ計上）
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$'   /* ★0191（便 OB-2 ⑤）: PIN 4〜6 桁 */ then
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
         set fail_count = 0, locked_until = now() + v_lock, updated_at = now()
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
                                'locked_until', now() + v_lock);
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

  v_okuri := public.okuri_default_of(v_cast.store_id, p_type, p_okuri);  -- ★4 0156
  perform public.punch_seq_check(v_cast.store_id, p_cast_id, p_type, now());   -- ★3 0161（裁定327）: 順序検査（raise＝rpc-err 様式・端末の和文は M1）
  insert into public.punches (org_id, store_id, cast_id, type, lat, lng, ip, source, okuri)  -- ★4 0156: +okuri
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_type, null, null, v_ip, 'kiosk', v_okuri)
  returning id into v_punch_id;

  -- ★0196（M-103・§9-2）: 出勤と同時に「今日の控除」（rows＝[{deduction_id, enabled}]・PIN が本人確認＝操作担当は要らない・既定どおりの行は消す＝cast_day_deductions_set と同じ式）
  if p_day_deductions is not null and p_type = 'in' then
    v_biz := public.biz_date_of(v_cast.store_id, now());
    for v_dd in select * from jsonb_to_recordset(p_day_deductions) as x(deduction_id uuid, enabled boolean) loop
      if v_dd.deduction_id is null or v_dd.enabled is null then raise exception 'bad row'; end if;
      select d.id, d.per, d.day_rule, d.is_active into v_d from public.deductions d where d.id = v_dd.deduction_id and d.store_id = v_cast.store_id;
      if v_d.id is null then raise exception 'bad deduction'; end if;
      if v_d.per <> 'day' or not v_d.is_active then raise exception 'not day rule'; end if;
      v_default := (v_d.day_rule = 'always');
      if v_dd.enabled = v_default then
        delete from public.cast_day_deductions where cast_id = p_cast_id and biz_date = v_biz and deduction_id = v_dd.deduction_id;
      else
        insert into public.cast_day_deductions (org_id, store_id, cast_id, biz_date, deduction_id, enabled, set_by)
        values (v_cast.org_id, v_cast.store_id, p_cast_id, v_biz, v_dd.deduction_id, v_dd.enabled, null)
        on conflict (cast_id, biz_date, deduction_id) do update set enabled = excluded.enabled, set_by = null, set_at = now();
      end if;
    end loop;
  end if;

  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, null, 'kiosk_punch',
     'punches:' || v_punch_id::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', p_cast_id,
                        'type', p_type, 'result', 'ok', 'day_deductions', p_day_deductions),   -- ★0196: 送られた行も台帳に
     v_ip);

  return jsonb_build_object('ok', true, 'punch_id', v_punch_id, 'punched_at', now(),
    'day_applied', case when p_type = 'in' then public.cast_day_applied_of(p_cast_id, public.biz_date_of(v_cast.store_id, now())) else '[]'::jsonb end);   -- ★0198（裁定461 ②）: 店が付けた今日の控除（端末の表示だけ）
end $function$;

CREATE OR REPLACE FUNCTION public.staff_punch(p_membership_id uuid, p_pin text, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
-- ★5 0174（P172 Q-4 の積み残し）: 打刻端末からのスタッフ打刻＝kiosk_punch（cast）と kiosk_login（staff_pin の照合・ロック閾値＝店設定）の合成。
--   順序検査＝当営業日の最後の打刻が in なら out だけ・無いか out なら in だけ（'already in'／'not in'）。source 'kiosk'・created_by null。
declare
  v_device   public.kiosk_devices;
  v_mem      record;
  v_pin      public.staff_pin;
  v_ip       text;
  v_id       uuid;
  v_newfail  integer;
  v_settings jsonb;
  v_max      integer;
  v_lock     interval;
  v_bd       date;
  v_last     text;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */;
  if not found then raise exception 'forbidden'; end if;
  if p_kind is null or p_kind not in ('in','out') then raise exception 'bad kind'; end if;
  select s.settings_json into v_settings from public.stores s where s.id = v_device.store_id;
  v_max  := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_max_fail'), '')::int, 5);
  v_lock := make_interval(mins => coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_minutes'), '')::int, 5)   /* ★0201r（相談役 ② b）: 既定 5 分にそろえる（旧 10） */);   -- ★0192 M-46: 既定 15→10 分（kiosk_login と揃える）
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  -- 形式不正 PIN は失敗カウント外（kiosk_login 逐語）
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$'   /* ★0191（便 OB-2 ⑤）: PIN 4〜6 桁 */ then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;

  -- 対象＝自店 active の manager／staff（他店／他 org は not_found＝存在オラクル封じ）
  select m.id, m.user_id, m.role, u.name as user_name into v_mem
    from public.memberships m join public.users u on u.id = m.user_id
   where m.id = p_membership_id and m.store_id = v_device.store_id and m.is_active
     and u.is_active and (m.role = 'staff' or (m.role = 'manager' and coalesce((select st.manager_punch_enabled from public.stores st where st.id = v_device.store_id), true)));   -- ★0201（裁定474）: 店長の打刻の許可（OFF の店は店長の打刻を受けない）
  if v_mem.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select p.* into v_pin from public.staff_pin p
    where p.membership_id = p_membership_id
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
    if v_newfail >= v_max then
      update public.staff_pin
         set fail_count = 0, locked_until = now() + v_lock, updated_at = now()
       where membership_id = p_membership_id;
    else
      update public.staff_pin
         set fail_count = v_newfail, updated_at = now()
       where membership_id = p_membership_id;
    end if;
    insert into public.audit_logs
      (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values
      (v_device.org_id, v_device.store_id, null, 'staff_punch',
       'staff_pin:' || p_membership_id::text, null,
       jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', p_membership_id,
                          'result', 'wrong_pin', 'fail_count', v_newfail,
                          'locked', v_newfail >= v_max),
       v_ip);
    if v_newfail >= v_max then
      return jsonb_build_object('ok', false, 'reason', 'locked',
                                'locked_until', now() + v_lock);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  -- PIN 一致: カウンタ復元 → 端末の最終アクセス → 順序検査 → 記録
  update public.staff_pin
     set fail_count = 0, locked_until = null, updated_at = now()
   where membership_id = p_membership_id;
  update public.kiosk_devices
     set last_seen_at = now(), last_ip = v_ip
   where id = v_device.id;

  v_bd := public.biz_date_of(v_device.store_id, now());
  if exists (select 1 from public.staff_attendance_locks l where l.store_id = v_device.store_id and l.period = to_char(v_bd, 'YYYY-MM')) then raise exception 'confirmed'; end if;   -- ★0193: 確定済みの月には打てない（調査 1）
  select sp.kind into v_last from public.staff_punches sp
   where sp.membership_id = p_membership_id and sp.biz_date = v_bd
   order by sp.punched_at desc limit 1;
  if p_kind = 'in' and v_last = 'in' then raise exception 'already in'; end if;
  if p_kind = 'out' and (v_last is null or v_last = 'out') then raise exception 'not in'; end if;

  insert into public.staff_punches (membership_id, org_id, store_id, biz_date, kind, punched_at, source, created_by)
  values (p_membership_id, v_device.org_id, v_device.store_id, v_bd, p_kind, now(), 'kiosk', null)
  returning id into v_id;

  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, v_mem.user_id, 'staff_punch',
     'staff_punches:' || v_id::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', p_membership_id,
                        'kind', p_kind, 'biz_date', v_bd, 'result', 'ok'),
     v_ip);

  return jsonb_build_object('ok', true, 'punch_id', v_id, 'punched_at', now(), 'biz_date', v_bd,
                            'operator_name', v_mem.user_name, 'kind', p_kind);
end $function$;

CREATE OR REPLACE FUNCTION public.line_bind_token_create(p_subject_kind text, p_subject_id uuid, p_purpose text DEFAULT 'bind'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★1 0176（401）: LINE 紐付けの招待トークン＝owner／自店 manager が cast（casts.id）／membership（memberships.id）に発行。戻り＝平文トークン（1 回だけ・DB は sha256 の hex）。有効 7 日
declare
  v_org uuid := public.auth_org_id();
  v_store uuid; v_token text; v_actor uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_subject_kind is null or p_subject_kind not in ('cast','membership') then raise exception 'bad subject'; end if;
  if p_purpose is null or p_purpose not in ('onboard','bind') then raise exception 'bad purpose'; end if;
  if p_subject_kind = 'cast' then
    select c.store_id into v_store from public.casts c where c.id = p_subject_id and c.org_id = v_org and c.is_active;
  else
    select m.store_id into v_store from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_subject_id and s.org_id = v_org and m.is_active;
  end if;
  if v_store is null then raise exception 'not found'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_store = public.auth_store_id())) then raise exception 'forbidden'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  -- ★0201r（相談役 ② d）: 発行し直し＝同じ人・同じ用途の、使われていない期限内のリンクを期限切れにする（bind_line は期限切れを 'bad token'）
  update public.line_bind_tokens set expires_at = now() - interval '1 second'   -- 同じ取引の中でも bind_line（expires_at < now()）が期限切れと見る
   where org_id = v_org and subject_kind = p_subject_kind and subject_id = p_subject_id and purpose = p_purpose
     and used_at is null and expires_at > now();
  insert into public.line_bind_tokens (org_id, store_id, subject_kind, subject_id, purpose, token_hash, expires_at, created_by)
  values (v_org, v_store, p_subject_kind, p_subject_id, p_purpose, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + interval '7 days', v_actor);
  perform public.audit_log_write('line_bind_token_create', p_subject_kind || 's:' || p_subject_id::text, null, jsonb_build_object('purpose', p_purpose, 'expires_days', 7), v_store);
  return v_token;
end $function$;

-- c（相談役 ② c）: テーブルチャージ＝料金の種類に 'table_charge'（既存の値はそのまま通る＝足すだけの CHECK の張り替え）
alter table public.pricing_rules drop constraint pricing_rules_fee_kind_check;
alter table public.pricing_rules add constraint pricing_rules_fee_kind_check check (fee_kind = any (array['set', 'extension', 'dohan', 'hon_shimei', 'jonai_shimei', 'ext_shimei', 'vip_charge', 'table_charge']));
alter table public.check_lines drop constraint check_lines_fee_kind_check;
alter table public.check_lines add constraint check_lines_fee_kind_check check (fee_kind is null or fee_kind = any (array['set', 'extension', 'dohan', 'hon_shimei', 'jonai_shimei', 'ext_shimei', 'vip_charge', 'pay_fee', 'pay_discount', 'pay_discount_total', 'table_charge']));

commit;
