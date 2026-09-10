-- 0138_reopen_flow.sql  (C層③ 解除型統一・設計書 v1 2026-09-10・裁定 C③-1〜18)
-- 前提: 0137 適用済み。0139(関所 16 本・CC 生成)は本 mig の後に適用。
-- 内容: memberships 2 列+ヘルパー / set_staff_perms 7 引数 / daily_reports 9 列 / checks merged /
--       assert_day_open / report_reopen / daily_report_reclose 改修 / cash_diff_approve / check_merge / payroll_reopen 5 引数
-- 出典: docs/tmp/mig0138_live_dump_20260910.md + 本チャット逐語(reclose/payroll_reopen/set_staff_perms)。
-- 手貼り: SQL Editor で Ctrl+A → Run。末尾 proof で確認。
begin;

-- =====================================================================
-- 1. memberships: can_close / can_reopen + ヘルパー(auth_staff_can_shift 同型・authenticated 公開)
-- =====================================================================
alter table public.memberships add column if not exists can_close  boolean not null default false;
alter table public.memberships add column if not exists can_reopen boolean not null default false;

create or replace function public.auth_staff_can_close()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(m.can_close, false) from public.memberships m
  join public.users u on u.id = m.user_id
  where u.auth_user_id = auth.uid() and u.is_active and m.is_active
$$;
create or replace function public.auth_staff_can_reopen()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(m.can_reopen, false) from public.memberships m
  join public.users u on u.id = m.user_id
  where u.auth_user_id = auth.uid() and u.is_active and m.is_active
$$;
revoke execute on function public.auth_staff_can_close()  from public, anon;
revoke execute on function public.auth_staff_can_reopen() from public, anon;
grant execute on function public.auth_staff_can_close()  to authenticated, service_role;
grant execute on function public.auth_staff_can_reopen() to authenticated, service_role;

-- 権限判定(内部専用・RPC 本文からのみ): 締め=owner/manager 自店/staff∧can_close 自店、解除=同 can_reopen
create or replace function public.report_can_close(p_store_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (public.auth_role() = 'owner'
       and exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = public.auth_org_id()))
    or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())
    or (public.auth_role() = 'staff' and p_store_id = public.auth_store_id() and public.auth_staff_can_close()),
    false)
$$;
create or replace function public.report_can_reopen(p_store_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (public.auth_role() = 'owner'
       and exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = public.auth_org_id()))
    or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())
    or (public.auth_role() = 'staff' and p_store_id = public.auth_store_id() and public.auth_staff_can_reopen()),
    false)
$$;
revoke execute on function public.report_can_close(uuid)  from public, anon, authenticated, service_role;
revoke execute on function public.report_can_reopen(uuid) from public, anon, authenticated, service_role;

-- =====================================================================
-- 2. set_staff_perms: 5 引数 → 7 引数(id + 6 boolean 明示・C③-11・#63)
-- =====================================================================
drop function if exists public.set_staff_perms(uuid, boolean, boolean, boolean, boolean);
create or replace function public.set_staff_perms(
  p_membership_id uuid, p_can_register boolean, p_can_crm boolean, p_can_shift boolean, p_can_view_backs boolean,
  p_can_close boolean, p_can_reopen boolean)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.memberships;
begin
  -- fail-closed: 無所属/anon
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 規約7: 6フラグとも明示値必須（coalesce 禁止・null は拒否）
  if p_can_register is null or p_can_crm is null or p_can_shift is null or p_can_view_backs is null
     or p_can_close is null or p_can_reopen is null then
    raise exception 'bad flag';
  end if;

  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if v_row.role <> 'staff' then raise exception 'not a staff'; end if;

  update public.memberships
     set can_register   = p_can_register,
         can_crm        = p_can_crm,
         can_shift      = p_can_shift,
         can_view_backs = p_can_view_backs,
         can_close      = p_can_close,
         can_reopen     = p_can_reopen
   where id = p_membership_id;

  perform public.audit_log_write('set_staff_perms', 'memberships:' || p_membership_id::text,
    to_jsonb(v_row),
    (select to_jsonb(m) from public.memberships m where m.id = p_membership_id),
    v_row.store_id);
end $function$;
revoke execute on function public.set_staff_perms(uuid, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_staff_perms(uuid, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated, service_role;

-- =====================================================================
-- 3. daily_reports: 解除・再締め・差異承認の列(9)   checks: merged
-- =====================================================================
alter table public.daily_reports
  add column if not exists reopened_at      timestamptz,
  add column if not exists reopened_by      uuid references public.memberships(id),
  add column if not exists reopen_reason    text,
  add column if not exists reclosed_at      timestamptz,
  add column if not exists reclosed_by      uuid references public.memberships(id),
  add column if not exists reclose_idem_key uuid,
  add column if not exists diff_reason      text,
  add column if not exists diff_approved_by uuid references public.memberships(id),
  add column if not exists diff_approved_at timestamptz;
alter table public.daily_reports drop constraint if exists daily_reports_reopen_reason_len;
alter table public.daily_reports add constraint daily_reports_reopen_reason_len
  check (reopen_reason is null or length(trim(reopen_reason)) between 1 and 200);
alter table public.daily_reports drop constraint if exists daily_reports_diff_reason_len;
alter table public.daily_reports add constraint daily_reports_diff_reason_len
  check (diff_reason is null or length(trim(diff_reason)) between 1 and 200);
alter table public.daily_reports drop constraint if exists daily_reports_reclose_after_reopen;
alter table public.daily_reports add constraint daily_reports_reclose_after_reopen
  check (reclosed_at is null or reopened_at is not null);

alter table public.checks drop constraint if exists checks_status_check;
alter table public.checks add constraint checks_status_check
  check (status = any (array['open'::text, 'closed'::text, 'void'::text, 'merged'::text]));
alter table public.checks add column if not exists merge_idem_key uuid;

-- =====================================================================
-- 4. 関所ヘルパー(内部専用・0139 で 16 本から呼ぶ・C③-2/15)
--    flag off=無評価。store null=無評価(v_chk null は呼出側の forbidden に任せる)
-- =====================================================================
create or replace function public.assert_day_open(p_store_id uuid, p_biz_date date)
returns void language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_reopened_at timestamptz; v_reclosed_at timestamptz;
begin
  if p_store_id is null or p_biz_date is null then return; end if;
  if not public.flag_enabled('reopen_flow', p_store_id) then return; end if;
  select d.reopened_at, d.reclosed_at into v_reopened_at, v_reclosed_at
    from public.daily_reports d where d.store_id = p_store_id and d.biz_date = p_biz_date;
  if not found then return; end if;
  if v_reopened_at is not null and v_reclosed_at is null then return; end if;  -- 解除中
  raise exception 'day closed';
end $$;
revoke execute on function public.assert_day_open(uuid, date) from public, anon, authenticated, service_role;

-- =====================================================================
-- 5. report_reopen(C③-1/10/11/14)
-- =====================================================================
create or replace function public.report_reopen(p_store_id uuid, p_biz_date date, p_reason text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_org uuid; v_row public.daily_reports; v_before jsonb;
begin
  if p_store_id is null or p_biz_date is null then raise exception 'forbidden'; end if;
  v_org := public.auth_org_id();
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if not public.flag_enabled('reopen_flow', p_store_id) then raise exception 'feature_disabled:reopen_flow'; end if;
  if not public.report_can_reopen(p_store_id) then raise exception 'forbidden'; end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then raise exception 'reason_required'; end if;

  select * into v_row from public.daily_reports
   where store_id = p_store_id and biz_date = p_biz_date and org_id = v_org for update;
  if not found then raise exception 'not closed'; end if;
  if v_row.reopened_at is not null and v_row.reclosed_at is null then raise exception 'already_reopened'; end if;
  v_before := to_jsonb(v_row);

  update public.daily_reports
     set reopened_at = now(), reopened_by = public.auth_membership_id(), reopen_reason = p_reason,
         reclosed_at = null, reclosed_by = null, reclose_idem_key = null
   where id = v_row.id;

  perform public.audit_log_write('report_reopen', 'daily_reports:' || v_row.id::text, v_before,
    (select to_jsonb(d) from public.daily_reports d where d.id = v_row.id), p_store_id, p_reason);
  return v_row.id;
end $function$;
revoke execute on function public.report_reopen(uuid, date, text) from public, anon;
grant execute on function public.report_reopen(uuid, date, text) to authenticated, service_role;

-- =====================================================================
-- 6. daily_report_reclose: 7 引数 → 8 引数(末尾 p_idem_key default null・C③-3)
--    flag on=解除中のみ・reclosed_* 記録・冪等。flag off=現行どおり(解除なし上書き)。権限は report_can_close(C③-11)
-- =====================================================================
drop function if exists public.daily_report_reclose(uuid, integer, integer, integer, integer, text, boolean);
create or replace function public.daily_report_reclose(
  p_report_id uuid, p_expense integer default null, p_cash_payout integer default null, p_cash_float integer default null,
  p_counted_cash integer default null, p_note text default null, p_force boolean default false, p_idem_key uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_row record; v_agg jsonb; v_before jsonb; v_diff int; v_ar int;
  v_expense int; v_payout int; v_float int; v_counted int; v_flag boolean;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_row from public.daily_reports where id = p_report_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not public.report_can_close(v_row.store_id) then raise exception 'forbidden'; end if;
  v_flag := public.flag_enabled('reopen_flow', v_row.store_id);
  if v_flag then
    -- 冪等: 同一キーで既に再締め済みなら静かに返す
    if p_idem_key is not null and v_row.reclose_idem_key is not distinct from p_idem_key and v_row.reclosed_at is not null then
      return p_report_id;
    end if;
    if not (v_row.reopened_at is not null and v_row.reclosed_at is null) then raise exception 'not_reopened'; end if;
  end if;
  v_before := to_jsonb(v_row);

  -- 再集計は凍結済みの cutoff / rate を使う（範囲定義・税率は初回締めから不変）
  v_agg := public.daily_report_aggregate(v_row.store_id, v_row.biz_date, v_row.biz_cutoff_hm, v_row.card_tax_rate);
  v_ar  := (v_agg->>'ar_collected')::int;
  if (v_agg->>'open_checks')::int > 0 and not p_force then
    raise exception 'open checks remain';
  end if;

  v_expense := coalesce(p_expense, v_row.expense);
  v_payout  := coalesce(p_cash_payout, v_row.cash_payout);
  v_float   := coalesce(p_cash_float, v_row.cash_float);
  v_counted := coalesce(p_counted_cash, v_row.counted_cash);
  if v_expense < 0 or v_payout < 0 or v_float < 0 or (v_counted is not null and v_counted < 0) then
    raise exception 'bad amount';
  end if;
  v_diff := case when v_counted is null then null
                 else v_counted - (v_float + (v_agg->>'cash')::int + v_ar - v_expense - v_payout) end;

  update public.daily_reports set
    cash = (v_agg->>'cash')::int, card_gross = (v_agg->>'card')::int, card_tax = (v_agg->>'card_tax')::int,
    uri = (v_agg->>'uri')::int, other = (v_agg->>'other')::int, drink_sales = (v_agg->>'drink_sales')::int,
    dohan_checks = (v_agg->>'dohan_checks')::int, slips = (v_agg->>'slips')::int, guests = (v_agg->>'guests')::int,
    open_checks_count = (v_agg->>'open_checks')::int, ar_collected = v_ar,
    expense = v_expense, cash_payout = v_payout, cash_float = v_float,
    counted_cash = v_counted, diff = v_diff,
    note = coalesce(p_note, note),
    reclosed_count = reclosed_count + 1,
    reclosed_at = case when v_flag then now() else reclosed_at end,
    reclosed_by = case when v_flag then public.auth_membership_id() else reclosed_by end,
    reclose_idem_key = case when v_flag then p_idem_key else reclose_idem_key end,
    -- 差異が動いたら承認は無効(再承認が要る)
    diff_reason = case when v_diff is distinct from v_row.diff then null else diff_reason end,
    diff_approved_by = case when v_diff is distinct from v_row.diff then null else diff_approved_by end,
    diff_approved_at = case when v_diff is distinct from v_row.diff then null else diff_approved_at end
  where id = p_report_id;
  perform public.audit_log_write('daily_report_reclose', 'daily_reports:' || p_report_id::text, v_before,
    (select to_jsonb(d) from public.daily_reports d where d.id = p_report_id), v_row.store_id);
  return p_report_id;
end $function$;
revoke execute on function public.daily_report_reclose(uuid, integer, integer, integer, integer, text, boolean, uuid) from public, anon;
grant execute on function public.daily_report_reclose(uuid, integer, integer, integer, integer, text, boolean, uuid) to authenticated, service_role;

-- =====================================================================
-- 7. cash_diff_approve(C③-4/11/14/18)
-- =====================================================================
create or replace function public.cash_diff_approve(p_store_id uuid, p_biz_date date, p_reason text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_org uuid; v_row public.daily_reports; v_before jsonb;
begin
  if p_store_id is null or p_biz_date is null then raise exception 'forbidden'; end if;
  v_org := public.auth_org_id();
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if not public.flag_enabled('reopen_flow', p_store_id) then raise exception 'feature_disabled:reopen_flow'; end if;
  if not public.report_can_close(p_store_id) then raise exception 'forbidden'; end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then raise exception 'reason_required'; end if;

  select * into v_row from public.daily_reports
   where store_id = p_store_id and biz_date = p_biz_date and org_id = v_org for update;
  if not found then raise exception 'not closed'; end if;
  if v_row.reopened_at is not null and v_row.reclosed_at is null then raise exception 'reopened'; end if;
  if v_row.counted_cash is null then raise exception 'not_counted'; end if;
  if coalesce(v_row.diff, 0) = 0 then raise exception 'no_diff'; end if;
  if v_row.diff_approved_at is not null then raise exception 'already_approved'; end if;
  v_before := to_jsonb(v_row);

  update public.daily_reports
     set diff_reason = p_reason, diff_approved_by = public.auth_membership_id(), diff_approved_at = now()
   where id = v_row.id;

  perform public.audit_log_write('cash_diff_approve', 'daily_reports:' || v_row.id::text, v_before,
    (select to_jsonb(d) from public.daily_reports d where d.id = v_row.id), p_store_id, p_reason);
  return v_row.id;
end $function$;
revoke execute on function public.cash_diff_approve(uuid, date, text) from public, anon;
grant execute on function public.cash_diff_approve(uuid, date, text) to authenticated, service_role;

-- =====================================================================
-- 8. check_merge(C③-6/7/8/14)  from → into。open 同士・money なし・重複 cast なし・全 line A 群
-- =====================================================================
create or replace function public.check_merge(p_from_check_id uuid, p_into_check_id uuid, p_reason text, p_idem_key uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_org uuid; v_from public.checks; v_into public.checks; v_lines int; v_noms int; v_seats int;
begin
  if p_from_check_id is null or p_into_check_id is null or p_idem_key is null then raise exception 'forbidden'; end if;
  v_org := public.auth_org_id();
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_from_check_id = p_into_check_id then raise exception 'forbidden'; end if;

  select * into v_from from public.checks where id = p_from_check_id for update;
  if not found then raise exception 'forbidden'; end if;
  select * into v_into from public.checks where id = p_into_check_id for update;
  if not found then raise exception 'forbidden'; end if;
  if v_from.store_id <> v_into.store_id then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.stores s where s.id = v_from.store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;

  if not public.flag_enabled('reopen_flow', v_from.store_id) then raise exception 'feature_disabled:reopen_flow'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_from.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then raise exception 'reason_required'; end if;

  -- 冪等: 同一キーで既に merged なら into を返す
  if v_from.status = 'merged' and v_from.merge_idem_key is not distinct from p_idem_key and v_from.merged_into = p_into_check_id then
    return p_into_check_id;
  end if;

  if v_from.status <> 'open' or v_into.status <> 'open' then raise exception 'merge_conflict:status'; end if;
  if exists (select 1 from public.payments where check_id in (p_from_check_id, p_into_check_id))
     or exists (select 1 from public.receivables where check_id in (p_from_check_id, p_into_check_id)) then
    raise exception 'merge_conflict:money';
  end if;
  if exists (select 1 from public.check_nominations a join public.check_nominations b on a.cast_id = b.cast_id
              where a.check_id = p_from_check_id and b.check_id = p_into_check_id) then
    raise exception 'merge_conflict:cast';
  end if;
  if exists (select 1 from public.check_lines l where l.check_id in (p_from_check_id, p_into_check_id) and l.pay_group <> 'A') then
    raise exception 'merge_conflict:pay_group';
  end if;

  select count(*) into v_lines from public.check_lines where check_id = p_from_check_id;
  select count(*) into v_noms  from public.check_nominations where check_id = p_from_check_id;
  select count(*) into v_seats from public.check_seats where check_id = p_from_check_id;

  update public.check_lines       set check_id = p_into_check_id where check_id = p_from_check_id;
  update public.check_nominations set check_id = p_into_check_id where check_id = p_from_check_id;
  update public.check_seats       set check_id = p_into_check_id where check_id = p_from_check_id;
  update public.checks set status = 'merged', merged_into = p_into_check_id, merge_idem_key = p_idem_key
   where id = p_from_check_id;
  perform public.check_recalc(p_into_check_id);

  perform public.audit_log_write('check_merge', 'checks:' || p_into_check_id::text,
    jsonb_build_object('from', p_from_check_id, 'into', p_into_check_id, 'from_total', v_from.total, 'into_total', v_into.total),
    jsonb_build_object('moved_lines', v_lines, 'moved_nominations', v_noms, 'moved_seats', v_seats,
                       'into_total', (select c.total from public.checks c where c.id = p_into_check_id)),
    v_from.store_id, p_reason);
  return p_into_check_id;
end $function$;
revoke execute on function public.check_merge(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.check_merge(uuid, uuid, text, uuid) to authenticated, service_role;

-- =====================================================================
-- 9. payroll_reopen: 4 引数 → 5 引数(末尾 p_reason・default なし・C③-5/13)。service 経路のみ
--    flag は org/store 明示で解決(auth.uid() なし文脈のため flag_enabled は使えない)
-- =====================================================================
drop function if exists public.payroll_reopen(uuid, uuid, uuid, uuid);
create or replace function public.payroll_reopen(p_org_id uuid, p_actor uuid, p_run_id uuid, p_idem_key uuid, p_reason text)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare
  v_org         uuid;
  v_store       uuid;
  v_status      text;
  v_reopen_idem uuid;
  v_fin_idem    uuid;
  v_old_ps      date;
  v_old_pe      date;
  v_retired     jsonb;
  v_arrec   jsonb;
  v_advrec  jsonb;
  v_okrec   jsonb;
  v_rolled      jsonb;
  v_rolled_adv  jsonb;
  v_rolled_ok   jsonb;
  v_flag        boolean;
begin
  select org_id, store_id, status, reopen_idem_key, finalize_idem_key, period_start, period_end
    into v_org, v_store, v_status, v_reopen_idem, v_fin_idem, v_old_ps, v_old_pe
    from public.payroll_runs where id = p_run_id;
  if v_org is null then raise exception 'run not found'; end if;
  if p_org_id is null or v_org <> p_org_id then raise exception 'forbidden'; end if;

  -- reopen_flow(店舗行 → org 行 → false)
  select f.enabled into v_flag from public.feature_flags f where f.org_id = v_org and f.store_id = v_store and f.key = 'reopen_flow';
  if v_flag is null then
    select f.enabled into v_flag from public.feature_flags f where f.org_id = v_org and f.store_id is null and f.key = 'reopen_flow';
  end if;
  if not coalesce(v_flag, false) then raise exception 'feature_disabled:reopen_flow'; end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then raise exception 'reason_required'; end if;

  if v_status = 'paid' then raise exception 'run paid'; end if;

  if p_idem_key is not null and v_status = 'draft' and v_reopen_idem is not distinct from p_idem_key then
    return 'draft';
  end if;

  if v_status <> 'finalized' then raise exception 'not finalized'; end if;

  if exists (select 1 from public.payment_records pr where pr.run_id = p_run_id) then
    raise exception 'payments exist';
  end if;

  select jsonb_agg(jsonb_build_object('cast_id', ps.cast_id, 'net', ps.net, 'breakdown', ps.breakdown_json))
    into v_retired from public.payslips ps where ps.run_id = p_run_id;

  v_rolled := '[]'::jsonb;
  for v_arrec in
    select ae from public.payslips ps,
      lateral jsonb_array_elements(coalesce(ps.breakdown_json->'ar', '[]'::jsonb)) ae
    where ps.run_id = p_run_id
  loop
    update public.receivables r
       set status = v_arrec->>'prev_status',
           deduct_period = nullif(v_arrec->>'prev_deduct_period', ''),
           deducted_amount = (v_arrec->>'prev_deducted_amount')::int
     where r.id = (v_arrec->>'receivable_id')::uuid
       and r.status = v_arrec->>'applied_status'
       and r.deducted_amount = (v_arrec->>'applied_deducted_amount')::int
       and r.deduct_period is not distinct from nullif(v_arrec->>'applied_deduct_period', '');
    if found then v_rolled := v_rolled || v_arrec; end if;
  end loop;
  v_rolled_adv := '[]'::jsonb;
  for v_advrec in
    select ae from public.payslips ps,
      lateral jsonb_array_elements(coalesce(ps.breakdown_json->'adv', '[]'::jsonb)) ae
    where ps.run_id = p_run_id
  loop
    update public.advances a
       set status = v_advrec->>'prev_status',
           deduct_period = nullif(v_advrec->>'prev_deduct_period', ''),
           deducted_amount = (v_advrec->>'prev_deducted_amount')::int
     where a.id = (v_advrec->>'advance_id')::uuid
       and a.status = v_advrec->>'applied_status'
       and a.deducted_amount = (v_advrec->>'applied_deducted_amount')::int
       and a.deduct_period is not distinct from nullif(v_advrec->>'applied_deduct_period', '');
    if found then v_rolled_adv := v_rolled_adv || v_advrec; end if;
  end loop;
  v_rolled_ok := '[]'::jsonb;
  for v_okrec in
    select ae from public.payslips ps,
      lateral jsonb_array_elements(coalesce(ps.breakdown_json->'okuri', '[]'::jsonb)) ae
    where ps.run_id = p_run_id
  loop
    update public.transport t
       set status = v_okrec->>'prev_status',
           deducted_amount = (v_okrec->>'prev_deducted_amount')::int
     where t.id = (v_okrec->>'transport_id')::uuid
       and t.status = v_okrec->>'applied_status'
       and t.deducted_amount = (v_okrec->>'applied_deducted_amount')::int;
    if found then v_rolled_ok := v_rolled_ok || v_okrec; end if;
  end loop;

  delete from public.payslips where run_id = p_run_id;

  update public.payroll_runs
     set status = 'draft', finalized_at = null, finalize_idem_key = null,
         period_start = null, period_end = null,
         reopen_idem_key = p_idem_key
   where id = p_run_id;

  perform public.audit_log_write_service(v_org, p_actor, 'payroll_reopen',
    'payroll_runs:' || p_run_id::text,
    jsonb_build_object('retired_payslips', coalesce(v_retired, '[]'::jsonb),
                       'old_finalize_idem_key', v_fin_idem,
                       'old_period_start', v_old_ps, 'old_period_end', v_old_pe,
                       'rolled_back_receivables', v_rolled,
                       'rolled_back_advances', v_rolled_adv,
                       'rolled_back_transport', v_rolled_ok),
    jsonb_build_object('status', 'draft', 'reopen_idem_key', p_idem_key),
    v_store, p_reason);
  return 'reopened';
end $function$;
revoke execute on function public.payroll_reopen(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.payroll_reopen(uuid, uuid, uuid, uuid, text) to service_role;

-- =====================================================================
-- 10. proof(期待: cols 11 / status_check_merged true / helpers 5 / rpc 6 / old_sigs 0 / gated 3)
-- =====================================================================
select
  (select count(*) from information_schema.columns where table_schema='public' and
     ((table_name='memberships' and column_name in ('can_close','can_reopen')) or
      (table_name='daily_reports' and column_name in ('reopened_at','reopened_by','reopen_reason','reclosed_at','reclosed_by','reclose_idem_key','diff_reason','diff_approved_by','diff_approved_at')))) as cols,
  (select pg_get_constraintdef(oid) like '%merged%' from pg_constraint where conname='checks_status_check') as status_check_merged,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
     ('auth_staff_can_close','auth_staff_can_reopen','report_can_close','report_can_reopen','assert_day_open')) as helpers,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and
     (p.proname in ('report_reopen','cash_diff_approve','check_merge') or (p.proname='daily_report_reclose' and p.pronargs=8)
      or (p.proname='payroll_reopen' and p.pronargs=5) or (p.proname='set_staff_perms' and p.pronargs=7))) as rpc,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and
     ((p.proname='daily_report_reclose' and p.pronargs=7) or (p.proname='payroll_reopen' and p.pronargs=4) or (p.proname='set_staff_perms' and p.pronargs=5))) as old_sigs,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
     ('report_reopen','cash_diff_approve','check_merge') and p.prosrc like '%billing locked%') as gated;

commit;
