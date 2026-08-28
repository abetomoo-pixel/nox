-- mig0111: C3/C4 税・会計ルールの器（C3-1・裁定90）
-- 再適用可（add column if not exists・制約は冪等ガード付き）・手貼り1回
-- 内容: 設計書 docs/NOX_C34設計書v1.md §2 の mig 段。
--   stores に C4 の4分離列（business_tax_status / price_display / invoice_status
--   ＋invoice_reg_no / tax_rounding）と card_surcharge_rate（器・null=無効）、
--   products / pricing_rules に tax_category、check_lines に tax_category
--   スナップショット列を追加する。
-- 不変: 全列 default=現行挙動（taxable・tax_included・unregistered・floor・
--   card_surcharge 無効・全項目 taxable_10）。読み手ゼロ＝挙動不変。
--   関数・ACL・RLS・データ不触。money 三面鏡不触。golden 6値不変が受け入れ条件。
--   check_lines への NOT NULL default 追加は PG11+ のメタデータ操作＝既存行の書換なし。
--   経路実測: docs/dp/survey_c3_lines.md（insert 7本すべて列指定＝default 追加安全）。
--   discount 行の tax_category は計算上使用しない（挙動段で定義・T4）。
--   registered ⊂ taxable は表制約＋挙動段の RPC ガードの二重化。
-- 正本: docs/NOX_C34設計書v1.md・docs/NOX_裁定台帳.md 裁定90
-- 単一トランザクション
-- 検証クエリ（適用後に別実行）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   select table_name, column_name, column_default, is_nullable
--     from information_schema.columns
--    where table_schema='public'
--      and column_name in ('business_tax_status','price_display','invoice_status',
--                          'invoice_reg_no','tax_rounding','card_surcharge_rate',
--                          'tax_category')
--    order by table_name, column_name;
--     -- 期待: stores 6列・products 1列・pricing_rules 1列・check_lines 1列
--   select conname from pg_constraint
--    where conname = 'stores_invoice_requires_taxable';
--     -- 期待: 1行
--   select count(*) from public.check_lines where tax_category <> 'taxable_10';
--     -- 期待: 0（既存行はすべて default）
--   notify pgrst, 'reload schema';

begin;
select 'nox-project-proof' as proof, count(*) as orgs from public.orgs;

-- C4: 店舗設定の4分離＋card_surcharge 器
alter table public.stores
  add column if not exists business_tax_status text not null default 'taxable'
    check (business_tax_status in ('taxable','exempt')),
  add column if not exists price_display text not null default 'tax_included'
    check (price_display in ('tax_included','tax_excluded')),
  add column if not exists invoice_status text not null default 'unregistered'
    check (invoice_status in ('registered','unregistered')),
  add column if not exists invoice_reg_no text
    check (invoice_reg_no is null or invoice_reg_no ~ '^T[0-9]{13}$'),
  add column if not exists tax_rounding text not null default 'floor'
    check (tax_rounding in ('floor','round','ceil')),
  add column if not exists card_surcharge_rate integer
    check (card_surcharge_rate is null or card_surcharge_rate between 1 and 100);

-- registered ⊂ taxable（クロス列・名前付き・冪等ガード）
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'stores_invoice_requires_taxable') then
    alter table public.stores add constraint stores_invoice_requires_taxable
      check (invoice_status <> 'registered' or business_tax_status = 'taxable');
  end if;
end $$;

-- C3: 料金項目マスタの税区分（enum 4値完備・UI 露出は3値=裁定90-②）
alter table public.products
  add column if not exists tax_category text not null default 'taxable_10'
    check (tax_category in ('taxable_10','taxable_8','exempt','out_of_scope'));

alter table public.pricing_rules
  add column if not exists tax_category text not null default 'taxable_10'
    check (tax_category in ('taxable_10','taxable_8','exempt','out_of_scope'));

-- C3: 伝票スナップショット（裁定90-①）
alter table public.check_lines
  add column if not exists tax_category text not null default 'taxable_10'
    check (tax_category in ('taxable_10','taxable_8','exempt','out_of_scope'));

commit;
-- ===== end mig0111 =====
