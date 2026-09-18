# 0918_w_live — W の live 読取（逐語・2026-09-18）

## w1 orgs 表定義（逐語）
id uuid NOT NULL DEFAULT gen_random_uuid()
name text NOT NULL
plan text NOT NULL DEFAULT 'early'::text
status text NOT NULL DEFAULT 'active'::text
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
orgs_pkey: PRIMARY KEY (id)
orgs_plan_check: CHECK ((plan = ANY (ARRAY['early'::text, 'standard'::text, 'premium'::text])))
orgs_status_check: CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text])))
CREATE UNIQUE INDEX orgs_pkey ON public.orgs USING btree (id)
orgs の trigger: [{"tgname":"orgs_touch_updated_at"}]
orgs の grants: [{"grantee":"authenticated","p":"SELECT"},{"grantee":"postgres","p":"DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"},{"grantee":"service_role","p":"DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"}]
orgs の policy: [{"policyname":"orgs_select","cmd":"SELECT","roles":"{authenticated}","qual":"(id = auth_org_id())"}]

## w2 削除順（確定形・残す 4 表を除く 67 表＋stock_logs 再削除＝68 手）
1. advances
2. approvals
3. ar_collections
4. attendance
5. attendance_incentives
6. audit_logs
7. bottle_keeps
8. cast_norms
9. cast_pin
10. cast_plan
11. cast_sensitive
12. cast_tax_profiles
13. cast_unavailable_days
14. check_cast_backs
15. check_nominations
16. check_seats
17. comp_plan_components
18. comp_plans
19. custom_back_defs
20. customer_notes
21. daily_reports
22. deductions
23. drink_claims
24. feature_flags
25. kiosk_sessions
26. notices
27. payment_records
28. payments
29. payroll_adjustments
30. payslips
31. penalty_config
32. pricing_rules
33. print_jobs
34. printer_config
35. product_costs
36. punches
37. receipt_issues
38. receivables
39. reservations
40. shift_rules
41. shifts
42. staff_pin
43. staff_shift_deadlines
44. staff_shifts
45. staffing_needs
46. stock_logs
47. store_business_hours
48. store_sales_targets
49. transport
50. trials
51. withholding_payments
52. check_lines
53. stock_logs（再削除）
54. checks
55. customers
56. kiosk_devices
57. payroll_runs
58. pricing_categories
59. products
60. seats
61. shift_periods
62. shift_wishes
63. staff_shift_wishes
64. casts
65. product_categories
66. staff_shift_patterns
67. cast_ranks
68. stores
投入順＝上の逆順（stock_logs の 2 回目は投入しない・stock_logs の sale 行は payload に入れない・drink_claims は最後）。

## w2 各表の列の性質（generated／identity／default now()／トリガ）
| 表 | generated | identity | default now() 系 | トリガ | 列数 |
|---|---|---|---|---|---|
| advances | - | - | created_at,updated_at | touch_updated_at | 15 |
| approvals | - | - | created_at | - | 14 |
| ar_collections | - | - | created_at | - | 13 |
| attendance | - | - | created_at,updated_at | touch_updated_at | 11 |
| attendance_incentives | - | - | created_at | - | 14 |
| audit_logs | - | - | at | - | 11 |
| bottle_keeps | - | - | opened_at,created_at,updated_at | touch_updated_at | 13 |
| cast_norms | - | - | created_at,updated_at | touch_updated_at | 11 |
| cast_pin | - | - | updated_at | - | 7 |
| cast_plan | - | - | created_at,updated_at,valid_from | touch_updated_at | 10 |
| cast_sensitive | - | - | created_at,updated_at | touch_updated_at | 8 |
| cast_tax_profiles | - | - | created_at,updated_at | touch_updated_at | 11 |
| cast_unavailable_days | - | - | created_at,updated_at | touch_updated_at | 9 |
| check_cast_backs | - | - | created_at | - | 13 |
| check_nominations | - | - | created_at | - | 11 |
| check_seats | - | - | created_at | - | 7 |
| comp_plan_components | - | - | created_at,updated_at | - | 13 |
| comp_plans | - | - | created_at,updated_at | touch_updated_at | 22 |
| custom_back_defs | - | - | created_at,updated_at | touch_updated_at | 10 |
| customer_notes | - | - | created_at,updated_at | - | 9 |
| daily_reports | - | - | closed_at,created_at,updated_at | touch_updated_at | 40 |
| deductions | - | - | created_at,updated_at | touch_updated_at | 13 |
| drink_claims | - | - | created_at | - | 16 |
| feature_flags | - | - | updated_at | - | 7 |
| kiosk_sessions | - | - | started_at,last_seen_at | - | 9 |
| notices | - | - | created_at | - | 10 |
| payment_records | - | - | created_at | - | 12 |
| payments | - | - | paid_at | - | 12 |
| payroll_adjustments | - | - | created_at | - | 15 |
| payslips | - | - | created_at,updated_at | touch_updated_at | 11 |
| penalty_config | - | - | created_at,updated_at | touch_updated_at | 16 |
| pricing_rules | - | - | created_at,updated_at | - | 19 |
| print_jobs | - | - | created_at | - | 15 |
| printer_config | - | - | updated_at | - | 6 |
| product_costs | - | - | created_at,updated_at | touch_updated_at | 6 |
| punches | - | - | punched_at,created_at | - | 13 |
| receipt_issues | - | - | issued_at | - | 18 |
| receivables | - | - | created_at,updated_at | touch_updated_at | 17 |
| reservations | - | - | created_at,updated_at | touch_updated_at | 17 |
| shift_rules | - | - | created_at,updated_at | touch_updated_at | 7 |
| shifts | - | - | created_at,updated_at | touch_updated_at | 15 |
| staff_pin | - | - | updated_at | - | 7 |
| staff_shift_deadlines | - | - | created_at | - | 8 |
| staff_shifts | - | - | created_at,updated_at | - | 17 |
| staffing_needs | - | - | created_at,updated_at | touch_updated_at | 9 |
| stock_logs | - | - | at | - | 8 |
| store_business_hours | - | - | created_at,updated_at | touch_updated_at | 9 |
| store_sales_targets | - | - | created_at,updated_at | - | 7 |
| transport | - | - | created_at,updated_at | touch_updated_at | 14 |
| trials | - | - | created_at,updated_at | touch_updated_at | 15 |
| withholding_payments | - | - | created_at | - | 7 |
| check_lines | - | - | created_at | check_lines_stock_ins->stock_on_check_line, check_lines_drink_claim_upd->drink_claims_guard_line_update, check_lines_drink_claim_del->drink_claims_on_line_delete, check_lines_stock_del->stock_on_check_line | 20 |
| checks | - | - | started_at,created_at,updated_at | touch_updated_at, checks_stock_void->stock_on_check_void | 41 |
| customers | - | - | created_at,updated_at | touch_updated_at | 14 |
| kiosk_devices | - | - | created_at,updated_at | - | 11 |
| payroll_runs | - | - | created_at,updated_at | touch_updated_at | 15 |
| pricing_categories | - | - | created_at,updated_at | - | 8 |
| products | - | - | created_at,updated_at | touch_updated_at | 19 |
| seats | - | - | created_at,updated_at | touch_updated_at | 9 |
| shift_periods | - | - | created_at,updated_at | touch_updated_at | 10 |
| shift_wishes | - | - | created_at,updated_at | touch_updated_at | 12 |
| staff_shift_wishes | - | - | created_at,updated_at | - | 10 |
| casts | - | - | created_at,updated_at,joined_on | touch_updated_at | 14 |
| product_categories | - | - | created_at | - | 7 |
| staff_shift_patterns | - | - | created_at | - | 10 |
| cast_ranks | - | - | created_at,updated_at | - | 8 |
| stores | - | - | created_at,updated_at | touch_updated_at | 30 |
トリガで書かれる列＝touch_updated_at（BEFORE UPDATE＝INSERT では動かない）／stock_on_check_line（check_lines INSERT→stock_logs の sale 行を自動生成）／drink_claims_* は DELETE／UPDATE 時のみ。

## w2 users／memberships を参照する FK
- memberships: FOREIGN KEY (user_id) REFERENCES users(id)
- casts: FOREIGN KEY (user_id) REFERENCES users(id)
- checks: FOREIGN KEY (voided_by) REFERENCES users(id)
- checks: FOREIGN KEY (created_by) REFERENCES users(id)
- payments: FOREIGN KEY (by_user_id) REFERENCES users(id)
- shift_wishes: FOREIGN KEY (decided_by) REFERENCES users(id)
- shifts: FOREIGN KEY (created_by) REFERENCES users(id)
- daily_reports: FOREIGN KEY (closed_by) REFERENCES users(id)
- payroll_runs: FOREIGN KEY (created_by) REFERENCES users(id)
- attendance_incentives: FOREIGN KEY (created_by) REFERENCES users(id)
- attendance_incentives: FOREIGN KEY (cancelled_by) REFERENCES users(id)
- advances: FOREIGN KEY (created_by) REFERENCES users(id)
- advances: FOREIGN KEY (cancelled_by) REFERENCES users(id)
- transport: FOREIGN KEY (created_by) REFERENCES users(id)
- transport: FOREIGN KEY (cancelled_by) REFERENCES users(id)
- payment_records: FOREIGN KEY (created_by) REFERENCES users(id)
- reservations: FOREIGN KEY (created_by) REFERENCES users(id)
- notices: FOREIGN KEY (created_by) REFERENCES users(id)
- staff_shifts: FOREIGN KEY (staff_id) REFERENCES memberships(id)
- approvals: FOREIGN KEY (requested_by) REFERENCES users(id)
- approvals: FOREIGN KEY (decided_by) REFERENCES users(id)
- drink_claims: FOREIGN KEY (requested_by) REFERENCES users(id)
- drink_claims: FOREIGN KEY (decided_by) REFERENCES users(id)
- print_jobs: FOREIGN KEY (created_by) REFERENCES users(id)
- check_seats: FOREIGN KEY (created_by) REFERENCES users(id)
- ar_collections: FOREIGN KEY (created_by) REFERENCES users(id)
- receivables: FOREIGN KEY (consent_by) REFERENCES users(id)
- staff_pin: FOREIGN KEY (membership_id) REFERENCES memberships(id)
- kiosk_sessions: FOREIGN KEY (membership_id) REFERENCES memberships(id)
- kiosk_sessions: FOREIGN KEY (operator_user_id) REFERENCES users(id)
- drink_claims: FOREIGN KEY (voided_by) REFERENCES users(id)
- customer_notes: FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
- staff_shifts: FOREIGN KEY (confirmed_by) REFERENCES memberships(id)
- receipt_issues: FOREIGN KEY (issued_by) REFERENCES users(id)
- receipt_issues: FOREIGN KEY (voided_by) REFERENCES users(id)
- shift_periods: FOREIGN KEY (created_by) REFERENCES users(id)
- staff_shifts: FOREIGN KEY (override_by) REFERENCES memberships(id)
- staff_shifts: FOREIGN KEY (created_by) REFERENCES memberships(id)
- cast_unavailable_days: FOREIGN KEY (created_by) REFERENCES users(id)
- staff_shift_patterns: FOREIGN KEY (created_by) REFERENCES memberships(id)
- staff_shift_wishes: FOREIGN KEY (staff_id) REFERENCES memberships(id)
- staff_shift_deadlines: FOREIGN KEY (created_by) REFERENCES memberships(id)
- daily_reports: FOREIGN KEY (reopened_by) REFERENCES memberships(id)
- daily_reports: FOREIGN KEY (reclosed_by) REFERENCES memberships(id)
- daily_reports: FOREIGN KEY (diff_approved_by) REFERENCES memberships(id)
- payroll_adjustments: FOREIGN KEY (created_by) REFERENCES users(id)
casts の列: id:uuid!, org_id:uuid!, store_id:uuid!, user_id:uuid, name:text!, kind:text, employment:text, is_active:boolean!, created_at:timestamp with time zone!, updated_at:timestamp with time zone!, photo_updated_at:timestamp with time zone, joined_on:date, left_on:date, rank_id:uuid

## w3 service_role 限定（authenticated／anon なし）の SECURITY DEFINER 関数＝12 本
- billing_writable_of {postgres=X/postgres,service_role=X/postgres}
- biz_date_of {postgres=X/postgres,service_role=X/postgres}
- biz_minutes_of {postgres=X/postgres,service_role=X/postgres}
- get_cast_mynumber {postgres=X/postgres,service_role=X/postgres}
- payroll_finalize {postgres=X/postgres,service_role=X/postgres}
- payroll_mark_paid {postgres=X/postgres,service_role=X/postgres}
- payroll_reopen {postgres=X/postgres,service_role=X/postgres}
- pricing_resolve_core {postgres=X/postgres,service_role=X/postgres}
- print_claim {postgres=X/postgres,service_role=X/postgres}
- print_result {postgres=X/postgres,service_role=X/postgres}
- stock_on_check_line {postgres=X/postgres,service_role=X/postgres}
- stock_on_check_void {postgres=X/postgres,service_role=X/postgres}

### 写経元 payroll_mark_paid（proacl {postgres=X/postgres,service_role=X/postgres}）
```sql
CREATE OR REPLACE FUNCTION public.payroll_mark_paid(p_org_id uuid, p_actor uuid, p_run_id uuid, p_idem_key uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org    uuid;
  v_store  uuid;
  v_status text;
  v_idem   uuid;
begin
  select org_id, store_id, status, paid_idem_key
    into v_org, v_store, v_status, v_idem
    from public.payroll_runs where id = p_run_id;
  if v_org is null then raise exception 'run not found'; end if;
  if p_org_id is null or v_org <> p_org_id then raise exception 'forbidden'; end if;

  -- 冪等（原則9 順序）: 既に paid で同一キーなら成功を返す（二重実行防止）
  if p_idem_key is not null and v_status = 'paid' and v_idem is not distinct from p_idem_key then
    return 'paid';
  end if;

  -- finalized→paid のみ許可（draft/paid からは不可）
  if v_status <> 'finalized' then raise exception 'not finalized'; end if;

  update public.payroll_runs
     set status = 'paid', paid_at = now(), paid_idem_key = p_idem_key
   where id = p_run_id;
  update public.payslips set paid = true where run_id = p_run_id; -- F2e 予約列を一括で立てる（実装ノート【10】）

  -- #6 service 経路監査（actor=p_actor・箱のみ＝実消し込みは F2e）
  perform public.audit_log_write_service(v_org, p_actor, 'payroll_mark_paid',
    'payroll_runs:' || p_run_id::text,
    jsonb_build_object('status', 'finalized'),
    jsonb_build_object('status', 'paid', 'idem_key', p_idem_key), v_store);
  return 'paid';
end $function$

```
audit_log_write 系の live 署名:
- audit_log_write(p_action text, p_target text DEFAULT NULL::text, p_before jsonb DEFAULT NULL::jsonb, p_after jsonb DEFAULT NULL::jsonb, p_store_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text) acl={postgres=X/postgres}
- audit_log_write_service(p_org_id uuid, p_actor uuid, p_action text, p_target text DEFAULT NULL::text, p_before jsonb DEFAULT NULL::jsonb, p_after jsonb DEFAULT NULL::jsonb, p_store_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text) acl={postgres=X/postgres}

## w4 statement_timeout の実効値
pg_db_role_setting: [{"rolname":"anon","datname":null,"setconfig":["statement_timeout=3s"]},{"rolname":"authenticated","datname":null,"setconfig":["statement_timeout=8s"]},{"rolname":"authenticator","datname":null,"setconfig":["session_preload_libraries=supautils, safeupdate","statement_timeout=8s","lock_timeout=8s"]},{"rolname":"postgres","datname":null,"setconfig":["search_path=\"\\$user\", public, extensions"]},{"rolname":"supabase_admin","datname":null,"setconfig":["search_path=\"$user\", public, auth, extensions","log_statement=none","statement_timeout=0"]},{"rolname":"supabase_auth_admin","datname":null,"setconfig":["search_path=auth","idle_in_transaction_session_timeout=60000","log_statement=none"]},{"rolname":"supabase_read_only_user","datname":null,"setconfig":["default_transaction_read_only=on"]},{"rolname":"supabase_storage_admin","datname":null,"setconfig":["search_path=storage","log_statement=none"]}]
pg_roles.rolconfig: [{"rolname":"anon","rolconfig":["statement_timeout=3s"]},{"rolname":"authenticated","rolconfig":["statement_timeout=8s"]},{"rolname":"authenticator","rolconfig":["session_preload_libraries=supautils, safeupdate","statement_timeout=8s","lock_timeout=8s"]},{"rolname":"postgres","rolconfig":["search_path=\"\\$user\", public, extensions"]},{"rolname":"service_role","rolconfig":null}]
現接続（postgres・直結）の statement_timeout: [{"statement_timeout":"2min"}]
関数レベル SET statement_timeout の前例: []
proconfig の種類: [{"c":"{search_path=public}","n":232},{"c":"{\"search_path=public, extensions\"}","n":9}]

## w5 storage cast-photos
buckets: [{"id":"cast-photos","public":false,"file_size_limit":"2097152","allowed_mime_types":["image/jpeg"]}]
policies: [{"policyname":"cast_photos_insert","cmd":"INSERT","roles":"{authenticated}","qual":null,"with_check":"((bucket_id = 'cast-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text) AND ((EXISTS ( SELECT 1\n   FROM casts c\n  WHERE ((((c.id)::text || '.jpg'::text) = storage.filename(objects.name)) AND (c.org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR ((auth_role() = 'manager'::text) AND (c.store_id = auth_store_id())))))) OR ((auth_cast_id() IS NOT NULL) AND (storage.filename(name) = ((auth_cast_id())::text || '.jpg'::text)))))"},{"policyname":"cast_photos_select","cmd":"SELECT","roles":"{authenticated}","qual":"((bucket_id = 'cast-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text))","with_check":null},{"policyname":"cast_photos_update","cmd":"UPDATE","roles":"{authenticated}","qual":"((bucket_id = 'cast-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text) AND ((EXISTS ( SELECT 1\n   FROM casts c\n  WHERE ((((c.id)::text || '.jpg'::text) = storage.filename(objects.name)) AND (c.org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR ((auth_role() = 'manager'::text) AND (c.store_id = auth_store_id())))))) OR ((auth_cast_id() IS NOT NULL) AND (storage.filename(name) = ((auth_cast_id())::text || '.jpg'::text)))))","with_check":"((bucket_id = 'cast-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text) AND ((EXISTS ( SELECT 1\n   FROM casts c\n  WHERE ((((c.id)::text || '.jpg'::text) = storage.filename(objects.name)) AND (c.org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR ((auth_role() = 'manager'::text) AND (c.store_id = auth_store_id())))))) OR ((auth_cast_id() IS NOT NULL) AND (storage.filename(name) = ((auth_cast_id())::text || '.jpg'::text)))))"}]
objects の現行パス例: [{"name":"389f7668-f059-4d39-af4b-89e120bc43fa/78b7b932-5407-418c-a11e-d3cdfa004698.jpg","bucket_id":"cast-photos"}]

## w6 デモのログイン用ユーザー
casts.user_id: [{"column_name":"user_id","is_nullable":"YES"}]
casts の FK: [{"child":"casts","parent":"orgs","def":"FOREIGN KEY (org_id) REFERENCES orgs(id)"},{"child":"casts","parent":"stores","def":"FOREIGN KEY (store_id) REFERENCES stores(id)"},{"child":"casts","parent":"users","def":"FOREIGN KEY (user_id) REFERENCES users(id)"},{"child":"casts","parent":"cast_ranks","def":"FOREIGN KEY (rank_id) REFERENCES cast_ranks(id)"}]
kiosk_devices の列: id:uuid!, org_id:uuid!, store_id:uuid!, auth_user_id:uuid!, label:text, is_active:boolean!, created_at:timestamp with time zone!, updated_at:timestamp with time zone!, purpose:text!, last_seen_at:timestamp with time zone, last_ip:text
NOX-DEMO の casts×users: [{"casts":7,"with_user":1}]
NOX-DEMO の memberships（role 別）: [{"role":"cast","n":1},{"role":"manager","n":1},{"role":"owner","n":1},{"role":"staff","n":2}]