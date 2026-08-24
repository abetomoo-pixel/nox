-- =====================================================================
-- NOX mig0103_shift_constraints_rpc.sql  （SC レーン＝シフト作成 v3・DB 編）
-- 起草: 相談役 2026-08-24   底本: live pg_get_functiondef（dev hiqbfagmkrdpmlqhkmsu）
-- ★非冪等＝再貼り厳禁（制約追加 ×3・dedupe DML・index drop・新関数 ×2）
-- ★手貼り順: 0102 適用済みの上で本ファイル1回 → 末尾診断（最終 SELECT）→ 本文末尾の notify 済み
-- 内容:
--  (1) btree_gist 確認
--  (2) shifts dedupe（confirmed>proposed>planned・新しい順で1行残す・消える行の wish は withdrawn）
--      → UNIQUE (cast_id, date)  ※安全弁: 同一群に confirmed 2行以上なら raise 停止
--  (3) shift_wishes dedupe（shifts 参照行優先・新しい順）→ 部分 UNIQUE (cast_id,date) where pending/accepted
--  (4) shift_periods 排他制約（store_id =, daterange(start,end,'[]') &&）
--  (5) shift_period_set: exclusion_violation → 'overlap'
--  (6) shift_set: 同日既存 → 'duplicate'（insert/update とも）
--  (7) shift_wish_submit: open 期間内ガード → 'period_not_open'／同日 live wish → 'duplicate wish'
--  (8) shift_wish_decide: accept 時 同日既存 shift → 'duplicate'
--  (9) shift_auto_apply: ループ内 同日既存 shift → 'duplicate: <wish_id>'
-- (10) 新規 shift_bulk_set(p_cast_id, p_dates date[], p_start_hm, p_end_hm) returns jsonb
-- (11) 新規 shift_remove(p_id) returns uuid
-- (12) ACL（新規2本: revoke public,anon → grant authenticated）／末尾診断
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0) 貼り先証明
-- ---------------------------------------------------------------------
do $chk$
begin
  if to_regclass('public.shift_periods') is null then
    raise exception 'wrong target: shift_periods missing (0101 not applied)';
  end if;
  if to_regclass('public.attendance') is null or to_regclass('public.shift_wishes') is null then
    raise exception 'wrong target: attendance/shift_wishes missing';
  end if;
  if to_regprocedure('public.shift_auto_apply(uuid,uuid[])') is null
     or to_regprocedure('public.shift_period_set(uuid,uuid,date,date,date,text)') is null then
    raise exception 'wrong target: 0102 RPC missing';
  end if;
  if exists (select 1 from pg_constraint where conname = 'shifts_cast_date_key')
     or exists (select 1 from pg_constraint where conname = 'shift_periods_no_overlap')
     or to_regprocedure('public.shift_remove(uuid)') is not null
     or to_regprocedure('public.shift_bulk_set(uuid,date[],text,text)') is not null then
    raise exception 'already applied: 0103';
  end if;
end $chk$;

create temp table if not exists _mig0103_log (k text, v text);

-- ---------------------------------------------------------------------
-- 1) btree_gist（extensions・既在なら no-op）
-- ---------------------------------------------------------------------
create extension if not exists btree_gist with schema extensions;

do $chk$
begin
  if not exists (select 1 from pg_opclass where opcname = 'gist_uuid_ops') then
    raise exception 'btree_gist opclass gist_uuid_ops not found';
  end if;
end $chk$;

-- ---------------------------------------------------------------------
-- 2) shifts dedupe → UNIQUE (cast_id, date)
-- ---------------------------------------------------------------------
-- 安全弁: 同一 (cast_id,date) に confirmed が2行以上 → 機械で決めない・停止
do $chk$
declare v_n int;
begin
  select count(*) into v_n from (
    select s.cast_id, s.date from public.shifts s
     where s.status = 'confirmed'
     group by s.cast_id, s.date having count(*) > 1) x;
  if v_n > 0 then
    raise exception 'dedupe stop: % (cast,date) groups have 2+ confirmed rows', v_n;
  end if;
end $chk$;

create temp table _shift_dupes on commit drop as
with ranked as (
  select s.id, s.wish_id,
         row_number() over (
           partition by s.cast_id, s.date
           order by case s.status when 'confirmed' then 3 when 'proposed' then 2 else 1 end desc,
                    s.created_at desc, s.id desc) as rn
    from public.shifts s)
select id, wish_id from ranked where rn > 1;

-- 消える行の wish は withdrawn（pending に戻すと必ず duplicate で落ちるため）
update public.shift_wishes w
   set status = 'withdrawn', updated_at = now()
 where w.id in (select d.wish_id from _shift_dupes d where d.wish_id is not null)
   and w.status in ('pending','accepted');

insert into _mig0103_log select 'shifts_dedupe_wishes_withdrawn', count(*)::text
  from public.shift_wishes w where w.id in (select d.wish_id from _shift_dupes d where d.wish_id is not null);

delete from public.shifts s using _shift_dupes d where s.id = d.id;
insert into _mig0103_log select 'shifts_dedupe_deleted', count(*)::text from _shift_dupes;

alter table public.shifts add constraint shifts_cast_date_key unique (cast_id, date);
drop index if exists public.shifts_cast_date_idx;   -- UNIQUE index が同キーを覆う

-- ---------------------------------------------------------------------
-- 3) shift_wishes dedupe → 部分 UNIQUE
-- ---------------------------------------------------------------------
create temp table _wish_dupes on commit drop as
with ranked as (
  select w.id,
         row_number() over (
           partition by w.cast_id, w.date
           order by (exists (select 1 from public.shifts s where s.wish_id = w.id)) desc,
                    w.created_at desc, w.id desc) as rn
    from public.shift_wishes w
   where w.status in ('pending','accepted'))
select id from ranked where rn > 1;

update public.shift_wishes w
   set status = 'withdrawn', updated_at = now()
 where w.id in (select d.id from _wish_dupes d);

insert into _mig0103_log select 'wishes_dedupe_withdrawn', count(*)::text from _wish_dupes;

create unique index shift_wishes_cast_date_live_uidx
  on public.shift_wishes (cast_id, date)
  where status in ('pending','accepted');

-- ---------------------------------------------------------------------
-- 4) shift_periods 排他制約（同一店舗で日付範囲が重なる期間を禁止）
-- ---------------------------------------------------------------------
alter table public.shift_periods
  add constraint shift_periods_no_overlap
  exclude using gist (store_id with =, daterange(start_date, end_date, '[]') with &&);

-- ---------------------------------------------------------------------
-- 5) shift_period_set（同 arity・ACL 継承）: exclusion_violation → 'overlap'
-- ---------------------------------------------------------------------
create or replace function public.shift_period_set(p_id uuid, p_store_id uuid, p_start_date date, p_end_date date, p_wish_deadline date, p_status text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

-- ---------------------------------------------------------------------
-- 6) shift_set（同 arity・ACL 継承）: 同日既存 → 'duplicate'
-- ---------------------------------------------------------------------
create or replace function public.shift_set(p_id uuid, p_cast_id uuid, p_date date, p_start_hm text, p_end_hm text, p_status text)
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
  -- ★0103 SD-9: 1日1枠（同一 cast・同一 date）。制約 shifts_cast_date_key が最終防衛
  if exists (select 1 from public.shifts s
              where s.cast_id = p_cast_id and s.date = p_date
                and (p_id is null or s.id <> p_id)) then
    raise exception 'duplicate';
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
$function$;

-- ---------------------------------------------------------------------
-- 7) shift_wish_submit（同 arity・ACL 継承）: open 期間内ガード・同日 live wish ガード
-- ---------------------------------------------------------------------
create or replace function public.shift_wish_submit(p_date date, p_start_hm text, p_end_hm text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  -- ★B-5②: 定休日ハード拒否（date=営業日そのもの・時間外は拒否しない=経営側 UI 警告・未設定は通す）
  if public.shift_is_closed_day(v_row.store_id, p_date) then
    raise exception 'closed day';
  end if;
  -- ★0103 裁定43: 提出可能日 = 自店の open 期間内のみ（open 期間が無ければ fail-closed）。締切は表示のみ（SD-6）
  if not exists (select 1 from public.shift_periods p
                  where p.store_id = v_row.store_id and p.status = 'open'
                    and p_date between p.start_date and p.end_date) then
    raise exception 'period_not_open';
  end if;
  -- ★0103: 同一 cast・同一 date の live wish（pending/accepted）は1件。index shift_wishes_cast_date_live_uidx が最終防衛
  if exists (select 1 from public.shift_wishes w
              where w.cast_id = v_cast and w.date = p_date and w.status in ('pending','accepted')) then
    raise exception 'duplicate wish';
  end if;
  insert into public.shift_wishes (org_id, store_id, cast_id, date, start_hm, end_hm)
  values (v_row.org_id, v_row.store_id, v_cast, p_date, p_start_hm, p_end_hm)
  returning id into v_id;
  perform public.audit_log_write('shift_wish_submit', 'shift_wishes:' || v_id::text, null,
    (select to_jsonb(w) from public.shift_wishes w where w.id = v_id), v_row.store_id);
  return v_id;
end $function$;

-- ---------------------------------------------------------------------
-- 8) shift_wish_decide（同 arity・ACL 継承）: accept 時 同日既存 shift → 'duplicate'
-- ---------------------------------------------------------------------
create or replace function public.shift_wish_decide(p_wish_id uuid, p_accept boolean)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_wish record; v_actor uuid; v_shift uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_accept is null then raise exception 'bad accept'; end if;
  select * into v_wish from public.shift_wishes where id = p_wish_id;
  if v_wish.id is null or v_wish.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_wish.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_wish.status <> 'pending' then raise exception 'already decided'; end if;
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

-- ---------------------------------------------------------------------
-- 9) shift_auto_apply（同 arity・ACL 継承）: ループ内 同日既存 shift → 'duplicate: <wish_id>'
-- ---------------------------------------------------------------------
create or replace function public.shift_auto_apply(p_period_id uuid, p_wish_ids uuid[])
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    -- ★0103 SD-9: 手動行・他 period 行との同日重複は全体を落とす（原子）
    if exists (select 1 from public.shifts s
                where s.cast_id = v_wish.cast_id and s.date = v_wish.date) then
      raise exception 'duplicate: %', v_wid;
    end if;
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
$function$;

-- ---------------------------------------------------------------------
-- 10) 新規 shift_bulk_set（裁定45 v1・原子・planned/manual・定休日と同日既存はスキップ）
-- ---------------------------------------------------------------------
create or replace function public.shift_bulk_set(p_cast_id uuid, p_dates date[], p_start_hm text, p_end_hm text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_cast record; v_actor uuid; v_dates date[]; v_d date; v_id uuid;
  v_ins int := 0; v_ids uuid[] := '{}'; v_skip date[] := '{}';
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_dates is null then raise exception 'bad dates'; end if;
  if p_start_hm is null or p_start_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_end_hm   is null or p_end_hm   !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select array_agg(distinct t.d order by t.d) into v_dates
    from unnest(p_dates) as t(d) where t.d is not null;
  if coalesce(array_length(v_dates,1),0) = 0 then
    return jsonb_build_object('inserted', 0, 'skipped', '[]'::jsonb);   -- ★完全 no-op
  end if;
  if array_length(v_dates,1) > 62 then raise exception 'too many dates'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  foreach v_d in array v_dates loop
    -- 定休日・同日既存はスキップ（raise しない＝一括の性質）
    if public.shift_is_closed_day(v_cast.store_id, v_d)
       or exists (select 1 from public.shifts s where s.cast_id = p_cast_id and s.date = v_d) then
      v_skip := v_skip || v_d;
      continue;
    end if;
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, source, created_by)
    values (v_cast.org_id, v_cast.store_id, p_cast_id, v_d, p_start_hm, p_end_hm, 'planned', 'manual', v_actor)
    returning id into v_id;
    v_ids := v_ids || v_id;
    v_ins := v_ins + 1;
  end loop;

  perform public.audit_log_write('shift_bulk_set', 'casts:' || p_cast_id::text, null,
    jsonb_build_object('inserted', v_ins, 'shift_ids', to_jsonb(v_ids), 'skipped', to_jsonb(v_skip),
                       'start_hm', p_start_hm, 'end_hm', p_end_hm),
    v_cast.store_id);
  return jsonb_build_object('inserted', v_ins, 'skipped', to_jsonb(v_skip));
end
$function$;

-- ---------------------------------------------------------------------
-- 11) 新規 shift_remove（裁定D: confirmed は出勤記録が無い時のみ・wish は pending 復元）
-- ---------------------------------------------------------------------
create or replace function public.shift_remove(p_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_s record; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_id is null then raise exception 'bad id'; end if;
  select * into v_s from public.shifts where id = p_id;
  if v_s.id is null or v_s.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_s.store_id = public.auth_store_id())) then
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

-- ---------------------------------------------------------------------
-- 12) ACL（新規2本のみ・改修5本は同署名 create or replace で ACL 継承）
-- ---------------------------------------------------------------------
revoke execute on function public.shift_bulk_set(uuid, date[], text, text) from public, anon;
grant  execute on function public.shift_bulk_set(uuid, date[], text, text) to authenticated;
revoke execute on function public.shift_remove(uuid) from public, anon;
grant  execute on function public.shift_remove(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 末尾診断（最終 SELECT・全行 ok=true が合格）
-- ---------------------------------------------------------------------
select k, v, ok from (
  select 'ext_btree_gist' k, extnamespace::regnamespace::text v,
         (extnamespace::regnamespace::text = 'extensions') ok
    from pg_extension where extname = 'btree_gist'
  union all
  select 'shifts_cast_date_key', count(*)::text, count(*) = 1
    from pg_constraint where conname = 'shifts_cast_date_key' and contype = 'u'
  union all
  select 'shifts_cast_date_idx_dropped', count(*)::text, count(*) = 0
    from pg_indexes where schemaname = 'public' and indexname = 'shifts_cast_date_idx'
  union all
  select 'shift_wishes_cast_date_live_uidx', count(*)::text, count(*) = 1
    from pg_indexes where schemaname = 'public' and indexname = 'shift_wishes_cast_date_live_uidx'
  union all
  select 'shift_periods_no_overlap', count(*)::text, count(*) = 1
    from pg_constraint where conname = 'shift_periods_no_overlap' and contype = 'x'
  union all
  select 'shifts_dupes_now', count(*)::text, count(*) = 0
    from (select cast_id, date from public.shifts group by 1,2 having count(*) > 1) x
  union all
  select 'wishes_live_dupes_now', count(*)::text, count(*) = 0
    from (select cast_id, date from public.shift_wishes where status in ('pending','accepted')
           group by 1,2 having count(*) > 1) x
  union all
  select 'fn_shift_period_set', (to_regprocedure('public.shift_period_set(uuid,uuid,date,date,date,text)') is not null)::text,
         to_regprocedure('public.shift_period_set(uuid,uuid,date,date,date,text)') is not null
  union all
  select 'fn_shift_set',        (to_regprocedure('public.shift_set(uuid,uuid,date,text,text,text)') is not null)::text,
         to_regprocedure('public.shift_set(uuid,uuid,date,text,text,text)') is not null
  union all
  select 'fn_shift_wish_submit', (to_regprocedure('public.shift_wish_submit(date,text,text)') is not null)::text,
         to_regprocedure('public.shift_wish_submit(date,text,text)') is not null
  union all
  select 'fn_shift_wish_decide', (to_regprocedure('public.shift_wish_decide(uuid,boolean)') is not null)::text,
         to_regprocedure('public.shift_wish_decide(uuid,boolean)') is not null
  union all
  select 'fn_shift_auto_apply', (to_regprocedure('public.shift_auto_apply(uuid,uuid[])') is not null)::text,
         to_regprocedure('public.shift_auto_apply(uuid,uuid[])') is not null
  union all
  select 'fn_shift_bulk_set', (to_regprocedure('public.shift_bulk_set(uuid,date[],text,text)') is not null)::text,
         to_regprocedure('public.shift_bulk_set(uuid,date[],text,text)') is not null
  union all
  select 'fn_shift_remove', (to_regprocedure('public.shift_remove(uuid)') is not null)::text,
         to_regprocedure('public.shift_remove(uuid)') is not null
  union all
  select 'prosrc_marks_0103', count(*)::text, count(*) = 7
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('shift_period_set','shift_set','shift_wish_submit','shift_wish_decide','shift_auto_apply','shift_bulk_set','shift_remove')
     and (p.prosrc like '%0103%' or p.proname in ('shift_bulk_set','shift_remove'))
  union all
  select 'acl_bulk_anon_no',  has_function_privilege('anon','public.shift_bulk_set(uuid,date[],text,text)','execute')::text,
         not has_function_privilege('anon','public.shift_bulk_set(uuid,date[],text,text)','execute')
  union all
  select 'acl_bulk_auth_yes', has_function_privilege('authenticated','public.shift_bulk_set(uuid,date[],text,text)','execute')::text,
         has_function_privilege('authenticated','public.shift_bulk_set(uuid,date[],text,text)','execute')
  union all
  select 'acl_remove_anon_no', has_function_privilege('anon','public.shift_remove(uuid)','execute')::text,
         not has_function_privilege('anon','public.shift_remove(uuid)','execute')
  union all
  select 'acl_remove_auth_yes', has_function_privilege('authenticated','public.shift_remove(uuid)','execute')::text,
         has_function_privilege('authenticated','public.shift_remove(uuid)','execute')
  union all
  select 'acl_submit_anon_no', has_function_privilege('anon','public.shift_wish_submit(date,text,text)','execute')::text,
         not has_function_privilege('anon','public.shift_wish_submit(date,text,text)','execute')
  union all
  select k, v, true from _mig0103_log
) d order by 1;
