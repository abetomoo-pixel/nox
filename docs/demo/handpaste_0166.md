# 0166 手貼り案内（Agoora 向け・2026-10-08・便 X-13a）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に `supabase/migrations/0166_product_track_stock.sql` の全文を貼って Run（1 本だけ・所要 1 分）。
2. 中身＝商品に「在庫を管理する」（products.track_stock・既定 true＝今までどおり）と、それを切り替える RPC set_product_track_stock（owner／店長・課金ゲート・監査）。既存データは全部 true＝画面は変わらない。
3. Success 後に §3 の検証クエリを貼り、返った値（列の型／件数／md5／true・false／関数数）と Success 時刻（JST・不明なら「不明」）を CC へ。

## 1. 貼る前に

| 確認 | 期待 |
|---|---|
| アドレスバー | `https://supabase.com/dashboard/project/hiqbfagmkrdpmlqhkmsu/sql/new`（`project/` の直後が hiqbfagmkrdpmlqhkmsu） |
| ファイル | supabase/migrations/0166_product_track_stock.sql（HEAD の現物） |
| sha256 | `ebd23bdb165cf20e580c12dbafee97abda80ab47d56c2f9bbb22660634dc987a` |
| バイト | 5,542 B |
| 行 | 65（台帳方式＝末尾改行を 1 行と数える）／64（`wc -l`） |
| 改行 | LF・CR 0 |

手元で再計算する場合（Git Bash）:

```bash
sha256sum supabase/migrations/0166_product_track_stock.sql
```

ファイルは `begin;`〜`commit;` の単一トランザクション。途中で失敗すれば全部ロールバックされ DB は無傷。エラーが出たら**再実行せず**、エラー文をそのまま CC に貼る。

★デモとの順序: デモの payload は既に products 行に track_stock を持っている（便 X-13a・列が無い間は無視される）ので、**0166 の前後どちらでも毎日 06:05 の巻き戻しは壊れない**。管理しない銘柄（ソフトドリンク等）を false にするのは X-13b。

## 2. 貼る

1. 全文（冒頭コメントから末尾 `-- ===== end 0166 =====` まで）を新しいクエリに貼り **Run**。
2. 「Success. No rows returned」を確認し、その時刻（PC の時計・JST・分単位）を控える。控え忘れは「不明」で確定。

## 3. 検証（値は出さず形だけ返るクエリ）

```sql
select 'nox-project-proof', count(*) from public.orgs;
select data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='products' and column_name='track_stock';
select count(*) filter (where track_stock) as on_count, count(*) as total from public.products;
select left(md5(replace(prosrc, E'\r', '')),8) as set_product_track_stock from pg_proc where proname='set_product_track_stock';
select prosrc like '%billing locked%' as gated from pg_proc where proname='set_product_track_stock';
select has_function_privilege('authenticated', 'public.set_product_track_stock(uuid, boolean)', 'execute') as auth_ok, has_function_privilege('anon', 'public.set_product_track_stock(uuid, boolean)', 'execute') as anon_ok;
select (select count(*) from pg_proc where pronamespace='public'::regnamespace) as functions, (select count(*) from pg_tables where schemaname='public') as tables;
```

| クエリ | 期待値 |
|---|---|
| nox-project-proof | **9**（本番 3＋デモ 6。0 や別の数なら貼り先違い） |
| 列 | **boolean／NO／true** |
| on_count／total | **同じ数**（既存は全部 true） |
| set_product_track_stock md5 | **594c5e98** |
| gated | **true** |
| auth_ok／anon_ok | **true／false** |
| functions／tables | **304／83**（関数 +1） |

## 4. 報告に書くこと（便 P166 の入力）

| 項目 | 値 |
|---|---|
| Success の時刻（JST） | 不明なら「不明」 |
| nox-project-proof | |
| 列（型／NULL／default） | |
| on_count／total | |
| md5 | |
| gated・auth_ok／anon_ok | |
| functions／tables | |

期待値と違う行があれば実値をそのまま貼る（CC が live 読取で照合する）。

## 5. 手貼り後に CC がやること（便 P166）

live 照合（列・md5 594c5e98・ACL・304／83）→ 収蔵（台帳 0166 欄）→ 名簿 A +1（304・'billing locked' 155）→ pin 張替え（billing 155／anon-guard probe／grants G4d／0158 304）→ X-13b（register の select に track_stock・payload で管理しない銘柄を false→gen-demo→check→reset）→ f0 2 連 → push → Vercel。
