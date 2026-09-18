### payroll_adjustment_add
md5(prosrc)=5ad4e4d4b2dbf9d4649e794cf25dd04e  secdef=true  acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}

```sql
CREATE OR REPLACE FUNCTION public.payroll_adjustment_add(p_run_id uuid, p_cast_id uuid, p_mode text, p_amount integer, p_rate_bp integer, p_before_withholding boolean, p_show_detail boolean, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid := auth_org_id();
  v_role    text := auth_role();
  v_actor   uuid;
  v_store   uuid;
  v_status  text;
  v_cast_st uuid;
  v_id      uuid;
begin
  if v_org is null then
    raise exception 'forbidden';
  end if;
  if v_role is null or v_role not in ('owner','manager') then
    raise exception 'forbidden';
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then
    raise exception 'forbidden';
  end if;

  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then
    raise exception 'reason required';
  end if;
  if p_mode is null or p_mode not in ('fixed','rate') then
    raise exception 'bad mode';
  end if;
  if p_mode = 'fixed' and (p_amount is null or p_amount < 0 or p_rate_bp is not null) then
    raise exception 'bad amount';
  end if;
  if p_mode = 'rate' and (p_rate_bp is null or p_rate_bp < 0 or p_rate_bp > 10000 or p_amount is not null) then
    raise exception 'bad amount';
  end if;

  select store_id, status into v_store, v_status
    from payroll_runs where id = p_run_id and org_id = v_org;
  if not found then
    raise exception 'run not found';
  end if;
  if v_role = 'manager' and v_store is distinct from auth_store_id() then
    raise exception 'forbidden';
  end if;
  if v_status <> 'draft' then
    raise exception 'run not draft';
  end if;

  select store_id into v_cast_st
    from casts where id = p_cast_id and org_id = v_org;
  if not found then
    raise exception 'cast not found';
  end if;
  if v_cast_st is distinct from v_store then
    raise exception 'cast store mismatch';
  end if;

  insert into payroll_adjustments(
    org_id, store_id, run_id, cast_id, mode, amount, rate_bp,
    before_withholding, show_detail, reason, created_by)
  values (
    v_org, v_store, p_run_id, p_cast_id, p_mode,
    case when p_mode = 'fixed' then p_amount else null end,
    case when p_mode = 'rate'  then p_rate_bp else null end,
    coalesce(p_before_withholding, true),
    coalesce(p_show_detail, true),
    p_reason, v_actor)
  returning id into v_id;

  perform audit_log_write(
    'payroll_adjustment_add',
    'payroll_adjustments:' || v_id::text,
    null,
    jsonb_build_object('run_id', p_run_id, 'cast_id', p_cast_id,
      'mode', p_mode, 'amount', p_amount, 'rate_bp', p_rate_bp,
      'before_withholding', coalesce(p_before_withholding, true),
      'show_detail', coalesce(p_show_detail, true)),
    v_store,
    p_reason);

  return v_id;
end $function$

```

### payroll_adjustment_delete
md5(prosrc)=4c440d0e06398fe21a957dcfe6a12469  secdef=true  acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}

```sql
CREATE OR REPLACE FUNCTION public.payroll_adjustment_delete(p_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org    uuid := auth_org_id();
  v_role   text := auth_role();
  v_actor  uuid;
  v_store  uuid;
  v_run    uuid;
  v_status text;
  v_before jsonb;
begin
  if v_org is null then
    raise exception 'forbidden';
  end if;
  if v_role is null or v_role not in ('owner','manager') then
    raise exception 'forbidden';
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then
    raise exception 'forbidden';
  end if;

  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then
    raise exception 'reason required';
  end if;

  select a.store_id, a.run_id, to_jsonb(a.*) into v_store, v_run, v_before
    from payroll_adjustments a where a.id = p_id and a.org_id = v_org;
  if not found then
    raise exception 'adjustment not found';
  end if;
  if v_role = 'manager' and v_store is distinct from auth_store_id() then
    raise exception 'forbidden';
  end if;

  select status into v_status from payroll_runs where id = v_run;
  if v_status <> 'draft' then
    raise exception 'run not draft';
  end if;

  delete from payroll_adjustments where id = p_id;

  perform audit_log_write(
    'payroll_adjustment_delete',
    'payroll_adjustments:' || p_id::text,
    v_before,
    null,
    v_store,
    p_reason);
end $function$

```

### check_add_line
md5(prosrc)=8629536b0210942633af64bbd0c22b4e  secdef=true  acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}

```sql
CREATE OR REPLACE FUNCTION public.check_add_line(p_check_id uuid, p_product_id uuid DEFAULT NULL::uuid, p_qty integer DEFAULT 1, p_kind text DEFAULT NULL::text, p_pay_group text DEFAULT 'A'::text, p_name text DEFAULT NULL::text, p_unit_price integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_prod record; v_id uuid; v_grp text; v_sort int;
  v_kind text; v_name text; v_price int; v_back jsonb;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'bad qty'; end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（誤入力訂正は remove_line＝確定① の代替経路）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  if p_product_id is not null then
    select * into v_prod from public.products where id = p_product_id;
    if v_prod.id is null or v_prod.org_id <> v_org
       or v_prod.store_id <> v_chk.store_id then raise exception 'bad item'; end if;
    if not v_prod.is_active then raise exception 'inactive item'; end if;
    v_kind := v_prod.type;             -- drink/champ/bottle
    v_name := v_prod.name;
    v_price := v_prod.price;
    -- ★mig0070: back_exempt を凍結（経路の分岐もマスタ現価でなく伝票の凍結値で決める）
    v_back := jsonb_build_object('back_mode', v_prod.back_mode, 'back_value', v_prod.back_value,
                                 'unit4', v_prod.unit4_json, 'hon_pt', v_prod.hon_pt,
                                 'back_exempt', coalesce(v_prod.back_exempt_from_split, false));
  else
    if p_kind is null or p_kind not in ('set','time','charge','custom') then raise exception 'bad kind'; end if;
    if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
    if p_unit_price is null or p_unit_price < 0 then raise exception 'bad price'; end if;
    v_kind := p_kind;
    v_name := trim(p_name);
    v_price := p_unit_price;
    v_back := null;
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot, sort_order)
  values (v_chk.org_id, v_chk.store_id, p_check_id, p_product_id, v_kind, v_grp,
          v_name, v_price, p_qty, v_price * p_qty, v_back, v_sort)
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_add_line', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$

```

### set_cast_norm
md5(prosrc)=2a1c988683ef6bf68e175bd42fc12b28  secdef=true  acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}

```sql
CREATE OR REPLACE FUNCTION public.set_cast_norm(p_cast_id uuid, p_period text, p_days_target integer, p_dohan_target integer, p_sales_target bigint, p_shimei_target integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast_org   uuid;
  v_cast_store uuid;
  v_id         uuid;
  v_before     jsonb;
  v_after      jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_period is null or p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  if p_days_target is null or p_days_target < 0 then raise exception 'bad days_target'; end if;
  if p_dohan_target is null or p_dohan_target < 0 then raise exception 'bad dohan_target'; end if;
  if p_sales_target is null or p_sales_target < 0 then raise exception 'bad sales_target'; end if;
  if p_shimei_target is null or p_shimei_target < 0 then raise exception 'bad shimei_target'; end if;
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  select to_jsonb(n) into v_before from public.cast_norms n
    where n.cast_id = p_cast_id and n.period = p_period;
  insert into public.cast_norms
    (org_id, store_id, cast_id, period, days_target, dohan_target, sales_target, shimei_target)
  values
    (v_cast_org, v_cast_store, p_cast_id, p_period, p_days_target, p_dohan_target, p_sales_target, p_shimei_target)
  on conflict (cast_id, period) do update
    set days_target   = excluded.days_target,
        dohan_target  = excluded.dohan_target,
        sales_target  = excluded.sales_target,
        shimei_target = excluded.shimei_target,
        store_id      = excluded.store_id
  returning id into v_id;
  select to_jsonb(n) into v_after from public.cast_norms n where n.id = v_id;
  perform public.audit_log_write('set_cast_norm', 'cast_norms:' || v_id::text, v_before, v_after, v_cast_store);
  return v_id;
end $function$

```

### shift_wish_submit
md5(prosrc)=b94ad31ef3be6a33050574f467dcc5db  secdef=true  acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}

```sql
CREATE OR REPLACE FUNCTION public.shift_wish_submit(p_date date, p_start_hm text, p_end_hm text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast uuid; v_row record; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'no cast for caller'; end if; -- cast セルフ専用
  if p_date is null then raise exception 'bad date'; end if;
  if p_start_hm is null or p_start_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_end_hm   is null or p_end_hm   !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  select org_id, store_id into v_row from public.casts where id = v_cast;
  -- ★B-5②: 定休日ハード拒否（date=営業日そのもの・時間外は拒否しない=経営側 UI 警告・未設定は通す）
  if public.shift_is_closed_day(v_row.store_id, p_date) then
    raise exception 'closed day';
  end if;
  -- ★0103 裁定43: 提出可能日 = 自店の open 期間内のみ（open 期間が無ければ fail-closed）。締切は表示のみ（SD-6）
  if not exists (select 1 from public.shift_periods p
                  where p.store_id = v_row.store_id and p.status = 'open'
                    and p_date between p.start_date and p.end_date) then
    raise exception 'period_not_open';
  end if;
  -- ★0103: 同一 cast・同一 date の live wish（pending/accepted）は1件。index shift_wishes_cast_date_live_uidx が最終防衛
  if exists (select 1 from public.shift_wishes w
              where w.cast_id = v_cast and w.date = p_date and w.status in ('pending','accepted')) then
    raise exception 'duplicate wish';
  end if;
  insert into public.shift_wishes (org_id, store_id, cast_id, date, start_hm, end_hm)
  values (v_row.org_id, v_row.store_id, v_cast, p_date, p_start_hm, p_end_hm)
  returning id into v_id;
  perform public.audit_log_write('shift_wish_submit', 'shift_wishes:' || v_id::text, null,
    (select to_jsonb(w) from public.shift_wishes w where w.id = v_id), v_row.store_id);
  return v_id;
end $function$

```

### set_store_okuri_mode
md5(prosrc)=c0ca9e3eca19d3ae70657f2462008859  secdef=true  acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}

```sql
CREATE OR REPLACE FUNCTION public.set_store_okuri_mode(p_store_id uuid, p_mode text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
  v_prev  text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_mode is null or p_mode not in ('flat','actual') then raise exception 'bad mode'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（D3a）

  v_prev := coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat');
  update public.stores
     set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{okuri_mode}', to_jsonb(p_mode), true)
   where id = p_store_id;

  perform public.audit_log_write('set_store_okuri_mode', 'stores:' || p_store_id::text,
    jsonb_build_object('okuri_mode', v_prev), jsonb_build_object('okuri_mode', p_mode), p_store_id);
end $function$

```

### set_store_tax_config
md5(prosrc)=e711c9344666288f1f7c38590c2324a0  secdef=true  acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}

```sql
CREATE OR REPLACE FUNCTION public.set_store_tax_config(p_store_id uuid, p_business_tax_status text, p_price_display text, p_invoice_status text, p_invoice_reg_no text, p_tax_rounding text, p_card_surcharge_rate integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid; v_before jsonb; v_after jsonb; v_reg text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- 原則7: UI は常に全値明示送信＝null は拒否
  --（invoice_reg_no と card_surcharge_rate のみ null 許容＝設計上の「未設定/無効」）
  if p_business_tax_status is null
     or p_business_tax_status not in ('taxable','exempt') then
    raise exception 'bad tax config';
  end if;
  if p_price_display is null
     or p_price_display not in ('tax_included','tax_excluded') then
    raise exception 'bad tax config';
  end if;
  if p_invoice_status is null
     or p_invoice_status not in ('registered','unregistered') then
    raise exception 'bad tax config';
  end if;
  if p_tax_rounding is null
     or p_tax_rounding not in ('floor','round','ceil') then
    raise exception 'bad tax config';
  end if;
  v_reg := nullif(btrim(p_invoice_reg_no), '');
  if v_reg is not null and v_reg !~ '^T[0-9]{13}$' then
    raise exception 'bad registration number';
  end if;
  -- registered ⊂ taxable（表制約 stores_invoice_requires_taxable と二重・T5）
  if p_invoice_status = 'registered' and p_business_tax_status <> 'taxable' then
    raise exception 'invoice requires taxable';
  end if;
  -- registered 時は登録番号必須（適格簡易請求書の記載要件・T5）
  if p_invoice_status = 'registered' and v_reg is null then
    raise exception 'registration number required';
  end if;
  if p_card_surcharge_rate is not null
     and (p_card_surcharge_rate < 1 or p_card_surcharge_rate > 100) then
    raise exception 'bad tax config';
  end if;
  select org_id into v_org from public.stores where id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- 監査は税設定6列のみの合成 jsonb（set_store_pricing の7キー合成と同型）
  select jsonb_build_object(
           'business_tax_status', business_tax_status, 'price_display', price_display,
           'invoice_status', invoice_status, 'invoice_reg_no', invoice_reg_no,
           'tax_rounding', tax_rounding, 'card_surcharge_rate', card_surcharge_rate)
    into v_before from public.stores where id = p_store_id;
  update public.stores
     set business_tax_status = p_business_tax_status,
         price_display       = p_price_display,
         invoice_status      = p_invoice_status,
         invoice_reg_no      = v_reg,
         tax_rounding        = p_tax_rounding,
         card_surcharge_rate = p_card_surcharge_rate
   where id = p_store_id;
  select jsonb_build_object(
           'business_tax_status', business_tax_status, 'price_display', price_display,
           'invoice_status', invoice_status, 'invoice_reg_no', invoice_reg_no,
           'tax_rounding', tax_rounding, 'card_surcharge_rate', card_surcharge_rate)
    into v_after from public.stores where id = p_store_id;
  perform public.audit_log_write('set_store_tax_config', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$

```

### payroll_run_create
md5(prosrc)=401423b93b0a6eccb0e1ce0979bfbf43  secdef=true  acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}

```sql
CREATE OR REPLACE FUNCTION public.payroll_run_create(p_store_id uuid, p_period text)
 RETURNS TABLE(id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$

```

### CHECK 逐語

- products.products_type_check: `CHECK ((type = ANY (ARRAY['drink'::text, 'champ'::text, 'bottle'::text])))`
- check_lines.check_lines_kind_check: `CHECK ((kind = ANY (ARRAY['set'::text, 'time'::text, 'charge'::text, 'drink'::text, 'champ'::text, 'bottle'::text, 'custom'::text, 'discount'::text])))`
- payroll_adjustments.payroll_adjustments_mode_ck: `CHECK ((mode = ANY (ARRAY['fixed'::text, 'rate'::text])))`
- payroll_adjustments.payroll_adjustments_amount_ck: `CHECK ((((mode = 'fixed'::text) AND (amount IS NOT NULL) AND (amount >= 0) AND (rate_bp IS NULL)) OR ((mode = 'rate'::text) AND (rate_bp IS NOT NULL) AND ((rate_bp >= 0) AND (rate_bp <= 10000)) AND (amount IS NULL))))`
- payroll_adjustments.payroll_adjustments_reason_ck: `CHECK (((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200)))`
- stores.stores_receivable_policy_check: `CHECK ((receivable_policy = ANY (ARRAY['disabled'::text, 'customer_only'::text, 'cast_liability_allowed'::text])))`

### payroll_adjustments 全列

- id uuid not null default gen_random_uuid()
- org_id uuid not null
- store_id uuid not null
- run_id uuid not null
- cast_id uuid not null
- mode text not null
- amount integer null
- rate_bp integer null
- before_withholding boolean not null default true
- show_detail boolean not null default true
- reason text not null
- created_by uuid not null
- created_at timestamp with time zone not null default now()

### payroll_adjustments index

- CREATE INDEX payroll_adjustments_cast_idx ON public.payroll_adjustments USING btree (cast_id)
- CREATE INDEX payroll_adjustments_org_idx ON public.payroll_adjustments USING btree (org_id)
- CREATE UNIQUE INDEX payroll_adjustments_pkey ON public.payroll_adjustments USING btree (id)
- CREATE INDEX payroll_adjustments_run_idx ON public.payroll_adjustments USING btree (run_id)

### payroll_adjustments FK / RLS / grants

- FK payroll_adjustments_cast_id_fkey: FOREIGN KEY (cast_id) REFERENCES casts(id)
- FK payroll_adjustments_created_by_fkey: FOREIGN KEY (created_by) REFERENCES users(id)
- FK payroll_adjustments_org_id_fkey: FOREIGN KEY (org_id) REFERENCES orgs(id)
- FK payroll_adjustments_run_id_fkey: FOREIGN KEY (run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE
- FK payroll_adjustments_store_id_fkey: FOREIGN KEY (store_id) REFERENCES stores(id)
- policy payroll_adjustments_select SELECT: ((org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR (store_id = auth_store_id())) AND (auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])))
- grants: [{"grantee":"authenticated","p":"SELECT"},{"grantee":"postgres","p":"DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"},{"grantee":"service_role","p":"DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"}]
- rls enabled: [{"relrowsecurity":true}]