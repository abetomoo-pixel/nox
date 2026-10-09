# 0167 手貼り案内（Agoora 向け・2026-10-09・便 X-13d-2a 起草＝裁定337）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に `supabase/migrations/0167_cast_shift_request_mode.sql` の全文を貼って Run（1 本だけ・所要 1 分）。
2. 中身＝キャストに「シフト希望の方式」の個別設定列（casts.shift_request_mode・NULL＝店の既定に従う＝今までどおり）と、それを変える RPC set_cast_shift_request_mode（owner／店長・課金ゲート・監査）。既存の動きは変わらない（client は d-2b で載せる）。
3. Success 後に §3 の検証クエリを貼り、返った値（列の型／CHECK の形／null 件数／md5／true／関数数）と Success 時刻（JST・不明なら「不明」）を CC へ。

## 1. 貼る前に

| 確認 | 期待 |
|---|---|
| アドレスバー | `https://supabase.com/dashboard/project/hiqbfagmkrdpmlqhkmsu/sql/new`（`project/` の直後が hiqbfagmkrdpmlqhkmsu） |
| ファイル | supabase/migrations/0167_cast_shift_request_mode.sql（HEAD の現物） |
| sha256 | 便 X-13d-2a の最終報告の値（手元で再計算して一致を見る） |
| 改行 | LF・CR 0 |

手元で再計算する場合（Git Bash）:

```bash
sha256sum supabase/migrations/0167_cast_shift_request_mode.sql
```

ファイルは `begin;`〜`commit;` の単一トランザクション。途中で失敗すれば全部ロールバックされ DB は無傷。エラーが出たら**再実行せず**、エラー文をそのまま CC へ。

★デモとの順序: casts の新列は NULL 可＝payload に無くても reset は通る。0167 の前後どちらでも毎日 06:05 の reset は影響なし。裁定337 のデモ（3 方式が混ざる）は 0167 の後の d-2b で payload に入れる。

## 2. 貼る

1. SQL Editor の新規タブに `0167_cast_shift_request_mode.sql` の全文（冒頭コメントから `-- ===== end 0167 =====` まで）を貼る。
2. Run。右下に Success が出たら時刻（JST）を控える。

## 3. 検証クエリ（Success の後に 1 つずつ・値ではなく形を見る）

```sql
select 'nox-project-proof', count(*) from public.orgs;                                                                                         -- 9
select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='casts' and column_name='shift_request_mode';   -- text／YES／null
select pg_get_constraintdef(oid) from pg_constraint where conname='casts_shift_request_mode_check';                                              -- CHECK ((shift_request_mode IS NULL) OR (shift_request_mode = ANY (ARRAY['shift'::text, 'off_only'::text])))
select count(*) filter (where shift_request_mode is null) as null_count, count(*) as total from public.casts;                                   -- null_count＝total
select left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname='set_cast_shift_request_mode';                                        -- 8 桁（最終報告の値と一致）
select prosrc like '%billing locked%' from pg_proc where proname='set_cast_shift_request_mode';                                                 -- true
select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions, (select count(*) from pg_tables where schemaname='public') tables;   -- 305／83
```

返すもの: 7 行の結果（値は形どおりか）＋ Success 時刻。CC が live 照合（便 P167）→名簿 305・pin 張替え→f0 2 連→push。
