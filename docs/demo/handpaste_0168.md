# 0168 手貼り案内（Agoora 向け・2026-10-09・便 X-13d-2b 起草＝裁定338＋追補1）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に `supabase/migrations/0168_comp_plan_slide_period.sql` の全文を貼って Run（1 本だけ・所要 1 分）。**0167 の後**に貼る。
2. 中身＝待遇プランに「スライドの判定期間」列（comp_plans.slide_period・既存は daily＝今までどおり）と、set_comp_plan を 23 引数に（末尾 p_slide_period・省略時 daily＝今の画面はそのまま動く）。計算と画面の切替は次の便 P168 で載せる。
3. Success 後に §3 の検証クエリを貼り、返った値（列の型／CHECK の形／daily の件数／引数の末尾／md5／関数数）と Success 時刻（JST・不明なら「不明」）を CC へ。

## 1. 貼る前に

| 確認 | 期待 |
|---|---|
| アドレスバー | `https://supabase.com/dashboard/project/hiqbfagmkrdpmlqhkmsu/sql/new`（`project/` の直後が hiqbfagmkrdpmlqhkmsu） |
| ファイル | supabase/migrations/0168_comp_plan_slide_period.sql（HEAD の現物） |
| sha256 | 便 X-13d-2b の最終報告の値（手元で再計算して一致を見る） |
| 改行 | LF・CR 0 |
| 順序 | 0167（適用済み 2026-10-09 18:24）の後 |

手元で再計算する場合（Git Bash）:

```bash
sha256sum supabase/migrations/0168_comp_plan_slide_period.sql
```

ファイルは `begin;`〜`commit;` の単一トランザクション。途中で失敗すれば全部ロールバックされ DB は無傷。エラーが出たら**再実行せず**、エラー文をそのまま CC へ。

★デモとの順序: デモの payload は既に comp_plans 行に slide_period を持っている（便 X-13d-2b・列が無い間は無視される）ので、**0168 の前後どちらでも毎日 06:05 の reset は壊れない**。

## 2. 貼る

1. SQL Editor の新規タブに `0168_comp_plan_slide_period.sql` の全文（冒頭コメントから `-- ===== end 0168 =====` まで）を貼る。
2. Run。右下に Success が出たら時刻（JST）を控える。

## 3. 検証クエリ（Success の後に 1 つずつ・値ではなく形を見る）

```sql
select 'nox-project-proof', count(*) from public.orgs;                                                                                         -- 9
select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='comp_plans' and column_name='slide_period';   -- text／NO／'daily'::text
select pg_get_constraintdef(oid) from pg_constraint where conname='comp_plans_slide_period_check';                                              -- CHECK ((slide_period = ANY (ARRAY['monthly'::text, 'half'::text, 'daily'::text])))
select count(*) filter (where slide_period='daily') as daily_count, count(*) as total from public.comp_plans;                                -- daily_count＝total
select pg_get_function_identity_arguments(oid) from pg_proc where proname='set_comp_plan';                                                    -- 1 行・末尾が p_slide_period text
select left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname='set_comp_plan';                                                    -- 8 桁（最終報告の値と一致）
select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions, (select count(*) from pg_tables where schemaname='public') tables;   -- 305／83
```

返すもの: 7 行の結果（値は形どおりか）＋ Success 時刻。CC が live 照合（便 P168）→pin 張替え（grants の署名・0158 の md5）→lib／UI（判定期間 3 種）→デモ（ACE／NOIR 月次・LUNA 半月）→f0 2 連→push。
