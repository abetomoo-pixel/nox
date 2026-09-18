-- live pg_get_functiondef (2026-08-18・LF正規化済み・読み取り供出)
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

