-- 0146_payroll_adjustments.sql
-- 裁定258(2026-09-15 承認): run 別調整控除
-- 写経元: docs/tmp/0146_pre.txt(303 行・14:10 時点)
-- CC 静的突合(14:26)の ★1〜★9、再突合(14:46)の ★A を反映した確定版
-- 不触: payroll_finalize / payroll_reopen / money-core 3 本
-- 期待: md5 不変 3021fc96c27e57a48545ef6c01d7274e / 4229f5d26fc79975eddee74bf9679574 / 2ecbb65392a1ea3e6d2cbb4a8e1de6bf
--
-- ★ 既存からの逸脱(起草時の宣言・突合後の確定)
--   ★1 rate_bp は整数ベーシスポイント(0..10000・20% = 2000)。
--       deductions.amount は整数 %(0..100・1% 刻み)だが、基底が異なる(deductions=sales・0146=gross)ため
--       fixedDedOf は流用できず専用の除算行が core.ts/pay.ts に要る。どちらを採っても行数は同じで、
--       bp の方が刻みが細かい。UI は % 表示 ↔ bp 格納の換算を持つ。
--   ★2 run_id に on delete cascade。payslips は cascade を持たないが、
--       あちらは凍結値=監査対象、本表は入力値であり性格が異なる。
--   ★3 payroll_adjustment_delete も reason 必須。add と対にして削除理由も audit に残す。
--   ★4 casts.is_active を検証しない(裁定258-11)。退店キャストの最終 run にこそ調整が要る
--       (貸付の回収漏れ・備品の未返却・最終月の精算)。punch_proxy が inactive を拒むのは
--       「退店した人を出勤させられない」ためで性格が異なる。
--   (取り下げ) policy の許可列挙 auth_role() in ('owner','manager') は payroll_runs_select と同形
--       (0016:171〜176)であり逸脱ではない。突合 e により宣言から外した。

begin;

-- ============================================================
-- 表
-- ============================================================
create table if not exists public.payroll_adjustments (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs(id),
  store_id           uuid not null references public.stores(id),
  run_id             uuid not null references public.payroll_runs(id) on delete cascade,
  cast_id            uuid not null references public.casts(id),
  mode               text not null,
  amount             integer,
  rate_bp            integer,
  before_withholding boolean not null default true,
  show_detail        boolean not null default true,
  reason             text not null,
  created_by         uuid not null references public.users(id),
  created_at         timestamptz not null default now(),
  constraint payroll_adjustments_mode_ck
    check (mode in ('fixed','rate')),
  constraint payroll_adjustments_amount_ck
    check ((mode = 'fixed' and amount is not null and amount >= 0 and rate_bp is null)
        or (mode = 'rate'  and rate_bp is not null and rate_bp between 0 and 10000 and amount is null)),
  constraint payroll_adjustments_reason_ck
    check (length(trim(reason)) between 1 and 200)
);

create index if not exists payroll_adjustments_run_idx   on public.payroll_adjustments(run_id);
create index if not exists payroll_adjustments_cast_idx  on public.payroll_adjustments(cast_id);
create index if not exists payroll_adjustments_org_idx   on public.payroll_adjustments(org_id);

alter table public.payroll_adjustments enable row level security;

drop policy if exists payroll_adjustments_select on public.payroll_adjustments;
create policy payroll_adjustments_select on public.payroll_adjustments
  for select to authenticated
  using (
    (org_id = auth_org_id())
    and ((auth_role() = 'owner'::text) or (store_id = auth_store_id()))
    and (auth_role() in ('owner'::text, 'manager'::text))
  );

revoke all on table public.payroll_adjustments from public, anon, authenticated;
grant select on table public.payroll_adjustments to authenticated;

-- ============================================================
-- payroll_adjustment_add
-- ============================================================
create or replace function public.payroll_adjustment_add(
  p_run_id             uuid,
  p_cast_id            uuid,
  p_mode               text,
  p_amount             integer,
  p_rate_bp            integer,
  p_before_withholding boolean,
  p_show_detail        boolean,
  p_reason             text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid := auth_org_id();
  v_role    text := auth_role();
  v_actor   uuid;
  v_store   uuid;
  v_status  text;
  v_cast_st uuid;
  v_id      uuid;
begin
  if v_org is null then
    raise exception 'forbidden';
  end if;
  if v_role is null or v_role not in ('owner','manager') then
    raise exception 'forbidden';
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then
    raise exception 'forbidden';
  end if;

  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then
    raise exception 'reason required';
  end if;
  if p_mode is null or p_mode not in ('fixed','rate') then
    raise exception 'bad mode';
  end if;
  if p_mode = 'fixed' and (p_amount is null or p_amount < 0 or p_rate_bp is not null) then
    raise exception 'bad amount';
  end if;
  if p_mode = 'rate' and (p_rate_bp is null or p_rate_bp < 0 or p_rate_bp > 10000 or p_amount is not null) then
    raise exception 'bad amount';
  end if;

  select store_id, status into v_store, v_status
    from payroll_runs where id = p_run_id and org_id = v_org;
  if not found then
    raise exception 'run not found';
  end if;
  if v_role = 'manager' and v_store is distinct from auth_store_id() then
    raise exception 'forbidden';
  end if;
  if v_status <> 'draft' then
    raise exception 'run not draft';
  end if;

  select store_id into v_cast_st
    from casts where id = p_cast_id and org_id = v_org;
  if not found then
    raise exception 'cast not found';
  end if;
  if v_cast_st is distinct from v_store then
    raise exception 'cast store mismatch';
  end if;

  insert into payroll_adjustments(
    org_id, store_id, run_id, cast_id, mode, amount, rate_bp,
    before_withholding, show_detail, reason, created_by)
  values (
    v_org, v_store, p_run_id, p_cast_id, p_mode,
    case when p_mode = 'fixed' then p_amount else null end,
    case when p_mode = 'rate'  then p_rate_bp else null end,
    coalesce(p_before_withholding, true),
    coalesce(p_show_detail, true),
    p_reason, v_actor)
  returning id into v_id;

  perform audit_log_write(
    'payroll_adjustment_add',
    'payroll_adjustments:' || v_id::text,
    null,
    jsonb_build_object('run_id', p_run_id, 'cast_id', p_cast_id,
      'mode', p_mode, 'amount', p_amount, 'rate_bp', p_rate_bp,
      'before_withholding', coalesce(p_before_withholding, true),
      'show_detail', coalesce(p_show_detail, true)),
    v_store,
    p_reason);

  return v_id;
end $$;

revoke all on function public.payroll_adjustment_add(uuid,uuid,text,integer,integer,boolean,boolean,text) from public, anon;
grant execute on function public.payroll_adjustment_add(uuid,uuid,text,integer,integer,boolean,boolean,text) to authenticated;

-- ============================================================
-- payroll_adjustment_delete
-- ============================================================
create or replace function public.payroll_adjustment_delete(
  p_id     uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid := auth_org_id();
  v_role   text := auth_role();
  v_actor  uuid;
  v_store  uuid;
  v_run    uuid;
  v_status text;
  v_before jsonb;
begin
  if v_org is null then
    raise exception 'forbidden';
  end if;
  if v_role is null or v_role not in ('owner','manager') then
    raise exception 'forbidden';
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then
    raise exception 'forbidden';
  end if;

  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then
    raise exception 'reason required';
  end if;

  select a.store_id, a.run_id, to_jsonb(a.*) into v_store, v_run, v_before
    from payroll_adjustments a where a.id = p_id and a.org_id = v_org;
  if not found then
    raise exception 'adjustment not found';
  end if;
  if v_role = 'manager' and v_store is distinct from auth_store_id() then
    raise exception 'forbidden';
  end if;

  select status into v_status from payroll_runs where id = v_run;
  if v_status <> 'draft' then
    raise exception 'run not draft';
  end if;

  delete from payroll_adjustments where id = p_id;

  perform audit_log_write(
    'payroll_adjustment_delete',
    'payroll_adjustments:' || p_id::text,
    v_before,
    null,
    v_store,
    p_reason);
end $$;

revoke all on function public.payroll_adjustment_delete(uuid,text) from public, anon;
grant execute on function public.payroll_adjustment_delete(uuid,text) to authenticated;

commit;
