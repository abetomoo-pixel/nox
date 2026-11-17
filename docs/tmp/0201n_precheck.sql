-- 0201n 事前確認（読取だけ・貼る前に流す）
select 'nox-project-proof', count(*) from public.orgs;
select policyname, qual ilike '%auth_cast_can_register%' as has_register_branch from pg_policies where schemaname='public' and tablename in ('casts','daily_reports') and policyname in ('casts_select','daily_reports_select') order by 1;  -- 期待：2 行とも true
select count(*) as roster_fn from pg_proc where proname = 'register_cast_roster';  -- 期待：0
select count(*) as close_ok_fn from pg_proc where proname = 'auth_cast_close_ok';  -- 期待：1
