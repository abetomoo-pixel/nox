-- 0214_punch_breaks（起票158 の 2 休憩の打刻・相談役 11/25 の決め D5・版 2＝便 F の F4・起草と試走まで・適用はしない）
--   版 2（相談役 11/25 の F4）：閉じていない休憩を「人だけ」で探していた穴を閉じる＝前の営業日の閉じ忘れが残ると、次の日の退勤が 'on break'、休憩が 'already on break' で断られ本人が抜け出せない。
--     閉じていない休憩は「その打刻の営業日（biz_date）」の分だけを見る＝punch_seq_check・staff_punch の 'on break'・break_seq_check の 'already on break'／'not on break'・
--     終了の時に行を引く所（break_self・kiosk_break・break_proxy）・端末の状態（kiosk_break_state）・閉じていない休憩は 1 人 1 つの部分 unique を「1 人 1 営業日に 1 つ」に。
--     前の営業日の閉じ忘れは今日の出勤・休憩・退勤を止めない（その日のまま残る＝退勤のある日は計算の側で休憩開始〜退勤を休憩にして要対応に 1 行・退勤も無い日は今と同じ open_punch）。店の直し break_set は終了が必須（今のまま）。
--   決め（相談役 11/25）：案 B＝休憩は別の表（punches・staff_punches とそれを読む今の関数・画面は変えない＝「出勤中か」は今のまま・休憩を使わない店は行 0）。
--     休憩中もレジは使える（on_duty_of に触れない）・休憩中の退勤は断る（'on break'）・位置の判定はしない・確定シフトどおりの店では時間から引かない（計算の側）。
--     閉じ忘れ（休憩終了の無いまま退勤が入った日）は休憩開始から退勤までを休憩にして要対応に 1 行（計算と画面の側）。確定済みの期の直しは今の打刻の修正と同じ（給与の要対応に積む）。
--     本人の修正の申請は作らない（店だけ＝break_set）。OFF にした後もある行は引く（終了は OFF でも押せる・開始だけ止める）。初期設定には出さない（店舗設定だけ）・2 店目には写す。
--     最短や自動の休憩は作らない。ボタンの形＝出勤中は「休憩」「退勤」・休憩中は「休憩終了」だけ（画面の側・端末は名前を押した時に kiosk_break_state で状態を読む）。
--   中身：表 punch_breaks（標準型）・内部 break_seq_check（4 ロール revoke）・打つ関数 4 本（break_self 本人のスマホ／kiosk_break 端末＋PIN／break_proxy 店の代理／break_set 店の直し）・
--     読む関数 kiosk_break_state（端末）・書く関数 set_break_punch（オーナーだけ・店の設定の鍵 break_punch）・張り替え 3 本（punch_seq_check と staff_punch に「休憩中の退勤は断る」1 行・store_copy_settings の写す鍵に break_punch）。
--   翻訳元：BANZEN lib/punch-rules.ts（順序・休憩中は退勤できない）・0201r kiosk_punch／staff_punch（PIN の照合とロック・端末の監査）・0196 punch_proxy（代理の柵）・0158 punch_correction_apply（確定後の直し＝要対応）・0208（柵と監査の形）。
--   前提：関数 511・表 132（0212・0213・0215 の後＝2026-11-25 17 時台の本番）。当てる直前に本番から数え直す。
--   数：関数 +7（break_seq_check・break_self・kiosk_break・break_proxy・break_set・kiosk_break_state・set_break_punch）・表 +1（punch_breaks）＝518・133。張り替え 3 本は名前不変で本数不動。
--   事前確認：docs/tmp/break_1125/v2/0214_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ：docs/tmp/break_1125/v2/0214_verify.sql（先頭は貼り先証明 select 'nox-project-proof', count(*) from public.orgs）。
begin;
set local lock_timeout = '10s';

-- ── 1. 表（標準型：表 → index → RLS → SELECT のポリシー → revoke all → grant select） ──
create table public.punch_breaks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  store_id       uuid not null references public.stores(id) on delete cascade,
  cast_id        uuid null references public.casts(id) on delete cascade,
  membership_id  uuid null references public.memberships(id) on delete cascade,
  biz_date       date not null,                                          -- その勤務の営業日（休憩開始の時刻を店の締めで）
  started_at     timestamptz not null,
  ended_at       timestamptz null,                                       -- null＝休憩中
  source         text not null check (source in ('self','kiosk','manager')),
  created_by     uuid null references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint punch_breaks_one_person_ck check (num_nonnulls(cast_id, membership_id) = 1),
  constraint punch_breaks_order_ck check (ended_at is null or ended_at >= started_at)
);
create unique index punch_breaks_open_cast_uq on public.punch_breaks (cast_id, biz_date) where ended_at is null and cast_id is not null;               -- 閉じていない休憩は 1 人 1 営業日に 1 つ（★版 2: 前の営業日の閉じ忘れが今日の休憩を塞がない）
create unique index punch_breaks_open_member_uq on public.punch_breaks (membership_id, biz_date) where ended_at is null and membership_id is not null;
create index punch_breaks_store_date_idx on public.punch_breaks (store_id, biz_date);
create index punch_breaks_cast_idx on public.punch_breaks (cast_id, started_at);
create index punch_breaks_member_idx on public.punch_breaks (membership_id, started_at);
create index punch_breaks_org_idx on public.punch_breaks (org_id);
alter table public.punch_breaks enable row level security;
create policy punch_breaks_select on public.punch_breaks for select to authenticated
  using (org_id = public.auth_org_id()
         and (public.auth_role() = 'owner'
              or (public.auth_role() = 'manager' and store_id = public.auth_store_id())
              or (cast_id is not null and cast_id = public.auth_cast_id())
              or (membership_id is not null and membership_id = public.auth_membership_id())));   -- キャスト本人・スタッフ本人（auth_membership_id＝0136。staff_punches_select の users を引く形は本人のスタッフが 0 行になる＝試走で見つけた）
revoke all on table public.punch_breaks from public, anon, authenticated;
grant select on table public.punch_breaks to authenticated;
comment on table public.punch_breaks is '★0214（起票158 の 2）: 休憩の打刻（キャストとスタッフ・1 行＝1 回の休憩・ended_at null＝休憩中）。書くのは break_self／kiosk_break／break_proxy／break_set だけ。休憩を使わない店は行 0';

-- ── 2. 順序の検査（内部専用・4 ロール revoke・原則8＝呼び出し元が二重防御済み） ──
create or replace function public.break_seq_check(p_store_id uuid, p_cast_id uuid, p_membership_id uuid, p_action text, p_at timestamptz default now())
returns date language plpgsql security definer set search_path = public as $$
declare
  v_bd   date;
  v_last text;
  v_on   boolean;
begin
  if p_store_id is null or num_nonnulls(p_cast_id, p_membership_id) <> 1 or p_action is null or p_action not in ('start','end') then raise exception 'bad action'; end if;
  v_bd := public.biz_date_of(p_store_id, p_at);
  if p_action = 'start' then
    select coalesce((s.settings_json->>'break_punch')::boolean, false) into v_on from public.stores s where s.id = p_store_id;
    if not coalesce(v_on, false) then raise exception 'break disabled'; end if;   -- 開始だけ止める（OFF にした後も、休憩中の人は終了を押せる）
    if p_cast_id is not null then
      select p.type into v_last from public.punches p
       where p.cast_id = p_cast_id and p.store_id = p_store_id
         and p.punched_at >= p_at - interval '2 days' and p.punched_at <= p_at + interval '2 days'
         and public.biz_date_of(p_store_id, p.punched_at) = v_bd
       order by p.punched_at desc, p.created_at desc limit 1;
    else
      select sp.kind into v_last from public.staff_punches sp
       where sp.membership_id = p_membership_id and sp.biz_date = v_bd
       order by sp.punched_at desc limit 1;
    end if;
    if v_last is distinct from 'in' then raise exception 'not on duty'; end if;   -- 出勤中（今日の最後の打刻が出勤）だけ
    if exists (select 1 from public.punch_breaks b where b.ended_at is null and b.biz_date = v_bd and (b.cast_id = p_cast_id or b.membership_id = p_membership_id)) then raise exception 'already on break'; end if;   -- ★版 2: その営業日の休憩だけ（前の営業日の閉じ忘れは見ない）
  else
    if not exists (select 1 from public.punch_breaks b where b.ended_at is null and b.biz_date = v_bd and (b.cast_id = p_cast_id or b.membership_id = p_membership_id)) then raise exception 'not on break'; end if;   -- ★版 2: 同上（前の営業日の閉じ忘れは終了で閉じない＝店の直し break_set）
  end if;
  return v_bd;
end $$;
revoke execute on function public.break_seq_check(uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated, service_role;

-- ── 3. 本人のスマホ（キャスト・位置の判定はしない） ──
create or replace function public.break_self(p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org   uuid := public.auth_org_id();
  v_cid   uuid := public.auth_cast_id();
  v_cast  public.casts;
  v_actor uuid;
  v_bd    date;
  v_row   public.punch_breaks;
begin
  if v_org is null or v_cid is null or public.auth_role() is distinct from 'cast' then raise exception 'forbidden'; end if;
  select c.* into v_cast from public.casts c where c.id = v_cid and c.org_id = v_org and c.is_active;
  if v_cast.id is null then raise exception 'forbidden'; end if;
  v_bd := public.break_seq_check(v_cast.store_id, v_cid, null, p_action, now());
  select u.id into v_actor from public.users u where u.auth_user_id = auth.uid() and u.is_active;
  if p_action = 'start' then
    insert into public.punch_breaks (org_id, store_id, cast_id, biz_date, started_at, source, created_by)
    values (v_org, v_cast.store_id, v_cid, v_bd, now(), 'self', v_actor) returning * into v_row;
    perform public.audit_log_write('break_self', 'punch_breaks:' || v_row.id::text, null, to_jsonb(v_row), v_cast.store_id);
  else
    select b.* into v_row from public.punch_breaks b where b.cast_id = v_cid and b.ended_at is null and b.biz_date = v_bd for update;   -- ★版 2: その営業日の休憩
    update public.punch_breaks set ended_at = now(), updated_at = now() where id = v_row.id;
    perform public.audit_log_write('break_self', 'punch_breaks:' || v_row.id::text, to_jsonb(v_row), (select to_jsonb(b) from public.punch_breaks b where b.id = v_row.id), v_cast.store_id);
  end if;
  return jsonb_build_object('ok', true, 'id', v_row.id, 'action', p_action, 'at', now(), 'biz_date', v_bd);
end $$;
revoke execute on function public.break_self(text) from public, anon;
grant execute on function public.break_self(text) to authenticated;

-- ── 4. 端末（キャストの PIN か、スタッフ・店長の PIN）＝kiosk_punch／staff_punch と同じ照合・ロック・端末の監査 ──
create or replace function public.kiosk_break(p_cast_id uuid, p_membership_id uuid, p_pin text, p_action text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_device   public.kiosk_devices;
  v_ip       text;
  v_settings jsonb;
  v_max      integer;
  v_lock     interval;
  v_hash     text;
  v_fail     integer;
  v_locked   timestamptz;
  v_newfail  integer;
  v_target   text;
  v_bd       date;
  v_row      public.punch_breaks;
  v_mem      record;
  v_uid      uuid;     -- スタッフ・店長の打刻のときだけ（端末の監査の actor）
begin
  select k.* into v_device from public.kiosk_devices k where k.auth_user_id = auth.uid() and k.is_active;
  if not found then raise exception 'forbidden'; end if;
  if num_nonnulls(p_cast_id, p_membership_id) <> 1 or p_action is null or p_action not in ('start','end') then raise exception 'bad action'; end if;
  select s.settings_json into v_settings from public.stores s where s.id = v_device.store_id;
  v_max  := case when p_cast_id is not null then 5 else coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_max_fail'), '')::int, 5) end;   -- キャストは kiosk_punch と同じ 5 回・スタッフは staff_punch と同じ店設定
  v_lock := make_interval(mins => coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_minutes'), '')::int, 5));
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then return jsonb_build_object('ok', false, 'reason', 'bad_pin'); end if;   -- 形式不正は失敗の数に入れない

  if p_cast_id is not null then
    if not exists (select 1 from public.casts c where c.id = p_cast_id and c.store_id = v_device.store_id and c.is_active) then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    select p.pin_hash, p.fail_count, p.locked_until into v_hash, v_fail, v_locked from public.cast_pin p where p.cast_id = p_cast_id for update;
    if not found then return jsonb_build_object('ok', false, 'reason', 'no_pin'); end if;
    v_target := 'cast_pin:' || p_cast_id::text;
  else
    select m.id, m.user_id into v_mem
      from public.memberships m join public.users u on u.id = m.user_id
     where m.id = p_membership_id and m.store_id = v_device.store_id and m.is_active
       and u.is_active and (m.role = 'staff' or (m.role = 'manager' and coalesce((select st.manager_punch_enabled from public.stores st where st.id = v_device.store_id), true)));
    if v_mem.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    v_uid := v_mem.user_id;
    select p.pin_hash, p.fail_count, p.locked_until into v_hash, v_fail, v_locked from public.staff_pin p where p.membership_id = p_membership_id for update;
    if not found then return jsonb_build_object('ok', false, 'reason', 'no_pin'); end if;
    v_target := 'staff_pin:' || p_membership_id::text;
  end if;
  if v_locked is not null and v_locked > now() then return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_locked); end if;

  if v_hash <> crypt(p_pin, v_hash) then
    v_newfail := v_fail + 1;
    if p_cast_id is not null then
      update public.cast_pin set fail_count = case when v_newfail >= v_max then 0 else v_newfail end, locked_until = case when v_newfail >= v_max then now() + v_lock else locked_until end, updated_at = now() where cast_id = p_cast_id;
    else
      update public.staff_pin set fail_count = case when v_newfail >= v_max then 0 else v_newfail end, locked_until = case when v_newfail >= v_max then now() + v_lock else locked_until end, updated_at = now() where membership_id = p_membership_id;
    end if;
    insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values (v_device.org_id, v_device.store_id, null, 'kiosk_break', v_target, null,
            jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', p_cast_id, 'membership_id', p_membership_id, 'result', 'wrong_pin', 'fail_count', v_newfail, 'locked', v_newfail >= v_max), v_ip);
    if v_newfail >= v_max then return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', now() + v_lock); end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  if p_cast_id is not null then update public.cast_pin set fail_count = 0, locked_until = null, updated_at = now() where cast_id = p_cast_id;
  else update public.staff_pin set fail_count = 0, locked_until = null, updated_at = now() where membership_id = p_membership_id; end if;
  update public.kiosk_devices set last_seen_at = now(), last_ip = v_ip where id = v_device.id;
  if p_membership_id is not null and exists (select 1 from public.staff_attendance_locks l where l.store_id = v_device.store_id and l.period = to_char(public.biz_date_of(v_device.store_id, now()), 'YYYY-MM')) then raise exception 'confirmed'; end if;   -- staff_punch と同じ（確定済みの月には打てない）
  v_bd := public.break_seq_check(v_device.store_id, p_cast_id, p_membership_id, p_action, now());
  if p_action = 'start' then
    insert into public.punch_breaks (org_id, store_id, cast_id, membership_id, biz_date, started_at, source, created_by)
    values (v_device.org_id, v_device.store_id, p_cast_id, p_membership_id, v_bd, now(), 'kiosk', null) returning * into v_row;
  else
    update public.punch_breaks set ended_at = now(), updated_at = now()
     where ended_at is null and biz_date = v_bd and (cast_id = p_cast_id or membership_id = p_membership_id) returning * into v_row;   -- ★版 2: その営業日の休憩
  end if;
  insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values (v_device.org_id, v_device.store_id, v_uid, 'kiosk_break', 'punch_breaks:' || v_row.id::text, null,
          jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', p_cast_id, 'membership_id', p_membership_id, 'action', p_action, 'biz_date', v_bd, 'result', 'ok'), v_ip);
  return jsonb_build_object('ok', true, 'id', v_row.id, 'action', p_action, 'at', now(), 'biz_date', v_bd);
end $$;
revoke execute on function public.kiosk_break(uuid, uuid, text, text) from public, anon;
grant execute on function public.kiosk_break(uuid, uuid, text, text) to authenticated;

-- ── 5. 店の代理（キャスト＝punch_proxy と同じ柵＝owner／自店の manager・staff・スタッフ＝owner／自店の manager） ──
create or replace function public.break_proxy(p_cast_id uuid, p_membership_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_store uuid;
  v_actor uuid;
  v_bd    date;
  v_row   public.punch_breaks;
  v_bef   jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if num_nonnulls(p_cast_id, p_membership_id) <> 1 then raise exception 'bad action'; end if;
  if p_cast_id is not null then
    select c.store_id into v_store from public.casts c where c.id = p_cast_id and c.org_id = v_org and c.is_active;
    if v_store is null then raise exception 'forbidden'; end if;
    if not (v_role = 'owner' or (v_role in ('manager','staff') and v_store = public.auth_store_id())) then raise exception 'forbidden'; end if;
  else
    select m.store_id into v_store from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_membership_id and s.org_id = v_org and m.is_active and m.role in ('staff','manager');   -- memberships に org_id は無い＝店で会社を見る
    if v_store is null then raise exception 'forbidden'; end if;
    if not (v_role = 'owner' or (v_role = 'manager' and v_store = public.auth_store_id())) then raise exception 'forbidden'; end if;
    if exists (select 1 from public.staff_attendance_locks l where l.store_id = v_store and l.period = to_char(public.biz_date_of(v_store, now()), 'YYYY-MM')) then raise exception 'confirmed'; end if;
  end if;
  v_bd := public.break_seq_check(v_store, p_cast_id, p_membership_id, p_action, now());
  select u.id into v_actor from public.users u where u.auth_user_id = auth.uid() and u.is_active;
  if p_action = 'start' then
    insert into public.punch_breaks (org_id, store_id, cast_id, membership_id, biz_date, started_at, source, created_by)
    values (v_org, v_store, p_cast_id, p_membership_id, v_bd, now(), 'manager', v_actor) returning * into v_row;
  else
    select to_jsonb(b) into v_bef from public.punch_breaks b where b.ended_at is null and b.biz_date = v_bd and (b.cast_id = p_cast_id or b.membership_id = p_membership_id);   -- ★版 2: その営業日の休憩
    update public.punch_breaks set ended_at = now(), updated_at = now()
     where ended_at is null and biz_date = v_bd and (cast_id = p_cast_id or membership_id = p_membership_id) returning * into v_row;
  end if;
  perform public.audit_log_write('break_proxy', 'punch_breaks:' || v_row.id::text, v_bef, to_jsonb(v_row), v_store);
  return jsonb_build_object('ok', true, 'id', v_row.id, 'action', p_action, 'at', now(), 'biz_date', v_bd);
end $$;
revoke execute on function public.break_proxy(uuid, uuid, text) from public, anon;
grant execute on function public.break_proxy(uuid, uuid, text) to authenticated;

-- ── 6. 店の直し（その日の休憩を全部入れ替える・owner／自店の manager・課金の柵・理由は必須・確定後の直しは給与の要対応に積む＝0158 と同じ） ──
create or replace function public.break_set(p_cast_id uuid, p_membership_id uuid, p_biz_date date, p_rows jsonb, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_store  uuid;
  v_actor  uuid;
  v_from   timestamptz;
  v_to     timestamptz;
  v_r      record;
  v_prev   timestamptz := null;
  v_before jsonb;
  v_after  jsonb;
  v_n      integer := 0;
  v_run    record;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if num_nonnulls(p_cast_id, p_membership_id) <> 1 or p_biz_date is null then raise exception 'bad row'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'reason required'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 10 then raise exception 'bad rows'; end if;
  if p_cast_id is not null then
    select c.store_id into v_store from public.casts c where c.id = p_cast_id and c.org_id = v_org;
  else
    select m.store_id into v_store from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_membership_id and s.org_id = v_org;
  end if;
  if v_store is null then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_store = public.auth_store_id())) then raise exception 'forbidden'; end if;
  if p_membership_id is not null and exists (select 1 from public.staff_attendance_locks l where l.store_id = v_store and l.period = to_char(p_biz_date, 'YYYY-MM')) then raise exception 'confirmed'; end if;
  -- 勤務の中（その営業日の最初の出勤〜最後の退勤・退勤が無ければ今まで）に収まること
  if p_cast_id is not null then
    select min(p.punched_at) filter (where p.type = 'in'), max(p.punched_at) filter (where p.type = 'out') into v_from, v_to
      from public.punches p where p.cast_id = p_cast_id and p.store_id = v_store
       and p.punched_at >= p_biz_date::timestamptz - interval '1 day' and p.punched_at < p_biz_date::timestamptz + interval '3 days'
       and public.biz_date_of(v_store, p.punched_at) = p_biz_date;
  else
    select min(sp.punched_at) filter (where sp.kind = 'in'), max(sp.punched_at) filter (where sp.kind = 'out') into v_from, v_to
      from public.staff_punches sp where sp.membership_id = p_membership_id and sp.biz_date = p_biz_date;
  end if;
  if jsonb_array_length(p_rows) > 0 and v_from is null then raise exception 'not on duty'; end if;
  v_to := coalesce(v_to, now());
  for v_r in select (x->>'started_at')::timestamptz s, (x->>'ended_at')::timestamptz e from jsonb_array_elements(p_rows) x order by 1 loop
    if v_r.s is null or v_r.e is null or v_r.e <= v_r.s then raise exception 'bad row'; end if;   -- 終了は必須（休憩中のまま残す直しは作らない＝閉じ忘れの日もこの直しで閉じる）
    if v_r.s < v_from or v_r.e > v_to then raise exception 'outside work'; end if;
    if v_prev is not null and v_r.s < v_prev then raise exception 'overlap'; end if;
    v_prev := v_r.e;
  end loop;
  select coalesce(jsonb_agg(to_jsonb(b) order by b.started_at), '[]'::jsonb) into v_before from public.punch_breaks b
   where b.store_id = v_store and b.biz_date = p_biz_date and (b.cast_id = p_cast_id or b.membership_id = p_membership_id);
  delete from public.punch_breaks b where b.store_id = v_store and b.biz_date = p_biz_date and (b.cast_id = p_cast_id or b.membership_id = p_membership_id);
  select u.id into v_actor from public.users u where u.auth_user_id = auth.uid() and u.is_active;
  insert into public.punch_breaks (org_id, store_id, cast_id, membership_id, biz_date, started_at, ended_at, source, created_by)
  select v_org, v_store, p_cast_id, p_membership_id, p_biz_date, (x->>'started_at')::timestamptz, (x->>'ended_at')::timestamptz, 'manager', v_actor from jsonb_array_elements(p_rows) x;
  get diagnostics v_n = row_count;
  select coalesce(jsonb_agg(to_jsonb(b) order by b.started_at), '[]'::jsonb) into v_after from public.punch_breaks b
   where b.store_id = v_store and b.biz_date = p_biz_date and (b.cast_id = p_cast_id or b.membership_id = p_membership_id);
  -- 確定後の直し（キャスト）＝凍結の給与は変えず、給与の画面の要対応に積む（0158 の punch_correction_apply と同じ形・punch_kind 'break'）
  if p_cast_id is not null then
    for v_run in
      select pr.id from public.payroll_runs pr, lateral public.period_bounds(pr.period) pb
       where pr.store_id = v_store and pr.status in ('finalized','paid')
         and p_biz_date between coalesce(pr.period_start, pb.period_start) and coalesce(pr.period_end, pb.period_end)
    loop
      insert into public.payroll_attentions (org_id, store_id, cast_id, run_id, kind, detail)
      values (v_org, v_store, p_cast_id, v_run.id, 'post_finalize_punch',
              jsonb_build_object('punch_kind', 'break', 'biz_date', p_biz_date, 'before', v_before, 'after', v_after));
    end loop;
  end if;
  perform public.audit_log_write('break_set', 'punch_breaks:' || coalesce(p_cast_id, p_membership_id)::text || ':' || p_biz_date::text, v_before, v_after, v_store, p_reason);
  return v_n;
end $$;
revoke execute on function public.break_set(uuid, uuid, date, jsonb, text) from public, anon;
grant execute on function public.break_set(uuid, uuid, date, jsonb, text) to authenticated;

-- ── 7. 端末が名前を押した時に読む状態（PIN の前・端末の店の人だけ・読むだけ） ──
create or replace function public.kiosk_break_state(p_cast_id uuid, p_membership_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_device public.kiosk_devices;
  v_bd     date;
  v_last   text;
  v_brk    timestamptz;
  v_on     boolean;
begin
  select k.* into v_device from public.kiosk_devices k where k.auth_user_id = auth.uid() and k.is_active;
  if not found then raise exception 'forbidden'; end if;
  if num_nonnulls(p_cast_id, p_membership_id) <> 1 then raise exception 'bad action'; end if;
  v_bd := public.biz_date_of(v_device.store_id, now());
  if p_cast_id is not null then
    if not exists (select 1 from public.casts c where c.id = p_cast_id and c.store_id = v_device.store_id and c.is_active) then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    select p.type into v_last from public.punches p
     where p.cast_id = p_cast_id and p.store_id = v_device.store_id
       and p.punched_at >= now() - interval '2 days' and public.biz_date_of(v_device.store_id, p.punched_at) = v_bd
     order by p.punched_at desc, p.created_at desc limit 1;
    select b.started_at into v_brk from public.punch_breaks b where b.cast_id = p_cast_id and b.ended_at is null and b.biz_date = v_bd;   -- ★版 2: 今日の営業日の休憩だけ（前の営業日の閉じ忘れで「休憩中」にしない）
  else
    if not exists (select 1 from public.memberships m where m.id = p_membership_id and m.store_id = v_device.store_id and m.is_active) then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    select sp.kind into v_last from public.staff_punches sp where sp.membership_id = p_membership_id and sp.biz_date = v_bd order by sp.punched_at desc limit 1;
    select b.started_at into v_brk from public.punch_breaks b where b.membership_id = p_membership_id and b.ended_at is null and b.biz_date = v_bd;   -- ★版 2: 同上
  end if;
  select coalesce((s.settings_json->>'break_punch')::boolean, false) into v_on from public.stores s where s.id = v_device.store_id;
  return jsonb_build_object('ok', true,
    'state', case when v_brk is not null then 'break' when v_last = 'in' then 'on' when v_last = 'out' then 'done' else 'none' end,
    'break_started_at', v_brk, 'break_enabled', coalesce(v_on, false), 'biz_date', v_bd);
end $$;
revoke execute on function public.kiosk_break_state(uuid, uuid) from public, anon;
grant execute on function public.kiosk_break_state(uuid, uuid) to authenticated;

-- ── 8. 店の設定「休憩の打刻を使う」（オーナーだけ・課金の柵・settings_json の鍵 break_punch・既定（鍵なし）＝OFF） ──
create or replace function public.set_break_punch(p_store_id uuid, p_on boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_cur  boolean;
  v_sid  uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if v_role <> 'owner' then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_on is null then raise exception 'bad value'; end if;
  select s.id, coalesce((s.settings_json->>'break_punch')::boolean, false) into v_sid, v_cur from public.stores s where s.id = p_store_id and s.org_id = v_org for update;
  if v_sid is null then raise exception 'not found'; end if;
  if v_cur = p_on then return p_on; end if;   -- 変更なし＝何もしない
  update public.stores set settings_json = coalesce(settings_json, '{}'::jsonb) || jsonb_build_object('break_punch', p_on), updated_at = now() where id = p_store_id;
  perform public.audit_log_write('set_break_punch', 'stores:' || p_store_id::text, jsonb_build_object('break_punch', v_cur), jsonb_build_object('break_punch', p_on), p_store_id);
  return p_on;
end $$;
revoke execute on function public.set_break_punch(uuid, boolean) from public, anon;
grant execute on function public.set_break_punch(uuid, boolean) to authenticated;

-- ── 9. 張り替え 3 本（本番の今の定義＝pg_get_functiondef を読み、★0214 の 1 行以外は 1 バイトも変えない・ACL は CREATE OR REPLACE で残る）──
--   読んだ定義の md5（事前確認が照合）: punch_seq_check 3017b10fb35590b9b2e4d56774c0b607・staff_punch 3d02db6fc4995d69aafc0536cfe0c5dd・store_copy_settings a9afd154f1c26984cd48d508b2a5a5b3
CREATE OR REPLACE FUNCTION public.punch_seq_check(p_store_id uuid, p_cast_id uuid, p_type text, p_at timestamp with time zone DEFAULT now())
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bd    date;
  v_last  record;   -- 当日営業日の最終打刻
  v_open  record;   -- 前営業日以前の最終打刻（in なら未閉鎖）
  v_run   uuid;
  v_id    uuid;
begin
  if p_store_id is null or p_cast_id is null or p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  v_bd := public.biz_date_of(p_store_id, p_at);
  -- 当日営業日の最終打刻（biz_date_of で帰属・走査は p_at ±2 日幅に絞る）
  select p.type, p.punched_at into v_last
    from public.punches p
   where p.cast_id = p_cast_id and p.store_id = p_store_id
     and p.punched_at >= p_at - interval '2 days' and p.punched_at <= p_at + interval '2 days'
     and public.biz_date_of(p_store_id, p.punched_at) = v_bd
   order by p.punched_at desc, p.created_at desc
   limit 1;
  if p_type = 'in' then
    if v_last.type = 'in'  then raise exception 'already in'; end if;
    if v_last.type = 'out' then raise exception 'already out'; end if;
  else
    if v_last.type is distinct from 'in' then raise exception 'no open punch'; end if;
    if exists (select 1 from public.punch_breaks b where b.cast_id = p_cast_id and b.biz_date = v_bd and b.ended_at is null) then raise exception 'on break'; end if;   -- ★0214（起票158 の 2・版 2）: その営業日の休憩中の退勤は断る（先に「休憩終了」・前の営業日の閉じ忘れは見ない）
  end if;
  -- 前営業日以前の最終打刻が in（未閉鎖）＝今日の打刻は塞がない。注意行 'open_punch'（1 打刻 1 行・run があれば付ける）
  select p.id, p.type, p.punched_at, p.org_id into v_open
    from public.punches p
   where p.cast_id = p_cast_id and p.store_id = p_store_id
     and p.punched_at < p_at
     and public.biz_date_of(p_store_id, p.punched_at) < v_bd
   order by p.punched_at desc, p.created_at desc
   limit 1;
  if v_open.type = 'in'
     and not exists (select 1 from public.payroll_attentions a where a.kind = 'open_punch' and (a.detail->>'punch_id')::uuid = v_open.id) then
    select pr.id into v_run
      from public.payroll_runs pr, lateral public.period_bounds(pr.period) pb
     where pr.store_id = p_store_id
       and public.biz_date_of(p_store_id, v_open.punched_at) between coalesce(pr.period_start, pb.period_start) and coalesce(pr.period_end, pb.period_end)
     order by pr.created_at desc
     limit 1;
    insert into public.payroll_attentions (org_id, store_id, cast_id, run_id, kind, detail)
    values (v_open.org_id, p_store_id, p_cast_id, v_run, 'open_punch',
            jsonb_build_object('punch_id', v_open.id, 'punched_at', v_open.punched_at,
                               'biz_date', public.biz_date_of(p_store_id, v_open.punched_at),
                               'noticed_at', p_at, 'noticed_type', p_type))
    on conflict (((detail->>'punch_id')::uuid)) where kind = 'open_punch' do nothing
    returning id into v_id;
    if v_id is not null then
      perform public.audit_log_write('punch_open_attention', 'payroll_attentions:' || v_id::text, null,
        (select to_jsonb(a) from public.payroll_attentions a where a.id = v_id), p_store_id);
    end if;
  end if;
  return v_bd;
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
  if p_kind = 'out' and exists (select 1 from public.punch_breaks b where b.membership_id = p_membership_id and b.biz_date = v_bd and b.ended_at is null) then raise exception 'on break'; end if;   -- ★0214（起票158 の 2・版 2）: その営業日の休憩中の退勤は断る（前の営業日の閉じ忘れは見ない）

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

CREATE OR REPLACE FUNCTION public.store_copy_settings(p_src uuid, p_dst uuid, p_parts text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid := public.auth_org_id();
  v_s public.stores; v_d public.stores;
  v_parts text[];
  v_n jsonb := '{}'::jsonb;
  v_k int;
  -- ★版 2（相談役 11/23 14:10 の ■2-a）: 写す鍵の名簿（名簿に無い鍵は写さない＝lib/nox/ops/store-copy-keys.ts と同じ・検査 nox-multi-store が突き合わせる）
  v_pricing_keys text[] := array['dohan_auto_hon','ext_shimei_enabled','join_mode','service_rate_by_seat'];
  v_comp_keys text[] := array['bonus_tier_mode','cast_register_enabled','default_plan_id','kind_back_rate','mid_pay','norm_axes','pay_time_basis','pay_time_basis_next','pay_time_basis_next_from','pt_rules_default','reward_axis','sales_back_default_off','sales_basis','sales_norm_enabled','sales_split','sales_subtotal_includes_shimei','sales_subtotal_mode','shimei_norm_enabled','shimei_norm_scope','slide_apply','staff_discount_cap','sys_backs','sys_bonus','sys_cast_register','sys_drink_count_back','sys_hourly','sys_norms','sys_penalties','sys_point_slide','sys_points','sys_sales_rate','sys_sales_slide','sys_staff_discount','sys_wage_cut_rule','trial_back','trial_guarantee_days','trial_wage','withholding_default_cast','withholding_default_staff'];
  v_settings_keys text[] := array['ar_enabled','billing_mode','break_punch'/* ★0214: 休憩の打刻を使う＝2 店目に写す */,'cash_float_default','cast_register_scope','customer_purpose','customer_retention_years','daily_pay_cap_tiers','drink_claim','duty_gate','invoice_reg_no','invoice_registered_on','mynumber_retention_years','okuri_base_amount','okuri_flat_tiers','okuri_mode','pay_discount_base','pay_discount_rates','pay_fee_rates','payment_methods','payslip_visibility','pin_lock_max_fail','pin_lock_minutes','punch_correction_request','punch_methods','punch_mode','ranking','ranking_show_others','receipt_footer','register_window_after_min','register_window_before_min','reservation_request','settlement_close_day','settlement_cycle','settlement_pay_days_after','settlement_presets','settlement_week_close_dow','shift_auto_confirm_hours','shift_cast_confirm','shift_request_mode','show_open_status'];   -- ★版 4: シフトの無い打刻・契約の確認を出すも写さない（相談役 11/23 21:20 の ■1）・版 3: 打刻の制限の方式・強制・丸めは写さない
  v_hours_keys text[] := array['biz_cutoff_hm','close_hm'];
  v_sj jsonb;
  v_def text;
  v_plans jsonb := '[]'::jsonb;   -- ★12:00 の ■2-b
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  select * into v_s from public.stores where id = p_src;
  select * into v_d from public.stores where id = p_dst;
  if v_s.id is null or v_d.id is null or v_s.org_id <> v_org or v_d.org_id <> v_org or p_src = p_dst then raise exception 'forbidden'; end if;
  if coalesce(v_s.settings_json->>'setup_done', '') <> 'true' then raise exception 'src not ready'; end if;
  if coalesce(v_d.settings_json->>'setup_done', '') = 'true' then raise exception 'dst done'; end if;
  select array_agg(distinct x order by x) into v_parts from unnest(coalesce(p_parts, '{}'::text[])) x;
  if coalesce(cardinality(v_parts), 0) = 0 or exists (select 1 from unnest(v_parts) x where x not in ('pricing', 'products', 'comp', 'settings', 'hours')) then raise exception 'bad parts'; end if;
  -- 写し先のその part は空であること（二重に写さない）
  if 'pricing' = any(v_parts) and (exists (select 1 from public.pricing_rules where store_id = p_dst) or exists (select 1 from public.pricing_categories where store_id = p_dst)) then raise exception 'not empty: pricing'; end if;
  if 'products' = any(v_parts) and (exists (select 1 from public.products where store_id = p_dst) or exists (select 1 from public.product_categories where store_id = p_dst)) then raise exception 'not empty: products'; end if;
  if 'comp' = any(v_parts) and (exists (select 1 from public.comp_plans where store_id = p_dst) or exists (select 1 from public.custom_back_defs where store_id = p_dst) or exists (select 1 from public.penalty_config where store_id = p_dst)) then raise exception 'not empty: comp'; end if;
  if 'hours' = any(v_parts) and exists (select 1 from public.store_business_hours where store_id = p_dst) then raise exception 'not empty: hours'; end if;

  create temp table if not exists _nox_copy_map (old uuid primary key, new uuid not null) on commit drop;
  truncate _nox_copy_map;

  -- ランク（料金の指名料と待遇のスライドが指す）＝pricing か comp を写すとき
  --   ★版 2（■2-b）: 写し先にランクが無ければ写して付け替える。写し先にランクがあれば、名前が同じランクに結ぶ（結べないランクが 1 つでもあれば止める）
  if 'pricing' = any(v_parts) or 'comp' = any(v_parts) then
    if not exists (select 1 from public.cast_ranks where store_id = p_dst) then
      insert into _nox_copy_map select r.id, gen_random_uuid() from public.cast_ranks r where r.store_id = p_src;
      insert into public.cast_ranks (id, org_id, store_id, name, sort_order, is_active)
      select m.new, v_org, p_dst, r.name, r.sort_order, r.is_active from public.cast_ranks r join _nox_copy_map m on m.old = r.id where r.store_id = p_src;
      get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('cast_ranks', v_k);
    else
      if exists (select 1 from public.cast_ranks r where r.store_id = p_src and not exists (select 1 from public.cast_ranks d where d.store_id = p_dst and d.name = r.name)) then
        raise exception 'not empty: ranks';
      end if;
      insert into _nox_copy_map select r.id, (select d.id from public.cast_ranks d where d.store_id = p_dst and d.name = r.name order by d.sort_order, d.id limit 1) from public.cast_ranks r where r.store_id = p_src;
      v_n := v_n || jsonb_build_object('cast_ranks_by_name', (select count(*) from public.cast_ranks r where r.store_id = p_src));
    end if;
  end if;

  if 'pricing' = any(v_parts) then
    insert into _nox_copy_map select c.id, gen_random_uuid() from public.pricing_categories c where c.store_id = p_src;
    insert into public.pricing_categories (id, org_id, store_id, name, sort, is_active)
    select m.new, v_org, p_dst, c.name, c.sort, c.is_active from public.pricing_categories c join _nox_copy_map m on m.old = c.id where c.store_id = p_src;
    get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('pricing_categories', v_k);
    insert into public.pricing_rules (org_id, store_id, fee_kind, seat_kind, dow_mask, time_from_min, time_to_min, rank_id, amount, duration_min, priority, is_active, name, tax_category, category_id, billing_unit, is_default_ext, vip_timing, vip_ext_amount)
    select v_org, p_dst, r.fee_kind, r.seat_kind, r.dow_mask, r.time_from_min, r.time_to_min, (select m.new from _nox_copy_map m where m.old = r.rank_id), r.amount, r.duration_min, r.priority, r.is_active, r.name, r.tax_category,
           (select m.new from _nox_copy_map m where m.old = r.category_id), r.billing_unit, r.is_default_ext, r.vip_timing, r.vip_ext_amount
    from public.pricing_rules r where r.store_id = p_src;
    get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('pricing_rules', v_k);
    update public.stores d set hon_fee = s.hon_fee, jonai_fee = s.jonai_fee, dohan_fee = s.dohan_fee, service_rate = s.service_rate, service_rate_by_seat = s.service_rate_by_seat,
           set_min = s.set_min, set_fee = s.set_fee, ext_min = s.ext_min, ext_fee = s.ext_fee, time_mode = s.time_mode, time_per = s.time_per, round_unit = s.round_unit, round_mode = s.round_mode,
           card_tax_rate = s.card_tax_rate, ext_shimei_enabled = s.ext_shimei_enabled, dohan_auto_hon = s.dohan_auto_hon,   -- ★版 2: 席の有無（use_vip・use_counter）は写さない＝席は 2 店目のもの
           settings_json = coalesce(d.settings_json, '{}'::jsonb) || (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(coalesce(s.settings_json, '{}'::jsonb)) e where e.key = any(v_pricing_keys)),
           updated_at = now()
    from public.stores s where s.id = p_src and d.id = p_dst;
  end if;

  if 'products' = any(v_parts) then
    insert into _nox_copy_map select c.id, gen_random_uuid() from public.product_categories c where c.store_id = p_src;
    insert into public.product_categories (id, org_id, store_id, name, sort_order, is_active, default_back_rate, default_track_stock)
    select m.new, v_org, p_dst, c.name, c.sort_order, c.is_active, c.default_back_rate, c.default_track_stock from public.product_categories c join _nox_copy_map m on m.old = c.id where c.store_id = p_src;
    get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('product_categories', v_k);
    insert into public.products (org_id, store_id, type, category, name, price, back_mode, back_value, unit4_json, hon_pt, is_active, reorder_point, category_id, back_exempt_from_split, sort_order, tax_category, track_stock, pt, back_rate_by_kind)
    select v_org, p_dst, p.type, p.category, p.name, p.price, p.back_mode, p.back_value, p.unit4_json, p.hon_pt, p.is_active, p.reorder_point, (select m.new from _nox_copy_map m where m.old = p.category_id),
           p.back_exempt_from_split, p.sort_order, p.tax_category, p.track_stock, p.pt, p.back_rate_by_kind
    from public.products p where p.store_id = p_src;
    get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('products', v_k);
  end if;

  if 'comp' = any(v_parts) then
    insert into _nox_copy_map select c.id, gen_random_uuid() from public.comp_plans c where c.store_id = p_src;
    insert into public.comp_plans (id, org_id, store_id, name, base, hon_back, jonai_back, dohan_back, sales_slide, point_slide, is_active, hon_back_mode, hon_back_rate, jonai_back_mode, jonai_back_rate, dohan_back_mode, dohan_back_rate,
           product_back_mode, product_back_rate, product_back_fixed, product_back_fixed_hon, product_back_fixed_jonai, product_back_fixed_free, slide_period, slide_basis, slide_rank_ids, norm_days_target, norm_dohan_target,
           norm_sales_target, norm_shimei_target, slide_apply, slide_method, pt_rules, pay_rate_tiers, slide_streak_n, reward_axis, assess_grace_months, hon_back_unit, jonai_back_unit, dohan_back_unit, product_back_rate_by_kind,
           product_back_fixed_vip, product_back_rate_vip, reservation_back_tiers, back_rate_tiers, advance_loan_agreed, advance_loan_agreed_at, commission_tiers)
    select m.new, v_org, p_dst, c.name, c.base, c.hon_back, c.jonai_back, c.dohan_back, c.sales_slide, c.point_slide, c.is_active, c.hon_back_mode, c.hon_back_rate, c.jonai_back_mode, c.jonai_back_rate, c.dohan_back_mode, c.dohan_back_rate,
           c.product_back_mode, c.product_back_rate, c.product_back_fixed, c.product_back_fixed_hon, c.product_back_fixed_jonai, c.product_back_fixed_free, c.slide_period, c.slide_basis,
           coalesce((select array_agg(m2.new order by o) from unnest(c.slide_rank_ids) with ordinality u(x, o) join _nox_copy_map m2 on m2.old = x), '{}'::uuid[]),   -- ランクを付け替え（★版 2: 付け替えられない ID は残さない・空は空の配列＝NOT NULL）
           c.norm_days_target, c.norm_dohan_target, c.norm_sales_target, c.norm_shimei_target, c.slide_apply, c.slide_method, c.pt_rules, c.pay_rate_tiers, c.slide_streak_n, c.reward_axis, c.assess_grace_months,
           c.hon_back_unit, c.jonai_back_unit, c.dohan_back_unit, c.product_back_rate_by_kind, c.product_back_fixed_vip, c.product_back_rate_vip, c.reservation_back_tiers, c.back_rate_tiers,
           false, null, c.commission_tiers   -- 前借りの同意は店ごと（写さない）
    from public.comp_plans c join _nox_copy_map m on m.old = c.id where c.store_id = p_src;
    get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('comp_plans', v_k);
    insert into public.comp_plan_components (org_id, store_id, plan_id, kind, mode, amount, rate, params, priority, is_active)
    select v_org, p_dst, m.new, x.kind, x.mode, x.amount, x.rate, x.params, x.priority, x.is_active from public.comp_plan_components x join _nox_copy_map m on m.old = x.plan_id where x.store_id = p_src;
    get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('comp_plan_components', v_k);
    insert into public.plan_norm_tiers (org_id, store_id, plan_id, week_days_min, week_days_max, days_required, hours_required)
    select v_org, p_dst, m.new, x.week_days_min, x.week_days_max, x.days_required, x.hours_required from public.plan_norm_tiers x join _nox_copy_map m on m.old = x.plan_id where x.store_id = p_src;
    insert into public.plan_rate_bands (org_id, store_id, plan_id, target, from_min, to_min, value_amount, value_rate, priority, is_active)
    select v_org, p_dst, m.new, x.target, x.from_min, x.to_min, x.value_amount, x.value_rate, x.priority, x.is_active from public.plan_rate_bands x join _nox_copy_map m on m.old = x.plan_id where x.store_id = p_src;
    insert into public.plan_event_bonuses (org_id, store_id, plan_id, kind, day_from, day_to, target, add_rate, add_amount, label, is_active)
    select v_org, p_dst, m.new, x.kind, x.day_from, x.day_to, x.target, x.add_rate, x.add_amount, x.label, x.is_active from public.plan_event_bonuses x join _nox_copy_map m on m.old = x.plan_id where x.store_id = p_src;
    insert into public.custom_back_defs (org_id, store_id, name, basis, value, cond_json, is_active)
    select v_org, p_dst, x.name, x.basis, x.value, x.cond_json, x.is_active from public.custom_back_defs x where x.store_id = p_src;
    get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('custom_back_defs', v_k);
    insert into public.penalty_config (org_id, store_id, fine_absent, fine_late, hours_per_shift, norm_on, norm_days_flat, norm_days_per, norm_dohan_flat, norm_dohan_per, late_grace_min, early_grace_min, over_grace_min,
           norm_shimei_flat, norm_shimei_per, norm_sales_flat, norm_sales_per, norm_sales_unit)
    select v_org, p_dst, x.fine_absent, x.fine_late, x.hours_per_shift, x.norm_on, x.norm_days_flat, x.norm_days_per, x.norm_dohan_flat, x.norm_dohan_per, x.late_grace_min, x.early_grace_min, x.over_grace_min,
           x.norm_shimei_flat, x.norm_shimei_per, x.norm_sales_flat, x.norm_sales_per, x.norm_sales_unit
    from public.penalty_config x where x.store_id = p_src;
    -- 待遇の鍵（制度の ON／OFF・体入の条件など）＝default_plan_id は付け替え（無ければ外す）
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_sj from jsonb_each(coalesce(v_s.settings_json, '{}'::jsonb)) e where e.key = any(v_comp_keys) and e.key <> 'default_plan_id';
    v_def := v_s.settings_json->>'default_plan_id';
    if v_def is not null and exists (select 1 from _nox_copy_map m where m.old::text = v_def) then
      v_sj := v_sj || jsonb_build_object('default_plan_id', (select m.new from _nox_copy_map m where m.old::text = v_def));
    end if;
    update public.stores set settings_json = coalesce(settings_json, '{}'::jsonb) || v_sj, updated_at = now() where id = p_dst;
  end if;

  if 'hours' = any(v_parts) then
    insert into public.store_business_hours (org_id, store_id, dow, is_closed, open_hm, close_hm)
    select v_org, p_dst, h.dow, h.is_closed, h.open_hm, h.close_hm from public.store_business_hours h where h.store_id = p_src;
    get diagnostics v_k = row_count; v_n := v_n || jsonb_build_object('store_business_hours', v_k);
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_sj from jsonb_each(coalesce(v_s.settings_json, '{}'::jsonb)) e where e.key = any(v_hours_keys);
    update public.stores set settings_json = coalesce(settings_json, '{}'::jsonb) || v_sj, open_time = v_s.open_time, updated_at = now() where id = p_dst;
  end if;

  if 'settings' = any(v_parts) then
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_sj from jsonb_each(coalesce(v_s.settings_json, '{}'::jsonb)) e
    where e.key = any(v_settings_keys);   -- ★版 2: 写す鍵の名簿だけ
    update public.stores d set settings_json = coalesce(d.settings_json, '{}'::jsonb) || v_sj,
           business_tax_status = s.business_tax_status, price_display = s.price_display, invoice_status = s.invoice_status, invoice_reg_no = s.invoice_reg_no, invoice_registered_on = s.invoice_registered_on,
           tax_rounding = s.tax_rounding, card_surcharge_rate = s.card_surcharge_rate, receivable_policy = s.receivable_policy, tax_inclusive_display = s.tax_inclusive_display,
           payment_methods = s.payment_methods, punch_methods = s.punch_methods,   -- ★版 4: シフトの無い打刻も写さない・版 3: 打刻の強制・制限の方式・丸めは写さない
           manager_punch_enabled = s.manager_punch_enabled, legal_name = s.legal_name, trade_name = coalesce(d.trade_name, d.name),   -- ★版 2: 屋号は店ごと（2 店目の店名）
           receipt_default_desc = s.receipt_default_desc, updated_at = now()
    from public.stores s where s.id = p_src and d.id = p_dst;
    v_n := v_n || jsonb_build_object('settings_keys', (select count(*) from jsonb_object_keys(v_sj)));
  end if;

  -- ★12:00 の ■2-b: 待遇のプランの付け替えの対応（作った順＝初期設定の「基本プラン」→「体験入店」の順）と 1 店目の既定のプラン＝画面はこの ID で結ぶ（名前で探さない）
  if 'comp' = any(v_parts) then
    v_plans := (select coalesce(jsonb_agg(jsonb_build_object('src', c.id, 'dst', m.new, 'active', c.is_active) order by c.created_at, c.id), '[]'::jsonb)
                from public.comp_plans c join _nox_copy_map m on m.old = c.id where c.store_id = p_src);
  end if;
  perform public.audit_log_write('store_copy_settings', 'stores:' || p_dst::text, null,
    jsonb_build_object('src', p_src, 'parts', to_jsonb(v_parts), 'counts', v_n), p_dst);
  return jsonb_build_object('parts', to_jsonb(v_parts), 'counts', v_n, 'plans', v_plans,
    'default_src', case when 'comp' = any(v_parts) then coalesce(v_s.settings_json->'default_plan_id', 'null'::jsonb) else 'null'::jsonb end);
end $function$;

commit;
