-- live pg_get_functiondef (2026-08-18・LF正規化済み・読み取り供出)
CREATE OR REPLACE FUNCTION public.check_recalc(p_check_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total int := 0; v_g record;
begin
  for v_g in
    select distinct pay_group from public.check_lines where check_id = p_check_id
  loop
    v_total := v_total + public.check_group_due(p_check_id, v_g.pay_group);
  end loop;
  update public.checks set total = v_total where id = p_check_id;
end $function$

