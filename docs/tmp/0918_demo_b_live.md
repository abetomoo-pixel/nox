# 0918_demo_b_live — O-b/c/h/i の live 読取（逐語・2026-09-18）

## b-1 トリガ（public・内部除く）
- advances.advances_touch_updated_at: CREATE TRIGGER advances_touch_updated_at BEFORE UPDATE ON public.advances FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- attendance.attendance_touch_updated_at: CREATE TRIGGER attendance_touch_updated_at BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- bottle_keeps.bottle_keeps_touch_updated_at: CREATE TRIGGER bottle_keeps_touch_updated_at BEFORE UPDATE ON public.bottle_keeps FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- cast_norms.cast_norms_touch_updated_at: CREATE TRIGGER cast_norms_touch_updated_at BEFORE UPDATE ON public.cast_norms FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- cast_plan.cast_plan_touch_updated_at: CREATE TRIGGER cast_plan_touch_updated_at BEFORE UPDATE ON public.cast_plan FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- cast_sensitive.cast_sensitive_touch_updated_at: CREATE TRIGGER cast_sensitive_touch_updated_at BEFORE UPDATE ON public.cast_sensitive FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- cast_tax_profiles.cast_tax_profiles_touch_updated_at: CREATE TRIGGER cast_tax_profiles_touch_updated_at BEFORE UPDATE ON public.cast_tax_profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- cast_unavailable_days.cast_unavailable_days_touch_updated_at: CREATE TRIGGER cast_unavailable_days_touch_updated_at BEFORE UPDATE ON public.cast_unavailable_days FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- casts.casts_touch_updated_at: CREATE TRIGGER casts_touch_updated_at BEFORE UPDATE ON public.casts FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- check_lines.check_lines_drink_claim_del: CREATE TRIGGER check_lines_drink_claim_del BEFORE DELETE ON public.check_lines FOR EACH ROW EXECUTE FUNCTION drink_claims_on_line_delete() ／ fn=drink_claims_on_line_delete md5=cb32bf01cbf21161a29e6ff822ca0148
- check_lines.check_lines_drink_claim_upd: CREATE TRIGGER check_lines_drink_claim_upd BEFORE UPDATE ON public.check_lines FOR EACH ROW EXECUTE FUNCTION drink_claims_guard_line_update() ／ fn=drink_claims_guard_line_update md5=35acf47e7d02cfb10847c3138bda34cf
- check_lines.check_lines_stock_del: CREATE TRIGGER check_lines_stock_del AFTER DELETE ON public.check_lines FOR EACH ROW WHEN (((old.product_id IS NOT NULL) AND (old.qty <> 0))) EXECUTE FUNCTION stock_on_check_line() ／ fn=stock_on_check_line md5=8f97086401f1f517be125b1dd431b1f3
- check_lines.check_lines_stock_ins: CREATE TRIGGER check_lines_stock_ins AFTER INSERT ON public.check_lines FOR EACH ROW WHEN (((new.product_id IS NOT NULL) AND (new.qty <> 0))) EXECUTE FUNCTION stock_on_check_line() ／ fn=stock_on_check_line md5=8f97086401f1f517be125b1dd431b1f3
- checks.checks_stock_void: CREATE TRIGGER checks_stock_void AFTER UPDATE ON public.checks FOR EACH ROW WHEN (((old.status <> 'void'::text) AND (new.status = 'void'::text))) EXECUTE FUNCTION stock_on_check_void() ／ fn=stock_on_check_void md5=cf922f38924fe342c31f0faaaeb9e1b1
- checks.checks_touch_updated_at: CREATE TRIGGER checks_touch_updated_at BEFORE UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- comp_plans.comp_plans_touch_updated_at: CREATE TRIGGER comp_plans_touch_updated_at BEFORE UPDATE ON public.comp_plans FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- custom_back_defs.custom_back_defs_touch_updated_at: CREATE TRIGGER custom_back_defs_touch_updated_at BEFORE UPDATE ON public.custom_back_defs FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- customers.customers_touch_updated_at: CREATE TRIGGER customers_touch_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- daily_reports.daily_reports_touch_updated_at: CREATE TRIGGER daily_reports_touch_updated_at BEFORE UPDATE ON public.daily_reports FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- deductions.deductions_touch_updated_at: CREATE TRIGGER deductions_touch_updated_at BEFORE UPDATE ON public.deductions FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- memberships.memberships_touch_updated_at: CREATE TRIGGER memberships_touch_updated_at BEFORE UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- org_billing.org_billing_touch_updated_at: CREATE TRIGGER org_billing_touch_updated_at BEFORE UPDATE ON public.org_billing FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- orgs.orgs_touch_updated_at: CREATE TRIGGER orgs_touch_updated_at BEFORE UPDATE ON public.orgs FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- payroll_runs.payroll_runs_touch_updated_at: CREATE TRIGGER payroll_runs_touch_updated_at BEFORE UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- payslips.payslips_touch_updated_at: CREATE TRIGGER payslips_touch_updated_at BEFORE UPDATE ON public.payslips FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- penalty_config.penalty_config_touch_updated_at: CREATE TRIGGER penalty_config_touch_updated_at BEFORE UPDATE ON public.penalty_config FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- product_costs.product_costs_touch_updated_at: CREATE TRIGGER product_costs_touch_updated_at BEFORE UPDATE ON public.product_costs FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- products.products_touch_updated_at: CREATE TRIGGER products_touch_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- receivables.receivables_touch_updated_at: CREATE TRIGGER receivables_touch_updated_at BEFORE UPDATE ON public.receivables FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- reservations.reservations_touch_updated_at: CREATE TRIGGER reservations_touch_updated_at BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- seats.seats_touch_updated_at: CREATE TRIGGER seats_touch_updated_at BEFORE UPDATE ON public.seats FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- shift_periods.shift_periods_touch_updated_at: CREATE TRIGGER shift_periods_touch_updated_at BEFORE UPDATE ON public.shift_periods FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- shift_rules.shift_rules_touch_updated_at: CREATE TRIGGER shift_rules_touch_updated_at BEFORE UPDATE ON public.shift_rules FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- shift_wishes.shift_wishes_touch_updated_at: CREATE TRIGGER shift_wishes_touch_updated_at BEFORE UPDATE ON public.shift_wishes FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- shifts.shifts_touch_updated_at: CREATE TRIGGER shifts_touch_updated_at BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- staffing_needs.staffing_needs_touch_updated_at: CREATE TRIGGER staffing_needs_touch_updated_at BEFORE UPDATE ON public.staffing_needs FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- store_business_hours.store_business_hours_touch_updated_at: CREATE TRIGGER store_business_hours_touch_updated_at BEFORE UPDATE ON public.store_business_hours FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- stores.stores_touch_updated_at: CREATE TRIGGER stores_touch_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- transport.transport_touch_updated_at: CREATE TRIGGER transport_touch_updated_at BEFORE UPDATE ON public.transport FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- trials.trials_touch_updated_at: CREATE TRIGGER trials_touch_updated_at BEFORE UPDATE ON public.trials FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c
- users.users_touch_updated_at: CREATE TRIGGER users_touch_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION touch_updated_at() ／ fn=touch_updated_at md5=204b9b9355e61b7541bc0633bbc9294c

### trigger fn touch_updated_at
```sql
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$

```

### trigger fn drink_claims_on_line_delete
```sql
CREATE OR REPLACE FUNCTION public.drink_claims_on_line_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_actor uuid; v_before jsonb; r record;
begin
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  for r in select * from public.drink_claims
            where check_line_id = old.id and status = 'approved'
  loop
    v_before := to_jsonb(r);
    update public.drink_claims
       set status = 'void', voided_by = v_actor, voided_at = now()
     where id = r.id;
    -- service-role の fixture 掃除では auth 文脈が無い＝audit は文脈がある時のみ
    if coalesce(public.auth_org_id(), public.auth_kiosk_org_id()) is not null then
      perform public.audit_log_write('drink_claim_void_by_line_delete',
        'drink_claims:' || r.id::text, v_before,
        (select to_jsonb(d) from public.drink_claims d where d.id = r.id), r.store_id);
    end if;
  end loop;
  return old;
end $function$

```

### trigger fn drink_claims_guard_line_update
```sql
CREATE OR REPLACE FUNCTION public.drink_claims_guard_line_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.qty is distinct from old.qty
     or new.unit_price_snapshot is distinct from old.unit_price_snapshot
     or new.back_snapshot is distinct from old.back_snapshot then
    if exists (select 1 from public.drink_claims d
                where d.check_line_id = old.id and d.status = 'approved') then
      raise exception 'line has live drink claim';
    end if;
  end if;
  return new;
end $function$

```

### trigger fn stock_on_check_line
```sql
CREATE OR REPLACE FUNCTION public.stock_on_check_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid;
begin
  select id into v_actor
    from public.users
   where auth_user_id = auth.uid() and is_active;

  if tg_op = 'INSERT' then
    insert into public.stock_logs (org_id, store_id, product_id, delta, reason, by_user_id)
    values (new.org_id, new.store_id, new.product_id, -new.qty, 'sale', v_actor);
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.stock_logs (org_id, store_id, product_id, delta, reason, by_user_id)
    values (old.org_id, old.store_id, old.product_id, old.qty, 'sale_remove', v_actor);
    return old;
  end if;
  return null;
end $function$

```

### trigger fn stock_on_check_void
```sql
CREATE OR REPLACE FUNCTION public.stock_on_check_void()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid;
begin
  select id into v_actor
    from public.users
   where auth_user_id = auth.uid() and is_active;

  insert into public.stock_logs (org_id, store_id, product_id, delta, reason, by_user_id)
  select l.org_id, l.store_id, l.product_id, sum(l.qty), 'void_recredit', v_actor
    from public.check_lines l
   where l.check_id = new.id
     and l.product_id is not null
   group by l.org_id, l.store_id, l.product_id
  having sum(l.qty) <> 0;

  return new;
end $function$

```

## b-2 FK（child → parent・ON DELETE）
- advances → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- advances → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- advances → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- advances → users: FOREIGN KEY (created_by) REFERENCES users(id)
- advances → users: FOREIGN KEY (cancelled_by) REFERENCES users(id)
- approvals → check_lines: FOREIGN KEY (line_id) REFERENCES check_lines(id)
- approvals → checks: FOREIGN KEY (check_id) REFERENCES checks(id)
- approvals → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- approvals → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- approvals → users: FOREIGN KEY (decided_by) REFERENCES users(id)
- approvals → users: FOREIGN KEY (requested_by) REFERENCES users(id)
- ar_collections → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- ar_collections → customers: FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
- ar_collections → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- ar_collections → receivables: FOREIGN KEY (receivable_id) REFERENCES receivables(id)
- ar_collections → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- ar_collections → users: FOREIGN KEY (created_by) REFERENCES users(id)
- attendance → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- attendance → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- attendance → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- attendance_incentives → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- attendance_incentives → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- attendance_incentives → users: FOREIGN KEY (created_by) REFERENCES users(id)
- attendance_incentives → users: FOREIGN KEY (cancelled_by) REFERENCES users(id)
- audit_logs → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- bottle_keeps → customers: FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
- bottle_keeps → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- bottle_keeps → products: FOREIGN KEY (product_id) REFERENCES products(id)
- bottle_keeps → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- cast_norms → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- cast_norms → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- cast_norms → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- cast_pin → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- cast_pin → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- cast_pin → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- cast_plan → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- cast_plan → comp_plans: FOREIGN KEY (plan_id) REFERENCES comp_plans(id)
- cast_plan → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- cast_plan → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- cast_ranks → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- cast_ranks → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- cast_sensitive → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- cast_sensitive → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- cast_sensitive → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- cast_tax_profiles → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- cast_tax_profiles → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- cast_tax_profiles → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- cast_unavailable_days → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- cast_unavailable_days → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- cast_unavailable_days → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- cast_unavailable_days → users: FOREIGN KEY (created_by) REFERENCES users(id)
- casts → cast_ranks: FOREIGN KEY (rank_id) REFERENCES cast_ranks(id)
- casts → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- casts → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- casts → users: FOREIGN KEY (user_id) REFERENCES users(id)
- check_cast_backs → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- check_cast_backs → checks: FOREIGN KEY (check_id) REFERENCES checks(id)
- check_cast_backs → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- check_cast_backs → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- check_lines → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- check_lines → checks: FOREIGN KEY (check_id) REFERENCES checks(id)
- check_lines → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- check_lines → products: FOREIGN KEY (product_id) REFERENCES products(id)
- check_lines → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- check_nominations → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- check_nominations → checks: FOREIGN KEY (check_id) REFERENCES checks(id)
- check_nominations → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- check_nominations → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- check_seats → checks: FOREIGN KEY (check_id) REFERENCES checks(id) ON DELETE CASCADE
- check_seats → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- check_seats → seats: FOREIGN KEY (seat_id) REFERENCES seats(id)
- check_seats → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- check_seats → users: FOREIGN KEY (created_by) REFERENCES users(id)
- checks → checks: FOREIGN KEY (merged_into) REFERENCES checks(id)
- checks → customers: FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
- checks → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- checks → pricing_categories: FOREIGN KEY (category_id) REFERENCES pricing_categories(id)
- checks → seats: FOREIGN KEY (seat_id) REFERENCES seats(id)
- checks → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- checks → users: FOREIGN KEY (voided_by) REFERENCES users(id)
- checks → users: FOREIGN KEY (created_by) REFERENCES users(id)
- comp_plan_components → comp_plans: FOREIGN KEY (plan_id) REFERENCES comp_plans(id)
- comp_plan_components → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- comp_plan_components → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- comp_plans → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- comp_plans → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- custom_back_defs → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- custom_back_defs → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- customer_notes → customers: FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
- customer_notes → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
- customer_notes → stores: FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
- customer_notes → users: FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
- customers → casts: FOREIGN KEY (cast_id) REFERENCES casts(id) ON DELETE SET NULL
- customers → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
- customers → stores: FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
- daily_reports → memberships: FOREIGN KEY (diff_approved_by) REFERENCES memberships(id)
- daily_reports → memberships: FOREIGN KEY (reopened_by) REFERENCES memberships(id)
- daily_reports → memberships: FOREIGN KEY (reclosed_by) REFERENCES memberships(id)
- daily_reports → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- daily_reports → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- daily_reports → users: FOREIGN KEY (closed_by) REFERENCES users(id)
- deductions → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- deductions → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- drink_claims → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- drink_claims → check_lines: FOREIGN KEY (check_line_id) REFERENCES check_lines(id) ON DELETE SET NULL
- drink_claims → checks: FOREIGN KEY (check_id) REFERENCES checks(id)
- drink_claims → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- drink_claims → products: FOREIGN KEY (product_id) REFERENCES products(id)
- drink_claims → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- drink_claims → users: FOREIGN KEY (decided_by) REFERENCES users(id)
- drink_claims → users: FOREIGN KEY (voided_by) REFERENCES users(id)
- drink_claims → users: FOREIGN KEY (requested_by) REFERENCES users(id)
- feature_flags → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- feature_flags → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- kiosk_devices → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- kiosk_devices → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- kiosk_sessions → kiosk_devices: FOREIGN KEY (device_id) REFERENCES kiosk_devices(id)
- kiosk_sessions → memberships: FOREIGN KEY (membership_id) REFERENCES memberships(id)
- kiosk_sessions → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- kiosk_sessions → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- kiosk_sessions → users: FOREIGN KEY (operator_user_id) REFERENCES users(id)
- memberships → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- memberships → users: FOREIGN KEY (user_id) REFERENCES users(id)
- notices → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- notices → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- notices → users: FOREIGN KEY (created_by) REFERENCES users(id)
- org_billing → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- payment_records → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- payment_records → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- payment_records → payroll_runs: FOREIGN KEY (run_id) REFERENCES payroll_runs(id)
- payment_records → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- payment_records → users: FOREIGN KEY (created_by) REFERENCES users(id)
- payments → checks: FOREIGN KEY (check_id) REFERENCES checks(id)
- payments → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- payments → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- payments → users: FOREIGN KEY (by_user_id) REFERENCES users(id)
- payroll_adjustments → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- payroll_adjustments → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- payroll_adjustments → payroll_runs: FOREIGN KEY (run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE
- payroll_adjustments → payslips: FOREIGN KEY (carry_from_payslip_id) REFERENCES payslips(id) ON DELETE SET NULL
- payroll_adjustments → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- payroll_adjustments → users: FOREIGN KEY (created_by) REFERENCES users(id)
- payroll_runs → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- payroll_runs → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- payroll_runs → users: FOREIGN KEY (created_by) REFERENCES users(id)
- payslips → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- payslips → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- payslips → payroll_runs: FOREIGN KEY (run_id) REFERENCES payroll_runs(id)
- payslips → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- penalty_config → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- penalty_config → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- pricing_rules → cast_ranks: FOREIGN KEY (rank_id) REFERENCES cast_ranks(id)
- pricing_rules → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- pricing_rules → pricing_categories: FOREIGN KEY (category_id) REFERENCES pricing_categories(id)
- pricing_rules → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- print_jobs → checks: FOREIGN KEY (check_id) REFERENCES checks(id)
- print_jobs → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- print_jobs → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- print_jobs → users: FOREIGN KEY (created_by) REFERENCES users(id)
- printer_config → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- printer_config → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- product_categories → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- product_categories → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- product_costs → products: FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
- products → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- products → product_categories: FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL
- products → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- punches → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- punches → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- punches → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- receipt_issues → checks: FOREIGN KEY (check_id) REFERENCES checks(id)
- receipt_issues → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- receipt_issues → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- receipt_issues → users: FOREIGN KEY (voided_by) REFERENCES users(id)
- receipt_issues → users: FOREIGN KEY (issued_by) REFERENCES users(id)
- receivables → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- receivables → checks: FOREIGN KEY (check_id) REFERENCES checks(id)
- receivables → customers: FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
- receivables → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- receivables → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- receivables → users: FOREIGN KEY (consent_by) REFERENCES users(id)
- reservations → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- reservations → checks: FOREIGN KEY (check_id) REFERENCES checks(id)
- reservations → customers: FOREIGN KEY (customer_id) REFERENCES customers(id)
- reservations → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- reservations → seats: FOREIGN KEY (seat_id) REFERENCES seats(id)
- reservations → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- reservations → users: FOREIGN KEY (created_by) REFERENCES users(id)
- seats → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- seats → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- shift_periods → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- shift_periods → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- shift_periods → users: FOREIGN KEY (created_by) REFERENCES users(id)
- shift_rules → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- shift_rules → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- shift_wishes → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- shift_wishes → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- shift_wishes → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- shift_wishes → users: FOREIGN KEY (decided_by) REFERENCES users(id)
- shifts → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- shifts → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- shifts → shift_periods: FOREIGN KEY (period_id) REFERENCES shift_periods(id)
- shifts → shift_wishes: FOREIGN KEY (wish_id) REFERENCES shift_wishes(id)
- shifts → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- shifts → users: FOREIGN KEY (created_by) REFERENCES users(id)
- staff_pin → memberships: FOREIGN KEY (membership_id) REFERENCES memberships(id)
- staff_pin → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- staff_pin → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- staff_shift_deadlines → memberships: FOREIGN KEY (created_by) REFERENCES memberships(id)
- staff_shift_deadlines → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- staff_shift_deadlines → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- staff_shift_patterns → memberships: FOREIGN KEY (created_by) REFERENCES memberships(id)
- staff_shift_patterns → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- staff_shift_patterns → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- staff_shift_wishes → memberships: FOREIGN KEY (staff_id) REFERENCES memberships(id)
- staff_shift_wishes → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- staff_shift_wishes → staff_shift_patterns: FOREIGN KEY (pattern_id) REFERENCES staff_shift_patterns(id)
- staff_shift_wishes → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- staff_shifts → memberships: FOREIGN KEY (override_by) REFERENCES memberships(id)
- staff_shifts → memberships: FOREIGN KEY (created_by) REFERENCES memberships(id)
- staff_shifts → memberships: FOREIGN KEY (staff_id) REFERENCES memberships(id)
- staff_shifts → memberships: FOREIGN KEY (confirmed_by) REFERENCES memberships(id)
- staff_shifts → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- staff_shifts → staff_shift_patterns: FOREIGN KEY (pattern_id) REFERENCES staff_shift_patterns(id)
- staff_shifts → staff_shift_wishes: FOREIGN KEY (wish_id) REFERENCES staff_shift_wishes(id)
- staff_shifts → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- staffing_needs → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- staffing_needs → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- stock_logs → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- stock_logs → products: FOREIGN KEY (product_id) REFERENCES products(id)
- stock_logs → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- store_business_hours → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- store_business_hours → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- store_sales_targets → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- store_sales_targets → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- stores → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- transport → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- transport → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- transport → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- transport → users: FOREIGN KEY (cancelled_by) REFERENCES users(id)
- transport → users: FOREIGN KEY (created_by) REFERENCES users(id)
- trials → casts: FOREIGN KEY (cast_id) REFERENCES casts(id)
- trials → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- trials → stores: FOREIGN KEY (store_id) REFERENCES stores(id)
- users → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)
- withholding_payments → orgs: FOREIGN KEY (org_id) REFERENCES orgs(id)

## b-3 表の grants（service_role／authenticated／anon）
- advances: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- approvals: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- ar_collections: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- attendance: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- attendance_incentives: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- audit_logs: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- bottle_keeps: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- cast_norms: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- cast_pin: service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- cast_plan: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- cast_ranks: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- cast_sensitive: service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- cast_tax_profiles: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- cast_unavailable_days: service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- casts: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- check_cast_backs: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- check_lines: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- check_nominations: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- check_seats: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- checks: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- comp_plan_components: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- comp_plans: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- custom_back_defs: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- customer_notes: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- customers: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- daily_reports: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- deductions: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- drink_claims: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- feature_flags: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- kiosk_devices: service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- kiosk_sessions: service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- memberships: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- notices: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- org_billing: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- orgs: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- payment_records: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- payments: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- payroll_adjustments: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- payroll_runs: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- payslips: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- penalty_config: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- pricing_categories: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- pricing_rules: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- print_jobs: service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- printer_config: service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- product_categories: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- product_costs: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- products: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- punches: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- receipt_issues: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- receivables: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- reservations: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- seats: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- shift_periods: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- shift_rules: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- shift_wishes: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- shifts: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- staff_pin: service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- staff_shift_deadlines: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- staff_shift_patterns: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- staff_shift_wishes: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- staff_shifts: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- staffing_needs: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- stock_logs: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- store_business_hours: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- store_sales_targets: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- stores: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- transport: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- trials: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- users: authenticated:SELECT service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- withholding_payments: service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE

## b-4 SELECT 以外の policy（書込 policy の有無）
- なし（全表 SELECT policy のみ＝書込は RPC 経由）

## c-1 種の経路 RPC: 引数・now()／current_date／auth.uid() の出現・時刻引数
- attendance_set(p_cast_id uuid, p_date date, p_status text, p_eta text, p_reason text): now()=0 current_date=0 auth.uid()=0 auth_*()=5 時刻引数=[p_date date]
- audit_log_write(p_action text, p_target text, p_before jsonb, p_after jsonb, p_store_id uuid, p_reason text): now()=0 current_date=0 auth.uid()=1 auth_*()=3 時刻引数=[]
- audit_log_write_service(p_org_id uuid, p_actor uuid, p_action text, p_target text, p_before jsonb, p_after jsonb, p_store_id uuid, p_reason text): now()=0 current_date=0 auth.uid()=0 auth_*()=0 時刻引数=[]
- auth_cast_id(): now()=0 current_date=0 auth.uid()=1 auth_*()=0 時刻引数=[]
- auth_kiosk_operator(): now()=3 current_date=0 auth.uid()=1 auth_*()=0 時刻引数=[]
- auth_kiosk_org_id(): now()=0 current_date=0 auth.uid()=1 auth_*()=0 時刻引数=[]
- auth_kiosk_register_store_id(): now()=0 current_date=0 auth.uid()=1 auth_*()=0 時刻引数=[]
- auth_org_billing_writable(): now()=0 current_date=0 auth.uid()=0 auth_*()=1 時刻引数=[]
- auth_org_id(): now()=0 current_date=0 auth.uid()=1 auth_*()=0 時刻引数=[]
- auth_role(): now()=0 current_date=0 auth.uid()=1 auth_*()=0 時刻引数=[]
- auth_store_id(): now()=0 current_date=0 auth.uid()=1 auth_*()=0 時刻引数=[]
- billing_writable_of(p_org_id uuid): now()=1 current_date=0 auth.uid()=0 auth_*()=0 時刻引数=[]
- biz_date_of(p_store_id uuid, p_at timestamp with time zone): now()=0 current_date=0 auth.uid()=0 auth_*()=0 時刻引数=[p_at timestamp with time zone]
- check_add_line(p_check_id uuid, p_product_id uuid, p_qty integer, p_kind text, p_pay_group text, p_name text, p_unit_price integer): now()=0 current_date=0 auth.uid()=0 auth_*()=15 時刻引数=[]
- check_add_referral(p_check_id uuid, p_cast_id uuid, p_amount integer, p_memo text, p_idem_key uuid): now()=0 current_date=0 auth.uid()=0 auth_*()=15 時刻引数=[]
- check_close(p_check_id uuid, p_idem_key uuid): now()=1 current_date=0 auth.uid()=0 auth_*()=15 時刻引数=[]
- check_open(p_seat_id uuid, p_people integer, p_nom_type text, p_customer_id uuid, p_set_rule_id uuid, p_category_id uuid): now()=8 current_date=0 auth.uid()=1 auth_*()=16 時刻引数=[]
- check_pay(p_check_id uuid, p_method text, p_amount integer, p_pay_group text, p_tendered integer, p_idem_key uuid, p_method_detail text): now()=0 current_date=0 auth.uid()=1 auth_*()=16 時刻引数=[]
- check_void(p_check_id uuid, p_reason text): now()=2 current_date=0 auth.uid()=1 auth_*()=6 時刻引数=[]
- customer_register(p_store_id uuid, p_name text, p_furigana text, p_birthday date, p_tel text, p_prefs text, p_memo text, p_cast_id uuid): now()=0 current_date=0 auth.uid()=0 auth_*()=5 時刻引数=[p_birthday date]
- daily_report_close(p_store_id uuid, p_biz_date date, p_expense integer, p_cash_payout integer, p_cash_float integer, p_counted_cash integer, p_note text, p_force boolean, p_idem_key uuid): now()=0 current_date=0 auth.uid()=1 auth_*()=6 時刻引数=[p_biz_date date]
- daily_report_reclose(p_report_id uuid, p_expense integer, p_cash_payout integer, p_cash_float integer, p_counted_cash integer, p_note text, p_force boolean, p_idem_key uuid): now()=1 current_date=0 auth.uid()=0 auth_*()=3 時刻引数=[]
- kiosk_punch(p_cast_id uuid, p_pin text, p_type text): now()=8 current_date=0 auth.uid()=1 auth_*()=0 時刻引数=[]
- payroll_finalize(p_org_id uuid, p_actor uuid, p_run_id uuid, p_idem_key uuid, p_payslips jsonb): now()=1 current_date=0 auth.uid()=0 auth_*()=0 時刻引数=[]
- payroll_mark_paid(p_org_id uuid, p_actor uuid, p_run_id uuid, p_idem_key uuid): now()=1 current_date=0 auth.uid()=0 auth_*()=0 時刻引数=[]
- payroll_run_create(p_store_id uuid, p_period text): now()=0 current_date=0 auth.uid()=1 auth_*()=6 時刻引数=[]
- product_bulk_insert(p_store_id uuid, p_items jsonb): now()=0 current_date=0 auth.uid()=0 auth_*()=3 時刻引数=[]
- punch_proxy(p_cast_id uuid, p_type text, p_note text): now()=0 current_date=0 auth.uid()=0 auth_*()=5 時刻引数=[]
- punch_self(p_type text, p_lat double precision, p_lng double precision): now()=0 current_date=0 auth.uid()=0 auth_*()=2 時刻引数=[]
- receipt_issue(p_check_id uuid, p_amount integer, p_recipient text, p_proviso text): now()=1 current_date=0 auth.uid()=1 auth_*()=5 時刻引数=[]
- reservation_create(p_store_id uuid, p_reserved_at timestamp with time zone, p_customer_id uuid, p_cast_id uuid, p_guest_name text, p_party_size integer, p_nom_type text, p_memo text, p_seat_id uuid, p_stay_minutes integer): now()=0 current_date=0 auth.uid()=1 auth_*()=5 時刻引数=[p_reserved_at timestamp with time zone]
- set_cast_plan(p_cast_id uuid, p_plan_id uuid, p_overrides jsonb, p_valid_from date): now()=1 current_date=1 auth.uid()=0 auth_*()=7 時刻引数=[p_valid_from date]
- set_comp_plan(p_id uuid, p_store_id uuid, p_name text, p_base integer, p_hon_back integer, p_jonai_back integer, p_dohan_back integer, p_sales_slide jsonb, p_point_slide jsonb, p_is_active boolean, p_hon_back_mode text, p_hon_back_rate integer, p_jonai_back_mode text, p_jonai_back_rate integer, p_dohan_back_mode text, p_dohan_back_rate integer, p_product_back_mode text, p_product_back_rate integer, p_product_back_fixed integer): now()=0 current_date=0 auth.uid()=0 auth_*()=7 時刻引数=[]
- set_product(p_id uuid, p_store_id uuid, p_type text, p_category text, p_name text, p_price integer, p_cost integer, p_back_mode text, p_back_value integer, p_unit4 jsonb, p_hon_pt integer, p_is_active boolean, p_reorder_point integer, p_category_id uuid, p_back_exempt_from_split boolean): now()=0 current_date=0 auth.uid()=0 auth_*()=11 時刻引数=[]
- set_seat(p_id uuid, p_store_id uuid, p_name text, p_kind text, p_sort_order integer, p_is_active boolean): now()=0 current_date=0 auth.uid()=0 auth_*()=9 時刻引数=[]
- shift_bulk_set(p_cast_id uuid, p_dates date[], p_start_hm text, p_end_hm text): now()=0 current_date=0 auth.uid()=1 auth_*()=6 時刻引数=[p_dates date]
- shift_cast_confirm(p_shift_id uuid): now()=0 current_date=0 auth.uid()=0 auth_*()=6 時刻引数=[]
- shift_confirm_bulk(p_shift_ids uuid[]): now()=0 current_date=0 auth.uid()=0 auth_*()=7 時刻引数=[]
- shift_period_set(p_id uuid, p_store_id uuid, p_start_date date, p_end_date date, p_wish_deadline date, p_status text): now()=0 current_date=0 auth.uid()=1 auth_*()=8 時刻引数=[p_start_date date; p_end_date date; p_wish_deadline date]
- shift_set(p_id uuid, p_cast_id uuid, p_date date, p_start_hm text, p_end_hm text, p_status text, p_override_reason text): now()=0 current_date=0 auth.uid()=1 auth_*()=8 時刻引数=[p_date date]

### billing_writable_of
```sql

  select coalesce(
    (select b.status in ('trialing','active','past_due')
        and (b.status <> 'trialing' or b.trial_ends_at > now())
       from public.org_billing b
      where b.org_id = p_org_id),
    false);

```

### auth_org_billing_writable
```sql

  select public.billing_writable_of(public.auth_org_id());

```

### check_open
```sql

declare
  v_seat record; v_id uuid; v_actor uuid;
  v_rate int; v_unit int; v_mode text;
  v_smin int; v_sfee int; v_emin int; v_efee int; v_tper text;
  v_org uuid;  -- ★0057(2)
  r_set record; r_ext record; r_doh record; v_dfee int;  -- ★0084
  v_units int;  -- ★0089
  v_dow2 smallint; v_bm2 int; v_cut2 int; v_settings2 jsonb; v_cutoff2 text; v_seatk text;  -- ★mig0098
  v_ext_menu jsonb;  -- ★mig0098 R2-1: 延長メニュー凍結
  v_bts text; v_pd text; v_trnd text;  -- ★mig0113: 税設定の凍結
  v_cat_name text;  -- ★mig0128(裁定116-2): 区分名の凍結用
  v_rule_name text;  -- ★mig0129(裁定119): 適用ルール名の凍結用
  r_vip record; v_vfee int; v_vunit text; v_vname text; v_vunits int; v_vid uuid;  -- ★mig0130(裁定118): vip_charge
  v_sunit text; v_eunit text;  -- ★mig0130: set/ext の実効課金単位(rule.billing_unit ?? time_per)
begin
  -- ★0057(1): null guard 二重化（認証者でも register kiosk でもない→遮断）
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_people is not null and p_people <= 0 then raise exception 'bad people'; end if;
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  -- ★mig0053（裁定(c)）: seats 行ロック＝同一卓への占有変更（open/相席追加/移動/予約来店）を直列化。
  --   for update of s＝seats 行のみ（stores を巻き込まない）。org 不一致等は直後の raise で
  --   即 rollback＝ロックは解放される。
  select s.id, s.org_id, s.store_id, s.is_active, s.kind,
         st.service_rate, st.round_unit, st.round_mode,
         st.set_min, st.set_fee, st.ext_min, st.ext_fee, st.time_per,
         st.dohan_fee,
         st.business_tax_status, st.price_display, st.tax_rounding  -- ★mig0113
    into v_seat
    from public.seats s join public.stores st on st.id = s.store_id
    where s.id = p_seat_id
    for update of s;
  if v_seat.id is null or v_seat.org_id <> v_org then raise exception 'forbidden'; end if;
  perform public.assert_day_open(v_seat.store_id, public.biz_date_of(v_seat.store_id, now()));
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_seat.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_seat.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_seat.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（register device × 有効 operator セッション＝裁定11 単一判定点）
          or (v_seat.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;

  -- 顧客紐付け（束2）: 同 org・卓の店と同店のみ許可（越境封鎖）
  if p_customer_id is not null then
    if not exists (
      select 1 from public.customers cu
      where cu.id = p_customer_id
        and cu.org_id = v_org
        and cu.store_id = v_seat.store_id
    ) then
      raise exception 'invalid customer';
    end if;
  end if;

  -- 既存 open を再利用（0038/0040 型・自然冪等）
  -- ★mig0053（B1 相席）: 主席 ∪ 追加席の union＝追加席タップでもホスト伝票を返す（同一会計挙動）。
  --   追加席腕は open の check に限定（transient の防御深度）＋org 限定（返す伝票は org 内のみ）。
  select x.check_id into v_id from (
    select id as check_id from public.checks
      where seat_id = p_seat_id and status = 'open' and org_id = v_org
    union
    select cs.check_id from public.check_seats cs
      join public.checks c on c.id = cs.check_id
      where cs.seat_id = p_seat_id and c.status = 'open' and c.org_id = v_org
  ) x
  limit 1;
  if v_id is not null then return v_id; end if;

  -- ★mig0128(裁定116-2): 区分検証(同 org・同店・active のみ)。null=全区分=現行同値。
  --   配置は既存 open 再利用の後=区分は「新規開栓の凍結時」にのみ意味を持つ
  --   (再利用返却の冪等挙動は不変)。名称も同時取得=checks へ凍結(マスタ改名は非遡及)
  if p_category_id is not null then
    select pc.name into v_cat_name
      from public.pricing_categories pc
     where pc.id = p_category_id
       and pc.org_id = v_org
       and pc.store_id = v_seat.store_id
       and pc.is_active;
    if v_cat_name is null then raise exception 'bad category'; end if;
  end if;

  -- ★mig0084: 料金ルール解決（設計書 v1.2・凍結=開栓時）。
  --   now() はトランザクション内不変＝下の insert の started_at (default now()) と
  --   同一時刻＝解決時刻と凍結時刻が厳密に一致（帯境界の競合なし）。
  --   0行＝各変数 null → 下の coalesce で stores フォールバック＝ルール0件の店は
  --   改稿前と完全同値（golden 構造保証）。dohan のみ nullable スナップ
  --   （ルール0件は null 凍結・check_dohan_add 時に stores 現在値へフォールバック）。
  --   ルール一致だが duration_min null の場合は額のみルール・分数は stores 既定。
  --   ★mig0128: 区分を3呼びすべてへ引渡し(裁定116-2・区分も開栓凍結=裁定117)
  --   ★mig0130(裁定118): 4呼び目=vip_charge(VIP 限定は seat_kind 条件で表現=特殊分岐なし)
  select * into r_set from public.pricing_resolve_core(v_seat.store_id, now(), 'set',        v_seat.kind, null, p_category_id);
  select * into r_ext from public.pricing_resolve_core(v_seat.store_id, now(), 'extension',  v_seat.kind, null, p_category_id);
  select * into r_doh from public.pricing_resolve_core(v_seat.store_id, now(), 'dohan',      v_seat.kind, null, p_category_id);
  select * into r_vip from public.pricing_resolve_core(v_seat.store_id, now(), 'vip_charge', v_seat.kind, null, p_category_id);  -- ★mig0130

  -- ★mig0098 R2-5: 開卓時ルール手動選択（override）。null=自動一致（現行完全互換）。
  --   検証: 同店・fee_kind='set'・is_active（他店/他種/無効は 'bad rule'）。選び直し不可＝
  --   開卓やり直し（void→再開卓）の現行運用（設計書 R2-5）
  --   ★mig0128: override は明示選択につき区分フィルタ不適用（区分違いのルールも指名可）
  --   ★mig0130: billing_unit も指名ルールから取得(select へ追加)
  if p_set_rule_id is not null then
    select r.amount as amount, r.duration_min as duration_min, r.id as rule_id,
           r.billing_unit as billing_unit into r_set
      from public.pricing_rules r
     where r.id = p_set_rule_id and r.store_id = v_seat.store_id
       and r.fee_kind = 'set' and r.is_active;
    if r_set.rule_id is null then raise exception 'bad rule'; end if;
  end if;

  -- ★mig0129(裁定119): 適用セットルールの凍結。r_set.rule_id は自動解決 or override 確定値。
  --   name null ルールは null 凍結(UI 非表示規則)・フォールバック(rule_id null)は両列 null
  --   =0129 以前の既存伝票と同表現(区別しない・「基本料金」誤表示経路を作らない)
  if r_set.rule_id is not null then
    select r.name into v_rule_name
      from public.pricing_rules r
     where r.id = r_set.rule_id;
  end if;

  -- ★mig0098 R2-1/R2-2/R2-4: 延長メニュー全件を開栓時に凍結（priority 順・limit なし）。
  --   ★鏡像規律: 下の where は pricing_resolve_core（extension・rank null 呼び）と同一式。
  --     core は limit 1・こちらは全件列挙という差のみ。条件を変えるときは必ず同時改修
  --     （core 側は pin 保全のため不触＝相互参照は本コメントと R2 設計書 v1.1 が正）
  --   ★mig0128(教訓52): 区分条件・区分優先順を core と同時挿入(鏡像2点セット)。
  --     以後 resolve 条件を変えるときは core+本 where の同時改修が必須
  --   ★mig0130: 各項目へ unit キー(実効単位=rule.billing_unit ?? time_per)を凍結追加
  select b.biz_dow, b.biz_min into v_dow2, v_bm2
    from public.biz_minutes_of(v_seat.store_id, now()) b;
  select s.settings_json into v_settings2 from public.stores s where s.id = v_seat.store_id;
  v_cutoff2 := coalesce(nullif(trim(coalesce(v_settings2, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  v_cut2 := split_part(v_cutoff2, ':', 1)::int * 60 + split_part(v_cutoff2, ':', 2)::int;
  v_seatk := coalesce(v_seat.kind, '卓');
  select coalesce(jsonb_agg(jsonb_build_object(
           'rule_id', r.id,
           'duration_min', coalesce(r.duration_min, v_seat.ext_min),
           'amount', r.amount,
           'unit', coalesce(r.billing_unit, v_seat.time_per),  -- ★mig0130: 実効単位の凍結
           'label', '延長 ' || coalesce(r.duration_min, v_seat.ext_min) || '分 ¥' || r.amount)
         order by r.priority asc, (r.category_id is not null) desc,  -- ★mig0128: 同 priority 内区分一致優先(core と鏡像)
                  r.created_at asc, r.id asc), '[]'::jsonb)
    into v_ext_menu
    from public.pricing_rules r
   where r.store_id = v_seat.store_id
     and r.is_active
     and r.fee_kind = 'extension'
     and (r.seat_kind is null or r.seat_kind = v_seatk)
     and (r.rank_id is null)  -- core は rank null 呼び＝(rank_id is null or rank_id = null) と等価
     and (r.category_id is null or r.category_id = p_category_id)  -- ★mig0128(教訓52 鏡像)
     and (r.dow_mask is null or ((r.dow_mask >> v_dow2) & 1) = 1)
     and (r.time_from_min is null
          or ( (case when r.time_from_min <  v_cut2 then r.time_from_min + 1440 else r.time_from_min::int end) <= v_bm2
           and v_bm2 < (case when r.time_to_min <= v_cut2 then r.time_to_min + 1440 else r.time_to_min::int end) ));

  -- 【決定1】店設定のスナップショット（E1 mig0051: 読み元を settings_json から stores 列へ。
  --   既定 10/100/down は列 default と同値＝挙動不変。列 CHECK が正・下の raise は防御深度
  --   ＝列の型変更/削除事故の検知用に残置）
  --   B4 mig0052: 時間制5値（set_min/set_fee/ext_min/ext_fee/time_per）を同スナップへ追補
  --   （非遡及＝open 中伝票は旧料金表・time_mode は運用トグルゆえ非スナップ＝裁定(g)）
  --   ★mig0084: set/extension は pricing_rules 解決値を優先・0行は stores（＝「基本料金」）
  --   ★mig0113: 税設定3値を同スナップへ追補（非遡及＝open 中伝票は旧税設定）
  --   ★mig0128: 区分2値（category_id/category_name）を同スナップへ追補（非遡及・開栓凍結）
  --   ★mig0129: 適用ルール2値（set_rule_id/set_rule_name）を同スナップへ追補（非遡及・開栓凍結）
  --   ★mig0130: 単位系4値（set_unit/ext_unit/vip_charge_fee/vip_charge_unit）を同スナップへ追補
  --     (実効単位=rule.billing_unit ?? time_per・vip はルール0件=両値 null=dohan_fee 同型)
  v_rate := v_seat.service_rate;
  v_unit := v_seat.round_unit;
  v_mode := v_seat.round_mode;
  v_smin := coalesce(r_set.duration_min, v_seat.set_min);
  v_sfee := coalesce(r_set.amount,       v_seat.set_fee);
  v_emin := coalesce(r_ext.duration_min, v_seat.ext_min);
  v_efee := coalesce(r_ext.amount,       v_seat.ext_fee);
  v_tper := v_seat.time_per;
  v_dfee := r_doh.amount;  -- ★0行= null（裁定②）
  v_bts  := v_seat.business_tax_status;  -- ★mig0113
  v_pd   := v_seat.price_display;        -- ★mig0113
  v_trnd := v_seat.tax_rounding;         -- ★mig0113
  v_sunit := coalesce(r_set.billing_unit, v_tper);  -- ★mig0130
  v_eunit := coalesce(r_ext.billing_unit, v_tper);  -- ★mig0130
  v_vfee  := r_vip.amount;  -- ★mig0130: 0行=null(dohan 同型)
  v_vunit := case when r_vip.rule_id is not null
                  then coalesce(r_vip.billing_unit, v_tper) end;  -- ★mig0130
  if v_rate < 0 or v_unit < 1 or v_mode not in ('up','down','round') then
    raise exception 'bad store settings';
  end if;
  if v_smin < 1 or v_emin < 1 or v_sfee < 0 or v_efee < 0 or v_tper not in ('table','person') then
    raise exception 'bad store settings';
  end if;
  -- ★mig0113: 防御深度（列 CHECK が正・型変更/削除事故の検知用）
  if v_bts not in ('taxable','exempt') or v_pd not in ('tax_included','tax_excluded')
     or v_trnd not in ('floor','round','ceil') then
    raise exception 'bad store settings';
  end if;
  -- ★mig0130: 防御深度(単位2値)
  if v_sunit not in ('person','table') or v_eunit not in ('person','table') then
    raise exception 'bad store settings';
  end if;

  -- ★0057(4): actor＝operator 優先（checks.created_by NOT NULL を kiosk でも充足）
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  insert into public.checks (org_id, store_id, seat_id, people, nom_type,
                             service_rate, round_unit, round_mode,
                             set_min, set_fee, ext_min, ext_fee, time_per,
                             dohan_fee,
                             created_by, customer_id, ext_menu_snap,
                             business_tax_status, price_display, tax_rounding,  -- ★mig0113
                             category_id, category_name,  -- ★mig0128
                             set_rule_id, set_rule_name,  -- ★mig0129
                             set_unit, ext_unit, vip_charge_fee, vip_charge_unit)  -- ★mig0130
  values (v_org, v_seat.store_id, p_seat_id, p_people, p_nom_type,
          v_rate, v_unit, v_mode,
          v_smin, v_sfee, v_emin, v_efee, v_tper,
          v_dfee,
          v_actor, p_customer_id, v_ext_menu,
          v_bts, v_pd, v_trnd,  -- ★mig0113
          p_category_id, v_cat_name,  -- ★mig0128
          r_set.rule_id, v_rule_name,  -- ★mig0129
          v_sunit, v_eunit, v_vfee, v_vunit)  -- ★mig0130
  on conflict (seat_id) where status = 'open' do nothing
  returning id into v_id;
  if v_id is null then
    -- 競合＝先着の open を返す（0038 申し送り）
    select id into v_id from public.checks
      where seat_id = p_seat_id and status = 'open' and org_id = v_org
      limit 1;
    return v_id;
  end if;
  -- ★mig0089: 開卓時に set 行を自動挿入（両モード共通・額>0 のみ＝時間課金を使わない
  --   店は現行同値）。auto 店は以後 check_time_charge_apply が同行を upsert 再計算。
  --   ★mig0130: units は set 実効単位(v_sunit)起点(既存店=billing_unit null→time_per=現行同値)
  v_units := case when v_sunit = 'person' then coalesce(p_people, 1) else 1 end;
  if v_sfee * v_units > 0 then
    insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                    name_snapshot, unit_price_snapshot, qty, line_total,
                                    back_snapshot, sort_order, time_auto, fee_kind, block_no)
    values (v_org, v_seat.store_id, v_id, null, 'time', 'A',
            'セット料金(' || v_smin || '分)', v_sfee, v_units, v_sfee * v_units,
            null, 1, true, 'set', 0);  -- ★mig0098 R2-7c: null 再生産の停止（0097b 吸収の本命側）
    perform public.check_recalc(v_id);
    -- ★_r2: 行単位 audit（原則6）。manual 店は apply が来ない＝ここが唯一の書込記録
    perform public.audit_log_write('check_open_set_line',
      'check_lines:' || (select l.id::text from public.check_lines l
                          where l.check_id = v_id and l.time_auto and l.fee_kind = 'set'),
      null,
      (select to_jsonb(l) from public.check_lines l
        where l.check_id = v_id and l.time_auto and l.fee_kind = 'set'),
      v_seat.store_id);
  end if;
  -- ★mig0130(裁定118): vip_charge 行の開栓時1回生成(額>0 のみ実体化・apply 非対象=裁定7)。
  --   kind='charge'・time_auto=true・block_no=0(0097b 教訓: null block_no の再生産禁止・
  --   部分ユニーク3列 (check_id,fee_kind,block_no) where time_auto と整合)・
  --   名称=coalesce(ルール名,'VIPチャージ')。back_snapshot=null=給与不干渉
  if r_vip.rule_id is not null then
    v_vunits := case when v_vunit = 'person' then coalesce(p_people, 1) else 1 end;
    if v_vfee * v_vunits > 0 then
      select r.name into v_vname from public.pricing_rules r where r.id = r_vip.rule_id;
      insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                      name_snapshot, unit_price_snapshot, qty, line_total,
                                      back_snapshot, sort_order, time_auto, fee_kind, block_no)
      values (v_org, v_seat.store_id, v_id, null, 'charge', 'A',
              coalesce(v_vname, 'VIPチャージ'), v_vfee, v_vunits, v_vfee * v_vunits,
              null, 2, true, 'vip_charge', 0)
      returning id into v_vid;
      perform public.check_recalc(v_id);
      -- 行単位 audit(原則6・set 行と同型=apply が来ない行につき唯一の書込記録)
      perform public.audit_log_write('check_open_vip_line',
        'check_lines:' || v_vid::text, null,
        (select to_jsonb(l) from public.check_lines l where l.id = v_vid),
        v_seat.store_id);
    end if;
  end if;
  perform public.audit_log_write('check_open', 'checks:' || v_id::text, null,
    (select to_jsonb(c) from public.checks c where c.id = v_id)
      || case when p_set_rule_id is not null
              then jsonb_build_object('override_rule_id', p_set_rule_id)
              else '{}'::jsonb end,
    v_seat.store_id);
  return v_id;
end 
```

### check_close
```sql

declare
  v_chk record; v_before jsonb; v_g record; v_due int; v_paid int; v_lines int;
  v_cast_ids uuid[]; v_weights int[]; v_n int; v_sumw int := 0;
  v_drink int[]; v_champ int[]; v_bottle int[]; v_pt int[];
  v_alloc int[]; v_rem int[]; v_used boolean[];
  v_line record; v_unit int; v_rest int; v_best int; i int; c int;
  v_org uuid;  -- ★0057(2)
  v_kinds text[]; v_dohans boolean[];  -- ★0119 裁定100: キャスト別種別/同伴
  v_bizdate date;                       -- ★0132 裁定113: 伝票営業日(started_at 起点)
  v_modes text[]; v_rates int[];        -- ★0132: cast 別の商品バック方式/率
  v_salesbase int[];                    -- ★0132: 同腕の按分売上母数(plan_rate/plan_fixed 監査用)
  v_units int[]; v_fixeds int[];        -- ★0133 裁定123: 同腕の按分本数Σ / cast 別の円/本固定額
  v_mode text; v_rate int; v_fixed int; -- ★0132/0133: 解決作業用
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  -- 冪等: 同一キーで closed 済みなら成功を返す
  if v_chk.status = 'closed' then
    if p_idem_key is not null and v_chk.close_idem_key = p_idem_key then return p_check_id; end if;
    raise exception 'not open';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_lines from public.check_lines where check_id = p_check_id;
  if v_lines = 0 then raise exception 'empty check'; end if;

  -- 全 group 充足(∀g: paid(g) ≥ due(g))＋ total 確定
  perform public.check_recalc(p_check_id);
  for v_g in select distinct pay_group from public.check_lines where check_id = p_check_id
  loop
    v_due := public.check_group_due(p_check_id, v_g.pay_group);
    select coalesce(sum(amount), 0)::int into v_paid
      from public.payments where check_id = p_check_id and pay_group = v_g.pay_group;
    if v_paid < v_due then raise exception 'balance remaining'; end if;
  end loop;
  v_before := to_jsonb(v_chk);

  -- 分配(最大剰余法・精密仕様 §2.2.1・back_snapshot 凍結値・pt は nom_kind='hon' の行のみ=裁定100)
  select array_agg(cast_id order by position, created_at, id),
         array_agg(ratio_weight order by position, created_at, id),
         array_agg(nom_kind order by position, created_at, id),
         array_agg(is_dohan order by position, created_at, id)
    into v_cast_ids, v_weights, v_kinds, v_dohans
    from public.check_nominations where check_id = p_check_id;
  if v_cast_ids is not null then
    v_n := array_length(v_cast_ids, 1);
    for i in 1..v_n loop v_sumw := v_sumw + v_weights[i]; end loop;
    if v_sumw > 0 then  -- ★0124 判断B: 全 weight 0(全員 ended 等)=按分なし(整数除算ガード)
    v_drink := array_fill(0, array[v_n]); v_champ := array_fill(0, array[v_n]);
    v_bottle := array_fill(0, array[v_n]); v_pt := array_fill(0, array[v_n]);
    v_salesbase := array_fill(0, array[v_n]);  -- ★0132
    v_units := array_fill(0, array[v_n]);      -- ★0133
    -- ★0132 裁定113: 伝票営業日(started_at)時点の cast_plan から商品バック方式を cast 別に解決。
    --   解決不能(割当なし)=既定 product_rule。重複有効行は valid_from 降順の先頭(決定的・close は止めない)。
    v_bizdate := public.biz_date_of(v_chk.store_id, v_chk.started_at);
    v_modes := array_fill('product_rule'::text, array[v_n]);
    v_rates := array_fill(0, array[v_n]);
    v_fixeds := array_fill(0, array[v_n]);     -- ★0133
    for i in 1..v_n loop
      select p.product_back_mode, coalesce(p.product_back_rate, 0), coalesce(p.product_back_fixed, 0)
        into v_mode, v_rate, v_fixed
        from public.cast_plan cp
        join public.comp_plans p on p.id = cp.plan_id
       where cp.cast_id = v_cast_ids[i]
         and cp.org_id = v_chk.org_id
         and cp.valid_from <= v_bizdate
         and (cp.valid_to is null or cp.valid_to >= v_bizdate)
       order by cp.valid_from desc
       limit 1;
      if found then v_modes[i] := v_mode; v_rates[i] := v_rate; v_fixeds[i] := v_fixed; end if;
    end loop;
    for v_line in
      select * from public.check_lines
       where check_id = p_check_id and product_id is not null
         and kind in ('drink','champ','bottle') and back_snapshot is not null
         -- ★mig0070: キャストドリンクは按分から除外(凍結値で判定・キー無し=false=按分対象)
         and coalesce((check_lines.back_snapshot ->> 'back_exempt')::boolean, false) = false
    loop
      -- 分配単価(productBackOf と同一規則・凍結値)。★0119: unit4 はキャスト別キーで集計ループ内に解決
      if (v_line.back_snapshot ->> 'back_mode') is distinct from 'unit4' then
        v_unit := round(v_line.unit_price_snapshot
                        * coalesce((v_line.back_snapshot ->> 'back_value')::numeric, 0) / 100.0)::int;
      end if;
      -- 数量の最大剰余法分配(床=整数除算・剰余降順→position 昇順)
      v_alloc := array_fill(0, array[v_n]); v_rem := array_fill(0, array[v_n]);
      v_used := array_fill(false, array[v_n]);
      v_rest := v_line.qty;
      for i in 1..v_n loop
        v_alloc[i] := (v_line.qty * v_weights[i]) / v_sumw;
        v_rem[i]   := (v_line.qty * v_weights[i]) % v_sumw;
        v_rest := v_rest - v_alloc[i];
      end loop;
      for c in 1..v_rest loop
        v_best := 0;
        for i in 1..v_n loop
          if not v_used[i] and (v_best = 0 or v_rem[i] > v_rem[v_best]) then v_best := i; end if;
        end loop;
        v_used[v_best] := true;
        v_alloc[v_best] := v_alloc[v_best] + 1;
      end loop;
      -- 集計(★0132: cast 別 mode で分岐。同一行集合・同一 v_alloc=同腕)
      for i in 1..v_n loop
        if v_alloc[i] > 0 then
          if v_modes[i] = 'plan_rate' then
            -- ★0132: 売上按分のみ凍結(商品3列は加算しない)
            v_salesbase[i] := v_salesbase[i] + v_line.unit_price_snapshot * v_alloc[i];
          elsif v_modes[i] = 'plan_fixed' then
            -- ★0133: 売上按分(監査用)+按分本数を凍結(商品3列は加算しない)
            v_salesbase[i] := v_salesbase[i] + v_line.unit_price_snapshot * v_alloc[i];
            v_units[i] := v_units[i] + v_alloc[i];
          elsif v_modes[i] = 'product_rule' then
            if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
              v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> public.nom_unit4_key(v_kinds[i], v_dohans[i]))::int, 0);
            end if;
            if v_line.kind = 'drink'  then v_drink[i]  := v_drink[i]  + v_unit * v_alloc[i]; end if;
            if v_line.kind = 'champ'  then v_champ[i]  := v_champ[i]  + v_unit * v_alloc[i]; end if;
            if v_line.kind = 'bottle' then v_bottle[i] := v_bottle[i] + v_unit * v_alloc[i]; end if;
          end if;
          -- pt は3択の射程外=全 mode 共通(裁定113)
          if v_kinds[i] = 'hon' then  -- ★0119: pt は本指名キャストの行のみ
            v_pt[i] := v_pt[i] + coalesce((v_line.back_snapshot ->> 'hon_pt')::int, 0) * v_alloc[i];
          end if;
        end if;
      end loop;
    end loop;
    -- ★0132/0133: mode 別の凍結書込(ゼロ専用行は作らない)
    for i in 1..v_n loop
      if v_modes[i] = 'plan_rate' then
        if v_pt[i] > 0 or v_salesbase[i] > 0 then
          insert into public.check_cast_backs
            (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc,
             source_mode, product_sales_base, calculated_back_amount)
          values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                  0, 0, 0, v_pt[i],
                  'plan_rate', v_salesbase[i],
                  round((v_salesbase[i]::numeric * v_rates[i]) / 100.0)::int);
        end if;
      elsif v_modes[i] = 'plan_fixed' then
        -- ★0133: 1本あたり固定額=按分本数Σ×固定額を凍結(plan_rate と同型・payOf 例外を廃止)
        if v_pt[i] > 0 or v_salesbase[i] > 0 or v_units[i] > 0 then
          insert into public.check_cast_backs
            (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc,
             source_mode, product_sales_base, calculated_back_amount)
          values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                  0, 0, 0, v_pt[i],
                  'plan_fixed', v_salesbase[i], v_units[i] * v_fixeds[i]);
        end if;
      else
        if v_drink[i] + v_champ[i] + v_bottle[i] + v_pt[i] > 0 then
          insert into public.check_cast_backs
            (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc,
             source_mode, product_sales_base, calculated_back_amount)
          values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                  v_drink[i], v_champ[i], v_bottle[i], v_pt[i],
                  'product_rule', null, null);
        end if;
      end if;
    end loop;
    end if;  -- ★0124 判断B ガード終端
  end if;

  update public.checks
     set status = 'closed', closed_at = now(), close_idem_key = p_idem_key
   where id = p_check_id;
  -- ★mig0053(B1 相席・transient): 追加席の占有を解放(解放経路=ロック不要・money 非干渉)
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_close', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
  return p_check_id;
end 
```

### punch_self
```sql

declare
  v_cast uuid; v_row record; v_ip text; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'no cast for caller'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  select org_id, store_id into v_row from public.casts where id = v_cast;
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  -- 盲目記録（0008 決定1）: シーケンス検証なし・in-in/孤立 out も事実として残す
  insert into public.punches (org_id, store_id, cast_id, type, lat, lng, ip, source)
  values (v_row.org_id, v_row.store_id, v_cast, p_type, p_lat, p_lng, v_ip, 'self')
  returning id into v_id;
  perform public.audit_log_write('punch_self', 'punches:' || v_id::text, null,
    (select to_jsonb(p) from public.punches p where p.id = v_id), v_row.store_id);
  return v_id;
end 
```

### kiosk_punch
```sql

declare
  v_device   public.kiosk_devices;
  v_cast     public.casts;
  v_pin      public.cast_pin;
  v_ip       text;
  v_punch_id uuid;
  v_newfail  integer;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'punch';
  if not found then raise exception 'forbidden'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  -- 形式不正 PIN は失敗カウント外（UI は4桁パッド前提・総当たりは4桁一致のみ計上）
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;

  -- 対象 cast は自店 active のみ（他店/他 org は not_found＝存在オラクル封じ）
  select c.* into v_cast from public.casts c
    where c.id = p_cast_id and c.store_id = v_device.store_id and c.is_active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select p.* into v_pin from public.cast_pin p
    where p.cast_id = p_cast_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;

  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked',
                              'locked_until', v_pin.locked_until);
  end if;

  if v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then
    v_newfail := v_pin.fail_count + 1;
    if v_newfail >= 5 then
      update public.cast_pin
         set fail_count = 0, locked_until = now() + interval '15 minutes', updated_at = now()
       where cast_id = p_cast_id;
    else
      update public.cast_pin
         set fail_count = v_newfail, updated_at = now()
       where cast_id = p_cast_id;
    end if;
    insert into public.audit_logs
      (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values
      (v_device.org_id, v_device.store_id, null, 'kiosk_punch',
       'cast_pin:' || p_cast_id::text, null,
       jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', p_cast_id,
                          'result', 'wrong_pin', 'fail_count', v_newfail,
                          'locked', v_newfail >= 5),
       v_ip);
    if v_newfail >= 5 then
      return jsonb_build_object('ok', false, 'reason', 'locked',
                                'locked_until', now() + interval '15 minutes');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  -- PIN 一致: カウンタ復元 → 盲目記録 INSERT（punch_self 逐語型・source='kiosk'）
  update public.cast_pin
     set fail_count = 0, locked_until = null, updated_at = now()
   where cast_id = p_cast_id;

  -- 0109: 打刻端末の最終アクセス（成功経路のみ・引き継ぎv18 §3 のとおり）
  update public.kiosk_devices
     set last_seen_at = now(), last_ip = v_ip
   where id = v_device.id;

  insert into public.punches (org_id, store_id, cast_id, type, lat, lng, ip, source)
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_type, null, null, v_ip, 'kiosk')
  returning id into v_punch_id;

  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, null, 'kiosk_punch',
     'punches:' || v_punch_id::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', p_cast_id,
                        'type', p_type, 'result', 'ok'),
     v_ip);

  return jsonb_build_object('ok', true, 'punch_id', v_punch_id, 'punched_at', now());
end 
```

### shift_set
```sql

declare
  v_cast record; v_actor uuid; v_id uuid; v_before jsonb;
  v_unavail boolean; v_reason text;  -- ★0125 裁定112 判断F
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_date is null then raise exception 'bad date'; end if;
  if p_start_hm is null or p_start_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_end_hm   is null or p_end_hm   !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_status is null or p_status not in ('planned','proposed','confirmed') then raise exception 'bad status'; end if;
  if p_override_reason is not null and length(p_override_reason) > 200 then raise exception 'bad reason'; end if;  -- ★0125
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- ★B-5②: 定休日ハード拒否(create/update 共通・ロール照合の後=他店曜日の probing 防止)
  if public.shift_is_closed_day(v_cast.store_id, p_date) then
    raise exception 'closed day';
  end if;
  -- ★0125 裁定112 判断F: 出勤不可はソフト拒否(定休日=ハードとの非対称)。理由付きで押し切り可・理由は不可日のみ保存
  v_unavail := exists (select 1 from public.cast_unavailable_days u
                        where u.cast_id = p_cast_id and u.date = p_date);
  if v_unavail and (p_override_reason is null or btrim(p_override_reason) = '') then
    raise exception 'unavailable';
  end if;
  v_reason := case when v_unavail then p_override_reason else null end;
  -- ★0103 SD-9: 1日1枠(同一 cast・同一 date)。制約 shifts_cast_date_key が最終防衛
  if exists (select 1 from public.shifts s
              where s.cast_id = p_cast_id and s.date = p_date
                and (p_id is null or s.id <> p_id)) then
    raise exception 'duplicate';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if p_id is null then
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, created_by, override_reason)
    values (v_cast.org_id, v_cast.store_id, p_cast_id, p_date, p_start_hm, p_end_hm, p_status, v_actor, v_reason)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(s) into v_before from public.shifts s
      where s.id = p_id and s.org_id = public.auth_org_id() and s.cast_id = p_cast_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.shifts
       set date = p_date, start_hm = p_start_hm, end_hm = p_end_hm, status = p_status,
           override_reason = v_reason  -- ★0125: 日付変更で不可でなくなれば null へ
     where id = p_id and org_id = public.auth_org_id();
    v_id := p_id;
  end if;
  perform public.audit_log_write('shift_set', 'shifts:' || v_id::text, v_before,
    (select to_jsonb(s) from public.shifts s where s.id = v_id), v_cast.store_id);
  return v_id;
end

```

### payroll_run_create
```sql

declare
  v_store  record;
  v_actor  uuid;
  v_id     uuid;
  v_status text;
begin
  -- 二重防御①: 冒頭 null guard
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  -- 入力検証
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  -- store の org 照合＋ロール判定（owner 全店・manager 自店のみ・staff/cast 不可）
  select s.id, s.org_id into v_store from public.stores s where s.id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 自然冪等: 既存 run があれば id と status を返す（1店1期間・period_start/end は finalize が確定）
  select pr.id, pr.status into v_id, v_status from public.payroll_runs pr
   where pr.store_id = p_store_id and pr.period = p_period;
  if v_id is not null then
    id := v_id; status := v_status; return next; return;
  end if;

  select u.id into v_actor from public.users u where u.auth_user_id = auth.uid() and u.is_active;
  insert into public.payroll_runs (org_id, store_id, period, status, created_by)
  values (public.auth_org_id(), p_store_id, p_period, 'draft', v_actor)
  returning payroll_runs.id into v_id;

  perform public.audit_log_write('payroll_run_create', 'payroll_runs:' || v_id::text,
    null, jsonb_build_object('period', p_period, 'store_id', p_store_id), p_store_id);
  id := v_id; status := 'draft'; return next;
end 
```

### daily_report_close
```sql

declare
  v_owner uuid; v_settings jsonb; v_cutoff text; v_rate int;
  v_exist record; v_agg jsonb; v_actor uuid; v_id uuid; v_diff int; v_ar int;
  v_ar_card int; v_ar_other int;  -- ★D45
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  if coalesce(p_expense, -1) < 0 or coalesce(p_cash_payout, -1) < 0 or coalesce(p_cash_float, -1) < 0 then
    raise exception 'bad amount';
  end if;
  if p_counted_cash is not null and p_counted_cash < 0 then raise exception 'bad amount'; end if;
  -- E1 mig0051: 税率は stores.card_tax_rate 列読み（列 CHECK 0..100 が構造保証・既定 5 は列 default と同値）
  select org_id, settings_json, card_tax_rate into v_owner, v_settings, v_rate
    from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 冪等: 同一 (store, biz_date) の既存行＝同一キーなら成功・別キーは reclose を促す
  select * into v_exist from public.daily_reports
    where store_id = p_store_id and biz_date = p_biz_date;
  if v_exist.id is not null then
    if p_idem_key is not null and v_exist.close_idem_key = p_idem_key then return v_exist.id; end if;
    raise exception 'already closed';
  end if;

  -- 設定スナップショット（cutoff 既定 06:00＝json のまま／税率＝列読み・raise は防御深度で残置）
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_rate < 0 then
    raise exception 'bad store settings';
  end if;

  v_agg := public.daily_report_aggregate(p_store_id, p_biz_date, v_cutoff, v_rate);
  v_ar  := (v_agg->>'ar_collected')::int;
  v_ar_card  := (v_agg->>'ar_collected_card')::int;   -- ★D45
  v_ar_other := (v_agg->>'ar_collected_other')::int;  -- ★D45

  -- 【決定1】open 伝票が範囲内に残る場合は既定拒否・p_force で強行（残数を記録）
  if (v_agg->>'open_checks')::int > 0 and not p_force then
    raise exception 'open checks remain';
  end if;

  -- 【決定2＋B6】diff = counted − (float + cash + ar_collected − expense − payout)
  --   （モック H=Oi−q に回収現金を理論在高へ加算＝ドロワー実査整合）。counted 未入力時は null。
  --   ★D45: card/other 回収は理論在高に加算しない（式不変）。
  v_diff := case when p_counted_cash is null then null
                 else p_counted_cash - (coalesce(p_cash_float,0) + (v_agg->>'cash')::int + v_ar
                                        - coalesce(p_expense,0) - coalesce(p_cash_payout,0)) end;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.daily_reports
    (org_id, store_id, biz_date,
     cash, card_gross, card_tax, uri, other, drink_sales, dohan_checks, slips, guests,
     open_checks_count, ar_collected, expense, cash_payout, cash_float, counted_cash, diff, note,
     biz_cutoff_hm, card_tax_rate, close_idem_key, closed_by,
     ar_collected_card, ar_collected_other)  -- ★D45
  values
    (public.auth_org_id(), p_store_id, p_biz_date,
     (v_agg->>'cash')::int, (v_agg->>'card')::int, (v_agg->>'card_tax')::int,
     (v_agg->>'uri')::int, (v_agg->>'other')::int, (v_agg->>'drink_sales')::int,
     (v_agg->>'dohan_checks')::int, (v_agg->>'slips')::int, (v_agg->>'guests')::int,
     (v_agg->>'open_checks')::int, v_ar,
     coalesce(p_expense,0), coalesce(p_cash_payout,0), coalesce(p_cash_float,0),
     p_counted_cash, v_diff, p_note,
     v_cutoff, v_rate, p_idem_key, v_actor,
     v_ar_card, v_ar_other)  -- ★D45
  returning id into v_id;
  perform public.audit_log_write('daily_report_close', 'daily_reports:' || v_id::text, null,
    (select to_jsonb(d) from public.daily_reports d where d.id = v_id), p_store_id);
  return v_id;
end 
```

### audit_log_write
```sql

declare
  v_org   uuid;
  v_actor uuid;
  v_ip    text;
  v_id    uuid;
begin
  -- 二重防御①: 冒頭 null guard（NULL 比較の素通り防止）
  -- ★0057(2): kiosk 経由は device org を供給（人間は coalesce 第1腕＝従来どおり・両方 null は従来どおり raise）
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());
  if v_org is null then
    raise exception 'forbidden';
  end if;
  -- ★0057(4): actor＝operator（kiosk セッション）優先・従来式 fallback
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  -- ip はベストエフォート（PostgREST 経由時のみ request.headers が入る）
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  -- ★0135(#62): reason 列(横断設計書 §3・解除系は呼出側で必須検証)
  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip, reason)
  values
    (v_org, p_store_id, v_actor, p_action, p_target, p_before, p_after, v_ip, nullif(trim(p_reason), ''))
  returning id into v_id;
  return v_id;
end 
```

### audit_log_write_service
```sql

declare
  v_id uuid;
begin
  if p_org_id is null then raise exception 'forbidden'; end if; -- org 明示必須
  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip, reason)
  values
    (p_org_id, p_store_id, p_actor, p_action, p_target, p_before, p_after, null, nullif(trim(p_reason), ''))
  returning id into v_id;
  return v_id;
end 
```

## h-1 live のゲート済み RPC（'billing locked'＝名簿 A・128 本）
adv_cancel / adv_issue / approval_decide / approval_direct / approval_request / bottle_keep_register / cash_diff_approve / cast_create / cast_invite / cast_rank_reorder / cast_rejoin / cast_unavailable_remove / cast_unavailable_set / check_add_line / check_add_referral / check_add_seat / check_close / check_dohan_add / check_extension_add / check_line_set_group / check_merge / check_move_seat / check_open / check_pay / check_remove_line / check_remove_seat / check_set_nominations / check_set_people / check_shimei_add / check_time_charge_apply / check_void / customer_assign_cast / customer_register / customer_update / delete_cast_rank / delete_pricing_rule / drink_claim_decide / drink_claim_submit / drink_claim_submit_proxy / drink_claim_void / flag_set / incentive_cancel / incentive_publish / kiosk_provision / notice_create / notice_delete / notice_update / pricing_rule_reorder / product_bulk_insert / product_category_reorder / product_reorder / product_stock_add / receipt_issue / receipt_issue_void / report_reopen / reservation_create / reservation_set_status / reservation_to_check / reservation_update / seat_reorder / set_cast_norm / set_cast_norm_self / set_cast_pin / set_cast_plan / set_cast_profile / set_cast_rank / set_cast_rank_of / set_cast_register / set_comp_component / set_comp_plan / set_custom_back_def / set_deduction / set_penalty_config / set_pricing_category / set_pricing_rule / set_printer_config / set_product / set_product_active / set_product_category / set_seat / set_staff_perms / set_staff_pin / set_staffing_need / set_store_biz_cutoff / set_store_business_hours / set_store_cast_register / set_store_norm_config / set_store_okuri_base / set_store_okuri_mode / set_store_pin_policy / set_store_pricing / set_store_profile / set_store_receipt_profile / set_store_receivable_policy / set_store_tax_config / set_store_time_pricing / shift_auto_apply / shift_auto_clear / shift_bulk_set / shift_bulk_set_daily / shift_cast_confirm / shift_confirm_bulk / shift_period_remove / shift_period_set / shift_propose / shift_remove / shift_rules_set / shift_set / shift_wish_decide / staff_change_role / staff_create / staff_deadline_set / staff_pattern_delete / staff_pattern_set / staff_reactivate / staff_shift_confirm / staff_shift_override / staff_shift_propose / staff_transfer_store / staff_update_profile / staffing_need_remove / store_sales_target_set / transport_cancel / transport_issue / trial_hire / trial_register / trial_reject / trial_update
- ゲート行の形: v_org 版 62・auth_org_id() 版 66

## i-1 org 配下の text 列（列挙・enum 系を除く）
- advances: deduct_period, note
- approvals: reason
- ar_collections: note
- attendance: eta, reason, source
- attendance_incentives: amount_mode, reason
- audit_logs: ip, reason
- bottle_keeps: note, shelf_no
- cast_pin: pin_hash
- cast_ranks: name
- cast_sensitive: real_name
- cast_tax_profiles: invoice, reg_no
- cast_unavailable_days: reason
- casts: name, employment
- check_cast_backs: source_mode
- check_lines: name_snapshot
- check_nominations: nom_kind
- checks: void_reason, time_per, category_name, set_rule_name, set_unit, ext_unit, vip_charge_unit
- comp_plans: name, hon_back_mode, jonai_back_mode, dohan_back_mode, product_back_mode
- custom_back_defs: name, basis
- customer_notes: body
- customers: name, furigana, tel, prefs, memo, grade
- daily_reports: note, biz_cutoff_hm, reopen_reason, diff_reason
- deductions: name, per, basis_note
- kiosk_devices: label, purpose, last_ip
- notices: title, body, audience
- org_billing: stripe_customer_id, stripe_subscription_id, interval, collection_method
- payment_records: note
- payments: method_detail
- payroll_adjustments: reason, source
- pricing_categories: name
- pricing_rules: seat_kind, name, billing_unit
- print_jobs: print_token, claimed_serial, error_code
- printer_config: printer_serial, store_token
- product_categories: name
- products: category, name
- punches: ip, source, note
- receipt_issues: recipient, proviso, store_name_snap, void_note
- receivables: deduct_period
- reservations: guest_name, memo
- seats: name
- shift_wishes: start_hm, end_hm
- shifts: start_hm, end_hm, source, override_reason
- staff_pin: pin_hash
- staff_shift_deadlines: deadline_hm
- staff_shift_patterns: name, start_hm, end_hm
- staff_shift_wishes: note
- staff_shifts: start_hm, end_hm
- stock_logs: reason
- store_business_hours: open_hm, close_hm
- stores: name, short, open_time, time_mode, time_per, invoice_status, invoice_reg_no
- transport: note
- trials: name, real_name, tier, memo
- users: name
- withholding_payments: target_month

## i-2 長さ CHECK を持つ列
- approvals.approvals_pay_group_check: CHECK (((length(pay_group) >= 1) AND (length(pay_group) <= 20)))
- approvals.approvals_reason_check: CHECK (((reason IS NULL) OR (length(reason) <= 200)))
- attendance_incentives.attendance_incentives_reason_len: CHECK (((reason IS NULL) OR (length(reason) <= 200)))
- cast_unavailable_days.cast_unavailable_days_reason_check: CHECK (((reason IS NULL) OR (length(reason) <= 200)))
- check_lines.check_lines_pay_group_check: CHECK (((length(pay_group) >= 1) AND (length(pay_group) <= 20)))
- customer_notes.customer_notes_body_len: CHECK (((length(body) >= 1) AND (length(body) <= 2000)))
- daily_reports.daily_reports_diff_reason_len: CHECK (((diff_reason IS NULL) OR ((length(TRIM(BOTH FROM diff_reason)) >= 1) AND (length(TRIM(BOTH FROM diff_reason)) <= 200))))
- daily_reports.daily_reports_reopen_reason_len: CHECK (((reopen_reason IS NULL) OR ((length(TRIM(BOTH FROM reopen_reason)) >= 1) AND (length(TRIM(BOTH FROM reopen_reason)) <= 200))))
- deductions.deductions_sanction_basis_check: CHECK (((kind <> 'sanction'::text) OR ((basis_confirmed_at IS NOT NULL) AND (basis_confirmed_by IS NOT NULL) AND (basis_note IS NOT NULL) AND (length(TRIM(BOTH FROM basis_note)) > 0))))
- payments.payments_method_detail_check: CHECK (((method_detail IS NULL) OR (char_length(method_detail) <= 50)))
- payments.payments_pay_group_check: CHECK (((length(pay_group) >= 1) AND (length(pay_group) <= 20)))
- payroll_adjustments.payroll_adjustments_reason_ck: CHECK (((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200)))
- pricing_rules.pricing_rules_name_check: CHECK (((name IS NULL) OR ((name = btrim(name)) AND ((length(name) >= 1) AND (length(name) <= 40)))))
- receipt_issues.receipt_issues_proviso_len: CHECK (((proviso IS NULL) OR (length(proviso) <= 100)))
- receipt_issues.receipt_issues_recipient_len: CHECK (((recipient IS NULL) OR (length(recipient) <= 100)))
- shifts.shifts_override_reason_check: CHECK (((override_reason IS NULL) OR (length(override_reason) <= 200)))
- staff_shift_patterns.staff_shift_patterns_name_check: CHECK (((length(name) >= 1) AND (length(name) <= 40)))
- staff_shift_wishes.staff_shift_wishes_note_check: CHECK (((note IS NULL) OR (length(note) <= 200)))

## i-3 storage buckets
[{"id":"cast-photos","name":"cast-photos","public":false,"file_size_limit":"2097152","allowed_mime_types":["image/jpeg"]}]
## i-4 storage policies
- cast_photos_insert INSERT {authenticated} qual=null check=((bucket_id = 'cast-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text) AND ((EXISTS ( SELECT 1
   FROM casts c
  WHERE ((((c.id)::text || '.jpg'::text) = storage.filename(objects.name)) AND (c.org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR ((auth_role() = 'manager'::text) AND (c.store_id = auth_store_id())))))) OR ((auth_cast_id() IS NOT NULL) AND (storage.filename(name) = ((auth_cast_id())::text || '.jpg'::text)))))
- cast_photos_select SELECT {authenticated} qual=((bucket_id = 'cast-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text)) check=null
- cast_photos_update UPDATE {authenticated} qual=((bucket_id = 'cast-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text) AND ((EXISTS ( SELECT 1
   FROM casts c
  WHERE ((((c.id)::text || '.jpg'::text) = storage.filename(objects.name)) AND (c.org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR ((auth_role() = 'manager'::text) AND (c.store_id = auth_store_id())))))) OR ((auth_cast_id() IS NOT NULL) AND (storage.filename(name) = ((auth_cast_id())::text || '.jpg'::text))))) check=((bucket_id = 'cast-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text) AND ((EXISTS ( SELECT 1
   FROM casts c
  WHERE ((((c.id)::text || '.jpg'::text) = storage.filename(objects.name)) AND (c.org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR ((auth_role() = 'manager'::text) AND (c.store_id = auth_store_id())))))) OR ((auth_cast_id() IS NOT NULL) AND (storage.filename(name) = ((auth_cast_id())::text || '.jpg'::text)))))