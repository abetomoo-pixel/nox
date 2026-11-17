-- 0201n 検証（貼った後に流す・読取だけ）
select 'nox-project-proof', count(*) from public.orgs;
select policyname, qual ilike '%auth_cast_can_register%' as has_register_branch, qual ilike '%auth_cast_close_ok%' as has_close_ok from pg_policies where schemaname='public' and tablename in ('casts','daily_reports') and policyname in ('casts_select','daily_reports_select') order by 1;  -- 期待：casts_select＝f,f／daily_reports_select＝f,t
select p.prosecdef, p.proconfig::text, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x from pg_proc p where p.proname = 'register_cast_roster';  -- 期待：t・{search_path=public}・f・t
select count(*) from pg_policies where schemaname='public' and tablename in ('casts','daily_reports');  -- 期待：4（kiosk の 2 本は不変）
