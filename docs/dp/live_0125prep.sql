CREATE OR REPLACE FUNCTION public.shift_set(p_id uuid, p_cast_id uuid, p_date date, p_start_hm text, p_end_hm text, p_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast record; v_actor uuid; v_id uuid; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_date is null then raise exception 'bad date'; end if;
  if p_start_hm is null or p_start_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_end_hm   is null or p_end_hm   !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_status is null or p_status not in ('planned','proposed','confirmed') then raise exception 'bad status'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- ★B-5②: 定休日ハード拒否（create/update 共通・ロール照合の後=他店曜日の probing 防止）
  if public.shift_is_closed_day(v_cast.store_id, p_date) then
    raise exception 'closed day';
  end if;
  -- ★0103 SD-9: 1日1枠（同一 cast・同一 date）。制約 shifts_cast_date_key が最終防衛
  if exists (select 1 from public.shifts s
              where s.cast_id = p_cast_id and s.date = p_date
                and (p_id is null or s.id <> p_id)) then
    raise exception 'duplicate';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if p_id is null then
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, created_by)
    values (v_cast.org_id, v_cast.store_id, p_cast_id, p_date, p_start_hm, p_end_hm, p_status, v_actor)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(s) into v_before from public.shifts s
      where s.id = p_id and s.org_id = public.auth_org_id() and s.cast_id = p_cast_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.shifts
       set date = p_date, start_hm = p_start_hm, end_hm = p_end_hm, status = p_status
     where id = p_id and org_id = public.auth_org_id();
    v_id := p_id;
  end if;
  perform public.audit_log_write('shift_set', 'shifts:' || v_id::text, v_before,
    (select to_jsonb(s) from public.shifts s where s.id = v_id), v_cast.store_id);
  return v_id;
end
$function$

;

CREATE OR REPLACE FUNCTION public.shift_bulk_set(p_cast_id uuid, p_dates date[], p_start_hm text, p_end_hm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast record; v_actor uuid; v_dates date[]; v_d date; v_id uuid;
  v_ins int := 0; v_ids uuid[] := '{}'; v_skip date[] := '{}';
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_dates is null then raise exception 'bad dates'; end if;
  if p_start_hm is null or p_start_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_end_hm   is null or p_end_hm   !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select array_agg(distinct t.d order by t.d) into v_dates
    from unnest(p_dates) as t(d) where t.d is not null;
  if coalesce(array_length(v_dates,1),0) = 0 then
    return jsonb_build_object('inserted', 0, 'skipped', '[]'::jsonb);   -- ★完全 no-op
  end if;
  if array_length(v_dates,1) > 62 then raise exception 'too many dates'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  foreach v_d in array v_dates loop
    -- 定休日・同日既存はスキップ（raise しない＝一括の性質）
    if public.shift_is_closed_day(v_cast.store_id, v_d)
       or exists (select 1 from public.shifts s where s.cast_id = p_cast_id and s.date = v_d) then
      v_skip := v_skip || v_d;
      continue;
    end if;
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, source, created_by)
    values (v_cast.org_id, v_cast.store_id, p_cast_id, v_d, p_start_hm, p_end_hm, 'planned', 'manual', v_actor)
    returning id into v_id;
    v_ids := v_ids || v_id;
    v_ins := v_ins + 1;
  end loop;

  perform public.audit_log_write('shift_bulk_set', 'casts:' || p_cast_id::text, null,
    jsonb_build_object('inserted', v_ins, 'shift_ids', to_jsonb(v_ids), 'skipped', to_jsonb(v_skip),
                       'start_hm', p_start_hm, 'end_hm', p_end_hm),
    v_cast.store_id);
  return jsonb_build_object('inserted', v_ins, 'skipped', to_jsonb(v_skip));
end
$function$

;

CREATE OR REPLACE FUNCTION public.shift_wish_decide(p_wish_id uuid, p_accept boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wish record; v_actor uuid; v_shift uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_accept is null then raise exception 'bad accept'; end if;
  select * into v_wish from public.shift_wishes where id = p_wish_id;
  if v_wish.id is null or v_wish.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_wish.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_wish.status <> 'pending' then raise exception 'already decided'; end if;
  -- ★B-5②: accept のみ定休日ハード拒否（提出後に定休日設定された競合の防波堤・reject は定休日でも可・wish は pending のまま）
  if p_accept and public.shift_is_closed_day(v_wish.store_id, v_wish.date) then
    raise exception 'closed day';
  end if;
  -- ★0103 SD-9: accept は同日既存 shift があれば拒否（wish は pending のまま）
  if p_accept and exists (select 1 from public.shifts s
                           where s.cast_id = v_wish.cast_id and s.date = v_wish.date) then
    raise exception 'duplicate';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.shift_wishes
     set status = case when p_accept then 'accepted' else 'rejected' end,
         decided_by = v_actor, decided_at = now()
   where id = p_wish_id;
  -- 【0008 決定2】accept はシフト案（planned）へ自動取り込み。二重生成は部分ユニークで物理防止。
  if p_accept then
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, wish_id, created_by)
    values (v_wish.org_id, v_wish.store_id, v_wish.cast_id, v_wish.date, v_wish.start_hm, v_wish.end_hm,
            'planned', p_wish_id, v_actor)
    returning id into v_shift;
  end if;
  perform public.audit_log_write('shift_wish_decide', 'shift_wishes:' || p_wish_id::text,
    to_jsonb(v_wish),
    jsonb_build_object(
      'wish', (select to_jsonb(w) from public.shift_wishes w where w.id = p_wish_id),
      'generated_shift_id', v_shift),
    v_wish.store_id);
  return v_shift; -- reject 時は null
end $function$


-- ============ shifts: constraints (pg_get_constraintdef) ============
-- [u] shifts_cast_date_key: UNIQUE (cast_id, date)
-- [f] shifts_cast_id_fkey: FOREIGN KEY (cast_id) REFERENCES casts(id)
-- [f] shifts_created_by_fkey: FOREIGN KEY (created_by) REFERENCES users(id)
-- [c] shifts_end_hm_check: CHECK ((end_hm ~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$'::text))
-- [f] shifts_org_id_fkey: FOREIGN KEY (org_id) REFERENCES orgs(id)
-- [f] shifts_period_id_fkey: FOREIGN KEY (period_id) REFERENCES shift_periods(id)
-- [p] shifts_pkey: PRIMARY KEY (id)
-- [c] shifts_source_check: CHECK ((source = ANY (ARRAY['manual'::text, 'auto'::text])))
-- [c] shifts_start_hm_check: CHECK ((start_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'::text))
-- [c] shifts_status_check: CHECK ((status = ANY (ARRAY['planned'::text, 'proposed'::text, 'confirmed'::text])))
-- [f] shifts_store_id_fkey: FOREIGN KEY (store_id) REFERENCES stores(id)
-- [f] shifts_wish_id_fkey: FOREIGN KEY (wish_id) REFERENCES shift_wishes(id)
-- ============ shifts: indexes (pg_indexes.indexdef) ============
-- CREATE UNIQUE INDEX shifts_cast_date_key ON public.shifts USING btree (cast_id, date)
-- CREATE INDEX shifts_org_idx ON public.shifts USING btree (org_id)
-- CREATE INDEX shifts_period_idx ON public.shifts USING btree (period_id) WHERE (period_id IS NOT NULL)
-- CREATE UNIQUE INDEX shifts_pkey ON public.shifts USING btree (id)
-- CREATE INDEX shifts_store_date_idx ON public.shifts USING btree (store_id, date)
-- CREATE UNIQUE INDEX shifts_wish_id_uidx ON public.shifts USING btree (wish_id) WHERE (wish_id IS NOT NULL)
-- ============ shifts: triggers (pg_get_triggerdef) ============
-- CREATE TRIGGER shifts_touch_updated_at BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION touch_updated_at()

-- ============ shift_wishes: constraints (pg_get_constraintdef) ============
-- [f] shift_wishes_cast_id_fkey: FOREIGN KEY (cast_id) REFERENCES casts(id)
-- [f] shift_wishes_decided_by_fkey: FOREIGN KEY (decided_by) REFERENCES users(id)
-- [c] shift_wishes_end_hm_check: CHECK ((end_hm ~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$'::text))
-- [f] shift_wishes_org_id_fkey: FOREIGN KEY (org_id) REFERENCES orgs(id)
-- [p] shift_wishes_pkey: PRIMARY KEY (id)
-- [c] shift_wishes_start_hm_check: CHECK ((start_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'::text))
-- [c] shift_wishes_status_check: CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text])))
-- [f] shift_wishes_store_id_fkey: FOREIGN KEY (store_id) REFERENCES stores(id)
-- ============ shift_wishes: indexes (pg_indexes.indexdef) ============
-- CREATE INDEX shift_wishes_cast_date_idx ON public.shift_wishes USING btree (cast_id, date)
-- CREATE UNIQUE INDEX shift_wishes_cast_date_live_uidx ON public.shift_wishes USING btree (cast_id, date) WHERE (status = ANY (ARRAY['pending'::text, 'accepted'::text]))
-- CREATE INDEX shift_wishes_org_idx ON public.shift_wishes USING btree (org_id)
-- CREATE UNIQUE INDEX shift_wishes_pkey ON public.shift_wishes USING btree (id)
-- CREATE INDEX shift_wishes_store_date_idx ON public.shift_wishes USING btree (store_id, date)
-- ============ shift_wishes: triggers (pg_get_triggerdef) ============
-- CREATE TRIGGER shift_wishes_touch_updated_at BEFORE UPDATE ON public.shift_wishes FOR EACH ROW EXECUTE FUNCTION touch_updated_at()