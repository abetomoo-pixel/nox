-- b5_dump.sql  payroll 系 RPC の live dump（2026-09-10 14:41:00 JST・nox-dev・pg_get_functiondef 逐語・読取のみ）
-- proof: {"k":"nox-project-proof","n":"3"}
-- 対象: 10 本 = auth_staff_can_close, auth_staff_can_reopen, payment_record_add, payroll_finalize, payroll_mark_paid, payroll_reopen, payroll_run_create, report_can_close, report_can_reopen, withholding_payment_record

-- ============================================================
-- auth_staff_can_close()  secdef=true volatile=s acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.auth_staff_can_close()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(m.can_close, false) from public.memberships m
  join public.users u on u.id = m.user_id
  where u.auth_user_id = auth.uid() and u.is_active and m.is_active
$function$

;

-- ============================================================
-- auth_staff_can_reopen()  secdef=true volatile=s acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.auth_staff_can_reopen()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(m.can_reopen, false) from public.memberships m
  join public.users u on u.id = m.user_id
  where u.auth_user_id = auth.uid() and u.is_active and m.is_active
$function$

;

-- ============================================================
-- payment_record_add(uuid,uuid,integer,date,text,text,uuid)  secdef=true volatile=v acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.payment_record_add(p_run_id uuid, p_cast_id uuid, p_amount integer, p_paid_at date, p_method text, p_note text, p_idem_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run record; v_net int; v_paid int; v_actor uuid; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  if p_paid_at is null then raise exception 'bad date'; end if;
  if p_idem_key is null then raise exception 'idem required'; end if;
  select id, org_id, store_id, status into v_run from public.payroll_runs where id = p_run_id;
  if v_run.id is null or v_run.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_run.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_run.status not in ('finalized','paid') then raise exception 'run not finalized'; end if;

  select id into v_id from public.payment_records where idem_key = p_idem_key;
  if v_id is not null then return v_id; end if;

  select net into v_net from public.payslips where run_id = p_run_id and cast_id = p_cast_id for update;
  if v_net is null then raise exception 'no payslip'; end if;
  select coalesce(sum(paid_amount), 0) into v_paid from public.payment_records where run_id = p_run_id and cast_id = p_cast_id;
  if v_paid + p_amount > v_net then raise exception 'exceeds net'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.payment_records (org_id, store_id, run_id, cast_id, paid_amount, paid_at, method, note, idem_key, created_by)
  values (v_run.org_id, v_run.store_id, p_run_id, p_cast_id, p_amount, p_paid_at, nullif(trim(coalesce(p_method,'')),''), nullif(trim(coalesce(p_note,'')),''), p_idem_key, v_actor)
  on conflict (idem_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.payment_records where idem_key = p_idem_key; return v_id;
  end if;

  perform public.audit_log_write('payment_record_add', 'payment_records:' || v_id::text,
    null, jsonb_build_object('run_id', p_run_id, 'cast_id', p_cast_id, 'paid_amount', p_amount, 'paid_at', p_paid_at), v_run.store_id);
  return v_id;
end $function$

;

-- ============================================================
-- payroll_finalize(uuid,uuid,uuid,uuid,jsonb)  secdef=true volatile=v acl={postgres=X/postgres,service_role=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.payroll_finalize(p_org_id uuid, p_actor uuid, p_run_id uuid, p_idem_key uuid, p_payslips jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid;
  v_store   uuid;
  v_period  text;
  v_status  text;
  v_idem    uuid;
  v_old_ps  date;
  v_old_pe  date;
  v_new_ps  date;
  v_new_pe  date;
  v_retired jsonb;
  v_count   int;
  v_next    text;      -- 繰越先 period（翌月）
  v_ps      jsonb;     -- payslip 要素
  v_arrec   jsonb;     -- 退避 breakdown.ar の1要素（巻き戻し用）
  v_advrec  jsonb;     -- 退避 breakdown.adv の1要素（巻き戻し用・F2e-2）
  v_okrec   jsonb;     -- 退避 breakdown.okuri の1要素（巻き戻し用・F2e-2）
  v_ar      jsonb;     -- 適用 ar 記録（凍結 breakdown へ注入）
  v_advarr  jsonb;     -- 適用 adv 記録（F2e-2）
  v_okarr   jsonb;     -- 適用 okuri 記録（F2e-2）
  v_arentry jsonb;     -- ar_deducted/ar_carried の1要素
  v_adentry jsonb;     -- adv_deducted/adv_carried の1要素（F2e-2）
  v_okentry jsonb;     -- okuri_deducted の1要素（F2e-2）
  v_cast    uuid;      -- payslip の cast_id（casts 照合済み）
  v_rid     uuid;      -- receivable id
  v_aid     uuid;      -- advance id（F2e-2）
  v_tid     uuid;      -- transport id（F2e-2）
  v_amt     int;       -- deducted 額
  v_recv    record;    -- receivable 現行行
  v_adv     record;    -- advance 現行行（F2e-2）
  v_tr      record;    -- transport 現行行（F2e-2）
  v_full    boolean;   -- 全額天引きか
  v_bd      jsonb;     -- 凍結 breakdown（ar/adv/okuri 注入後）
  v_applied     jsonb; -- audit: 適用 receivable 遷移
  v_applied_adv jsonb; -- audit: 適用 advance 遷移（F2e-2）
  v_applied_ok  jsonb; -- audit: 適用 transport 遷移（F2e-2）
  v_rolled      jsonb; -- audit: 巻き戻し receivable
  v_rolled_adv  jsonb; -- audit: 巻き戻し advance（F2e-2）
  v_rolled_ok   jsonb; -- audit: 巻き戻し transport（F2e-2）
begin
  -- run 取得＋org 照合（現行どおり）
  select org_id, store_id, period, status, finalize_idem_key, period_start, period_end
    into v_org, v_store, v_period, v_status, v_idem, v_old_ps, v_old_pe
    from public.payroll_runs where id = p_run_id;
  if v_org is null then raise exception 'run not found'; end if;
  if p_org_id is null or v_org <> p_org_id then raise exception 'forbidden'; end if;

  -- 冪等（現行どおり・replay は遷移も巻き戻しもしない＝二重実行防止のみ）
  if p_idem_key is not null and v_status = 'finalized' and v_idem is not distinct from p_idem_key then
    select count(*) into v_count from public.payslips where run_id = p_run_id;
    return v_count;
  end if;

  -- paid 後は再確定/差し替え不可（現行どおり・巻き戻し不可を含意）
  if v_status = 'paid' then raise exception 'run paid'; end if;

  -- 器の形式検証（現行どおり）
  if p_payslips is null or jsonb_typeof(p_payslips) <> 'array' then raise exception 'bad payslips'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payslips) e
    where e->>'cast_id' is null or e->>'net' is null
       or e->'breakdown'->'pay' is null
       or jsonb_typeof(e->'breakdown'->'extras') <> 'array'
  ) then raise exception 'bad payslip shape'; end if;
  -- 空配列拒否（現行どおり）
  if jsonb_array_length(p_payslips) = 0 then raise exception 'empty payslips'; end if;

  -- 差し替え前 breakdown_json を退避（現行どおり）
  select jsonb_agg(jsonb_build_object('cast_id', ps.cast_id, 'net', ps.net, 'breakdown', ps.breakdown_json))
    into v_retired from public.payslips ps where ps.run_id = p_run_id;

  -- 期間窓を単一ソース（現行どおり）
  select pb.period_start, pb.period_end into v_new_ps, v_new_pe from public.period_bounds(v_period) pb;

  -- (A) 繰越先 period（翌月）
  v_next := to_char((to_date(v_period || '-01', 'YYYY-MM-DD') + interval '1 month'), 'YYYY-MM');

  -- (B) 巻き戻しフェーズ（再確定・未 paid）: 退避 payslip の breakdown.ar/.adv/.okuri を条件付き復元（drift は触らない）
  --   ── ar（receivables・mig0018 と一字一致）──
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
  --   ── adv（advances・ar と同型・F2e-2 追加）──
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
  --   ── okuri（transport・繰越なし＝deduct_period 列なし・status/deducted_amount のみ・F2e-2 追加）──
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

  -- (C) 原子的差し替え（未 paid のみ）。delete 後 FOR ループで ar/adv/okuri 処理しつつ insert
  delete from public.payslips where run_id = p_run_id;
  v_count := 0;
  v_applied     := '[]'::jsonb;
  v_applied_adv := '[]'::jsonb;
  v_applied_ok  := '[]'::jsonb;
  for v_ps in select ae from lateral jsonb_array_elements(p_payslips) ae loop
    -- casts 照合（他 org/他店 cast 混入除去＝現行 join と同義・混入は落とす）
    select c.id into v_cast from public.casts c
      where c.id = (v_ps->>'cast_id')::uuid and c.org_id = v_org and c.store_id = v_store;
    if v_cast is null then continue; end if;
    v_ar     := '[]'::jsonb;
    v_advarr := '[]'::jsonb;
    v_okarr  := '[]'::jsonb;

    -- ═══ ar（receivables・mig0018 と一字一致）═══
    -- ar_deducted: {receivable_id, amount} を deducted_amount 加算・全額なら deducted・部分なら open+翌月繰越
    if jsonb_typeof(v_ps->'ar_deducted') = 'array' then
      for v_arentry in select ae from lateral jsonb_array_elements(v_ps->'ar_deducted') ae loop
        v_rid := (v_arentry->>'receivable_id')::uuid;
        v_amt := (v_arentry->>'amount')::int;
        select * into v_recv from public.receivables where id = v_rid for update;
        if v_recv.id is null or v_recv.org_id <> v_org or v_recv.cast_id is distinct from v_cast
           or v_recv.status <> 'open' or not v_recv.deduct_from_cast
           or v_amt <= 0 or v_recv.deducted_amount + v_amt > v_recv.amount - v_recv.collected_amount then  -- ★mig0092: 上限＝amount − collected_amount（現金回収済み分への天引き＝過消込を遮断）
          raise exception 'bad receivable';
        end if;
        v_full := (v_recv.deducted_amount + v_amt = v_recv.amount - v_recv.collected_amount);  -- ★mig0092: 完済判定も残高基準（deducted＋collected＝amount で 'deducted'）
        update public.receivables
           set deducted_amount = deducted_amount + v_amt,
               status = case when v_full then 'deducted' else status end,
               deduct_period = case when v_full then deduct_period else v_next end
         where id = v_rid;
        v_ar := v_ar || jsonb_build_object(
          'receivable_id', v_rid, 'action', 'deducted', 'amount', v_amt,
          'prev_status', v_recv.status, 'prev_deduct_period', v_recv.deduct_period, 'prev_deducted_amount', v_recv.deducted_amount,
          'applied_status', case when v_full then 'deducted' else 'open' end,
          'applied_deduct_period', case when v_full then v_recv.deduct_period else v_next end,
          'applied_deducted_amount', v_recv.deducted_amount + v_amt);
        v_applied := v_applied || jsonb_build_object('receivable_id', v_rid, 'amount', v_amt);
      end loop;
    end if;
    -- ar_carried: 引き当てゼロで deduct_period のみ翌月へ（amount 不変）
    if jsonb_typeof(v_ps->'ar_carried') = 'array' then
      for v_arentry in select ae from lateral jsonb_array_elements(v_ps->'ar_carried') ae loop
        v_rid := (v_arentry->>'receivable_id')::uuid;
        select * into v_recv from public.receivables where id = v_rid for update;
        if v_recv.id is null or v_recv.org_id <> v_org or v_recv.cast_id is distinct from v_cast
           or v_recv.status <> 'open' or not v_recv.deduct_from_cast then
          raise exception 'bad receivable';
        end if;
        v_ar := v_ar || jsonb_build_object(
          'receivable_id', v_rid, 'action', 'carried', 'amount', 0,
          'prev_status', v_recv.status, 'prev_deduct_period', v_recv.deduct_period, 'prev_deducted_amount', v_recv.deducted_amount,
          'applied_status', 'open', 'applied_deduct_period', v_next, 'applied_deducted_amount', v_recv.deducted_amount);
        update public.receivables set deduct_period = v_next where id = v_rid;
      end loop;
    end if;

    -- ═══ adv（advances・ar と同型・繰越あり・F2e-2 追加）═══
    if jsonb_typeof(v_ps->'adv_deducted') = 'array' then
      for v_adentry in select ae from lateral jsonb_array_elements(v_ps->'adv_deducted') ae loop
        v_aid := (v_adentry->>'advance_id')::uuid;
        v_amt := (v_adentry->>'amount')::int;
        select * into v_adv from public.advances where id = v_aid for update;
        if v_adv.id is null or v_adv.org_id <> v_org or v_adv.cast_id is distinct from v_cast
           or v_adv.status <> 'open'
           or v_amt <= 0 or v_adv.deducted_amount + v_amt > v_adv.amount then
          raise exception 'bad advance';
        end if;
        v_full := (v_adv.deducted_amount + v_amt = v_adv.amount);
        update public.advances
           set deducted_amount = deducted_amount + v_amt,
               status = case when v_full then 'deducted' else status end,
               deduct_period = case when v_full then deduct_period else v_next end
         where id = v_aid;
        v_advarr := v_advarr || jsonb_build_object(
          'advance_id', v_aid, 'action', 'deducted', 'amount', v_amt,
          'prev_status', v_adv.status, 'prev_deduct_period', v_adv.deduct_period, 'prev_deducted_amount', v_adv.deducted_amount,
          'applied_status', case when v_full then 'deducted' else 'open' end,
          'applied_deduct_period', case when v_full then v_adv.deduct_period else v_next end,
          'applied_deducted_amount', v_adv.deducted_amount + v_amt);
        v_applied_adv := v_applied_adv || jsonb_build_object('advance_id', v_aid, 'amount', v_amt);
      end loop;
    end if;
    if jsonb_typeof(v_ps->'adv_carried') = 'array' then
      for v_adentry in select ae from lateral jsonb_array_elements(v_ps->'adv_carried') ae loop
        v_aid := (v_adentry->>'advance_id')::uuid;
        select * into v_adv from public.advances where id = v_aid for update;
        if v_adv.id is null or v_adv.org_id <> v_org or v_adv.cast_id is distinct from v_cast
           or v_adv.status <> 'open' then
          raise exception 'bad advance';
        end if;
        v_advarr := v_advarr || jsonb_build_object(
          'advance_id', v_aid, 'action', 'carried', 'amount', 0,
          'prev_status', v_adv.status, 'prev_deduct_period', v_adv.deduct_period, 'prev_deducted_amount', v_adv.deducted_amount,
          'applied_status', 'open', 'applied_deduct_period', v_next, 'applied_deducted_amount', v_adv.deducted_amount);
        update public.advances set deduct_period = v_next where id = v_aid;
      end loop;
    end if;

    -- ═══ okuri（transport・繰越なし＝deduct_period なし・部分は open 据置・F2e-2 追加）═══
    if jsonb_typeof(v_ps->'okuri_deducted') = 'array' then
      for v_okentry in select ae from lateral jsonb_array_elements(v_ps->'okuri_deducted') ae loop
        v_tid := (v_okentry->>'transport_id')::uuid;
        v_amt := (v_okentry->>'amount')::int;
        select * into v_tr from public.transport where id = v_tid for update;
        if v_tr.id is null or v_tr.org_id <> v_org or v_tr.cast_id is distinct from v_cast
           or v_tr.status <> 'open'
           or v_amt <= 0 or v_tr.deducted_amount + v_amt > v_tr.amount then
          raise exception 'bad transport';
        end if;
        v_full := (v_tr.deducted_amount + v_amt = v_tr.amount);
        update public.transport
           set deducted_amount = deducted_amount + v_amt,
               status = case when v_full then 'deducted' else status end  -- 繰越なし＝部分は open 据置
         where id = v_tid;
        v_okarr := v_okarr || jsonb_build_object(
          'transport_id', v_tid, 'action', 'deducted', 'amount', v_amt,
          'prev_status', v_tr.status, 'prev_deducted_amount', v_tr.deducted_amount,
          'applied_status', case when v_full then 'deducted' else 'open' end,
          'applied_deducted_amount', v_tr.deducted_amount + v_amt);
        v_applied_ok := v_applied_ok || jsonb_build_object('transport_id', v_tid, 'amount', v_amt);
      end loop;
    end if;

    -- 凍結 breakdown = 入力 breakdown に ar/adv/okuri を注入
    v_bd := (v_ps->'breakdown') || jsonb_build_object('ar', v_ar, 'adv', v_advarr, 'okuri', v_okarr);
    insert into public.payslips (org_id, store_id, run_id, cast_id, period, breakdown_json, net)
    values (v_org, v_store, p_run_id, v_cast, v_period, v_bd, (v_ps->>'net')::int);
    v_count := v_count + 1;
  end loop;

  -- run 更新（現行どおり）
  update public.payroll_runs
     set status = 'finalized', finalized_at = now(),
         finalize_idem_key = p_idem_key,
         period_start = v_new_ps, period_end = v_new_pe
   where id = p_run_id;

  -- (D) #6 service 経路監査: before に退避 breakdown＋旧窓＋巻き戻し(ar/adv/okuri)・after に新件数/新窓/idem＋適用(ar/adv/okuri)
  perform public.audit_log_write_service(v_org, p_actor, 'payroll_finalize',
    'payroll_runs:' || p_run_id::text,
    jsonb_build_object('retired_payslips', coalesce(v_retired, '[]'::jsonb),
                       'old_period_start', v_old_ps, 'old_period_end', v_old_pe,
                       'rolled_back_receivables', v_rolled,
                       'rolled_back_advances', v_rolled_adv,
                       'rolled_back_transport', v_rolled_ok),
    jsonb_build_object('cast_count', v_count, 'period_start', v_new_ps,
                       'period_end', v_new_pe, 'idem_key', p_idem_key,
                       'applied_receivables', v_applied,
                       'applied_advances', v_applied_adv,
                       'applied_transport', v_applied_ok),
    v_store);
  return v_count;
end $function$

;

-- ============================================================
-- payroll_mark_paid(uuid,uuid,uuid,uuid)  secdef=true volatile=v acl={postgres=X/postgres,service_role=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.payroll_mark_paid(p_org_id uuid, p_actor uuid, p_run_id uuid, p_idem_key uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org    uuid;
  v_store  uuid;
  v_status text;
  v_idem   uuid;
begin
  select org_id, store_id, status, paid_idem_key
    into v_org, v_store, v_status, v_idem
    from public.payroll_runs where id = p_run_id;
  if v_org is null then raise exception 'run not found'; end if;
  if p_org_id is null or v_org <> p_org_id then raise exception 'forbidden'; end if;

  -- 冪等（原則9 順序）: 既に paid で同一キーなら成功を返す（二重実行防止）
  if p_idem_key is not null and v_status = 'paid' and v_idem is not distinct from p_idem_key then
    return 'paid';
  end if;

  -- finalized→paid のみ許可（draft/paid からは不可）
  if v_status <> 'finalized' then raise exception 'not finalized'; end if;

  update public.payroll_runs
     set status = 'paid', paid_at = now(), paid_idem_key = p_idem_key
   where id = p_run_id;
  update public.payslips set paid = true where run_id = p_run_id; -- F2e 予約列を一括で立てる（実装ノート【10】）

  -- #6 service 経路監査（actor=p_actor・箱のみ＝実消し込みは F2e）
  perform public.audit_log_write_service(v_org, p_actor, 'payroll_mark_paid',
    'payroll_runs:' || p_run_id::text,
    jsonb_build_object('status', 'finalized'),
    jsonb_build_object('status', 'paid', 'idem_key', p_idem_key), v_store);
  return 'paid';
end $function$

;

-- ============================================================
-- payroll_reopen(uuid,uuid,uuid,uuid,text)  secdef=true volatile=v acl={postgres=X/postgres,service_role=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.payroll_reopen(p_org_id uuid, p_actor uuid, p_run_id uuid, p_idem_key uuid, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$

;

-- ============================================================
-- payroll_run_create(uuid,text)  secdef=true volatile=v acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.payroll_run_create(p_store_id uuid, p_period text)
 RETURNS TABLE(id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store  record;
  v_actor  uuid;
  v_id     uuid;
  v_status text;
begin
  -- 二重防御①: 冒頭 null guard
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  -- 入力検証
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  -- store の org 照合＋ロール判定（owner 全店・manager 自店のみ・staff/cast 不可）
  select s.id, s.org_id into v_store from public.stores s where s.id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 自然冪等: 既存 run があれば id と status を返す（1店1期間・period_start/end は finalize が確定）
  select pr.id, pr.status into v_id, v_status from public.payroll_runs pr
   where pr.store_id = p_store_id and pr.period = p_period;
  if v_id is not null then
    id := v_id; status := v_status; return next; return;
  end if;

  select u.id into v_actor from public.users u where u.auth_user_id = auth.uid() and u.is_active;
  insert into public.payroll_runs (org_id, store_id, period, status, created_by)
  values (public.auth_org_id(), p_store_id, p_period, 'draft', v_actor)
  returning payroll_runs.id into v_id;

  perform public.audit_log_write('payroll_run_create', 'payroll_runs:' || v_id::text,
    null, jsonb_build_object('period', p_period, 'store_id', p_store_id), p_store_id);
  id := v_id; status := 'draft'; return next;
end $function$

;

-- ============================================================
-- report_can_close(uuid)  secdef=true volatile=s acl={postgres=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.report_can_close(p_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (public.auth_role() = 'owner'
       and exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = public.auth_org_id()))
    or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())
    or (public.auth_role() = 'staff' and p_store_id = public.auth_store_id() and public.auth_staff_can_close()),
    false)
$function$

;

-- ============================================================
-- report_can_reopen(uuid)  secdef=true volatile=s acl={postgres=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.report_can_reopen(p_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (public.auth_role() = 'owner'
       and exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = public.auth_org_id()))
    or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())
    or (public.auth_role() = 'staff' and p_store_id = public.auth_store_id() and public.auth_staff_can_reopen()),
    false)
$function$

;

-- ============================================================
-- withholding_payment_record(text,text,date)  secdef=true volatile=v acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ============================================================
CREATE OR REPLACE FUNCTION public.withholding_payment_record(p_target_month text, p_tax_category text, p_paid_on date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_uid  uuid := auth.uid();
  v_paid date;
begin
  if v_org is null or v_role is null or v_uid is null then raise exception 'forbidden'; end if;
  if v_role <> 'owner' then raise exception 'forbidden'; end if;

  if p_target_month is null or p_target_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'bad month';
  end if;
  if p_tax_category is null or p_tax_category not in ('委託','雇用') then
    raise exception 'bad category';
  end if;

  v_paid := coalesce(p_paid_on, (now() at time zone 'Asia/Tokyo')::date);

  -- 既に記録済みなら明示拒否
  if exists (
    select 1 from public.withholding_payments w
    where w.org_id = v_org
      and w.target_month = p_target_month
      and w.tax_category = p_tax_category
  ) then
    raise exception 'already recorded';
  end if;

  insert into public.withholding_payments (org_id, target_month, tax_category, paid_on, recorded_by)
  values (v_org, p_target_month, p_tax_category, v_paid, v_uid);
end $function$

;
