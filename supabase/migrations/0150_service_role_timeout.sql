-- 0150_service_role_timeout.sql
-- 裁定277-1（2026-09-18）: demo_org_reset（0149）の削除＋投入が authenticator の statement_timeout 8s（docs/tmp/0149_pre.md w4）を超える見込みのため、
--   service_role のロール設定で statement_timeout を 30s に（関数レベル SET は不採用）。PostgREST は authenticator で接続し `set role service_role` するため
--   ロール設定（pg_db_role_setting）は role 切替時に適用される＝効かなければ route から wipe→load の 2 回呼び（277-1）。
-- ★相談役指定（本便 AC）: alter role … set statement_timeout='30s' と notify pgrst のみ。他ロール（anon 3s／authenticated 8s）は不触。
--
-- 適用後の検証:
--   select 'nox-project-proof', count(*) from public.orgs;                                                          -- 3
--   select r.rolname, s.setconfig from pg_db_role_setting s join pg_roles r on r.oid = s.setrole where r.rolname = 'service_role';   -- {statement_timeout=30s}
--   -- 実効（service key・PostgREST 経由）: select pg_sleep(9) を service key の rpc 相当で呼び 8s で切れないこと（要 1 発実測・route から）。

begin;

alter role service_role set statement_timeout = '30s';
notify pgrst, 'reload config';

commit;

-- 手貼り末尾の確認（0147／0148 と同形）:
-- select 'nox-project-proof', count(*) from public.orgs;                                                             -- 3
-- select r.rolname, s.setconfig from pg_db_role_setting s join pg_roles r on r.oid = s.setrole where r.rolname = 'service_role';
