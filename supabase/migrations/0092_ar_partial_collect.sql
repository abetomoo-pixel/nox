-- ═══════════════════════════════════════════════════════════════════════════
-- mig0092: E8-2 日報レーン DB 基盤
--   receivables.due（期日管理 #12）＋ collected_amount（部分回収 #13）
--   底本 = nox_mig0092_live_defs.sql（sha256 7b42001c…d355・live pg_get_functiondef 逐語）
-- ─────────────────────────────────────────────────────────────────────────────
-- ★非冪等（本番手貼り1回・再実行厳禁）: add column／名前付き add constraint／旧署名 drop を含む
-- ★notify pgrst はファイル外・手貼り後に単発（NOX 規約どおり本ファイルには含めない）
-- ★payroll_reopen は不触（collected_amount を参照しない条件付き復元＝逐語確認済み・改稿不要）
-- ★payroll_finalize / payroll_reopen の ACL は service_role 専任のまま＝grant を足さない
--
-- 裁定（台帳収載済み）:
--   E8-2-1 番号 = 0092（以降 顧客0093・シフト0094・分析0095 へ繰り下げ）
--   E8-2-2 collected_amount 新列（deducted_amount の意味不変・残高 = amount − deducted − collected・
--          status は完済到達経路で決定: 現金完済='collected'／天引き完済='deducted'／部分=open）
--   E8-2-3 check_void ガードに collected_amount > 0 を追加
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────
-- (1) DDL: due ＋ collected_amount ＋ CHECK 2本
-- ─────────────────────────────────────────────
alter table public.receivables add column due date;
alter table public.receivables add column collected_amount integer not null default 0;
alter table public.receivables
  add constraint receivables_collected_amount_nonneg check (collected_amount >= 0);
alter table public.receivables
  add constraint receivables_settled_le_amount check (deducted_amount + collected_amount <= amount);

-- ─────────────────────────────────────────────
-- (2) backfill: 既存 'collected' 行の残高式成立
--     （dev 実データ = seed 由来1行 status='collected'/¥1,600/deducted 0 → collected_amount=1600 へ。
--       再実行しても同値だが (1) が非冪等のため本 mig 全体は1回適用）
-- ─────────────────────────────────────────────
update public.receivables
   set collected_amount = amount - deducted_amount
 where status = 'collected';

-- ─────────────────────────────────────────────
-- (3) receivable_collect: 部分回収対応（p_amount 追加＝アリティ 5→6）
--     ★旧5引数署名は明示 drop（残すと5引数呼びが曖昧解決で全滅・0062/0073 前例）
--     ★署名変更＝ACL 不継承のため revoke/grant を再適用（規範形）
-- ─────────────────────────────────────────────
drop function if exists public.receivable_collect(uuid, date, text, text, uuid);

create or replace function public.receivable_collect(p_receivable_id uuid, p_biz_date date, p_method text default 'cash'::text, p_note text default null::text, p_idem_key uuid default null::uuid, p_amount integer default null::integer)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_recv      record;
  v_method    text;
  v_actor     uuid;
  v_id        uuid;
  v_remaining int;      -- ★mig0092: 残高 = amount − deducted_amount − collected_amount
  v_amt       int;      -- ★mig0092: 今回回収額（p_amount null＝残額全額）
  v_full      boolean;  -- ★mig0092: 完済か
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  if p_idem_key is null then raise exception 'idem required'; end if;
  v_method := coalesce(nullif(trim(coalesce(p_method,'')),''), 'cash');
  if v_method not in ('cash','card','other') then raise exception 'bad method'; end if;

  -- gate（org 照合 → owner/manager 自店）＝現行どおり
  select * into v_recv from public.receivables where id = p_receivable_id;
  if v_recv.id is null or v_recv.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_recv.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- ★冪等・並行リプレイ解決は payment_record_add の live prosrc と同型（前段 idem チェック →
  --   FOR UPDATE 直列化点 → INSERT on conflict do nothing → fallback SELECT）。相違は直列化点のみ＝
  --   payment_record_add は payslip(run,cast) を、本 RPC は receivable 行をロックする。
  -- 冪等（前段・org/ロール照合の後＝org 外ユーザーのキー存在確認悪用を防ぐ）: 既存回収は返す
  select id into v_id from public.ar_collections where idem_key = p_idem_key;
  if v_id is not null then return v_id; end if;

  -- 直列化点: receivable を FOR UPDATE（同一 receivable の並行呼びをコミット順へ一列化）
  select * into v_recv from public.receivables where id = p_receivable_id for update;
  -- ★冪等（後段・ロック内再チェック）: ロック取得＝先行 Tx はコミット済ゆえ、同一 idem の
  --   コミット済回収がここで必ず可視になる（READ COMMITTED での戻り値欠落＝並行リプレイの穴を封鎖）。
  select id into v_id from public.ar_collections where idem_key = p_idem_key;
  if v_id is not null then return v_id; end if;

  -- 消込は open のみ（回収済/天引き済/void は不可＝別 idem の二重回収を拒否）
  if v_recv.status <> 'open' then raise exception 'not open'; end if;

  -- ★mig0092: 部分回収。p_amount null＝残額全額（残高 = amount − deducted_amount − collected_amount）
  --   従前は v_recv.amount ハードコード＝部分天引き済み行でも全額を ar_collections に積む過回収の潜在バグ
  --   があり、本改稿の残高基準で同時解消。
  v_remaining := v_recv.amount - v_recv.deducted_amount - v_recv.collected_amount;
  if v_remaining <= 0 then raise exception 'not open'; end if;  -- belt-and-suspenders（open で残0は不変量違反）
  v_amt := coalesce(p_amount, v_remaining);
  if v_amt <= 0 or v_amt > v_remaining then raise exception 'bad amount'; end if;
  v_full := (v_amt = v_remaining);

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.ar_collections
    (org_id, store_id, receivable_id, cast_id, customer_id, biz_date, amount, method, note, idem_key, created_by)
  values
    (v_recv.org_id, v_recv.store_id, p_receivable_id, v_recv.cast_id, v_recv.customer_id,
     p_biz_date, v_amt, v_method, nullif(trim(coalesce(p_note,'')),''), p_idem_key, v_actor)
  on conflict (idem_key) do nothing
  returning id into v_id;
  if v_id is null then
    -- ロック内再チェック済ゆえ通常不到達・belt-and-suspenders（payment_record_add 同型）
    select id into v_id from public.ar_collections where idem_key = p_idem_key; return v_id;
  end if;

  -- ★mig0092: 完済のみ 'collected'・部分は open 維持（天引き完済は payroll_finalize 側で 'deducted'）
  update public.receivables
     set collected_amount = collected_amount + v_amt,
         status = case when v_full then 'collected' else status end
   where id = p_receivable_id and status = 'open';

  perform public.audit_log_write('receivable_collect', 'receivables:' || p_receivable_id::text,
    jsonb_build_object('status', 'open', 'deducted_amount', v_recv.deducted_amount,
                       'collected_amount', v_recv.collected_amount),
    jsonb_build_object('status', case when v_full then 'collected' else 'open' end,
                       'collection_id', v_id, 'biz_date', p_biz_date,
                       'amount', v_amt, 'method', v_method,
                       'collected_amount', v_recv.collected_amount + v_amt,
                       'remaining', v_remaining - v_amt),
    v_recv.store_id);
  return v_id;
end $function$;

revoke execute on function public.receivable_collect(uuid, date, text, text, uuid, integer) from public, anon;
grant  execute on function public.receivable_collect(uuid, date, text, text, uuid, integer) to authenticated, service_role;

-- ─────────────────────────────────────────────
-- (4) check_void: 一部現金回収済み（collected_amount>0）の伝票 void 拒否
--     同一署名の create or replace＝ACL 継承（再 grant 不要）。改変はガード1句＋コメントのみ・他は live 逐語一字一致
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_void(p_check_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_backs jsonb; v_actor uuid; v_settled int;
  v_pending_claims jsonb;  -- 【F3f】
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'bad reason'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status not in ('open','closed') then raise exception 'not voidable'; end if;

  -- 回収済み・一部でも給与天引き済み（deducted_amount>0）・一部でも現金回収済み（collected_amount>0）の売掛があれば
  -- void 拒否（宙吊り/幻影防止＝条件3＋partial。★mig0092: collected_amount>0 を追加＝ar_collections 幻影の封鎖）
  select count(*) into v_settled from public.receivables
    where check_id = p_check_id and (status in ('collected','deducted') or deducted_amount > 0 or collected_amount > 0);
  if v_settled > 0 then raise exception 'receivable settled'; end if;

  -- 監査痕跡: 削除する check_cast_backs を before に含める
  select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_backs
    from public.check_cast_backs b where b.check_id = p_check_id;
  -- 【F3f】監査痕跡: 自動 reject する pending claims も before に含める（cast_backs と同型・per-claim audit は書かない）
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_pending_claims
    from public.drink_claims d where d.check_id = p_check_id and d.status = 'pending';
  v_before := to_jsonb(v_chk) || jsonb_build_object('cast_backs', v_backs)
                              || jsonb_build_object('pending_claims', v_pending_claims);

  update public.receivables set status = 'voided'
    where check_id = p_check_id and status = 'open';
  delete from public.check_cast_backs where check_id = p_check_id;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  -- 【F3f】void 時 pending claim 自動 reject（宙吊り防止＝receivables 'voided' と同型思想・approved は残置＝
  --        給与除外は collect.ts の void フィルタが単一責任点）
  update public.drink_claims
     set status = 'rejected', decided_by = v_actor, decided_at = now()
   where check_id = p_check_id and status = 'pending';
  update public.checks
     set status = 'void', voided_at = now(), voided_by = v_actor, void_reason = trim(p_reason)
   where id = p_check_id;
  -- ★mig0053（B1 相席・transient）: 追加席の占有を解放（解放経路＝ロック不要・money 非干渉）
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_void', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
end $function$;

-- ─────────────────────────────────────────────
-- (5) payroll_finalize: 天引き上限＝amount − collected_amount（残高基準）
--     同一署名の create or replace＝ACL 継承（service_role 専任のまま・grant 追加禁止）。
--     改変は ar 節の上限ガード＋v_full 判定の2行のみ・他は live 逐語一字一致。
--     監査 JSON の形（prev/applied_deducted_amount）は不変＝payroll_reopen の drift-safe 復元に波及なし。
--     （collected_amount は reopen で不触＝finalized 中に現金回収が入っても、deducted の prev 復元は
--       CHECK deducted+collected<=amount を破らない: 復元は deducted を減らす方向のみ）
-- ─────────────────────────────────────────────
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
end $function$;

commit;

-- ═══ 適用後の手作業（ファイル外・NOX 規約）═══
-- notify pgrst, 'reload schema';
