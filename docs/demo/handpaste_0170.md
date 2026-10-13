# 0170 手貼り案内（Agoora 向け・2026-10-13・便 W5-2a 起草＝裁定343）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に `supabase/migrations/0170_comp_plan_slide_basis.sql` の全文を貼って Run（1 本だけ・所要 1 分）。**0169 の後**に貼る。
2. 中身＝待遇プランのスライドに「判定基準（売上／本指名の件数／同伴の件数）」と「対象ランク（空＝全員）」の列 2 つを足し、set_comp_plan を 25 引数にする（既存の 23 引数の呼び出しは既定値で通る・既存 21 プランは読み替えなし＝売上・全員のまま）。
3. Success 後に §3 の検証クエリを貼り、**返った値（列 2 行／CHECK／unchanged＝total／引数 1 行／md5 1cddaa0e／306・83）を CC へ貼る**。計算と UI の結線は便 W5-2b。

## 1. 貼る前に

| 確認 | 期待 |
|---|---|
| アドレスバー | `https://supabase.com/dashboard/project/hiqbfagmkrdpmlqhkmsu/sql/new`（`project/` の直後が hiqbfagmkrdpmlqhkmsu） |
| ファイル | supabase/migrations/0170_comp_plan_slide_basis.sql（HEAD の現物） |
| sha256 | `f854521f7899fc6151469d69208bac1eb87348989202992b63d6d98fcc6886bb`（17,200 B・192 行（台帳方式）／191（wc -l）・LF） |
| 改行 | LF・CR 0 |
| 順序 | 0169（適用済み 2026-10-13 11:34）の後 |

手元で再計算する場合（Git Bash）:

```bash
sha256sum supabase/migrations/0170_comp_plan_slide_basis.sql
```

ファイルは `begin;`〜`commit;` の単一トランザクション。途中で失敗すれば全部ロールバックされ DB は無傷。エラーが出たら**再実行せず**、エラー文をそのまま CC へ。

★デモとの順序: comp_plans に NOT NULL 列が増える（既定付き）。payload の comp_plans 行に新列が無くても、demo_org_reset の jsonb_populate_recordset は NULL を入れる＝**0170 の後の reset は失敗し得る**。W5-2b の payload（slide_basis／slide_rank_ids 入り）が push→Vercel success になるまで、手動 reset はしない（06:05 の自動 reset は W5-2b の push を同日中に済ませる＝便の順序）。

## 2. 貼る

1. SQL Editor の新規タブに `0170_comp_plan_slide_basis.sql` の全文（冒頭コメントから `-- ===== end 0170 =====` まで）を貼る。
2. Run。右下に Success が出たら時刻（JST）を控える。

## 3. 検証クエリ（Success の後に 1 つずつ・値ではなく形を見る）

```sql
select 'nox-project-proof', count(*) from public.orgs;                                                                                         -- 9
select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='comp_plans' and column_name in ('slide_basis','slide_rank_ids') order by 1;   -- 2 行・NO／'sales'::text・'{}'::uuid[]
select pg_get_constraintdef(oid) from pg_constraint where conname='comp_plans_slide_basis_check';                                               -- CHECK ((slide_basis = ANY (ARRAY['sales','hon_count','dohan_count'])))
select count(*) filter (where slide_basis='sales' and slide_rank_ids='{}') as unchanged, count(*) as total from public.comp_plans;          -- unchanged＝total（21／21）
select pg_get_function_identity_arguments(oid) from pg_proc where proname='set_comp_plan';                                                    -- 1 行・末尾が p_slide_rank_ids uuid[]（23 引数版は無い）
select left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname='set_comp_plan';                                                    -- 1cddaa0e
select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions, (select count(*) from pg_tables where schemaname='public') tables;   -- 306／83
```

返すもの: 7 行の結果（値は形どおりか）＋ Success 時刻。CC が live 照合（便 W5-2b）→0158 の md5 pin 張替え→lib（collect／assemble／core／breakdown）と UI（plan-editor 節④の基準・対象）の結線→payload→f0 2 連→push→6 店 reset。

**Success 表示は適用の証明にならない（恒久注意28）＝上の検証クエリの返り値（値の形）を貼ってから次便を出す。1 行でも形が違えば未適用として CC が停止する。**
