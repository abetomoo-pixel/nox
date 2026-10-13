# 0171 手貼り案内（Agoora 向け・2026-10-13・便 N1013b 起草＝裁定347（読取）＋GV-2・★起草のみ＝相談役の裁定後に貼る）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に `supabase/migrations/0171_plan_norm_targets_axes.sql` の全文を貼って Run（1 本だけ・所要 1 分）。**0170 の後**に貼る。**相談役が 347 と GV-2 を裁くまで貼らない。**
2. 中身＝待遇プランに「プラン既定の目標 4 軸」（出勤日数・同伴・売上・指名＝null＝継承なし）の列 4 つを足し set_comp_plan を 29 引数にする（既存の 25 引数の呼び出しは既定で挙動不変）＋店設定「ノルマの採用軸」（settings_json.norm_axes）を書く専用 RPC set_store_norm_axes を足す。既存データの読み替えなし。
3. Success 後に §3 の検証クエリを貼り、**返った値（列 4 行／unchanged＝total／引数 1 行／md5 4fa34575／proacl／307・83）を CC へ貼る**。client（継承・上書き印・「プランの既定に戻す」・OFF 軸の非表示）は適用後の便。

## 1. 貼る前に

| 確認 | 期待 |
|---|---|
| アドレスバー | `https://supabase.com/dashboard/project/hiqbfagmkrdpmlqhkmsu/sql/new`（`project/` の直後が hiqbfagmkrdpmlqhkmsu） |
| ファイル | supabase/migrations/0171_plan_norm_targets_axes.sql（HEAD の現物） |
| sha256 | `cf0b8a6313a8ffb7cf1242023fa6d50094033d7745e0be7db42e83dd32b56c97`（19,486 B・226 行（台帳方式）／225（wc -l）・LF） |
| 改行 | LF・CR 0 |
| 順序 | 0170（適用済み 2026-10-13）の後 |

手元で再計算する場合（Git Bash）:

```bash
sha256sum supabase/migrations/0171_plan_norm_targets_axes.sql
```

ファイルは `begin;`〜`commit;` の単一トランザクション。途中で失敗すれば全部ロールバックされ DB は無傷。エラーが出たら**再実行せず**、エラー文をそのまま CC へ。

★デモとの順序: comp_plans に増える列は null 既定＝payload の comp_plans 行に無くても reset は失敗しない（0170 のときの NOT NULL 問題は無い）。settings_json.norm_axes は欠損＝全軸 ON＝デモ 6 店は不変。

## 2. 貼る

1. SQL Editor の新規タブに `0171_plan_norm_targets_axes.sql` の全文（冒頭コメントから `-- ===== end 0171 =====` まで）を貼る。
2. Run。右下に Success が出たら時刻（JST）を控える。

## 3. 検証クエリ（Success の後に 1 つずつ・値ではなく形を見る）

```sql
select 'nox-project-proof', count(*) from public.orgs;                                                                                         -- 9
select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='comp_plans' and column_name like 'norm_%_target' order by 1;   -- 4 行・integer・YES
select count(*) filter (where norm_days_target is null and norm_dohan_target is null and norm_sales_target is null and norm_shimei_target is null) as unchanged, count(*) as total from public.comp_plans;   -- unchanged＝total
select pg_get_function_identity_arguments(oid) from pg_proc where proname='set_comp_plan';                                                    -- 1 行・末尾が p_norm_shimei_target integer（25 引数版は無い）
select left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname='set_comp_plan';                                                    -- 4fa34575
select proacl::text from pg_proc where proname='set_store_norm_axes';                                                                        -- authenticated／service_role のみ（anon なし）
select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions, (select count(*) from pg_tables where schemaname='public') tables;   -- 307／83
```

返すもの: 7 行の結果（値は形どおりか）＋ Success 時刻。CC が live 照合→0158 の md5 pin 張替え（1cddaa0e→4fa34575）・名簿（関数 307・'billing locked' 158）・anon-guard に set_store_norm_axes の 1 本→client（lib/nox/store/norm-axes.ts・plan-editor の既定目標・cast-comp のノルマ表の薄濃・/mine ノルマカードの軸）→f0 2 連→push。

**Success 表示は適用の証明にならない（恒久注意28）＝上の検証クエリの返り値（値の形）を貼ってから次便を出す。1 行でも形が違えば未適用として CC が停止する。**
