-- mig0060: D1 給与確定解除 payroll_reopen（N1-c 給与レーン最終 RPC・相談役設計6裁定 2026-07-23）
-- 翻訳元: 新設 RPC。(B) 巻き戻しブロックは payroll_finalize の live prosrc
--   （2026-07-23 pg_get_functiondef 取得・dump sha256 88b613ff6abc4da407a4acd97a13a0e51e1ae65104d0afd4c5ba6a0d1ac36d8b）
--   から機械抽出 51 行の逐語写経＝コメント含め一字一致（「（再確定・未 paid）」は写経元の文言）。
--   ガード様式は payroll_mark_paid 写経。migファイルからの写経ではない（記憶再構成なし）。
-- 設計確定（相談役6裁定）: finalized のみ解除可／payment_records 1行でも 'payments exist' 拒否／
--   (B)巻き戻し→payslips delete→draft 不変量（period_start/end・finalized_at・finalize_idem_key 全 NULL）
--   ＋reopen_idem_key=p_idem_key（冪等3本目）／監査 action='payroll_reopen' before/after 完全記録／
--   service 経路＝revoke public,anon,authenticated＋grant service_role のみ／原則9 ガード順序。
-- ★reopen_idem_key の型は uuid（指示書は text 表記だが finalize_idem_key/paid_idem_key uuid・
--   p_idem_key uuid との対称・無 cast 比較のため uuid を採用＝相談役承認時の確認点①）。
-- F0 §7.1 適合: 否定 OR 連鎖ゲートなし（全ガード raise 直書き・'p_org_id is null or v_org <> p_org_id'
--   は deny 側 OR＝null→raise の fail-closed）。
--
-- 検証（適用後・SQL Editor）:
-- 0) 貼り先証明（Run 前に URL の ref 目視＋これを先頭で実行）:
--    select 'nox-project-proof', count(*) from public.orgs;
-- 1) 署名一意（1行・引数 'p_org_id uuid, p_actor uuid, p_run_id uuid, p_idem_key uuid'・prosecdef=t）:
--    select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname = 'payroll_reopen';
-- 2) ACL = service_role のみ（proacl に anon/authenticated が無いこと）:
--    select proacl from pg_proc where proname = 'payroll_reopen';
-- 3) 列存在（data_type=uuid・is_nullable=YES）:
--    select data_type, is_nullable from information_schema.columns
--     where table_schema = 'public' and table_name = 'payroll_runs' and column_name = 'reopen_idem_key';
-- 4) 正ガード形＝prosrc 目視（'run not found'→'forbidden'→'run paid'→冪等 replay→'not finalized'
--    →'payments exist' の順・(B) 3ループ・delete→draft 全 NULL 戻し→audit_log_write_service）:
--    select prosrc from pg_proc where proname = 'payroll_reopen';
begin;

-- 冪等キー3本目（finalize_idem_key / paid_idem_key と対称・型も uuid で統一）
alter table public.payroll_runs add column if not exists reopen_idem_key uuid;

-- D1: 給与確定解除（finalized→draft・service 経路）。逆適用の骨格＝finalize (B) の巻き戻しを
--   再適用なしで実行→payslips 全削除→run を draft 不変量へ。paid は対象外（完全ロック）。
create or replace function public.payroll_reopen(
  p_org_id uuid, p_actor uuid, p_run_id uuid, p_idem_key uuid
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_org         uuid;
  v_store       uuid;
  v_status      text;
  v_reopen_idem uuid;
  v_fin_idem    uuid;
  v_old_ps      date;
  v_old_pe      date;
  v_retired     jsonb;
  v_arrec   jsonb;     -- 退避 breakdown.ar の1要素（巻き戻し用）
  v_advrec  jsonb;     -- 退避 breakdown.adv の1要素（巻き戻し用・F2e-2）
  v_okrec   jsonb;     -- 退避 breakdown.okuri の1要素（巻き戻し用・F2e-2）
  v_rolled      jsonb; -- audit: 巻き戻し receivable
  v_rolled_adv  jsonb; -- audit: 巻き戻し advance（F2e-2）
  v_rolled_ok   jsonb; -- audit: 巻き戻し transport（F2e-2）
begin
  -- run 取得＋org 照合（payroll_mark_paid 写経・原則9 順序）
  select org_id, store_id, status, reopen_idem_key, finalize_idem_key, period_start, period_end
    into v_org, v_store, v_status, v_reopen_idem, v_fin_idem, v_old_ps, v_old_pe
    from public.payroll_runs where id = p_run_id;
  if v_org is null then raise exception 'run not found'; end if;
  if p_org_id is null or v_org <> p_org_id then raise exception 'forbidden'; end if;

  -- paid は解除不可（finalize の 'run paid' と同語＝完全ロック・paid→finalized の逆遷移は作らない）
  if v_status = 'paid' then raise exception 'run paid'; end if;

  -- 冪等（原則9: org 照合の後）: 既に draft で同一キーなら静かに返す（二重実行防止・巻き戻しは再実行しない）
  if p_idem_key is not null and v_status = 'draft' and v_reopen_idem is not distinct from p_idem_key then
    return 'draft';
  end if;

  -- finalized のみ解除可（未確定 draft・キー不一致 draft はここで拒否）
  if v_status <> 'finalized' then raise exception 'not finalized'; end if;

  -- 支払記録が1行でもあれば解除不可（Σ≤net は payment_record_add の RPC 内制約のみ＝物理前提を崩さない）
  if exists (select 1 from public.payment_records pr where pr.run_id = p_run_id) then
    raise exception 'payments exist';
  end if;

  -- 差し替え前 breakdown_json を退避（finalize と同型・監査 before 用）
  select jsonb_agg(jsonb_build_object('cast_id', ps.cast_id, 'net', ps.net, 'breakdown', ps.breakdown_json))
    into v_retired from public.payslips ps where ps.run_id = p_run_id;

  -- ★以下 (B) は payroll_finalize live prosrc の逐語写経（機械抽出 51 行・コメント含め一字一致）。
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

  -- payslips 全削除（finalize (C) 冒頭の delete と同文・re-insert はしない＝これが「解除」）
  delete from public.payslips where run_id = p_run_id;

  -- run を draft 不変量へ戻す（run_create 直後と同形＝period_start/end・finalized_at・finalize_idem_key 全 NULL）
  -- ＋reopen_idem_key を記録（冪等 replay 用・finalize/paid の idem 列と対称）
  update public.payroll_runs
     set status = 'draft', finalized_at = null, finalize_idem_key = null,
         period_start = null, period_end = null,
         reopen_idem_key = p_idem_key
   where id = p_run_id;

  -- #6 service 経路監査（finalize と対称の完全記録・audit_log_write_service 7引数）
  perform public.audit_log_write_service(v_org, p_actor, 'payroll_reopen',
    'payroll_runs:' || p_run_id::text,
    jsonb_build_object('retired_payslips', coalesce(v_retired, '[]'::jsonb),
                       'old_finalize_idem_key', v_fin_idem,
                       'old_period_start', v_old_ps, 'old_period_end', v_old_pe,
                       'rolled_back_receivables', v_rolled,
                       'rolled_back_advances', v_rolled_adv,
                       'rolled_back_transport', v_rolled_ok),
    jsonb_build_object('status', 'draft', 'reopen_idem_key', p_idem_key),
    v_store);
  return 'reopened';
end $$;

-- 二重防御②: service 経路専用（finalize/mark_paid と同格・public だけでは無効＝anon にも明示 revoke）
revoke execute on function public.payroll_reopen(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.payroll_reopen(uuid, uuid, uuid, uuid) to service_role;

commit;
