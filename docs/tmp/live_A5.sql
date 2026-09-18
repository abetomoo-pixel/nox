-- live_A5.sql — A5 控除レーンの材料（読み取り専用・untracked scratch）
-- 採取元: nox-dev / pg_catalog + pg_get_functiondef

-- ===== deductions 列 =====
--    1 id uuid NOT NULL DEFAULT gen_random_uuid()
--    2 org_id uuid NOT NULL
--    3 store_id uuid NOT NULL
--    4 name text NOT NULL
--    5 amount integer NOT NULL DEFAULT 0
--    6 per text NOT NULL
--    7 is_active boolean NOT NULL DEFAULT true
--    8 created_at timestamp with time zone NOT NULL DEFAULT now()
--    9 updated_at timestamp with time zone NOT NULL DEFAULT now()

-- ===== deductions 制約 =====
--   [c] deductions_amount_check: CHECK ((amount >= 0))
--   [c] deductions_per_check: CHECK ((per = ANY (ARRAY['day'::text, 'month'::text, 'rate'::text])))
--   [f] deductions_org_id_fkey: FOREIGN KEY (org_id) REFERENCES orgs(id)
--   [f] deductions_store_id_fkey: FOREIGN KEY (store_id) REFERENCES stores(id)
--   [p] deductions_pkey: PRIMARY KEY (id)

-- ===== deductions 索引 =====
--   CREATE INDEX deductions_org_idx ON public.deductions USING btree (org_id)
--   CREATE UNIQUE INDEX deductions_pkey ON public.deductions USING btree (id)
--   CREATE INDEX deductions_store_idx ON public.deductions USING btree (store_id)

-- ===== deductions RLS =====
--   deductions_select [SELECT] to {authenticated} using ((org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR (store_id = auth_store_id())))

-- ======================================================================
-- set_deduction(uuid,uuid,text,integer,text,boolean)
-- ======================================================================
CREATE OR REPLACE FUNCTION public.set_deduction(p_id uuid, p_store_id uuid, p_name text, p_amount integer, p_per text, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_per not in ('day','month','rate') then raise exception 'bad per'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'bad amount'; end if;
  if p_per = 'rate' and p_amount > 100 then raise exception 'bad amount'; end if; -- rate は % 値（100 超は設定ミス）
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if p_id is null then
    insert into public.deductions (org_id, store_id, name, amount, per, is_active)
    values (public.auth_org_id(), p_store_id, trim(p_name), p_amount, p_per, coalesce(p_is_active, true))
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(d) into v_before from public.deductions d
      where d.id = p_id and d.org_id = public.auth_org_id() and d.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.deductions
      set name = trim(p_name), amount = p_amount, per = p_per, is_active = coalesce(p_is_active, true)
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(d) into v_after from public.deductions d where d.id = v_id;
  perform public.audit_log_write('set_deduction', 'deductions:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$

