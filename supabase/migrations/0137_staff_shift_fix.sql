-- 0137_staff_shift_fix.sql  (C層② 補正・裁定231〜233・2026-09-09)
-- 前提: 0136 適用済み。0136 は書き換えない(適用済み・手貼りリストに欠陥注記あり)。
-- 内容: ①policy から呼ぶ staff_shift_can_manage に authenticated の execute(裁定231・教訓66)
--       ②staff_shift_biz_today を biz_date_of(0132・既定 06:00) へ委譲(裁定232)
--       ③書込 RPC 6本に課金ゲート逐語行を挿入(裁定233・A8 収載・staff_wish_set は B(i) に残す)
-- 手貼り: SQL Editor で Ctrl+A → Run。末尾 proof で確認。
begin;

-- ① policy 評価は呼出者権限 → authenticated に execute(auth_* 同型)
grant execute on function public.staff_shift_can_manage(uuid) to authenticated;

-- ② 営業日は biz_date_of に一本化(未知 store の 'forbidden' は権限判定後の呼出なので到達しない)
create or replace function public.staff_shift_biz_today(p_store_id uuid)
returns date language sql stable security definer set search_path to 'public' as $$
  select public.biz_date_of(p_store_id, now())
$$;

-- ③ 課金ゲート(段47-1 形 f・auth 後/入力検証前・引数版のみ)
-- 4.1 枠の作成
create or replace function public.staff_pattern_set(
  p_store_id uuid, p_name text, p_start_hm text, p_end_hm text, p_effective_from date, p_sort_order int default 0)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid; v_org uuid; v_today date;
begin
  perform public.staff_shift_gate(p_store_id);
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
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
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
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

-- 4.4 確定行の作成(manager 以上・時刻は枠から写す・希望由来は wish_id)
create or replace function public.staff_shift_propose(p_store_id uuid, p_staff_id uuid, p_biz_date date, p_pattern_id uuid, p_wish_id uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid; v_org uuid; v_pat public.staff_shift_patterns;
begin
  perform public.staff_shift_gate(p_store_id);
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
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
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
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
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
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
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
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
-- proof(期待: can_manage_auth true / biz_today_delegates true / gated 6 / wrapper_calls 0)
-- =====================================================================
select
  (select has_function_privilege('authenticated', 'public.staff_shift_can_manage(uuid)', 'execute')) as can_manage_auth,
  (select prosrc like '%biz_date_of%' from pg_proc where proname = 'staff_shift_biz_today')           as biz_today_delegates,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
     and p.proname in ('staff_pattern_set','staff_pattern_delete','staff_shift_propose','staff_shift_override','staff_shift_confirm','staff_deadline_set')
     and p.prosrc like '%billing locked%')                                                               as gated,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
     and p.proname like 'staff_%' and p.prosrc like '%auth_org_billing_writable%')                     as wrapper_calls;

commit;
