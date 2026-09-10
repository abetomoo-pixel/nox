-- 0142_check_merge_time_auto.sql  (C層③ 補正②・裁定 C③-20・裁定234 型・2026-09-10)
-- 前提: 0139 適用済み。0139 は書き換えない。
-- 内容: check_merge が from の自動時間料金行(time_auto)を into へ移す際、部分 unique check_lines_one_time_auto
--       (check_id, fee_kind, block_no) WHERE time_auto と衝突していた。移送前に time_auto=false・block_no=null へ変換。
--       into 側の check_time_charge_apply/check_set_people は time_auto 行のみ対象=変換行は凍結値のまま合計に残る。
-- 手貼り: SQL Editor で Ctrl+A → Run。末尾 proof で確認。
begin;

-- =====================================================================
-- check_merge 補正②(裁定 C③-20): from の自動時間料金行を手動化してから移送。0139 との差は上記 update 1 文のみ
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

  -- C③-20: from の自動時間料金行(set/vip_charge/extension・time_auto)は手動行へ変換して移す
  -- (into の自動行と check_lines_one_time_auto (check_id, fee_kind, block_no) WHERE time_auto が衝突するため。金額は凍結値のまま残す)
  update public.check_lines set time_auto = false, block_no = null
   where check_id = p_from_check_id and time_auto;
  update public.check_lines       set check_id = p_into_check_id where check_id = p_from_check_id;
  update public.check_nominations set check_id = p_into_check_id where check_id = p_from_check_id;
  update public.check_seats       set check_id = p_into_check_id where check_id = p_from_check_id;
  -- from の主席(checks.seat_id)は into の追加席へ(check_seats は UNIQUE(seat_id)=主席は未登録のため衝突しない)
  if v_from.seat_id is not null and v_from.seat_id <> v_into.seat_id then
    insert into public.check_seats (org_id, store_id, check_id, seat_id)
    values (v_org, v_from.store_id, p_into_check_id, v_from.seat_id)
    on conflict (seat_id) do update set check_id = excluded.check_id;
  end if;
  update public.checks set status = 'merged', merged_into = p_into_check_id, merge_idem_key = p_idem_key
   where id = p_from_check_id;
  perform public.check_recalc(p_into_check_id);

  perform public.audit_log_write('check_merge', 'checks:' || p_into_check_id::text,
    jsonb_build_object('from', p_from_check_id, 'into', p_into_check_id, 'from_total', v_from.total, 'into_total', v_into.total),
    jsonb_build_object('moved_lines', v_lines, 'moved_nominations', v_noms, 'moved_seats', v_seats, 'from_seat_id', v_from.seat_id,
                       'into_total', (select c.total from public.checks c where c.id = p_into_check_id)),
    v_from.store_id, p_reason);
  return p_into_check_id;
end $function$;
revoke execute on function public.check_merge(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.check_merge(uuid, uuid, text, uuid) to authenticated, service_role;


-- proof(期待: converts_auto true / index_def 逐語 / gated 123 不変)
select
  (select prosrc like '%set time_auto = false, block_no = null%' from pg_proc where proname='check_merge') as converts_auto,
  (select indexdef from pg_indexes where schemaname='public' and indexname='check_lines_one_time_auto') as index_def,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosrc like '%billing locked%') as gated;

commit;
