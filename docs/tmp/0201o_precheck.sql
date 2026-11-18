-- 0201o 事前確認 v2（貼る前・SELECT のみ）＝返りが貼り先証明の 1 行だけなら貼ってよい。
-- 前提＝0201m の後（関数 450・表 122）。0201n を先に貼ったなら関数は 451（下の 'count drift' の期待を 451 に直す）。
-- 止める行: 'count drift'／'base drift'（set_store_profile が底本と違う＝md5 536b7ac5969c9d373639e36544c053a4 でない＝作り直し）／'already applied'
select 'nox-project-proof' k, count(*)::text v, 'info: none' info from public.orgs
union all
select 'count drift', 'fn ' || f::text || ' / tables ' || t::text, 'expect fn 450 / tables 122'
  from (select (select count(*) from pg_proc where pronamespace = 'public'::regnamespace) f,
               (select count(*) from pg_tables where schemaname = 'public') t) x
 where f <> 450 or t <> 122
union all
select 'base drift', md5(prosrc), 'expect 536b7ac5969c9d373639e36544c053a4（底本＝2026-11-17 読取）'
  from pg_proc where pronamespace = 'public'::regnamespace and proname = 'set_store_profile'
   and md5(prosrc) <> '536b7ac5969c9d373639e36544c053a4'
   and prosrc not like '%bad reward_axis%'
union all
select 'already applied', 'yes', 'set_store_profile に reward_axis がある'
  from pg_proc where pronamespace = 'public'::regnamespace and proname = 'set_store_profile' and prosrc like '%bad reward_axis%';
