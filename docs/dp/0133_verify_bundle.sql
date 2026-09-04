-- 0133 検証バンドル(単一結果セット・SQL Editor 用・Ctrl+A で全選択実行)
-- 期待: 全行 pass=true(6/6)
with
c01 as (select p.prosrc like '%v_units%' and p.prosrc like '%v_fixeds%'
           and p.prosrc like '%product_back_fixed%' as ok
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'check_close'),
c02 as (select p.prosrc like '%v_units[i] * v_fixeds[i]%' as ok
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'check_close'),
c03 as (select p.prosrc not like '%''plan_fixed'', null, null%' as ok
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'check_close'),
c04 as (select count(*) = 1 as ok from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'check_close'),
c05 as (select has_function_privilege('authenticated', 'public.check_close(uuid, uuid)', 'execute')
           and (not has_function_privilege('anon', 'public.check_close(uuid, uuid)', 'execute')) as ok),
c06 as (select count(*) = 1 as ok from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'biz_date_of')
select 'c01_prosrc_has_0133_idents' as item, ok as pass from c01
union all select 'c02_per_unit_calc_present', ok from c02
union all select 'c03_fixed_null_freeze_removed', ok from c03
union all select 'c04_single_overload', ok from c04
union all select 'c05_acl_unchanged', ok from c05
union all select 'c06_biz_date_of_untouched', ok from c06
order by 1;
