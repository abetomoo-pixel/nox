-- docs/demo/verify_0173_0174.sql — 0173／0174 の検証を 1 文に（便 VQ・2026-10-16・恒久注意31＝Supabase SQL Editor は最後の文の結果しか返さない）。
-- 貼り方: 本番 ref hiqbfagmkrdpmlqhkmsu の SQL Editor に全文を貼って Run → 31 行（mig／k／v／expected／ok）を CC へ貼る。SELECT のみ（書込なし）。
-- 読み方: ok=true が全行なら両方適用済み。0173 だけ適用の時点では mig='0174' の行と「関数数」（312）が false＝想定どおり。'billing locked' は 0173 で 160 になり 0174 で不変。
-- md5 pin＝生成器の出力（0173 24 本・0174 6 本・prosrc の \r 除去・先頭 8 桁）。「md5 不一致の関数名」が空＝全一致（1 本でも出たら未適用か改稿ずれ＝CC が止める）。
-- ★0174 の「slide_apply が null でないプラン」は列が無い時点でも落ちないよう information_schema で守っている（他は列が無い時点では 0174 行だけ 0／false）。
with r(mig, k, v, expected) as (
  select 'both' mig, '貼り先証明 orgs' k, (select count(*) from public.orgs)::text v, '9' expected
  union all
  select 'both' mig, '関数数（0173 のみ＝312）' k, (select count(*) from pg_proc where pronamespace='public'::regnamespace)::text v, '314' expected
  union all
  select 'both' mig, '表数' k, (select count(*) from pg_tables where schemaname='public')::text v, '87' expected
  union all
  select 'both' mig, '''billing locked'' 関数数' k, (select count(*) from pg_proc where pronamespace='public'::regnamespace and prosrc like '%billing locked%')::text v, '160' expected
  union all
  select '0173' mig, '新列 8 本' k, (select count(*) from information_schema.columns where table_schema='public' and ((table_name='pricing_rules' and column_name='is_default_ext') or (table_name='checks' and column_name in ('set_frozen','opened_by_membership')) or (table_name='payments' and column_name='by_membership') or (table_name='daily_reports' and column_name in ('closed_by_membership','set_ext_nom','products','pay_fee_total'))))::text v, '8' expected
  union all
  select '0173' mig, 'CHECK bottle_keeps.status に pending' k, (select count(*) from pg_constraint where conname='bottle_keeps_status_check' and pg_get_constraintdef(oid) like '%pending%')::text v, '1' expected
  union all
  select '0173' mig, 'CHECK check_lines.fee_kind に pay_fee' k, (select count(*) from pg_constraint where conname='check_lines_fee_kind_check' and pg_get_constraintdef(oid) like '%pay_fee%')::text v, '1' expected
  union all
  select '0173' mig, 'index pricing_rules_default_ext_uidx' k, (select count(*) from pg_indexes where tablename='pricing_rules' and indexname='pricing_rules_default_ext_uidx')::text v, '1' expected
  union all
  select '0173' mig, 'policy daily_reports_select に cast 枝' k, (select count(*) from pg_policies where tablename='daily_reports' and policyname='daily_reports_select' and qual like '%auth_cast_can_register%')::text v, '1' expected
  union all
  select '0173' mig, '署名変更 6＋新設 1＝各 1 本（旧版なし）' k, (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('set_pricing_rule','check_pay','bottle_keep_register','check_line_set_customer','check_group_due','customer_summary','check_set_ext_rule'))::text v, '7' expected
  union all
  select '0173' mig, 'set_pricing_rule 引数' k, (select pronargs from pg_proc where pronamespace='public'::regnamespace and proname='set_pricing_rule')::text v, '17' expected
  union all
  select '0173' mig, 'check_pay 引数' k, (select pronargs from pg_proc where pronamespace='public'::regnamespace and proname='check_pay')::text v, '8' expected
  union all
  select '0173' mig, 'md5 pin 一致 24 本' k, (select count(*) from (values ('check_group_due','5c667792'),('pricing_resolve_core','4779acc3'),('set_pricing_rule','d41e22d9'),('check_open','82dfd091'),('check_time_charge_apply','8305089f'),('check_set_people','1f6b9fd8'),('set_store_profile','45012c75'),('report_can_close','12b4ad7a'),('daily_report_reclose','a140f36c'),('cash_diff_approve','12810b5f'),('daily_report_close','f599bd09'),('kiosk_login','90ab95a4'),('kiosk_operator_list','e9c868bf'),('staff_pin_status','c70866bf'),('set_staff_pin','bda3b520'),('daily_report_aggregate','ca2dd22d'),('bottle_keep_register','6cce7d77'),('check_line_set_customer','644cd7ba'),('check_close','f94dc8c3'),('check_void','4eb77409'),('customer_summary','c83aa2af'),('check_pay','c11691b8'),('cast_sales_aggregate','34a0bf1e'),('check_set_ext_rule','02b145a6')) p(n,m) join pg_proc f on f.pronamespace='public'::regnamespace and f.proname=p.n and left(md5(replace(f.prosrc, E'\r', '')),8)=p.m)::text v, '24' expected
  union all
  select '0173' mig, 'md5 不一致の関数名' k, (select coalesce(string_agg(p.n || ' ' || coalesce(left(md5(replace(f.prosrc, E'\r', '')),8), 'なし'), ' / '), '') from (values ('check_group_due','5c667792'),('pricing_resolve_core','4779acc3'),('set_pricing_rule','d41e22d9'),('check_open','82dfd091'),('check_time_charge_apply','8305089f'),('check_set_people','1f6b9fd8'),('set_store_profile','45012c75'),('report_can_close','12b4ad7a'),('daily_report_reclose','a140f36c'),('cash_diff_approve','12810b5f'),('daily_report_close','f599bd09'),('kiosk_login','90ab95a4'),('kiosk_operator_list','e9c868bf'),('staff_pin_status','c70866bf'),('set_staff_pin','bda3b520'),('daily_report_aggregate','ca2dd22d'),('bottle_keep_register','6cce7d77'),('check_line_set_customer','644cd7ba'),('check_close','f94dc8c3'),('check_void','4eb77409'),('customer_summary','c83aa2af'),('check_pay','c11691b8'),('cast_sales_aggregate','34a0bf1e'),('check_set_ext_rule','02b145a6')) p(n,m) left join pg_proc f on f.pronamespace='public'::regnamespace and f.proname=p.n where f.oid is null or left(md5(replace(f.prosrc, E'\r', '')),8)<>p.m)::text v, '' expected
  union all
  select '0173' mig, 'anon に execute がある関数（24 本中）' k, (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('check_group_due','pricing_resolve_core','set_pricing_rule','check_open','check_time_charge_apply','check_set_people','set_store_profile','report_can_close','daily_report_reclose','cash_diff_approve','daily_report_close','kiosk_login','kiosk_operator_list','staff_pin_status','set_staff_pin','daily_report_aggregate','bottle_keep_register','check_line_set_customer','check_close','check_void','customer_summary','check_pay','cast_sales_aggregate','check_set_ext_rule') and proacl::text like '%anon=%')::text v, '0' expected
  union all
  select '0173' mig, '内部専用 5 本に authenticated なし' k, (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('check_group_due','pricing_resolve_core','report_can_close','daily_report_aggregate','cast_sales_aggregate') and coalesce(proacl::text,'') not like '%authenticated=%')::text v, '5' expected
  union all
  select '0173' mig, '既存 bottle_keeps＝active 以外' k, (select count(*) from public.bottle_keeps where status<>'active')::text v, '0' expected
  union all
  select '0173' mig, 'is_default_ext true の行' k, (select count(*) from public.pricing_rules where is_default_ext)::text v, '0' expected
  union all
  select '0173' mig, 'set_frozen true の伝票' k, (select count(*) from public.checks where set_frozen)::text v, '0' expected
  union all
  select '0174' mig, '新列 6 本' k, (select count(*) from information_schema.columns where table_schema='public' and ((table_name='penalty_config' and column_name in ('norm_shimei_flat','norm_shimei_per','norm_sales_flat','norm_sales_per','norm_sales_unit')) or (table_name='comp_plans' and column_name='slide_apply')))::text v, '6' expected
  union all
  select '0174' mig, 'set_penalty_config 引数' k, (select coalesce((select pronargs from pg_proc where pronamespace='public'::regnamespace and proname='set_penalty_config' limit 1), 0))::text v, '17' expected
  union all
  select '0174' mig, 'set_comp_plan 引数' k, (select coalesce((select pronargs from pg_proc where pronamespace='public'::regnamespace and proname='set_comp_plan' limit 1), 0))::text v, '30' expected
  union all
  select '0174' mig, '旧版なし（set_penalty_config／set_comp_plan 各 1 本）' k, (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('set_penalty_config','set_comp_plan'))::text v, '2' expected
  union all
  select '0174' mig, '新設 kiosk_staff_list／staff_punch' k, (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('kiosk_staff_list','staff_punch'))::text v, '2' expected
  union all
  select '0174' mig, 'md5 pin 一致 6 本' k, (select count(*) from (values ('comp_plan_slide_check','8aedb6d7'),('set_penalty_config','d6c05607'),('set_comp_plan','21afb3f5'),('demo_org_reset','3cdf7a30'),('kiosk_staff_list','53e9d7a7'),('staff_punch','250c61b0')) p(n,m) join pg_proc f on f.pronamespace='public'::regnamespace and f.proname=p.n and left(md5(replace(f.prosrc, E'\r', '')),8)=p.m)::text v, '6' expected
  union all
  select '0174' mig, 'md5 不一致の関数名' k, (select coalesce(string_agg(p.n || ' ' || coalesce(left(md5(replace(f.prosrc, E'\r', '')),8), 'なし'), ' / '), '') from (values ('comp_plan_slide_check','8aedb6d7'),('set_penalty_config','d6c05607'),('set_comp_plan','21afb3f5'),('demo_org_reset','3cdf7a30'),('kiosk_staff_list','53e9d7a7'),('staff_punch','250c61b0')) p(n,m) left join pg_proc f on f.pronamespace='public'::regnamespace and f.proname=p.n where f.oid is null or left(md5(replace(f.prosrc, E'\r', '')),8)<>p.m)::text v, '' expected
  union all
  select '0174' mig, 'anon に execute がある関数（6 本中）' k, (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('comp_plan_slide_check','set_penalty_config','set_comp_plan','demo_org_reset','kiosk_staff_list','staff_punch') and proacl::text like '%anon=%')::text v, '0' expected
  union all
  select '0174' mig, 'thresholds 移行＝migrated/total' k, (select (count(*) filter (where not exists (select 1 from jsonb_array_elements(params->'thresholds') e where not (e ? 'amount'))))::text || '/' || count(*)::text from public.comp_plan_components where kind='achievement_bonus')::text v, '2/2' expected
  union all
  select '0174' mig, 'slide_apply が null でないプラン' k, (select count(*) from public.comp_plans c where exists (select 1 from information_schema.columns where table_name='comp_plans' and column_name='slide_apply') and c.slide_apply is not null)::text v, '0' expected
  union all
  select '0174' mig, 'スライド 4 段以上のプラン' k, (select count(*) from public.comp_plans where jsonb_array_length(sales_slide) > 3 or jsonb_array_length(point_slide) > 3)::text v, '0' expected
  union all
  select '0174' mig, 'demo_org_reset の配列に 4 表' k, (select count(*) from pg_proc where proname='demo_org_reset' and prosrc like '%''staff_contracts'',''staff_punches'',''staff_payroll_runs'',''terms_acceptances''%')::text v, '1' expected
)
select mig, k, v, expected, (v = expected) as ok
  from r;
