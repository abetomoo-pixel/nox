-- 0192_m5_db.sql（便 M5 の DB 側＋公開デモ cron の監査・2026-11-02 新 CC 起草）
-- 翻訳元: live pg_get_functiondef（2026-11-02・0191 適用後）＋生成器 docs/tmp/gen_0192.cjs（手打ちなし＝関数本体は live の写し＋アンカー置換・新設の表と RPC は本ファイルの文字列）
--   計画＝docs/tmp/0192_plan.md の 9 項目（相談役 10/30 夕＋11/02 確定＝M-34 同乗・項目 9 は案 A）
-- 検証クエリ: 末尾 ===== verify =====（先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）
-- ★1 スタッフ日別勤怠の修正・確定 ★2 M-38 退勤の取消 ★3 M-39 PIN ロック解除 ★4 M-45 cast_pin_status ★5 M-46 ロック既定 10 分
-- ★6 M-47 端末の用途の廃止（14 関数＋上限） ★7 M-49 kiosk_person_idle_minutes ★8 M-34 未発行キャストの基本の働き方 ★9 demo_reset_mark_failed（service_role のみ）
begin;

-- ═══ ★1 スタッフ日別勤怠の修正・確定（店の修正欄＝in／out の差し替え・当欠／遅刻／早退の確定・月の確定でロック・audit） ═══
create table if not exists public.staff_attendance_days (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  biz_date date not null,
  status text not null check (status in ('present','absent','late','early')),
  note text check (note is null or length(note) <= 200),
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  primary key (membership_id, biz_date)
);
create index if not exists staff_attendance_days_store_date_idx on public.staff_attendance_days (store_id, biz_date);
comment on table public.staff_attendance_days is '★0192: スタッフの日別勤怠の確定区分（present／absent 当欠／late 遅刻／early 早退）＝店が付ける。打刻の差し替えは staff_punches（source manual）';
alter table public.staff_attendance_days enable row level security;
drop policy if exists staff_attendance_days_select on public.staff_attendance_days;
create policy staff_attendance_days_select on public.staff_attendance_days for select to authenticated
  using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and store_id = public.auth_store_id()) or membership_id = public.auth_membership_id()));
revoke all on table public.staff_attendance_days from public, anon, authenticated;
grant select on table public.staff_attendance_days to authenticated;

create table if not exists public.staff_attendance_locks (
  store_id uuid not null references public.stores(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  locked_by uuid references public.users(id),
  locked_at timestamptz not null default now(),
  primary key (store_id, period)
);
comment on table public.staff_attendance_locks is '★0192: スタッフ勤怠の月の確定（行がある月は staff_attendance_set／staff_punch_cancel_out を拒否＝''confirmed''）';
alter table public.staff_attendance_locks enable row level security;
drop policy if exists staff_attendance_locks_select on public.staff_attendance_locks;
create policy staff_attendance_locks_select on public.staff_attendance_locks for select to authenticated
  using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id()));
revoke all on table public.staff_attendance_locks from public, anon, authenticated;
grant select on table public.staff_attendance_locks to authenticated;

CREATE OR REPLACE FUNCTION public.staff_attendance_set(p_membership_id uuid, p_biz_date date, p_punches boolean, p_in timestamptz, p_out timestamptz, p_status text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0192: スタッフ（manager／staff）の日別勤怠を店が修正する（owner 全店／manager 自店）。
--   p_punches=true＝その営業日の打刻を p_in／p_out（null は打たない）で差し替え（source 'manual'）・false＝打刻は触らない（UI は常に明示値＝原則7）。
--   p_status＝present／absent／late／early（null＝確定区分を消す）。月が確定済み（staff_attendance_locks）なら 'confirmed'。audit 'staff_attendance_set'。
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_me   uuid := (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active);
  v_mem  record;
  v_before jsonb; v_after jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_membership_id is null or p_biz_date is null or p_punches is null then raise exception 'bad args'; end if;
  select m.id, m.store_id, m.role, s.org_id into v_mem
    from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_membership_id;
  if v_mem.id is null or v_mem.org_id <> v_org or v_mem.role not in ('manager','staff') then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_mem.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  if exists (select 1 from public.staff_attendance_locks l where l.store_id = v_mem.store_id and l.period = to_char(p_biz_date, 'YYYY-MM')) then raise exception 'confirmed'; end if;
  if p_status is not null and p_status not in ('present','absent','late','early') then raise exception 'bad status'; end if;
  if p_punches then
    if p_out is not null and p_in is null then raise exception 'bad time'; end if;
    if p_in is not null and public.biz_date_of(v_mem.store_id, p_in) <> p_biz_date then raise exception 'bad time'; end if;
    if p_out is not null and (p_out <= p_in or p_out > p_in + interval '24 hours') then raise exception 'bad time'; end if;
  end if;

  select jsonb_build_object(
           'punches', coalesce((select jsonb_agg(jsonb_build_object('kind', sp.kind, 'at', sp.punched_at, 'source', sp.source) order by sp.punched_at) from public.staff_punches sp where sp.membership_id = p_membership_id and sp.biz_date = p_biz_date), '[]'::jsonb),
           'status', (select to_jsonb(d) - 'org_id' - 'store_id' from public.staff_attendance_days d where d.membership_id = p_membership_id and d.biz_date = p_biz_date))
    into v_before;

  if p_punches then
    delete from public.staff_punches where membership_id = p_membership_id and biz_date = p_biz_date;
    if p_in is not null then
      insert into public.staff_punches (membership_id, org_id, store_id, biz_date, kind, punched_at, source, created_by)
      values (p_membership_id, v_org, v_mem.store_id, p_biz_date, 'in', p_in, 'manual', v_me);
    end if;
    if p_out is not null then
      insert into public.staff_punches (membership_id, org_id, store_id, biz_date, kind, punched_at, source, created_by)
      values (p_membership_id, v_org, v_mem.store_id, p_biz_date, 'out', p_out, 'manual', v_me);
    end if;
  end if;
  if p_status is null then
    delete from public.staff_attendance_days where membership_id = p_membership_id and biz_date = p_biz_date;
  else
    insert into public.staff_attendance_days (membership_id, org_id, store_id, biz_date, status, note, updated_by, updated_at)
    values (p_membership_id, v_org, v_mem.store_id, p_biz_date, p_status, left(nullif(trim(coalesce(p_note, '')), ''), 200), v_me, now())
    on conflict (membership_id, biz_date) do update set status = excluded.status, note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
  end if;

  select jsonb_build_object(
           'punches', coalesce((select jsonb_agg(jsonb_build_object('kind', sp.kind, 'at', sp.punched_at, 'source', sp.source) order by sp.punched_at) from public.staff_punches sp where sp.membership_id = p_membership_id and sp.biz_date = p_biz_date), '[]'::jsonb),
           'status', (select to_jsonb(d) - 'org_id' - 'store_id' from public.staff_attendance_days d where d.membership_id = p_membership_id and d.biz_date = p_biz_date))
    into v_after;
  perform public.audit_log_write('staff_attendance_set', 'memberships:' || p_membership_id::text || ':' || p_biz_date::text, v_before, v_after, v_mem.store_id);
  return v_after;
end $function$;
revoke execute on function public.staff_attendance_set(uuid, date, boolean, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.staff_attendance_set(uuid, date, boolean, timestamptz, timestamptz, text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.staff_attendance_confirm(p_store_id uuid, p_period text, p_lock boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0192: スタッフ勤怠の月の確定（p_lock=true＝owner／自店 manager）と解除（p_lock=false＝owner のみ）。audit 'staff_attendance_confirm'
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_had  boolean;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_store_id is null or p_lock is null then raise exception 'bad args'; end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and p_lock and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  v_had := exists (select 1 from public.staff_attendance_locks l where l.store_id = p_store_id and l.period = p_period);
  if p_lock then
    insert into public.staff_attendance_locks (store_id, org_id, period, locked_by)
    values (p_store_id, v_org, p_period, (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active))
    on conflict (store_id, period) do nothing;
  else
    delete from public.staff_attendance_locks where store_id = p_store_id and period = p_period;
  end if;
  perform public.audit_log_write('staff_attendance_confirm', 'stores:' || p_store_id::text || ':' || p_period,
    jsonb_build_object('locked', v_had), jsonb_build_object('locked', p_lock), p_store_id);
end $function$;
revoke execute on function public.staff_attendance_confirm(uuid, text, boolean) from public, anon;
grant execute on function public.staff_attendance_confirm(uuid, text, boolean) to authenticated;

-- ═══ ★2 M-38 退勤の取消（当営業日の最後の打刻が out のときだけ消す＝出勤中に戻る・audit） ═══
CREATE OR REPLACE FUNCTION public.punch_cancel_out(p_cast_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0192 M-38: キャストの退勤の取消（owner 全店／manager 自店）。当営業日（biz_date_of）の最後の打刻が out でなければ 'not out'。audit 'punch_cancel_out'
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_cast record;
  v_bd   date;
  v_last public.punches;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select c.id, c.store_id, c.org_id into v_cast from public.casts c where c.id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_cast.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  v_bd := public.biz_date_of(v_cast.store_id, now());
  select p.* into v_last from public.punches p
   where p.cast_id = p_cast_id and p.store_id = v_cast.store_id
     and p.punched_at >= now() - interval '2 days'
     and public.biz_date_of(v_cast.store_id, p.punched_at) = v_bd
   order by p.punched_at desc limit 1;
  if v_last.id is null or v_last.type <> 'out' then raise exception 'not out'; end if;
  delete from public.punches where id = v_last.id;
  perform public.audit_log_write('punch_cancel_out', 'punches:' || v_last.id::text, to_jsonb(v_last), jsonb_build_object('cast_id', p_cast_id, 'biz_date', v_bd), v_cast.store_id);
  return jsonb_build_object('ok', true, 'biz_date', v_bd, 'canceled_at', v_last.punched_at);
end $function$;
revoke execute on function public.punch_cancel_out(uuid) from public, anon;
grant execute on function public.punch_cancel_out(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.staff_punch_cancel_out(p_membership_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0192 M-38: スタッフ（manager／staff）の退勤の取消（owner 全店／manager 自店）。当営業日の最後が out でなければ 'not out'・月が確定済みなら 'confirmed'。audit 'staff_punch_cancel_out'
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_mem  record;
  v_bd   date;
  v_last public.staff_punches;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select m.id, m.store_id, m.role, s.org_id into v_mem
    from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_membership_id;
  if v_mem.id is null or v_mem.org_id <> v_org or v_mem.role not in ('manager','staff') then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_mem.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  v_bd := public.biz_date_of(v_mem.store_id, now());
  if exists (select 1 from public.staff_attendance_locks l where l.store_id = v_mem.store_id and l.period = to_char(v_bd, 'YYYY-MM')) then raise exception 'confirmed'; end if;
  select sp.* into v_last from public.staff_punches sp
   where sp.membership_id = p_membership_id and sp.biz_date = v_bd
   order by sp.punched_at desc limit 1;
  if v_last.id is null or v_last.kind <> 'out' then raise exception 'not out'; end if;
  delete from public.staff_punches where id = v_last.id;
  perform public.audit_log_write('staff_punch_cancel_out', 'staff_punches:' || v_last.id::text, to_jsonb(v_last), jsonb_build_object('membership_id', p_membership_id, 'biz_date', v_bd), v_mem.store_id);
  return jsonb_build_object('ok', true, 'biz_date', v_bd, 'canceled_at', v_last.punched_at);
end $function$;
revoke execute on function public.staff_punch_cancel_out(uuid) from public, anon;
grant execute on function public.staff_punch_cancel_out(uuid) to authenticated;

-- ═══ ★3 M-39 PIN ロックの解除（fail_count=0・locked_until=null・audit） ═══
CREATE OR REPLACE FUNCTION public.staff_pin_unlock(p_membership_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0192 M-39: スタッフ PIN（キオスクのログイン・打刻）のロック解除。owner＝自 org 全員／manager＝自店の owner 以外。PIN が無ければ 'no pin'。audit 'staff_pin_unlock'
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_mem  record;
  v_pin  public.staff_pin;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select m.id, m.store_id, m.role, s.org_id into v_mem
    from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_membership_id;
  if v_mem.id is null or v_mem.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_mem.store_id = public.auth_store_id() and v_mem.role <> 'owner')) then raise exception 'forbidden'; end if;
  select p.* into v_pin from public.staff_pin p where p.membership_id = p_membership_id for update;
  if not found then raise exception 'no pin'; end if;
  update public.staff_pin set fail_count = 0, locked_until = null, updated_at = now() where membership_id = p_membership_id;
  perform public.audit_log_write('staff_pin_unlock', 'staff_pin:' || p_membership_id::text,
    jsonb_build_object('fail_count', v_pin.fail_count, 'locked_until', v_pin.locked_until), jsonb_build_object('fail_count', 0, 'locked_until', null), v_mem.store_id);
end $function$;
revoke execute on function public.staff_pin_unlock(uuid) from public, anon;
grant execute on function public.staff_pin_unlock(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.cast_pin_unlock(p_cast_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0192 M-39: キャスト PIN（キオスクの打刻）のロック解除。owner 全店／manager 自店。PIN が無ければ 'no pin'。audit 'cast_pin_unlock'
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_cast record;
  v_pin  public.cast_pin;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select c.id, c.store_id, c.org_id into v_cast from public.casts c where c.id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_cast.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  select p.* into v_pin from public.cast_pin p where p.cast_id = p_cast_id for update;
  if not found then raise exception 'no pin'; end if;
  update public.cast_pin set fail_count = 0, locked_until = null, updated_at = now() where cast_id = p_cast_id;
  perform public.audit_log_write('cast_pin_unlock', 'cast_pin:' || p_cast_id::text,
    jsonb_build_object('fail_count', v_pin.fail_count, 'locked_until', v_pin.locked_until), jsonb_build_object('fail_count', 0, 'locked_until', null), v_cast.store_id);
end $function$;
revoke execute on function public.cast_pin_unlock(uuid) from public, anon;
grant execute on function public.cast_pin_unlock(uuid) to authenticated;

-- ═══ ★4 M-45 cast_pin_status（staff_pin_status と同型＝owner 全店／manager 自店・自店 active のキャスト × cast_pin） ═══
CREATE OR REPLACE FUNCTION public.cast_pin_status(p_store_id uuid)
 RETURNS TABLE(cast_id uuid, cast_name text, has_pin boolean, fail_count integer, locked_until timestamp with time zone, pin_updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
-- ★0192 M-45: マスタ › システム › PIN のキャストの行（設定済み／失敗回数／ロック中）
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
  select c.id, c.name, (p.cast_id is not null), coalesce(p.fail_count, 0), p.locked_until, p.updated_at
    from public.casts c
    left join public.cast_pin p on p.cast_id = c.id
   where c.store_id = p_store_id and c.is_active
   order by c.name, c.id;
end $function$;
revoke execute on function public.cast_pin_status(uuid) from public, anon;
grant execute on function public.cast_pin_status(uuid) to authenticated;

-- ═══ ★5 M-46 ロック既定 10 分＋★6 M-47 端末の用途の廃止（helper 2・RPC 12・上限 2＝kiosk_provision／kiosk_reactivate） ═══
CREATE OR REPLACE FUNCTION public.auth_kiosk_store_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0192 M-47: 用途（purpose）を見ない＝auth_kiosk_register_store_id と同じ値（既存の打刻端末・レジ端末とも全タイル）
  select k.store_id from public.kiosk_devices k
  where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */
$function$;
CREATE OR REPLACE FUNCTION public.auth_kiosk_register_store_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0192 M-47: 用途（purpose）を見ない＝RLS の kiosk 腕 28 本はこの helper 経由で自動的に全端末へ
  select k.store_id from public.kiosk_devices k
  where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */
$function$;
CREATE OR REPLACE FUNCTION public.auth_kiosk_operator()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sid  uuid;
  v_user uuid;
  v_seen timestamptz;
begin
  select s.id, s.operator_user_id, s.last_seen_at into v_sid, v_user, v_seen
    from public.kiosk_sessions s
    join public.kiosk_devices k on k.id = s.device_id
   where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */
     and s.ended_at is null
     and s.last_seen_at > now() - make_interval(secs => case when s.unlock_method = 'qr'   -- ★0185（裁定423 変更）: QR で開いた解除は無操作 3 分（店設定が短ければ店設定）
           then least(180, coalesce((select (st.settings_json->>'kiosk_idle_sec')::int from public.stores st where st.id = k.store_id), 900))
           else coalesce((select (st.settings_json->>'kiosk_idle_sec')::int from public.stores st where st.id = k.store_id), 900) end);   -- ★27 0175 v2（裁定423 候補）: 無操作秒数＝店設定（既定 900＝従来 15 分）
  if v_sid is null then return null; end if;
  if v_seen < now() - interval '60 seconds' then
    update public.kiosk_sessions set last_seen_at = now() where id = v_sid;
  end if;
  return v_user;
end $function$;
CREATE OR REPLACE FUNCTION public.kiosk_lock(p_reason text DEFAULT 'manual'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★27 0175 v2（裁定423 候補・R-7）: 解除の終了＝kiosk_logout と同じ処理に終了理由（done 操作完了／idle 無操作／manual 手動）を残す
declare
  v_device record; v_sid uuid; v_op uuid;
begin
  if p_reason is null or p_reason not in ('done','idle','manual') then raise exception 'bad reason'; end if;
  select k.* into v_device from public.kiosk_devices k where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */;
  if not found then raise exception 'forbidden'; end if;
  update public.kiosk_sessions set ended_at = now(), end_reason = p_reason
   where device_id = v_device.id and ended_at is null
  returning id, operator_user_id into v_sid, v_op;
  if v_sid is not null then
    insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values (v_device.org_id, v_device.store_id, v_op, 'kiosk_lock', 'kiosk_sessions:' || v_sid::text, null,
            jsonb_build_object('kiosk_device_id', v_device.id, 'end_reason', p_reason), null);
  end if;
end $function$;
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

  -- 操作担当候補＝自店 active membership・owner/manager/staff(can_register)（cast は kiosk 不使用・
  -- 他店/他 org は not_found＝存在オラクル封じ）
  select m.id, m.user_id, m.role, u.name as user_name into v_mem
    from public.memberships m join public.users u on u.id = m.user_id
   where m.id = p_membership_id and m.store_id = v_device.store_id and m.is_active
     and u.is_active
     and (m.role in ('owner','admin','manager') or (m.role = 'staff' and m.can_register)
          or (m.role = 'cast' and m.can_register and coalesce((select s.settings_json->>'cast_register_enabled' from public.stores s where s.id = m.store_id), '') = 'true'));   -- ★3 0173（389 追補1）: レジ端末の候補に ON のキャスト
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
CREATE OR REPLACE FUNCTION public.kiosk_logout()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_device public.kiosk_devices;
  v_sid    uuid;
  v_op     uuid;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */;
  if not found then raise exception 'forbidden'; end if;

  update public.kiosk_sessions set ended_at = now()
   where device_id = v_device.id and ended_at is null
  returning id, operator_user_id into v_sid, v_op;

  if v_sid is not null then
    insert into public.audit_logs
      (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values
      (v_device.org_id, v_device.store_id, v_op, 'kiosk_logout',
       'kiosk_sessions:' || v_sid::text, null,
       jsonb_build_object('kiosk_device_id', v_device.id), null);
  end if;
end $function$;
CREATE OR REPLACE FUNCTION public.kiosk_punch(p_cast_id uuid, p_pin text, p_type text, p_okuri boolean DEFAULT NULL::boolean)
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
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */;
  if not found then raise exception 'forbidden'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
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
CREATE OR REPLACE FUNCTION public.kiosk_punch_state()
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
    'okuri_base_amount', (select nullif(trim(st.settings_json->>'okuri_base_amount'), '')::int from public.stores st where st.id = v_device.store_id)
  );
end $function$;
CREATE OR REPLACE FUNCTION public.kiosk_qr_claim(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_mid uuid := public.auth_membership_id(); v_device record; v_m record; v_key text; v_cnt bigint; v_hit bigint; v_code text;
  v_sys int; v_cid uuid; v_sid uuid; v_store_name text;
begin
  if public.auth_org_id() is null or v_mid is null then raise exception 'forbidden'; end if;
  if p_token is null or p_token !~ '^noxq:[0-9a-f-]{36}\.[0-9]{6}$' then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  select k.* into v_device from public.kiosk_devices k
   where k.id = substring(p_token from 6 for 36)::uuid and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */;
  if not found or v_device.org_id <> public.auth_org_id() then return jsonb_build_object('ok', false, 'reason', 'wrong_token'); end if;   -- 他 org の端末は存在を明かさない
  select m.id, m.user_id, m.role, m.store_id, m.can_register, m.qr_fail_count, m.qr_locked_until, u.name as user_name into v_m
    from public.memberships m join public.users u on u.id = m.user_id
   where m.id = v_mid and m.is_active and u.is_active;
  if v_m.id is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' and v_m.store_id <> v_device.store_id then return jsonb_build_object('ok', false, 'reason', 'other_store'); end if;
  v_sys := coalesce((select (st.settings_json->>'sys_cast_register')::int from public.stores st where st.id = v_device.store_id), 0);
  if v_m.role not in ('owner','admin','manager','staff','cast') then return jsonb_build_object('ok', false, 'reason', 'no_permission'); end if;
  if v_m.role = 'cast' and not (coalesce(v_m.can_register, false) and v_sys >= 1) then return jsonb_build_object('ok', false, 'reason', 'punch_only'); end if;   -- キャストのレジ操作 OFF＝打刻だけ
  if v_m.role = 'staff' and not coalesce(v_m.can_register, false) then return jsonb_build_object('ok', false, 'reason', 'no_permission'); end if;
  if v_m.qr_locked_until is not null and v_m.qr_locked_until > now() then return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_m.qr_locked_until); end if;
  select q.secret_hex into v_key from public.kiosk_qr_keys q where q.device_id = v_device.id;
  if v_key is null then return jsonb_build_object('ok', false, 'reason', 'wrong_token'); end if;
  v_cnt := floor(extract(epoch from now()) / 30)::bigint; v_code := right(p_token, 6);
  v_hit := case v_code when public.totp_code_of(v_key, v_cnt) then v_cnt when public.totp_code_of(v_key, v_cnt - 1) then v_cnt - 1 when public.totp_code_of(v_key, v_cnt + 1) then v_cnt + 1 else null end;
  if v_hit is null then
    update public.memberships set qr_fail_count = qr_fail_count + 1,
           qr_locked_until = case when qr_fail_count + 1 >= 5 then now() + interval '10 minutes' else qr_locked_until end
     where id = v_m.id;
    return jsonb_build_object('ok', false, 'reason', 'wrong_token');   -- 期限切れ（±1 窓の外）も同じ
  end if;
  insert into public.kiosk_qr_claims (org_id, store_id, device_id, counter, membership_id)
  values (v_device.org_id, v_device.store_id, v_device.id, v_hit, v_m.id)
  on conflict (device_id, counter) do nothing
  returning id into v_cid;
  if v_cid is null then return jsonb_build_object('ok', false, 'reason', 'used'); end if;   -- 1 回限り
  update public.memberships set qr_fail_count = 0 where id = v_m.id and qr_fail_count <> 0;
  update public.kiosk_sessions set ended_at = now(), end_reason = 'relogin' where device_id = v_device.id and ended_at is null;
  insert into public.kiosk_sessions (org_id, store_id, device_id, membership_id, operator_user_id, started_at, last_seen_at, token_hash, unlock_method)
  values (v_device.org_id, v_device.store_id, v_device.id, v_m.id, v_m.user_id, now(), now(), encode(sha256(convert_to(p_token, 'UTF8')), 'hex'), 'qr')
  returning id into v_sid;
  update public.kiosk_qr_claims set session_id = v_sid where id = v_cid;
  perform public.audit_log_write('kiosk_qr_claim', 'kiosk_sessions:' || v_sid::text, null,
    jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', v_m.id, 'unlock_method', 'qr', 'counter', v_hit), v_device.store_id);
  select st.name into v_store_name from public.stores st where st.id = v_device.store_id;
  return jsonb_build_object('ok', true, 'store_name', v_store_name, 'device_label', v_device.label, 'role', v_m.role, 'name', v_m.user_name);
end $function$;
CREATE OR REPLACE FUNCTION public.kiosk_qr_poll(p_device_fp text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_device record; v_c record; v_idle int;
begin
  select k.* into v_device from public.kiosk_devices k where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */;
  if not found then raise exception 'forbidden'; end if;
  if v_device.device_fp is not null and (p_device_fp is null or p_device_fp <> v_device.device_fp) then raise exception 'device bound'; end if;   -- ★0190（裁定436 ①b）: 束縛済みの端末は同じ fp からだけ（未束縛＝旧 client の間は従来どおり）
  select c.id, c.session_id, c.counter, c.membership_id, s.operator_user_id, m.role, u.name as user_name into v_c
    from public.kiosk_qr_claims c
    join public.kiosk_sessions s on s.id = c.session_id
    join public.memberships m on m.id = c.membership_id
    join public.users u on u.id = m.user_id
   where c.device_id = v_device.id and c.opened_at is null and s.ended_at is null and c.claimed_at > now() - interval '2 minutes'
   order by c.claimed_at desc limit 1;
  if v_c.id is null then return jsonb_build_object('ok', false, 'reason', 'pending'); end if;
  update public.kiosk_qr_claims set opened_at = now() where id = v_c.id;
  update public.kiosk_sessions set last_seen_at = now() where id = v_c.session_id;
  insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values (v_device.org_id, v_device.store_id, v_c.operator_user_id, 'kiosk_qr_open', 'kiosk_sessions:' || v_c.session_id::text, null,
          jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', v_c.membership_id, 'counter', v_c.counter), null);
  v_idle := least(180, coalesce((select (st.settings_json->>'kiosk_idle_sec')::int from public.stores st where st.id = v_device.store_id), 900));
  return jsonb_build_object('ok', true, 'session_id', v_c.session_id, 'membership_id', v_c.membership_id, 'name', v_c.user_name, 'role', v_c.role,
                            'idle_sec', v_idle, 'unlock_method', 'qr', 'counter', v_c.counter);
end $function$;
CREATE OR REPLACE FUNCTION public.kiosk_qr_secret(p_rotate boolean DEFAULT false, p_device_fp text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_device record; v_sec text;
begin
  select k.* into v_device from public.kiosk_devices k where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */;
  if not found then raise exception 'forbidden'; end if;
  if v_device.device_fp is not null and (p_device_fp is null or p_device_fp <> v_device.device_fp) then raise exception 'device bound'; end if;   -- ★0190（裁定436 ①b）: 束縛済みの端末は同じ fp からだけ（未束縛＝旧 client の間は従来どおり）
  select q.secret_hex into v_sec from public.kiosk_qr_keys q where q.device_id = v_device.id;
  if v_sec is null or p_rotate then
    v_sec := encode(gen_random_bytes(20), 'hex');
    insert into public.kiosk_qr_keys (device_id, secret_hex) values (v_device.id, v_sec)
      on conflict (device_id) do update set secret_hex = excluded.secret_hex, rotated_at = now();
    insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values (v_device.org_id, v_device.store_id, null, 'kiosk_qr_secret', 'kiosk_devices:' || v_device.id::text, null,
            jsonb_build_object('kiosk_device_id', v_device.id, 'rotated', coalesce(p_rotate, false)), null);
  end if;
  return jsonb_build_object('device_id', v_device.id, 'secret_hex', v_sec, 'step', 30);
end $function$;
CREATE OR REPLACE FUNCTION public.kiosk_transport_issue(p_punch_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_device public.kiosk_devices;
  v_org    uuid;   -- ★5 0159（起票91）: 端末の org を受けてゲート行を規約形（billing_writable_of(v_org)）に
  v_p      record;
  v_store  record;
  v_base   integer;
  v_mode   text;   -- ★0177（裁定414）: 店の送り方式（記録に刻む）
  v_date   date;
  v_idem   uuid;
  v_actor  uuid;
  v_id     uuid;
  v_ip     text;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */;
  if not found then raise exception 'forbidden'; end if;
  v_org := v_device.org_id;   -- ★5 0159
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;   -- ★5 0159: 規約形（billing 段47-1「挿入行の形」）
  if p_punch_id is null then raise exception 'invalid_input'; end if;
  select p.id, p.org_id, p.store_id, p.cast_id, p.type, p.okuri, p.punched_at, p.source into v_p from public.punches p where p.id = p_punch_id;
  -- 他店・他 org・存在しない id・kiosk 以外の打刻は同じ 'forbidden'
  if v_p.id is null or v_p.org_id <> v_device.org_id or v_p.store_id <> v_device.store_id or v_p.source <> 'kiosk' then raise exception 'forbidden'; end if;
  if v_p.type <> 'out' or v_p.okuri is not true then raise exception 'not okuri punch'; end if;
  select s.id, s.org_id, s.settings_json into v_store from public.stores s where s.id = v_p.store_id;
  v_mode := coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat');
  if v_mode = 'none' then raise exception 'okuri none'; end if;                                  -- ★0177（裁定414）: なし＝拒否
  if v_mode not in ('actual','flat','store') then raise exception 'bad okuri mode'; end if;                   -- ★0177: 不正値は拒否（fail-closed）
  v_base := nullif(trim(v_store.settings_json->>'okuri_base_amount'), '')::integer;
  if v_base is null or v_base <= 0 then raise exception 'no base amount'; end if;
  v_date := public.biz_date_of(v_p.store_id, v_p.punched_at);
  v_idem := md5(v_p.id::text || ':' || v_p.cast_id::text)::uuid;
  select t.id into v_id from public.transport t where t.store_id = v_p.store_id and t.idem_key = v_idem;
  if v_id is not null then return v_id; end if;
  if v_p.punched_at < now() - interval '10 minutes' then raise exception 'punch expired'; end if;   -- 端末は cast を識別しない＝打刻直後だけ（起草判断 (h)）
  if exists (select 1 from public.payroll_runs
             where store_id = v_p.store_id and period = to_char(v_date, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;
  select c.user_id into v_actor from public.casts c where c.id = v_p.cast_id;   -- 操作者なし＝cast の user（無ければ null）
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  insert into public.transport (org_id, store_id, cast_id, amount, biz_date, note, created_by, idem_key, mode)   -- ★0177: 記録時の店の方式を刻む
  values (v_p.org_id, v_p.store_id, v_p.cast_id, v_base, v_date, null, v_actor, v_idem, v_mode)
  returning id into v_id;
  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, null, 'kiosk_transport_issue',
     'transport:' || v_id::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', v_p.cast_id, 'amount', v_base,
                        'biz_date', v_date, 'punch_id', v_p.id, 'mode', v_mode),
     v_ip);
  return v_id;
end $function$;
CREATE OR REPLACE FUNCTION public.kiosk_unlock(p_pin text, p_membership_id uuid DEFAULT NULL::uuid, p_device_fp text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
-- ★27 0175 v2（裁定423 候補・R-7）: レジ端末の解除＝誰かを選ばず PIN だけで本人を特定（staff_pin＝owner／manager／staff can_register／cast can_register かつ店のキャストのレジ使用 ≥1）。
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
     and (m.role in ('owner','admin','manager') or (m.role = 'staff' and m.can_register)
          or (m.role = 'cast' and m.can_register and coalesce((select (st.settings_json->>'sys_cast_register')::int from public.stores st where st.id = m.store_id), 0) >= 1))
     and sp.pin_hash = crypt(p_pin, sp.pin_hash)
     and (p_membership_id is null or m.id = p_membership_id);
  if coalesce(v_n, 0) = 0 then return jsonb_build_object('ok', false, 'reason', 'wrong_pin'); end if;
  if v_n > 1 then return jsonb_build_object('ok', false, 'reason', 'ambiguous', 'candidates', v_cands); end if;
  return public.kiosk_login(v_mid, p_pin) || jsonb_build_object('idle_sec', coalesce((select (st.settings_json->>'kiosk_idle_sec')::int from public.stores st where st.id = v_device.store_id), 900));
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
     and u.is_active and m.role in ('manager','staff');
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
CREATE OR REPLACE FUNCTION public.kiosk_provision(p_auth_user_id uuid, p_store_id uuid, p_label text, p_purpose text DEFAULT 'punch'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid := public.auth_org_id();
  v_store_org uuid;
  v_id        uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if p_auth_user_id is null then raise exception 'bad auth user'; end if;
  -- ★0192 M-47: p_purpose は受けて無視（列 purpose は既定 'punch' のまま書く＝CHECK は残す）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;
  -- 実在人物の auth uid の kiosk 化を封じる（役職二重化封じの鏡像）
  if exists (select 1 from public.users u where u.auth_user_id = p_auth_user_id) then
    raise exception 'bad target';
  end if;
  -- ★0190 M-29: 上限 3 台（無効は数えない）→ ★0192 M-47: 用途を数えない＝店ごと 3 台
  if (select count(*) from public.kiosk_devices k where k.store_id = p_store_id and k.is_active) >= 3 then
    raise exception 'device limit';
  end if;

  insert into public.kiosk_devices (org_id, store_id, auth_user_id, label, purpose)
  values (v_org, p_store_id, p_auth_user_id, nullif(trim(coalesce(p_label,'')), ''), 'punch')
  returning id into v_id;

  perform public.audit_log_write('kiosk_provision', 'kiosk_devices:' || v_id::text,
    null, (select to_jsonb(k) from public.kiosk_devices k where k.id = v_id), p_store_id);
  return v_id;
end $function$;
CREATE OR REPLACE FUNCTION public.kiosk_reactivate(p_device_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0190 M-29 ⑤: 無効化した端末を「認証情報を再発行して有効化」（新しい PW は route が発行＝ここは is_active だけ・上限 3 台・audit）
declare
  v_org uuid := public.auth_org_id(); v_dev record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  select * into v_dev from public.kiosk_devices where id = p_device_id and org_id = v_org;
  if v_dev.id is null then raise exception 'not found'; end if;
  if v_dev.is_active then raise exception 'already active'; end if;
  if (select count(*) from public.kiosk_devices k where k.store_id = v_dev.store_id and k.is_active) >= 3 then raise exception 'device limit'; end if;   -- ★0192 M-47: 店ごと 3 台（用途を数えない）
  update public.kiosk_devices set is_active = true, updated_at = now() where id = p_device_id;
  perform public.audit_log_write('kiosk_reactivate', 'kiosk_devices:' || p_device_id::text, to_jsonb(v_dev), (select to_jsonb(k) from public.kiosk_devices k where k.id = p_device_id), v_dev.store_id);
end $function$;

-- ═══ ★7 M-49 店設定キー kiosk_person_idle_minutes（set_store_profile の白名単＋検査 1〜120） ═══
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
                             'ar_enabled',                                                                -- ★4 0155: 裁定309-1 の 1 キー（boolean・新規店の既定は false＝ar_policy_ok の coalesce）（0158 ★4: 末尾 '];' → ','）
                             'okuri_base_amount',                                                         -- ★4 0158: 裁定317 の 1 キー（整数 0〜99999）（0164 ★2: 末尾 '];' → ','）
                             'invoice_registered_on','pay_day','tax_inclusive_display','use_vip','use_counter','payment_methods','punch_methods',   -- ★2 0164: 裁定331 C 5 項目＋334 フロア機能（列側 7 キー）（0172 ★3: 末尾 '];' → ','）
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
                             'kind_back_rate','withholding_default_cast','withholding_default_staff','cash_float_default','settlement_close_day'];   -- ★0191（便 OB-2 ⑤）: 初期設定 v5 の器なし 5 項目   -- ★0190（裁定436）: 打刻ゲート（boolean・既定 true＝false の店はレジの check_* で打刻を見ない）   -- ★0187（便 CASH）: 現金割引の基準（total＝合計から・既定／subtotal＝小計から）   -- ★1 0180（裁定414 追補）: 送り 定額の距離区分（配列・最大 3・{code,name,amount}）                                                                -- ★27 0175 v2 追補 2 同乗 R-7（裁定423 候補）                                     -- ★24／★25 0175 v2 追補 2（裁定421 候補・裁定420）                   -- ★11 0175 v2（CN-R ⑳ 週払い・日払いの上限）
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
  v_kf       jsonb;     -- ★27 v2 R-7: kiosk_features {punch, register, shift}
  v_pdb      text;      -- ★0187: pay_discount_base
  v_dg       boolean;   -- ★0190: duty_gate
  v_oft      jsonb;     -- ★1 0180: okuri_flat_tiers（配列・最大 3）
  v_oe       jsonb;     -- ★1 0180: okuri_flat_tiers の要素
  v_ocodes   text[] := '{}';   -- ★1 0180: code の重複検査
  v_kis      numeric;   -- ★27 v2 R-7: kiosk_idle_sec（60〜900・既定 180）
  v_kpi      numeric;   -- ★0192 M-49: kiosk_person_idle_minutes（1〜120・既定 10＝キオスクの本人でログインの無操作で戻す分）
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
  if coalesce(v_penf, v_store.punch_enforce) and coalesce(v_pmode, v_store.punch_restrict_mode) in ('gps','both')
     and (coalesce(v_plat, v_store.punch_lat) is null or coalesce(v_plng, v_store.punch_lng) is null or coalesce(v_prad, v_store.punch_radius_m) is null) then
    raise exception 'range required';
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
    v_before   := v_before || jsonb_build_object('sys_cast_register', v_settings->'sys_cast_register', 'cast_register_enabled', v_settings->'cast_register_enabled');
    v_after    := v_after  || jsonb_build_object('sys_cast_register', v_scr::int, 'cast_register_enabled', (v_scr > 0));
    v_settings := jsonb_set(jsonb_set(v_settings, '{sys_cast_register}', to_jsonb(v_scr::int), true), '{cast_register_enabled}', to_jsonb(v_scr > 0), true);
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

  -- ── 1 回で書く（patch に無い列は現値のまま） ──────────
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

-- ═══ ★8 M-34 アカウント未発行のキャストの基本の働き方（cast_id で置く・本人の初回の保存で membership へ引き取る） ═══
alter table public.availability add column if not exists cast_id uuid references public.casts(id) on delete cascade;
alter table public.availability alter column membership_id drop not null;
alter table public.availability drop constraint if exists availability_owner_ck;
alter table public.availability add constraint availability_owner_ck check (membership_id is not null or cast_id is not null);
create unique index if not exists availability_cast_uq on public.availability (cast_id, dow) where membership_id is null;
alter table public.availability_terms add column if not exists cast_id uuid references public.casts(id) on delete cascade;
alter table public.availability_terms drop constraint if exists availability_terms_pkey;
alter table public.availability_terms alter column membership_id drop not null;
alter table public.availability_terms add constraint availability_terms_membership_uq unique (membership_id);
alter table public.availability_terms drop constraint if exists availability_terms_owner_ck;
alter table public.availability_terms add constraint availability_terms_owner_ck check (membership_id is not null or cast_id is not null);
create unique index if not exists availability_terms_cast_uq on public.availability_terms (cast_id) where membership_id is null;
drop policy if exists availability_select on public.availability;
create policy availability_select on public.availability for select to authenticated
  using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
         and (public.auth_role() in ('owner','manager','staff') or membership_id = public.auth_membership_id() or (membership_id is null and cast_id = public.auth_cast_id())));
drop policy if exists availability_terms_select on public.availability_terms;
create policy availability_terms_select on public.availability_terms for select to authenticated
  using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
         and (public.auth_role() in ('owner','manager','staff') or membership_id = public.auth_membership_id() or (membership_id is null and cast_id = public.auth_cast_id())));
revoke all on table public.availability, public.availability_terms from public, anon, authenticated;
grant select on table public.availability, public.availability_terms to authenticated;

CREATE OR REPLACE FUNCTION public.availability_set(p_membership_id uuid, p_rows jsonb, p_terms jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★9 0175（裁定397＋413 追補1）: 基本の働き方＝membership 単位。p_rows＝曜日ごとの配列 [{dow 0-6, avail ok|ng|ask, from_min, to_min, memo}]（全置換・無い曜日は行なし＝制限なし）・
--   p_terms＝{week_days_target 0-7, fixed_off_dows [0-6], effective_from 'YYYY-MM-DD', memo}（null＝変えない）。本人（auth_membership_id()）か owner／自店 manager。
--   雇用キャストの時間帯（from_min／to_min）は店のみ＝本人が変えようとすると 'time by store only'。audit。相手への通知は client（P175）＝お知らせ／今日タブの通知欄
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_me    uuid := public.auth_membership_id();
  v_mem   record;
  v_self  boolean;
  v_emp   text;
  v_cid   uuid;   -- ★0192 M-34: この membership のキャスト（店が未発行のうちに cast_id で置いた行を引き取る）
  v_e     jsonb;
  v_dow   int; v_av text; v_from int; v_to int; v_memo text;
  v_before jsonb; v_after jsonb;
  v_wdt   int; v_fo smallint[]; v_eff date; v_tmemo text;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'bad rows'; end if;
  select m.id, m.store_id, m.user_id, m.role, s.org_id into v_mem
    from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_membership_id;
  if v_mem.id is null or v_mem.org_id <> v_org then raise exception 'forbidden'; end if;
  v_self := (v_me is not null and v_me = p_membership_id);
  if not (v_self or v_role = 'owner' or (v_role = 'manager' and v_mem.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  -- 雇用キャスト＝casts.employment '雇用'（membership の user と店で結ぶ）
  select c.employment, c.id into v_emp, v_cid from public.casts c where c.user_id = v_mem.user_id and c.store_id = v_mem.store_id and c.is_active limit 1;

  select coalesce(jsonb_agg(to_jsonb(a) - 'id' - 'org_id' - 'store_id' - 'created_at' - 'updated_at' order by a.dow), '[]'::jsonb) into v_before
    from public.availability a where a.membership_id = p_membership_id;

  -- 検査（全要素）→ 全置換
  for v_e in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_e) <> 'object' then raise exception 'bad rows'; end if;
    if jsonb_typeof(v_e->'dow') <> 'number' then raise exception 'bad dow'; end if;
    v_dow := (v_e->>'dow')::int; if v_dow < 0 or v_dow > 6 then raise exception 'bad dow'; end if;
    v_av := v_e->>'avail'; if v_av is null or v_av not in ('ok','ng','ask') then raise exception 'bad avail'; end if;
    v_from := nullif(v_e->>'from_min', '')::int; v_to := nullif(v_e->>'to_min', '')::int;
    if (v_from is null) <> (v_to is null) then raise exception 'bad time'; end if;
    if v_from is not null and (v_from < 0 or v_from > 1439 or v_to < 0 or v_to > 2879) then raise exception 'bad time'; end if;
    v_memo := left(nullif(trim(coalesce(v_e->>'memo', '')), ''), 200);
    if v_self and v_emp = '雇用' then   -- 雇用キャストの時間帯は店のみ（本人は表示と「変更を希望する」のメモ）
      if exists (select 1 from public.availability a where (a.membership_id = p_membership_id or (a.membership_id is null and v_cid is not null and a.cast_id = v_cid)) and a.dow = v_dow
                   and (a.from_min is distinct from v_from or a.to_min is distinct from v_to))
         or (v_from is not null and not exists (select 1 from public.availability a where (a.membership_id = p_membership_id or (a.membership_id is null and v_cid is not null and a.cast_id = v_cid)) and a.dow = v_dow)) then
        raise exception 'time by store only';
      end if;
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_rows) e) <> (select count(distinct (e->>'dow')) from jsonb_array_elements(p_rows) e) then raise exception 'dup dow'; end if;

  delete from public.availability where membership_id = p_membership_id;
  delete from public.availability where membership_id is null and v_cid is not null and cast_id = v_cid;   -- ★0192 M-34: 未発行のうちの行を引き取る（全置換）
  insert into public.availability (org_id, store_id, membership_id, cast_id, dow, avail, from_min, to_min, memo)
  select v_org, v_mem.store_id, p_membership_id, v_cid, (e->>'dow')::int, e->>'avail',
         nullif(e->>'from_min', '')::int, nullif(e->>'to_min', '')::int, left(nullif(trim(coalesce(e->>'memo', '')), ''), 200)
    from jsonb_array_elements(p_rows) e;

  -- ★0192 M-34: 未発行のうちの terms（cast_id）＝membership の行が無ければ付け替え・あれば捨てる
  if v_cid is not null then
    if exists (select 1 from public.availability_terms t where t.membership_id = p_membership_id) then
      delete from public.availability_terms where membership_id is null and cast_id = v_cid;
    else
      update public.availability_terms set membership_id = p_membership_id where membership_id is null and cast_id = v_cid;
    end if;
  end if;
  -- 413 追補1 の列（terms）＝null なら触らない
  if p_terms is not null then
    if jsonb_typeof(p_terms) <> 'object' then raise exception 'bad terms'; end if;
    v_wdt := nullif(p_terms->>'week_days_target', '')::int;
    if v_wdt is not null and (v_wdt < 0 or v_wdt > 7) then raise exception 'bad week_days_target'; end if;
    if p_terms ? 'fixed_off_dows' then
      if jsonb_typeof(p_terms->'fixed_off_dows') <> 'array' then raise exception 'bad fixed_off_dows'; end if;
      select coalesce(array_agg(distinct (x)::smallint order by (x)::smallint), '{}'::smallint[]) into v_fo
        from jsonb_array_elements_text(p_terms->'fixed_off_dows') x;
      if exists (select 1 from unnest(v_fo) d where d < 0 or d > 6) then raise exception 'bad fixed_off_dows'; end if;
    end if;
    v_eff := nullif(p_terms->>'effective_from', '')::date;
    v_tmemo := left(nullif(trim(coalesce(p_terms->>'memo', '')), ''), 200);
    insert into public.availability_terms (org_id, store_id, membership_id, cast_id, week_days_target, fixed_off_dows, effective_from, memo, updated_by)
    values (v_org, v_mem.store_id, p_membership_id, v_cid, v_wdt, coalesce(v_fo, '{}'::smallint[]), v_eff, v_tmemo, v_me)
    on conflict (membership_id) do update
      set week_days_target = case when p_terms ? 'week_days_target' then excluded.week_days_target else availability_terms.week_days_target end,
          fixed_off_dows   = case when p_terms ? 'fixed_off_dows'   then excluded.fixed_off_dows   else availability_terms.fixed_off_dows end,
          effective_from   = case when p_terms ? 'effective_from'   then excluded.effective_from   else availability_terms.effective_from end,
          memo             = case when p_terms ? 'memo'             then excluded.memo             else availability_terms.memo end,
          updated_by = v_me, updated_at = now();
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) - 'id' - 'org_id' - 'store_id' - 'created_at' - 'updated_at' order by a.dow), '[]'::jsonb) into v_after
    from public.availability a where a.membership_id = p_membership_id;
  perform public.audit_log_write('availability_set', 'memberships:' || p_membership_id::text,
    jsonb_build_object('rows', v_before),
    jsonb_build_object('rows', v_after, 'terms', p_terms, 'by_self', v_self), v_mem.store_id);
end $function$;
CREATE OR REPLACE FUNCTION public.availability_list(p_store_id uuid)
 RETURNS TABLE(membership_id uuid, user_id uuid, role text, dow smallint, avail text, from_min integer, to_min integer, memo text, week_days_target integer, fixed_off_dows smallint[], effective_from date, terms_memo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★9 0175（裁定397）: 自店の全員の働き方（シフト作成の候補順＝可→相談→不可・一覧カードの曜日チップ）。owner／自店 manager・staff（can_shift）。cast は自分の行だけ（SELECT ポリシーでも読める）
declare
  v_org uuid := public.auth_org_id();
  v_role text := public.auth_role();
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or p_store_id = public.auth_store_id()) then raise exception 'forbidden'; end if;
  return query
    select m.id, m.user_id, m.role, a.dow, a.avail, a.from_min, a.to_min, a.memo,
           t.week_days_target, t.fixed_off_dows, t.effective_from, t.memo
      from public.memberships m
      left join public.casts c on c.user_id = m.user_id and c.store_id = m.store_id and c.is_active   -- ★0192 M-34: 未発行のうちに店が置いた行（cast_id）も出す
      left join public.availability a on (a.membership_id = m.id or (a.membership_id is null and a.cast_id = c.id))
      left join public.availability_terms t on (t.membership_id = m.id or (t.membership_id is null and t.cast_id = c.id))
     where m.store_id = p_store_id and m.is_active
       and (v_role in ('owner','manager','staff') or m.id = public.auth_membership_id())
     order by m.id, a.dow;
end $function$;

CREATE OR REPLACE FUNCTION public.availability_set_cast(p_cast_id uuid, p_rows jsonb, p_terms jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0192 M-34（相談役 11/02＝Agoora 確定）: アカウント未発行のキャストの基本の働き方を店が置く（owner 全店／manager 自店）。
--   行は cast_id で持つ（membership_id null）・本人の確認は初回ログイン後＝availability_set（本人）の保存で membership に引き取る。
--   アカウントがある（自店 active の membership）なら 'has account'＝availability_set を使う。p_rows／p_terms の形と検査は availability_set と同じ。audit 'availability_set'
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_me    uuid := public.auth_membership_id();
  v_cast  record;
  v_e     jsonb;
  v_dow   int; v_av text; v_from int; v_to int;
  v_before jsonb; v_after jsonb;
  v_wdt   int; v_fo smallint[]; v_eff date; v_tmemo text;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'bad rows'; end if;
  select c.id, c.store_id, c.org_id, c.user_id into v_cast from public.casts c where c.id = p_cast_id and c.is_active;
  if v_cast.id is null or v_cast.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_cast.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  if v_cast.user_id is not null and exists (select 1 from public.memberships m where m.user_id = v_cast.user_id and m.store_id = v_cast.store_id and m.is_active) then raise exception 'has account'; end if;

  for v_e in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_e) <> 'object' then raise exception 'bad rows'; end if;
    if jsonb_typeof(v_e->'dow') <> 'number' then raise exception 'bad dow'; end if;
    v_dow := (v_e->>'dow')::int; if v_dow < 0 or v_dow > 6 then raise exception 'bad dow'; end if;
    v_av := v_e->>'avail'; if v_av is null or v_av not in ('ok','ng','ask') then raise exception 'bad avail'; end if;
    v_from := nullif(v_e->>'from_min', '')::int; v_to := nullif(v_e->>'to_min', '')::int;
    if (v_from is null) <> (v_to is null) then raise exception 'bad time'; end if;
    if v_from is not null and (v_from < 0 or v_from > 1439 or v_to < 0 or v_to > 2879) then raise exception 'bad time'; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_rows) e) <> (select count(distinct (e->>'dow')) from jsonb_array_elements(p_rows) e) then raise exception 'dup dow'; end if;

  select coalesce(jsonb_agg(to_jsonb(a) - 'id' - 'org_id' - 'store_id' - 'created_at' - 'updated_at' order by a.dow), '[]'::jsonb) into v_before
    from public.availability a where a.membership_id is null and a.cast_id = p_cast_id;
  delete from public.availability where membership_id is null and cast_id = p_cast_id;
  insert into public.availability (org_id, store_id, membership_id, cast_id, dow, avail, from_min, to_min, memo)
  select v_org, v_cast.store_id, null, p_cast_id, (e->>'dow')::int, e->>'avail',
         nullif(e->>'from_min', '')::int, nullif(e->>'to_min', '')::int, left(nullif(trim(coalesce(e->>'memo', '')), ''), 200)
    from jsonb_array_elements(p_rows) e;

  if p_terms is not null then
    if jsonb_typeof(p_terms) <> 'object' then raise exception 'bad terms'; end if;
    v_wdt := nullif(p_terms->>'week_days_target', '')::int;
    if v_wdt is not null and (v_wdt < 0 or v_wdt > 7) then raise exception 'bad week_days_target'; end if;
    if p_terms ? 'fixed_off_dows' then
      if jsonb_typeof(p_terms->'fixed_off_dows') <> 'array' then raise exception 'bad fixed_off_dows'; end if;
      select coalesce(array_agg(distinct (x)::smallint order by (x)::smallint), '{}'::smallint[]) into v_fo
        from jsonb_array_elements_text(p_terms->'fixed_off_dows') x;
      if exists (select 1 from unnest(v_fo) d where d < 0 or d > 6) then raise exception 'bad fixed_off_dows'; end if;
    end if;
    v_eff := nullif(p_terms->>'effective_from', '')::date;
    v_tmemo := left(nullif(trim(coalesce(p_terms->>'memo', '')), ''), 200);
    insert into public.availability_terms (org_id, store_id, membership_id, cast_id, week_days_target, fixed_off_dows, effective_from, memo, updated_by)
    values (v_org, v_cast.store_id, null, p_cast_id, v_wdt, coalesce(v_fo, '{}'::smallint[]), v_eff, v_tmemo, v_me)
    on conflict (cast_id) where membership_id is null do update
      set week_days_target = case when p_terms ? 'week_days_target' then excluded.week_days_target else availability_terms.week_days_target end,
          fixed_off_dows   = case when p_terms ? 'fixed_off_dows'   then excluded.fixed_off_dows   else availability_terms.fixed_off_dows end,
          effective_from   = case when p_terms ? 'effective_from'   then excluded.effective_from   else availability_terms.effective_from end,
          memo             = case when p_terms ? 'memo'             then excluded.memo             else availability_terms.memo end,
          updated_by = v_me, updated_at = now();
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) - 'id' - 'org_id' - 'store_id' - 'created_at' - 'updated_at' order by a.dow), '[]'::jsonb) into v_after
    from public.availability a where a.membership_id is null and a.cast_id = p_cast_id;
  perform public.audit_log_write('availability_set', 'casts:' || p_cast_id::text,
    jsonb_build_object('rows', v_before),
    jsonb_build_object('rows', v_after, 'terms', p_terms, 'by_self', false, 'no_account', true), v_cast.store_id);
end $function$;
revoke execute on function public.availability_set_cast(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.availability_set_cast(uuid, jsonb, jsonb) to authenticated;

-- ═══ ★9 demo_reset_mark_failed（cron demo-reset の失敗の監査＝service_role だけが EXECUTE・audit_log_write_service の 4 ロール revoke は不変） ═══
CREATE OR REPLACE FUNCTION public.demo_reset_mark_failed(p_org_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0192（0192_plan 項目 9・案 A）: 公開デモ org の reset 失敗を audit 'demo.reset.failed' に 1 行（cron route 専用）。デモ以外は 'not demo'
declare
  v_demo boolean;
begin
  if p_org_id is null or p_reason is null then raise exception 'forbidden'; end if;
  select o.is_demo into v_demo from public.orgs o where o.id = p_org_id;
  if v_demo is null or v_demo <> true then raise exception 'not demo'; end if;
  perform public.audit_log_write_service(p_org_id, null, 'demo.reset.failed', 'orgs:' || p_org_id::text, null,
    jsonb_build_object('reason', left(trim(p_reason), 200)), null, null);
end $function$;
revoke execute on function public.demo_reset_mark_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.demo_reset_mark_failed(uuid, text) to service_role;

commit;

-- ===== verify =====（Success の後に下の SELECT をコメントを外して貼る・読取だけ・期待値は docs/demo/handpaste_0192.md）
-- select 'nox-project-proof' k, count(*)::text v from public.orgs
-- union all select 'functions', count(*)::text from pg_proc where pronamespace='public'::regnamespace
-- union all select 'tables', count(*)::text from pg_tables where schemaname='public'
-- union all select 'has 0192', count(*)::text from pg_proc where pronamespace='public'::regnamespace and prosrc like '%0192%'
-- union all select 'new fns (9)', count(*)::text from pg_proc where pronamespace='public'::regnamespace and proname in ('staff_attendance_set','staff_attendance_confirm','punch_cancel_out','staff_punch_cancel_out','staff_pin_unlock','cast_pin_unlock','cast_pin_status','availability_set_cast','demo_reset_mark_failed')
-- union all select 'k.purpose left', count(*)::text from pg_proc where pronamespace='public'::regnamespace and prosrc like '%k.purpose%'
-- union all select 'kiosk_punch 15 min left', count(*)::text from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_punch' and prosrc like '%15 minutes%'
-- union all select 'staff_punch default 15 left', count(*)::text from pg_proc where pronamespace='public'::regnamespace and proname='staff_punch' and prosrc like '%::int, 15))%'
-- union all select 'kiosk_devices purpose check', count(*)::text from pg_constraint where conrelid='public.kiosk_devices'::regclass and contype='c' and pg_get_constraintdef(oid) like '%purpose%'
-- union all select 'new tables rls', string_agg(relname || '=' || relrowsecurity::text, ',' order by relname) from pg_class where oid in ('public.staff_attendance_days'::regclass, 'public.staff_attendance_locks'::regclass)
-- union all select 'new tables acl', coalesce(string_agg(table_name || ':' || grantee || '=' || privilege_type, ',' order by table_name, grantee, privilege_type), '') from information_schema.role_table_grants where table_schema='public' and table_name in ('staff_attendance_days','staff_attendance_locks','availability','availability_terms') and grantee in ('anon','authenticated')
-- union all select 'availability cast_id cols', count(*)::text from information_schema.columns where table_schema='public' and table_name in ('availability','availability_terms') and column_name='cast_id'
-- union all select 'availability membership nullable', string_agg(table_name || '=' || is_nullable, ',' order by table_name) from information_schema.columns where table_schema='public' and table_name in ('availability','availability_terms') and column_name='membership_id'
-- union all select 'acl rows', count(*)::text from (values
--     ('approval_direct(uuid,text,text,integer,text)',false,true,true),
--     ('approval_request(uuid,text,text,integer,text)',false,true,true),
--     ('assert_on_duty(text)',false,false,false),
--     ('audit_log_write_service(uuid,uuid,text,text,jsonb,jsonb,uuid,text)',false,false,false),
--     ('cast_leave(uuid,date)',false,true,true),
--     ('check_add_line(uuid,uuid,integer,text,text,text,integer)',false,true,true),
--     ('check_add_seat(uuid,uuid)',false,true,true),
--     ('check_close(uuid,uuid)',false,true,true),
--     ('check_customer_add(uuid,uuid)',false,true,true),
--     ('check_customer_remove(uuid,uuid)',false,true,true),
--     ('check_dohan_add(uuid,uuid,integer,uuid)',false,true,true),
--     ('check_extension_add(uuid,uuid)',false,true,true),
--     ('check_line_set_customer(uuid,uuid,boolean)',false,true,true),
--     ('check_line_set_group(uuid,text)',false,true,true),
--     ('check_merge(uuid,uuid,text,uuid)',false,true,true),
--     ('check_move_seat(uuid,uuid)',false,true,true),
--     ('check_open(uuid,integer,text,uuid,uuid,uuid)',false,true,true),
--     ('check_pay(uuid,text,integer,text,integer,uuid,text,text,numeric,boolean,integer,numeric,integer)',false,true,true),
--     ('check_referral_remove(uuid)',false,true,true),
--     ('check_referral_set(uuid,uuid,text,integer,text,uuid,text)',false,true,true),
--     ('check_remove_line(uuid)',false,true,true),
--     ('check_remove_seat(uuid,uuid)',false,true,true),
--     ('check_set_ext_rule(uuid,uuid)',false,true,true),
--     ('check_set_nominations(uuid,jsonb)',false,true,true),
--     ('check_set_people(uuid,integer)',false,true,true),
--     ('check_shimei_add(uuid,uuid,text,uuid)',false,true,true),
--     ('check_time_charge_apply(uuid)',false,true,true),
--     ('check_void(uuid,text)',false,true,true),
--     ('duty_gate_of(uuid)',false,false,false),
--     ('kiosk_delete(uuid)',false,true,true),
--     ('kiosk_device_bind(text,text)',false,true,true),
--     ('kiosk_device_unbind(uuid)',false,true,true),
--     ('kiosk_login(uuid,text,text)',false,true,true),
--     ('kiosk_provision(uuid,uuid,text,text)',false,true,true),
--     ('kiosk_punch(uuid,text,text,boolean)',false,true,true),
--     ('kiosk_qr_poll(text)',false,true,true),
--     ('kiosk_qr_secret(boolean,text)',false,true,true),
--     ('kiosk_reactivate(uuid)',false,true,true),
--     ('kiosk_unlock(text,uuid,text)',false,true,true),
--     ('on_duty_of(text,uuid,uuid,date)',false,false,false),
--     ('set_cast_pin(uuid,text)',false,true,true),
--     ('set_product(uuid,uuid,text,text,text,integer,integer,text,integer,jsonb,integer,boolean,integer,uuid,boolean,jsonb)',false,true,true),
--     ('set_staff_pin(uuid,text)',false,true,true),
--     ('set_store_mine_settings(uuid,jsonb)',false,true,true),
--     ('set_store_profile(uuid,jsonb)',false,true,true),
--     ('setup_draft_set(uuid,jsonb)',false,true,true),
--     ('staff_deactivate(uuid)',false,true,true),
--     ('staff_punch(uuid,text,text)',false,true,true),
--     ('staff_attendance_set(uuid,date,boolean,timestamp with time zone,timestamp with time zone,text,text)',false,true,true),
--     ('staff_attendance_confirm(uuid,text,boolean)',false,true,true),
--     ('punch_cancel_out(uuid)',false,true,true),
--     ('staff_punch_cancel_out(uuid)',false,true,true),
--     ('staff_pin_unlock(uuid)',false,true,true),
--     ('cast_pin_unlock(uuid)',false,true,true),
--     ('cast_pin_status(uuid)',false,true,true),
--     ('auth_kiosk_store_id()',false,true,true),
--     ('auth_kiosk_register_store_id()',false,true,true),
--     ('auth_kiosk_operator()',false,true,true),
--     ('kiosk_lock(text)',false,true,true),
--     ('kiosk_logout()',false,true,true),
--     ('kiosk_punch_state()',false,true,true),
--     ('kiosk_qr_claim(text)',false,true,true),
--     ('kiosk_transport_issue(uuid)',false,true,true),
--     ('availability_set(uuid,jsonb,jsonb)',false,true,true),
--     ('availability_list(uuid)',false,true,true),
--     ('availability_set_cast(uuid,jsonb,jsonb)',false,true,true),
--     ('demo_reset_mark_failed(uuid,text)',false,false,true)
--   ) x(sig, an, au, sr)
-- union all select 'acl diff', count(*)::text from (values
--     ('approval_direct(uuid,text,text,integer,text)',false,true,true),
--     ('approval_request(uuid,text,text,integer,text)',false,true,true),
--     ('assert_on_duty(text)',false,false,false),
--     ('audit_log_write_service(uuid,uuid,text,text,jsonb,jsonb,uuid,text)',false,false,false),
--     ('cast_leave(uuid,date)',false,true,true),
--     ('check_add_line(uuid,uuid,integer,text,text,text,integer)',false,true,true),
--     ('check_add_seat(uuid,uuid)',false,true,true),
--     ('check_close(uuid,uuid)',false,true,true),
--     ('check_customer_add(uuid,uuid)',false,true,true),
--     ('check_customer_remove(uuid,uuid)',false,true,true),
--     ('check_dohan_add(uuid,uuid,integer,uuid)',false,true,true),
--     ('check_extension_add(uuid,uuid)',false,true,true),
--     ('check_line_set_customer(uuid,uuid,boolean)',false,true,true),
--     ('check_line_set_group(uuid,text)',false,true,true),
--     ('check_merge(uuid,uuid,text,uuid)',false,true,true),
--     ('check_move_seat(uuid,uuid)',false,true,true),
--     ('check_open(uuid,integer,text,uuid,uuid,uuid)',false,true,true),
--     ('check_pay(uuid,text,integer,text,integer,uuid,text,text,numeric,boolean,integer,numeric,integer)',false,true,true),
--     ('check_referral_remove(uuid)',false,true,true),
--     ('check_referral_set(uuid,uuid,text,integer,text,uuid,text)',false,true,true),
--     ('check_remove_line(uuid)',false,true,true),
--     ('check_remove_seat(uuid,uuid)',false,true,true),
--     ('check_set_ext_rule(uuid,uuid)',false,true,true),
--     ('check_set_nominations(uuid,jsonb)',false,true,true),
--     ('check_set_people(uuid,integer)',false,true,true),
--     ('check_shimei_add(uuid,uuid,text,uuid)',false,true,true),
--     ('check_time_charge_apply(uuid)',false,true,true),
--     ('check_void(uuid,text)',false,true,true),
--     ('duty_gate_of(uuid)',false,false,false),
--     ('kiosk_delete(uuid)',false,true,true),
--     ('kiosk_device_bind(text,text)',false,true,true),
--     ('kiosk_device_unbind(uuid)',false,true,true),
--     ('kiosk_login(uuid,text,text)',false,true,true),
--     ('kiosk_provision(uuid,uuid,text,text)',false,true,true),
--     ('kiosk_punch(uuid,text,text,boolean)',false,true,true),
--     ('kiosk_qr_poll(text)',false,true,true),
--     ('kiosk_qr_secret(boolean,text)',false,true,true),
--     ('kiosk_reactivate(uuid)',false,true,true),
--     ('kiosk_unlock(text,uuid,text)',false,true,true),
--     ('on_duty_of(text,uuid,uuid,date)',false,false,false),
--     ('set_cast_pin(uuid,text)',false,true,true),
--     ('set_product(uuid,uuid,text,text,text,integer,integer,text,integer,jsonb,integer,boolean,integer,uuid,boolean,jsonb)',false,true,true),
--     ('set_staff_pin(uuid,text)',false,true,true),
--     ('set_store_mine_settings(uuid,jsonb)',false,true,true),
--     ('set_store_profile(uuid,jsonb)',false,true,true),
--     ('setup_draft_set(uuid,jsonb)',false,true,true),
--     ('staff_deactivate(uuid)',false,true,true),
--     ('staff_punch(uuid,text,text)',false,true,true),
--     ('staff_attendance_set(uuid,date,boolean,timestamp with time zone,timestamp with time zone,text,text)',false,true,true),
--     ('staff_attendance_confirm(uuid,text,boolean)',false,true,true),
--     ('punch_cancel_out(uuid)',false,true,true),
--     ('staff_punch_cancel_out(uuid)',false,true,true),
--     ('staff_pin_unlock(uuid)',false,true,true),
--     ('cast_pin_unlock(uuid)',false,true,true),
--     ('cast_pin_status(uuid)',false,true,true),
--     ('auth_kiosk_store_id()',false,true,true),
--     ('auth_kiosk_register_store_id()',false,true,true),
--     ('auth_kiosk_operator()',false,true,true),
--     ('kiosk_lock(text)',false,true,true),
--     ('kiosk_logout()',false,true,true),
--     ('kiosk_punch_state()',false,true,true),
--     ('kiosk_qr_claim(text)',false,true,true),
--     ('kiosk_transport_issue(uuid)',false,true,true),
--     ('availability_set(uuid,jsonb,jsonb)',false,true,true),
--     ('availability_list(uuid)',false,true,true),
--     ('availability_set_cast(uuid,jsonb,jsonb)',false,true,true),
--     ('demo_reset_mark_failed(uuid,text)',false,false,true)
--   ) x(sig, an, au, sr)
--   where to_regprocedure('public.' || x.sig) is null
--      or has_function_privilege('anon', to_regprocedure('public.' || x.sig), 'execute') <> x.an
--      or has_function_privilege('authenticated', to_regprocedure('public.' || x.sig), 'execute') <> x.au
--      or has_function_privilege('service_role', to_regprocedure('public.' || x.sig), 'execute') <> x.sr
-- union all select 'acl demo_reset_mark_failed (anon,auth,service)', has_function_privilege('anon', 'public.demo_reset_mark_failed(uuid,text)', 'execute')::text || ',' || has_function_privilege('authenticated', 'public.demo_reset_mark_failed(uuid,text)', 'execute')::text || ',' || has_function_privilege('service_role', 'public.demo_reset_mark_failed(uuid,text)', 'execute')::text
-- union all select 'acl audit_log_write_service (anon,auth,service)', has_function_privilege('anon', 'public.audit_log_write_service(uuid,uuid,text,text,jsonb,jsonb,uuid,text)', 'execute')::text || ',' || has_function_privilege('authenticated', 'public.audit_log_write_service(uuid,uuid,text,text,jsonb,jsonb,uuid,text)', 'execute')::text || ',' || has_function_privilege('service_role', 'public.audit_log_write_service(uuid,uuid,text,text,jsonb,jsonb,uuid,text)', 'execute')::text
-- union all select 'md5 staff_attendance_set', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '83446f6c' then ' =file' else ' ≠file(83446f6c)' end from pg_proc where pronamespace='public'::regnamespace and proname='staff_attendance_set'
-- union all select 'md5 staff_attendance_confirm', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '95d4fa4a' then ' =file' else ' ≠file(95d4fa4a)' end from pg_proc where pronamespace='public'::regnamespace and proname='staff_attendance_confirm'
-- union all select 'md5 punch_cancel_out', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'dc70956e' then ' =file' else ' ≠file(dc70956e)' end from pg_proc where pronamespace='public'::regnamespace and proname='punch_cancel_out'
-- union all select 'md5 staff_punch_cancel_out', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'b047febc' then ' =file' else ' ≠file(b047febc)' end from pg_proc where pronamespace='public'::regnamespace and proname='staff_punch_cancel_out'
-- union all select 'md5 staff_pin_unlock', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'a84eb37a' then ' =file' else ' ≠file(a84eb37a)' end from pg_proc where pronamespace='public'::regnamespace and proname='staff_pin_unlock'
-- union all select 'md5 cast_pin_unlock', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'be0a26d8' then ' =file' else ' ≠file(be0a26d8)' end from pg_proc where pronamespace='public'::regnamespace and proname='cast_pin_unlock'
-- union all select 'md5 cast_pin_status', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'cebedc8d' then ' =file' else ' ≠file(cebedc8d)' end from pg_proc where pronamespace='public'::regnamespace and proname='cast_pin_status'
-- union all select 'md5 auth_kiosk_store_id', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '00f65b4b' then ' =file' else ' ≠file(00f65b4b)' end from pg_proc where pronamespace='public'::regnamespace and proname='auth_kiosk_store_id'
-- union all select 'md5 auth_kiosk_register_store_id', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '66587880' then ' =file' else ' ≠file(66587880)' end from pg_proc where pronamespace='public'::regnamespace and proname='auth_kiosk_register_store_id'
-- union all select 'md5 auth_kiosk_operator', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'f2f0d080' then ' =file' else ' ≠file(f2f0d080)' end from pg_proc where pronamespace='public'::regnamespace and proname='auth_kiosk_operator'
-- union all select 'md5 kiosk_lock', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '51c43564' then ' =file' else ' ≠file(51c43564)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_lock'
-- union all select 'md5 kiosk_login', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '81ced32e' then ' =file' else ' ≠file(81ced32e)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_login'
-- union all select 'md5 kiosk_logout', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'cc6c9f5f' then ' =file' else ' ≠file(cc6c9f5f)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_logout'
-- union all select 'md5 kiosk_punch', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'ffa49ad5' then ' =file' else ' ≠file(ffa49ad5)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_punch'
-- union all select 'md5 kiosk_punch_state', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '0ed80625' then ' =file' else ' ≠file(0ed80625)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_punch_state'
-- union all select 'md5 kiosk_qr_claim', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '1e31abb2' then ' =file' else ' ≠file(1e31abb2)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_qr_claim'
-- union all select 'md5 kiosk_qr_poll', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'e12933d5' then ' =file' else ' ≠file(e12933d5)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_qr_poll'
-- union all select 'md5 kiosk_qr_secret', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '5d3e8ad0' then ' =file' else ' ≠file(5d3e8ad0)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_qr_secret'
-- union all select 'md5 kiosk_transport_issue', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '599162b4' then ' =file' else ' ≠file(599162b4)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_transport_issue'
-- union all select 'md5 kiosk_unlock', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '8cf87df4' then ' =file' else ' ≠file(8cf87df4)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_unlock'
-- union all select 'md5 staff_punch', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'c8ff44c4' then ' =file' else ' ≠file(c8ff44c4)' end from pg_proc where pronamespace='public'::regnamespace and proname='staff_punch'
-- union all select 'md5 kiosk_provision', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'ab75d422' then ' =file' else ' ≠file(ab75d422)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_provision'
-- union all select 'md5 kiosk_reactivate', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '064026fb' then ' =file' else ' ≠file(064026fb)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_reactivate'
-- union all select 'md5 set_store_profile', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'b9d361eb' then ' =file' else ' ≠file(b9d361eb)' end from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile'
-- union all select 'md5 availability_set', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'dcfed778' then ' =file' else ' ≠file(dcfed778)' end from pg_proc where pronamespace='public'::regnamespace and proname='availability_set'
-- union all select 'md5 availability_list', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'dfe5361c' then ' =file' else ' ≠file(dfe5361c)' end from pg_proc where pronamespace='public'::regnamespace and proname='availability_list'
-- union all select 'md5 availability_set_cast', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '7ccb95af' then ' =file' else ' ≠file(7ccb95af)' end from pg_proc where pronamespace='public'::regnamespace and proname='availability_set_cast'
-- union all select 'md5 demo_reset_mark_failed', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'b0cee9c7' then ' =file' else ' ≠file(b0cee9c7)' end from pg_proc where pronamespace='public'::regnamespace and proname='demo_reset_mark_failed';
