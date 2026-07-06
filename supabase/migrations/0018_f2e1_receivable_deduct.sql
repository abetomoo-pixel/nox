-- 0018_f2e1_receivable_deduct: F2e-1 — 売掛天引き（モデルP・P-a-2・partial）
--   ① receivables に deduct_period（'YYYY-MM'|null）＋ deducted_amount（部分天引き）列を追加
--   ② check_void 改修（settled ガードに deducted_amount>0 を追加＝一部でも給与反映済みの伝票 void 拒否）
--   ③ payroll_finalize 改修（payslip 凍結と同一トランザクションで receivable を deducted/部分/繰越に遷移＋
--      再確定巻き戻し＋audit 退避。set-based insert を FOR ループ化）
--
-- 翻訳元・裁定参照:
--  - 事実確認: 1 receivable=1 cast（先頭指名・按分なし）／期間帰属は created_at と started_at→biz_date の2系統・
--    専用列なし。arDeduct は open 合計で集計可。
--  - F2e-1 plan 裁定（相談役承認・論点1 覆し＝partial 採用）:
--    E9 古い順・手取り0下限（budget=available−takeHomeFloor()・floor=0 暫定 social gate TODO）まで partial 天引き。
--    receivable の残額（amount−deducted_amount）を budget まで積む・最後の1件は残 budget だけ部分天引き。
--    全額（amount==deducted_amount）で status='deducted'・未満は status='open' のまま deduct_period=翌 period 繰越。
--    #8 は status='open' で集計＝deducted 除外・部分天引き済み open は残額のみ翌期対象。
--    drift は applied 一致時のみ巻き戻し／ar 情報は p_payslips 各要素に {receivable_id, amount} 同梱／売掛規制は F3 留保。
--
-- 現行 prosrc からの厳密差分（変更箇所以外は一字一致で再宣言）:
--  - check_void（mig0007）: settled 判定の1述語のみ変更＝
--      旧 `status in ('collected','deducted')` → 新 `(status in ('collected','deducted') or deducted_amount > 0)`。
--      他（ロール判定・open 売掛 voided 連動・check_cast_backs 削除・audit）は一字一致。
--  - payroll_finalize（mig0016）: run 取得/idem/paid/形式検証/空/退避/period_bounds は一字一致。変更は
--      (A) 繰越 period v_next 算出 (B) 巻き戻しフェーズ (C) set-based insert→FOR ループ（ar 処理＋prev 捕捉＋
--      breakdown へ ar 注入） (D) audit に rolled_back/applied receivables を追加。シグネチャ/grant は不変。
--
-- 実装ノート:
--  【1】原子性: payroll_finalize は単一 plpgsql 本体＝1トランザクション。payslip delete/insert・receivable 遷移・
--      run 更新・audit が原子的（途中 raise で全ロールバック＝receivable と payslip の片側確定は起きない）。
--  【2】巻き戻し（再確定・未 paid）: 退避 payslip の breakdown.ar を読み、現在値が applied 記録と一致するときだけ
--      prev（status/deduct_period/deducted_amount）へ復元（下流 period が消費した drift は触らない）。paid は
--      冒頭 'run paid' ガードで到達しない。
--  【3】#8 二重控除: ar_deducted の各 receivable は status='open'・deduct_from_cast・cast/org 一致・
--      deducted_amount+amount<=amount を満たさねば 'bad receivable'（二重控除/他人売掛/void 済み/超過を弾く）。
--  【4】idem replay は既存件数を返して return＝ar 遷移も巻き戻しもしない（二重実行防止のみ・現行踏襲）。
--  【5】check_void: 一部でも給与天引き済み（deducted_amount>0）の売掛がある伝票は void 拒否（幻影/宙吊り防止）。
--      open かつ deducted_amount=0 の売掛のみ従来どおり voided 連動。
--
-- 適用後の検証（"Success" 表示だけを信用しない・適用前に現行 prosrc を控えて差分照合）:
--   -- 0) 貼り先証明
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- 1) 列追加（deduct_period text nullable・deducted_amount int not null default 0）
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--    where table_schema='public' and table_name='receivables' and column_name in ('deduct_period','deducted_amount') order by column_name;
--   -- 2) 制約（deducted_amount<=amount）・索引（cast_id,status）
--   select conname from pg_constraint where conrelid='public.receivables'::regclass and conname='receivables_deducted_le_amount';
--   select indexname from pg_indexes where schemaname='public' and indexname='receivables_cast_status_idx';
--   -- 3) check_void prosrc: settled 述語に deducted_amount>0 が入り・他は不変（適用前 prosrc と一字照合）
--   select prosrc from pg_proc where proname='check_void';
--   -- 4) payroll_finalize prosrc: v_next/巻き戻し/FOR ループ/ar 注入/audit 拡張（適用前 prosrc と差分照合）
--   select prosrc from pg_proc where proname='payroll_finalize';
--   -- 5) 動作アンカー（JWT/service キー・F2e-1 verify 追記で実施）: arDeduct 集計/古い順/手取り0下限(net=0・残繰越)/
--   --    deduct_period 更新/#8 二重控除/原子性/再確定巻き戻し+再マーク/paid 巻き戻し拒否/cutoff 跨ぎ期間帰属/
--   --    部分天引き済み receivable の伝票 void 拒否。

begin;

-- ══════════════════════════════════════════════════════════════
-- ① receivables 列追加（deduct_period＝繰越材料化・deducted_amount＝部分天引き）
-- ══════════════════════════════════════════════════════════════
alter table public.receivables
  add column if not exists deduct_period text
    check (deduct_period is null or deduct_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  add column if not exists deducted_amount int not null default 0
    check (deducted_amount >= 0);
-- 部分天引きは残額を超えない（cross-column 制約・idempotent 追加）
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'receivables_deducted_le_amount') then
    alter table public.receivables add constraint receivables_deducted_le_amount check (deducted_amount <= amount);
  end if;
end $$;
create index if not exists receivables_cast_status_idx on public.receivables (cast_id, status);

-- ══════════════════════════════════════════════════════════════
-- ② check_void 改修（settled 述語のみ変更・他は mig0007 と一字一致）
-- ══════════════════════════════════════════════════════════════
create or replace function public.check_void(
  p_check_id uuid,
  p_reason   text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_before jsonb; v_backs jsonb; v_actor uuid; v_settled int;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'bad reason'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status not in ('open','closed') then raise exception 'not voidable'; end if;

  -- 回収済み・一部でも給与天引き済み（deducted_amount>0）の売掛があれば void 拒否（宙吊り/幻影防止＝条件3＋partial）
  select count(*) into v_settled from public.receivables
    where check_id = p_check_id and (status in ('collected','deducted') or deducted_amount > 0);
  if v_settled > 0 then raise exception 'receivable settled'; end if;

  -- 監査痕跡: 削除する check_cast_backs を before に含める
  select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_backs
    from public.check_cast_backs b where b.check_id = p_check_id;
  v_before := to_jsonb(v_chk) || jsonb_build_object('cast_backs', v_backs);

  update public.receivables set status = 'voided'
    where check_id = p_check_id and status = 'open';
  delete from public.check_cast_backs where check_id = p_check_id;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.checks
     set status = 'void', voided_at = now(), voided_by = v_actor, void_reason = trim(p_reason)
   where id = p_check_id;
  perform public.audit_log_write('check_void', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
end $$;
revoke execute on function public.check_void(uuid, text) from public, anon;
grant  execute on function public.check_void(uuid, text) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ③ payroll_finalize 改修（receivable 遷移＋巻き戻し＋ar 注入・FOR ループ化）
-- 現行（mig0016）から: run取得/idem/paid/形式検証/空/退避/period_bounds/run更新 は一字一致。
-- 追加(A)v_next (B)巻き戻し (C)set-based→FOR ループ+ar処理 (D)audit 拡張。シグネチャ/grant 不変。
-- p_payslips 要素: { cast_id, net, breakdown:{pay,extras}, ar_deducted:[{receivable_id,amount}], ar_carried:[{receivable_id}] }
-- ══════════════════════════════════════════════════════════════
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
  v_arrec   jsonb;     -- 退避 payslip の ar 記録要素（巻き戻し用）
  v_ar      jsonb;     -- 適用 ar 記録（凍結 breakdown へ注入）
  v_arentry jsonb;     -- ar_deducted/ar_carried の1要素
  v_cast    uuid;      -- payslip の cast_id（casts 照合済み）
  v_rid     uuid;      -- receivable id
  v_amt     int;       -- deducted 額
  v_recv    record;    -- receivable 現行行
  v_full    boolean;   -- 全額天引きか
  v_bd      jsonb;     -- 凍結 breakdown（ar 注入後）
  v_applied jsonb;     -- audit: 適用 receivable 遷移
  v_rolled  jsonb;     -- audit: 巻き戻し receivable
begin
  -- run 取得＋org 照合（現行どおり）
  select org_id, store_id, period, status, finalize_idem_key, period_start, period_end
    into v_org, v_store, v_period, v_status, v_idem, v_old_ps, v_old_pe
    from public.payroll_runs where id = p_run_id;
  if v_org is null then raise exception 'run not found'; end if;
  if p_org_id is null or v_org <> p_org_id then raise exception 'forbidden'; end if;

  -- 冪等（現行どおり・replay は ar 遷移も巻き戻しもしない＝二重実行防止のみ）
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

  -- (B) 巻き戻しフェーズ（再確定・未 paid）: 退避 payslip の breakdown.ar を条件付き復元（drift は触らない）
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

  -- (C) 原子的差し替え（未 paid のみ）。delete 後 FOR ループで ar 処理しつつ insert
  delete from public.payslips where run_id = p_run_id;
  v_count := 0;
  v_applied := '[]'::jsonb;
  for v_ps in select ae from lateral jsonb_array_elements(p_payslips) ae loop
    -- casts 照合（他 org/他店 cast 混入除去＝現行 join と同義・混入は落とす）
    select c.id into v_cast from public.casts c
      where c.id = (v_ps->>'cast_id')::uuid and c.org_id = v_org and c.store_id = v_store;
    if v_cast is null then continue; end if;
    v_ar := '[]'::jsonb;

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

    -- 凍結 breakdown = 入力 breakdown に ar を注入
    v_bd := (v_ps->'breakdown') || jsonb_build_object('ar', v_ar);
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

  -- (D) #6 service 経路監査: before に退避 breakdown＋旧窓＋巻き戻し・after に新件数/新窓/idem＋適用 receivable
  perform public.audit_log_write_service(v_org, p_actor, 'payroll_finalize',
    'payroll_runs:' || p_run_id::text,
    jsonb_build_object('retired_payslips', coalesce(v_retired, '[]'::jsonb),
                       'old_period_start', v_old_ps, 'old_period_end', v_old_pe,
                       'rolled_back_receivables', v_rolled),
    jsonb_build_object('cast_count', v_count, 'period_start', v_new_ps,
                       'period_end', v_new_pe, 'idem_key', p_idem_key,
                       'applied_receivables', v_applied),
    v_store);
  return v_count;
end $$;
-- service_role 限定（現行どおり・シグネチャ不変）
revoke execute on function public.payroll_finalize(uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.payroll_finalize(uuid, uuid, uuid, uuid, jsonb) to service_role;

commit;
