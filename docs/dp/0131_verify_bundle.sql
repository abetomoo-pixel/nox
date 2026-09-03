-- mig0131 検証バンドル(単一結果セット・全行 ok=true 期待)
with f as (
  select p.proname, p.oid,
         pg_get_function_identity_arguments(p.oid) as args,
         p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('pricing_rule_reorder', 'pricing_categories_for_register',
                       'set_pricing_rule')
)
select 'a1_reorder_exactly1' as item,
       (select count(*) = 1 from f where proname = 'pricing_rule_reorder') as ok
union all
select 'a2_reorder_whitelist_vip',
       (select prosrc like '%''vip_charge''%' and prosrc not like '%''ext_shimei''%'
          from f where proname = 'pricing_rule_reorder')
union all
select 'b1_register_rpc_exactly1',
       (select count(*) = 1 from f where proname = 'pricing_categories_for_register')
union all
select 'b2_register_rpc_arms',
       (select prosrc like '%auth_staff_can_register%'
           and prosrc like '%auth_cast_can_register%'
           and prosrc like '%auth_kiosk_operator%'
          from f where proname = 'pricing_categories_for_register')
union all
select 'b3_register_rpc_active_only',
       (select prosrc like '%pc.is_active%' from f
         where proname = 'pricing_categories_for_register')
union all
select 'b4_register_rpc_no_billing_gate',
       (select prosrc not like '%billing_writable%' from f
         where proname = 'pricing_categories_for_register')
union all
select 'b5_register_rpc_acl',
       (select has_function_privilege('authenticated', oid, 'execute')
           and not has_function_privilege('anon', oid, 'execute')
          from f where proname = 'pricing_categories_for_register')
union all
select 'c1_spr_still_16args_exactly1',
       (select count(*) = 1 from f where proname = 'set_pricing_rule'
         and args like '%p_billing_unit text')
union all
select 'c2_spr_duration_cap',
       (select prosrc like '%p_duration_min > 1440%' from f
         where proname = 'set_pricing_rule')
union all
select 'd1_reorder_acl',
       (select has_function_privilege('authenticated', oid, 'execute')
           and not has_function_privilege('anon', oid, 'execute')
          from f where proname = 'pricing_rule_reorder')
union all
select 'd2_spr_acl',
       (select has_function_privilege('authenticated', oid, 'execute')
           and not has_function_privilege('anon', oid, 'execute')
          from f where proname = 'set_pricing_rule')
order by 1;
