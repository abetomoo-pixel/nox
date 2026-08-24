-- =============================================================
-- mig0102_shift_deep_rpc.sql（SD設計書v1・RPC編）
-- 対象: NOX dev → 将来本番手貼り（mig0101 適用後）
-- 取扱: 非冪等扱い＝本番手貼り1回
-- 手順: 新規タブ→全文貼付→Ctrl+A→Run（教訓18）
-- 適用後に別途単発: notify pgrst, 'reload schema';
-- 新規 RPC 6本＋shift_set 改修 = 全て billing gate 済み（0088 規範）
-- =============================================================

-- ▼貼り先・前提証明
do $$
begin
  if to_regclass('public.shift_periods') is null then
    raise exception 'PREREQ: mig0101 未適用（shift_periods 不在）';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='shifts'
                   and column_name='source') then
    raise exception 'PREREQ: mig0101 未適用（shifts.source 不在）';
  end if;
end $$;

begin;

-- -------------------------------------------------------------
-- 1) shift_set: status 白名単に proposed を追加（他は live prosrc 逐語）
-- -------------------------------------------------------------
create or replace function public.shift_set(
  p_id uuid, p_cast_id uuid, p_date date, p_start_hm text, p_end_hm text, p_status text
) returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare
  v_cast record; v_actor uuid; v_id uuid; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_date is null then raise exception 'bad date'; end if;
  if p_start_hm is null or p_start_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_end_hm   is null or p_end_hm   !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_status is null or p_status not in ('planned','proposed','confirmed') then raise exception 'bad status'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- ★B-5②: 定休日ハード拒否（create/update 共通・ロール照合の後=他店曜日の probing 防止）
  if public.shift_is_closed_day(v_cast.store_id, p_date) then
    raise exception 'closed day';
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
end
$fn$;

-- -------------------------------------------------------------
-- 2) shift_period_set（期間 upsert・owner/manager）
-- -------------------------------------------------------------
create or replace function public.shift_period_set(
  p_id uuid, p_store_id uuid, p_start_date date, p_end_date date,
  p_wish_deadline date, p_status text
) returns uuid
language plpgsql security definer set search_path = public
as $fn$
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
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if p_id is null then
    insert into public.shift_periods (org_id, store_id, start_date, end_date, wish_deadline, status, created_by)
    values (v_store.org_id, p_store_id, p_start_date, p_end_date, p_wish_deadline, p_status, v_actor)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(p) into v_before from public.shift_periods p
      where p.id = p_id and p.org_id = public.auth_org_id() and p.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.shift_periods
       set start_date = p_start_date, end_date = p_end_date,
           wish_deadline = p_wish_deadline, status = p_status
     where id = p_id and org_id = public.auth_org_id();
    v_id := p_id;
  end if;
  perform public.audit_log_write('shift_period_set', 'shift_periods:' || v_id::text, v_before,
    (select to_jsonb(p) from public.shift_periods p where p.id = v_id), p_store_id);
  return v_id;
end
$fn$;

-- -------------------------------------------------------------
-- 3) shift_period_remove（参照ゼロのときのみ削除）
-- -------------------------------------------------------------
create or replace function public.shift_period_remove(p_id uuid) returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare
  v_row record;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_row from public.shift_periods where id = p_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_row.store_id = public.auth_store_id())) then
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
$fn$;

-- -------------------------------------------------------------
-- 4) shift_propose（planned→proposed 一括・全か無か）
-- -------------------------------------------------------------
create or replace function public.shift_propose(p_shift_ids uuid[]) returns integer
language plpgsql security definer set search_path = public
as $fn$
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
              or (public.auth_role() = 'manager' and s.store_id = public.auth_store_id()));
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
$fn$;

-- -------------------------------------------------------------
-- 5) shift_cast_confirm（cast 本人のみ・proposed→confirmed の一方向）
--    ★cast 初の shifts 書込 RPC＝最厳格: null-guard-first・本人一致・
--      状態遷移1方向のみ・insert なし（created_by/users 参照なし）
-- -------------------------------------------------------------
create or replace function public.shift_cast_confirm(p_shift_id uuid) returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare
  v_row record;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_cast_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_row from public.shifts where id = p_shift_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if v_row.cast_id <> public.auth_cast_id() then raise exception 'forbidden'; end if;
  if v_row.status <> 'proposed' then raise exception 'bad status'; end if;
  update public.shifts set status = 'confirmed'
   where id = p_shift_id and org_id = public.auth_org_id();
  perform public.audit_log_write('shift_cast_confirm', 'shifts:' || p_shift_id::text,
    to_jsonb(v_row),
    (select to_jsonb(s) from public.shifts s where s.id = p_shift_id),
    v_row.store_id);
  return p_shift_id;
end
$fn$;

-- -------------------------------------------------------------
-- 6) shift_auto_apply（自動配置の適用＝wish 一括 accept・入替型・原子）
--    入力は wish_ids（時刻・日付は wish の値を逐語採用＝SD-6/donor差分#3）
--    空配列 = 完全 no-op（削除もしない・SD-8/donor 準拠）
--    非空 = ①当該期間の auto かつ planned の行を削除し、その wish を pending へ戻す
--           ②各 wish を accepted にし shifts へ planned/auto/period_id/wish_id で insert
--             （shifts_wish_id_uidx 部分ユニークが二重生成を物理防止＝0008 決定2）
--    proposed/confirmed に進んだ auto 行は保持（承認に入った行は入替対象外）
-- -------------------------------------------------------------
create or replace function public.shift_auto_apply(p_period_id uuid, p_wish_ids uuid[]) returns integer
language plpgsql security definer set search_path = public
as $fn$
declare
  v_period record; v_actor uuid; v_ids uuid[]; v_wid uuid; v_wish record; v_cast record;
  v_cnt int := 0;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_period from public.shift_periods where id = p_period_id;
  if v_period.id is null or v_period.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_period.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_period.status = 'published' then raise exception 'period published'; end if;
  if p_wish_ids is null then raise exception 'bad ids'; end if;
  if coalesce(array_length(p_wish_ids,1),0) = 0 then return 0; end if;  -- ★完全 no-op
  select array_agg(distinct x) into v_ids from unnest(p_wish_ids) as x;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  -- ① 入替: 旧 auto（planned のみ）を削除し wish を pending へ戻す
  update public.shift_wishes w
     set status = 'pending', decided_by = null, decided_at = null
   where w.id in (select s.wish_id from public.shifts s
                   where s.period_id = p_period_id and s.source = 'auto'
                     and s.status = 'planned' and s.wish_id is not null
                     and s.org_id = public.auth_org_id());
  delete from public.shifts
   where period_id = p_period_id and source = 'auto' and status = 'planned'
     and org_id = public.auth_org_id();

  -- ② 各 wish を検証→accept→insert
  foreach v_wid in array v_ids loop
    select * into v_wish from public.shift_wishes where id = v_wid;
    if v_wish.id is null or v_wish.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
    if v_wish.store_id <> v_period.store_id then raise exception 'store mismatch: %', v_wid; end if;
    if v_wish.status <> 'pending' then raise exception 'already decided: %', v_wid; end if;
    if v_wish.date < v_period.start_date or v_wish.date > v_period.end_date then
      raise exception 'out of period: %', v_wid;
    end if;
    if public.shift_is_closed_day(v_wish.store_id, v_wish.date) then
      raise exception 'closed day: %', v_wid;
    end if;
    select * into v_cast from public.casts where id = v_wish.cast_id;
    if v_cast.id is null or not v_cast.is_active then raise exception 'inactive cast: %', v_wid; end if;
    update public.shift_wishes
       set status = 'accepted', decided_by = v_actor, decided_at = now()
     where id = v_wid;
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm,
                               status, source, period_id, wish_id, created_by)
    values (v_wish.org_id, v_wish.store_id, v_wish.cast_id, v_wish.date,
            v_wish.start_hm, v_wish.end_hm, 'planned', 'auto', p_period_id, v_wid, v_actor);
    v_cnt := v_cnt + 1;
  end loop;

  perform public.audit_log_write('shift_auto_apply', 'shift_periods:' || p_period_id::text, null,
    jsonb_build_object('inserted', v_cnt, 'wish_ids', to_jsonb(v_ids)), v_period.store_id);
  return v_cnt;
end
$fn$;

-- -------------------------------------------------------------
-- 7) shift_auto_clear（auto planned のみ削除・wish は pending へ戻す）
-- -------------------------------------------------------------
create or replace function public.shift_auto_clear(p_period_id uuid) returns integer
language plpgsql security definer set search_path = public
as $fn$
declare
  v_period record; v_cnt int;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_period from public.shift_periods where id = p_period_id;
  if v_period.id is null or v_period.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_period.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  update public.shift_wishes w
     set status = 'pending', decided_by = null, decided_at = null
   where w.id in (select s.wish_id from public.shifts s
                   where s.period_id = p_period_id and s.source = 'auto'
                     and s.status = 'planned' and s.wish_id is not null
                     and s.org_id = public.auth_org_id());
  delete from public.shifts
   where period_id = p_period_id and source = 'auto' and status = 'planned'
     and org_id = public.auth_org_id();
  get diagnostics v_cnt = row_count;
  perform public.audit_log_write('shift_auto_clear', 'shift_periods:' || p_period_id::text, null,
    jsonb_build_object('deleted', v_cnt), v_period.store_id);
  return v_cnt;
end
$fn$;

-- -------------------------------------------------------------
-- 8) shift_rules_set（店舗単位 upsert・null=無制限）
-- -------------------------------------------------------------
create or replace function public.shift_rules_set(
  p_store_id uuid, p_max_consec_days integer, p_min_month_min integer
) returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare
  v_store record; v_before jsonb; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_max_consec_days is not null and p_max_consec_days <= 0 then raise exception 'bad consec'; end if;
  if p_min_month_min  is not null and p_min_month_min  <= 0 then raise exception 'bad monthmin'; end if;
  select * into v_store from public.stores where id = p_store_id;
  if v_store.id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select to_jsonb(r) into v_before from public.shift_rules r where r.store_id = p_store_id;
  insert into public.shift_rules (org_id, store_id, max_consec_days, min_month_min)
  values (v_store.org_id, p_store_id, p_max_consec_days, p_min_month_min)
  on conflict (store_id) do update
    set max_consec_days = excluded.max_consec_days,
        min_month_min   = excluded.min_month_min
  returning id into v_id;
  perform public.audit_log_write('shift_rules_set', 'shift_rules:' || v_id::text, v_before,
    (select to_jsonb(r) from public.shift_rules r where r.id = v_id), p_store_id);
  return v_id;
end
$fn$;

-- -------------------------------------------------------------
-- ACL（新規6本＋shift_set 再表明・二重防御規範）
-- -------------------------------------------------------------
revoke execute on function public.shift_set(uuid,uuid,date,text,text,text)                from public, anon;
grant  execute on function public.shift_set(uuid,uuid,date,text,text,text)                to authenticated;
revoke execute on function public.shift_period_set(uuid,uuid,date,date,date,text)         from public, anon;
grant  execute on function public.shift_period_set(uuid,uuid,date,date,date,text)         to authenticated;
revoke execute on function public.shift_period_remove(uuid)                               from public, anon;
grant  execute on function public.shift_period_remove(uuid)                               to authenticated;
revoke execute on function public.shift_propose(uuid[])                                   from public, anon;
grant  execute on function public.shift_propose(uuid[])                                   to authenticated;
revoke execute on function public.shift_cast_confirm(uuid)                                from public, anon;
grant  execute on function public.shift_cast_confirm(uuid)                                to authenticated;
revoke execute on function public.shift_auto_apply(uuid,uuid[])                           from public, anon;
grant  execute on function public.shift_auto_apply(uuid,uuid[])                           to authenticated;
revoke execute on function public.shift_auto_clear(uuid)                                  from public, anon;
grant  execute on function public.shift_auto_clear(uuid)                                  to authenticated;
revoke execute on function public.shift_rules_set(uuid,integer,integer)                   from public, anon;
grant  execute on function public.shift_rules_set(uuid,integer,integer)                   to authenticated;

commit;

-- ▼末尾診断（Run の表示がこれ・anon_exec は全て false / auth_exec は全て true が期待値）
select p.proname,
       pg_get_function_identity_arguments(p.oid)                as args,
       has_function_privilege('anon',          p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('shift_set','shift_period_set','shift_period_remove','shift_propose',
                     'shift_cast_confirm','shift_auto_apply','shift_auto_clear','shift_rules_set')
 order by p.proname;
