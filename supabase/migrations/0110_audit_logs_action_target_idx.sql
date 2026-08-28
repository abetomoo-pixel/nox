-- mig0110: audit_logs に (action, target, at) 索引を追加（起票#5）
-- 再適用可（create index if not exists）・手貼り1回
-- 内容: verify 段16 系ほか対象照会が action + target で絞り order by at desc するが、
--   既存索引は pkey / (actor_user_id, at) / (org_id, store_id, at) のみで、
--   母集合の成長により statement timeout に落ちる（2026-08-28 実測: 34,921行で再現）。
-- 不変: データ・関数・ACL・RLS いずれも不触。money 三面鏡不触。golden 6値不変。
-- 正本: docs/NOX_裁定台帳.md 起票#5
-- 単一トランザクション
-- 検証クエリ（適用後に別実行）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   select indexname, indexdef from pg_indexes
--    where schemaname='public' and tablename='audit_logs';
--     -- 期待: audit_logs_action_target_at_idx が (action, target, at DESC) で存在
begin;
select 'nox-project-proof' as proof, count(*) as orgs from public.orgs;

create index if not exists audit_logs_action_target_at_idx
  on public.audit_logs (action, target, at desc);

commit;
-- ===== end mig0110 =====
