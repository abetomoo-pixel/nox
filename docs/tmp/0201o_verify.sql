-- 0201o の検証クエリ v2（手貼りの後・SELECT のみ・1 回で全行）＝先頭は貼り先証明。期待値＝見出しの (expect …)。0201n を先に貼ったなら関数は 451。
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all select 'fn count (expect 450)', (select count(*)::text from pg_proc where pronamespace='public'::regnamespace)
union all select 'table count (expect 122)', (select count(*)::text from pg_tables where schemaname='public')
union all select 'reward_axis key + check (expect yes)', (select case when prosrc like '%''reward_axis'',%' and prosrc like '%bad reward_axis%' and prosrc like '%v_settings - ''reward_axis''%' then 'yes' else 'no' end from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile')
union all select 'kiosk_features inventory/report (expect yes)', (select case when prosrc like '%(''punch'',''register'',''shift'',''inventory'',''report'')%' then 'yes' else 'no' end from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile')
union all select 'biz_type host (expect yes)', (select case when prosrc like '%''lounge'',''bar'',''host'')%' then 'yes' else 'no' end from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile')
union all select 'definer + search_path (expect yes)', (select case when prosecdef and proconfig::text like '%search_path=public%' then 'yes' else 'no' end from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile')
union all select 'acl (expect {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres})', (select proacl::text from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile')
;
