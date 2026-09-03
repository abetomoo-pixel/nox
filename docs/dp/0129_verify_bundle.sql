-- mig0129 検証バンドル(単一結果セット・全行 ok=true 期待)
-- golden 6値・実行系(凍結・override・フォールバック null)は f0 側 gate
with f as (
  select p.proname, p.oid,
         pg_get_function_identity_arguments(p.oid) as args,
         p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'check_open'
)
select 'a1_check_open_still_6args_exactly1' as item,
       (select count(*) = 1 from f where args like '%p_category_id uuid') as ok
union all
select 'b1_checks_set_rule_id_col',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'checks'
                  and column_name = 'set_rule_id')
union all
select 'b2_checks_set_rule_name_col',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'checks'
                  and column_name = 'set_rule_name')
union all
select 'b3_no_fk_to_pricing_rules',
       not exists (select 1 from pg_constraint
                    where conrelid = 'public.checks'::regclass
                      and contype = 'f'
                      and confrelid = 'public.pricing_rules'::regclass)
union all
select 'c1_freeze_fetch_in_prosrc',
       (select prosrc like '%select r.name into v_rule_name%' from f)
union all
select 'c2_freeze_insert_in_prosrc',
       (select prosrc like '%r_set.rule_id, v_rule_name%' from f)
union all
select 'd1_acl_unchanged',
       (select has_function_privilege('authenticated', oid, 'execute')
           and not has_function_privilege('anon', oid, 'execute') from f)
order by 1;
