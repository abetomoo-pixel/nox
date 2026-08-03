-- 0075_withholding_payment.sql
-- 前提: mig0074 まで適用済み（dev hiqbfagmkrdpmlqhkmsu）
-- 冪等: create table if not exists / create or replace / do-block / revoke・grant（再実行可）
-- ★非冪等要素: なし
-- 内容: 納付管理＝withholding_payments（org×対象月×税区分・実質append-only）
--       ＋記録RPC withholding_payment_record（owner限定）
--       ＋月次集計RPC withholding_monthly_summary（owner限定・paid runのみ・
--         税区分は payslips 凍結値のみ＝現在値フォールバックなし・org合算）
-- 手貼り後: notify pgrst, 'reload schema';

begin;

-- 1) 納付記録テーブル
create table if not exists public.withholding_payments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id),
  target_month  text not null check (target_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  tax_category  text not null check (tax_category in ('委託','雇用')),
  paid_on       date not null,
  recorded_by   uuid not null,
  created_at    timestamptz not null default now(),
  unique (org_id, target_month, tax_category)
);

-- ★新テーブルは authenticated に全権限が自動付与される＝RPC専任テーブルとして全て剥がす
alter table public.withholding_payments enable row level security;
revoke all on table public.withholding_payments from public, anon;
revoke all on table public.withholding_payments from authenticated;

-- 2) 記録RPC（owner 限定・重複は明示拒否・取消RPCは post-launch）
create or replace function public.withholding_payment_record(
  p_target_month text,
  p_tax_category text,
  p_paid_on date default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
end $function$;

revoke execute on function public.withholding_payment_record(text, text, date) from public, anon;
grant execute on function public.withholding_payment_record(text, text, date) to authenticated;

-- 3) 月次集計RPC（owner 限定・paid run のみ・支払月= paid_at のJST月・org合算）
--    税区分は payslips.breakdown_json->'pay'->>'taxMode'（凍結値）のみ。
--    凍結なしの行は '(未凍結)' として返す（現在値フォールバックはしない＝集計が後から動くのを防ぐ）。
create or replace function public.withholding_monthly_summary()
returns table (
  target_month      text,
  tax_category      text,
  headcount         integer,
  gross_total       bigint,
  withholding_total bigint,
  deadline          date,
  paid_on           date
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if v_role <> 'owner' then raise exception 'forbidden'; end if;

  return query
  select
    m.pay_month,
    m.cat,
    m.cnt,
    m.g,
    m.w,
    (to_date(m.pay_month || '-01', 'YYYY-MM-DD') + interval '1 month' + interval '9 days')::date,
    wp.paid_on
  from (
    select
      to_char(r.paid_at at time zone 'Asia/Tokyo', 'YYYY-MM') as pay_month,
      coalesce(s.breakdown_json->'pay'->>'taxMode', '(未凍結)') as cat,
      count(*)::integer as cnt,
      coalesce(sum((s.breakdown_json->'pay'->>'gross')::bigint), 0) as g,
      coalesce(sum((s.breakdown_json->'pay'->>'withholding')::bigint), 0) as w
    from public.payslips s
    join public.payroll_runs r on r.id = s.run_id
    where r.org_id = v_org
      and r.status = 'paid'
    group by 1, 2
  ) m
  left join public.withholding_payments wp
    on wp.org_id = v_org
   and wp.target_month = m.pay_month
   and wp.tax_category = m.cat
  order by m.pay_month desc, m.cat;
end $function$;

revoke execute on function public.withholding_monthly_summary() from public, anon;
grant execute on function public.withholding_monthly_summary() to authenticated;

commit;
