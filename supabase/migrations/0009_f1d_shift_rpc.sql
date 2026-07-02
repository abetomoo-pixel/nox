-- 0009_f1d_shift_rpc: F1d — 勤怠・シフト RPC（cast セルフ4本＋管理系5本＝計9本）。0008 適用済みが前提。
--
-- cast セルフ4本（auth_cast_id() 本人チェック**あり**＝cast セルフ専用・認可設計 §4）:
--   shift_wish_submit / shift_wish_withdraw / punch_self / attendance_set_self
-- 管理系5本（owner=org 全店 / manager=自店・auth_cast_id() チェック**なし**＝BANZEN request_accept 教訓）:
--   shift_wish_decide / shift_set / punch_proxy / attendance_set / set_staffing_need
--   ※ staff（黒服）には開けない（capability §1.2 castMng 準拠・開放判断は F1f＝台帳 #24）。
--
-- 全 RPC: 二重防御（冒頭 null guard・org 照合・ロール判定・revoke public, anon ＋ grant authenticated）
--        ＋ perform audit_log_write（原則6）。
--
-- 実装上の要点:
--  - punch_self は盲目記録（0008 決定1）: シーケンス検証なし。punched_at はサーバ now()・
--    ip はサーバ導出（audit_log_write と同じ request.headers）・within_geofence は null。
--  - shift_wish_decide(accept) は shifts を自動生成（0008 決定2・status='planned'・wish_id 来歴・
--    部分ユニークで二重生成防止）。pending 以外は 'already decided'。
--  - 時刻検証は形式のみ（0008 決定3: start 00-23 / end 00-47 の正規表現・計算はしない）。
--  - attendance 系は unique(cast_id, date) への upsert。cast セルフは status ∈ {late, absent} のみ
--    （遅刻/欠勤連絡）・管理系は5値すべて。
--  - shift_set の p_status は明示必須（planned/confirmed・null 不可＝CLAUDE.md 原則7と同思想）。
--
-- 適用後の検証（"Success" 表示だけを信用しない）:
--   -- 1) RPC 9本の存在
--   select proname from pg_proc where pronamespace = 'public'::regnamespace
--    and proname in ('shift_wish_submit','shift_wish_withdraw','punch_self','attendance_set_self',
--                    'shift_wish_decide','shift_set','punch_proxy','attendance_set','set_staffing_need')
--    order by proname;
--   -- 2) ACL: 9本とも anon が現れないこと
--   select p.proname, r.rolname
--   from pg_proc p
--   join aclexplode(p.proacl) a on true
--   join pg_roles r on r.oid = a.grantee
--   where p.proname in ('shift_wish_submit','shift_wish_withdraw','punch_self','attendance_set_self',
--                       'shift_wish_decide','shift_set','punch_proxy','attendance_set','set_staffing_need')
--   order by p.proname, r.rolname;
--   -- 3) prosrc 抜き取り（punch_self の本人チェック・wish_decide の shifts 自動生成）
--   select prosrc from pg_proc where proname in ('punch_self','shift_wish_decide');

begin;

-- ══════════════════════════════════════════════════════════════
-- cast セルフ4本（auth_cast_id() 本人チェックあり）
-- ══════════════════════════════════════════════════════════════

-- ── shift_wish_submit（希望提出・本人のみ）─────────────────────
create or replace function public.shift_wish_submit(
  p_date     date,
  p_start_hm text,
  p_end_hm   text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cast uuid; v_row record; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'no cast for caller'; end if; -- cast セルフ専用
  if p_date is null then raise exception 'bad date'; end if;
  if p_start_hm is null or p_start_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_end_hm   is null or p_end_hm   !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  select org_id, store_id into v_row from public.casts where id = v_cast;
  insert into public.shift_wishes (org_id, store_id, cast_id, date, start_hm, end_hm)
  values (v_row.org_id, v_row.store_id, v_cast, p_date, p_start_hm, p_end_hm)
  returning id into v_id;
  perform public.audit_log_write('shift_wish_submit', 'shift_wishes:' || v_id::text, null,
    (select to_jsonb(w) from public.shift_wishes w where w.id = v_id), v_row.store_id);
  return v_id;
end $$;
revoke execute on function public.shift_wish_submit(date, text, text) from public, anon;
grant  execute on function public.shift_wish_submit(date, text, text) to authenticated;

-- ── shift_wish_withdraw（取り下げ・本人の pending のみ）─────────
create or replace function public.shift_wish_withdraw(p_wish_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cast uuid; v_wish record;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'no cast for caller'; end if;
  select * into v_wish from public.shift_wishes where id = p_wish_id;
  if v_wish.id is null or v_wish.org_id <> public.auth_org_id()
     or v_wish.cast_id <> v_cast then raise exception 'forbidden'; end if; -- 本人の行のみ
  if v_wish.status <> 'pending' then raise exception 'not pending'; end if;
  update public.shift_wishes set status = 'withdrawn' where id = p_wish_id;
  perform public.audit_log_write('shift_wish_withdraw', 'shift_wishes:' || p_wish_id::text,
    to_jsonb(v_wish), (select to_jsonb(w) from public.shift_wishes w where w.id = p_wish_id), v_wish.store_id);
end $$;
revoke execute on function public.shift_wish_withdraw(uuid) from public, anon;
grant  execute on function public.shift_wish_withdraw(uuid) to authenticated;

-- ── punch_self（自己打刻・盲目記録・サーバ時刻）─────────────────
create or replace function public.punch_self(
  p_type text,
  p_lat  double precision default null,
  p_lng  double precision default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cast uuid; v_row record; v_ip text; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'no cast for caller'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  select org_id, store_id into v_row from public.casts where id = v_cast;
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  -- 盲目記録（0008 決定1）: シーケンス検証なし・in-in/孤立 out も事実として残す
  insert into public.punches (org_id, store_id, cast_id, type, lat, lng, ip, source)
  values (v_row.org_id, v_row.store_id, v_cast, p_type, p_lat, p_lng, v_ip, 'self')
  returning id into v_id;
  perform public.audit_log_write('punch_self', 'punches:' || v_id::text, null,
    (select to_jsonb(p) from public.punches p where p.id = v_id), v_row.store_id);
  return v_id;
end $$;
revoke execute on function public.punch_self(text, double precision, double precision) from public, anon;
grant  execute on function public.punch_self(text, double precision, double precision) to authenticated;

-- ── attendance_set_self（遅刻/欠勤連絡・本人のみ・upsert）───────
create or replace function public.attendance_set_self(
  p_date   date,
  p_status text,
  p_eta    text default null,
  p_reason text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cast uuid; v_row record; v_before jsonb; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'no cast for caller'; end if;
  if p_date is null then raise exception 'bad date'; end if;
  if p_status is null or p_status not in ('late','absent') then raise exception 'bad status'; end if; -- 連絡は遅刻/当欠のみ
  if p_eta is not null and p_eta !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad eta'; end if;
  select org_id, store_id into v_row from public.casts where id = v_cast;
  select to_jsonb(a) into v_before from public.attendance a where a.cast_id = v_cast and a.date = p_date;
  insert into public.attendance (org_id, store_id, cast_id, date, status, eta, reason, source)
  values (v_row.org_id, v_row.store_id, v_cast, p_date, p_status, p_eta, p_reason, 'self')
  on conflict (cast_id, date) do update
    set status = excluded.status, eta = excluded.eta, reason = excluded.reason, source = 'self'
  returning id into v_id;
  perform public.audit_log_write('attendance_set_self', 'attendance:' || v_id::text, v_before,
    (select to_jsonb(a) from public.attendance a where a.id = v_id), v_row.store_id);
  return v_id;
end $$;
revoke execute on function public.attendance_set_self(date, text, text, text) from public, anon;
grant  execute on function public.attendance_set_self(date, text, text, text) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- 管理系5本（owner / manager 自店・auth_cast_id() チェックなし）
-- ══════════════════════════════════════════════════════════════

-- ── shift_wish_decide（採否・accept は shifts を自動生成）───────
create or replace function public.shift_wish_decide(
  p_wish_id uuid,
  p_accept  boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_wish record; v_actor uuid; v_shift uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_accept is null then raise exception 'bad accept'; end if;
  select * into v_wish from public.shift_wishes where id = p_wish_id;
  if v_wish.id is null or v_wish.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_wish.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_wish.status <> 'pending' then raise exception 'already decided'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.shift_wishes
     set status = case when p_accept then 'accepted' else 'rejected' end,
         decided_by = v_actor, decided_at = now()
   where id = p_wish_id;
  -- 【0008 決定2】accept はシフト案（planned）へ自動取り込み。二重生成は部分ユニークで物理防止。
  if p_accept then
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, wish_id, created_by)
    values (v_wish.org_id, v_wish.store_id, v_wish.cast_id, v_wish.date, v_wish.start_hm, v_wish.end_hm,
            'planned', p_wish_id, v_actor)
    returning id into v_shift;
  end if;
  perform public.audit_log_write('shift_wish_decide', 'shift_wishes:' || p_wish_id::text,
    to_jsonb(v_wish),
    jsonb_build_object(
      'wish', (select to_jsonb(w) from public.shift_wishes w where w.id = p_wish_id),
      'generated_shift_id', v_shift),
    v_wish.store_id);
  return v_shift; -- reject 時は null
end $$;
revoke execute on function public.shift_wish_decide(uuid, boolean) from public, anon;
grant  execute on function public.shift_wish_decide(uuid, boolean) to authenticated;

-- ── shift_set（確定シフトの作成/変更・upsert・p_status 明示必須）──
create or replace function public.shift_set(
  p_id       uuid,
  p_cast_id  uuid,
  p_date     date,
  p_start_hm text,
  p_end_hm   text,
  p_status   text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cast record; v_actor uuid; v_id uuid; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_date is null then raise exception 'bad date'; end if;
  if p_start_hm is null or p_start_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_end_hm   is null or p_end_hm   !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_status is null or p_status not in ('planned','confirmed') then raise exception 'bad status'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if p_id is null then
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, created_by)
    values (v_cast.org_id, v_cast.store_id, p_cast_id, p_date, p_start_hm, p_end_hm, p_status, v_actor)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(s) into v_before from public.shifts s
      where s.id = p_id and s.org_id = public.auth_org_id() and s.cast_id = p_cast_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.shifts
       set date = p_date, start_hm = p_start_hm, end_hm = p_end_hm, status = p_status
     where id = p_id and org_id = public.auth_org_id();
    v_id := p_id;
  end if;
  perform public.audit_log_write('shift_set', 'shifts:' || v_id::text, v_before,
    (select to_jsonb(s) from public.shifts s where s.id = v_id), v_cast.store_id);
  return v_id;
end $$;
revoke execute on function public.shift_set(uuid, uuid, date, text, text, text) from public, anon;
grant  execute on function public.shift_set(uuid, uuid, date, text, text, text) to authenticated;

-- ── punch_proxy（代理打刻・auth_cast_id() チェックを入れない＝request_accept 教訓）──
create or replace function public.punch_proxy(
  p_cast_id uuid,
  p_type    text,
  p_note    text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cast record; v_ip text; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  insert into public.punches (org_id, store_id, cast_id, type, ip, source, note)
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_type, v_ip, 'manager', p_note)
  returning id into v_id;
  perform public.audit_log_write('punch_proxy', 'punches:' || v_id::text, null,
    (select to_jsonb(p) from public.punches p where p.id = v_id), v_cast.store_id);
  return v_id;
end $$;
revoke execute on function public.punch_proxy(uuid, text, text) from public, anon;
grant  execute on function public.punch_proxy(uuid, text, text) to authenticated;

-- ── attendance_set（管理の板操作・5値すべて・upsert）────────────
create or replace function public.attendance_set(
  p_cast_id uuid,
  p_date    date,
  p_status  text,
  p_eta     text default null,
  p_reason  text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cast record; v_before jsonb; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_date is null then raise exception 'bad date'; end if;
  if p_status is null or p_status not in ('shukkin','dohan','late','off','absent') then raise exception 'bad status'; end if;
  if p_eta is not null and p_eta !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad eta'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select to_jsonb(a) into v_before from public.attendance a where a.cast_id = p_cast_id and a.date = p_date;
  insert into public.attendance (org_id, store_id, cast_id, date, status, eta, reason, source)
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_date, p_status, p_eta, p_reason, 'staff')
  on conflict (cast_id, date) do update
    set status = excluded.status, eta = excluded.eta, reason = excluded.reason, source = 'staff'
  returning id into v_id;
  perform public.audit_log_write('attendance_set', 'attendance:' || v_id::text, v_before,
    (select to_jsonb(a) from public.attendance a where a.id = v_id), v_cast.store_id);
  return v_id;
end $$;
revoke execute on function public.attendance_set(uuid, date, text, text, text) from public, anon;
grant  execute on function public.attendance_set(uuid, date, text, text, text) to authenticated;

-- ── set_staffing_need（必要人数・曜日別・upsert）────────────────
create or replace function public.set_staffing_need(
  p_store_id uuid,
  p_dow      int,
  p_required int
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid; v_before jsonb; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_dow is null or p_dow < 0 or p_dow > 6 then raise exception 'bad dow'; end if;
  if p_required is null or p_required < 0 then raise exception 'bad required'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select to_jsonb(n) into v_before from public.staffing_needs n
    where n.store_id = p_store_id and n.dow = p_dow;
  insert into public.staffing_needs (org_id, store_id, dow, required)
  values (public.auth_org_id(), p_store_id, p_dow, p_required)
  on conflict (store_id, dow) do update set required = excluded.required
  returning id into v_id;
  perform public.audit_log_write('set_staffing_need', 'staffing_needs:' || v_id::text, v_before,
    (select to_jsonb(n) from public.staffing_needs n where n.id = v_id), p_store_id);
  return v_id;
end $$;
revoke execute on function public.set_staffing_need(uuid, int, int) from public, anon;
grant  execute on function public.set_staffing_need(uuid, int, int) to authenticated;

commit;
