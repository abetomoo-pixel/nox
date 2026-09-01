-- mig 0123b NOX: check_nominations.ratio_weight の CHECK を (> 0) → (>= 0) へ緩和（裁定110 の器・0123 の器抜け是正）
-- 前提: mig0123 適用済み（check_set_nominations は weight 0 を通すが、テーブル CHECK が insert で拒否していた）
-- 冪等: 可（drop if exists → add）。既存行は全て ratio_weight >= 1 なので validate は通る
-- 裁定110: weight は 0 以上の整数。合計 0 の名簿は RPC 側（v_pos > 0 and v_sumw = 0 → 'bad weight'）で拒否
-- 教訓候補50: RPC の入力検証を緩める mig は、同じ列のテーブル CHECK・NOT NULL・trigger を同 mig で必ず見る
--   （prosrc 緑・バンドル緑でも insert で constraint violation＝教訓47 の裏面）

begin;

alter table public.check_nominations
  drop constraint if exists check_nominations_ratio_weight_check;

alter table public.check_nominations
  add constraint check_nominations_ratio_weight_check check (ratio_weight >= 0);

comment on constraint check_nominations_ratio_weight_check on public.check_nominations is
  'mig0123b 裁定110: weight 0 を許可（按分なし・端数も受けない）。合計 0 は check_set_nominations が拒否';

commit;

-- ===== 検証バンドル（Ctrl+A → Run・1結果セット・5行すべて報告） =====
-- 期待: ord1=1／ord2=true（>= 0）／ord3=true（validated）／ord4=0／ord5=true
with c as (
  select con.oid, con.conname, con.convalidated, pg_get_constraintdef(con.oid) as def
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public' and rel.relname = 'check_nominations' and con.conname = 'check_nominations_ratio_weight_check'
)
select 1 as ord, 'constraint_count' as item, count(*)::text as val, (count(*) = 1) as ok from c
union all
select 2, 'def_ge_zero',      def, def like '%ratio_weight >= 0%' from c
union all
select 3, 'validated',        convalidated::text, convalidated from c
union all
select 4, 'negative_rows',    count(*)::text, count(*) = 0 from public.check_nominations where ratio_weight < 0
union all
select 5, 'comment_0123b',    (obj_description(oid, 'pg_constraint') like '%0123b%')::text, obj_description(oid, 'pg_constraint') like '%0123b%' from c
order by ord;
