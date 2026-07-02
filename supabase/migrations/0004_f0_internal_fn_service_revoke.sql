-- 0004_f0_internal_fn_service_revoke: F0 セキュリティ修正 — audit_log_write の EXECUTE から service_role を剥がす
--
-- 背景（0002 適用後の検証(3)で発覚）:
--   Supabase の既定 grant は「関数にも」service_role へ EXECUTE を付ける。
--   0002 の revoke は public, anon, authenticated の3ロールで service_role を含めておらず、
--   完全内部専用の期待値（EXECUTE 保持者 = owner のみ）に対し service_role が残存していた。
--   実害はほぼ無い（冒頭 null guard により service キー呼び出しは常に forbidden で死に経路・
--   service_role は元々 RLS バイパスの全能ロール）が、期待値との整合のため剥がす。
--
-- ★本 mig は 2026-07-02 に SQL Editor で直接適用済み。本ファイルは再現性のための記録
--   （新環境へは 0001→0004 の番号順適用で同じ状態に到達する）。
--
-- 規約更新（CLAUDE.md）: 内部専用関数の revoke は
--   public, anon, authenticated, service_role の4ロール明示を標準とする。
--
-- 適用後の検証:
--   select p.proname, r.rolname
--   from pg_proc p
--   join aclexplode(p.proacl) a on true
--   join pg_roles r on r.oid = a.grantee
--   where p.proname = 'audit_log_write';
--   -- 期待: postgres（owner）のみ（anon / authenticated / service_role が現れないこと）

begin;

revoke execute on function public.audit_log_write(text, text, jsonb, jsonb, uuid) from service_role;

commit;
