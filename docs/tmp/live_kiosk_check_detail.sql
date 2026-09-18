-- live pg_get_functiondef (2026-08-18・LF正規化済み・読み取り供出)
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
      'service_rate', v_chk.service_rate, 'round_unit', v_chk.round_unit, 'round_mode', v_chk.round_mode),
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

