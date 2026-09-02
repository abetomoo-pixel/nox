-- =============================================================
-- mig0126: 裁定114 shift_confirm_bulk 新設
--   planned/proposed → confirmed 一括・raise 型(shift_propose 相似)・上限62
--   底本: docs/dp/live_0126prep.sql(shift_propose 逐語・sha256 77860b25…eb25b)
--   冪等: 可(新設・create or replace のみ・DROP なし)
-- =============================================================
begin;

-- [0] audit 新 action フェイルファスト(恒久注意#2・0125 の型。NOX は現状 CHECK なし=素通り想定)
do $mig$
declare v_chk text;
begin
  select pg_get_constraintdef(c.oid) into v_chk
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname = 'audit_logs'
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%action%';
  if v_chk is not null then
    raise exception 'audit_logs.action CHECK が存在: % — 本 mig と同時更新が必要', v_chk;
  end if;
end
$mig$;

-- [1] 本体(shift_propose の写し・status 置換+上限62)
create or replace function public.shift_confirm_bulk(p_shift_ids uuid[])
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
              or (public.auth_role() = 'manager' and s.store_id = public.auth_store_id()));
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

-- [2] 権限(新設定型: public/anon 剥奪+authenticated のみ)
revoke all on function public.shift_confirm_bulk(uuid[]) from public, anon;
grant execute on function public.shift_confirm_bulk(uuid[]) to authenticated;

commit;

-- [3] 検証バンドル(単一結果セット・全列が true で緑)
select
  (select count(*) = 1
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'shift_confirm_bulk'
      and p.prokind = 'f')                                                as fn_exactly_one,
  (select p.pronargs = 1
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'shift_confirm_bulk'
      and p.prokind = 'f')                                                as pronargs_1,
  (select p.prosecdef
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'shift_confirm_bulk'
      and p.prokind = 'f')                                                as security_definer,
  (select position('too many' in p.prosrc) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'shift_confirm_bulk'
      and p.prokind = 'f')                                                as prosrc_limit62,
  (select position('''confirmed''' in p.prosrc) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'shift_confirm_bulk'
      and p.prokind = 'f')                                                as prosrc_confirmed,
  (select position('concurrent change' in p.prosrc) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'shift_confirm_bulk'
      and p.prokind = 'f')                                                as prosrc_rowcount_guard,
  (select position('not in (''planned'',''proposed'')' in p.prosrc) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'shift_confirm_bulk'
      and p.prokind = 'f')                                                as prosrc_status_pair,
  not has_function_privilege('anon',
      'public.shift_confirm_bulk(uuid[])', 'execute')                     as anon_revoked,
  has_function_privilege('authenticated',
      'public.shift_confirm_bulk(uuid[])', 'execute')                     as authenticated_granted;
