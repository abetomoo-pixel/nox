-- 0132 検証バンドル(単一結果セット・SQL Editor 用・Ctrl+A で全選択実行)
-- 期待: 全行 pass=true(14/14)
with
c01 as (select count(*) = 3 as ok from information_schema.columns
        where table_schema = 'public' and table_name = 'comp_plans'
          and column_name in ('product_back_mode','product_back_rate','product_back_fixed')),
c02 as (select count(*) = 3 as ok from information_schema.columns
        where table_schema = 'public' and table_name = 'check_cast_backs'
          and column_name in ('source_mode','product_sales_base','calculated_back_amount')),
c03 as (select count(*) = 5 as ok from pg_constraint where conname in
        ('comp_plans_product_back_mode_check','comp_plans_product_back_rate_check',
         'comp_plans_product_back_rate_pair_check','comp_plans_product_back_fixed_check',
         'comp_plans_product_back_fixed_pair_check')),
c04 as (select count(*) = 3 as ok from pg_constraint where conname in
        ('check_cast_backs_source_mode_check','check_cast_backs_product_sales_base_check',
         'check_cast_backs_calculated_back_amount_check')),
c05 as (select (select column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'comp_plans'
          and column_name = 'product_back_mode') like '%product_rule%' as ok),
c06 as (select count(*) = 0 as ok from public.comp_plans where product_back_mode <> 'product_rule'),
c07 as (select count(*) = 0 as ok from public.check_cast_backs where source_mode is not null),
c08 as (select count(*) = 1 as ok from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'biz_date_of'),
c09 as (select p.prosecdef and p.provolatile = 's' as ok
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'biz_date_of'),
c10 as (select (not has_function_privilege('anon', 'public.biz_date_of(uuid, timestamptz)', 'execute'))
           and (not has_function_privilege('authenticated', 'public.biz_date_of(uuid, timestamptz)', 'execute')) as ok),
c11 as (select p.prosrc like '%biz_date_of%' and p.prosrc like '%plan_rate%'
           and p.prosrc like '%plan_fixed%' and p.prosrc like '%source_mode%' as ok
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'check_close'),
c12 as (select has_function_privilege('authenticated', 'public.check_close(uuid, uuid)', 'execute')
           and (not has_function_privilege('anon', 'public.check_close(uuid, uuid)', 'execute')) as ok),
c13 as (select public.biz_date_of((select id from public.stores order by created_at limit 1), now()) is not null as ok),
c14 as (select count(*) = 1 as ok from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'check_close')
select 'c01_comp_plans_3cols' as item, ok as pass from c01
union all select 'c02_ccb_3cols', ok from c02
union all select 'c03_comp_plans_5checks', ok from c03
union all select 'c04_ccb_3checks', ok from c04
union all select 'c05_mode_default_product_rule', ok from c05
union all select 'c06_existing_plans_all_default', ok from c06
union all select 'c07_existing_ccb_rows_null_mode', ok from c07
union all select 'c08_biz_date_of_exactly_one', ok from c08
union all select 'c09_biz_date_of_stable_definer', ok from c09
union all select 'c10_biz_date_of_no_client_acl', ok from c10
union all select 'c11_check_close_prosrc_has_0132', ok from c11
union all select 'c12_check_close_acl_unchanged', ok from c12
union all select 'c13_biz_date_of_functional', ok from c13
union all select 'c14_check_close_single_overload', ok from c14
order by 1;
