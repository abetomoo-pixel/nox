-- 0146_payroll_adjustments.sql
-- 裁定258(2026-09-15 承認): run 別調整控除
-- 写経元: docs/tmp/0146_pre.txt(303 行・14:10 時点)
-- 不触: payroll_finalize / payroll_reopen / money-core 3 本
-- 期待: md5 不変 3021fc96c27e57a48545ef6c01d7274e / 4229f5d26fc79975eddee74bf9679574 / 2ecbb65392a1ea3e6d2cbb4a8e1de6bf
--
-- ★ 既存からの逸脱(起草時の宣言・突合で確認すること)
--   ★1 rate_bp は整数ベーシスポイント(0..10000)。numeric の % を採らない。
--       理由: money-core が整数演算で統一されており numeric を混ぜると丸めの扱いが 1 箇所だけ変わるため。
--       20% = 2000。0.01% 刻みまで表現可。
--   ★2 policy は許可列挙 auth_role() in ('owner','manager')。
--       payslips_select の除外列挙(role <> 'staff' and (role <> 'cast' or ...))とは書式が異なる。
--       裁定258-10 により cast 本人にも開示しないため。除外列挙は将来ロール追加時に自動で開くので採らない。
--   ★3 run_id に on delete cascade。payslips は cascade を持たないが、
--       あちらは凍結値=監査対象、本表は入力値であり性格が異なる。
--   ★4 payroll_adjustment_delete も reason 必須。add と対にして削除理由も audit に残す。

-- ============================================================
-- 表
-- ============================================================
create table if not exists public.payroll_adjustments (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  store_id           uuid not null,
  run_id             uuid not null references public.payroll_runs(id) on delete cascade,
  cast_id            uuid not null references public.casts(id),
  mode               text not null,
  amount             integer,
  rate_bp            integer,
  before_withholding boolean not null default true,
  show_detail        boolean not null default true,
  reason             text not null,
  created_by         uuid not null,
  created_at         timestamptz not null default now(),
  constraint payroll_adjustments_mode_ck
    check (mode in ('fixed','rate')),
  constraint payroll_adjustments_amount_ck
    check ((mode = 'fixed' and amount is not null and amount >= 0 and rate_bp is null)
        or (mode = 'rate'  and rate_bp is not null and rate_bp between 0 and 10000 and amount is null)),
  constraint payroll_adjustments_reason_ck
    check (char_length(reason) between 1 and 200)
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

revoke all on public.payroll_adjustments from authenticated;
grant select on public.payroll_adjustments to authenticated;

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
  v_store   uuid;
  v_status  text;
  v_cast_st uuid;
  v_id      uuid;
begin
  if v_role not in ('owner','manager') then
    raise exception 'forbidden';
  end if;
  if char_length(coalesce(p_reason,'')) not between 1 and 200 then
    raise exception 'reason required';
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
    p_reason, auth.uid())
  returning id into v_id;

  perform audit_log_write_service(
    v_org, v_store, auth.uid(), 'payroll_adjustment_add',
    'payroll_adjustments', v_id, null,
    jsonb_build_object('run_id', p_run_id, 'cast_id', p_cast_id,
      'mode', p_mode, 'amount', p_amount, 'rate_bp', p_rate_bp,
      'before_withholding', p_before_withholding, 'show_detail', p_show_detail),
    p_reason);

  return v_id;
end $$;

revoke all on function public.payroll_adjustment_add(uuid,uuid,text,integer,integer,boolean,boolean,text) from public;
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
  v_store  uuid;
  v_run    uuid;
  v_status text;
  v_before jsonb;
begin
  if v_role not in ('owner','manager') then
    raise exception 'forbidden';
  end if;
  if char_length(coalesce(p_reason,'')) not between 1 and 200 then
    raise exception 'reason required';
  end if;

  select store_id, run_id, to_jsonb(a.*) into v_store, v_run, v_before
    from payroll_adjustments a where id = p_id and org_id = v_org;
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

  perform audit_log_write_service(
    v_org, v_store, auth.uid(), 'payroll_adjustment_delete',
    'payroll_adjustments', p_id, v_before, null, p_reason);
end $$;

revoke all on function public.payroll_adjustment_delete(uuid,uuid) from public;
grant execute on function public.payroll_adjustment_delete(uuid,uuid) to authenticated;
