-- mig0128 検証バンドル(単一結果セット・全行 ok=true 期待)
-- golden 6値・実行系(null 現行等価/区分一致優先/凍結/kiosk 互換)は f0 側 gate で担保
with f as (
  select p.proname, p.oid,
         pg_get_function_identity_arguments(p.oid) as args,
         p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('check_open', 'pricing_resolve_core', 'set_pricing_rule')
)
select 'a1_check_open_6args_exactly1' as item,
       (select count(*) = 1 from f where proname = 'check_open'
         and args like '%p_category_id uuid') as ok
union all
select 'a2_core_6args_exactly1',
       (select count(*) = 1 from f where proname = 'pricing_resolve_core'
         and args like '%p_category_id uuid')
union all
select 'a3_set_rule_15args_exactly1',
       (select count(*) = 1 from f where proname = 'set_pricing_rule'
         and args like '%p_category_id uuid')
union all
select 'a4_no_overload_leak',
       (select count(*) = 3 from f)
union all
select 'b1_checks_category_id_col',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'checks'
                  and column_name = 'category_id')
union all
select 'b2_checks_category_name_col',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'checks'
                  and column_name = 'category_name')
union all
select 'b3_checks_category_fk',
       exists (select 1 from pg_constraint
                where conrelid = 'public.checks'::regclass
                  and contype = 'f'
                  and confrelid = 'public.pricing_categories'::regclass)
union all
select 'c1_check_open_acl',
       (select has_function_privilege('authenticated', oid, 'execute')
           and not has_function_privilege('anon', oid, 'execute')
          from f where proname = 'check_open')
union all
select 'c2_set_rule_acl',
       (select has_function_privilege('authenticated', oid, 'execute')
           and not has_function_privilege('anon', oid, 'execute')
          from f where proname = 'set_pricing_rule')
union all
select 'c3_core_acl_internal_only',
       (select not has_function_privilege('authenticated', oid, 'execute')
           and not has_function_privilege('anon', oid, 'execute')
          from f where proname = 'pricing_resolve_core')
union all
select 'd1_mirror_where_core',
       (select prosrc like '%category_id is null or r.category_id = p_category_id%'
          from f where proname = 'pricing_resolve_core')
union all
select 'd2_mirror_where_check_open',
       (select prosrc like '%category_id is null or r.category_id = p_category_id%'
          from f where proname = 'check_open')
union all
select 'd3_mirror_order_core',
       (select prosrc like '%(r.category_id is not null) desc%'
          from f where proname = 'pricing_resolve_core')
union all
select 'd4_mirror_order_check_open',
       (select prosrc like '%(r.category_id is not null) desc%'
          from f where proname = 'check_open')
union all
select 'e1_guard_category_kind',
       (select prosrc like '%bad category kind%'
          from f where proname = 'set_pricing_rule')
union all
select 'e2_guard_inactive_category',
       (select prosrc like '%inactive category%'
          from f where proname = 'set_pricing_rule')
union all
select 'e3_freeze_in_check_open',
       (select prosrc like '%category_name%'
          from f where proname = 'check_open')
order by 1;
