-- 0183_shift_staff_reservation_guest_norm_intent.sql — 便 M（2026-10-26 起草・適用は Agoora 手貼り＝流していない）
-- 翻訳元: live pg_get_functiondef（2026-10-26 16:5x・14 本）＋生成器 docs/tmp/gen_0183.cjs の文字列（手打ちなし）。
--   ★1 裁定429（Agoora 確定 10/26 ⑦）: シフトの 11 本（shift_set／shift_remove／shift_confirm_bulk／shift_propose／shift_period_set／shift_period_remove／shift_wish_decide／shift_bulk_set_daily／set_staffing_need／staffing_need_remove／shift_period_needs_set）
--        ＝自店の staff で can_shift（auth_staff_can_shift()）なら manager と同じ（読取専用の段階は作らない）。owner／manager は不変・cast は不可のまま。
--   ★2 M-4（確定 ⑤）: reservation_request_guest（新設・キャスト本人・仮の呼び名＋人数）・reservation_to_check（来店時に顧客カルテを作って紐づけ＝担当＝申請したキャスト）。
--   ★3 M-7（確定 ⑥）: norm_shortfall_intents（新表・run × cast で 1 行＝適用／除外の意思）・norm_shortfall_decide が upsert（戻り値＝audit の id は不変）。金額は確定時に最新で再計算（finalize route）。
--   ★5 M-14（Agoora 10/26）: shift_set＝定休日に実際に出勤した過去日（今日まで）は理由つきでシフトにできる（勤怠の「シフトとして確定」）・未来の定休日は従来どおり closed day。
--   ★4 裁定432（Agoora 確定 10/26）: 源泉区分（cast_tax_profiles／staff_contracts.withholding_kind）・委託の額の指定（payroll_withholding_overrides）・社員の控除（payroll_employee_deductions）・RPC 3 本＋内部 2 本。
--   client はフラグ（lib/nox/rules-0175/flag.ts の SHIFT_STAFF_PERM_APPLIED／RESERVATION_GUEST_APPLIED／NORM_INTENT_APPLIED）＝手貼り後に true。
-- 検証（Success の後・形で見る）: 末尾 ===== verify =====。
begin;
select 'nox-project-proof', count(*) from public.orgs;   -- 貼り先証明（hiqbfagmkrdpmlqhkmsu）

-- ═══ ★3 表（M-7） ═══
create table if not exists public.norm_shortfall_intents (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  store_id   uuid not null references public.stores(id) on delete cascade,
  run_id     uuid not null references public.payroll_runs(id) on delete cascade,
  cast_id    uuid not null references public.casts(id) on delete cascade,
  action     text not null check (action in ('apply','exclude')),
  reason     text check (reason is null or length(reason) <= 200),
  detail     jsonb not null default '{}'::jsonb,
  decided_by uuid references public.users(id),
  decided_at timestamptz not null default now(),
  constraint norm_shortfall_intents_uq unique (run_id, cast_id)
);
alter table public.norm_shortfall_intents enable row level security;
drop policy if exists norm_shortfall_intents_select on public.norm_shortfall_intents;
create policy norm_shortfall_intents_select on public.norm_shortfall_intents for select to authenticated using (org_id = public.auth_org_id() and public.auth_role() in ('owner','manager') and (public.auth_role() = 'owner' or store_id = public.auth_store_id()));
revoke all on table public.norm_shortfall_intents from public, anon, authenticated;
grant select on table public.norm_shortfall_intents to authenticated;
comment on table public.norm_shortfall_intents is '★0183（M-7・Agoora 確定 10/26 ⑥）: ノルマ未達の減額の意思（適用／除外）＝金額は確定時に最新で再計算';

-- ═══ ★1 シフト 11 本（裁定429） ═══
CREATE OR REPLACE FUNCTION public.shift_set(p_id uuid, p_cast_id uuid, p_date date, p_start_hm text, p_end_hm text, p_status text, p_override_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast record; v_actor uuid; v_id uuid; v_before jsonb;
  v_unavail boolean; v_reason text;  -- ★0125 裁定112 判断F
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_date is null then raise exception 'bad date'; end if;
  if p_start_hm is null or p_start_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_end_hm   is null or p_end_hm   !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_status is null or p_status not in ('planned','proposed','confirmed') then raise exception 'bad status'; end if;
  if p_override_reason is not null and length(p_override_reason) > 200 then raise exception 'bad reason'; end if;  -- ★0125
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or ((public.auth_role() = 'manager' or (public.auth_role() = 'staff' and public.auth_staff_can_shift())) and v_cast.store_id = public.auth_store_id())  /* ★0183（裁定429）: シフト ON のスタッフは店長と同じ */) then
    raise exception 'forbidden';
  end if;
  -- ★B-5②: 定休日ハード拒否(create/update 共通・ロール照合の後=他店曜日の probing 防止)
  if public.shift_is_closed_day(v_cast.store_id, p_date)
     and not (p_override_reason is not null and btrim(p_override_reason) <> '' and p_date <= public.biz_date_of(v_cast.store_id, now())) then   -- ★0183 ★5（M-14）: 定休日の実出勤（過去日・理由つき）は可
    raise exception 'closed day';
  end if;
  -- ★0125 裁定112 判断F: 出勤不可はソフト拒否(定休日=ハードとの非対称)。理由付きで押し切り可・理由は不可日のみ保存
  v_unavail := exists (select 1 from public.cast_unavailable_days u
                        where u.cast_id = p_cast_id and u.date = p_date);
  if v_unavail and (p_override_reason is null or btrim(p_override_reason) = '') then
    raise exception 'unavailable';
  end if;
  v_reason := case when v_unavail or public.shift_is_closed_day(v_cast.store_id, p_date) then p_override_reason else null end;   -- ★0183 ★5: 定休日の実出勤も理由を残す
  -- ★0103 SD-9: 1日1枠(同一 cast・同一 date)。制約 shifts_cast_date_key が最終防衛
  if exists (select 1 from public.shifts s
              where s.cast_id = p_cast_id and s.date = p_date
                and (p_id is null or s.id <> p_id)) then
    raise exception 'duplicate';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if p_id is null then
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, created_by, override_reason)
    values (v_cast.org_id, v_cast.store_id, p_cast_id, p_date, p_start_hm, p_end_hm, p_status, v_actor, v_reason)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(s) into v_before from public.shifts s
      where s.id = p_id and s.org_id = public.auth_org_id() and s.cast_id = p_cast_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.shifts
       set date = p_date, start_hm = p_start_hm, end_hm = p_end_hm, status = p_status,
           override_reason = v_reason  -- ★0125: 日付変更で不可でなくなれば null へ
     where id = p_id and org_id = public.auth_org_id();
    v_id := p_id;
  end if;
  perform public.audit_log_write('shift_set', 'shifts:' || v_id::text, v_before,
    (select to_jsonb(s) from public.shifts s where s.id = v_id), v_cast.store_id);
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.shift_remove(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_s record; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_id is null then raise exception 'bad id'; end if;
  select * into v_s from public.shifts where id = p_id;
  if v_s.id is null or v_s.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or ((public.auth_role() = 'manager' or (public.auth_role() = 'staff' and public.auth_staff_can_shift())) and v_s.store_id = public.auth_store_id())  /* ★0183（裁定429）: シフト ON のスタッフは店長と同じ */) then
    raise exception 'forbidden';
  end if;
  if v_s.status = 'confirmed'
     and exists (select 1 from public.attendance a where a.cast_id = v_s.cast_id and a.date = v_s.date) then
    raise exception 'has attendance';
  end if;
  select to_jsonb(s) into v_before from public.shifts s where s.id = p_id;
  -- wish 復元は delete の前（shift_auto_clear と同型）
  update public.shift_wishes w
     set status = 'pending', decided_by = null, decided_at = null
   where w.id = v_s.wish_id and v_s.wish_id is not null and w.org_id = public.auth_org_id();
  delete from public.shifts where id = p_id and org_id = public.auth_org_id();
  perform public.audit_log_write('shift_remove', 'shifts:' || p_id::text, v_before, null, v_s.store_id);
  return p_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.shift_confirm_bulk(p_shift_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ids uuid[]; v_bad int; v_cnt int; v_store uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_shift_ids is null or coalesce(array_length(p_shift_ids,1),0) = 0 then
    raise exception 'bad ids';
  end if;
  select array_agg(distinct x) into v_ids from unnest(p_shift_ids) as x;  -- 重複除去
  if array_length(v_ids,1) > 62 then raise exception 'too many'; end if;
  select count(*) into v_bad
    from unnest(v_ids) as t(id)
    left join public.shifts s on s.id = t.id
   where s.id is null
      or s.org_id <> public.auth_org_id()
      or s.status not in ('planned','proposed')
      or not (public.auth_role() = 'owner'
              or ((public.auth_role() = 'manager' or (public.auth_role() = 'staff' and public.auth_staff_can_shift())) and s.store_id = public.auth_store_id())  /* ★0183（裁定429）: シフト ON のスタッフは店長と同じ */);
  if v_bad > 0 then raise exception 'bad rows: %', v_bad; end if;
  select s.store_id into v_store from public.shifts s where s.id = v_ids[1];
  update public.shifts
     set status = 'confirmed'
   where id = any(v_ids) and org_id = public.auth_org_id()
     and status in ('planned','proposed');
  get diagnostics v_cnt = row_count;
  if v_cnt <> array_length(v_ids,1) then raise exception 'concurrent change'; end if;
  perform public.audit_log_write('shift_confirm_bulk', 'shifts:bulk', null,
    jsonb_build_object('ids', to_jsonb(v_ids), 'count', v_cnt), v_store);
  return v_cnt;
end
$function$;

CREATE OR REPLACE FUNCTION public.shift_propose(p_shift_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ids uuid[]; v_bad int; v_cnt int; v_store uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_shift_ids is null or coalesce(array_length(p_shift_ids,1),0) = 0 then
    raise exception 'bad ids';
  end if;
  select array_agg(distinct x) into v_ids from unnest(p_shift_ids) as x;  -- 重複除去
  select count(*) into v_bad
    from unnest(v_ids) as t(id)
    left join public.shifts s on s.id = t.id
   where s.id is null
      or s.org_id <> public.auth_org_id()
      or s.status <> 'planned'
      or not (public.auth_role() = 'owner'
              or ((public.auth_role() = 'manager' or (public.auth_role() = 'staff' and public.auth_staff_can_shift())) and s.store_id = public.auth_store_id())  /* ★0183（裁定429）: シフト ON のスタッフは店長と同じ */);
  if v_bad > 0 then raise exception 'bad rows: %', v_bad; end if;
  select s.store_id into v_store from public.shifts s where s.id = v_ids[1];
  update public.shifts
     set status = 'proposed'
   where id = any(v_ids) and org_id = public.auth_org_id() and status = 'planned';
  get diagnostics v_cnt = row_count;
  if v_cnt <> array_length(v_ids,1) then raise exception 'concurrent change'; end if;
  perform public.audit_log_write('shift_propose', 'shifts:bulk', null,
    jsonb_build_object('ids', to_jsonb(v_ids), 'count', v_cnt), v_store);
  return v_cnt;
end
$function$;

CREATE OR REPLACE FUNCTION public.shift_period_set(p_id uuid, p_store_id uuid, p_start_date date, p_end_date date, p_wish_deadline date, p_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record; v_actor uuid; v_id uuid; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_start_date is null or p_end_date is null then raise exception 'bad date'; end if;
  if p_start_date > p_end_date then raise exception 'bad range'; end if;
  if p_status is null or p_status not in ('draft','open','closed','published') then raise exception 'bad status'; end if;
  select * into v_store from public.stores where id = p_store_id;
  if v_store.id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or ((public.auth_role() = 'manager' or (public.auth_role() = 'staff' and public.auth_staff_can_shift())) and p_store_id = public.auth_store_id())  /* ★0183（裁定429）: シフト ON のスタッフは店長と同じ */) then
    raise exception 'forbidden';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if p_id is null then
    begin
      insert into public.shift_periods (org_id, store_id, start_date, end_date, wish_deadline, status, created_by)
      values (v_store.org_id, p_store_id, p_start_date, p_end_date, p_wish_deadline, p_status, v_actor)
      returning id into v_id;
    exception when exclusion_violation then
      raise exception 'overlap';
    end;
    v_before := null;
  else
    select to_jsonb(p) into v_before from public.shift_periods p
      where p.id = p_id and p.org_id = public.auth_org_id() and p.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    begin
      update public.shift_periods
         set start_date = p_start_date, end_date = p_end_date,
             wish_deadline = p_wish_deadline, status = p_status
       where id = p_id and org_id = public.auth_org_id();
    exception when exclusion_violation then
      raise exception 'overlap';
    end;
    v_id := p_id;
  end if;
  perform public.audit_log_write('shift_period_set', 'shift_periods:' || v_id::text, v_before,
    (select to_jsonb(p) from public.shift_periods p where p.id = v_id), p_store_id);
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.shift_period_remove(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_row from public.shift_periods where id = p_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or ((public.auth_role() = 'manager' or (public.auth_role() = 'staff' and public.auth_staff_can_shift())) and v_row.store_id = public.auth_store_id())  /* ★0183（裁定429）: シフト ON のスタッフは店長と同じ */) then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from public.shifts s where s.period_id = p_id) then
    raise exception 'period in use';
  end if;
  delete from public.shift_periods where id = p_id and org_id = public.auth_org_id();
  perform public.audit_log_write('shift_period_remove', 'shift_periods:' || p_id::text,
    to_jsonb(v_row), null, v_row.store_id);
  return p_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.shift_wish_decide(p_wish_id uuid, p_accept boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wish record; v_actor uuid; v_shift uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_accept is null then raise exception 'bad accept'; end if;
  select * into v_wish from public.shift_wishes where id = p_wish_id;
  if v_wish.id is null or v_wish.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or ((public.auth_role() = 'manager' or (public.auth_role() = 'staff' and public.auth_staff_can_shift())) and v_wish.store_id = public.auth_store_id())  /* ★0183（裁定429）: シフト ON のスタッフは店長と同じ */) then
    raise exception 'forbidden';
  end if;
  if v_wish.status <> 'pending' then raise exception 'already decided'; end if;
  if p_accept and v_wish.kind = 'off' then raise exception 'off wish'; end if;   -- ★4 0160（326-7）: 休み希望はシフト案にならない（reject は可）
  -- ★B-5②: accept のみ定休日ハード拒否（提出後に定休日設定された競合の防波堤・reject は定休日でも可・wish は pending のまま）
  if p_accept and public.shift_is_closed_day(v_wish.store_id, v_wish.date) then
    raise exception 'closed day';
  end if;
  -- ★0103 SD-9: accept は同日既存 shift があれば拒否（wish は pending のまま）
  if p_accept and exists (select 1 from public.shifts s
                           where s.cast_id = v_wish.cast_id and s.date = v_wish.date) then
    raise exception 'duplicate';
  end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.shift_bulk_set_daily(p_cast_id uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast record; v_actor uuid; v_elem jsonb; v_d date; v_s text; v_e text; v_r text;
  v_id uuid; v_ins int := 0; v_ids uuid[] := '{}';
  v_skip jsonb := '[]'::jsonb; v_seen date[] := '{}';
  v_unavail boolean;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'bad items'; end if;
  if jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('inserted', 0, 'skipped', '[]'::jsonb);  -- ★完全 no-op(bulk_set 同型)
  end if;
  if jsonb_array_length(p_items) > 62 then raise exception 'too many dates'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or ((public.auth_role() = 'manager' or (public.auth_role() = 'staff' and public.auth_staff_can_shift())) and v_cast.store_id = public.auth_store_id())  /* ★0183（裁定429）: シフト ON のスタッフは店長と同じ */) then
    raise exception 'forbidden';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  for v_elem in select * from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_elem) <> 'object' then raise exception 'bad items'; end if;
    begin
      v_d := (v_elem ->> 'date')::date;
    exception when others then
      raise exception 'bad date';
    end;
    if v_d is null then raise exception 'bad date'; end if;
    if v_d = any (v_seen) then raise exception 'dup date'; end if;  -- 同一 items 内の重複は入力不正
    v_seen := v_seen || v_d;
    v_s := v_elem ->> 'start_hm';
    v_e := v_elem ->> 'end_hm';
    if v_s is null or v_s !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad time'; end if;
    if v_e is null or v_e !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad time'; end if;
    v_r := v_elem ->> 'override_reason';
    if v_r is not null and length(v_r) > 200 then raise exception 'bad reason'; end if;

    if public.shift_is_closed_day(v_cast.store_id, v_d) then
      v_skip := v_skip || jsonb_build_object('date', v_d, 'reason', 'closed');
      continue;
    end if;
    if exists (select 1 from public.shifts s where s.cast_id = p_cast_id and s.date = v_d) then
      v_skip := v_skip || jsonb_build_object('date', v_d, 'reason', 'duplicate');
      continue;
    end if;
    v_unavail := exists (select 1 from public.cast_unavailable_days u
                          where u.cast_id = p_cast_id and u.date = v_d);
    if v_unavail and (v_r is null or btrim(v_r) = '') then
      v_skip := v_skip || jsonb_build_object('date', v_d, 'reason', 'unavailable');
      continue;
    end if;
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, source, created_by, override_reason)
    values (v_cast.org_id, v_cast.store_id, p_cast_id, v_d, v_s, v_e, 'planned', 'manual', v_actor,
            case when v_unavail then v_r else null end)
    returning id into v_id;
    v_ids := v_ids || v_id;
    v_ins := v_ins + 1;
  end loop;

  perform public.audit_log_write('shift_bulk_set_daily', 'casts:' || p_cast_id::text, null,
    jsonb_build_object('inserted', v_ins, 'shift_ids', to_jsonb(v_ids), 'skipped', v_skip),
    v_cast.store_id);
  return jsonb_build_object('inserted', v_ins, 'skipped', v_skip);
end $function$;

CREATE OR REPLACE FUNCTION public.set_staffing_need(p_store_id uuid, p_dow integer, p_required integer, p_from_min integer DEFAULT 0, p_to_min integer DEFAULT 1440)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid; v_before jsonb; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_dow is null or p_dow < 0 or p_dow > 6 then raise exception 'bad dow'; end if;
  if p_required is null or p_required < 0 then raise exception 'bad required'; end if;
  -- ★mig0095: 時間帯バンド検証（0..1440・from < to）
  if p_from_min is null or p_to_min is null
     or p_from_min < 0 or p_to_min > 1440 or p_from_min >= p_to_min then
    raise exception 'bad band';
  end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or ((public.auth_role() = 'manager' or (public.auth_role() = 'staff' and public.auth_staff_can_shift())) and p_store_id = public.auth_store_id())  /* ★0183（裁定429）: シフト ON のスタッフは店長と同じ */) then
    raise exception 'forbidden';
  end if;
  -- ★mig0095: バンド重複ガード（同 store/dow・from_min 不一致で期間交差する行は 'overlap'＝
  --   充足分母の二重計上防止。同 from_min は upsert 置換＝to_min/required 更新。新バンド全体で判定する
  --   ため、既存バンドの to_min 拡張が隣接バンドへ食い込むケースもここで拒否される）
  if exists (
    select 1 from public.staffing_needs n
    where n.store_id = p_store_id and n.dow = p_dow
      and n.from_min <> p_from_min
      and p_from_min < n.to_min and n.from_min < p_to_min
  ) then
    raise exception 'overlap';
  end if;
  select to_jsonb(n) into v_before from public.staffing_needs n
    where n.store_id = p_store_id and n.dow = p_dow and n.from_min = p_from_min;
  insert into public.staffing_needs (org_id, store_id, dow, required, from_min, to_min)
  values (public.auth_org_id(), p_store_id, p_dow, p_required, p_from_min, p_to_min)
  on conflict (store_id, dow, from_min) do update set required = excluded.required, to_min = excluded.to_min
  returning id into v_id;
  perform public.audit_log_write('set_staffing_need', 'staffing_needs:' || v_id::text, v_before,
    (select to_jsonb(n) from public.staffing_needs n where n.id = v_id), p_store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.staffing_need_remove(p_store_id uuid, p_dow integer, p_from_min integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_row   public.staffing_needs;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_dow is null or p_dow < 0 or p_dow > 6 then raise exception 'bad dow'; end if;
  if p_from_min is null then raise exception 'bad band'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or ((public.auth_role() = 'manager' or (public.auth_role() = 'staff' and public.auth_staff_can_shift())) and p_store_id = public.auth_store_id())  /* ★0183（裁定429）: シフト ON のスタッフは店長と同じ */) then
    raise exception 'forbidden';
  end if;

  select * into v_row from public.staffing_needs
    where store_id = p_store_id and dow = p_dow and from_min = p_from_min;
  if not found then raise exception 'not found'; end if;

  delete from public.staffing_needs where id = v_row.id;

  perform public.audit_log_write('staffing_need_remove', 'staffing_needs:' || v_row.id::text,
    to_jsonb(v_row), null, p_store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.shift_period_needs_set(p_period_id uuid, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★5 0176（SH-UI-b 0176 行き (a)）: 期間ごとの必要人数＝shift_period_needs（period × dow・無い曜日は店の staffing_needs に従う）。全置換。owner／自店 manager・audit。計算側（dayStat）の読み替えは P176
declare
  v_org uuid := public.auth_org_id();
  v_p record; v_e jsonb; v_dow int; v_req int;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'bad rows'; end if;
  select * into v_p from public.shift_periods where id = p_period_id and org_id = v_org;
  if v_p.id is null then raise exception 'not found'; end if;
  if not (public.auth_role() = 'owner' or ((public.auth_role() = 'manager' or (public.auth_role() = 'staff' and public.auth_staff_can_shift())) and v_p.store_id = public.auth_store_id())  /* ★0183（裁定429）: シフト ON のスタッフは店長と同じ */) then raise exception 'forbidden'; end if;
  for v_e in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_e->'dow') <> 'number' or jsonb_typeof(v_e->'required') <> 'number' then raise exception 'bad rows'; end if;
    v_dow := (v_e->>'dow')::int; v_req := (v_e->>'required')::int;
    if v_dow < 0 or v_dow > 6 or v_req < 0 or v_req > 99 then raise exception 'bad rows'; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_rows) e) <> (select count(distinct (e->>'dow')) from jsonb_array_elements(p_rows) e) then raise exception 'dup dow'; end if;
  delete from public.shift_period_needs where period_id = p_period_id;
  insert into public.shift_period_needs (org_id, store_id, period_id, dow, required)
  select v_org, v_p.store_id, p_period_id, (e->>'dow')::int, (e->>'required')::int from jsonb_array_elements(p_rows) e;
  perform public.audit_log_write('shift_period_needs_set', 'shift_periods:' || p_period_id::text, null, jsonb_build_object('rows', p_rows), v_p.store_id);
end $function$;

-- ═══ ★2 予約（M-4） ═══
CREATE OR REPLACE FUNCTION public.reservation_request_guest(p_store_id uuid, p_guest_name text, p_party_size integer, p_at timestamp with time zone, p_kind text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0183（M-4・Agoora 確定 10/26 ⑤）: キャスト本人の予約申請（新規のお客様）＝仮の呼び名＋人数（customer_id なし）。reservation_request（担当客）と同じ柵・同じ 'pending'。
--   来店時（reservation_to_check）に顧客カルテを作って紐づけ＝申請したキャストの担当客。呼び名 1〜40 字・人数 1〜20。
declare
  v_org   uuid;
  v_cast  uuid := public.auth_cast_id();
  v_row   record;
  v_id    uuid;
  v_name  text := trim(coalesce(p_guest_name, ''));
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if v_cast is null then raise exception 'no cast for caller'; end if;
  select c.org_id, c.store_id, c.user_id, c.is_active into v_row from public.casts c where c.id = v_cast;
  if v_row.org_id is null or v_row.org_id <> public.auth_org_id() or v_row.store_id <> p_store_id or not v_row.is_active then raise exception 'forbidden'; end if;
  v_org := v_row.org_id;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_at is null then raise exception 'bad reserved_at'; end if;
  if p_kind is null or p_kind not in ('hon','dohan') then raise exception 'bad kind'; end if;
  if length(v_name) < 1 or length(v_name) > 40 then raise exception 'bad guest name'; end if;
  if p_party_size is null or p_party_size < 1 or p_party_size > 20 then raise exception 'bad party size'; end if;
  if public.reservation_is_closed_day(p_store_id, p_at) then raise exception 'closed day'; end if;
  insert into public.reservations (org_id, store_id, customer_id, cast_id, guest_name, party_size, reserved_at, nom_type, status, requested_by_cast, created_by)
  values (v_org, p_store_id, null, v_cast, v_name, p_party_size, p_at, p_kind, 'pending', v_cast, v_row.user_id)
  returning id into v_id;
  perform public.audit_log_write('reservation_request_guest', 'reservations:' || v_id::text, null,
    (select to_jsonb(r) from public.reservations r where r.id = v_id), p_store_id);
  return v_id;
end $function$;
revoke execute on function public.reservation_request_guest(uuid, text, integer, timestamp with time zone, text) from public, anon;
grant execute on function public.reservation_request_guest(uuid, text, integer, timestamp with time zone, text) to authenticated;

CREATE OR REPLACE FUNCTION public.reservation_to_check(p_reservation_id uuid, p_seat_id uuid DEFAULT NULL::uuid, p_nom_type text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org        uuid := public.auth_org_id();
  v_role       text := public.auth_role();
  v_res        public.reservations;
  v_seat       uuid;
  v_seat_store uuid;
  v_nom_type   text;
  v_check_id   uuid;
  v_cast_ok    boolean := false;
  v_new_cust   uuid;  -- ★0183（M-4）
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 対象予約（org 照合・reservations は org_id 列あり）
  select * into v_res from public.reservations
  where id = p_reservation_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- status=booked のみ来店処理可（visited 再処理・cancelled/no_show は不可）
  if v_res.status <> 'booked' then raise exception 'not bookable'; end if;

  -- F3b-B: 卓の解決＝引数 > 予約卓（席予約）。卓なし予約は従来どおり引数必須（両 null は no seat）
  v_seat := coalesce(p_seat_id, v_res.seat_id);
  if v_seat is null then raise exception 'no seat'; end if;

  -- ★【10】卓の店＝予約の店（owner の org 全店権限で他店卓に開く誤接続を封じる。
  --   customer あり予約は内側 check_open の invalid customer でも止まるが、guest_name のみの
  --   フリー予約には関所が無いためここで一致を要求）
  -- ★mig0053（裁定(c)）: seats 行ロック＝占有変更の直列化（主席 open を作る経路として同ガード）
  select store_id into v_seat_store from public.seats where id = v_seat for update;
  if v_seat_store is null or v_seat_store <> v_res.store_id then raise exception 'invalid store'; end if;

  -- ★【5】発見1対策: 解決後の卓に既存 open があれば拒否（使用中の卓に予約客を着けない＝
  --   check_open の「既存 open 再利用」で他人の伝票が返る誤接続の封鎖）。
  --   確認(A): 予約卓が飛び込み客で埋まっている場合もここで 'seat occupied'
  --   → UI は p_seat_id を明示して別卓に通す（実来店が勝つ・audit に予約卓と実卓が両方残る）
  if exists (
    select 1 from public.checks
    where seat_id = v_seat and status = 'open' and org_id = v_org
  ) then
    raise exception 'seat occupied';
  end if;
  -- ★mig0053（B1 相席）: 追加席として占有中の卓も拒否（check_open の再利用が主席∪追加席 union に
  --   なったため、ここで塞がないと予約客が他組の伝票へ着く＝発見1 の相席版）
  if exists (
    select 1 from public.check_seats cs
    join public.checks c on c.id = cs.check_id
    where cs.seat_id = v_seat and c.status = 'open' and c.org_id = v_org
  ) then
    raise exception 'seat occupied';
  end if;

  -- 【8】nom_type 決定: 引数 > 予約の nom_type > 'free'（両対応・来店時上書き可）
  v_nom_type := coalesce(p_nom_type, v_res.nom_type, 'free');
  if v_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;

  -- ① check_open を内部呼び（customer_id 引き継ぎ・【4】権限=can_register・seat 検証・
  --    invalid customer は check_open が担う＝二重に書かない）
  -- ★0183（M-4・Agoora 確定 10/26 ⑤）: 新規客の予約（customer_id なし・呼び名あり・キャスト申請）＝来店時に顧客カルテを作る（担当＝申請したキャスト＝customers.cast_id）
  if v_res.customer_id is null and v_res.requested_by_cast is not null and nullif(trim(coalesce(v_res.guest_name, '')), '') is not null then
    insert into public.customers (org_id, store_id, name, cast_id, memo)
    values (v_org, v_res.store_id, trim(v_res.guest_name), v_res.requested_by_cast, '予約（新規のお客様）から登録')
    returning id into v_new_cust;
    update public.reservations set customer_id = v_new_cust, updated_at = now() where id = p_reservation_id;
    v_res.customer_id := v_new_cust;
    perform public.audit_log_write('reservation_guest_to_customer', 'customers:' || v_new_cust::text, null,
      jsonb_build_object('reservation_id', p_reservation_id, 'name', trim(v_res.guest_name), 'cast_id', v_res.requested_by_cast), v_res.store_id);
  end if;
  v_check_id := public.check_open(v_seat, v_res.party_size, v_nom_type, v_res.customer_id);

  -- ② 指名引き継ぎ（cast_id あり ∧ ★【6】発見3: cast が is_active のときだけ）
  if v_res.cast_id is not null then
    select true into v_cast_ok from public.casts
    where id = v_res.cast_id and org_id = v_org and is_active
      and store_id = (select store_id from public.checks where id = v_check_id);
    if v_cast_ok then
      -- ★0120 裁定103: 0119 で check_set_nominations は (uuid, jsonb) の2引数。予約の nom_type（伝票単位・dohan 含む）を
      --   0118 backfill と同一写像でキャスト行へ転写＝ nom_kind: hon/jonai はそのまま・それ以外 free／ is_dohan: (nom_type='dohan')
      --   単一指名＝要素1の配列・weight=1・全置換。dohan_auto_hon による free→hon 昇格は店設定に従う（レジ経路と同じ）
      perform public.check_set_nominations(
        v_check_id,
        jsonb_build_array(jsonb_build_object(
          'cast_id',  v_res.cast_id,
          'weight',   1,
          'nom_kind', case v_nom_type when 'hon' then 'hon' when 'jonai' then 'jonai' else 'free' end,
          'is_dohan', (v_nom_type = 'dohan')
        ))
      );
    end if;
    -- cast inactive（v_cast_ok=false）なら指名スキップ・開店は成功（発見3 lock・不在表示は UI）
  end if;

  -- 予約を visited に・check_id を埋める（【7】visited⇔check_id 1:1）
  update public.reservations
     set status = 'visited', check_id = v_check_id, updated_at = now()
   where id = p_reservation_id;

  perform public.audit_log_write('reservation_to_check', 'reservations:' || p_reservation_id::text,
    to_jsonb(v_res),
    jsonb_build_object('status','visited','check_id',v_check_id,'seat_id',v_seat,'nom_type',v_nom_type),
    v_res.store_id);

  return v_check_id;
end $function$;

-- ═══ ★3 norm_shortfall_decide（M-7） ═══
CREATE OR REPLACE FUNCTION public.norm_shortfall_decide(p_run_id uuid, p_cast_id uuid, p_action text, p_reason text DEFAULT NULL::text, p_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★4 0175（X13-I I-5）: ノルマ未達の減額の提案に対する店の判断（apply＝適用／exclude＝除外・理由必須）を audit に 1 行残す（今は画面の中だけ＝記録なし）。
--   表は作らない（audit_logs が正）。apply のときの精算調整の行は payroll_adjustment_add（source 'settlement'・kind 'norm_shortfall'）＝client が続けて呼ぶ。
--   owner／自店 manager・run は自 org・cast は run の店。戻り＝audit_logs.id
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_store uuid;
  v_cast_store uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if v_role is null or v_role not in ('owner','manager') then raise exception 'forbidden'; end if;
  if p_action is null or p_action not in ('apply','exclude') then raise exception 'bad action'; end if;
  if p_action = 'exclude' and (p_reason is null or length(trim(p_reason)) not between 1 and 200) then raise exception 'reason required'; end if;
  if p_detail is null or jsonb_typeof(p_detail) <> 'object' then raise exception 'bad detail'; end if;
  select store_id into v_store from public.payroll_runs where id = p_run_id and org_id = v_org;
  if not found then raise exception 'run not found'; end if;
  if v_role = 'manager' and v_store is distinct from public.auth_store_id() then raise exception 'forbidden'; end if;
  select store_id into v_cast_store from public.casts where id = p_cast_id and org_id = v_org;
  if not found or v_cast_store is distinct from v_store then raise exception 'cast not found'; end if;
  -- ★0183（M-7・Agoora 確定 10/26 ⑥）: 意思だけを保存（期・キャスト・適用／除外・判断者・時刻）＝金額は確定時に最新で再計算して精算調整に書く（finalize route）
  insert into public.norm_shortfall_intents (org_id, store_id, run_id, cast_id, action, reason, detail, decided_by, decided_at)
  values (v_org, v_store, p_run_id, p_cast_id, p_action, nullif(trim(coalesce(p_reason, '')), ''), p_detail, (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active), now())
  on conflict (run_id, cast_id) do update set action = excluded.action, reason = excluded.reason, detail = excluded.detail, decided_by = excluded.decided_by, decided_at = excluded.decided_at;
  return public.audit_log_write('norm_shortfall_decide', 'payroll_runs:' || p_run_id::text || '/casts:' || p_cast_id::text,
    null, jsonb_build_object('action', p_action, 'cast_id', p_cast_id, 'detail', p_detail), v_store, nullif(trim(coalesce(p_reason, '')), ''));
end $function$;

-- ═══ ★4 裁定432（Agoora 確定 10/26）源泉区分と控除の入れ方＝区分（人ごと）・委託の額の指定（期ごと）・社員の控除（期ごと・名前付き複数行） ═══
-- 区分: hostess（委託キャスト＝10.21%・5,000 円×計算期間の暦日数を控除）／other_fee（委託スタッフ＝10.21% 定率・控除なし＝税理士 T11 待ちの仮置き）／manual（社員＝NOX は税額を計算しない・控除を手入力）／none（源泉なし）。
--   null＝既定（cast: 委託→hostess・雇用→manual／staff: contractor→other_fee・他→manual）＝TS の defaultWithholdingKindOf と同じ。
alter table public.cast_tax_profiles add column if not exists withholding_kind text;
alter table public.cast_tax_profiles drop constraint if exists cast_tax_profiles_withholding_kind_check;
alter table public.cast_tax_profiles add constraint cast_tax_profiles_withholding_kind_check check (withholding_kind is null or withholding_kind in ('hostess','other_fee','manual','none'));
comment on column public.cast_tax_profiles.withholding_kind is '★0183 ★4（裁定432）: 源泉区分（null＝既定＝委託 hostess／雇用 manual）';
alter table public.staff_contracts add column if not exists withholding_kind text;
alter table public.staff_contracts drop constraint if exists staff_contracts_withholding_kind_check;
alter table public.staff_contracts add constraint staff_contracts_withholding_kind_check check (withholding_kind is null or withholding_kind in ('hostess','other_fee','manual','none'));
comment on column public.staff_contracts.withholding_kind is '★0183 ★4（裁定432）: 源泉区分（null＝既定＝contractor other_fee／他 manual）';

-- 委託の額の指定（その期だけ・理由任意・税理士確認済みの印・元額 auto_amount と指定額 amount を残す）
create table if not exists public.payroll_withholding_overrides (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  store_id      uuid not null references public.stores(id) on delete cascade,
  period        text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  subject_kind  text not null check (subject_kind in ('cast','staff')),
  subject_id    uuid not null,
  auto_amount   integer not null check (auto_amount >= 0),
  amount        integer not null check (amount >= 0),
  reason        text check (reason is null or length(reason) <= 200),
  tax_accountant_confirmed boolean not null default false,
  set_by        uuid references public.users(id),
  set_at        timestamptz not null default now(),
  constraint payroll_withholding_overrides_uq unique (store_id, period, subject_kind, subject_id)
);
create index if not exists payroll_withholding_overrides_org_idx on public.payroll_withholding_overrides (org_id, period);
alter table public.payroll_withholding_overrides enable row level security;
drop policy if exists payroll_withholding_overrides_select on public.payroll_withholding_overrides;
create policy payroll_withholding_overrides_select on public.payroll_withholding_overrides for select to authenticated using (
  org_id = public.auth_org_id() and (
    (public.auth_role() in ('owner','manager') and (public.auth_role() = 'owner' or store_id = public.auth_store_id()))
    or (subject_kind = 'cast' and subject_id = public.auth_cast_id())
    or (subject_kind = 'staff' and subject_id = public.auth_membership_id())));
revoke all on table public.payroll_withholding_overrides from public, anon, authenticated;
grant select on table public.payroll_withholding_overrides to authenticated;
comment on table public.payroll_withholding_overrides is '★0183 ★4（裁定432 ②）: 委託（hostess／other_fee）の源泉の額の指定（その期だけ）。auto_amount＝指定時の自動額・amount＝指定額';

-- 社員の控除（社会保険料／源泉所得税／住民税／その他＝名前付きで複数行）・月ごとに手入力・既定は空欄＝0
create table if not exists public.payroll_employee_deductions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  store_id      uuid not null references public.stores(id) on delete cascade,
  period        text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  subject_kind  text not null check (subject_kind in ('cast','staff')),
  subject_id    uuid not null,
  kind          text not null check (kind in ('social_insurance','income_tax','resident_tax','other')),
  name          text check (name is null or length(name) <= 40),
  amount        integer not null check (amount >= 0),
  sort          integer not null default 0,
  set_by        uuid references public.users(id),
  set_at        timestamptz not null default now()
);
create index if not exists payroll_employee_deductions_subject_idx on public.payroll_employee_deductions (store_id, period, subject_kind, subject_id);
alter table public.payroll_employee_deductions enable row level security;
drop policy if exists payroll_employee_deductions_select on public.payroll_employee_deductions;
create policy payroll_employee_deductions_select on public.payroll_employee_deductions for select to authenticated using (
  org_id = public.auth_org_id() and (
    (public.auth_role() in ('owner','manager') and (public.auth_role() = 'owner' or store_id = public.auth_store_id()))
    or (subject_kind = 'cast' and subject_id = public.auth_cast_id())
    or (subject_kind = 'staff' and subject_id = public.auth_membership_id())));
revoke all on table public.payroll_employee_deductions from public, anon, authenticated;
grant select on table public.payroll_employee_deductions to authenticated;
comment on table public.payroll_employee_deductions is '★0183 ★4（裁定432 ③）: 社員（manual）の控除＝社会保険料／源泉所得税／住民税／その他（名前付き）を期ごとに手入力（NOX は税額を計算しない）';

-- 区分の設定（店長以上・cast は税区分の行・staff は契約の行が先）
CREATE OR REPLACE FUNCTION public.set_withholding_kind(p_subject_kind text, p_subject_id uuid, p_kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0183 ★4（裁定432 ①）: 源泉区分の変更（null＝既定に戻す）。店長は自店・オーナーは org 内
declare
  v_store uuid; v_org uuid; v_before text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() not in ('owner','manager') then raise exception 'forbidden'; end if;
  if p_kind is not null and p_kind not in ('hostess','other_fee','manual','none') then raise exception 'bad kind'; end if;
  if p_subject_kind = 'cast' then
    select store_id, org_id, withholding_kind into v_store, v_org, v_before from public.cast_tax_profiles where cast_id = p_subject_id;
  elsif p_subject_kind = 'staff' then
    select store_id, org_id, withholding_kind into v_store, v_org, v_before from public.staff_contracts where membership_id = p_subject_id;
  else raise exception 'bad subject'; end if;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'not found'; end if;
  if public.auth_role() <> 'owner' and v_store <> public.auth_store_id() then raise exception 'forbidden'; end if;
  if p_subject_kind = 'cast' then
    update public.cast_tax_profiles set withholding_kind = p_kind, updated_at = now() where cast_id = p_subject_id;
  else
    update public.staff_contracts set withholding_kind = p_kind, updated_at = now() where membership_id = p_subject_id;
  end if;
  perform public.audit_log_write('set_withholding_kind', p_subject_kind || ':' || p_subject_id::text,
    jsonb_build_object('withholding_kind', v_before), jsonb_build_object('withholding_kind', p_kind), v_store);
end $function$;
revoke execute on function public.set_withholding_kind(text, uuid, text) from public, anon;
grant execute on function public.set_withholding_kind(text, uuid, text) to authenticated;

-- 期が確定済み／支払済みか（cast＝payroll_runs・staff＝staff_payroll_runs）＝内部専用
CREATE OR REPLACE FUNCTION public.payroll_period_locked_of(p_store_id uuid, p_period text, p_subject_kind text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when p_subject_kind = 'staff'
    then exists (select 1 from public.staff_payroll_runs r where r.store_id = p_store_id and r.period = p_period and r.status in ('finalized','paid'))
    else exists (select 1 from public.payroll_runs r where r.store_id = p_store_id and r.period = p_period and r.status in ('finalized','paid')) end
$function$;
revoke execute on function public.payroll_period_locked_of(uuid, text, text) from public, anon, authenticated, service_role;   -- 内部専用＝4 ロール明示 revoke・grant なし

-- 対象の店（cast＝casts.store_id・staff＝memberships.store_id）と org の照合＝内部専用
CREATE OR REPLACE FUNCTION public.payroll_subject_store_of(p_subject_kind text, p_subject_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when p_subject_kind = 'staff'
    then (select m.store_id from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_subject_id and s.org_id = public.auth_org_id())
    else (select c.store_id from public.casts c where c.id = p_subject_id and c.org_id = public.auth_org_id()) end
$function$;
revoke execute on function public.payroll_subject_store_of(text, uuid) from public, anon, authenticated, service_role;   -- 内部専用＝4 ロール明示 revoke・grant なし

-- 委託の額の指定（p_amount null＝指定を外す＝自動に戻す）
CREATE OR REPLACE FUNCTION public.payroll_withholding_override_set(p_period text, p_subject_kind text, p_subject_id uuid, p_auto_amount integer, p_amount integer, p_reason text DEFAULT NULL::text, p_confirmed boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0183 ★4（裁定432 ②）: 委託（hostess／other_fee）の源泉をその期だけ指定。audit に元額（auto）と指定額。確定済み／支払済みの期は不可
declare
  v_store uuid; v_before jsonb; v_uid uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() not in ('owner','manager') then raise exception 'forbidden'; end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  if p_subject_kind not in ('cast','staff') then raise exception 'bad subject'; end if;
  if p_auto_amount is null or p_auto_amount < 0 or (p_amount is not null and p_amount < 0) then raise exception 'bad amount'; end if;
  if p_reason is not null and length(p_reason) > 200 then raise exception 'bad reason'; end if;
  v_store := public.payroll_subject_store_of(p_subject_kind, p_subject_id);
  if v_store is null then raise exception 'not found'; end if;
  if public.auth_role() <> 'owner' and v_store <> public.auth_store_id() then raise exception 'forbidden'; end if;
  if public.payroll_period_locked_of(v_store, p_period, p_subject_kind) then raise exception 'period finalized'; end if;
  select to_jsonb(o) - 'id' into v_before from public.payroll_withholding_overrides o
   where o.store_id = v_store and o.period = p_period and o.subject_kind = p_subject_kind and o.subject_id = p_subject_id;
  select id into v_uid from public.users where auth_user_id = auth.uid();
  if p_amount is null then
    delete from public.payroll_withholding_overrides where store_id = v_store and period = p_period and subject_kind = p_subject_kind and subject_id = p_subject_id;
  else
    insert into public.payroll_withholding_overrides (org_id, store_id, period, subject_kind, subject_id, auto_amount, amount, reason, tax_accountant_confirmed, set_by, set_at)
    values (public.auth_org_id(), v_store, p_period, p_subject_kind, p_subject_id, p_auto_amount, p_amount, nullif(trim(coalesce(p_reason, '')), ''), coalesce(p_confirmed, false), v_uid, now())
    on conflict (store_id, period, subject_kind, subject_id) do update
      set auto_amount = excluded.auto_amount, amount = excluded.amount, reason = excluded.reason,
          tax_accountant_confirmed = excluded.tax_accountant_confirmed, set_by = excluded.set_by, set_at = now();
  end if;
  perform public.audit_log_write('payroll_withholding_override_set', p_subject_kind || ':' || p_subject_id::text || '@' || p_period, v_before,
    jsonb_build_object('auto_amount', p_auto_amount, 'amount', p_amount, 'reason', p_reason, 'tax_accountant_confirmed', coalesce(p_confirmed, false)), v_store);
end $function$;
revoke execute on function public.payroll_withholding_override_set(text, text, uuid, integer, integer, text, boolean) from public, anon;
grant execute on function public.payroll_withholding_override_set(text, text, uuid, integer, integer, text, boolean) to authenticated;

-- 社員の控除（その期の行を丸ごと置き換え＝[] で全部消す）。p_rows＝[{kind, name, amount}]（amount 0 の行は保存しない）
CREATE OR REPLACE FUNCTION public.payroll_employee_deductions_set(p_period text, p_subject_kind text, p_subject_id uuid, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0183 ★4（裁定432 ③）: 社員の控除＝社会保険料／源泉所得税／住民税／その他（名前付き）。戻り＝保存した行数。確定済み／支払済みの期は不可
declare
  v_store uuid; v_before jsonb; v_uid uuid; v_n int := 0; r jsonb; v_i int := 0;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() not in ('owner','manager') then raise exception 'forbidden'; end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  if p_subject_kind not in ('cast','staff') then raise exception 'bad subject'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 30 then raise exception 'bad rows'; end if;
  v_store := public.payroll_subject_store_of(p_subject_kind, p_subject_id);
  if v_store is null then raise exception 'not found'; end if;
  if public.auth_role() <> 'owner' and v_store <> public.auth_store_id() then raise exception 'forbidden'; end if;
  if public.payroll_period_locked_of(v_store, p_period, p_subject_kind) then raise exception 'period finalized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind', d.kind, 'name', d.name, 'amount', d.amount) order by d.sort), '[]'::jsonb) into v_before
    from public.payroll_employee_deductions d where d.store_id = v_store and d.period = p_period and d.subject_kind = p_subject_kind and d.subject_id = p_subject_id;
  select id into v_uid from public.users where auth_user_id = auth.uid();
  delete from public.payroll_employee_deductions where store_id = v_store and period = p_period and subject_kind = p_subject_kind and subject_id = p_subject_id;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    if (r->>'kind') is null or (r->>'kind') not in ('social_insurance','income_tax','resident_tax','other') then raise exception 'bad kind'; end if;
    if (r->>'amount') is null or (r->>'amount') !~ '^[0-9]{1,9}$' then raise exception 'bad amount'; end if;
    if (r->>'amount')::int = 0 then continue; end if;
    insert into public.payroll_employee_deductions (org_id, store_id, period, subject_kind, subject_id, kind, name, amount, sort, set_by, set_at)
    values (public.auth_org_id(), v_store, p_period, p_subject_kind, p_subject_id, r->>'kind', nullif(left(trim(coalesce(r->>'name', '')), 40), ''), (r->>'amount')::int, v_i, v_uid, now());
    v_n := v_n + 1;
  end loop;
  perform public.audit_log_write('payroll_employee_deductions_set', p_subject_kind || ':' || p_subject_id::text || '@' || p_period, v_before, p_rows, v_store);
  return v_n;
end $function$;
revoke execute on function public.payroll_employee_deductions_set(text, text, uuid, jsonb) from public, anon;
grant execute on function public.payroll_employee_deductions_set(text, text, uuid, jsonb) to authenticated;

commit;
-- ===== verify =====（Success の後に 1 文で貼る）
-- select 'nox-project-proof' as k, count(*)::text as v from public.orgs
-- union all select 'can_shift 句', count(*)::text from pg_proc where pronamespace='public'::regnamespace and proname in ('shift_set','shift_remove','shift_confirm_bulk','shift_propose','shift_period_set','shift_period_remove','shift_wish_decide','shift_bulk_set_daily','set_staffing_need','staffing_need_remove','shift_period_needs_set') and position('auth_staff_can_shift()' in prosrc) > 0
-- union all select 'guest fn', count(*)::text from pg_proc where pronamespace='public'::regnamespace and proname='reservation_request_guest'
-- union all select 'rtc has 0183', (position('★0183' in prosrc) > 0)::text from pg_proc where pronamespace='public'::regnamespace and proname='reservation_to_check'
-- union all select 'intents', count(*)::text from pg_tables where schemaname='public' and tablename='norm_shortfall_intents'
-- union all select '432 tables', count(*)::text from pg_tables where schemaname='public' and tablename in ('payroll_withholding_overrides','payroll_employee_deductions')
-- union all select '432 rpc', count(*)::text from pg_proc where pronamespace='public'::regnamespace and proname in ('set_withholding_kind','payroll_withholding_override_set','payroll_employee_deductions_set')
-- union all select '432 kind cols', count(*)::text from information_schema.columns where table_schema='public' and column_name='withholding_kind' and table_name in ('cast_tax_profiles','staff_contracts')
-- union all select 'intents grant', (select string_agg(distinct privilege_type, ',') from information_schema.role_table_grants where grantee='authenticated' and table_schema='public' and table_name='norm_shortfall_intents');
-- ===== end 0183 =====
