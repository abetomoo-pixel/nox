#!/usr/bin/env python3
"""Validate the packaged NOX reference data. No database writes, no network calls.
Usage: python 06_validation/validate.py [package_directory]
A passing result validates this reference model, not the NOX application.
"""
from __future__ import annotations
import csv
import json
import sys
from pathlib import Path
from collections import defaultdict
from datetime import date, datetime


def validate(root: Path) -> dict:
    bundle = json.loads((root / 'nox_demo_all.json').read_text(encoding='utf-8'))
    data = bundle['datasets']
    def rows(name: str) -> list[dict]: return data[name]['records']
    errors: list[str] = []
    checked = 0
    def check(condition: bool, message: str) -> None:
        nonlocal checked
        checked += 1
        if not condition: errors.append(message)

    stores = {r['store_id']: r for r in rows('stores')}
    products = {r['product_id']: r for r in rows('products')}
    people = {r['person_id']: r for r in rows('people')}
    plans = {r['plan_id']: r for r in rows('compensation_plans')}
    categories = {r['category_id']: r for r in rows('categories')}
    customers = {r['customer_id']: r for r in rows('customers')}
    tables = {r['table_id']: r for r in rows('tables')}
    rules = {r['pricing_rule_id']: r for r in rows('pricing_rules')}
    orders = {r['order_id']: r for r in rows('orders')}

    for name, key in [('stores','store_id'),('products','product_id'),('categories','category_id'),('people','person_id'),('compensation_plans','plan_id'),('customers','customer_id'),('tables','table_id'),('orders','order_id'),('order_items','order_item_id'),('receivable_opening_snapshots','receivable_id')]:
        vals = [r[key] for r in rows(name)]
        check(len(vals) == len(set(vals)), f'{name}: duplicate {key}')

    for name, ds in data.items():
        for i, r in enumerate(ds['records']):
            sid = r.get('store_id')
            if sid: check(sid in stores, f'{name}[{i}]: unknown store')
            for key, lookup in [('product_id',products),('person_id',people),('recipient_person_id',people),('assigned_person_id',people),('relationship_person_id',people),('nomination_person_id',people),('customer_id',customers),('table_id',tables),('plan_id',plans),('display_category_id',categories)]:
                ref = r.get(key)
                if not ref: continue
                check(ref in lookup, f'{name}[{i}]: unknown {key}={ref}')
                if ref in lookup and sid:
                    check(lookup[ref]['store_id'] == sid, f'{name}[{i}]: cross-store {key}')
            for ref in r.get('assigned_person_ids',[]):
                check(ref in people and people[ref]['store_id']==sid, f'{name}[{i}]: invalid assigned person')

    for p in products.values():
        check(p['selling_price_yen'] > 0, f'{p["product_id"]}: nonpositive price')
        check(0 <= p['cost_yen'] <= p['selling_price_yen'], f'{p["product_id"]}: cost outside reference bounds')
        if p['stock_tracking']:
            check(p['reorder_point'] is not None and p['reorder_point'] >= 0, f'{p["product_id"]}: missing reorder point')
        if p['back_mode']=='percentage':
            check(p['back_rate_bps'] is not None and 0<=p['back_rate_bps']<=10000, f'{p["product_id"]}: rate')
        elif p['back_mode']=='by_nomination':
            check(all(0<=p[f'back_{k}_yen']<=p['selling_price_yen'] for k in ['main','inhouse','accompanied','free']), f'{p["product_id"]}: fixed reward')
        if p['cast_drink_exclude_from_shared_sales']:
            check(p['assigned_person_required'], f'{p["product_id"]}: cast recipient missing policy')

    items_by_order=defaultdict(list)
    for it in rows('order_items'): items_by_order[it['order_id']].append(it)
    recalc_rewards=defaultdict(int)
    recomputed_receipts=[]
    for oid, order in orders.items():
        lines=items_by_order[oid]
        subtotal=0; known_cost=0; product_rewards=0; nomination_rewards=0
        check(len(lines)>0, f'{oid}: no lines')
        rule=rules[order['pricing_rule_id']]
        local=datetime.fromisoformat(order['opened_at'])
        check(local.date().isoformat()==order['business_date'], f'{oid}: unexpected business date in reference')
        check(local.isoweekday() in rule['iso_weekdays'], f'{oid}: wrong weekday rate')
        minute=local.hour*60+local.minute
        check(rule['start_minute']<=minute<rule['end_minute_exclusive'], f'{oid}: wrong time rate')
        for it in lines:
            q=it['quantity']; price=it['unit_price_yen']; amount=q*price
            check(q>0 and isinstance(q,int), f'{it["order_item_id"]}: quantity')
            check(amount==it['line_subtotal_yen'], f'{it["order_item_id"]}: subtotal')
            subtotal += amount
            pid=it.get('recipient_person_id')
            back=0; nom=0
            if it['line_type']=='product':
                p=products[it['product_id']]
                check(price==p['selling_price_yen'], f'{it["order_item_id"]}: master price')
                check(it['unit_cost_yen']==p['cost_yen'], f'{it["order_item_id"]}: master cost')
                known_cost += q*p['cost_yen']
                if p['assigned_person_required']:check(pid is not None, f'{it["order_item_id"]}: no recipient')
                if pid:
                    if p['back_mode']=='percentage':back=amount*p['back_rate_bps']//10000
                    elif p['back_mode']=='by_nomination':back=q*p[f'back_{it["nomination_status"]}_yen']
                check(it['stock_units_consumed']==(q if p['stock_tracking'] else 0), f'{it["order_item_id"]}: stock')
            else:
                kind=it['charge_type']
                if kind in ['fee_set','fee_extension','fee_charge','fee_vip']:
                    field={'fee_set':'set_price_yen','fee_extension':'extension_price_yen','fee_charge':'set_price_yen','fee_vip':'vip_surcharge_yen'}[kind]
                    check(price==rule[field], f'{it["order_item_id"]}: fee price mismatch')
                    check(q==order['guest_count'], f'{it["order_item_id"]}: fee guest quantity')
                if pid and kind in ['fee_main','fee_inhouse','fee_accompanied']:
                    plan=plans[people[pid]['plan_id']]
                    nom=q*plan[f'{kind[4:]}_reward_yen']
            if pid:
                joined=people[pid].get('joined_on')
                check(not joined or joined<=order['business_date'], f'{it["order_item_id"]}: pre-join recipient')
                recalc_rewards[(oid,pid)]+=back+nom
            product_rewards+=back; nomination_rewards+=nom
            check(back==it['product_back_yen'], f'{it["order_item_id"]}: product back')
            check(nom==it['nomination_back_yen'], f'{it["order_item_id"]}: nomination back')
        service=subtotal*order['service_bps']//10000
        tax=(subtotal+service)*order['tax_bps']//10000
        total=subtotal+service+tax
        for k,v in [('subtotal_yen',subtotal),('service_fee_yen',service),('tax_yen',tax),('total_yen',total),('known_product_cost_yen',known_cost),('product_back_total_yen',product_rewards),('nomination_back_total_yen',nomination_rewards)]:
            check(order[k]==v, f'{oid}: {k} mismatch')
        payments=sum(p['amount_yen'] for p in rows('payment_examples') if p['order_id']==oid)
        check(payments+order['receivable_amount_yen']==total, f'{oid}: payments/AR mismatch')
        expected=next(e for e in rows('expected_results') if e['order_id']==oid)
        check(expected['expected_total_yen']==total, f'{oid}: expected total')
        check(expected['expected_product_back_yen']==product_rewards, f'{oid}: expected product back')
        check(expected['expected_nomination_back_yen']==nomination_rewards, f'{oid}: expected nomination back')
        recomputed_receipts.append({'order_id':oid,'total_yen':total,'total_back_yen':product_rewards+nomination_rewards})
    for r in rows('order_reward_calculations'):
        check(r['total_reward_yen']==recalc_rewards[(r['order_id'],r['person_id'])], f'{r["order_id"]}: per-person reward')

    known_expected={'M0919-004':35404,'L0917-002':65736,'N0918-008':264825,'A0925-008':203280,'G0919-004':70143,'B0926-004':36542}
    for oid,amount in known_expected.items():check(orders[oid]['total_yen']==amount,f'{oid}: golden value changed')

    daily=rows('daily_sales_targets')
    for month in rows('monthly_sales_targets'):
        ds=[r for r in daily if r['store_id']==month['store_id']]
        total=sum(r['target_gross_sales_yen'] for r in ds)
        check(total==month['daily_target_sum_yen'], f'{month["store_id"]}: daily target sum')
        check(total==month['stated_monthly_gross_yen'], f'{month["store_id"]}: target-only reconciliation')
    for r in rows('inventory_snapshot_targets'):
        check(r['opening_units']+r['received_units_target']-r['sold_units_target']==r['closing_units_arithmetic'],f'{r["product_id"]}: inventory arithmetic')
    ar=rows('receivable_opening_snapshots')
    for r in ar:check(r['principal_yen']-r['prior_received_aggregate_yen']==r['opening_balance_yen'], f'{r["receivable_id"]}: AR balance')
    check(sum(r['opening_balance_yen'] for r in ar)==208825,'All-store receivable snapshot should be 208825')
    source_ar={r['receivable_id']:r for r in ar}
    for oid in ['N0918-008','A0925-008']:
        linked=[r for r in ar if r.get('source_order_id')==oid]
        check(sum(r['principal_yen'] for r in linked)==orders[oid]['receivable_amount_yen'],f'{oid}: linked AR mismatch')
    remaining=50000; balances={r['receivable_id']:r['opening_balance_yen'] for r in ar if r['customer_id']=='AC-C001'}
    for r in sorted((r for r in ar if r['customer_id']=='AC-C001'),key=lambda r:r['originated_on']):
        paid=min(remaining,balances[r['receivable_id']]);remaining-=paid;balances[r['receivable_id']]-=paid
    check(remaining==0 and sum(balances.values())==34000,'oldest-first 50000 -> 34000')
    check(balances['AR-ACE-002']==0 and balances['AR-ACE-003']==34000,'oldest-first per-line allocation')

    for r in rows('standalone_slide_test'):
        sales=r['input_daily_allocated_sales_yen']
        actual=4500 if sales>=120000 else 3500 if sales>=70000 else 3000 if sales>=30000 else 2500
        check(r['expected_hourly_band_yen']==actual,f'{r["test_id"]}: slide')
    for r in rows('payroll_reference_calculation'):
        candidate=r['hourly_component_yen']+r['nomination_component_yen']+r['product_reward_input_yen']+r['bonus_from_proposed_rules_yen']
        check(candidate==r['arithmetic_total_yen'],f'{r["person_id"]}: reference payroll addition')
        check(r['included_reference_total_yen']==(candidate if r['eligible_in_period'] else 0),f'{r["person_id"]}: eligible payroll inclusion')
        check(not r['payroll_finalized'],f'{r["person_id"]}: must not be finalized')

    # CSV mirrors must match the record counts of the authoritative JSON files.
    for name,ds in data.items():
        path=root/ds['section']/(name+'.csv')
        with path.open(encoding='utf-8-sig',newline='') as f:
            csv_rows=list(csv.DictReader(f))
        check(len(csv_rows)==len(ds['records']),f'{name}: CSV row count')
    source_issues=rows('review_issues')
    return {'reference_validation_passed':not errors,'checks_executed':checked,'errors':errors,'application_integration_tested':False,'september_complete_order_history':False,'payroll_finalized':False,'source_review_items':len(source_issues),'source_review_by_severity':dict((s,sum(r['severity']==s for r in source_issues)) for s in sorted({r['severity'] for r in source_issues})),'reference_receipts':recomputed_receipts,'note':'PASS validates the supplied reference arithmetic and identifiers only. Targets and unresolved implementation questions are not certified.'}


def main() -> int:
    root=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[1]
    try:
        report=validate(root)
    except (OSError,ValueError,KeyError,StopIteration) as exc:
        print(f'Validation could not complete: {exc}',file=sys.stderr)
        return 2
    print(json.dumps(report,ensure_ascii=False,indent=2))
    (root/'06_validation'/'validation_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return 0 if report['reference_validation_passed'] else 1

if __name__=='__main__':raise SystemExit(main())