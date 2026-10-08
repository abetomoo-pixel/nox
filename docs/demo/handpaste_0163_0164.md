# 0163 → 0164 手貼り案内（Agoora 向け・2026-10-08・便 V-2）

対象＝本番 DB（ref **hiqbfagmkrdpmlqhkmsu**）。0001〜0162 は適用済み。本書は 0163（デモ cron・demo_entries）→ 0164（店設定 7 列）の 2 本を SQL Editor に手貼りする手順。所要＝各 1 分程度。**順番は 0163 → 0164**（0164 の検証クエリの「関数 303」は 0163 後の値を前提にしている）。

## 0. 貼る前に（3 つ）

1. **貼り先の URL を目視する**。ブラウザのアドレスバーが次の形で、`project/` の直後が `hiqbfagmkrdpmlqhkmsu` であることを読む（別プロジェクトのタブと取り違えない）:
   `https://supabase.com/dashboard/project/hiqbfagmkrdpmlqhkmsu/sql/new`
   SQL Editor の左上のプロジェクト名も合わせて見る。**ref が違えば貼らない**。
2. **ファイルの同一性を確認する**（repo の HEAD c8a402e＝origin/main の現物。手元で再計算する場合は Git Bash で）:

   ```bash
   sha256sum supabase/migrations/0163_demo_entries_cron.sql supabase/migrations/0164_store_ops_settings.sql
   ```

   | mig | ファイル | sha256 | バイト | 行 |
   |---|---|---|---|---|
   | 0163 | supabase/migrations/0163_demo_entries_cron.sql | `f5b8bc61d6928a6f91ed2b5611c7084fca100907d7dfb22ad48a0a2fc3973530` | 9,887 B | 103（`wc -l`）／104（台帳・v43 の数え方＝末尾改行を 1 行と数える） |
   | 0164 | supabase/migrations/0164_store_ops_settings.sql | `02d378983e202eacae914e5c9cf4489732dbb32526d6f366e5612ac3a2f4dcfc` | 45,322 B | 457（`wc -l`）／458（同上） |

   どちらも LF・CR 0・末尾改行あり。sha とバイト数が一致していれば行数の数え方の差は気にしない。
3. 各ファイルは **begin; 〜 commit; の単一トランザクション**。途中で失敗すれば全部ロールバックされ、DB は無傷（2026-07-02 の貼り先ミスが単一トランザクションでロールバックされ無傷だった実績＝CLAUDE.md）。エラーが出たら**再実行せず**、エラー文をそのまま CC に貼る。

## 1. 0163 を貼る（デモ cron・demo_entries）

1. `supabase/migrations/0163_demo_entries_cron.sql` の**全文**（冒頭コメントから末尾 `-- ===== end 0163 =====` まで）を SQL Editor の新しいクエリに貼り、**Run**。
2. 「Success. No rows returned」を確認したら、**その時刻を控える**（§4）。
3. 続けて次の検証クエリを貼って Run（1 本目の `nox-project-proof` が貼り先証明＝orgs の件数が返れば本番。0 や別の数ならその場で止めて報告）:

   ```sql
   select 'nox-project-proof', count(*) from public.orgs;
   select extname, extversion from pg_extension where extname in ('pg_cron','pg_net') order by 1;            -- 2 行
   select count(*) as cron_jobs from cron.job where jobname like 'nox-demo-%';                                -- 8
   select jobname, schedule, active from cron.job where jobname like 'nox-demo-%' order by jobname;          -- 8 行・active true
   select to_regclass('public.demo_entries') as demo_entries;                                                 -- demo_entries（null なら表が無い）
   select relrowsecurity from pg_class where oid = 'public.demo_entries'::regclass;                          -- true
   select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='demo_entries' and grantee<>'postgres' order by 1,2;  -- service_role の INSERT／SELECT のみ
   select left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname='demo_entries_purge';           -- fdc33bb7
   select left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname='demo_org_reset';               -- a4bd6a18（不変）
   select (select count(*) from pg_proc where pronamespace='public'::regnamespace) as functions,
          (select count(*) from pg_tables where schemaname='public') as tables;                              -- 303／83
   ```

   期待値: 拡張 2 行／cron_jobs **8**／demo_entries が返る／RLS true／grant は service_role の INSERT・SELECT だけ／demo_entries_purge **fdc33bb7**／demo_org_reset **a4bd6a18**／関数 **303**・表 **83**。
4. cron job は Vault の `nox_demo_reset_url`／`nox_cron_secret` を実行時に読む。**Vault 2 本は別途**（docs/demo/cron_setup.md §2・同じ SQL Editor・貼り先証明を先頭に）。Vault が無い間に job が走っても url が null で失敗するだけ＝害なし。

## 2. 0164 を貼る（stores +7 列・set_store_profile 置換）

1. 0163 の Success を確認してから、`supabase/migrations/0164_store_ops_settings.sql` の**全文**（末尾 `-- ===== end 0164 =====` まで）を新しいクエリに貼り、**Run**。
2. 「Success. No rows returned」を確認したら時刻を控える（§4）。
3. 検証クエリ:

   ```sql
   select 'nox-project-proof', count(*) from public.orgs;
   select column_name, data_type, column_default
     from information_schema.columns
    where table_schema='public' and table_name='stores'
      and column_name in ('invoice_registered_on','pay_day','tax_inclusive_display','use_vip','use_counter','payment_methods','punch_methods')
    order by 1;                                                                                               -- 7 行
   select left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname='set_store_profile';            -- 2e7b4963
   select left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname='demo_org_reset';               -- a4bd6a18（不変）
   select (select count(*) from pg_proc where pronamespace='public'::regnamespace) as functions,
          (select count(*) from pg_tables where schemaname='public') as tables;                              -- 303／83（0164 は関数・表を増やさない）
   select count(*) from public.stores where pay_day between 1 and 31 and use_vip is not null and use_counter is not null;  -- 既存の全店舗数（既定で埋まる）
   ```

   期待値: stores の列 **7 行**＝`invoice_registered_on`（date・default なし）／`pay_day`（integer・25）／`tax_inclusive_display`（boolean・false）／`use_vip`（boolean・true）／`use_counter`（boolean・true）／`payment_methods`（jsonb・{cash:true,card:true,emoney:false,qr:false}）／`punch_methods`（jsonb・{self:true,proxy:true,kiosk:true}）。set_store_profile **2e7b4963**（4f2e9f82 から変わる）・demo_org_reset **a4bd6a18**・関数 **303**／表 **83**（0163 後と同じ）。

## 3. 報告に書くこと（CC 便 P163 の入力）

| 項目 | 0163 | 0164 |
|---|---|---|
| Success の時刻（JST） | （§4 の方法で・不明なら「不明」） | 同左 |
| 貼り先証明 `nox-project-proof` の件数 | | |
| cron_jobs | 8 | — |
| demo_entries | 表あり | — |
| stores 列 7 | — | 7 行 |
| md5 | demo_entries_purge fdc33bb7／demo_org_reset a4bd6a18 | set_store_profile 2e7b4963／demo_org_reset a4bd6a18 |
| 関数／表 | 303／83 | 303／83 |

期待値と違う行があれば、その行の実値をそのまま貼る（CC が live 読取で照合する）。

## 4. Success 時刻の控え方

- Run の直後に SQL Editor 右下（または結果タブ）の「Success」表示を見た時点の PC の時計（JST）を分単位で控える（例「10/8 14:32」）。
- 控え忘れたときは、Supabase Dashboard → Logs → Postgres で `create extension` や `alter table public.stores` の行を探して時刻を読む。見つからなければ**「不明」で確定**（0161／0162 と同じ扱い・恒久注意）。

## 5. 手貼り後に CC がやること（便 P163・v43 §9-3）

live 照合（cron.job 8・demo_entries・stores 列 7・md5）→ 0163／0164 の収蔵・名簿（0163 で B+1＝303）・台帳 0163／0164 欄・pin 張替え（grants・anon-guard・billing・0158・store-profile・setup・demo-payload）・columns スナップショット取り直し→gen-demo 再実行→f0 2 連→push→Vercel→D2。
