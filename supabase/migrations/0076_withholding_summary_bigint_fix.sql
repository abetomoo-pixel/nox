-- 0076_withholding_summary_bigint_fix.sql
-- 前提: mig0075 まで適用済み（dev hiqbfagmkrdpmlqhkmsu）
-- 冪等: create or replace のみ（再実行可）／★非冪等要素: なし
-- 内容: withholding_monthly_summary の型不一致是正＝sum(bigint) は numeric に
--       昇格するため、宣言 bigint と食い違い「1行でも返すと
--       structure of query does not match function result type」で必ず失敗していた
--       （0行では発火しない＝paid run ゼロの環境では潜伏）。
--       集計2列に ::bigint を明示キャスト。宣言・ACL・他ロジックは 0075 と byte 同一。
--       ★0075 とセットで適用（0075→0076 の順・0075 単独は paid run 発生時に集計が全滅）
-- 手貼り後: notify pgrst, 'reload schema';

begin;

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
      coalesce(sum((s.breakdown_json->'pay'->>'gross')::bigint), 0)::bigint as g,
      coalesce(sum((s.breakdown_json->'pay'->>'withholding')::bigint), 0)::bigint as w
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
