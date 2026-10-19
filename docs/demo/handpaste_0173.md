# 0173 手貼り案内（Agoora 向け・2026-10-16 起草・便 M173＝裁定385／386／389（＋追補1／2）／391／392／393＋396 の店設定 2 キー）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に `supabase/migrations/0173_register_payment.sql` の全文を貼って Run（1 本だけ・所要 1〜3 分）。**0172（適用済み）の後・**0174 より先****
2. 中身＝①延長パターン（既定・1 店 3 本・レジの切替 RPC）②途中合流（店設定 join_mode・セット凍結・合流セット行）③キャストのレジ運用（店設定 cast_register_device・日次の締めの cast 枝・操作者 membership 列 3 本・レジ端末の候補に cast）④日報の売上 2 分類（set_ext_nom／products）⑤会計前キープ（bottle_keeps 'pending'・レジの「キープ」→会計で確定・取消で削除・顧客 summary に pending_bottles）⑥支払手数料（店設定 pay_fee_rates・伝票行 'pay_fee'・受取額＝入金額＋手数料・日報 pay_fee_total・キャスト売上から除外）⑦体入の店設定 2 キー（trial_guarantee_days／default_plan_id）。既存データの読み替え＝なし（新列は既定／null・既存キープは active のまま・既存の延長ルールは既定なし＝解決順不変・手数料は率の無い店で 0）。
3. Success 後に §3 の **docs/demo/verify_0173_0174.sql（1 文・31 行）** を貼り、**返った 31 行（ok 列）を CC へ貼る**。client（延長の選択・合流・キャストのレジ設定・日報 2 行・キープ pending・手数料の入金モーダル・体入の一括操作）は適用後の便（P173）。

## 1. 貼る前に

| 確認 | 期待 |
|---|---|
| アドレスバー | `https://supabase.com/dashboard/project/hiqbfagmkrdpmlqhkmsu/sql/new`（`project/` の直後が hiqbfagmkrdpmlqhkmsu） |
| ファイル | supabase/migrations/0173_register_payment.sql（HEAD の現物） |
| sha256 | `7b116cea9ca08a5e3f88a6e6f9b66a47693eae2056c464298a0cfd969f09faef`（196,017 B・2781 行・LF・CR 0） |
| 改行 | LF・CR 0 |
| 順序 | 0172（適用済み）の後・**0174 より先** |
| 生成器 | docs/tmp/gen_0173.mjs（写経元＝docs/tmp/0173_live.json＝2026-10-16 読取。live の関数の md5（\r 込み）が pin と一致しないと生成しない） |
| 構文検査 | scripts/mig-check.mjs＝libpg_query（全体）＋ローカル Postgres（plpgsql・ROLLBACK）で **errors 0**（2026-10-16・docs/dp/mig_check.md・恒久注意30＝初回手貼りの 42601 を修正後） |

手元で再計算する場合（Git Bash）:

```bash
sha256sum supabase/migrations/0173_register_payment.sql
```

ファイルは `begin;`〜`commit;` の単一トランザクション。冒頭と検証の 1 本目に貼り先証明 `select 'nox-project-proof', count(*) from public.orgs;`。途中で失敗すれば全部ロールバックされ DB は無傷。エラーが出たら**再実行せず**、エラー文をそのまま CC へ。

★デモとの順序: 増える列は既定か null＝payload に無くても reset は失敗しない。bottle_keeps の既存行は active のまま。settings_json の 5 キーは欠損＝既定（join_set／store_device／手数料 0／3 日／プランなし）。
★client との順序: 署名が変わる 6 本（set_pricing_rule／check_pay／bottle_keep_register／check_line_set_customer／check_group_due／customer_summary）は新引数に既定あり＝現行 client の呼びはそのまま通る（customer_summary は列が 1 本増える＝client は名前で読む）。
★仮決め（相談役確認待ち・台帳 便 M173 現在地）: カード手数料の「既定 10%」は UI の新規店の初期値（DB は欠損キー＝0）／延長 3 本の上限は新規追加時のみ／セット凍結＝checks.set_frozen／切替は確定ブロックを新単価で引き直し。

## 2. 貼る

1. SQL Editor の新規タブに `0173_register_payment.sql` の全文（冒頭コメントから `-- ===== end 0173 =====` まで）を貼る。
2. Run。右下に Success が出たら時刻（JST）を控える。

## 3. 検証（Success の後・1 文で）

**Supabase SQL Editor は最後の文の結果しか返さない（恒久注意31）**＝ファイル末尾の `-- ===== verify =====` の 13 本を 1 本ずつ貼る方式は 0173 の手貼りで 12 本分が未取得になった。代わりに **`docs/demo/verify_0173_0174.sql`（union all の 1 文・31 行＝mig／k／v／expected／ok）を全文貼って Run** し、返った 31 行をそのまま CC へ貼る（SELECT のみ・書込なし）。

| 見るところ | 期待 |
|---|---|
| ok 列 | mig='both'／'0173' の行が全部 true（**0173 だけ適用の時点では「関数数」が 312＝false・mig='0174' の行は false＝想定どおり**） |
| 「md5 不一致の関数名」の v | 空（1 本でも名前が出たら未適用か改稿ずれ＝CC が止める） |
| 「関数数」「表数」「'billing locked' 関数数」 | 312／87／160（0174 後は 314／87／160） |

返すもの: 31 行の結果＋Success 時刻。CC が live 照合→md5 pin の張替え・名簿・anon-guard／grants／rls の段→client→f0 2 連→push。

**Success 表示は適用の証明にならない（恒久注意28）＝上の 1 文の返り値（ok 列）を貼ってから次便を出す。1 行でも形が違えば未適用として CC が停止する。**

## 4. 適用記録
- 2026-10-16 **15:27 頃 JST** Agoora 手貼り（申告・便 P173 で記入。SQL Editor の最終行＝functions 312／tables 87／gated 160 の申告＝0173）。**live 照合（CC・便 VQ・2026-10-16・SELECT のみ＝docs/demo/verify_0173_0174.sql を default_transaction_read_only で実行）**: 31 行すべて ok=true＝**0173 と 0174 の両方が本番に適用済み**（関数 314／表 87／'billing locked' 160・md5 pin 24＋6 全一致・不一致名 空・新列 8＋6・CHECK pending／pay_fee・index・policy cast 枝・引数 17／8／17／30・旧版なし・新設 3 本・anon 付与 0・内部専用 5 本 authenticated なし・thresholds 移行 2/2・既存データ不変＝bottle_keeps active 以外 0／is_default_ext 0／set_frozen 0／slide_apply null／4 段以上 0・demo_org_reset 4 表）。手貼りの時刻は Agoora の申告待ち。
