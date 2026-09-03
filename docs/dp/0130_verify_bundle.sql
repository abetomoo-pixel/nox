-- mig0130 検証バンドル(単一結果セット・全行 ok=true 期待)
-- golden 6値・実行系(f0 8系統)は 118-1 CC レーンで担保
with f as (
  select p.proname, p.oid,
         pg_get_function_identity_arguments(p.oid) as args,
         pg_get_function_result(p.oid) as ret,
         p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('check_open','pricing_resolve_core','pricing_resolve',
                       'set_pricing_rule','check_time_charge_apply',
                       'check_extension_add','check_set_people')
)
select 'a1_core_6args_ret_unit' as item,
       (select count(*) = 1 from f where proname = 'pricing_resolve_core'
         and args like '%p_category_id uuid' and ret like '%billing_unit text%') as ok
union all
select 'a2_wrapper_6args_ret_unit',
       (select count(*) = 1 from f where proname = 'pricing_resolve'
         and args like '%p_category_id uuid' and ret like '%billing_unit text%')
union all
select 'a3_spr_16args',
       (select count(*) = 1 from f where proname = 'set_pricing_rule'
         and args like '%p_billing_unit text')
union all
select 'a4_no_overload_leak',
       (select count(*) = 7 from f)
union all
select 'b1_rules_check_vip',
       (select pg_get_constraintdef(oid) like '%vip_charge%' from pg_constraint
         where conrelid = 'public.pricing_rules'::regclass
           and conname = 'pricing_rules_fee_kind_check')
union all
select 'b2_lines_check_vip',
       (select pg_get_constraintdef(oid) like '%vip_charge%' from pg_constraint
         where conrelid = 'public.check_lines'::regclass
           and conname = 'check_lines_fee_kind_check')
union all
select 'b3_rules_billing_unit_col',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'pricing_rules'
                  and column_name = 'billing_unit')
union all
select 'b4_rules_billing_unit_check',
       exists (select 1 from pg_constraint
                where conrelid = 'public.pricing_rules'::regclass
                  and conname = 'pricing_rules_billing_unit_check')
union all
select 'c1_checks_4cols',
       (select count(*) = 4 from information_schema.columns
         where table_schema = 'public' and table_name = 'checks'
           and column_name in ('set_unit','ext_unit','vip_charge_fee','vip_charge_unit'))
union all
select 'c2_checks_unit_checks',
       (select count(*) = 4 from pg_constraint
         where conrelid = 'public.checks'::regclass
           and conname in ('checks_set_unit_check','checks_ext_unit_check',
                           'checks_vip_charge_fee_check','checks_vip_charge_unit_check'))
union all
select 'd1_core_acl_internal',
       (select not has_function_privilege('authenticated', oid, 'execute')
           and not has_function_privilege('anon', oid, 'execute')
          from f where proname = 'pricing_resolve_core')
union all
select 'd2_wrapper_acl',
       (select has_function_privilege('authenticated', oid, 'execute')
           and not has_function_privilege('anon', oid, 'execute')
          from f where proname = 'pricing_resolve')
union all
select 'd3_spr_acl',
       (select has_function_privilege('authenticated', oid, 'execute')
           and not has_function_privilege('anon', oid, 'execute')
          from f where proname = 'set_pricing_rule')
union all
select 'd4_check_open_acl',
       (select has_function_privilege('authenticated', oid, 'execute')
           and not has_function_privilege('anon', oid, 'execute')
          from f where proname = 'check_open')
union all
select 'e1_core_whitelist_vip',
       (select prosrc like '%''vip_charge''%' from f where proname = 'pricing_resolve_core')
union all
select 'e2_wrapper_whitelist_vip_ext',
       (select prosrc like '%''vip_charge''%' and prosrc like '%''ext_shimei''%'
          from f where proname = 'pricing_resolve')
union all
select 'e3_spr_no_ext_shimei',
       (select prosrc not like '%''ext_shimei''%' from f where proname = 'set_pricing_rule')
union all
select 'e4_spr_unit_guards',
       (select prosrc like '%bad unit kind%' and prosrc like '%bad unit''%'
          from f where proname = 'set_pricing_rule')
union all
select 'e5_spr_category_vip',
       (select prosrc like '%''set'',''extension'',''dohan'',''vip_charge''%'
          from f where proname = 'set_pricing_rule')
union all
select 'f1_open_vip_call',
       (select prosrc like '%''vip_charge'', v_seat.kind%' from f where proname = 'check_open')
union all
select 'f2_open_snap4',
       (select prosrc like '%v_sunit, v_eunit, v_vfee, v_vunit%' from f where proname = 'check_open')
union all
select 'f3_open_menu_unit_key',
       (select prosrc like '%''unit'', coalesce(r.billing_unit, v_seat.time_per)%'
          from f where proname = 'check_open')
union all
select 'f4_open_vip_line',
       (select prosrc like '%check_open_vip_line%' and prosrc like '%''vip_charge'', 0%'
          from f where proname = 'check_open')
union all
select 'g1_apply_two_units',
       (select prosrc like '%coalesce(v_chk.set_unit, v_chk.time_per)%'
           and prosrc like '%coalesce(v_chk.ext_unit, v_chk.time_per)%'
           and prosrc like '%ext_units%'
          from f where proname = 'check_time_charge_apply')
union all
select 'g2_ext_add_unit',
       (select prosrc like '%v_eunit_menu%' and prosrc like '%coalesce(v_chk.ext_unit, v_chk.time_per)%'
          from f where proname = 'check_extension_add')
union all
select 'g3_set_people_units',
       (select prosrc like '%coalesce(v_chk.set_unit, v_chk.time_per)%'
           and prosrc like '%fee_kind = ''vip_charge''%'
          from f where proname = 'check_set_people')
order by 1;
