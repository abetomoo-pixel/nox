-- 0020_f2e2_finalize_adv_okuri: F2e-2 — payroll_finalize を advance/transport 遷移込みに改修
--   現行（mig0018）の receivables(ar) 遷移に対称な adv（前借り・繰越あり）／okuri（送り実費・繰越なし）を追加。
--
-- ★ 既存 RPC 改修＝適用前に現行 prosrc（＝mig0018 の payroll_finalize）を控えて差分照合すること（孫引き事故対策）。
--   現行（mig0018）から一字一致で再現し、追加箇所のみを新規挿入:
--     (B) 巻き戻しフェーズに adv/okuri の巻き戻しループを追加（ar ループは一字一致）
--     (C) payslip ループ内に adv_deducted/adv_carried・okuri_deducted の遷移を追加（ar ブロックは一字一致）
--         breakdown 注入を {ar} → {ar, adv, okuri} に拡張
--     (D) audit の before/after に rolled_back/applied の advances/transport を追加
--   シグネチャ/grant/idem/paid/形式検証/空/退避/period_bounds/run 更新 は mig0018 と一字一致。check_void は非改修。
--
-- p_payslips 要素（TS core.ts が生成＝mig0020 で受理・後方互換: adv/okuri キー欠落は skip）:
--   { cast_id, net, breakdown:{pay,extras},
--     ar_deducted:[{receivable_id,amount}],  ar_carried:[{receivable_id}],
--     adv_deducted:[{advance_id,amount}],    adv_carried:[{advance_id}],
--     okuri_deducted:[{transport_id,amount}] }   -- 送り実費は繰越なし＝okuri_carried は無い
--
-- 裁定参照（F2e-2 plan）:
--  - L4 引き当て順序（送り→前借り→売掛・共通 budget）は TS core.ts の責務（budget を順に消費して各カテゴリの
--    deducted/carried を確定）。finalize は「計画（各要素の額）」を原子的に適用するだけ＝順序は再導出しない
--    （裁定 B: net 恒等の担保はサーバ TS・DB は形式検証＋構造ガードのみ）。
--  - advances: receivables 同型（partial・全額で deducted・未満は open のまま deduct_period=翌 period 繰越）。
--  - transport: 繰越なし（partial・全額で deducted・未満は open 据置＝deduct_period 列を持たない＝再回収しない）。
--  - advances/transport は deduct_from_cast を持たない（本質的に cast 債務＝全 open が対象）。ガードは
--    status='open'・org/cast 一致・deducted_amount+amount<=amount（transport は deduct_from_cast 述語なし）。
--
-- 実装ノート:
--  【1】原子性: 単一 plpgsql 本体＝1トランザクション。payslip delete/insert・receivable/advance/transport 遷移・
--      run 更新・audit が原子的（途中 raise で全ロールバック＝片側確定なし）。mig0018 の不変条件を維持。
--  【2】巻き戻し（再確定・未 paid）: 退避 payslip の breakdown.ar/.adv/.okuri を読み、現在値が applied 記録と
--      一致するときだけ prev へ復元（drift は触らない）。okuri は deduct_period 列がないため (status,deducted_amount)
--      のみで一致判定・復元。paid は冒頭 'run paid' ガードで到達しない。
--  【3】#8 二重控除（各カテゴリ内）: deducted は status='open'・org/cast 一致・deducted_amount+amount<=amount を
--      満たさねば 'bad receivable'/'bad advance'/'bad transport'（二重控除/他人債務/確定済み/超過を弾く）。
--      送り実費 vs 一律送り代の #8 排他は mig0019 の okuri_mode 構造的排他で担保（本 RPC は各カテゴリ内の二重控除ガード）。
--  【4】idem replay は既存件数を返して return＝いかなる遷移も巻き戻しもしない（二重実行防止のみ・現行踏襲）。
--  【5】transport の繰越なし留保（⑤・相談役裁定・設計書明記事項）: cast 手取り不足で送り実費を引き切れない月の
--      残は open のまま永久据置になり得る（実質未回収＝店が被る・open 行が蓄積）。これは意図した挙動（送り実費＝
--      当期精算・繰越機構を持たない＝L4 裁定）。open 据置 transport の蓄積が運用問題化した場合の掃除機構
--      （一定期間後 auto-close ジョブ or 手動 write-off RPC）は後続フェーズの留保。F2e-2 では現行（open 据置）で確定。
--
-- 適用後の検証（"Success" 表示だけを信用しない・適用前に現行 prosrc を控えて差分照合）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- payroll_finalize prosrc: v_next/巻き戻し(ar+adv+okuri)/FOR ループ(ar+adv+okuri)/breakdown{ar,adv,okuri}/
--   --   audit 拡張。ar 部分は mig0018 と一字一致・adv/okuri のみ追加であることを差分照合。
--   select prosrc from pg_proc where proname='payroll_finalize';
--   select proacl from pg_proc where proname='payroll_finalize'; -- service_role のみ（authenticated revoke）
--   -- 動作アンカー（service キー・F2e-2 verify 追記で実施）: adv 段階遷移(deducted/部分/繰越)・okuri 段階遷移
--   --   (deducted/部分は open 据置・繰越なし)・順序(送り→前借り→売掛は TS 側)・原子性(bad advance/transport 全ロールバック)・
--   --   再確定巻き戻し(ar+adv+okuri)+再マーク・paid 巻き戻し拒否・#8(各カテゴリ)・後方互換(adv/okuri 欠落 payload)。

begin;

create or replace function public.payroll_finalize(
  p_org_id   uuid,
  p_actor    uuid,
  p_run_id   uuid,
  p_idem_key uuid,
  p_payslips jsonb
) returns int language plpgsql security definer set search_path = public as $$
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
           or v_amt <= 0 or v_recv.deducted_amount + v_amt > v_recv.amount then
          raise exception 'bad receivable';
        end if;
        v_full := (v_recv.deducted_amount + v_amt = v_recv.amount);
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
end $$;
-- service_role 限定（現行どおり・シグネチャ不変）
revoke execute on function public.payroll_finalize(uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.payroll_finalize(uuid, uuid, uuid, uuid, jsonb) to service_role;

commit;
