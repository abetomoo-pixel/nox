-- 0003_f0_table_grant_tighten: F0 セキュリティ修正 — 6テーブルの authenticated grant を SELECT のみに締める
--
-- 背景（0002 適用後の検証(4)で発覚）:
--   Supabase は新規テーブルに anon/authenticated/service_role へ ALL を既定 grant する。
--   0001/0002 は anon のみ revoke したため、authenticated に
--   INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER が残存していた。
--   INSERT/UPDATE/DELETE は「書込ポリシー無し」の RLS で実質遮断されるが、
--   ★TRUNCATE は RLS が適用されない＝authenticated が全テーブルを全消しできる状態だった。
--   append-only（audit_logs）の二重化の趣旨にも、コア5テーブルの防御にも反するため一括修正。
--
-- 方針:
--   「revoke all → 必要 grant のみ戻す」を今後の標準型とする（CLAUDE.md に規約化）。
--   本 mig では6テーブルすべて authenticated=SELECT のみに（書込は RPC/service キー経由の原則どおり）。
--   service_role は触らない（seed/管理・RLS バイパスの正規経路）。
--   revoke/grant は冪等（再実行可）。
--
-- 適用後の検証（"Success" 表示だけを信用しない）:
--   -- 1) 6テーブルの grant 一覧: 6行ちょうど・全行 grantee=authenticated・privs=SELECT・anon 出現なし
--   select table_name, grantee,
--          string_agg(privilege_type, ', ' order by privilege_type) as privs
--   from information_schema.role_table_grants
--   where table_schema = 'public'
--     and table_name in ('orgs','stores','users','memberships','casts','audit_logs')
--     and grantee in ('anon','authenticated')
--   group by table_name, grantee
--   order by table_name, grantee;
--   -- 2) 能動ガード: public スキーマ全体で authenticated が SELECT 以外を持つテーブルが無いこと（0行が正）
--   select table_name, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public' and grantee = 'authenticated'
--     and privilege_type <> 'SELECT'
--   order by table_name, privilege_type;

begin;

-- ── orgs ──────────────────────────────────────────────────────
revoke all on table public.orgs from public, anon, authenticated;
grant select on table public.orgs to authenticated;

-- ── stores ────────────────────────────────────────────────────
revoke all on table public.stores from public, anon, authenticated;
grant select on table public.stores to authenticated;

-- ── users ─────────────────────────────────────────────────────
revoke all on table public.users from public, anon, authenticated;
grant select on table public.users to authenticated;

-- ── memberships ───────────────────────────────────────────────
revoke all on table public.memberships from public, anon, authenticated;
grant select on table public.memberships to authenticated;

-- ── casts ─────────────────────────────────────────────────────
revoke all on table public.casts from public, anon, authenticated;
grant select on table public.casts to authenticated;

-- ── audit_logs（append-only: SELECT 以外の経路ゼロを grant 面でも確定）──
revoke all on table public.audit_logs from public, anon, authenticated;
grant select on table public.audit_logs to authenticated;

commit;
