-- 0048_f3f_cast_open_checks.sql
-- F3f 申告導線: cast_open_checks（cast 専用・最小開示 RPC）
-- 背景: checks/seats は P2（cast 0行）＝cast は申告先伝票を RLS 経由で選べない。
--       drink_claim_submit の設計意図は「指名有無を問わず申告可」（フリー卓含む）のため、
--       check_nominations 自己行から辿る案では意図と食い違う → 最小開示 RPC を新設（裁定 2026-07-17）
-- 開示範囲: 自店 open 伝票の {check_id, 席名, 席種, 開始時刻} のみ。
--       金額・明細・客情報・指名情報は一切返さない＝P2 保護対象（会計金額系）に不触
-- checks.seat_id は NOT NULL（live 確認 2026-07-17）＝全 open 伝票に席名が必ず在る
-- 構成: 再適用可（or replace）だが手貼りは1回

begin;

create or replace function public.cast_open_checks()
returns table (check_id uuid, seat_name text, seat_kind text, started_at timestamptz)
language plpgsql stable security definer
set search_path to 'public'
as $function$
declare
  v_cast uuid := public.auth_cast_id();
begin
  -- cast 専用（drink_claim_submit と同語彙）
  if v_cast is null then raise exception 'no cast for caller'; end if;

  return query
  select c.id, s.name, s.kind, c.started_at
    from public.checks c
    join public.seats s on s.id = c.seat_id
   where c.org_id = public.auth_org_id()
     and c.store_id = public.auth_store_id()
     and c.status = 'open'
   order by s.sort_order, c.started_at;
end $function$;

revoke all on function public.cast_open_checks() from public, anon;
grant execute on function public.cast_open_checks() to authenticated;

commit;
