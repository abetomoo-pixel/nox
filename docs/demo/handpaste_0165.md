# 0165 手貼り案内（Agoora 向け・2026-10-08・便 G2-4）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に `supabase/migrations/0165_cast_sales_aggregate_materialized.sql` の全文を貼って Run（1 本だけ・所要 1 分）。
2. 中身は cast_sales_aggregate の CTE に `materialized` を 1 語足すだけ（結果の行は不変・NOIR の月次が 8.7 秒→0.13 秒＝給与プレビューの 500 が直る）。新規 RPC・表なし。
3. Success 後に §3 の検証クエリを貼り、返った値（md5・true／false・件数・ms）をそのまま CC へ。Success の時刻（JST・不明なら「不明」）も添える。

## 1. 貼る前に

| 確認 | 期待 |
|---|---|
| ブラウザのアドレスバー | `https://supabase.com/dashboard/project/hiqbfagmkrdpmlqhkmsu/sql/new`（`project/` の直後が hiqbfagmkrdpmlqhkmsu） |
| ファイル | supabase/migrations/0165_cast_sales_aggregate_materialized.sql（HEAD の現物） |
| sha256 | `75be081a485238a96e70ce6e5cad4ce9621d16e58bd52d43507080ebd91559b0` |
| バイト | 7,756 B |
| 行 | 131（台帳方式＝末尾改行を 1 行と数える）／130（`wc -l`） |
| 改行 | LF・CR 0 |

手元で再計算する場合（Git Bash）:

```bash
sha256sum supabase/migrations/0165_cast_sales_aggregate_materialized.sql
```

ファイルは `begin;`〜`commit;` の単一トランザクション。途中で失敗すれば全部ロールバックされ DB は無傷。エラーが出たら**再実行せず**、エラー文をそのまま CC に貼る。

## 2. 貼る

1. 全文（冒頭コメントから末尾 `-- ===== end 0165 =====` まで）を新しいクエリに貼り **Run**。
2. 「Success. No rows returned」を確認し、その時刻（PC の時計・JST・分単位）を控える。控え忘れは「不明」で確定。

## 3. 検証（値は出さず形だけ返るクエリ）

```sql
select 'nox-project-proof', count(*) from public.orgs;
select left(md5(replace(prosrc, E'\r', '')),8) as cast_sales_aggregate from pg_proc where proname='cast_sales_aggregate';
select left(md5(replace(prosrc, E'\r', '')),8) as get_cast_sales from pg_proc where proname='get_cast_sales';
select position('groups as materialized' in prosrc) > 0 as materialized from pg_proc where proname='cast_sales_aggregate';
select proacl::text from pg_proc where proname='cast_sales_aggregate';
select (select count(*) from pg_proc where pronamespace='public'::regnamespace) as functions, (select count(*) from pg_tables where schemaname='public') as tables;
explain (analyze) select * from public.cast_sales_aggregate((select s.id from public.stores s join public.orgs o on o.id=s.org_id where o.name='NOX-DEMO-NOIR'), '2026-09-01', '2026-09-30');
```

| クエリ | 期待値 |
|---|---|
| nox-project-proof | orgs の件数（本番＝9＝本番 3＋デモ 6。0 や別の数なら貼り先違い） |
| cast_sales_aggregate | **e232dac8**（貼る前は f765c36a） |
| get_cast_sales | **eaec39a4**（不変） |
| materialized | **true** |
| proacl | **{postgres=X/postgres}** |
| functions／tables | **303／83**（不変） |
| explain の最終行 Execution Time | **200 ms 未満**（突合では 82.6 ms） |

## 4. 報告に書くこと（便 P165 の入力）

| 項目 | 値 |
|---|---|
| Success の時刻（JST） | 不明なら「不明」 |
| nox-project-proof | |
| cast_sales_aggregate md5 | |
| get_cast_sales md5 | |
| materialized | |
| proacl | |
| functions／tables | |
| Execution Time | |

期待値と違う行があれば実値をそのまま貼る（CC が live 読取で照合する）。

## 5. 手貼り後に CC がやること（便 P165）

live 照合（md5 e232dac8・ACL・303／83・explain）→ 収蔵（台帳 0165 欄・適用日時）→ 0158 の pin を e232dac8 に絞る → f0 2 連 → push → Vercel → NOIR の給与プレビュー（/payroll 2026-09）が開くことを目視して起票100 をクローズ。
