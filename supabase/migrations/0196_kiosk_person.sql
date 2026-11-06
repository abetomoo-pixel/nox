-- 0196_kiosk_person.sql（キオスクの便＝裁定448 B 方式（PIN の本人セッション）＋裁定453＋§9 出勤時の「今日の控除」＋M-93 差し替え＋punch_proxy の staff）
-- 翻訳元: live pg_get_functiondef（2026-11-05・0195 適用後）＋生成器 docs/tmp/gen_0196.cjs（手打ちなし＝関数本体は live の写し＋アンカー置換・新設の RPC は生成器の本文）
--   根拠＝台帳 裁定448／453／455（M-93 差し替え）／456（10 点の確定＝変更は 1 だけ）／M-103／docs/tmp/0196_plan.md §1〜§10（handpaste_0196.md 冒頭に 10 点）
-- ★5 裁定456 の 1＝staff の PIN 入場は can_register に関係なく（kiosk_login／kiosk_unlock の候補）・kiosk_operator_list は can_register のまま・kiosk_unlock は inner の kiosk_login に p_device_fp を渡す
-- 検証クエリ: docs/tmp/0196_verify.sql（先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）
-- ★1 kiosk_sessions に person_auth_session／person_role＋kiosk_person_claim／kiosk_person_end（service_role だけ＝route から）＋kiosk_lock の戻り jsonb（person_end）
-- ★2 kiosk_register_state の checks に nominations（卓カードの指名キャスト）
-- ★3 §9＝cast_day_deductions_set の cast セルフ腕・kiosk_punch(p_day_deductions)・kiosk_punch_state(p_cast_id) の day_rules
-- ★4 M-93＝kiosk_operator_list／kiosk_login の候補（cast＝sys_cast_register>=1 または旧キー）・punch_proxy＝自店の staff も可
-- ★教訓132: begin の直後に lock_timeout（kiosk_sessions の ALTER と稼働中の関数の CREATE OR REPLACE を 1 本で流す）
begin;
set local lock_timeout = '10s';

-- ═══ ★1 裁定448（B 方式）: PIN の本人セッション＝kiosk_sessions に印 2 列・claim／end（service_role だけ＝route /api/kiosk/person-session／person-end から）・kiosk_lock は jsonb を返す（person_end） ═══
alter table public.kiosk_sessions add column if not exists person_auth_session boolean not null default false;
alter table public.kiosk_sessions add column if not exists person_role text;
comment on column public.kiosk_sessions.person_auth_session is '★0196（裁定448 B 方式）: この解除で本人の auth セッション（route の magiclink→verifyOtp）を作った＝ロック時に本人セッションも終える判定・台帳';
comment on column public.kiosk_sessions.person_role is '★0196: 本人セッションの役割（manager／staff）＝client のナビの絞りと台帳';

CREATE OR REPLACE FUNCTION public.kiosk_person_claim(p_device_auth_user uuid, p_device_fp text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0196（裁定448 B 方式）: 端末の解除（kiosk_login／kiosk_unlock＝PIN）の後に route が呼ぶ＝その操作担当の本人 auth セッションを作ってよいかを判定し印を付ける。
--   service_role だけ（route が端末セッションで auth.uid を読んで p_device_auth_user に渡す）。束縛済みの端末だけ（未束縛＝'not bound'・fp 不一致＝'device bound'）。
--   役割＝manager／staff だけ（owner／admin＝管理者は通常ログイン・cast＝'forbidden'）。無操作＝店設定 kiosk_person_idle_minutes（M-49・既定 10）を戻りに。audit は service（actor＝本人）。
declare
  v_device record; v_s record; v_mem record; v_idle int;
begin
  if p_device_auth_user is null then raise exception 'forbidden'; end if;
  select k.* into v_device from public.kiosk_devices k where k.auth_user_id = p_device_auth_user and k.is_active;
  if v_device.id is null then raise exception 'forbidden'; end if;
  if v_device.device_fp is null then raise exception 'not bound'; end if;
  if p_device_fp is null or p_device_fp <> v_device.device_fp then raise exception 'device bound'; end if;
  select s.* into v_s from public.kiosk_sessions s
   where s.device_id = v_device.id and s.ended_at is null
     and s.last_seen_at > now() - make_interval(secs => coalesce((select (st.settings_json->>'kiosk_idle_sec')::int from public.stores st where st.id = v_device.store_id), 900))
   order by s.started_at desc limit 1;
  if v_s.id is null then raise exception 'no session'; end if;
  select m.id, m.role, m.user_id, u.auth_user_id into v_mem from public.memberships m join public.users u on u.id = m.user_id
   where m.id = v_s.membership_id and m.is_active and u.is_active;
  if v_mem.id is null or v_mem.auth_user_id is null then raise exception 'forbidden'; end if;
  if v_mem.role not in ('manager','staff') then raise exception 'forbidden'; end if;   -- 管理者は通常ログイン・cast は本人セッションを作らない
  v_idle := greatest(1, least(120, coalesce((select (st.settings_json->>'kiosk_person_idle_minutes')::int from public.stores st where st.id = v_device.store_id), 10)));
  update public.kiosk_sessions set person_auth_session = true, person_role = v_mem.role, last_seen_at = now() where id = v_s.id;
  perform public.audit_log_write_service(v_device.org_id, v_mem.user_id, 'kiosk_person_claim', 'kiosk_sessions:' || v_s.id::text, null,
    jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', v_mem.id, 'role', v_mem.role, 'idle_minutes', v_idle), v_device.store_id, 'kiosk');
  return jsonb_build_object('ok', true, 'session_id', v_s.id, 'auth_user_id', v_mem.auth_user_id, 'membership_id', v_mem.id, 'role', v_mem.role,
                            'store_id', v_device.store_id, 'org_id', v_device.org_id, 'device_id', v_device.id, 'idle_minutes', v_idle);
end $function$;
revoke execute on function public.kiosk_person_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.kiosk_person_claim(uuid, text) to service_role;

CREATE OR REPLACE FUNCTION public.kiosk_person_end(p_session_id uuid, p_reason text DEFAULT 'manual'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0196（裁定448）: 本人セッションの終了（route /api/kiosk/person-end＝本人のサインアウトの前）。service_role だけ。kiosk_sessions を ended（idle／manual／lock）・audit。既に終わっていれば false。
declare
  v_s record;
begin
  if p_session_id is null then raise exception 'bad args'; end if;
  if p_reason is null or p_reason not in ('done','idle','manual','lock') then raise exception 'bad reason'; end if;
  update public.kiosk_sessions set ended_at = now(), end_reason = p_reason where id = p_session_id and ended_at is null and person_auth_session returning * into v_s;
  if v_s.id is null then return false; end if;
  perform public.audit_log_write_service(v_s.org_id, v_s.operator_user_id, 'kiosk_person_end', 'kiosk_sessions:' || v_s.id::text, null,
    jsonb_build_object('kiosk_device_id', v_s.device_id, 'end_reason', p_reason, 'role', v_s.person_role), v_s.store_id, 'kiosk');
  return true;
end $function$;
revoke execute on function public.kiosk_person_end(uuid, text) from public, anon, authenticated;
grant execute on function public.kiosk_person_end(uuid, text) to service_role;

drop function if exists public.kiosk_lock(text);
CREATE OR REPLACE FUNCTION public.kiosk_lock(p_reason text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★27 0175 v2（裁定423 候補・R-7）: 解除の終了＝kiosk_logout と同じ処理に終了理由（done 操作完了／idle 無操作／manual 手動）を残す
declare
  v_device record; v_sid uuid; v_op uuid;
  v_person boolean := false;   -- ★0196: この解除で本人の auth セッションを作っていたか（client が本人の終了も行う）
begin
  if p_reason is null or p_reason not in ('done','idle','manual') then raise exception 'bad reason'; end if;
  select k.* into v_device from public.kiosk_devices k where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */;
  if not found then raise exception 'forbidden'; end if;
  update public.kiosk_sessions set ended_at = now(), end_reason = p_reason
   where device_id = v_device.id and ended_at is null
  returning id, operator_user_id, person_auth_session into v_sid, v_op, v_person;   -- ★0196: person_auth_session も返す
  if v_sid is not null then
    insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values (v_device.org_id, v_device.store_id, v_op, 'kiosk_lock', 'kiosk_sessions:' || v_sid::text, null,
            jsonb_build_object('kiosk_device_id', v_device.id, 'end_reason', p_reason, 'person_end', coalesce(v_person, false)), null);
  end if;
  return jsonb_build_object('ok', true, 'person_end', coalesce(v_person, false));   -- ★0196（裁定448）: 本人セッションがあれば client が /api/kiosk/person-end も呼ぶ
end $function$;
revoke execute on function public.kiosk_lock(text) from public, anon;
grant execute on function public.kiosk_lock(text) to authenticated;

-- ═══ ★2 kiosk_register_state の checks に nominations（卓カードの指名キャスト＝端末セッションでも出る・写真は既存 /api/kiosk/photos） ═══
CREATE OR REPLACE FUNCTION public.kiosk_register_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
begin
  -- ★正ガード先行のみ（is null 述語は三値化しない＝fail-closed。F0 §7.1 教訓）
  v_store := public.auth_kiosk_register_store_id();
  if v_store is null or public.auth_kiosk_operator() is null then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'ar_enabled', coalesce((select (st.settings_json->>'ar_enabled')::boolean from public.stores st where st.id = v_store), false),  -- ★6 0156（起票84）: 売掛の店設定（0155 ar_policy_ok と同じ読み）
    'okuri_mode', coalesce(nullif(trim((select st.settings_json->>'okuri_mode' from public.stores st where st.id = v_store)), ''), 'flat'),   -- ★5 0158（起票87）: 送り方式（未設定＝flat）
    'okuri_base_amount', (select nullif(trim(st.settings_json->>'okuri_base_amount'), '')::int from public.stores st where st.id = v_store),  -- ★5 0158（起票87）: 送りベース額（未設定＝null）
    'seats', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind)
                       order by s.sort_order)
        from public.seats s
       where s.store_id = v_store and s.is_active), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', pc.id, 'name', pc.name, 'sort_order', pc.sort_order)
                       order by pc.sort_order, pc.name)
        from public.product_categories pc
       where pc.store_id = v_store and pc.is_active), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'type', p.type, 'price', p.price, 'category_id', p.category_id, 'sort_order', p.sort_order)
                       order by coalesce(pc.sort_order, 2147483647), p.sort_order, p.name)
        from public.products p
        left join public.product_categories pc on pc.id = p.category_id
       where p.store_id = v_store and p.is_active), '[]'::jsonb),
    'casts', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
        from public.casts c
       where c.store_id = v_store and c.is_active), '[]'::jsonb),
    'checks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ck.id,
               'seat_id', ck.seat_id,
               'extra_seat_ids', coalesce((
                 select jsonb_agg(cs.seat_id order by cs.created_at)
                   from public.check_seats cs where cs.check_id = ck.id), '[]'::jsonb),
               'total', ck.total,
               'started_at', ck.started_at,
               'set_min', ck.set_min,
               'ext_min', ck.ext_min,
               'time_per', ck.time_per,
               'people', ck.people,
               'nominations', coalesce((   -- ★0196（裁定448・§6-4）: 卓カードの指名キャスト（終了していない行・並びは position）＝本店の席タイルと同じ顔チップ
                 select jsonb_agg(jsonb_build_object('cast_id', cn.cast_id, 'kind', cn.nom_kind, 'is_dohan', cn.is_dohan) order by cn.position, cn.created_at)
                   from public.check_nominations cn where cn.check_id = ck.id and cn.ended_at is null), '[]'::jsonb)) order by ck.started_at)
        from public.checks ck
       where ck.store_id = v_store and ck.status = 'open'), '[]'::jsonb)
  );
end $function$;
revoke execute on function public.kiosk_register_state() from public, anon;
grant execute on function public.kiosk_register_state() to authenticated;

-- ═══ ★3 §9（M-103）: 「その日に選ぶ」控除は出勤時に聞く＝cast セルフ腕・kiosk_punch の p_day_deductions・kiosk_punch_state の day_rules ═══
CREATE OR REPLACE FUNCTION public.cast_day_deductions_set(p_cast_id uuid, p_biz_date date, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0195（裁定447 差し替え版）: その日の控除の on／off（rows＝[{deduction_id, enabled}]）。既定（always＝on／pick＝off）どおりの行は消し、違う行だけ upsert。
--   管理者＝org 内／店長＝自店／kiosk 腕＝端末の店のキャスト・操作担当あり（kiosk_punch の後の別 RPC＝送りの kiosk_transport_issue と同じ 2 段）。確定済みの月は 'finalized'。audit は店の人は audit_log_write・端末は audit_log_write_service（actor＝操作担当）。
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_kstore uuid;
  v_by    uuid;
  v_cast  record;
  v_d     record;
  v_default boolean;
  v_before jsonb; v_after jsonb;
  r       record;
begin
  if v_org is null then   -- 端末（kiosk 腕）
    v_kstore := public.auth_kiosk_register_store_id();
    if v_kstore is null then raise exception 'forbidden'; end if;
    v_by := public.auth_kiosk_operator();
    if v_by is null then raise exception 'forbidden'; end if;
    select s.org_id into v_org from public.stores s where s.id = v_kstore;
  else
    v_by := (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active);
  end if;
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_cast_id is null or p_biz_date is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'bad args'; end if;
  select c.id, c.store_id into v_cast from public.casts c where c.id = p_cast_id and c.org_id = v_org;
  if v_cast.id is null then raise exception 'forbidden'; end if;
  if v_kstore is not null then
    if v_cast.store_id <> v_kstore then raise exception 'forbidden'; end if;
  elsif v_role = 'cast' then   -- ★0196（M-103・§9-1）: cast セルフ腕＝本人の行・当日（営業日）だけ（/mine の出勤と同時に送る）
    if v_cast.id <> public.auth_cast_id() then raise exception 'forbidden'; end if;
    if p_biz_date <> public.biz_date_of(v_cast.store_id, now()) then raise exception 'not today'; end if;
  else
    if not (v_role = 'owner' or (v_role = 'manager' and v_cast.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  end if;
  if exists (select 1 from public.payroll_runs pr where pr.store_id = v_cast.store_id and pr.status in ('finalized','paid') and pr.period_start <= p_biz_date and pr.period_end >= p_biz_date) then raise exception 'finalized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('deduction_id', x.deduction_id, 'enabled', x.enabled) order by x.deduction_id), '[]'::jsonb) into v_before
    from public.cast_day_deductions x where x.cast_id = p_cast_id and x.biz_date = p_biz_date;
  for r in select * from jsonb_to_recordset(p_rows) as x(deduction_id uuid, enabled boolean) loop
    if r.deduction_id is null or r.enabled is null then raise exception 'bad row'; end if;
    select d.id, d.per, d.day_rule, d.is_active into v_d from public.deductions d where d.id = r.deduction_id and d.store_id = v_cast.store_id;
    if v_d.id is null then raise exception 'bad deduction'; end if;
    if v_d.per <> 'day' or not v_d.is_active then raise exception 'not day rule'; end if;
    v_default := (v_d.day_rule = 'always');
    if r.enabled = v_default then
      delete from public.cast_day_deductions where cast_id = p_cast_id and biz_date = p_biz_date and deduction_id = r.deduction_id;
    else
      insert into public.cast_day_deductions (org_id, store_id, cast_id, biz_date, deduction_id, enabled, set_by)
      values (v_org, v_cast.store_id, p_cast_id, p_biz_date, r.deduction_id, r.enabled, v_by)
      on conflict (cast_id, biz_date, deduction_id) do update set enabled = excluded.enabled, set_by = excluded.set_by, set_at = now();
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('deduction_id', x.deduction_id, 'enabled', x.enabled) order by x.deduction_id), '[]'::jsonb) into v_after
    from public.cast_day_deductions x where x.cast_id = p_cast_id and x.biz_date = p_biz_date;
  if v_kstore is not null then
    perform public.audit_log_write_service(v_org, v_by, 'cast_day_deductions_set', 'casts:' || p_cast_id::text || ':' || p_biz_date::text, v_before, v_after, v_cast.store_id, 'kiosk');
  else
    perform public.audit_log_write('cast_day_deductions_set', 'casts:' || p_cast_id::text || ':' || p_biz_date::text, v_before, v_after, v_cast.store_id);
  end if;
end $function$;
revoke execute on function public.cast_day_deductions_set(uuid, date, jsonb) from public, anon;
grant execute on function public.cast_day_deductions_set(uuid, date, jsonb) to authenticated;

drop function if exists public.kiosk_punch(uuid, text, text, boolean);
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
  v_lock := make_interval(mins => coalesce(nullif(trim(coalesce((select s.settings_json from public.stores s where s.id = v_device.store_id), '{}'::jsonb)->>'pin_lock_minutes'), '')::int, 10));   -- ★0192 M-46
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

  return jsonb_build_object('ok', true, 'punch_id', v_punch_id, 'punched_at', now());
end $function$;
revoke execute on function public.kiosk_punch(uuid, text, text, boolean, jsonb) from public, anon;
grant execute on function public.kiosk_punch(uuid, text, text, boolean, jsonb) to authenticated;

drop function if exists public.kiosk_punch_state();
CREATE OR REPLACE FUNCTION public.kiosk_punch_state(p_cast_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_device public.kiosk_devices;
begin
  -- kiosk_punch と同じ端末認証（打刻端末＝purpose='punch'・is_active）。レジ端末・通常ユーザーは forbidden
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */;
  if not found then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'okuri_mode', coalesce(nullif(trim((select st.settings_json->>'okuri_mode' from public.stores st where st.id = v_device.store_id)), ''), 'flat'),
    'okuri_base_amount', (select nullif(trim(st.settings_json->>'okuri_base_amount'), '')::int from public.stores st where st.id = v_device.store_id),
    'day_rules', case when p_cast_id is null then '[]'::jsonb else coalesce((   -- ★0196（M-103・§9-3）: 出勤時に聞く pick ルール（有効・自店のキャスト・キャスト別の適用で使わないは除く・額の上書きを反映）
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'amount', coalesce(rc.amount_override, d.amount)) order by d.name)
        from public.deductions d
        join public.casts c on c.id = p_cast_id and c.store_id = v_device.store_id and c.is_active
        left join public.deduction_rule_casts rc on rc.rule_id = d.id and rc.cast_id = p_cast_id
       where d.store_id = v_device.store_id and d.is_active and d.per = 'day' and d.day_rule = 'pick' and coalesce(rc.enabled, true)), '[]'::jsonb) end
  );
end $function$;
revoke execute on function public.kiosk_punch_state(uuid) from public, anon;
grant execute on function public.kiosk_punch_state(uuid) to authenticated;

-- ═══ ★4 M-93（裁定455 差し替え）: 操作する人の候補＝cast は sys_cast_register>=1 または旧キー（kiosk_operator_list・kiosk_login を同じ判定に＝kiosk_unlock は既に新キー）／punch_proxy＝自店の staff も可
-- ═══ ★5 裁定456 の 1: staff の PIN 入場は can_register に関係なく（kiosk_login・kiosk_unlock＝PIN の入口の 2 本）・kiosk_operator_list は can_register のまま・kiosk_unlock は inner の kiosk_login に p_device_fp を渡す ═══
CREATE OR REPLACE FUNCTION public.kiosk_operator_list()
 RETURNS TABLE(membership_id uuid, user_name text, role text, has_pin boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.id, u.name, m.role,
         exists (select 1 from public.staff_pin p where p.membership_id = m.id)
  from public.memberships m
  join public.users u on u.id = m.user_id
  where m.store_id = public.auth_kiosk_register_store_id()
    and m.is_active and u.is_active
    and (m.role in ('owner','admin','manager') or (m.role = 'staff' and m.can_register)
         or (m.role = 'cast' and m.can_register and (coalesce((select (s.settings_json->>'sys_cast_register')::int from public.stores s where s.id = m.store_id), 0) >= 1 or coalesce((select s.settings_json->>'cast_register_enabled' from public.stores s where s.id = m.store_id), '') = 'true')))   -- ★0196 M-93（裁定455 差し替え）: castRegisterLevelOf と同じ判定（sys_cast_register>=1 または旧キー true）
  order by u.name
$function$;
revoke execute on function public.kiosk_operator_list() from public, anon;
grant execute on function public.kiosk_operator_list() to authenticated;
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
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;

  -- 操作担当候補＝自店 active membership・owner/admin/manager/staff（★0196 裁定456 の 1＝staff は can_register を見ない）・cast は can_register かつ店のレジ使用（M-93）・
  -- 他店/他 org は not_found＝存在オラクル封じ）
  select m.id, m.user_id, m.role, u.name as user_name into v_mem
    from public.memberships m join public.users u on u.id = m.user_id
   where m.id = p_membership_id and m.store_id = v_device.store_id and m.is_active
     and u.is_active
     and (m.role in ('owner','admin','manager') or m.role = 'staff'   -- ★0196（裁定456 の 1）: staff は can_register に関係なく PIN で入れる（本人セッションの入口＝レジ操作の許可とは別・kiosk_operator_list は can_register のまま）
          or (m.role = 'cast' and m.can_register and (coalesce((select (s.settings_json->>'sys_cast_register')::int from public.stores s where s.id = m.store_id), 0) >= 1 or coalesce((select s.settings_json->>'cast_register_enabled' from public.stores s where s.id = m.store_id), '') = 'true')));   -- ★0196 M-93（裁定455 差し替え）: castRegisterLevelOf と同じ判定（sys_cast_register>=1 または旧キー true）
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
revoke execute on function public.kiosk_login(uuid, text, text) from public, anon;
grant execute on function public.kiosk_login(uuid, text, text) to authenticated;
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
begin
  select k.* into v_device from public.kiosk_devices k where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */;
  if not found then raise exception 'forbidden'; end if;
  if v_device.device_fp is not null and (p_device_fp is null or p_device_fp <> v_device.device_fp) then raise exception 'device bound'; end if;   -- ★0190（裁定436 ①b）: 束縛済みの端末は同じ fp からだけ（未束縛＝旧 client の間は従来どおり）
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
  if coalesce(v_n, 0) = 0 then return jsonb_build_object('ok', false, 'reason', 'wrong_pin'); end if;
  if v_n > 1 then return jsonb_build_object('ok', false, 'reason', 'ambiguous', 'candidates', v_cands); end if;
  return public.kiosk_login(v_mid, p_pin, p_device_fp) /* ★0196: 束縛済みの端末で inner の kiosk_login が 'device bound' にならないよう fp を渡す */ || jsonb_build_object('idle_sec', coalesce((select (st.settings_json->>'kiosk_idle_sec')::int from public.stores st where st.id = v_device.store_id), 900));
end $function$;
revoke execute on function public.kiosk_unlock(text, uuid, text) from public, anon;
grant execute on function public.kiosk_unlock(text, uuid, text) to authenticated;
CREATE OR REPLACE FUNCTION public.punch_proxy(p_cast_id uuid, p_type text, p_note text DEFAULT NULL::text, p_okuri boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast record; v_ip text; v_id uuid;
  v_okuri boolean;  -- ★4 0156（裁定309-9）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() in ('manager','staff') and v_cast.store_id = public.auth_store_id())) then   -- ★0196（裁定448・追加 5）: 自店の staff も代行できる（キオスクの本人セッション＝「代わりに打刻」・actor は本人）
    raise exception 'forbidden';
  end if;
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  v_okuri := public.okuri_default_of(v_cast.store_id, p_type, p_okuri);  -- ★4 0156
  perform public.punch_seq_check(v_cast.store_id, p_cast_id, p_type, now());   -- ★3 0161（裁定327）: 順序検査（代理打刻も対象＝起草判断）
  insert into public.punches (org_id, store_id, cast_id, type, ip, source, note, okuri, within_geofence)  -- ★4 0156: +okuri・★8 0175（398）: 代理打刻＝店長が在席を保証＝within_geofence true（BANZEN 0029 ⑤ と同じ）
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_type, v_ip, 'manager', p_note, v_okuri, true)
  returning id into v_id;
  perform public.audit_log_write('punch_proxy', 'punches:' || v_id::text, null,
    (select to_jsonb(p) from public.punches p where p.id = v_id), v_cast.store_id);
  return v_id;
end $function$;
revoke execute on function public.punch_proxy(uuid, text, text, boolean) from public, anon;
grant execute on function public.punch_proxy(uuid, text, text, boolean) to authenticated;

commit;
