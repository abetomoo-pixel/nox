-- 0201_punch_rules_pin.sql（裁定474＝打刻設定を BANZEN と同じ形に・M-133 の DDL 2 点）
-- 翻訳元: BANZEN（../makanai-shift）supabase/migrations/0205 punch_self_impl・lib/geofence.ts・lib/punch-rules.ts／NOX の live pg_get_functiondef（punch_self／kiosk_login／staff_punch＝scratchpad/live0201・0199 適用後）＋生成器 docs/tmp/gen_0201.cjs
-- 検証クエリ: docs/tmp/0201_verify.sql（先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）
-- 順序＝0200 → 0200 フラグ便 → 0201（間を空けずに・合図は相談役）。関数 427→431（新設 4・作り直し 4）・表 121 不変・列 punches +10・stores +1。
-- ★1 punches に判定の結果の列 10（within_schedule・geo_*）★2 stores.manager_punch_enabled ★3 punch_self_impl（service_role だけ）★4 punch_self（自己申告を受けない・ハード等は 'use route'）
-- ★5 kiosk_login（PIN 4〜6 桁・旧キーの OR を外す）★6 staff_punch（店長の打刻の許可）★7 set_store_manager_punch ★8 staff_pin_self_set／cast_pin_self_set（本人の PIN 変更）★9 staff_pin_status（旧キー → sys_cast_register）
-- ★教訓132: begin の直後に lock_timeout
begin;
set local lock_timeout = '10s';

-- ═══ ★1 punches＝判定の結果（ソフトは記録だけ残して通す＝勤怠に印・BANZEN 0109／0062 と同じ列名） ═══
alter table public.punches add column if not exists within_schedule boolean;
alter table public.punches add column if not exists geo_distance_m integer;
alter table public.punches add column if not exists geo_gps_ok boolean;
alter table public.punches add column if not exists geo_ip_ok boolean;
alter table public.punches add column if not exists geo_reason text;
alter table public.punches add column if not exists geo_store_lat double precision;
alter table public.punches add column if not exists geo_store_lng double precision;
alter table public.punches add column if not exists geo_radius_m integer;
alter table public.punches add column if not exists geo_mode text;
alter table public.punches add column if not exists geo_accuracy_m integer;
comment on column public.punches.within_schedule is '★0201（裁定474）: 予定外の打刻の判定（出勤だけ・確定シフトの有無）＝false は勤怠に「予定外」の印・null は未判定';
comment on column public.punches.geo_reason is '★0201（裁定474）: 判定の理由（例「店舗から約 120m（許可内）」）＝判定当時の店の値は geo_store_lat／lng／radius_m／mode に写す';

-- ═══ ★2 stores.manager_punch_enabled＝店長の打刻の許可（既定 true＝今の挙動＝店長もキオスクで打刻） ═══
alter table public.stores add column if not exists manager_punch_enabled boolean not null default true;
comment on column public.stores.manager_punch_enabled is '★0201（裁定474）: 店長の打刻の許可（false＝店長の打刻を受けない＝staff_punch が not_found）';

-- ═══ ★3 punch_self_impl＝本人のスマホ打刻（service_role だけ＝route /api/punch/self が本人の auth と判定の結果を渡す・BANZEN 0205 の翻訳） ═══
create or replace function public.punch_self_impl(p_actor uuid, p_type text, p_geo jsonb, p_okuri boolean default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
-- ★0201（裁定474）: p_actor＝route が確かめた本人の auth.uid・p_geo＝route の判定（within・evaluable・accuracy_pending・terminal_only・override_reason・within_schedule・ip・distance_m・gps_ok・ip_ok・reason・accuracy_m）。
--   柵＝本人のキャスト（有効）・本人のスマホ打刻 ON・打刻する店・順序（punch_seq_check）・ハード＝店の端末のみは 'terminal_only'・範囲外で理由なしは 'geofence_blocked'（理由ありは通して geo_override）・予定外 block の出勤は 'no shift'。
--   記録＝生の座標は残さない（BANZEN 0109）・IP は route がサーバーで取った値・判定当時の店の値は stores から写す。
declare
  v_cast record; v_st record; v_id uuid; v_okuri boolean;
  v_within boolean := coalesce((p_geo->>'within')::boolean, false);
  v_eval   boolean := coalesce((p_geo->>'evaluable')::boolean, false);
  v_pend   boolean := coalesce((p_geo->>'accuracy_pending')::boolean, false);
  v_term   boolean := coalesce((p_geo->>'terminal_only')::boolean, false);
  v_reason text := btrim(coalesce(p_geo->>'override_reason', ''));
  v_sched  boolean := (p_geo->>'within_schedule')::boolean;
  v_located boolean := coalesce((p_geo->>'located')::boolean, false);   -- 位置が取れた（緯度経度あり ∧ 誤差 ≤ 200m）＝route の判定
  v_gpsok  boolean := coalesce((p_geo->>'gps_ok')::boolean, false);
  v_ip     text := nullif(p_geo->>'ip', '');                             -- route がサーバーで取った IP（x-forwarded-for の先頭）
  v_ipok   boolean; v_mode text; v_code text;
  v_over   boolean := false;
begin
  if p_actor is null or p_geo is null or jsonb_typeof(p_geo) <> 'object' then raise exception 'bad args'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  select c.id, c.org_id, c.store_id into v_cast
    from public.casts c join public.users u on u.id = c.user_id
   where u.auth_user_id = p_actor and u.is_active and c.is_active
   limit 1;
  if v_cast.id is null then raise exception 'forbidden'; end if;
  select s.punch_enforce, s.punch_require_shift, s.punch_restrict_mode, s.punch_lat, s.punch_lng, s.punch_radius_m, s.punch_allow_ip,
         coalesce((s.punch_methods->>'self')::boolean, true) self_on, coalesce(s.settings_json->>'punch_mode', 'punch') pm
    into v_st from public.stores s where s.id = v_cast.store_id;
  if v_st.pm = 'store' or not v_st.self_on then raise exception 'self disabled'; end if;
  -- ★相談役 11/10 作り直し②: 判定は lib/nox/punch/geofence.ts の decidePunch と同じ決まり。店の範囲（evaluable）と IP の一致はサーバーの値で再計算（route の申告に頼らない）
  v_mode := coalesce(v_st.punch_restrict_mode, 'gps');
  v_ipok := v_ip is not null and v_ip = any(coalesce(v_st.punch_allow_ip, '{}'::text[]));
  v_eval := case v_mode
              when 'gps'    then v_st.punch_lat is not null and v_st.punch_lng is not null and coalesce(v_st.punch_radius_m, 0) > 0
              when 'ip'     then coalesce(cardinality(v_st.punch_allow_ip), 0) > 0
              when 'both'   then v_st.punch_lat is not null and v_st.punch_lng is not null and coalesce(v_st.punch_radius_m, 0) > 0 and coalesce(cardinality(v_st.punch_allow_ip), 0) > 0
              when 'either' then (v_st.punch_lat is not null and v_st.punch_lng is not null and coalesce(v_st.punch_radius_m, 0) > 0) or coalesce(cardinality(v_st.punch_allow_ip), 0) > 0
              else false end;
  v_within := case v_mode when 'gps' then v_gpsok when 'ip' then v_ipok when 'both' then v_gpsok and v_ipok when 'either' then v_gpsok or v_ipok else false end;
  if coalesce(v_st.punch_enforce, false) then
    if v_term or v_mode = 'tablet' then raise exception 'terminal_only'; end if;   -- 店の端末のみ＝理由でも通さない
    if v_eval then
      if v_mode = 'gps' then
        if not v_located then v_code := 'geofence_unavailable';   -- 位置情報の許可拒否・取得失敗・精度不足＝範囲外と同じ
        elsif not v_within then v_code := 'geofence_blocked'; end if;
      elsif v_mode = 'ip' then
        if not v_within then v_code := 'geofence_blocked'; end if;   -- IP はサーバーで取る＝常に判定できる
      elsif v_mode = 'both' then
        -- ★相談役 11/11 作り直し⑤（裁定474 追補・Agoora 確定＝BANZEN と違える）: 両方＝IP は常に必須・位置は精度不足なら判定保留で通す（IP の不一致を保留で通さない）
        if not (v_ipok and (v_gpsok or v_pend)) then v_code := 'geofence_blocked'; end if;
      elsif not (v_within or v_pend) then
        v_code := 'geofence_blocked';   -- either＝BANZEN の decidePunch（精度不足は判定保留で通す）
      end if;
      if v_code is not null then
        if v_reason = '' then raise exception '%', v_code; end if;
        v_over := true;   -- 理由を書いて通す（記録に残す）
      end if;
    end if;
  end if;
  -- 予定外の打刻（出勤だけ・block は記録しない）
  -- ★相談役 11/11 作り直し④: block の出勤は within_schedule が true のときだけ通す（null＝route の渡し忘れも閉じる）
  if p_type = 'in' and coalesce(v_st.punch_require_shift, 'off') = 'block' and v_sched is not true then raise exception 'no shift'; end if;
  v_okuri := public.okuri_default_of(v_cast.store_id, p_type, p_okuri);
  perform public.punch_seq_check(v_cast.store_id, v_cast.id, p_type, now());
  insert into public.punches (org_id, store_id, cast_id, type, lat, lng, ip, source, okuri, within_geofence, geo_override, note,
                              within_schedule, geo_distance_m, geo_gps_ok, geo_ip_ok, geo_reason, geo_store_lat, geo_store_lng, geo_radius_m, geo_mode, geo_accuracy_m)
  values (v_cast.org_id, v_cast.store_id, v_cast.id, p_type, null, null, v_ip, 'self', v_okuri, case when v_eval then v_within end, v_over, case when v_over then left(v_reason, 200) else null end,
          case when coalesce(v_st.punch_require_shift, 'off') = 'off' or p_type <> 'in' then null else v_sched end,
          round((p_geo->>'distance_m')::numeric)::int, v_gpsok, v_ipok, left(coalesce(nullif(p_geo->>'reason', ''), v_code), 200),
          v_st.punch_lat, v_st.punch_lng, v_st.punch_radius_m, coalesce(v_st.punch_restrict_mode, 'gps'), round((p_geo->>'accuracy_m')::numeric)::int)
  returning id into v_id;
  perform public.audit_log_write_service(v_cast.org_id, (select u.id from public.users u where u.auth_user_id = p_actor), 'punch_self', 'punches:' || v_id::text, null,
    (select to_jsonb(p) - 'lat' - 'lng' from public.punches p where p.id = v_id), v_cast.store_id);
  -- ★相談役 11/11 作り直し③: 店の範囲が判定できない（v_eval false）ときは within_geofence を null（未判定）で記録・返す＝punch_self と揃える
  return jsonb_build_object('ok', true, 'punch_id', v_id, 'within_geofence', case when v_eval then v_within end, 'override', v_over);
end $function$;
revoke execute on function public.punch_self_impl(uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.punch_self_impl(uuid, text, jsonb, boolean) to service_role;

-- ═══ ★4 punch_self（同じ署名・ACL 不変＝自己申告を受けない互換の入口） ═══
CREATE OR REPLACE FUNCTION public.punch_self(p_type text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_okuri boolean DEFAULT NULL::boolean, p_within_geofence boolean DEFAULT NULL::boolean, p_geo_override boolean DEFAULT false, p_override_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast uuid; v_row record; v_ip text; v_id uuid;
  v_okuri boolean;  -- ★4 0156（裁定309-9）: out 打刻の送り利用（既定＝okuri_default_of）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'no cast for caller'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  -- ★0201（裁定474）: 端末の自己申告（p_within_geofence／p_geo_override）は受けない＝判定は route /api/punch/self → punch_self_impl（service_role）。
  --   ここは判定の要らない店（ソフト・予定外の判定なし）だけの互換の入口＝within_geofence は null（未判定）で記録。ハード／予定外 block の店は 'use route'・本人のスマホ打刻 OFF（または店の端末だけの店）は 'self disabled'
  select c.org_id, c.store_id, coalesce(s.punch_enforce, false) enf, coalesce(s.punch_require_shift, 'off') rs,
         coalesce((s.punch_methods->>'self')::boolean, true) self_on, coalesce(s.settings_json->>'punch_mode', 'punch') pm
    into v_row from public.casts c join public.stores s on s.id = c.store_id where c.id = v_cast;
  if v_row.pm = 'store' or not v_row.self_on then raise exception 'self disabled'; end if;
  if v_row.enf or v_row.rs = 'block' then raise exception 'use route'; end if;
  v_okuri := public.okuri_default_of(v_row.store_id, p_type, p_okuri);  -- ★4 0156
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  -- ★3 0161（裁定327）: 順序検査＝盲目記録（0008 決定1）は退役。'already in'／'already out'／'no open punch' で拒否・前営業日以前の未閉鎖 in は塞がず注意行 'open_punch'
  perform public.punch_seq_check(v_row.store_id, v_cast, p_type, now());   -- ★3 0161
  insert into public.punches (org_id, store_id, cast_id, type, lat, lng, ip, source, okuri, within_geofence, geo_override, note)  -- ★4 0156: +okuri・★8 0175: +within_geofence／geo_override／note
  values (v_row.org_id, v_row.store_id, v_cast, p_type, null, null, v_ip, 'self', v_okuri, null, false, null)   -- ★0201: 生の座標・自己申告は記録しない
  returning id into v_id;
  perform public.audit_log_write('punch_self', 'punches:' || v_id::text, null,
    (select to_jsonb(p) from public.punches p where p.id = v_id), v_row.store_id);
  return v_id;
end $function$;

-- ═══ ★5 kiosk_login（同じ署名・ACL 不変＝PIN 4〜6 桁） ═══
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
  v_lock := make_interval(mins => coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_minutes'), '')::int, 10));   -- ★0190 K-1（裁定437）: 既定 10 分（5 回失敗＝pin_lock_max_fail の既定 5 のまま）
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
          or (m.role = 'cast' and m.can_register and coalesce((select (s.settings_json->>'sys_cast_register')::int from public.stores s where s.id = m.store_id), 0) >= 1)   /* ★0201（裁定473・相談役 11/10）: 旧キー cast_register_enabled の OR を外す（0200 で旧キーは消えた＝正本は sys_cast_register） */);   -- ★0196 M-93（裁定455 差し替え）: castRegisterLevelOf と同じ判定（sys_cast_register>=1 または旧キー true）
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
      (v_device.org_id, v_device.store_id, null, 'kiosk_login',
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

  -- PIN 一致: カウンタ復元 → 既存セッションを閉じて差し替え → 新セッション発行
  update public.staff_pin
     set fail_count = 0, locked_until = null, updated_at = now()
   where membership_id = p_membership_id;

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

-- ═══ ★6 staff_punch（同じ署名・ACL 不変＝店長の打刻の許可） ═══
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
  v_lock := make_interval(mins => coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_minutes'), '')::int, 10));   -- ★0192 M-46: 既定 15→10 分（kiosk_login と揃える）
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

-- ═══ ★9 staff_pin_status（同じ署名・ACL 不変＝レジを許可したキャストの判定を sys_cast_register に＝0200 で消えた旧キーを読まない） ═══
CREATE OR REPLACE FUNCTION public.staff_pin_status(p_store_id uuid)
 RETURNS TABLE(membership_id uuid, has_pin boolean, fail_count integer, locked_until timestamp with time zone, pin_updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and p_store_id = v_st)) then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;
  return query
  select m.id,
         (p.membership_id is not null),
         coalesce(p.fail_count, 0),
         p.locked_until,
         p.updated_at
    from public.memberships m
    left join public.staff_pin p on p.membership_id = m.id
   where m.store_id = p_store_id
     and m.is_active
     and (m.role in ('owner','admin','manager') or m.role = 'staff'
          or (m.role = 'cast' and m.can_register and coalesce((select (s.settings_json->>'sys_cast_register')::int from public.stores s where s.id = m.store_id), 0) >= 1))   /* ★0201（裁定473）: 旧キー → sys_cast_register（段階 ≥1） */   -- ★3 0173（389 追補1）: PIN 管理の一覧に ON のキャスト・staff は can_register に関わらず（0174 の打刻端末 staff_punch＝PIN 照合）
   order by m.role, m.id;
end $function$;

-- ═══ ★7 set_store_manager_punch＝店長の打刻の許可（owner だけ＝店ポリシー・set_store_profile は触らない＝0200 と重ならない） ═══
create or replace function public.set_store_manager_punch(p_store_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid := public.auth_org_id(); v_before boolean;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_store_id is null or p_on is null then raise exception 'bad args'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  select s.manager_punch_enabled into v_before from public.stores s where s.id = p_store_id and s.org_id = v_org;
  if not found then raise exception 'forbidden'; end if;
  update public.stores set manager_punch_enabled = p_on where id = p_store_id;
  perform public.audit_log_write('set_store_manager_punch', 'stores:' || p_store_id::text, jsonb_build_object('manager_punch_enabled', v_before), jsonb_build_object('manager_punch_enabled', p_on), p_store_id);
end $function$;
revoke execute on function public.set_store_manager_punch(uuid, boolean) from public, anon;
grant execute on function public.set_store_manager_punch(uuid, boolean) to authenticated;

-- ═══ ★8 本人の PIN 変更（M-133＝スタッフ／店長は staff_pin・キャストは cast_pin）＝今の PIN が要る（未設定なら不要）・audit は事実だけ（値なし） ═══
--   ★相談役 11/10 作り直し①: 誤りは例外にせず jsonb で返す（{ok:false, reason:'bad current'|'locked'|'bad pin'}）＝失敗回数とロックが確定する（例外だと update ごと巻き戻る＝総当たりできた）。
--   回数とロック時間は店設定 pin_lock_max_fail（既定 5）／pin_lock_minutes（既定 10）＝kiosk_login と同じ型（上限に達したら fail_count 0・locked_until を立てる）。成功も jsonb（{ok:true}）。
create or replace function public.staff_pin_self_set(p_current text, p_new text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_mid uuid := public.auth_membership_id(); v_mem record; v_pin public.staff_pin;
  v_settings jsonb; v_max integer; v_lock interval;
begin
  if public.auth_org_id() is null or v_mid is null then raise exception 'forbidden'; end if;
  select m.id, m.store_id, m.role, s.org_id, s.settings_json into v_mem from public.memberships m join public.stores s on s.id = m.store_id where m.id = v_mid and m.is_active;
  if v_mem.id is null or v_mem.role not in ('manager','staff') then raise exception 'forbidden'; end if;
  if p_new is null or p_new !~ '^[0-9]{4,6}$' then return jsonb_build_object('ok', false, 'reason', 'bad pin'); end if;
  v_settings := coalesce(v_mem.settings_json, '{}'::jsonb);
  v_max  := coalesce(nullif(trim(v_settings->>'pin_lock_max_fail'), '')::int, 5);
  v_lock := make_interval(mins => coalesce(nullif(trim(v_settings->>'pin_lock_minutes'), '')::int, 10));
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
  insert into public.staff_pin (membership_id, org_id, store_id, pin_hash) values (v_mid, v_mem.org_id, v_mem.store_id, crypt(p_new, gen_salt('bf')))
  on conflict (membership_id) do update set pin_hash = excluded.pin_hash, fail_count = 0, locked_until = null, updated_at = now();
  perform public.audit_log_write('staff_pin_self_set', 'staff_pin:' || v_mid::text, null, jsonb_build_object('membership_id', v_mid, 'self', true), v_mem.store_id);
  return jsonb_build_object('ok', true);
end $function$;
revoke execute on function public.staff_pin_self_set(text, text) from public, anon;
grant execute on function public.staff_pin_self_set(text, text) to authenticated;

create or replace function public.cast_pin_self_set(p_current text, p_new text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_cid uuid := public.auth_cast_id(); v_cast public.casts; v_pin public.cast_pin;
  v_settings jsonb; v_max integer; v_lock interval;
begin
  if public.auth_org_id() is null or v_cid is null then raise exception 'forbidden'; end if;
  select * into v_cast from public.casts where id = v_cid and is_active;
  if v_cast.id is null then raise exception 'forbidden'; end if;
  if p_new is null or p_new !~ '^[0-9]{4,6}$' then return jsonb_build_object('ok', false, 'reason', 'bad pin'); end if;
  v_settings := coalesce((select s.settings_json from public.stores s where s.id = v_cast.store_id), '{}'::jsonb);
  v_max  := coalesce(nullif(trim(v_settings->>'pin_lock_max_fail'), '')::int, 5);
  v_lock := make_interval(mins => coalesce(nullif(trim(v_settings->>'pin_lock_minutes'), '')::int, 10));
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
  insert into public.cast_pin (cast_id, org_id, store_id, pin_hash) values (v_cid, v_cast.org_id, v_cast.store_id, crypt(p_new, gen_salt('bf')))
  on conflict (cast_id) do update set pin_hash = excluded.pin_hash, store_id = excluded.store_id, fail_count = 0, locked_until = null, updated_at = now();
  perform public.audit_log_write('cast_pin_self_set', 'cast_pin:' || v_cid::text, null, jsonb_build_object('cast_id', v_cid, 'self', true), v_cast.store_id);
  return jsonb_build_object('ok', true);
end $function$;
revoke execute on function public.cast_pin_self_set(text, text) from public, anon;
grant execute on function public.cast_pin_self_set(text, text) to authenticated;

commit;
