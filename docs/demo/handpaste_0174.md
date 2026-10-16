# 0174 手貼り案内（Agoora 向け・2026-10-16 起草・便 M173＝裁定390／起票110／394／395＋kiosk スタッフ群（P172 Q-4）＋デモ payload（P172 Q-8））

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に `supabase/migrations/0174_comp_norm_staff.sql` の全文を貼って Run（1 本だけ・所要 1〜3 分）。****0173 の後**（0173 が set_store_profile を改稿するため・0174 は同じ関数を触らない）**
2. 中身＝①スライド段数 1〜10（comp_plan_slide_check）②達成ボーナスの多段（thresholds の各要素に amount＝移行 SQL・live 2 行）③ノルマ未達の減額 4 軸（penalty_config +5 列・set_penalty_config 17 引数）④スライドの判定タイミング（comp_plans.slide_apply null・set_comp_plan 30 引数）⑤打刻端末のスタッフ群（kiosk_staff_list／staff_punch）⑥demo_org_reset の配列に staff 3 表＋terms_acceptances。既存データの読み替え＝achievement_bonus の thresholds に amount を足すだけ（live 2 行・値はコンポーネントの amount）。slide_apply は全プラン null（店設定に従う）。
3. Success 後に §3 の検証クエリを貼り、**返った値（9／6 行／4 行／md5 6 本／proacl 6 行／migrated＝total／0／0／1 行／314・87・160）を CC へ貼る**。client（スライド可変行・達成ボーナス多段・ノルマ減額 4 軸・プランの判定タイミング・打刻端末のスタッフ画面・payload 4 表）は適用後の便（P173）。

## 1. 貼る前に

| 確認 | 期待 |
|---|---|
| アドレスバー | `https://supabase.com/dashboard/project/hiqbfagmkrdpmlqhkmsu/sql/new`（`project/` の直後が hiqbfagmkrdpmlqhkmsu） |
| ファイル | supabase/migrations/0174_comp_norm_staff.sql（HEAD の現物） |
| sha256 | `8c2df449a1648f22b5a060f75931fd300e102bac796153abe02421ada9b9f009`（45,628 B・613 行・LF・CR 0） |
| 改行 | LF・CR 0 |
| 順序 | **0173 の後**（0173 が set_store_profile を改稿するため・0174 は同じ関数を触らない） |
| 生成器 | docs/tmp/gen_0174.mjs（写経元＝docs/tmp/0173_live.json＝2026-10-16 読取。live の関数の md5（\r 込み）が pin と一致しないと生成しない） |
| 構文検査 | scripts/mig-check.mjs＝libpg_query（全体）＋ローカル Postgres（plpgsql・ROLLBACK）で **errors 0**（2026-10-16・docs/dp/mig_check.md・恒久注意30） |

手元で再計算する場合（Git Bash）:

```bash
sha256sum supabase/migrations/0174_comp_norm_staff.sql
```

ファイルは `begin;`〜`commit;` の単一トランザクション。冒頭と検証の 1 本目に貼り先証明 `select 'nox-project-proof', count(*) from public.orgs;`。途中で失敗すれば全部ロールバックされ DB は無傷。エラーが出たら**再実行せず**、エラー文をそのまま CC へ。

★デモとの順序: comp_plans.slide_apply は null＝reset の payload に無くても失敗しない。penalty_config の新 5 列は既定（0／0／0／0／10000）。demo_org_reset の c_load に 4 表が増えるだけ＝現行 payload（4 表なし）は従来どおり通る。
★client との順序: set_penalty_config の新 5 引数は既定あり（旧 12 引数呼びはそのまま通る）・set_comp_plan の p_slide_apply は default null（旧 29 引数呼びはそのまま通る）＝EX-1 までの橋。UI は明示値を渡す（規約7）。

## 2. 貼る

1. SQL Editor の新規タブに `0174_comp_norm_staff.sql` の全文（冒頭コメントから `-- ===== end 0174 =====` まで）を貼る。
2. Run。右下に Success が出たら時刻（JST）を控える。

## 3. 検証クエリ（Success の後に 1 つずつ・値ではなく形を見る）

ファイル末尾の `-- ===== verify =====` 以下と同じ 11 本（下に再掲）。

```sql
-- ===== verify（Success の後に 1 つずつ・値ではなく形を見る） =====
-- 1 貼り先証明
select 'nox-project-proof', count(*) from public.orgs;                                                                                         -- 9
-- 2 列（6 本）
select table_name, column_name, data_type, column_default from information_schema.columns where table_schema='public'
   and ((table_name='penalty_config' and column_name like 'norm_s%') or (table_name='comp_plans' and column_name='slide_apply')) order by 1, 2;   -- 6 行
-- 3 引数（各 1 行・旧版なし）
select proname, pg_get_function_identity_arguments(oid) from pg_proc where pronamespace='public'::regnamespace
   and proname in ('set_penalty_config','set_comp_plan','kiosk_staff_list','staff_punch') order by 1;                                       -- 4 行（17 引数／30 引数／0／3）
-- 4 md5（6 本）
select proname, left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where pronamespace='public'::regnamespace
   and proname in ('comp_plan_slide_check','set_penalty_config','set_comp_plan','demo_org_reset','kiosk_staff_list','staff_punch') order by 1;
  -- comp_plan_slide_check 8aedb6d7
  -- set_penalty_config d6c05607
  -- set_comp_plan 21afb3f5
  -- demo_org_reset 3cdf7a30
  -- kiosk_staff_list 53e9d7a7
  -- staff_punch 250c61b0
-- 5 proacl（authenticated／service_role のみ・anon なし・demo_org_reset は既存 ACL のまま）
select proname, proacl::text from pg_proc where pronamespace='public'::regnamespace and proname in ('comp_plan_slide_check','set_penalty_config','set_comp_plan','demo_org_reset','kiosk_staff_list','staff_punch') order by 1;   -- 6 行
-- 6 ★2 移行＝achievement_bonus の全要素に amount
select count(*) filter (where not exists (select 1 from jsonb_array_elements(params->'thresholds') e where not (e ? 'amount'))) migrated, count(*) total
  from public.comp_plan_components where kind = 'achievement_bonus';                                                                            -- migrated＝total（live 2／2）
-- 7 既存データ不変
select count(*) from public.comp_plans where slide_apply is not null;                                                                          -- 0
select count(*) from public.comp_plans where jsonb_array_length(sales_slide) > 3 or jsonb_array_length(point_slide) > 3;                       -- 0
-- 8 demo_org_reset の配列に 4 表
select proname from pg_proc where proname='demo_org_reset' and prosrc like '%''staff_contracts'',''staff_punches'',''staff_payroll_runs'',''terms_acceptances''%';   -- 1 行
-- 9 名簿
select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions,
       (select count(*) from pg_tables where schemaname='public') tables,
       (select count(*) from pg_proc where pronamespace='public'::regnamespace and prosrc like '%billing locked%') gated;                       -- 314／87／160
```

返すもの: 上の結果（値は形どおりか）＋ Success 時刻。CC が live 照合→md5 pin 6 本の張替え・名簿（関数 314・表 87・'billing locked' 160）・anon-guard／grants／rls の段→client→f0 2 連→push。

**Success 表示は適用の証明にならない（恒久注意28）＝上の検証クエリの返り値（値の形）を貼ってから次便を出す。1 行でも形が違えば未適用として CC が停止する。**

## 4. 適用記録
- （未適用・2026-10-16 起草）
