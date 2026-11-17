-- 0201n_cast_roster（2026-11-17 起草・CC・相談役「レジの許可があるキャストが読める列を絞る」・起票135 の続き）
--   翻訳元＝なし（NOX 固有）。表の定義は変えない＝関数 1 本の新設と RLS 2 本の差し替えだけ。
--   ① casts_select：キャストの立場で読めるのは自分の行だけに戻す（旧＝auth_cast_can_register() なら同じ店の全員の全列＝体入の条件・雇用・送りの区分・ランク・入退店日・user_id が読めた）。
--   ② register_cast_roster(p_store_id)：レジ・日報の画面がキャストの立場で要る列だけ（id・name・photo_updated_at・rank_id・is_active）を返す。
--      呼べるのは「その店のキャストで、レジの許可がある（auth_cast_can_register）か、締めの許可がある（auth_cast_close_ok）」人だけ。店長以上・スタッフは今までどおり表を読む（この関数は要らない）。
--   ③ daily_reports_select：キャストが読めるのは締めの許可がある人（auth_cast_close_ok(store_id)）だけ（旧＝レジの許可だけで店の日報の全列）。
--      レジの画面が日報を読むのは「締め済みか」の先回りだけ＝読めなくても RPC 側の 'day closed' が本体（register-board の注記どおり）。
--   seats は変えない。
--   画面の直し（このあとの client 便・フラグ MIG_0201N_APPLIED）：レジ（app/(manage)/register/page.tsx）・日報（report-board.tsx・month-report.tsx）の casts の読取を、キャストの立場のときだけ register_cast_roster に替える。
--
-- 検証クエリ（貼った後に別で流す＝docs/tmp/0201n_verify.sql）：先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs;
--   ・casts_select の qual に auth_cast_can_register が無い／daily_reports_select の qual に auth_cast_close_ok がある
--   ・register_cast_roster が SECURITY DEFINER・search_path public・EXECUTE は authenticated だけ（public／anon は無い）
begin;

-- ② レジ用の一覧（列を絞る）
create or replace function public.register_cast_roster(p_store_id uuid)
returns table (id uuid, name text, photo_updated_at timestamptz, rank_id uuid, is_active boolean)
language plpgsql stable security definer set search_path = public
as $function$
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_store_id is null or p_store_id <> public.auth_store_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'cast' then raise exception 'forbidden'; end if;   -- 店長以上・スタッフは表を直接読む（RLS のまま）
  if not (coalesce(public.auth_cast_can_register(), false) or coalesce(public.auth_cast_close_ok(p_store_id), false)) then raise exception 'forbidden'; end if;
  return query
    select c.id, c.name, c.photo_updated_at, c.rank_id, c.is_active
      from public.casts c
     where c.store_id = p_store_id and c.org_id = public.auth_org_id()
     order by c.name;
end
$function$;
revoke execute on function public.register_cast_roster(uuid) from public, anon;
grant execute on function public.register_cast_roster(uuid) to authenticated;

-- ① casts：キャストは自分の行だけ（auth_cast_can_register の枝を外す）
drop policy if exists casts_select on public.casts;
create policy casts_select on public.casts for select to authenticated using (
  (org_id = public.auth_org_id())
  and ((public.auth_role() = 'owner') or (store_id = public.auth_store_id()))
  and ((public.auth_role() <> 'cast') or (id = public.auth_cast_id()))
);

-- ③ daily_reports：キャストは締めの許可がある人だけ
drop policy if exists daily_reports_select on public.daily_reports;
create policy daily_reports_select on public.daily_reports for select to authenticated using (
  (org_id = public.auth_org_id())
  and ((public.auth_role() = 'owner') or (store_id = public.auth_store_id()))
  and ((public.auth_role() <> 'cast') or public.auth_cast_close_ok(store_id))
);

commit;
