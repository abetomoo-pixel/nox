# 0169 手貼り案内（Agoora 向け・2026-10-09・便 P168 起草＝裁定341）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に `supabase/migrations/0169_nomination_rate_nonretro.sql` の全文を貼って Run（1 本だけ・所要 1 分）。**0168 の後**に貼る。
2. 中身＝レジで「場内→本指名」に切り替えたとき、切替より前に出たドリンクは注文時点の率のまま（非遡及）にする仕組み（check_nominations に切替記録 2 列・check_set_nominations と check_close の改稿・「既出も本指名の率にする」RPC check_nomination_rate_apply）。切替をしない伝票の計算は今までと同じ。
3. Success 後に §3 の検証クエリを貼り、返った値（列 2 行／md5 3 行／true／関数数 306）と Success 時刻（JST・不明なら「不明」）を CC へ。レジのチェック（準備中→有効）は便 P169 で載せる。

## 1. 貼る前に

| 確認 | 期待 |
|---|---|
| アドレスバー | `https://supabase.com/dashboard/project/hiqbfagmkrdpmlqhkmsu/sql/new`（`project/` の直後が hiqbfagmkrdpmlqhkmsu） |
| ファイル | supabase/migrations/0169_nomination_rate_nonretro.sql（HEAD の現物） |
| sha256 | 便 P168 の最終報告の値（手元で再計算して一致を見る） |
| 改行 | LF・CR 0 |
| 順序 | 0168（適用済み 2026-10-09 18:48）の後 |

手元で再計算する場合（Git Bash）:

```bash
sha256sum supabase/migrations/0169_nomination_rate_nonretro.sql
```

ファイルは `begin;`〜`commit;` の単一トランザクション。途中で失敗すれば全部ロールバックされ DB は無傷。エラーが出たら**再実行せず**、エラー文をそのまま CC へ。

★デモとの順序: check_nominations の新列は NULL 可＝payload に無くても reset は通る。0169 の前後どちらでも毎日 06:05 の reset は影響なし。

## 2. 貼る

1. SQL Editor の新規タブに `0169_nomination_rate_nonretro.sql` の全文（冒頭コメントから `-- ===== end 0169 =====` まで）を貼る。
2. Run。右下に Success が出たら時刻（JST）を控える。

## 3. 検証クエリ（Success の後に 1 つずつ・値ではなく形を見る）

```sql
select 'nox-project-proof', count(*) from public.orgs;                                                                                         -- 9
select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='check_nominations' and column_name in ('prev_kind','kind_changed_at') order by 1;   -- 2 行・YES
select proname, left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname in ('check_set_nominations','check_close','check_nomination_rate_apply') order by 1;   -- 3 行（md5 は最終報告の値）
select prosrc like '%billing locked%' from pg_proc where proname='check_nomination_rate_apply';                                                -- true
select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions, (select count(*) from pg_tables where schemaname='public') tables;   -- 306／83
```

返すもの: 5 行の結果（値は形どおりか）＋ Success 時刻。CC が live 照合（便 P169）→名簿 157／306・pin 張替え（billing／anon-guard／grants／0158）→レジのチェックを有効化（切替ダイアログ）→f0 2 連→push。
