-- =============================================================
-- mig0127b: mig0127 の revoke 不足是正(標準型③へ整合)
--   0127 は authenticated から insert/update/delete のみ剥奪
--   → auto-grant 残置の TRUNCATE/REFERENCES/TRIGGER を含め全剥奪→select のみ戻す
--   0127 とセット適用(0124+0124b の型)。冪等: 可
-- =============================================================
begin;

revoke all on table public.pricing_categories from public, anon, authenticated;
grant select on table public.pricing_categories to authenticated;

commit;

-- 検証バンドル(単一結果セット・全列 true で緑)
select
  has_table_privilege('authenticated','public.pricing_categories','select')         as auth_select,
  not has_table_privilege('authenticated','public.pricing_categories','insert')     as auth_no_insert,
  not has_table_privilege('authenticated','public.pricing_categories','update')     as auth_no_update,
  not has_table_privilege('authenticated','public.pricing_categories','delete')     as auth_no_delete,
  not has_table_privilege('authenticated','public.pricing_categories','truncate')   as auth_no_truncate,
  not has_table_privilege('authenticated','public.pricing_categories','references') as auth_no_references,
  not has_table_privilege('authenticated','public.pricing_categories','trigger')    as auth_no_trigger,
  not has_table_privilege('anon','public.pricing_categories','select')              as anon_no_select,
  not has_table_privilege('anon','public.pricing_categories','truncate')            as anon_no_truncate;
