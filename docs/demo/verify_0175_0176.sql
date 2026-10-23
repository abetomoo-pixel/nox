-- docs/demo/verify_0175_0176.sql — 0175／0176 の検証を 1 文に（2026-10-22 起草・恒久注意31＝Supabase SQL Editor は最後の文の結果しか返さない）。
-- 貼り方: 本番 ref hiqbfagmkrdpmlqhkmsu の SQL Editor に全文を貼って Run → 行（mig／k／v／expected／ok）を CC へ貼る。SELECT のみ（書込なし）。
-- 読み方: ok=true が全行なら両方適用済み。0175 だけ適用の時点では mig='0176' の行が false＝想定どおり。
-- md5 pin＝起草ファイルの関数本体（AS 句の関数本体・\r 除去・先頭 8 桁）＝生成器 docs/tmp/gen_verify_0175_0176.mjs。「md5 不一致の関数名」が空＝全一致（1 本でも出たら未適用か改稿ずれ・0176 適用後は set_my_contact は 0176 の値）。
-- 新しい列を直接 select しない（列が無い時点でも落ちない＝information_schema で数える）。
with pins(name, md5) as (
  values
      ('pt_rules_check','cc622435'),
      ('check_pay','3cb13667'),
      ('check_group_due','22428eed'),
      ('receipt_issue','3c277f65'),
      ('set_store_profile','c65329e5'),
      ('set_comp_plan','e9143f01'),
      ('cast_sales_aggregate','8fb314c5'),
      ('payroll_adjustment_add','9a089cad'),
      ('payroll_adjustment_cancel','540e9920'),
      ('norm_shortfall_decide','f5860b16'),
      ('daily_pay_cancel','3f7a1c81'),
      ('check_set_nominations','757306ca'),
      ('demo_org_reset','0d689b6e'),
      ('set_cast_kind','b03a634e'),
      ('set_pricing_rule_vip','5f1af9a7'),
      ('staff_payroll_run_set_status','f9352445'),
      ('store_wifi_add','78aa0c9c'),
      ('store_wifi_remove','ede89a17'),
      ('punch_self','74a22063'),
      ('punch_proxy','bb59dc9a'),
      ('availability_set','393a6d45'),
      ('availability_list','da9c6040'),
      ('set_my_contact','728ef975'),
      ('attendance_set','031e9e21'),
      ('daily_pay_issue','df0d58ff'),
      ('comp_plan_pay_rate_check','a2bd4f02'),
      ('comp_plan_ext_set','ba30d4dd'),
      ('plan_rate_band_set','a1db0579'),
      ('plan_norm_tier_set','ebc40f01'),
      ('plan_event_bonus_set','aa2c32f9'),
      ('slide_decision_propose','8b36e688'),
      ('slide_decision_decide','d7677013'),
      ('cast_rate_history_add','52da1c07'),
      ('set_store_line_config','71d050d9'),
      ('set_line_secret','9c478364'),
      ('get_line_secret','a7088f36'),
      ('line_bind_token_create','170038c6'),
      ('bind_line','aa9a6ecf'),
      ('set_store_line_limit','23255bce'),
      ('line_push_log_write','6201e784'),
      ('line_push_month_summary','323902cb'),
      ('staff_contract_set','3420d434'),
      ('staff_invite_create','347f3c6d'),
      ('staff_invite_accept','881f740d'),
      ('member_profile_self_save','0f9c3258'),
      ('member_profile_store_save','b1d551ef'),
      ('member_profile_confirm','466e6a1c'),
      ('attendance_contact_log','179f5992'),
      ('attendance_ack','b203ee79'),
      ('contact_change_confirm','07bb9b2f'),
      ('shift_period_needs_set','9a047177'),
      ('shift_periods_auto_close','9ef72a07'),
      ('shift_cast_decline','30321af5'),
      ('cast_notification_create','5c453f0e'),
      ('cast_notification_read','1a215089'),
      ('notice_create_targets','9f407a40')
), r(mig, k, v, expected) as (
  select 'both', '貼り先証明 orgs', (select count(*) from public.orgs)::text, '9'
  union all select '0175', '新表 8（v2）', (select count(*) from pg_tables where schemaname='public' and tablename in ('punch_round_consents','availability','availability_terms','plan_rate_bands','plan_norm_tiers','plan_event_bonuses','slide_decisions','cast_rate_history'))::text, '8'
  union all select '0175', 'comp_plans v2 列 12', (select count(*) from information_schema.columns where table_schema='public' and table_name='comp_plans' and column_name in ('pay_rate_tiers','slide_streak_n','reward_axis','assess_grace_months','hon_back_unit','jonai_back_unit','dohan_back_unit','product_back_rate_by_kind','product_back_fixed_vip','product_back_rate_vip','reservation_back_tiers','back_rate_tiers'))::text, '12'
  union all select '0175', 'stores.service_rate_by_seat／attendance の dohan 行 0', (select count(*) from information_schema.columns where table_schema='public' and table_name='stores' and column_name='service_rate_by_seat')::text || '/' || (select count(*) from public.attendance where status='dohan')::text, '1/0'
  union all select '0175', 'v2 新設 RPC 8', (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('comp_plan_pay_rate_check','comp_plan_ext_set','plan_rate_band_set','plan_norm_tier_set','plan_event_bonus_set','slide_decision_propose','slide_decision_decide','cast_rate_history_add'))::text, '8'
  union all select '0175', 'stores 打刻列 9', (select count(*) from information_schema.columns where table_schema='public' and table_name='stores' and column_name in ('punch_enforce','punch_restrict_mode','punch_lat','punch_lng','punch_radius_m','punch_allow_ip','punch_require_shift','punch_round_unit','punch_round_mode'))::text, '9'
  union all select '0175', 'comp_plans slide_method／pt_rules', (select count(*) from information_schema.columns where table_schema='public' and table_name='comp_plans' and column_name in ('slide_method','pt_rules'))::text, '2'
  union all select '0175', 'products.pt／check_lines.fee_rate／daily_reports.other_cash_memo／punches.geo_override', (select count(*) from information_schema.columns where table_schema='public' and ((table_name='products' and column_name='pt') or (table_name='check_lines' and column_name='fee_rate') or (table_name='daily_reports' and column_name='other_cash_memo') or (table_name='punches' and column_name='geo_override')))::text, '4'
  union all select '0175', 'receipt_issues reissue_of／by_membership', (select count(*) from information_schema.columns where table_schema='public' and table_name='receipt_issues' and column_name in ('reissue_of','by_membership'))::text, '2'
  union all select '0175', 'payroll_adjustments 新列 6', (select count(*) from information_schema.columns where table_schema='public' and table_name='payroll_adjustments' and column_name in ('kind','source_table','source_id','cancelled_at','cancelled_by','cancel_reason'))::text, '6'
  union all select '0175', 'daily_pays 取消 3', (select count(*) from information_schema.columns where table_schema='public' and table_name='daily_pays' and column_name in ('cancelled_at','cancelled_by','cancel_reason'))::text, '3'
  union all select '0175', 'pricing_rules vip_timing／vip_ext_amount', (select count(*) from information_schema.columns where table_schema='public' and table_name='pricing_rules' and column_name in ('vip_timing','vip_ext_amount'))::text, '2'
  union all select '0175', 'staff_contracts 新列 6／memberships 2／users 2', (select count(*) from information_schema.columns where table_schema='public' and ((table_name='staff_contracts' and column_name in ('pay_kind','monthly','daily','min_month_h','max_month_h','max_consec')) or (table_name='memberships' and column_name in ('hire_date','leave_date')) or (table_name='users' and column_name in ('contact_email','phone'))))::text, '10'
  union all select '0175', '引数 check_pay／receipt_issue／set_comp_plan／payroll_adjustment_add／punch_self', (select string_agg(proname || '=' || pronargs, ',' order by proname) from pg_proc where pronamespace='public'::regnamespace and proname in ('check_pay','receipt_issue','set_comp_plan','payroll_adjustment_add','punch_self','daily_pay_issue')), 'check_pay=10,daily_pay_issue=6,payroll_adjustment_add=14,punch_self=7,receipt_issue=6,set_comp_plan=32'
  union all select '0175', '旧署名の残り（overload）', (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('check_pay','receipt_issue','set_comp_plan','payroll_adjustment_add','punch_self','daily_pay_issue'))::text, '6'
  union all select '0175', '新設 RPC 12', (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('pt_rules_check','payroll_adjustment_cancel','norm_shortfall_decide','daily_pay_cancel','set_cast_kind','set_pricing_rule_vip','staff_payroll_run_set_status','store_wifi_add','store_wifi_remove','availability_set','availability_list','set_my_contact'))::text, '12'
  union all select '0175', '内部専用 pt_rules_check に authenticated なし', (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='pt_rules_check' and coalesce(proacl::text, '') not like '%authenticated%')::text, '1'
  union all select '0175', 'authenticated は SELECT のみ（新表 8）', (select coalesce(string_agg(distinct privilege_type, ','), '') from information_schema.role_table_grants where grantee='authenticated' and table_schema='public' and table_name in ('punch_round_consents','availability','availability_terms','plan_rate_bands','plan_norm_tiers','plan_event_bonuses','slide_decisions','cast_rate_history')), 'SELECT'
  union all select '0175', 'anon の付与 0（新表 3）', (select count(*) from information_schema.role_table_grants where grantee='anon' and table_schema='public' and table_name in ('punch_round_consents','availability','availability_terms'))::text, '0'
  union all select '0175', 'price_display の既定＝外税', (select case when column_default like '%tax_excluded%' then 'tax_excluded' else coalesce(column_default, '') end from information_schema.columns where table_schema='public' and table_name='stores' and column_name='price_display'), 'tax_excluded'
  union all select '0176', '新表 9', (select count(*) from pg_tables where schemaname='public' and tablename in ('line_links','line_bind_tokens','line_push_log','staff_invites','member_profiles','attendance_contacts','contact_changes','shift_period_needs','cast_notifications'))::text, '9'
  union all select '0176', 'stores line_config／line_monthly_limit', (select count(*) from information_schema.columns where table_schema='public' and table_name='stores' and column_name in ('line_config','line_monthly_limit'))::text, '2'
  union all select '0176', 'attendance ack 2／shifts decline 2／notices.cast_ids', (select count(*) from information_schema.columns where table_schema='public' and ((table_name='attendance' and column_name in ('ack_at','ack_by')) or (table_name='shifts' and column_name in ('declined_at','decline_reason')) or (table_name='notices' and column_name='cast_ids')))::text, '5'
  union all select '0176', '新設 RPC 24', (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('set_store_line_config','set_line_secret','get_line_secret','line_bind_token_create','bind_line','set_store_line_limit','line_push_log_write','line_push_month_summary','staff_contract_set','staff_invite_create','staff_invite_accept','member_profile_self_save','member_profile_store_save','member_profile_confirm','attendance_contact_log','attendance_ack','set_my_contact','contact_change_confirm','shift_period_needs_set','shift_periods_auto_close','shift_cast_decline','cast_notification_create','cast_notification_read','notice_create_targets'))::text, '24'
  union all select '0176', 'service_role 専用 6 本に authenticated なし', (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('set_line_secret','get_line_secret','bind_line','staff_invite_accept','line_push_log_write','shift_periods_auto_close') and coalesce(proacl::text, '') not like '%authenticated%' and coalesce(proacl::text, '') like '%service_role%')::text, '6'
  union all select '0176', 'authenticated は SELECT のみ（新表 8・line_bind_tokens は付与 0）', (select coalesce(string_agg(distinct privilege_type, ','), '') from information_schema.role_table_grants where grantee='authenticated' and table_schema='public' and table_name in ('line_links','line_push_log','staff_invites','member_profiles','attendance_contacts','contact_changes','shift_period_needs','cast_notifications')), 'SELECT'
  union all select '0176', 'line_bind_tokens に authenticated／anon の付与 0', (select count(*) from information_schema.role_table_grants where grantee in ('authenticated','anon') and table_schema='public' and table_name='line_bind_tokens')::text, '0'
  union all select '0176', 'supabase_vault', (select count(*) from pg_extension where extname='supabase_vault')::text, '1'
  union all select 'both', 'md5 不一致の関数名（空＝全一致）', (select coalesce(string_agg(p.name, ',' order by p.name), '') from pins p left join pg_proc f on f.pronamespace='public'::regnamespace and f.proname = p.name and left(md5(replace(f.prosrc, E'\r', '')), 8) = p.md5 where f.oid is null), ''
  union all select 'both', '関数数（0174 後 314＋20（0175 v2）＋23（0176）＝357）', (select count(*) from pg_proc where pronamespace='public'::regnamespace)::text, '357'
  union all select 'both', '表数（0174 後 87＋8（0175 v2）＋9（0176）＝104）', (select count(*) from pg_tables where schemaname='public')::text, '104'
)
select mig, k, v, expected, (v = expected) as ok from r;
