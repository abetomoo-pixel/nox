-- =====================================================================
-- NOX mig0105  裁定81（M-⑪）: comp_plans_select を cast_ranks 型に揃える（staff 不可視）
--
-- 内容: comp_plans の SELECT ポリシーを差し替え。
--   owner   … org 全行（不変）
--   manager … 自店全行（不変）
--   cast    … 自店 ∧ 自分の cast_plan.plan_id 行のみ（不変）
--   staff   … 0行（★変更点。賃金条件の原本は staff 遮断＝cast_plan_select と同じ裁定）
--   role null / kiosk … 0行（不変・三値論理で偽）
-- 正本: docs/NOX_裁定台帳.md 裁定81。baseline = live pg_policies（live_M4.sql 306行目）
-- 不変: 他のポリシー・grant・関数は一切触らない。money 三面鏡不触
-- 冪等: drop policy if exists → create policy
-- 単一トランザクション
-- =====================================================================
begin;

drop policy if exists comp_plans_select on public.comp_plans;

create policy comp_plans_select
  on public.comp_plans
  as permissive
  for select
  to authenticated
  using (
    org_id = public.auth_org_id()
    and (
      public.auth_role() = 'owner'
      or (public.auth_role() = 'manager'
          and store_id = public.auth_store_id())
      or (public.auth_role() = 'cast'
          and store_id = public.auth_store_id()
          and exists (
            select 1 from public.cast_plan cp
             where cp.cast_id = public.auth_cast_id()
               and cp.plan_id = comp_plans.id))
    )
  );

commit;
-- ===== end mig0105 =====
