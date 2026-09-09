-- 0136_staff_shift.sql  (C層② 黒服シフト+勤務パターン・設計書 v1 2026-09-09・裁定 C②-1〜11)
-- 前提: 0135 適用済み(feature_flags / flag_enabled / audit_log_write p_reason)。
-- 方針: 新表4・cast の shifts/shift_wishes は不触・全書込 RPC は flag off で raise 'feature_disabled:staff_shift'。
-- 出典: docs/tmp/mig0136_live_dump_20260909.md(CC live 逐語 2026-09-09)。
-- 手貼り: SQL Editor で Ctrl+A → Run。末尾の proof で 4表/8関数/6policy を確認。
begin;

-- =====================================================================
-- 0. ヘルパー: 本人 membership(C②-9)・管理判定・営業日・flag ゲート
-- =====================================================================
create or replace function public.auth_membership_id()
returns uuid language sql stable security definer set search_path to 'public' as $$
  select m.id from public.memberships m
  join public.users u on u.id = m.user_id
  where u.auth_user_id = auth.uid() and u.is_active and m.is_active
$$;
revoke execute on function public.auth_membership_id() from public, anon;
grant execute on function public.auth_membership_id() to authenticated, service_role;

-- 店舗を管理できるか(owner=自 org 内店舗 / manager=自店)。null 文脈は false(呼出側で先に null-guard)
create or replace function public.staff_shift_can_manage(p_store_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (public.auth_role() = 'owner'
       and exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = public.auth_org_id()))
    or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id()),
    false)
$$;
revoke execute on function public.staff_shift_can_manage(uuid) from public, anon, authenticated, service_role;

-- 営業日(当日)。stores.settings_json.biz_cutoff_hm(HH:MM)以前は前日扱い。無ければ 00:00。
-- ※ 既存に営業日ヘルパーがあれば CC 突合でそちらへ差し替え(本関数は内部専用)
create or replace function public.staff_shift_biz_today(p_store_id uuid)
returns date language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_now timestamp := (now() at time zone 'Asia/Tokyo');
  v_cut text;
begin
  select s.settings_json ->> 'biz_cutoff_hm' into v_cut from public.stores s where s.id = p_store_id;
  if v_cut is null or v_cut !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then v_cut := '00:00'; end if;
  if v_now::time < (v_cut || ':00')::time then
    return (v_now::date - 1);
  end if;
  return v_now::date;
end $$;
revoke execute on function public.staff_shift_biz_today(uuid) from public, anon, authenticated, service_role;

-- flag ゲート(書込 RPC 冒頭で呼ぶ・off は raise・C②-10)
create or replace function public.staff_shift_gate(p_store_id uuid)
returns void language plpgsql stable security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if p_store_id is null then raise exception 'store_required'; end if;
  if not public.flag_enabled('staff_shift', p_store_id) then
    raise exception 'feature_disabled:staff_shift';
  end if;
end $$;
revoke execute on function public.staff_shift_gate(uuid) from public, anon, authenticated, service_role;

-- =====================================================================
-- 1. 表
-- =====================================================================
-- 1.1 枠(effective_from 型・横断 §1)
create table if not exists public.staff_shift_patterns (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id),
  store_id       uuid not null references public.stores(id),
  name           text not null check (length(name) between 1 and 40),
  start_hm       text not null check (start_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_hm         text not null check (end_hm   ~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$'),
  effective_from date not null,
  sort_order     int  not null default 0,
  created_by     uuid references public.memberships(id),
  created_at     timestamptz not null default now(),
  constraint staff_shift_patterns_hm_order check (end_hm > start_hm),
  constraint staff_shift_patterns_uq unique (store_id, name, effective_from)
);
create index if not exists staff_shift_patterns_store_idx on public.staff_shift_patterns (store_id, name, effective_from desc);

-- 1.2 希望(日×枠 ◯×・C②-2)
create table if not exists public.staff_shift_wishes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id),
  store_id     uuid not null references public.stores(id),
  staff_id     uuid not null references public.memberships(id),
  biz_date     date not null,
  pattern_id   uuid not null references public.staff_shift_patterns(id),
  available    boolean not null,
  note         text check (note is null or length(note) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint staff_shift_wishes_uq unique (staff_id, biz_date, pattern_id)
);
create index if not exists staff_shift_wishes_store_date_idx on public.staff_shift_wishes (store_id, biz_date);

-- 1.3 確定行(時刻は枠から写して凍結・例外=行上書き・C②-1/5/7)
create table if not exists public.staff_shifts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id),
  store_id      uuid not null references public.stores(id),
  staff_id      uuid not null references public.memberships(id),
  biz_date      date not null,
  pattern_id    uuid not null references public.staff_shift_patterns(id),
  start_hm      text not null check (start_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_hm        text not null check (end_hm   ~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$'),
  status        text not null default 'proposed' check (status in ('proposed','confirmed')),
  wish_id       uuid references public.staff_shift_wishes(id),
  confirmed_by  uuid references public.memberships(id),
  confirmed_at  timestamptz,
  override_by   uuid references public.memberships(id),
  override_at   timestamptz,
  created_by    uuid references public.memberships(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint staff_shifts_hm_order check (end_hm > start_hm),
  constraint staff_shifts_uq unique (staff_id, biz_date, pattern_id)
);
create index if not exists staff_shifts_store_date_idx on public.staff_shifts (store_id, biz_date);

-- 1.4 締切(相対・effective_from 型・C②-4/8)
create table if not exists public.staff_shift_deadlines (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id),
  store_id       uuid not null references public.stores(id),
  days_before    int  not null check (days_before between 0 and 60),
  deadline_hm    text not null check (deadline_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  effective_from date not null,
  created_by     uuid references public.memberships(id),
  created_at     timestamptz not null default now(),
  constraint staff_shift_deadlines_uq unique (store_id, effective_from)
);

-- =====================================================================
-- 2. RLS(select のみ・書込は RPC)・ACL(0135 形)
-- =====================================================================
alter table public.staff_shift_patterns  enable row level security;
alter table public.staff_shift_wishes    enable row level security;
alter table public.staff_shifts          enable row level security;
alter table public.staff_shift_deadlines enable row level security;

-- 枠・締切: owner/manager 自店 + 黒服(自店の staff)。cast は不可
drop policy if exists staff_shift_patterns_select on public.staff_shift_patterns;
create policy staff_shift_patterns_select on public.staff_shift_patterns
  for select to authenticated
  using (public.staff_shift_can_manage(store_id)
      or (public.auth_role() = 'staff' and store_id = public.auth_store_id()));

drop policy if exists staff_shift_deadlines_select on public.staff_shift_deadlines;
create policy staff_shift_deadlines_select on public.staff_shift_deadlines
  for select to authenticated
  using (public.staff_shift_can_manage(store_id)
      or (public.auth_role() = 'staff' and store_id = public.auth_store_id()));

-- 希望・確定行: owner/manager 自店全行 + 本人行
drop policy if exists staff_shift_wishes_select on public.staff_shift_wishes;
create policy staff_shift_wishes_select on public.staff_shift_wishes
  for select to authenticated
  using (public.staff_shift_can_manage(store_id) or staff_id = public.auth_membership_id());

drop policy if exists staff_shifts_select on public.staff_shifts;
create policy staff_shifts_select on public.staff_shifts
  for select to authenticated
  using (public.staff_shift_can_manage(store_id) or staff_id = public.auth_membership_id());

revoke all on table public.staff_shift_patterns  from public, anon, authenticated;
revoke all on table public.staff_shift_wishes    from public, anon, authenticated;
revoke all on table public.staff_shifts          from public, anon, authenticated;
revoke all on table public.staff_shift_deadlines from public, anon, authenticated;
grant select on table public.staff_shift_patterns  to authenticated;
grant select on table public.staff_shift_wishes    to authenticated;
grant select on table public.staff_shifts          to authenticated;
grant select on table public.staff_shift_deadlines to authenticated;
grant all on table public.staff_shift_patterns  to service_role;
grant all on table public.staff_shift_wishes    to service_role;
grant all on table public.staff_shifts          to service_role;
grant all on table public.staff_shift_deadlines to service_role;

-- =====================================================================
-- 3. 解決ヘルパー(内部専用): 営業日 D に有効な枠(同名の最大 effective_from)・締切
-- =====================================================================
create or replace function public.staff_pattern_effective(p_pattern_id uuid, p_biz_date date)
returns public.staff_shift_patterns language sql stable security definer set search_path to 'public' as $$
  select q.* from public.staff_shift_patterns q
  where q.store_id = (select p.store_id from public.staff_shift_patterns p where p.id = p_pattern_id)
    and q.name     = (select p.name     from public.staff_shift_patterns p where p.id = p_pattern_id)
    and q.effective_from <= p_biz_date
  order by q.effective_from desc limit 1
$$;
revoke execute on function public.staff_pattern_effective(uuid, date) from public, anon, authenticated, service_role;

-- 希望入力の締切時刻(JST・timestamp)。行なし=既定 3日前 21:00
create or replace function public.staff_shift_deadline_at(p_store_id uuid, p_biz_date date)
returns timestamp language sql stable security definer set search_path to 'public' as $$
  select (p_biz_date - coalesce(d.days_before, 3))::timestamp
       + (coalesce(d.deadline_hm, '21:00') || ':00')::time
  from (select 1) x
  left join lateral (
    select days_before, deadline_hm from public.staff_shift_deadlines
    where store_id = p_store_id and effective_from <= p_biz_date
    order by effective_from desc limit 1
  ) d on true
$$;
revoke execute on function public.staff_shift_deadline_at(uuid, date) from public, anon, authenticated, service_role;

-- =====================================================================
-- 4. RPC(公開 7・SECURITY DEFINER・null-guard→flag→権限・監査 action=RPC 名 C②-11)
-- =====================================================================
-- 4.1 枠の作成
create or replace function public.staff_pattern_set(
  p_store_id uuid, p_name text, p_start_hm text, p_end_hm text, p_effective_from date, p_sort_order int default 0)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid; v_org uuid; v_today date;
begin
  perform public.staff_shift_gate(p_store_id);
  if not public.staff_shift_can_manage(p_store_id) then raise exception 'forbidden'; end if;
  if p_name is null or p_start_hm is null or p_end_hm is null or p_effective_from is null then
    raise exception 'invalid_input';
  end if;
  v_today := public.staff_shift_biz_today(p_store_id);
  if p_effective_from < v_today then raise exception 'effective_from_past'; end if;
  select s.org_id into v_org from public.stores s where s.id = p_store_id;
  insert into public.staff_shift_patterns (org_id, store_id, name, start_hm, end_hm, effective_from, sort_order, created_by)
  values (v_org, p_store_id, p_name, p_start_hm, p_end_hm, p_effective_from, coalesce(p_sort_order, 0), public.auth_membership_id())
  returning id into v_id;
  perform public.audit_log_write('staff_pattern_set', 'staff_shift_patterns:' || v_id::text,
    null, jsonb_build_object('name', p_name, 'start_hm', p_start_hm, 'end_hm', p_end_hm, 'effective_from', p_effective_from),
    p_store_id, null);
  return v_id;
end $$;
revoke execute on function public.staff_pattern_set(uuid, text, text, text, date, int) from public, anon;
grant execute on function public.staff_pattern_set(uuid, text, text, text, date, int) to authenticated, service_role;

-- 4.2 枠の削除(未来行のみ・参照なし)
create or replace function public.staff_pattern_delete(p_pattern_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  r public.staff_shift_patterns%rowtype; v_today date;
begin
  if p_pattern_id is null then raise exception 'invalid_input'; end if;
  select * into r from public.staff_shift_patterns where id = p_pattern_id;
  if not found then raise exception 'not_found'; end if;
  perform public.staff_shift_gate(r.store_id);
  if not public.staff_shift_can_manage(r.store_id) then raise exception 'forbidden'; end if;
  v_today := public.staff_shift_biz_today(r.store_id);
  if r.effective_from <= v_today then raise exception 'effective_from_not_future'; end if;
  if exists (select 1 from public.staff_shifts where pattern_id = p_pattern_id)
     or exists (select 1 from public.staff_shift_wishes where pattern_id = p_pattern_id) then
    raise exception 'pattern_in_use';
  end if;
  delete from public.staff_shift_patterns where id = p_pattern_id;
  perform public.audit_log_write('staff_pattern_delete', 'staff_shift_patterns:' || p_pattern_id::text,
    to_jsonb(r) - 'created_at', null, r.store_id, null);
end $$;
revoke execute on function public.staff_pattern_delete(uuid) from public, anon;
grant execute on function public.staff_pattern_delete(uuid) to authenticated, service_role;

-- 4.3 希望(本人・締切前のみ・upsert)
create or replace function public.staff_wish_set(p_biz_date date, p_pattern_id uuid, p_available boolean, p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_mid uuid; v_store uuid; v_org uuid; v_role text; v_id uuid; v_pat public.staff_shift_patterns;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if p_biz_date is null or p_pattern_id is null or p_available is null then raise exception 'invalid_input'; end if;
  v_mid := public.auth_membership_id(); v_role := public.auth_role(); v_store := public.auth_store_id();
  if v_mid is null or v_store is null then raise exception 'unauthenticated'; end if;
  if v_role = 'cast' then raise exception 'forbidden'; end if;
  perform public.staff_shift_gate(v_store);
  v_pat := public.staff_pattern_effective(p_pattern_id, p_biz_date);
  if v_pat.id is null or v_pat.store_id <> v_store then raise exception 'pattern_not_effective'; end if;
  if (now() at time zone 'Asia/Tokyo') > public.staff_shift_deadline_at(v_store, p_biz_date) then
    raise exception 'deadline_passed';
  end if;
  select s.org_id into v_org from public.stores s where s.id = v_store;
  insert into public.staff_shift_wishes (org_id, store_id, staff_id, biz_date, pattern_id, available, note)
  values (v_org, v_store, v_mid, p_biz_date, v_pat.id, p_available, p_note)
  on conflict (staff_id, biz_date, pattern_id) do update
    set available = excluded.available, note = excluded.note, updated_at = now()
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.staff_wish_set(date, uuid, boolean, text) from public, anon;
grant execute on function public.staff_wish_set(date, uuid, boolean, text) to authenticated, service_role;

-- 4.4 確定行の作成(manager 以上・時刻は枠から写す・希望由来は wish_id)
create or replace function public.staff_shift_propose(p_store_id uuid, p_staff_id uuid, p_biz_date date, p_pattern_id uuid, p_wish_id uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid; v_org uuid; v_pat public.staff_shift_patterns;
begin
  perform public.staff_shift_gate(p_store_id);
  if not public.staff_shift_can_manage(p_store_id) then raise exception 'forbidden'; end if;
  if p_staff_id is null or p_biz_date is null or p_pattern_id is null then raise exception 'invalid_input'; end if;
  if not exists (select 1 from public.memberships m where m.id = p_staff_id and m.store_id = p_store_id and m.is_active and m.role <> 'cast') then
    raise exception 'staff_not_in_store';
  end if;
  v_pat := public.staff_pattern_effective(p_pattern_id, p_biz_date);
  if v_pat.id is null or v_pat.store_id <> p_store_id then raise exception 'pattern_not_effective'; end if;
  if p_wish_id is not null and not exists (
       select 1 from public.staff_shift_wishes w where w.id = p_wish_id and w.staff_id = p_staff_id and w.biz_date = p_biz_date) then
    raise exception 'wish_mismatch';
  end if;
  select s.org_id into v_org from public.stores s where s.id = p_store_id;
  insert into public.staff_shifts (org_id, store_id, staff_id, biz_date, pattern_id, start_hm, end_hm, status, wish_id, created_by)
  values (v_org, p_store_id, p_staff_id, p_biz_date, v_pat.id, v_pat.start_hm, v_pat.end_hm, 'proposed', p_wish_id, public.auth_membership_id())
  returning id into v_id;
  perform public.audit_log_write('staff_shift_propose', 'staff_shifts:' || v_id::text,
    null, jsonb_build_object('staff_id', p_staff_id, 'biz_date', p_biz_date, 'pattern_id', v_pat.id, 'start_hm', v_pat.start_hm, 'end_hm', v_pat.end_hm),
    p_store_id, null);
  return v_id;
end $$;
revoke execute on function public.staff_shift_propose(uuid, uuid, date, uuid, uuid) from public, anon;
grant execute on function public.staff_shift_propose(uuid, uuid, date, uuid, uuid) to authenticated, service_role;

-- 4.5 例外=行の時刻上書き(manager 以上・confirmed 後も可・C②-1)
create or replace function public.staff_shift_override(p_shift_id uuid, p_start_hm text, p_end_hm text, p_reason text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  r public.staff_shifts%rowtype;
begin
  if p_shift_id is null or p_start_hm is null or p_end_hm is null then raise exception 'invalid_input'; end if;
  select * into r from public.staff_shifts where id = p_shift_id;
  if not found then raise exception 'not_found'; end if;
  perform public.staff_shift_gate(r.store_id);
  if not public.staff_shift_can_manage(r.store_id) then raise exception 'forbidden'; end if;
  if r.biz_date < public.staff_shift_biz_today(r.store_id) then raise exception 'biz_date_past'; end if;
  update public.staff_shifts
     set start_hm = p_start_hm, end_hm = p_end_hm,
         override_by = public.auth_membership_id(), override_at = now(), updated_at = now()
   where id = p_shift_id;
  perform public.audit_log_write('staff_shift_override', 'staff_shifts:' || p_shift_id::text,
    jsonb_build_object('start_hm', r.start_hm, 'end_hm', r.end_hm),
    jsonb_build_object('start_hm', p_start_hm, 'end_hm', p_end_hm),
    r.store_id, p_reason);
end $$;
revoke execute on function public.staff_shift_override(uuid, text, text, text) from public, anon;
grant execute on function public.staff_shift_override(uuid, text, text, text) to authenticated, service_role;

-- 4.6 確定(行単位・C②-3。営業日一括は client が行ごとに呼ぶ)
create or replace function public.staff_shift_confirm(p_shift_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  r public.staff_shifts%rowtype;
begin
  if p_shift_id is null then raise exception 'invalid_input'; end if;
  select * into r from public.staff_shifts where id = p_shift_id;
  if not found then raise exception 'not_found'; end if;
  perform public.staff_shift_gate(r.store_id);
  if not public.staff_shift_can_manage(r.store_id) then raise exception 'forbidden'; end if;
  if r.status = 'confirmed' then raise exception 'already_confirmed'; end if;
  update public.staff_shifts
     set status = 'confirmed', confirmed_by = public.auth_membership_id(), confirmed_at = now(), updated_at = now()
   where id = p_shift_id;
  perform public.audit_log_write('staff_shift_confirm', 'staff_shifts:' || p_shift_id::text,
    jsonb_build_object('status', r.status), jsonb_build_object('status', 'confirmed'), r.store_id, null);
end $$;
revoke execute on function public.staff_shift_confirm(uuid) from public, anon;
grant execute on function public.staff_shift_confirm(uuid) to authenticated, service_role;

-- 4.7 締切設定(effective_from 型)
create or replace function public.staff_deadline_set(p_store_id uuid, p_days_before int, p_deadline_hm text, p_effective_from date)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid; v_org uuid;
begin
  perform public.staff_shift_gate(p_store_id);
  if not public.staff_shift_can_manage(p_store_id) then raise exception 'forbidden'; end if;
  if p_days_before is null or p_deadline_hm is null or p_effective_from is null then raise exception 'invalid_input'; end if;
  if p_effective_from < public.staff_shift_biz_today(p_store_id) then raise exception 'effective_from_past'; end if;
  select s.org_id into v_org from public.stores s where s.id = p_store_id;
  insert into public.staff_shift_deadlines (org_id, store_id, days_before, deadline_hm, effective_from, created_by)
  values (v_org, p_store_id, p_days_before, p_deadline_hm, p_effective_from, public.auth_membership_id())
  returning id into v_id;
  perform public.audit_log_write('staff_deadline_set', 'staff_shift_deadlines:' || v_id::text,
    null, jsonb_build_object('days_before', p_days_before, 'deadline_hm', p_deadline_hm, 'effective_from', p_effective_from),
    p_store_id, null);
  return v_id;
end $$;
revoke execute on function public.staff_deadline_set(uuid, int, text, date) from public, anon;
grant execute on function public.staff_deadline_set(uuid, int, text, date) to authenticated, service_role;

-- =====================================================================
-- 5. proof(期待: tables 4 / policies 4 / public_rpc 7 / helpers 6 / flag key 既存)
-- =====================================================================
select
  (select count(*) from pg_tables where schemaname = 'public' and tablename in
     ('staff_shift_patterns','staff_shift_wishes','staff_shifts','staff_shift_deadlines'))                         as tables,
  (select count(*) from pg_policies where schemaname = 'public' and tablename like 'staff_shift%')                  as policies,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in
     ('staff_pattern_set','staff_pattern_delete','staff_wish_set','staff_shift_propose','staff_shift_override','staff_shift_confirm','staff_deadline_set')) as public_rpc,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in
     ('auth_membership_id','staff_shift_can_manage','staff_shift_biz_today','staff_shift_gate','staff_pattern_effective','staff_shift_deadline_at')) as helpers,
  (select relacl::text from pg_class where relname = 'staff_shifts')                                                as staff_shifts_acl;

commit;
