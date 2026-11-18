-- 0201n 事前確認 v2（貼る前・SELECT のみ）＝返りが貼り先証明の 1 行だけなら貼ってよい。前提＝0201m の後（関数 450・表 122）。
-- 止める行: 'count drift'（450／122 でない）／'already applied'（register_cast_roster がある）／'policy drift'（casts_select・daily_reports_select が起草のときの形でない）／'close_ok missing'
select 'nox-project-proof' k, count(*)::text v, 'info: none' info from public.orgs
union all
select 'count drift', 'fn ' || f::text || ' / tables ' || t::text, 'expect fn 450 / tables 122'
  from (select (select count(*) from pg_proc where pronamespace = 'public'::regnamespace) f,
               (select count(*) from pg_tables where schemaname = 'public') t) x
 where f <> 450 or t <> 122
union all
select 'already applied', 'yes', 'register_cast_roster exists'
  from pg_proc where pronamespace = 'public'::regnamespace and proname = 'register_cast_roster'
union all
select 'policy drift', policyname, 'qual に auth_cast_can_register が無い（起草のときの形でない）'
  from pg_policies where schemaname = 'public' and tablename in ('casts','daily_reports') and policyname in ('casts_select','daily_reports_select')
   and qual not ilike '%auth_cast_can_register%'
union all
select 'close_ok missing', 'no', 'auth_cast_close_ok(uuid) が無い'
 where not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'auth_cast_close_ok');
