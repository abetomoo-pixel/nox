-- 0134 検証バンドル(単一結果セット・SQL Editor 用・Ctrl+A で全選択実行)
-- 期待: 全行 pass=true(7/7)
with
f as (select p.oid, p.pronargs, p.prosrc, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'set_comp_plan'),
c01 as (select count(*) = 1 as ok from f),
c02 as (select pronargs = 19 as ok from f),
c03 as (select args like '%p_product_back_mode text%' and args like '%p_product_back_rate integer%'
           and args like '%p_product_back_fixed integer%' as ok from f),
c04 as (select prosrc like '%bad product_back_mode%' and prosrc like '%bad product_back_rate%'
           and prosrc like '%bad product_back_fixed%' as ok from f),
c05 as (select prosrc like '%dohan rate requires R-2b%' and prosrc like '%duplicate name%' as ok from f),
c06 as (select (select count(*) from f where prosrc like '%product_back_mode, product_back_rate, product_back_fixed%') = 1
           and (select count(*) from f where prosrc like '%product_back_fixed = p_product_back_fixed%') = 1 as ok),
c07 as (select has_function_privilege('authenticated', (select oid from f), 'execute')
           and has_function_privilege('service_role', (select oid from f), 'execute')
           and (not has_function_privilege('anon', (select oid from f), 'execute')) as ok)
select 'c01_single_overload' as item, ok as pass from c01
union all select 'c02_pronargs_19', ok from c02
union all select 'c03_new_args_present', ok from c03
union all select 'c04_validation_present', ok from c04
union all select 'c05_existing_guards_kept', ok from c05
union all select 'c06_insert_update_cols', ok from c06
union all select 'c07_acl_unchanged', ok from c07
order by 1;
