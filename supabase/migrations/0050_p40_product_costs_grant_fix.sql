-- 0050_p40_product_costs_grant_fix.sql
-- 0049 の grant 補正。0049 は revoke を DML 列挙にしたため、Supabase が新テーブルに自動付与する
-- REFERENCES / TRIGGER が authenticated に残った（実測 I: authenticated=REFERENCES,SELECT,TRIGGER）。
-- 既存流儀（products の実体＝authenticated は SELECT のみ）に収束させる。
-- 再適用可（revoke all → grant select は冪等）。手貼りは1回。
-- 恒久教訓：新テーブルの revoke は「revoke all from authenticated → 必要分のみ grant」で書く。
--          DML 列挙（insert,update,delete,truncate）は REFERENCES/TRIGGER を取りこぼす。

begin;

revoke all on public.product_costs from public;
revoke all on public.product_costs from anon;
revoke all on public.product_costs from authenticated;
grant select on public.product_costs to authenticated;

commit;
