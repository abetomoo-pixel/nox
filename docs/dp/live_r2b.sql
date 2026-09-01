-- live_r2b.sql — R-2b 段0 live 逐語（2026-08-31・裁定100 §F）
-- 貼り先証明: {"p":"nox-project-proof","n":3}

-- ═══ (a) check_nominations ═══
--   id uuid NOT NULL DEFAULT gen_random_uuid()
--   org_id uuid NOT NULL
--   store_id uuid NOT NULL
--   check_id uuid NOT NULL
--   cast_id uuid NOT NULL
--   ratio_weight integer NOT NULL
--   position integer NOT NULL DEFAULT 0
--   created_at timestamp with time zone NOT NULL DEFAULT now()
--   [constraints]
--   c check_nominations_ratio_weight_check: CHECK ((ratio_weight > 0))
--   f check_nominations_cast_id_fkey: FOREIGN KEY (cast_id) REFERENCES casts(id)
--   f check_nominations_check_id_fkey: FOREIGN KEY (check_id) REFERENCES checks(id)
--   f check_nominations_org_id_fkey: FOREIGN KEY (org_id) REFERENCES orgs(id)
--   f check_nominations_store_id_fkey: FOREIGN KEY (store_id) REFERENCES stores(id)
--   p check_nominations_pkey: PRIMARY KEY (id)
--   u check_nominations_check_id_cast_id_key: UNIQUE (check_id, cast_id)
--   [indexes]
--   CREATE UNIQUE INDEX check_nominations_check_id_cast_id_key ON public.check_nominations USING btree (check_id, cast_id)
--   CREATE INDEX check_nominations_check_idx ON public.check_nominations USING btree (check_id, "position")
--   CREATE INDEX check_nominations_org_idx ON public.check_nominations USING btree (org_id)
--   CREATE UNIQUE INDEX check_nominations_pkey ON public.check_nominations USING btree (id)

-- ═══ (a) checks ═══
--   id uuid NOT NULL DEFAULT gen_random_uuid()
--   org_id uuid NOT NULL
--   store_id uuid NOT NULL
--   seat_id uuid NOT NULL
--   status text NOT NULL DEFAULT 'open'::text
--   started_at timestamp with time zone NOT NULL DEFAULT now()
--   people integer NULL
--   nom_type text NOT NULL DEFAULT 'free'::text
--   customer_id uuid NULL
--   merged_into uuid NULL
--   total integer NOT NULL DEFAULT 0
--   service_rate integer NOT NULL
--   round_unit integer NOT NULL
--   round_mode text NOT NULL
--   close_idem_key uuid NULL
--   closed_at timestamp with time zone NULL
--   voided_at timestamp with time zone NULL
--   voided_by uuid NULL
--   void_reason text NULL
--   created_by uuid NOT NULL
--   created_at timestamp with time zone NOT NULL DEFAULT now()
--   updated_at timestamp with time zone NOT NULL DEFAULT now()
--   set_min integer NOT NULL DEFAULT 60
--   set_fee integer NOT NULL DEFAULT 0
--   ext_min integer NOT NULL DEFAULT 30
--   ext_fee integer NOT NULL DEFAULT 0
--   time_per text NOT NULL DEFAULT 'table'::text
--   dohan_fee integer NULL
--   ext_menu_snap jsonb NULL
--   business_tax_status text NOT NULL DEFAULT 'taxable'::text
--   price_display text NOT NULL DEFAULT 'tax_included'::text
--   tax_rounding text NOT NULL DEFAULT 'floor'::text
--   [constraints]
--   c checks_business_tax_status_check: CHECK ((business_tax_status = ANY (ARRAY['taxable'::text, 'exempt'::text])))
--   c checks_dohan_fee_check: CHECK (((dohan_fee IS NULL) OR (dohan_fee >= 0)))
--   c checks_ext_fee_check: CHECK ((ext_fee >= 0))
--   c checks_ext_min_check: CHECK ((ext_min >= 1))
--   c checks_nom_type_check: CHECK ((nom_type = ANY (ARRAY['hon'::text, 'jonai'::text, 'dohan'::text, 'free'::text])))
--   c checks_people_check: CHECK (((people IS NULL) OR (people > 0)))
--   c checks_price_display_check: CHECK ((price_display = ANY (ARRAY['tax_included'::text, 'tax_excluded'::text])))
--   c checks_round_mode_check: CHECK ((round_mode = ANY (ARRAY['up'::text, 'down'::text, 'round'::text])))
--   c checks_round_unit_check: CHECK ((round_unit >= 1))
--   c checks_service_rate_check: CHECK ((service_rate >= 0))
--   c checks_set_fee_check: CHECK ((set_fee >= 0))
--   c checks_set_min_check: CHECK ((set_min >= 1))
--   c checks_status_check: CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'void'::text])))
--   c checks_tax_rounding_check: CHECK ((tax_rounding = ANY (ARRAY['floor'::text, 'round'::text, 'ceil'::text])))
--   c checks_time_per_check: CHECK ((time_per = ANY (ARRAY['table'::text, 'person'::text])))
--   c checks_total_check: CHECK ((total >= 0))
--   f checks_created_by_fkey: FOREIGN KEY (created_by) REFERENCES users(id)
--   f checks_customer_fk: FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
--   f checks_merged_into_fkey: FOREIGN KEY (merged_into) REFERENCES checks(id)
--   f checks_org_id_fkey: FOREIGN KEY (org_id) REFERENCES orgs(id)
--   f checks_seat_id_fkey: FOREIGN KEY (seat_id) REFERENCES seats(id)
--   f checks_store_id_fkey: FOREIGN KEY (store_id) REFERENCES stores(id)
--   f checks_voided_by_fkey: FOREIGN KEY (voided_by) REFERENCES users(id)
--   p checks_pkey: PRIMARY KEY (id)
--   [indexes]
--   CREATE UNIQUE INDEX checks_one_open_per_seat ON public.checks USING btree (seat_id) WHERE (status = 'open'::text)
--   CREATE INDEX checks_org_idx ON public.checks USING btree (org_id)
--   CREATE UNIQUE INDEX checks_pkey ON public.checks USING btree (id)
--   CREATE INDEX checks_store_started_idx ON public.checks USING btree (store_id, started_at)
--   CREATE INDEX checks_store_status_idx ON public.checks USING btree (store_id, status)

-- ═══ (a) check_lines ═══
--   id uuid NOT NULL DEFAULT gen_random_uuid()
--   org_id uuid NOT NULL
--   store_id uuid NOT NULL
--   check_id uuid NOT NULL
--   product_id uuid NULL
--   kind text NOT NULL
--   pay_group text NOT NULL DEFAULT 'A'::text
--   name_snapshot text NOT NULL
--   unit_price_snapshot integer NOT NULL
--   qty integer NOT NULL
--   line_total integer NOT NULL
--   back_snapshot jsonb NULL
--   sort_order integer NOT NULL DEFAULT 0
--   created_at timestamp with time zone NOT NULL DEFAULT now()
--   time_auto boolean NOT NULL DEFAULT false
--   fee_kind text NULL
--   cast_id uuid NULL
--   block_no integer NULL
--   tax_category text NOT NULL DEFAULT 'taxable_10'::text
--   [constraints]
--   c check_lines_fee_kind_check: CHECK (((fee_kind IS NULL) OR (fee_kind = ANY (ARRAY['set'::text, 'extension'::text, 'dohan'::text, 'hon_shimei'::text, 'jonai_shimei'::text]))))
--   c check_lines_kind_check: CHECK ((kind = ANY (ARRAY['set'::text, 'time'::text, 'charge'::text, 'drink'::text, 'champ'::text, 'bottle'::text, 'custom'::text, 'discount'::text])))
--   c check_lines_line_total_check: CHECK ((line_total >= 0))
--   c check_lines_pay_group_check: CHECK (((length(pay_group) >= 1) AND (length(pay_group) <= 20)))
--   c check_lines_qty_check: CHECK ((qty > 0))
--   c check_lines_tax_category_check: CHECK ((tax_category = ANY (ARRAY['taxable_10'::text, 'taxable_8'::text, 'exempt'::text, 'out_of_scope'::text])))
--   c check_lines_unit_price_snapshot_check: CHECK ((unit_price_snapshot >= 0))
--   f check_lines_cast_id_fkey: FOREIGN KEY (cast_id) REFERENCES casts(id)
--   f check_lines_check_id_fkey: FOREIGN KEY (check_id) REFERENCES checks(id)
--   f check_lines_org_id_fkey: FOREIGN KEY (org_id) REFERENCES orgs(id)
--   f check_lines_product_id_fkey: FOREIGN KEY (product_id) REFERENCES products(id)
--   f check_lines_store_id_fkey: FOREIGN KEY (store_id) REFERENCES stores(id)
--   p check_lines_pkey: PRIMARY KEY (id)
--   [indexes]
--   CREATE INDEX check_lines_cast_idx ON public.check_lines USING btree (cast_id) WHERE (cast_id IS NOT NULL)
--   CREATE INDEX check_lines_check_idx ON public.check_lines USING btree (check_id, sort_order)
--   CREATE UNIQUE INDEX check_lines_one_time_auto ON public.check_lines USING btree (check_id, fee_kind, block_no) WHERE time_auto
--   CREATE INDEX check_lines_org_idx ON public.check_lines USING btree (org_id)
--   CREATE UNIQUE INDEX check_lines_pkey ON public.check_lines USING btree (id)

-- ═══ (a) stores ═══
--   id uuid NOT NULL DEFAULT gen_random_uuid()
--   org_id uuid NOT NULL
--   name text NOT NULL
--   short text NULL
--   open_time text NULL
--   settings_json jsonb NOT NULL DEFAULT '{}'::jsonb
--   created_at timestamp with time zone NOT NULL DEFAULT now()
--   updated_at timestamp with time zone NOT NULL DEFAULT now()
--   hon_fee integer NOT NULL DEFAULT 0
--   jonai_fee integer NOT NULL DEFAULT 0
--   dohan_fee integer NOT NULL DEFAULT 0
--   service_rate integer NOT NULL DEFAULT 10
--   card_tax_rate integer NOT NULL DEFAULT 5
--   round_unit integer NOT NULL DEFAULT 100
--   round_mode text NOT NULL DEFAULT 'down'::text
--   set_min integer NOT NULL DEFAULT 60
--   set_fee integer NOT NULL DEFAULT 0
--   ext_min integer NOT NULL DEFAULT 30
--   ext_fee integer NOT NULL DEFAULT 0
--   time_mode text NOT NULL DEFAULT 'manual'::text
--   time_per text NOT NULL DEFAULT 'table'::text
--   business_tax_status text NOT NULL DEFAULT 'taxable'::text
--   price_display text NOT NULL DEFAULT 'tax_included'::text
--   invoice_status text NOT NULL DEFAULT 'unregistered'::text
--   invoice_reg_no text NULL
--   tax_rounding text NOT NULL DEFAULT 'floor'::text
--   card_surcharge_rate integer NULL
--   receivable_policy text NOT NULL DEFAULT 'customer_only'::text
--   [constraints]
--   c stores_business_tax_status_check: CHECK ((business_tax_status = ANY (ARRAY['taxable'::text, 'exempt'::text])))
--   c stores_card_surcharge_rate_check: CHECK (((card_surcharge_rate IS NULL) OR ((card_surcharge_rate >= 1) AND (card_surcharge_rate <= 100))))
--   c stores_card_tax_rate_check: CHECK (((card_tax_rate >= 0) AND (card_tax_rate <= 100)))
--   c stores_dohan_fee_check: CHECK ((dohan_fee >= 0))
--   c stores_ext_fee_check: CHECK ((ext_fee >= 0))
--   c stores_ext_min_check: CHECK (((ext_min >= 1) AND (ext_min <= 1440)))
--   c stores_hon_fee_check: CHECK ((hon_fee >= 0))
--   c stores_invoice_reg_no_check: CHECK (((invoice_reg_no IS NULL) OR (invoice_reg_no ~ '^T[0-9]{13}$'::text)))
--   c stores_invoice_requires_taxable: CHECK (((invoice_status <> 'registered'::text) OR (business_tax_status = 'taxable'::text)))
--   c stores_invoice_status_check: CHECK ((invoice_status = ANY (ARRAY['registered'::text, 'unregistered'::text])))
--   c stores_jonai_fee_check: CHECK ((jonai_fee >= 0))
--   c stores_price_display_check: CHECK ((price_display = ANY (ARRAY['tax_included'::text, 'tax_excluded'::text])))
--   c stores_receivable_policy_check: CHECK ((receivable_policy = ANY (ARRAY['disabled'::text, 'customer_only'::text, 'cast_liability_allowed'::text])))
--   c stores_round_mode_check: CHECK ((round_mode = ANY (ARRAY['up'::text, 'down'::text, 'round'::text])))
--   c stores_round_unit_check: CHECK (((round_unit >= 1) AND (round_unit <= 10000)))
--   c stores_service_rate_check: CHECK (((service_rate >= 0) AND (service_rate <= 100)))
--   c stores_set_fee_check: CHECK ((set_fee >= 0))
--   c stores_set_min_check: CHECK (((set_min >= 1) AND (set_min <= 1440)))
--   c stores_tax_rounding_check: CHECK ((tax_rounding = ANY (ARRAY['floor'::text, 'round'::text, 'ceil'::text])))
--   c stores_time_mode_check: CHECK ((time_mode = ANY (ARRAY['manual'::text, 'auto'::text])))
--   c stores_time_per_check: CHECK ((time_per = ANY (ARRAY['table'::text, 'person'::text])))
--   f stores_org_id_fkey: FOREIGN KEY (org_id) REFERENCES orgs(id)
--   p stores_pkey: PRIMARY KEY (id)
--   [indexes]
--   CREATE INDEX stores_org_id_idx ON public.stores USING btree (org_id)
--   CREATE UNIQUE INDEX stores_pkey ON public.stores USING btree (id)

-- ═══ (b)(c) check_set_nominations — pronargs=3 args=(p_check_id uuid, p_nom_type text, p_nominations jsonb) proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.check_set_nominations(p_check_id uuid, p_nom_type text, p_nominations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_after jsonb;
  v_elem jsonb; v_cast record; v_w numeric; v_pos int := 0; v_cast_id uuid;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  if p_nominations is null or jsonb_typeof(p_nominations) <> 'array' then raise exception 'bad nominations'; end if;
  select * into v_chk from public.checks where id = p_check_id;
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
  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  v_before := jsonb_build_object('nom_type', v_chk.nom_type, 'nominations',
    (select coalesce(jsonb_agg(jsonb_build_object('cast_id', cast_id, 'weight', ratio_weight) order by position), '[]'::jsonb)
       from public.check_nominations where check_id = p_check_id));

  delete from public.check_nominations where check_id = p_check_id;
  for v_elem in select * from jsonb_array_elements(p_nominations)
  loop
    if jsonb_typeof(v_elem) <> 'object' then raise exception 'bad nominations'; end if;
    if jsonb_typeof(v_elem -> 'weight') is distinct from 'number' then raise exception 'bad weight'; end if;
    v_w := (v_elem ->> 'weight')::numeric;
    if v_w < 1 or v_w <> trunc(v_w) then raise exception 'bad weight'; end if;
    if p_nom_type = 'free' and v_w <> 1 then raise exception 'bad weight'; end if; -- free は均等（モック準拠）
    v_cast_id := (v_elem ->> 'cast_id')::uuid;
    select * into v_cast from public.casts where id = v_cast_id;
    if v_cast.id is null or v_cast.org_id <> v_org
       or v_cast.store_id <> v_chk.store_id or not v_cast.is_active then
      raise exception 'bad cast';
    end if;
    insert into public.check_nominations (org_id, store_id, check_id, cast_id, ratio_weight, position)
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_id, v_w::int, v_pos);
    v_pos := v_pos + 1;
  end loop;
  update public.checks set nom_type = p_nom_type where id = p_check_id;

  v_after := jsonb_build_object('nom_type', p_nom_type, 'nominations', p_nominations);
  perform public.audit_log_write('check_set_nominations', 'checks:' || p_check_id::text,
    v_before, v_after, v_chk.store_id);
end $function$


-- ═══ (b)(c) check_dohan_add — pronargs=2 args=(p_check_id uuid, p_count integer) proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.check_dohan_add(p_check_id uuid, p_count integer DEFAULT 1)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_id uuid; v_sort int; v_paycnt int; v_price int;
  v_org uuid;
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_count is null or p_count <= 0 then raise exception 'bad count'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3)型: kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- 入金後に合計が動く経路を塞ぐ（check_time_charge_apply と同じ保守側）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;

  select coalesce(v_chk.dohan_fee, st.dohan_fee) into v_price
    from public.stores st where st.id = v_chk.store_id;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, fee_kind, cast_id)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
          '同伴料', v_price, p_count, v_price * p_count, null, v_sort, 'dohan', null)
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_dohan_add', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$


-- ═══ (b)(c) get_cast_sales — pronargs=3 args=(p_store_id uuid, p_from date, p_to date) proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.get_cast_sales(p_store_id uuid, p_from date, p_to date)
 RETURNS TABLE(cast_id uuid, biz_date date, sales integer, hon integer, jonai integer, dohan integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid;
  v_role text;
  v_self uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select s.org_id into v_org from public.stores s where s.id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- owner は org 全店・manager/cast は自店のみ
  if not (public.auth_role() = 'owner' or p_store_id = public.auth_store_id()) then
    raise exception 'forbidden';
  end if;
  v_role := public.auth_role();
  if v_role = 'staff' then raise exception 'forbidden'; end if; -- D6a: cast 別金額は castMng 領域
  if v_role not in ('owner','manager','cast') then raise exception 'forbidden'; end if;

  if v_role = 'cast' then
    v_self := public.auth_cast_id();
    if v_self is null then raise exception 'forbidden'; end if; -- fail-closed
    return query
      select a.cast_id, a.biz_date, a.sales, a.hon, a.jonai, a.dohan
      from public.cast_sales_aggregate(p_store_id, p_from, p_to) a
      where a.cast_id = v_self;
  else
    return query
      select a.cast_id, a.biz_date, a.sales, a.hon, a.jonai, a.dohan
      from public.cast_sales_aggregate(p_store_id, p_from, p_to) a;
  end if;
end $function$


-- ═══ (b)(c) check_close — pronargs=2 args=(p_check_id uuid, p_idem_key uuid) proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.check_close(p_check_id uuid, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_g record; v_due int; v_paid int; v_lines int;
  v_cast_ids uuid[]; v_weights int[]; v_n int; v_sumw int := 0;
  v_drink int[]; v_champ int[]; v_bottle int[]; v_pt int[];
  v_alloc int[]; v_rem int[]; v_used boolean[];
  v_line record; v_unit int; v_rest int; v_best int; i int; c int;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select * into v_chk from public.checks where id = p_check_id;
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

  -- 全 group 充足（∀g: paid(g) ≥ due(g)）＋ total 確定
  perform public.check_recalc(p_check_id);
  for v_g in select distinct pay_group from public.check_lines where check_id = p_check_id
  loop
    v_due := public.check_group_due(p_check_id, v_g.pay_group);
    select coalesce(sum(amount), 0)::int into v_paid
      from public.payments where check_id = p_check_id and pay_group = v_g.pay_group;
    if v_paid < v_due then raise exception 'balance remaining'; end if;
  end loop;
  v_before := to_jsonb(v_chk);

  -- 分配（最大剰余法・精密仕様 §2.2.1・back_snapshot 凍結値・pt は nom_type='hon' のみ）
  select array_agg(cast_id order by position, created_at, id),
         array_agg(ratio_weight order by position, created_at, id)
    into v_cast_ids, v_weights
    from public.check_nominations where check_id = p_check_id;
  if v_cast_ids is not null then
    v_n := array_length(v_cast_ids, 1);
    for i in 1..v_n loop v_sumw := v_sumw + v_weights[i]; end loop;
    v_drink := array_fill(0, array[v_n]); v_champ := array_fill(0, array[v_n]);
    v_bottle := array_fill(0, array[v_n]); v_pt := array_fill(0, array[v_n]);
    for v_line in
      select * from public.check_lines
       where check_id = p_check_id and product_id is not null
         and kind in ('drink','champ','bottle') and back_snapshot is not null
         -- ★mig0070: キャストドリンクは按分から除外（凍結値で判定・キー無し=false=按分対象）
         and coalesce((check_lines.back_snapshot ->> 'back_exempt')::boolean, false) = false
    loop
      -- 分配単価（productBackOf と同一規則・凍結値）
      if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
        v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> v_chk.nom_type)::int, 0);
      else
        v_unit := round(v_line.unit_price_snapshot
                        * coalesce((v_line.back_snapshot ->> 'back_value')::numeric, 0) / 100.0)::int;
      end if;
      -- 数量の最大剰余法分配（床=整数除算・剰余降順→position 昇順）
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
      -- 集計
      for i in 1..v_n loop
        if v_alloc[i] > 0 then
          if v_line.kind = 'drink'  then v_drink[i]  := v_drink[i]  + v_unit * v_alloc[i]; end if;
          if v_line.kind = 'champ'  then v_champ[i]  := v_champ[i]  + v_unit * v_alloc[i]; end if;
          if v_line.kind = 'bottle' then v_bottle[i] := v_bottle[i] + v_unit * v_alloc[i]; end if;
          if v_chk.nom_type = 'hon' then
            v_pt[i] := v_pt[i] + coalesce((v_line.back_snapshot ->> 'hon_pt')::int, 0) * v_alloc[i];
          end if;
        end if;
      end loop;
    end loop;
    for i in 1..v_n loop
      if v_drink[i] + v_champ[i] + v_bottle[i] + v_pt[i] > 0 then
        insert into public.check_cast_backs
          (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc)
        values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                v_drink[i], v_champ[i], v_bottle[i], v_pt[i]);
      end if;
    end loop;
  end if;

  update public.checks
     set status = 'closed', closed_at = now(), close_idem_key = p_idem_key
   where id = p_check_id;
  -- ★mig0053（B1 相席・transient）: 追加席の占有を解放（解放経路＝ロック不要・money 非干渉）
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_close', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
  return p_check_id;
end $function$


-- ═══ (d) check_lines 指名料行の重複 ═══
-- check_lines の void 系列: []（無ければ親 checks.status='void' が唯一の void 表現）
-- (check_id, cast_id, fee_kind) 重複: 4 組
--   dup: check=a0af3380-b909-46f0-863e-7e7fbd067bc5 cast=adef8957-b005-44af-9e40-0547c5bcef9f kind=jonai_shimei n=4
--   dup: check=a0af3380-b909-46f0-863e-7e7fbd067bc5 cast=78b7b932-5407-418c-a11e-d3cdfa004698 kind=jonai_shimei n=2
--   dup: check=a0af3380-b909-46f0-863e-7e7fbd067bc5 cast=e10e272d-4fbc-48f0-b552-826c5c5b866b kind=jonai_shimei n=2
--   dup: check=eb79138f-9fde-4c6e-aae6-7b11c6eba582 cast=78b7b932-5407-418c-a11e-d3cdfa004698 kind=jonai_shimei n=2

-- ═══ (e) check_nominations (check_id, cast_id) 重複 ═══
-- 重複: 0 組

-- ═══ (f) 分布 ═══
-- checks.nom_type 分布: [{"nom_type":"dohan","n":11},{"nom_type":"free","n":34},{"nom_type":"hon","n":15},{"nom_type":"jonai","n":11}]
-- fee_kind='dohan' 行: 全 1 件・うち cast_id null = 1 件

-- ══════════════════════════════════════════════════════════
-- 0119 底本の追加取得（2026-08-31・貼り先証明: {"p":"nox-project-proof","n":3}）
-- ══════════════════════════════════════════════════════════

-- (1) prosrc に nom_type を含む関数: 14 本
--   cast_sales_aggregate
--   check_close
--   check_open
--   check_set_nominations
--   daily_report_aggregate
--   drink_claim_decide
--   drink_claim_submit_proxy
--   get_cast_customer_ranking
--   get_cast_ranking
--   get_store_nom_counts
--   kiosk_check_detail
--   reservation_create
--   reservation_to_check
--   reservation_update

-- ═══ (2) cast_sales_aggregate — pronargs=3 args=(p_store_id uuid, p_from date, p_to date) proacl={postgres=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.cast_sales_aggregate(p_store_id uuid, p_from date, p_to date)
 RETURNS TABLE(cast_id uuid, biz_date date, sales integer, hon integer, jonai integer, dohan integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid;
  v_settings jsonb;
  v_cutoff   text;
begin
  if p_from is null or p_to is null or p_from > p_to then raise exception 'bad range'; end if;
  if p_to - p_from > 92 then raise exception 'bad range'; end if; -- 給与期間の常識的上限（四半期）
  select s.org_id, s.settings_json into v_org, v_settings from public.stores s where s.id = p_store_id;
  if v_org is null then raise exception 'not found'; end if;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;

  return query
  with target_checks as (
    -- SL6a: closed のみ（void/open 除外）。SL5a: biz_date=(JST(started_at)−cutoff)::date【2】
    select c.id as check_id,
           c.nom_type,
           (timezone('Asia/Tokyo', c.started_at) - (v_cutoff || ':00')::interval)::date as bdate
    from public.checks c
    where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
      and (timezone('Asia/Tokyo', c.started_at) - (v_cutoff || ':00')::interval)::date between p_from and p_to
  ),
  noms as (
    -- SL4a: nomination の無い伝票（フリー卓）はここで自然に脱落＝非帰属
    select n.check_id, n.cast_id as cid, n.ratio_weight, n.position
    from public.check_nominations n
    join target_checks tc on tc.check_id = n.check_id
    where n.org_id = v_org
  ),
  wsum as (
    select nm.check_id, sum(nm.ratio_weight)::bigint as w_total
    from noms nm group by nm.check_id
  ),
  groups as (
    -- SL2a: 金額基盤＝group due（check_group_due 再利用・サ料込・100円丸め後・カードTAX 非含）
    select tc.check_id, tc.bdate, l.pay_group,
           public.check_group_due(tc.check_id, l.pay_group) as due
    from target_checks tc
    join (select distinct cl.check_id, cl.pay_group from public.check_lines cl where cl.org_id = v_org) l
      on l.check_id = tc.check_id
  ),
  alloc as (
    -- SL1a: weight 按分・整数演算のみ【1】 base=div(due×w, W)・rem=(due×w) mod W
    select g.check_id, g.bdate, g.pay_group, nm.cid,
           ((g.due::bigint * nm.ratio_weight) / ws.w_total)::int  as base_part,
           ((g.due::bigint * nm.ratio_weight) % ws.w_total)       as rem_part,
           nm.position,
           g.due
    from groups g
    join noms nm on nm.check_id = g.check_id
    join wsum ws on ws.check_id = g.check_id
    where g.due > 0 and ws.w_total > 0 -- 全 weight 0 は按分不能＝除算ガード（set_nominations は weight>=1 を強制済み）
  ),
  ranked as (
    select a.*,
           row_number() over (partition by a.check_id, a.pay_group
                              order by a.rem_part desc, a.position asc) as rk,
           a.due - sum(a.base_part) over (partition by a.check_id, a.pay_group) as remainder_units
    from alloc a
  ),
  parts as (
    select r.cid, r.bdate,
           r.base_part + case when r.rk <= r.remainder_units then 1 else 0 end as part
    from ranked r
  ),
  sales_by_day as (
    select p.cid, p.bdate, sum(p.part)::int as sales_sum
    from parts p group by p.cid, p.bdate
  ),
  counts_by_day as (
    -- SL8a/D9a: 伝票単位カウント（distinct check）・nom_type は checks 側・attendance 不参加
    select nm.cid, tc.bdate,
           count(distinct tc.check_id) filter (where tc.nom_type = 'hon')::int   as hon_cnt,
           count(distinct tc.check_id) filter (where tc.nom_type = 'jonai')::int as jonai_cnt,
           count(distinct tc.check_id) filter (where tc.nom_type = 'dohan')::int as dohan_cnt
    from noms nm
    join target_checks tc on tc.check_id = nm.check_id
    group by nm.cid, tc.bdate
  )
  select coalesce(s.cid, k.cid),
         coalesce(s.bdate, k.bdate),
         coalesce(s.sales_sum, 0),
         coalesce(k.hon_cnt, 0),
         coalesce(k.jonai_cnt, 0),
         coalesce(k.dohan_cnt, 0)
  from sales_by_day s
  full outer join counts_by_day k on k.cid = s.cid and k.bdate = s.bdate
  order by 2, 1;
end $function$


-- ═══ (2) check_close — pronargs=2 args=(p_check_id uuid, p_idem_key uuid) proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.check_close(p_check_id uuid, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_g record; v_due int; v_paid int; v_lines int;
  v_cast_ids uuid[]; v_weights int[]; v_n int; v_sumw int := 0;
  v_drink int[]; v_champ int[]; v_bottle int[]; v_pt int[];
  v_alloc int[]; v_rem int[]; v_used boolean[];
  v_line record; v_unit int; v_rest int; v_best int; i int; c int;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select * into v_chk from public.checks where id = p_check_id;
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

  -- 全 group 充足（∀g: paid(g) ≥ due(g)）＋ total 確定
  perform public.check_recalc(p_check_id);
  for v_g in select distinct pay_group from public.check_lines where check_id = p_check_id
  loop
    v_due := public.check_group_due(p_check_id, v_g.pay_group);
    select coalesce(sum(amount), 0)::int into v_paid
      from public.payments where check_id = p_check_id and pay_group = v_g.pay_group;
    if v_paid < v_due then raise exception 'balance remaining'; end if;
  end loop;
  v_before := to_jsonb(v_chk);

  -- 分配（最大剰余法・精密仕様 §2.2.1・back_snapshot 凍結値・pt は nom_type='hon' のみ）
  select array_agg(cast_id order by position, created_at, id),
         array_agg(ratio_weight order by position, created_at, id)
    into v_cast_ids, v_weights
    from public.check_nominations where check_id = p_check_id;
  if v_cast_ids is not null then
    v_n := array_length(v_cast_ids, 1);
    for i in 1..v_n loop v_sumw := v_sumw + v_weights[i]; end loop;
    v_drink := array_fill(0, array[v_n]); v_champ := array_fill(0, array[v_n]);
    v_bottle := array_fill(0, array[v_n]); v_pt := array_fill(0, array[v_n]);
    for v_line in
      select * from public.check_lines
       where check_id = p_check_id and product_id is not null
         and kind in ('drink','champ','bottle') and back_snapshot is not null
         -- ★mig0070: キャストドリンクは按分から除外（凍結値で判定・キー無し=false=按分対象）
         and coalesce((check_lines.back_snapshot ->> 'back_exempt')::boolean, false) = false
    loop
      -- 分配単価（productBackOf と同一規則・凍結値）
      if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
        v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> v_chk.nom_type)::int, 0);
      else
        v_unit := round(v_line.unit_price_snapshot
                        * coalesce((v_line.back_snapshot ->> 'back_value')::numeric, 0) / 100.0)::int;
      end if;
      -- 数量の最大剰余法分配（床=整数除算・剰余降順→position 昇順）
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
      -- 集計
      for i in 1..v_n loop
        if v_alloc[i] > 0 then
          if v_line.kind = 'drink'  then v_drink[i]  := v_drink[i]  + v_unit * v_alloc[i]; end if;
          if v_line.kind = 'champ'  then v_champ[i]  := v_champ[i]  + v_unit * v_alloc[i]; end if;
          if v_line.kind = 'bottle' then v_bottle[i] := v_bottle[i] + v_unit * v_alloc[i]; end if;
          if v_chk.nom_type = 'hon' then
            v_pt[i] := v_pt[i] + coalesce((v_line.back_snapshot ->> 'hon_pt')::int, 0) * v_alloc[i];
          end if;
        end if;
      end loop;
    end loop;
    for i in 1..v_n loop
      if v_drink[i] + v_champ[i] + v_bottle[i] + v_pt[i] > 0 then
        insert into public.check_cast_backs
          (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc)
        values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                v_drink[i], v_champ[i], v_bottle[i], v_pt[i]);
      end if;
    end loop;
  end if;

  update public.checks
     set status = 'closed', closed_at = now(), close_idem_key = p_idem_key
   where id = p_check_id;
  -- ★mig0053（B1 相席・transient）: 追加席の占有を解放（解放経路＝ロック不要・money 非干渉）
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_close', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
  return p_check_id;
end $function$


-- ═══ (2) check_open — pronargs=5 args=(p_seat_id uuid, p_people integer, p_nom_type text, p_customer_id uuid, p_set_rule_id uuid) proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.check_open(p_seat_id uuid, p_people integer DEFAULT NULL::integer, p_nom_type text DEFAULT 'free'::text, p_customer_id uuid DEFAULT NULL::uuid, p_set_rule_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- ★mig0084: 料金ルール解決（設計書 v1.2・凍結=開栓時）。
  --   now() はトランザクション内不変＝下の insert の started_at (default now()) と
  --   同一時刻＝解決時刻と凍結時刻が厳密に一致（帯境界の競合なし）。
  --   0行＝各変数 null → 下の coalesce で stores フォールバック＝ルール0件の店は
  --   改稿前と完全同値（golden 構造保証）。dohan のみ nullable スナップ
  --   （ルール0件は null 凍結・check_dohan_add 時に stores 現在値へフォールバック）。
  --   ルール一致だが duration_min null の場合は額のみルール・分数は stores 既定。
  select * into r_set from public.pricing_resolve_core(v_seat.store_id, now(), 'set',       v_seat.kind, null);
  select * into r_ext from public.pricing_resolve_core(v_seat.store_id, now(), 'extension', v_seat.kind, null);
  select * into r_doh from public.pricing_resolve_core(v_seat.store_id, now(), 'dohan',     v_seat.kind, null);

  -- ★mig0098 R2-5: 開卓時ルール手動選択（override）。null=自動一致（現行完全互換）。
  --   検証: 同店・fee_kind='set'・is_active（他店/他種/無効は 'bad rule'）。選び直し不可＝
  --   開卓やり直し（void→再開卓）の現行運用（設計書 R2-5）
  if p_set_rule_id is not null then
    select r.amount as amount, r.duration_min as duration_min, r.id as rule_id into r_set
      from public.pricing_rules r
     where r.id = p_set_rule_id and r.store_id = v_seat.store_id
       and r.fee_kind = 'set' and r.is_active;
    if r_set.rule_id is null then raise exception 'bad rule'; end if;
  end if;

  -- ★mig0098 R2-1/R2-2/R2-4: 延長メニュー全件を開栓時に凍結（priority 順・limit なし）。
  --   ★鏡像規律: 下の where は pricing_resolve_core（extension・rank null 呼び）と同一式。
  --     core は limit 1・こちらは全件列挙という差のみ。条件を変えるときは必ず同時改修
  --     （core 側は pin 保全のため不触＝相互参照は本コメントと R2 設計書 v1.1 が正）
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
           'label', '延長 ' || coalesce(r.duration_min, v_seat.ext_min) || '分 ¥' || r.amount)
         order by r.priority asc, r.created_at asc, r.id asc), '[]'::jsonb)
    into v_ext_menu
    from public.pricing_rules r
   where r.store_id = v_seat.store_id
     and r.is_active
     and r.fee_kind = 'extension'
     and (r.seat_kind is null or r.seat_kind = v_seatk)
     and (r.rank_id is null)  -- core は rank null 呼び＝(rank_id is null or rank_id = null) と等価
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

  -- ★0057(4): actor＝operator 優先（checks.created_by NOT NULL を kiosk でも充足）
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  insert into public.checks (org_id, store_id, seat_id, people, nom_type,
                             service_rate, round_unit, round_mode,
                             set_min, set_fee, ext_min, ext_fee, time_per,
                             dohan_fee,
                             created_by, customer_id, ext_menu_snap,
                             business_tax_status, price_display, tax_rounding)  -- ★mig0113
  values (v_org, v_seat.store_id, p_seat_id, p_people, p_nom_type,
          v_rate, v_unit, v_mode,
          v_smin, v_sfee, v_emin, v_efee, v_tper,
          v_dfee,
          v_actor, p_customer_id, v_ext_menu,
          v_bts, v_pd, v_trnd)  -- ★mig0113
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
  v_units := case when v_tper = 'person' then coalesce(p_people, 1) else 1 end;
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
  perform public.audit_log_write('check_open', 'checks:' || v_id::text, null,
    (select to_jsonb(c) from public.checks c where c.id = v_id)
      || case when p_set_rule_id is not null
              then jsonb_build_object('override_rule_id', p_set_rule_id)
              else '{}'::jsonb end,
    v_seat.store_id);
  return v_id;
end $function$


-- ═══ (2) check_set_nominations — pronargs=3 args=(p_check_id uuid, p_nom_type text, p_nominations jsonb) proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.check_set_nominations(p_check_id uuid, p_nom_type text, p_nominations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_after jsonb;
  v_elem jsonb; v_cast record; v_w numeric; v_pos int := 0; v_cast_id uuid;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  if p_nominations is null or jsonb_typeof(p_nominations) <> 'array' then raise exception 'bad nominations'; end if;
  select * into v_chk from public.checks where id = p_check_id;
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
  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  v_before := jsonb_build_object('nom_type', v_chk.nom_type, 'nominations',
    (select coalesce(jsonb_agg(jsonb_build_object('cast_id', cast_id, 'weight', ratio_weight) order by position), '[]'::jsonb)
       from public.check_nominations where check_id = p_check_id));

  delete from public.check_nominations where check_id = p_check_id;
  for v_elem in select * from jsonb_array_elements(p_nominations)
  loop
    if jsonb_typeof(v_elem) <> 'object' then raise exception 'bad nominations'; end if;
    if jsonb_typeof(v_elem -> 'weight') is distinct from 'number' then raise exception 'bad weight'; end if;
    v_w := (v_elem ->> 'weight')::numeric;
    if v_w < 1 or v_w <> trunc(v_w) then raise exception 'bad weight'; end if;
    if p_nom_type = 'free' and v_w <> 1 then raise exception 'bad weight'; end if; -- free は均等（モック準拠）
    v_cast_id := (v_elem ->> 'cast_id')::uuid;
    select * into v_cast from public.casts where id = v_cast_id;
    if v_cast.id is null or v_cast.org_id <> v_org
       or v_cast.store_id <> v_chk.store_id or not v_cast.is_active then
      raise exception 'bad cast';
    end if;
    insert into public.check_nominations (org_id, store_id, check_id, cast_id, ratio_weight, position)
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_id, v_w::int, v_pos);
    v_pos := v_pos + 1;
  end loop;
  update public.checks set nom_type = p_nom_type where id = p_check_id;

  v_after := jsonb_build_object('nom_type', p_nom_type, 'nominations', p_nominations);
  perform public.audit_log_write('check_set_nominations', 'checks:' || p_check_id::text,
    v_before, v_after, v_chk.store_id);
end $function$


-- ═══ (2) daily_report_aggregate — pronargs=4 args=(p_store_id uuid, p_biz_date date, p_cutoff_hm text, p_tax_rate integer) proacl={postgres=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.daily_report_aggregate(p_store_id uuid, p_biz_date date, p_cutoff_hm text, p_tax_rate integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org   uuid;
  v_start timestamptz;
  v_end   timestamptz;
  v jsonb;
begin
  select org_id into v_org from public.stores where id = p_store_id;
  if v_org is null then raise exception 'not found'; end if;
  -- [D cutoff JST, D+1 cutoff JST)
  v_start := ((p_biz_date::text || ' ' || p_cutoff_hm) )::timestamp at time zone 'Asia/Tokyo';
  v_end   := (((p_biz_date + 1)::text || ' ' || p_cutoff_hm))::timestamp at time zone 'Asia/Tokyo';
  select jsonb_build_object(
    'open_checks', (select count(*) from public.checks c
                     where c.org_id = v_org and c.store_id = p_store_id and c.status = 'open'
                       and c.started_at >= v_start and c.started_at < v_end),
    'slips',  (select count(*) from public.checks c
                where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
                  and c.started_at >= v_start and c.started_at < v_end),
    'guests', (select coalesce(sum(c.people), 0) from public.checks c
                where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
                  and c.started_at >= v_start and c.started_at < v_end),
    'dohan_checks', (select count(*) from public.checks c
                where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed' and c.nom_type = 'dohan'
                  and c.started_at >= v_start and c.started_at < v_end),
    'cash',  (select coalesce(sum(p.amount), 0) from public.payments p
               join public.checks c on c.id = p.check_id
               where c.org_id = v_org and p.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and p.method = 'cash'
                 and c.started_at >= v_start and c.started_at < v_end),
    'card',  (select coalesce(sum(p.amount), 0) from public.payments p
               join public.checks c on c.id = p.check_id
               where c.org_id = v_org and p.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and p.method = 'card'
                 and c.started_at >= v_start and c.started_at < v_end),
    'uri',   (select coalesce(sum(p.amount), 0) from public.payments p
               join public.checks c on c.id = p.check_id
               where c.org_id = v_org and p.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and p.method = 'ar'
                 and c.started_at >= v_start and c.started_at < v_end),
    'other', (select coalesce(sum(p.amount), 0) from public.payments p
               join public.checks c on c.id = p.check_id
               where c.org_id = v_org and p.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and p.method = 'other'
                 and c.started_at >= v_start and c.started_at < v_end),
    'drink_sales', (select coalesce(sum(l.line_total), 0) from public.check_lines l
               join public.checks c on c.id = l.check_id
               where c.org_id = v_org and l.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and l.kind in ('drink','champ')
                 and c.started_at >= v_start and c.started_at < v_end),
    -- ★B6（mig0055）: 回収現金（別掲・biz_date 直・method='cash' のみ＝理論在高加算対象）。
    --   checks/payments 非依存＝発生日 uri との二重計上は起きない（別経路・突合は receivables 直 SELECT）。
    'ar_collected', (select coalesce(sum(x.amount), 0) from public.ar_collections x
               where x.org_id = v_org and x.store_id = p_store_id
                 and x.biz_date = p_biz_date and x.method = 'cash')
  ) into v;
  return v || jsonb_build_object('card_tax', round(((v->>'card')::int) * p_tax_rate / 100.0)::int);
end $function$


-- ═══ (2) drink_claim_decide — pronargs=3 args=(p_claim_id uuid, p_approve boolean, p_qty_override integer) proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.drink_claim_decide(p_claim_id uuid, p_approve boolean, p_qty_override integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cl record; v_actor uuid; v_before jsonb; v_qty int; v_nom text; v_prod record; v_unit int; v_back int;
  v_chk_status text;  -- 【F3f】
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_approve is null then raise exception 'bad approve'; end if;
  select * into v_cl from public.drink_claims where id = p_claim_id;
  if v_cl.id is null or v_cl.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if; -- 存在オラクル封じ
  -- 承認は黒服 can_register 以上・自店（代理型＝auth_cast_id チェックなし）
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cl.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_cl.store_id = public.auth_store_id()
              and public.auth_staff_can_register())) then
    raise exception 'forbidden';
  end if;
  if v_cl.status <> 'pending' then raise exception 'already decided'; end if;
  -- 【F3f】void 伝票への事後承認/却下を封じる（open/closed は従来どおり＝close 非依存思想は不変。
  --        check_void が pending を自動 reject するため本ガードは主にレース/残置行の backstop）
  select status into v_chk_status from public.checks where id = v_cl.check_id;
  if v_chk_status = 'void' then raise exception 'check voided'; end if;
  v_before := to_jsonb(v_cl);
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if p_approve then
    -- 杯数修正（承認時訂正・null は申告 qty のまま）
    if p_qty_override is not null then
      if p_qty_override <= 0 then raise exception 'bad qty'; end if;
      v_qty := p_qty_override;
    else
      v_qty := v_cl.qty;
    end if;
    -- ★バック額焼付け（check_close の unit 計算と同一規則・products を承認時点で直読み）
    select nom_type into v_nom from public.checks where id = v_cl.check_id;
    select * into v_prod from public.products where id = v_cl.product_id;
    if v_prod.back_mode = 'unit4' then
      v_unit := coalesce((v_prod.unit4_json ->> v_nom)::int, 0);                             -- unit4[nom_type]（check_close 同一）
    else
      v_unit := round(v_prod.price * coalesce(v_prod.back_value, 0)::numeric / 100.0)::int;  -- rate（check_close 同一）
    end if;
    v_back := v_unit * v_qty;
    update public.drink_claims
       set status = 'approved', qty = v_qty, back_amount = v_back, decided_by = v_actor, decided_at = now()
     where id = p_claim_id;
    perform public.audit_log_write('drink_claim_approve', 'drink_claims:' || p_claim_id::text, v_before,
      (select to_jsonb(d) from public.drink_claims d where d.id = p_claim_id), v_cl.store_id);
  else
    update public.drink_claims
       set status = 'rejected', decided_by = v_actor, decided_at = now()
     where id = p_claim_id;
    perform public.audit_log_write('drink_claim_reject', 'drink_claims:' || p_claim_id::text, v_before,
      (select to_jsonb(d) from public.drink_claims d where d.id = p_claim_id), v_cl.store_id);
  end if;
end $function$


-- ═══ (2) drink_claim_submit_proxy — pronargs=2 args=(p_line_id uuid, p_cast_id uuid) proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.drink_claim_submit_proxy(p_line_id uuid, p_cast_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line record; v_chk record; v_cast record;
  v_actor uuid; v_unit int; v_back int; v_id uuid;
begin
  -- 冒頭 null ガード。kiosk 腕を意図的に持たない＝0059 非開示原則
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;

  select * into v_line from public.check_lines where id = p_line_id;
  if v_line.id is null or v_line.org_id <> public.auth_org_id() then
    raise exception 'forbidden';  -- 存在オラクル封じ
  end if;

  select * into v_chk from public.checks where id = v_line.check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;

  -- 黒服 can_register 以上（cast 腕なし＝代理起票は店側の行為）
  if (public.auth_role() = 'owner'
      or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
      or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
          and public.auth_staff_can_register())) is not true then
    raise exception 'forbidden';
  end if;

  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  if v_line.product_id is null or v_line.back_snapshot is null
     or v_line.kind not in ('drink','champ','bottle') then
    raise exception 'bad line';
  end if;

  -- ★mig0070: 経路排他の判定を凍結値へ（products の現価は読まない）
  if coalesce((v_line.back_snapshot ->> 'back_exempt')::boolean, false) is not true then
    raise exception 'not exempt product';
  end if;

  if exists (select 1 from public.drink_claims d
              where d.check_line_id = v_line.id and d.status = 'approved') then
    raise exception 'already claimed';
  end if;

  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id()
     or v_cast.store_id <> v_chk.store_id or not v_cast.is_active then
    raise exception 'bad cast';
  end if;

  -- ★焼付け＝伝票凍結値（check_close と同一の真実。マスタ現価では読まない）
  if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
    v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> v_chk.nom_type)::int, 0);
  else
    v_unit := round(v_line.unit_price_snapshot
                    * coalesce((v_line.back_snapshot ->> 'back_value')::numeric, 0) / 100.0)::int;
  end if;
  v_back := v_unit * v_line.qty;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  insert into public.drink_claims
    (org_id, store_id, check_id, check_line_id, cast_id, product_id, qty, back_amount,
     status, requested_by, decided_by, decided_at)
  values
    (v_chk.org_id, v_chk.store_id, v_chk.id, v_line.id, p_cast_id, v_line.product_id,
     v_line.qty, v_back, 'approved', v_actor, v_actor, now())
  returning id into v_id;

  perform public.audit_log_write('drink_claim_submit_proxy', 'drink_claims:' || v_id::text, null,
    (select to_jsonb(d) from public.drink_claims d where d.id = v_id), v_chk.store_id);
  return v_id;
end $function$


-- ═══ (2) get_cast_customer_ranking — pronargs=3 args=(p_store_id uuid, p_period text, p_cast_id uuid) proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.get_cast_customer_ranking(p_store_id uuid, p_period text, p_cast_id uuid)
 RETURNS TABLE(customer_id uuid, customer_name text, hon_count integer, jonai_count integer, dohan_count integer, total_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid;
  v_role     text;
  v_settings jsonb;
  v_cutoff   text;
  v_first    date;
  v_start    timestamptz;
  v_end      timestamptz;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_period is null or p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  select s.org_id, s.settings_json into v_org, v_settings from public.stores s where s.id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- owner は org 全店・manager は自店のみ
  if not (public.auth_role() = 'owner' or p_store_id = public.auth_store_id()) then
    raise exception 'forbidden';
  end if;
  v_role := public.auth_role();
  if v_role = 'staff' then raise exception 'forbidden'; end if;       -- D6a: cast 別客データは castMng 領域
  if v_role not in ('owner','manager') then raise exception 'forbidden'; end if;  -- cast 本人も初版は不可
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;
  select pb.period_start into v_first from public.period_bounds(p_period) pb;  -- ★写像単一ソース（get_cast_ranking と同一）
  v_start := ((v_first::text || ' ' || v_cutoff))::timestamp at time zone 'Asia/Tokyo';
  v_end   := ((((v_first + interval '1 month')::date)::text || ' ' || v_cutoff))::timestamp at time zone 'Asia/Tokyo';

  return query
  with nom_counts as (
    select c.customer_id as cust,
           count(*) filter (where c.nom_type = 'hon')   as hon,
           count(*) filter (where c.nom_type = 'jonai') as jonai,
           count(*) filter (where c.nom_type = 'dohan') as dohan
    from public.check_nominations n
    join public.checks c on c.id = n.check_id
    where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
      and c.started_at >= v_start and c.started_at < v_end
      and n.org_id = v_org
      and n.cast_id = p_cast_id                    -- ★対象 cast 絞り
      and c.customer_id is not null                -- ★客なし指名は脱落
    group by c.customer_id
  )
  select nc.cust,
         cu.name,
         coalesce(nc.hon, 0)::int,
         coalesce(nc.jonai, 0)::int,
         coalesce(nc.dohan, 0)::int,
         (coalesce(nc.hon, 0) + coalesce(nc.jonai, 0) + coalesce(nc.dohan, 0))::int as total_count
  from nom_counts nc
  join public.customers cu on cu.id = nc.cust    -- 客名解決（is_active 不問・過去/休眠客も名前表示）
  order by (coalesce(nc.hon, 0) + coalesce(nc.jonai, 0) + coalesce(nc.dohan, 0)) desc,
           cu.name asc;
end $function$


-- ═══ (2) get_cast_ranking — pronargs=2 args=(p_store_id uuid, p_period text) proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.get_cast_ranking(p_store_id uuid, p_period text)
 RETURNS TABLE(rank integer, cast_id uuid, cast_name text, hon_count integer, jonai_count integer, dohan_count integer, is_self boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid;
  v_settings jsonb;
  v_cutoff   text;
  v_first    date;
  v_start    timestamptz;
  v_end      timestamptz;
  v_self     uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_period is null or p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  select s.org_id, s.settings_json into v_org, v_settings from public.stores s where s.id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- cast/staff/manager は自店のみ・owner は org 全店
  if not (public.auth_role() = 'owner' or p_store_id = public.auth_store_id()) then
    raise exception 'forbidden';
  end if;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;
  select pb.period_start into v_first from public.period_bounds(p_period) pb; -- ★写像単一ソース（1行差し替え）
  v_start := ((v_first::text || ' ' || v_cutoff))::timestamp at time zone 'Asia/Tokyo';
  v_end   := ((((v_first + interval '1 month')::date)::text || ' ' || v_cutoff))::timestamp at time zone 'Asia/Tokyo';
  v_self  := public.auth_cast_id();

  return query
  with nom_counts as (
    select n.cast_id as cid,
           count(*) filter (where c.nom_type = 'hon')   as hon,
           count(*) filter (where c.nom_type = 'jonai') as jonai,
           count(*) filter (where c.nom_type = 'dohan') as dohan
    from public.check_nominations n
    join public.checks c on c.id = n.check_id
    where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
      and c.started_at >= v_start and c.started_at < v_end
      and n.org_id = v_org
    group by n.cast_id
  ),
  back_sums as (
    -- 順位の最終タイブレーク専用（値は返さない）
    select b.cast_id as cid,
           sum(b.drink_back + b.champ_back + b.bottle_back) as backs
    from public.check_cast_backs b
    join public.checks c on c.id = b.check_id
    where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
      and c.started_at >= v_start and c.started_at < v_end
      and b.org_id = v_org
    group by b.cast_id
  )
  select row_number() over (
           order by coalesce(nc.hon, 0) desc,
                    coalesce(nc.hon, 0) + coalesce(nc.jonai, 0) + coalesce(nc.dohan, 0) desc,
                    coalesce(bs.backs, 0) desc,
                    ca.name asc, ca.id asc
         )::int,
         ca.id,
         ca.name,
         coalesce(nc.hon, 0)::int,
         coalesce(nc.jonai, 0)::int,
         coalesce(nc.dohan, 0)::int,
         coalesce(ca.id = v_self, false) -- 非 cast 呼び出し（v_self=null）でも false
  from public.casts ca
  left join nom_counts nc on nc.cid = ca.id
  left join back_sums  bs on bs.cid = ca.id
  where ca.org_id = v_org and ca.store_id = p_store_id and ca.is_active;
end $function$


-- ═══ (2) get_store_nom_counts — pronargs=3 args=(p_store_id uuid, p_from date, p_to date) proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.get_store_nom_counts(p_store_id uuid, p_from date, p_to date)
 RETURNS TABLE(hon_count integer, jonai_count integer, dohan_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid;
  v_settings jsonb;
  v_cutoff   text;
  v_start    timestamptz;
  v_end      timestamptz;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  -- 入力（範囲）検証：cast_sales_aggregate と同流儀（p_from<=p_to・上限92日）
  if p_from is null or p_to is null or p_from > p_to then raise exception 'bad range'; end if;
  if p_to - p_from > 92 then raise exception 'bad range'; end if;
  select s.org_id, s.settings_json into v_org, v_settings from public.stores s where s.id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- get_cast_ranking 逐語: owner は org 全店・他ロール（manager/staff/cast）は自店のみ
  if not (public.auth_role() = 'owner' or p_store_id = public.auth_store_id()) then
    raise exception 'forbidden';
  end if;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;
  -- window: biz_date [p_from, p_to] を cutoff 調整済 timestamptz 窓へ
  --   （get_cast_ranking の period→month 窓を p_from/p_to 範囲へ差し替え。started_at は左閉右開）
  v_start := ((p_from::text || ' ' || v_cutoff))::timestamp at time zone 'Asia/Tokyo';
  v_end   := ((((p_to + interval '1 day')::date)::text || ' ' || v_cutoff))::timestamp at time zone 'Asia/Tokyo';

  return query
  -- get_cast_ranking の nom_counts CTE を店集計へ縮退（group by cast_id を外す・値の基準は逐語）
  select
    count(*) filter (where c.nom_type = 'hon')::int,
    count(*) filter (where c.nom_type = 'jonai')::int,
    count(*) filter (where c.nom_type = 'dohan')::int
  from public.check_nominations n
  join public.checks c on c.id = n.check_id
  where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
    and c.started_at >= v_start and c.started_at < v_end
    and n.org_id = v_org;
end $function$


-- ═══ (2) kiosk_check_detail — pronargs=1 args=(p_check_id uuid) proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.kiosk_check_detail(p_check_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
  v_chk   public.checks;
  v_paid  integer;
begin
  -- ★正ガード先行のみ（is null 述語は三値化しない＝fail-closed。F0 §7.1 教訓）
  v_store := public.auth_kiosk_register_store_id();
  if v_store is null or public.auth_kiosk_operator() is null then
    raise exception 'forbidden';
  end if;

  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null then raise exception 'not found'; end if;
  if v_chk.store_id <> v_store then raise exception 'forbidden'; end if;

  select coalesce(sum(pm.amount), 0)::int into v_paid
    from public.payments pm where pm.check_id = p_check_id;

  return jsonb_build_object(
    'check', jsonb_build_object(
      'id', v_chk.id, 'seat_id', v_chk.seat_id, 'status', v_chk.status,
      'people', v_chk.people, 'nom_type', v_chk.nom_type, 'started_at', v_chk.started_at,
      'total', v_chk.total,
      'service_rate', v_chk.service_rate, 'round_unit', v_chk.round_unit, 'round_mode', v_chk.round_mode,
      'set_min', v_chk.set_min, 'set_fee', v_chk.set_fee,
      'ext_min', v_chk.ext_min, 'ext_fee', v_chk.ext_fee,
      'time_per', v_chk.time_per),
    'time_mode', (select st.time_mode from public.stores st where st.id = v_chk.store_id),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'kind', l.kind, 'pay_group', l.pay_group,
               'name_snapshot', l.name_snapshot, 'unit_price_snapshot', l.unit_price_snapshot,
               'qty', l.qty, 'line_total', l.line_total) order by l.sort_order)
        from public.check_lines l where l.check_id = p_check_id), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pm.id, 'pay_group', pm.pay_group, 'method', pm.method,
               'amount', pm.amount, 'tendered', pm.tendered, 'method_detail', pm.method_detail)
                       order by pm.paid_at)
        from public.payments pm where pm.check_id = p_check_id), '[]'::jsonb),
    'nominations', coalesce((
      select jsonb_agg(jsonb_build_object('cast_id', n.cast_id, 'ratio_weight', n.ratio_weight)
                       order by n.position)
        from public.check_nominations n where n.check_id = p_check_id), '[]'::jsonb),
    'extra_seat_ids', coalesce((
      select jsonb_agg(cs.seat_id order by cs.created_at)
        from public.check_seats cs where cs.check_id = p_check_id), '[]'::jsonb),
    'paid_total', v_paid,
    'balance', v_chk.total - v_paid
  );
end $function$


-- ═══ (2) reservation_create — pronargs=10 args=(p_store_id uuid, p_reserved_at timestamp with time zone, p_customer_id uuid, p_cast_id uuid, p_guest_name text, p_party_size integer, p_nom_type text, p_memo text, p_seat_id uuid, p_stay_minutes integer) proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.reservation_create(p_store_id uuid, p_reserved_at timestamp with time zone, p_customer_id uuid DEFAULT NULL::uuid, p_cast_id uuid DEFAULT NULL::uuid, p_guest_name text DEFAULT NULL::text, p_party_size integer DEFAULT NULL::integer, p_nom_type text DEFAULT NULL::text, p_memo text DEFAULT NULL::text, p_seat_id uuid DEFAULT NULL::uuid, p_stay_minutes integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org         uuid := public.auth_org_id();
  v_role        text := public.auth_role();
  v_store_org   uuid;
  v_guest       text;
  v_actor       uuid;
  v_id          uuid;
  v_seat_store  uuid;
  v_seat_active boolean;
  v_stay        tstzrange;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  if p_reserved_at is null then raise exception 'bad reserved_at'; end if;
  if p_party_size is not null and p_party_size <= 0 then raise exception 'bad people'; end if;
  if p_nom_type is not null and p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  if p_guest_name is not null and length(p_guest_name) > 80 then raise exception 'bad name'; end if;
  v_guest := nullif(trim(coalesce(p_guest_name, '')), '');

  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'invalid store'; end if;

  -- ★B-5①: 定休日ハード拒否（時間外は拒否しない=UI 警告・未設定は通す）
  if public.reservation_is_closed_day(p_store_id, p_reserved_at) then
    raise exception 'closed day';
  end if;

  if not (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())
          or (v_role = 'staff' and p_store_id = public.auth_store_id()
              and public.auth_staff_can_crm())) then
    raise exception 'forbidden';
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers cu
    where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = p_store_id
  ) then
    raise exception 'invalid customer';
  end if;

  if p_cast_id is not null and not exists (
    select 1 from public.casts c
    where c.id = p_cast_id and c.org_id = v_org and c.store_id = p_store_id and c.is_active
  ) then
    raise exception 'bad cast';
  end if;

  if (p_seat_id is null) <> (p_stay_minutes is null) then raise exception 'bad stay'; end if;
  if p_seat_id is not null then
    if p_stay_minutes not in (60, 90, 120, 180) then raise exception 'bad stay'; end if;
    select s.store_id, s.is_active into v_seat_store, v_seat_active
    from public.seats s where s.id = p_seat_id and s.org_id = v_org;
    if v_seat_store is null or v_seat_store <> p_store_id then raise exception 'invalid store'; end if;
    if not v_seat_active then raise exception 'bad seat'; end if;
    v_stay := tstzrange(p_reserved_at, p_reserved_at + make_interval(mins => p_stay_minutes), '[)');
    if exists (
      select 1 from public.reservations r
      where r.org_id = v_org and r.seat_id = p_seat_id and r.status = 'booked'
        and r.stay && v_stay
    ) then
      raise exception 'seat time conflict';
    end if;
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  insert into public.reservations
    (org_id, store_id, customer_id, cast_id, guest_name, reserved_at, party_size, nom_type,
     status, memo, created_by, seat_id, stay)
  values
    (v_org, p_store_id, p_customer_id, p_cast_id, v_guest, p_reserved_at, p_party_size, p_nom_type,
     'booked', p_memo, v_actor, p_seat_id, v_stay)
  returning id into v_id;

  perform public.audit_log_write('reservation_create', 'reservations:' || v_id::text,
    null, (select to_jsonb(r) from public.reservations r where r.id = v_id), p_store_id);
  return v_id;
end $function$


-- ═══ (2) reservation_to_check — pronargs=3 args=(p_reservation_id uuid, p_seat_id uuid, p_nom_type text) proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.reservation_to_check(p_reservation_id uuid, p_seat_id uuid DEFAULT NULL::uuid, p_nom_type text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org        uuid := public.auth_org_id();
  v_role       text := public.auth_role();
  v_res        public.reservations;
  v_seat       uuid;
  v_seat_store uuid;
  v_nom_type   text;
  v_check_id   uuid;
  v_cast_ok    boolean := false;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 対象予約（org 照合・reservations は org_id 列あり）
  select * into v_res from public.reservations
  where id = p_reservation_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- status=booked のみ来店処理可（visited 再処理・cancelled/no_show は不可）
  if v_res.status <> 'booked' then raise exception 'not bookable'; end if;

  -- F3b-B: 卓の解決＝引数 > 予約卓（席予約）。卓なし予約は従来どおり引数必須（両 null は no seat）
  v_seat := coalesce(p_seat_id, v_res.seat_id);
  if v_seat is null then raise exception 'no seat'; end if;

  -- ★【10】卓の店＝予約の店（owner の org 全店権限で他店卓に開く誤接続を封じる。
  --   customer あり予約は内側 check_open の invalid customer でも止まるが、guest_name のみの
  --   フリー予約には関所が無いためここで一致を要求）
  -- ★mig0053（裁定(c)）: seats 行ロック＝占有変更の直列化（主席 open を作る経路として同ガード）
  select store_id into v_seat_store from public.seats where id = v_seat for update;
  if v_seat_store is null or v_seat_store <> v_res.store_id then raise exception 'invalid store'; end if;

  -- ★【5】発見1対策: 解決後の卓に既存 open があれば拒否（使用中の卓に予約客を着けない＝
  --   check_open の「既存 open 再利用」で他人の伝票が返る誤接続の封鎖）。
  --   確認(A): 予約卓が飛び込み客で埋まっている場合もここで 'seat occupied'
  --   → UI は p_seat_id を明示して別卓に通す（実来店が勝つ・audit に予約卓と実卓が両方残る）
  if exists (
    select 1 from public.checks
    where seat_id = v_seat and status = 'open' and org_id = v_org
  ) then
    raise exception 'seat occupied';
  end if;
  -- ★mig0053（B1 相席）: 追加席として占有中の卓も拒否（check_open の再利用が主席∪追加席 union に
  --   なったため、ここで塞がないと予約客が他組の伝票へ着く＝発見1 の相席版）
  if exists (
    select 1 from public.check_seats cs
    join public.checks c on c.id = cs.check_id
    where cs.seat_id = v_seat and c.status = 'open' and c.org_id = v_org
  ) then
    raise exception 'seat occupied';
  end if;

  -- 【8】nom_type 決定: 引数 > 予約の nom_type > 'free'（両対応・来店時上書き可）
  v_nom_type := coalesce(p_nom_type, v_res.nom_type, 'free');
  if v_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;

  -- ① check_open を内部呼び（customer_id 引き継ぎ・【4】権限=can_register・seat 検証・
  --    invalid customer は check_open が担う＝二重に書かない）
  v_check_id := public.check_open(v_seat, v_res.party_size, v_nom_type, v_res.customer_id);

  -- ② 指名引き継ぎ（cast_id あり ∧ ★【6】発見3: cast が is_active のときだけ）
  if v_res.cast_id is not null then
    select true into v_cast_ok from public.casts
    where id = v_res.cast_id and org_id = v_org and is_active
      and store_id = (select store_id from public.checks where id = v_check_id);
    if v_cast_ok then
      -- check_set_nominations を内部呼び（単一指名＝要素1の配列・weight=1・全置換）
      perform public.check_set_nominations(
        v_check_id, v_nom_type,
        jsonb_build_array(jsonb_build_object('cast_id', v_res.cast_id, 'weight', 1))
      );
    end if;
    -- cast inactive（v_cast_ok=false）なら指名スキップ・開店は成功（発見3 lock・不在表示は UI）
  end if;

  -- 予約を visited に・check_id を埋める（【7】visited⇔check_id 1:1）
  update public.reservations
     set status = 'visited', check_id = v_check_id, updated_at = now()
   where id = p_reservation_id;

  perform public.audit_log_write('reservation_to_check', 'reservations:' || p_reservation_id::text,
    to_jsonb(v_res),
    jsonb_build_object('status','visited','check_id',v_check_id,'seat_id',v_seat,'nom_type',v_nom_type),
    v_res.store_id);

  return v_check_id;
end $function$


-- ═══ (2) reservation_update — pronargs=10 args=(p_reservation_id uuid, p_reserved_at timestamp with time zone, p_customer_id uuid, p_cast_id uuid, p_guest_name text, p_party_size integer, p_nom_type text, p_memo text, p_seat_id uuid, p_stay_minutes integer) proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} ═══
CREATE OR REPLACE FUNCTION public.reservation_update(p_reservation_id uuid, p_reserved_at timestamp with time zone, p_customer_id uuid, p_cast_id uuid, p_guest_name text, p_party_size integer, p_nom_type text, p_memo text, p_seat_id uuid DEFAULT NULL::uuid, p_stay_minutes integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org         uuid := public.auth_org_id();
  v_role        text := public.auth_role();
  v_res         public.reservations;
  v_guest       text;
  v_before      jsonb;
  v_seat_store  uuid;
  v_seat_active boolean;
  v_stay        tstzrange;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  if p_reserved_at is null then raise exception 'bad reserved_at'; end if;
  if p_party_size is not null and p_party_size <= 0 then raise exception 'bad people'; end if;
  if p_nom_type is not null and p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  if p_guest_name is not null and length(p_guest_name) > 80 then raise exception 'bad name'; end if;
  v_guest := nullif(trim(coalesce(p_guest_name, '')), '');

  select * into v_res from public.reservations
  where id = p_reservation_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  if not (v_role = 'owner'
          or (v_role = 'manager' and v_res.store_id = public.auth_store_id())
          or (v_role = 'staff' and v_res.store_id = public.auth_store_id()
              and public.auth_staff_can_crm())) then
    raise exception 'forbidden';
  end if;

  if v_res.status <> 'booked' then raise exception 'not editable'; end if;

  -- ★B-5①: 定休日ハード拒否（店は既存行の store_id・時間外は UI 警告・未設定は通す）
  if public.reservation_is_closed_day(v_res.store_id, p_reserved_at) then
    raise exception 'closed day';
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers cu
    where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = v_res.store_id
  ) then
    raise exception 'invalid customer';
  end if;
  if p_cast_id is not null and not exists (
    select 1 from public.casts c
    where c.id = p_cast_id and c.org_id = v_org and c.store_id = v_res.store_id and c.is_active
  ) then
    raise exception 'bad cast';
  end if;

  if (p_seat_id is null) <> (p_stay_minutes is null) then raise exception 'bad stay'; end if;
  if p_seat_id is not null then
    if p_stay_minutes not in (60, 90, 120, 180) then raise exception 'bad stay'; end if;
    select s.store_id, s.is_active into v_seat_store, v_seat_active
    from public.seats s where s.id = p_seat_id and s.org_id = v_org;
    if v_seat_store is null or v_seat_store <> v_res.store_id then raise exception 'invalid store'; end if;
    if not v_seat_active then raise exception 'bad seat'; end if;
    v_stay := tstzrange(p_reserved_at, p_reserved_at + make_interval(mins => p_stay_minutes), '[)');
    if exists (
      select 1 from public.reservations r
      where r.org_id = v_org and r.seat_id = p_seat_id and r.status = 'booked'
        and r.id <> p_reservation_id
        and r.stay && v_stay
    ) then
      raise exception 'seat time conflict';
    end if;
  end if;

  v_before := to_jsonb(v_res);
  update public.reservations
     set reserved_at = p_reserved_at,
         customer_id = p_customer_id,
         cast_id     = p_cast_id,
         guest_name  = v_guest,
         party_size  = p_party_size,
         nom_type    = p_nom_type,
         memo        = p_memo,
         seat_id     = p_seat_id,
         stay        = v_stay,
         updated_at  = now()
   where id = p_reservation_id;

  perform public.audit_log_write('reservation_update', 'reservations:' || p_reservation_id::text,
    v_before, (select to_jsonb(r) from public.reservations r where r.id = p_reservation_id),
    v_res.store_id);
end $function$


-- ═══ (3) check_cast_backs 列定義 ═══
--   id uuid NOT NULL DEFAULT gen_random_uuid()
--   org_id uuid NOT NULL
--   store_id uuid NOT NULL
--   check_id uuid NOT NULL
--   cast_id uuid NOT NULL
--   drink_back integer NOT NULL DEFAULT 0
--   champ_back integer NOT NULL DEFAULT 0
--   bottle_back integer NOT NULL DEFAULT 0
--   hon_pt_alloc integer NOT NULL DEFAULT 0
--   created_at timestamp with time zone NOT NULL DEFAULT now()
-- back_snapshot->'unit4' の実キー集合（live check_lines 全行）: [{"key":"dohan","n":9},{"key":"free","n":9},{"key":"hon","n":9},{"key":"jonai","n":9}]
-- products 側の unit4 CHECK: [{"conname":"products_back_mode_check","def":"CHECK ((back_mode = ANY (ARRAY['rate'::text, 'unit4'::text])))"},{"conname":"products_unit4_json_chk","def":"CHECK (((back_mode <> 'unit4'::text) OR (unit4_json IS NOT NULL)))"}]

-- ═══ (追記 2026-09-01) check_shimei_add — pronargs=3 args=(p_check_id uuid, p_cast_id uuid, p_kind text) proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}（貼り先証明: {"p":"nox-project-proof","n":3}）═══
CREATE OR REPLACE FUNCTION public.check_shimei_add(p_check_id uuid, p_cast_id uuid, p_kind text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_cast record; v_id uuid; v_sort int; v_paycnt int;
  v_seat_kind text; v_fee_kind text; v_name text; v_price int;
  v_org uuid; r_fee record;
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_kind is null or p_kind not in ('hon','jonai') then raise exception 'bad kind'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3)型: kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- 入金後に合計が動く経路を塞ぐ（check_time_charge_apply と同じ保守側）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;

  -- キャスト検証（同 org・伝票の店と同店・在籍）★A1: is_active は CC 照合対象
  select c.id, c.store_id, c.rank_id, c.is_active into v_cast
    from public.casts c where c.id = p_cast_id and c.org_id = v_org;
  if v_cast.id is null or v_cast.store_id <> v_chk.store_id then raise exception 'bad cast'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;

  -- 席種＝伝票の現在席（席移動後はその席の料率＝運用整合）・時間軸＝started_at（凍結）
  select s.kind into v_seat_kind from public.seats s where s.id = v_chk.seat_id;
  v_fee_kind := case p_kind when 'hon' then 'hon_shimei' else 'jonai_shimei' end;
  select * into r_fee from public.pricing_resolve_core(
    v_chk.store_id, v_chk.started_at, v_fee_kind, v_seat_kind, v_cast.rank_id);
  if r_fee.amount is not null then
    v_price := r_fee.amount;
  else
    select case when p_kind = 'hon' then st.hon_fee else st.jonai_fee end
      into v_price from public.stores st where st.id = v_chk.store_id;
  end if;
  v_name := case p_kind when 'hon' then '本指名料' else '場内指名料' end;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, fee_kind, cast_id)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
          v_name, v_price, 1, v_price, null, v_sort, v_fee_kind, p_cast_id)
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  -- audit: 行 jsonb（name_snapshot は料金名・cast は id のみ＝PII なし既存流儀）
  perform public.audit_log_write('check_shimei_add', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$

