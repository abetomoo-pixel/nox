-- mig 0125 NOX 裁定112: シフト作成モーダル v6 の器(cast_unavailable_days・override_reason・shift_bulk_set_daily・shift_set 書換)
-- 底本: docs/dp/live_0125prep.sql(sha256 7269c1d3…・shift_set/shift_bulk_set/shift_wish_decide 逐語+shifts/shift_wishes の器面)。記憶からの再構成なし
-- 冪等: 可(if not exists / drop if exists / 同処置の再実行安全)。shift_wish_decide は無変更(判断G'=2段は UI 側)
-- 監査: 新 action 名 3種(cast_unavailable_set/cast_unavailable_remove/shift_bulk_set_daily)。
--       audit_logs.action に CHECK が在る場合は冒頭 DO で手貼り時に停止させる(実行時地雷の先回り=教訓50 同型)
begin;

-- ============================================================
-- 0. フェイルファスト: audit_logs.action の CHECK 存在確認
--    (在れば本 mig は適用せず停止→相談役へ報告。0125b で CHECK 拡張を同梱した版を再起草する)
-- ============================================================
do $$
begin
  if exists (select 1 from pg_constraint
              where conrelid = 'public.audit_logs'::regclass
                and contype = 'c'
                and pg_get_constraintdef(oid) ilike '%action%') then
    raise exception 'audit_logs.action に CHECK が存在: 0125 は適用せず相談役へ constraintdef を報告(0125b で拡張同梱)';
  end if;
end $$;

-- ============================================================
-- 器1: cast_unavailable_days 新設(判断E: 出勤不可の事前宣言。attendance 不流用)
--    書き/読みとも RPC 経由のみ(RLS 有効・policy なし・grant なし=definer 関数だけが触る)
-- ============================================================
create table if not exists public.cast_unavailable_days (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id),
  store_id   uuid not null references public.stores(id),
  cast_id    uuid not null references public.casts(id),
  date       date not null,
  reason     text check (reason is null or length(reason) <= 200),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cast_id, date)
);
create index if not exists cast_unavailable_days_store_date_idx
  on public.cast_unavailable_days (store_id, date);

alter table public.cast_unavailable_days enable row level security;
revoke all on table public.cast_unavailable_days from public;
revoke all on table public.cast_unavailable_days from anon;
revoke all on table public.cast_unavailable_days from authenticated;

drop trigger if exists cast_unavailable_days_touch_updated_at on public.cast_unavailable_days;
create trigger cast_unavailable_days_touch_updated_at
  before update on public.cast_unavailable_days
  for each row execute function touch_updated_at();

-- ============================================================
-- 器2: shifts.override_reason(判断F: 不可を押し切った記録の正本)
-- ============================================================
alter table public.shifts add column if not exists override_reason text
  check (override_reason is null or length(override_reason) <= 200);

-- ============================================================
-- 器3: cast_unavailable_set / cast_unavailable_remove / cast_unavailable_list
--    v1 は owner/manager のみ(shift_set と同一ロール型)。cast セルフは起票#49(別レーン)
-- ============================================================
create or replace function public.cast_unavailable_set(p_cast_id uuid, p_date date, p_reason text default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_cast record; v_actor uuid; v_id uuid; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_date is null then raise exception 'bad date'; end if;
  if p_reason is not null and length(p_reason) > 200 then raise exception 'bad reason'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  select to_jsonb(u) into v_before from public.cast_unavailable_days u
    where u.cast_id = p_cast_id and u.date = p_date;
  insert into public.cast_unavailable_days (org_id, store_id, cast_id, date, reason, created_by)
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_date, p_reason, v_actor)
  on conflict (cast_id, date) do update set reason = excluded.reason
  returning id into v_id;
  perform public.audit_log_write('cast_unavailable_set', 'cast_unavailable_days:' || v_id::text,
    v_before, (select to_jsonb(u) from public.cast_unavailable_days u where u.id = v_id), v_cast.store_id);
  return v_id;
end $function$;

create or replace function public.cast_unavailable_remove(p_cast_id uuid, p_date date)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_cast record; v_row record;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_date is null then raise exception 'bad date'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select * into v_row from public.cast_unavailable_days
    where cast_id = p_cast_id and date = p_date;
  if v_row.id is null then raise exception 'not found'; end if;
  delete from public.cast_unavailable_days where id = v_row.id;
  perform public.audit_log_write('cast_unavailable_remove', 'cast_unavailable_days:' || v_row.id::text,
    to_jsonb(v_row), null, v_cast.store_id);
end $function$;

create or replace function public.cast_unavailable_list(p_cast_id uuid, p_from date, p_to date)
 returns table(date date, reason text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_cast record;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 92 then raise exception 'bad range'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  return query
  select u.date, u.reason from public.cast_unavailable_days u
   where u.cast_id = p_cast_id and u.date between p_from and p_to
   order by u.date;
end $function$;

-- ============================================================
-- 器4: shift_set 書換(判断F: p_override_reason 追加=シグネチャ変更)
--    旧6引数シグネチャを明示 DROP(オーバーロード増殖防止=恒久教訓)。
--    不可はソフト拒否: 不可日は reason 必須('unavailable')・reason は不可日のみ保存(他日は null)
--    named-args 呼び(supabase-js rpc)は default null で後方互換
-- ============================================================
drop function if exists public.shift_set(uuid, uuid, date, text, text, text);

create or replace function public.shift_set(p_id uuid, p_cast_id uuid, p_date date, p_start_hm text, p_end_hm text, p_status text, p_override_reason text default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- ★B-5②: 定休日ハード拒否(create/update 共通・ロール照合の後=他店曜日の probing 防止)
  if public.shift_is_closed_day(v_cast.store_id, p_date) then
    raise exception 'closed day';
  end if;
  -- ★0125 裁定112 判断F: 出勤不可はソフト拒否(定休日=ハードとの非対称)。理由付きで押し切り可・理由は不可日のみ保存
  v_unavail := exists (select 1 from public.cast_unavailable_days u
                        where u.cast_id = p_cast_id and u.date = p_date);
  if v_unavail and (p_override_reason is null or btrim(p_override_reason) = '') then
    raise exception 'unavailable';
  end if;
  v_reason := case when v_unavail then p_override_reason else null end;
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

revoke all on function public.shift_set(uuid, uuid, date, text, text, text, text) from public;
revoke all on function public.shift_set(uuid, uuid, date, text, text, text, text) from anon;
grant execute on function public.shift_set(uuid, uuid, date, text, text, text, text) to authenticated;

-- ============================================================
-- 器5: shift_bulk_set_daily 新設(判断C: 日別時間の一括・スキップ返却型)
--    items = [{date, start_hm, end_hm, override_reason?}]。既存 shift_bulk_set は無変更で残置(別名=オーバーロード回避)
--    skipped は理由付き [{date, reason: closed|duplicate|unavailable}](UI の最終防衛。UI は保存前解消が原則=v6)
-- ============================================================
create or replace function public.shift_bulk_set_daily(p_cast_id uuid, p_items jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
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

-- 新設3関数+bulk_daily の grant 整備(revoke public/anon・authenticated へ execute)
revoke all on function public.cast_unavailable_set(uuid, date, text) from public;
revoke all on function public.cast_unavailable_set(uuid, date, text) from anon;
grant execute on function public.cast_unavailable_set(uuid, date, text) to authenticated;
revoke all on function public.cast_unavailable_remove(uuid, date) from public;
revoke all on function public.cast_unavailable_remove(uuid, date) from anon;
grant execute on function public.cast_unavailable_remove(uuid, date) to authenticated;
revoke all on function public.cast_unavailable_list(uuid, date, date) from public;
revoke all on function public.cast_unavailable_list(uuid, date, date) from anon;
grant execute on function public.cast_unavailable_list(uuid, date, date) to authenticated;
revoke all on function public.shift_bulk_set_daily(uuid, jsonb) from public;
revoke all on function public.shift_bulk_set_daily(uuid, jsonb) from anon;
grant execute on function public.shift_bulk_set_daily(uuid, jsonb) to authenticated;

commit;

-- ============================================================
-- 検証バンドル(単一結果セット)
-- ============================================================
select ord, tag, ok from (

  select 1 as ord, 'tbl: cast_unavailable_days 存在+UNIQUE(cast_id,date)' as tag,
         exists (select 1 from pg_constraint
                  where conrelid = 'public.cast_unavailable_days'::regclass
                    and contype = 'u'
                    and pg_get_constraintdef(oid) like '%cast_id, date%') as ok
  union all
  select 2, 'tbl: RLS 有効・policy 0本(RPC 専用)',
         (select relrowsecurity from pg_class where oid = 'public.cast_unavailable_days'::regclass)
         and (select count(*) from pg_policies
               where schemaname='public' and tablename='cast_unavailable_days') = 0
  union all
  select 3, 'tbl: authenticated/anon の直接権限なし',
         not has_table_privilege('authenticated', 'public.cast_unavailable_days', 'SELECT')
         and not has_table_privilege('authenticated', 'public.cast_unavailable_days', 'INSERT')
         and not has_table_privilege('anon', 'public.cast_unavailable_days', 'SELECT')
  union all
  select 4, 'tbl: touch_updated_at trigger あり',
         exists (select 1 from pg_trigger
                  where tgrelid = 'public.cast_unavailable_days'::regclass
                    and not tgisinternal and tgname like '%touch_updated_at%')
  union all
  select 5, 'col: shifts.override_reason あり',
         exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='shifts' and column_name='override_reason')
  union all
  select 6, 'shift_set: 旧6引数の撤去+新7引数ちょうど1本(オーバーロード増殖なし)',
         (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='shift_set' and p.prokind='f') = 1
         and exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='public' and p.proname='shift_set' and p.prokind='f'
                        and p.pronargs = 7)
  union all
  select 7, 'shift_set: 不可ソフト拒否あり(unavailable)+既存ガード残存(closed day/duplicate)',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='shift_set' and p.prokind='f'
                    and p.prosrc like '%unavailable%'
                    and p.prosrc like '%closed day%'
                    and p.prosrc like '%duplicate%')
  union all
  select 8, 'shift_set: grants(authenticated=可・anon=不可)',
         has_function_privilege('authenticated', 'public.shift_set(uuid,uuid,date,text,text,text,text)', 'EXECUTE')
         and not has_function_privilege('anon', 'public.shift_set(uuid,uuid,date,text,text,text,text)', 'EXECUTE')
  union all
  select 9, 'bulk_daily: 存在(pronargs=2)+スキップ3理由',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='shift_bulk_set_daily' and p.prokind='f'
                    and p.pronargs = 2
                    and p.prosrc like '%''closed''%'
                    and p.prosrc like '%''duplicate''%'
                    and p.prosrc like '%''unavailable''%')
  union all
  select 10, 'bulk_daily: grants(authenticated=可・anon=不可)',
         has_function_privilege('authenticated', 'public.shift_bulk_set_daily(uuid,jsonb)', 'EXECUTE')
         and not has_function_privilege('anon', 'public.shift_bulk_set_daily(uuid,jsonb)', 'EXECUTE')
  union all
  select 11, 'unavailable RPC 3本: 存在+grants',
         (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.prokind='f'
             and p.proname in ('cast_unavailable_set','cast_unavailable_remove','cast_unavailable_list')) = 3
         and has_function_privilege('authenticated', 'public.cast_unavailable_set(uuid,date,text)', 'EXECUTE')
         and not has_function_privilege('anon', 'public.cast_unavailable_list(uuid,date,date)', 'EXECUTE')
  union all
  select 12, '既存 bulk_set: 無変更で残置(pronargs=4・1本)',
         (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='shift_bulk_set' and p.prokind='f' and p.pronargs=4) = 1
  union all
  select 13, 'wish_decide: 無変更(判断G''・時刻引数なしのまま pronargs=2)',
         (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='shift_wish_decide' and p.prokind='f' and p.pronargs=2) = 1

) v order by ord;
