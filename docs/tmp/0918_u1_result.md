## u1 削除順（子→親・70 表・循環残り 0: ）
advances → approvals → ar_collections → attendance → attendance_incentives → audit_logs → bottle_keeps → cast_norms → cast_pin → cast_plan → cast_sensitive → cast_tax_profiles → cast_unavailable_days → check_cast_backs → check_nominations → check_seats → comp_plan_components → comp_plans → custom_back_defs → customer_notes → daily_reports → deductions → drink_claims → feature_flags → kiosk_sessions → notices → org_billing → payment_records → payments → payroll_adjustments → payslips → penalty_config → pricing_rules → print_jobs → printer_config → product_costs → punches → receipt_issues → receivables → reservations → shift_rules → shifts → staff_pin → staff_shift_deadlines → staff_shifts → staffing_needs → stock_logs → store_business_hours → store_sales_targets → transport → trials → withholding_payments → check_lines → checks → customers → kiosk_devices → payroll_runs → pricing_categories → products → seats → shift_periods → shift_wishes → staff_shift_wishes → casts → product_categories → staff_shift_patterns → memberships → cast_ranks → stores → users

所要（削除のみ・ROLLBACK 前）: 5633 ms・削除行 Σ=2604・阻まれた表=2
残（トランザクション内・削除後）: {"sl":263,"o":1}
snapshot before={"au":1128,"c":78,"l":405,"sl":352,"sh":243,"u":5,"mem":5,"o":1} after={"au":1128,"c":78,"l":405,"sl":352,"sh":243,"u":5,"mem":5,"o":1} 一致

| 表 | 削除行 | ms |
|---|---|---|
| advances | 0 | 106 |
| approvals | 1 | 85 |
| ar_collections | 1 | 103 |
| attendance | 12 | 108 |
| attendance_incentives | 0 | 92 |
| audit_logs | 1128 | 206 |
| bottle_keeps | 0 | 72 |
| cast_norms | 0 | 85 |
| cast_pin | 0 | 103 |
| cast_plan | 7 | 100 |
| cast_sensitive | 1 | 102 |
| cast_tax_profiles | 7 | 117 |
| cast_unavailable_days | 0 | 95 |
| check_cast_backs | 51 | 102 |
| check_nominations | 90 | 105 |
| check_seats | 0 | 107 |
| comp_plan_components | 0 | 98 |
| comp_plans | 3 | 101 |
| custom_back_defs | 2 | 107 |
| customer_notes | 1 | 109 |
| daily_reports | 2 | 120 |
| deductions | 1 | 109 |
| drink_claims | 10 | 105 |
| feature_flags | 2 | 92 |
| kiosk_sessions | 3 | 87 |
| notices | 1 | 85 |
| org_billing | 1 | 70 |
| payment_records | 0 | 57 |
| payments | 62 | 55 |
| payroll_adjustments | 0 | 63 |
| payslips | 11 | 69 |
| penalty_config | 0 | 71 |
| pricing_rules | 10 | 49 |
| print_jobs | 0 | 46 |
| printer_config | 0 | 42 |
| product_costs | 42 | 37 |
| punches | 0 | 46 |
| receipt_issues | 6 | 52 |
| receivables | 2 | 49 |
| reservations | 2 | 49 |
| shift_rules | 0 | 54 |
| shifts | 243 | 47 |
| staff_pin | 1 | 53 |
| staff_shift_deadlines | 0 | 68 |
| staff_shifts | 0 | 66 |
| staffing_needs | 7 | 58 |
| stock_logs | 352 | 52 |
| store_business_hours | 7 | 51 |
| store_sales_targets | 0 | 66 |
| transport | 1 | 74 |
| trials | 0 | 63 |
| withholding_payments | 0 | 66 |
| check_lines | 405 | 143 |
| checks | 78 | 81 |
| customers | 1 | 74 |
| kiosk_devices | 1 | 67 |
| payroll_runs | 2 | 78 |
| pricing_categories | 0 | 89 |
| products | -1 | 86 |
| seats | 9 | 92 |
| shift_periods | 2 | 79 |
| shift_wishes | 5 | 77 |
| staff_shift_wishes | 0 | 75 |
| casts | 7 | 90 |
| product_categories | 10 | 72 |
| staff_shift_patterns | 2 | 64 |
| memberships | 5 | 70 |
| cast_ranks | 2 | 68 |
| stores | -1 | 59 |
| users | 5 | 75 |

阻まれた表: products: update or delete on table "products" violates foreign key constraint "stock_logs_product_id_fkey" on table "stock_logs" / stores: update or delete on table "stores" violates foreign key constraint "products_store_id_fkey" on table "products"