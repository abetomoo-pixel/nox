-- 0201n の検証クエリ v2（手貼りの後・SELECT のみ・1 回で全行）＝先頭は貼り先証明。期待値＝見出しの (expect …)
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all select 'fn count (expect 451)', (select count(*)::text from pg_proc where pronamespace='public'::regnamespace)
union all select 'table count (expect 122)', (select count(*)::text from pg_tables where schemaname='public')
union all select 'casts_select register branch (expect no)', (select case when qual ilike '%auth_cast_can_register%' then 'yes' else 'no' end from pg_policies where schemaname='public' and tablename='casts' and policyname='casts_select')
union all select 'daily_reports_select close_ok (expect yes)', (select case when qual ilike '%auth_cast_close_ok%' and qual not ilike '%auth_cast_can_register%' then 'yes' else 'no' end from pg_policies where schemaname='public' and tablename='daily_reports' and policyname='daily_reports_select')
union all select 'policies on casts+daily_reports (expect 4)', (select count(*)::text from pg_policies where schemaname='public' and tablename in ('casts','daily_reports'))
union all select 'register_cast_roster definer+stable+search_path (expect yes)', (select case when prosecdef and provolatile='s' and proconfig::text like '%search_path=public%' then 'yes' else 'no' end from pg_proc where pronamespace='public'::regnamespace and proname='register_cast_roster')
union all select 'register_cast_roster anon/authenticated (expect false/true)', (select has_function_privilege('anon', oid, 'execute')::text || '/' || has_function_privilege('authenticated', oid, 'execute')::text from pg_proc where pronamespace='public'::regnamespace and proname='register_cast_roster')
union all select 'register_cast_roster is distinct from (expect yes)', (select case when prosrc like '%auth_role() is distinct from ''cast''%' then 'yes' else 'no' end from pg_proc where pronamespace='public'::regnamespace and proname='register_cast_roster')
union all select 'result (expect TABLE(id uuid, name text, photo_updated_at timestamp with time zone, rank_id uuid, is_active boolean))', (select pg_get_function_result(oid) from pg_proc where pronamespace='public'::regnamespace and proname='register_cast_roster')
;
