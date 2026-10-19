# 0174 手貼り案内（Agoora 向け・2026-10-16 起草・便 M173＝裁定390／起票110／394／395＋kiosk スタッフ群（P172 Q-4）＋デモ payload（P172 Q-8））

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に `supabase/migrations/0174_comp_norm_staff.sql` の全文を貼って Run（1 本だけ・所要 1〜3 分）。****0173 の後**（0173 が set_store_profile を改稿するため・0174 は同じ関数を触らない）**
2. 中身＝①スライド段数 1〜10（comp_plan_slide_check）②達成ボーナスの多段（thresholds の各要素に amount＝移行 SQL・live 2 行）③ノルマ未達の減額 4 軸（penalty_config +5 列・set_penalty_config 17 引数）④スライドの判定タイミング（comp_plans.slide_apply null・set_comp_plan 30 引数）⑤打刻端末のスタッフ群（kiosk_staff_list／staff_punch）⑥demo_org_reset の配列に staff 3 表＋terms_acceptances。既存データの読み替え＝achievement_bonus の thresholds に amount を足すだけ（live 2 行・値はコンポーネントの amount）。slide_apply は全プラン null（店設定に従う）。
3. Success 後に §3 の **docs/demo/verify_0173_0174.sql（1 文・31 行）** を貼り、**返った 31 行（ok 列）を CC へ貼る**。client（スライド可変行・達成ボーナス多段・ノルマ減額 4 軸・プランの判定タイミング・打刻端末のスタッフ画面・payload 4 表）は適用後の便（P173）。

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

## 3. 検証（Success の後・1 文で）

**Supabase SQL Editor は最後の文の結果しか返さない（恒久注意31）**＝ファイル末尾の `-- ===== verify =====` の 11 本を 1 本ずつ貼る方式は 0173 の手貼りで 12 本分が未取得になった。代わりに **`docs/demo/verify_0173_0174.sql`（union all の 1 文・31 行＝mig／k／v／expected／ok）を全文貼って Run** し、返った 31 行をそのまま CC へ貼る（SELECT のみ・書込なし）。

| 見るところ | 期待 |
|---|---|
| ok 列 | 全行 true（0173→0174 の両方が入った状態） |
| 「md5 不一致の関数名」の v | 空（1 本でも名前が出たら未適用か改稿ずれ＝CC が止める） |
| 「関数数」「表数」「'billing locked' 関数数」 | 314／87／160 |

返すもの: 31 行の結果＋Success 時刻。CC が live 照合→md5 pin の張替え・名簿・anon-guard／grants／rls の段→client→f0 2 連→push。

**Success 表示は適用の証明にならない（恒久注意28）＝上の 1 文の返り値（ok 列）を貼ってから次便を出す。1 行でも形が違えば未適用として CC が停止する。**

## 4. 適用記録
- 2026-10-16 **15:30 頃 JST** Agoora 手貼り（申告・便 P173 で記入。SQL Editor の最終行＝functions 312／tables 87／gated 160 の申告＝0173）。**live 照合（CC・便 VQ・2026-10-16・SELECT のみ＝docs/demo/verify_0173_0174.sql を default_transaction_read_only で実行）**: 31 行すべて ok=true＝**0173 と 0174 の両方が本番に適用済み**（関数 314／表 87／'billing locked' 160・md5 pin 24＋6 全一致・不一致名 空・新列 8＋6・CHECK pending／pay_fee・index・policy cast 枝・引数 17／8／17／30・旧版なし・新設 3 本・anon 付与 0・内部専用 5 本 authenticated なし・thresholds 移行 2/2・既存データ不変＝bottle_keeps active 以外 0／is_default_ext 0／set_frozen 0／slide_apply null／4 段以上 0・demo_org_reset 4 表）。手貼りの時刻は Agoora の申告待ち。
