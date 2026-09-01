CREATE OR REPLACE FUNCTION public.check_set_nominations(p_check_id uuid, p_nominations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_after jsonb;
  v_elem jsonb; v_cast record; v_w numeric; v_pos int := 0; v_cast_id uuid;
  v_org uuid;  -- ★0057(2)
  v_kind text; v_dohan boolean; v_auto boolean; v_summary text;  -- ★0119 裁定100
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
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
    (select coalesce(jsonb_agg(jsonb_build_object('cast_id', cast_id, 'weight', ratio_weight, 'nom_kind', nom_kind, 'is_dohan', is_dohan) order by position), '[]'::jsonb)
       from public.check_nominations where check_id = p_check_id));

  select st.dohan_auto_hon into v_auto from public.stores st where st.id = v_chk.store_id;  -- ★0119
  delete from public.check_nominations where check_id = p_check_id;
  for v_elem in select * from jsonb_array_elements(p_nominations)
  loop
    if jsonb_typeof(v_elem) <> 'object' then raise exception 'bad nominations'; end if;
    if jsonb_typeof(v_elem -> 'weight') is distinct from 'number' then raise exception 'bad weight'; end if;
    v_w := (v_elem ->> 'weight')::numeric;
    if v_w < 1 or v_w <> trunc(v_w) then raise exception 'bad weight'; end if;
    -- ★0119 裁定100: キャスト別種別（hon/jonai/free）と同伴（別軸）
    v_kind := coalesce(v_elem ->> 'nom_kind', 'free');
    if v_kind not in ('hon','jonai','free') then raise exception 'bad nom_kind'; end if;
    if (v_elem ? 'is_dohan') and jsonb_typeof(v_elem -> 'is_dohan') <> 'boolean' then raise exception 'bad is_dohan'; end if;
    v_dohan := coalesce((v_elem ->> 'is_dohan')::boolean, false);
    if coalesce(v_auto, false) and v_dohan and v_kind = 'free' then v_kind := 'hon'; end if; -- 同伴時の本指名自動付与（jonai 明示は昇格しない）
    if v_kind = 'free' and not v_dohan and v_w <> 1 then raise exception 'bad weight'; end if; -- free は均等（据え置き）
    v_cast_id := (v_elem ->> 'cast_id')::uuid;
    select * into v_cast from public.casts where id = v_cast_id;
    if v_cast.id is null or v_cast.org_id <> v_org
       or v_cast.store_id <> v_chk.store_id or not v_cast.is_active then
      raise exception 'bad cast';
    end if;
    if exists (select 1 from public.check_nominations where check_id = p_check_id and cast_id = v_cast_id) then
      raise exception 'dup cast';  -- 名簿は 1伝票×1キャスト 1行（種別と同伴は行の属性）
    end if;
    insert into public.check_nominations (org_id, store_id, check_id, cast_id, ratio_weight, position, nom_kind, is_dohan)
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_id, v_w::int, v_pos, v_kind, v_dohan);
    v_pos := v_pos + 1;
  end loop;
  v_summary := public.nom_type_summary(p_check_id);  -- ★0119: checks.nom_type は派生サマリ（正本は名簿行）
  update public.checks set nom_type = v_summary where id = p_check_id;

  v_after := jsonb_build_object('nom_type', v_summary, 'nominations', p_nominations);
  perform public.audit_log_write('check_set_nominations', 'checks:' || p_check_id::text,
    v_before, v_after, v_chk.store_id);
end $function$
