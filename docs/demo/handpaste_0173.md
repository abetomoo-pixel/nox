# 0173 手貼り案内（Agoora 向け・2026-10-16 起草・便 M173＝裁定385／386／389（＋追補1／2）／391／392／393＋396 の店設定 2 キー）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に `supabase/migrations/0173_register_payment.sql` の全文を貼って Run（1 本だけ・所要 1〜3 分）。**0172（適用済み）の後・**0174 より先****
2. 中身＝①延長パターン（既定・1 店 3 本・レジの切替 RPC）②途中合流（店設定 join_mode・セット凍結・合流セット行）③キャストのレジ運用（店設定 cast_register_device・日次の締めの cast 枝・操作者 membership 列 3 本・レジ端末の候補に cast）④日報の売上 2 分類（set_ext_nom／products）⑤会計前キープ（bottle_keeps 'pending'・レジの「キープ」→会計で確定・取消で削除・顧客 summary に pending_bottles）⑥支払手数料（店設定 pay_fee_rates・伝票行 'pay_fee'・受取額＝入金額＋手数料・日報 pay_fee_total・キャスト売上から除外）⑦体入の店設定 2 キー（trial_guarantee_days／default_plan_id）。既存データの読み替え＝なし（新列は既定／null・既存キープは active のまま・既存の延長ルールは既定なし＝解決順不変・手数料は率の無い店で 0）。
3. Success 後に §3 の検証クエリを貼り、**返った値（9／8 行／2 行／1 行／1 行／7 行／md5 24 本／proacl 24 行／active だけ／0／0／312・87・160）を CC へ貼る**。client（延長の選択・合流・キャストのレジ設定・日報 2 行・キープ pending・手数料の入金モーダル・体入の一括操作）は適用後の便（P173）。

## 1. 貼る前に

| 確認 | 期待 |
|---|---|
| アドレスバー | `https://supabase.com/dashboard/project/hiqbfagmkrdpmlqhkmsu/sql/new`（`project/` の直後が hiqbfagmkrdpmlqhkmsu） |
| ファイル | supabase/migrations/0173_register_payment.sql（HEAD の現物） |
| sha256 | `eca8c2d8ce9d1c7cd3c051c8a33028c601b5f65cff84c072487e509d8ee198a8`（195,980 B・2780 行・LF・CR 0） |
| 改行 | LF・CR 0 |
| 順序 | 0172（適用済み）の後・**0174 より先** |
| 生成器 | docs/tmp/gen_0173.mjs（写経元＝docs/tmp/0173_live.json＝2026-10-16 読取。live の関数の md5（\r 込み）が pin と一致しないと生成しない） |

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

## 3. 検証クエリ（Success の後に 1 つずつ・値ではなく形を見る）

ファイル末尾の `-- ===== verify =====` 以下と同じ 13 本（下に再掲）。

```sql
-- ===== verify（Success の後に 1 つずつ・値ではなく形を見る） =====
-- 1 貼り先証明
select 'nox-project-proof', count(*) from public.orgs;                                                                                         -- 9
-- 2 列（7 本）
select table_name, column_name, data_type, column_default from information_schema.columns where table_schema='public'
   and ((table_name='pricing_rules' and column_name='is_default_ext') or (table_name='checks' and column_name in ('set_frozen','opened_by_membership'))
        or (table_name='payments' and column_name='by_membership') or (table_name='daily_reports' and column_name in ('closed_by_membership','set_ext_nom','products','pay_fee_total')))
 order by 1, 2;                                                                                                                                 -- 8 行
-- 3 CHECK（pending／pay_fee）
select conname, pg_get_constraintdef(oid) from pg_constraint where conname in ('bottle_keeps_status_check','check_lines_fee_kind_check') order by 1;   -- 2 行・'pending'／'pay_fee' を含む
-- 4 index・policy
select indexname from pg_indexes where tablename='pricing_rules' and indexname='pricing_rules_default_ext_uidx';                              -- 1 行
select policyname, qual from pg_policies where tablename='daily_reports';                                                                      -- 1 行・auth_cast_can_register を含む
-- 5 引数（署名が変わった 6 本＋新設 1 本＝各 1 行・旧版なし）
select proname, pg_get_function_identity_arguments(oid) from pg_proc where pronamespace='public'::regnamespace
   and proname in ('set_pricing_rule','check_pay','bottle_keep_register','check_line_set_customer','check_group_due','customer_summary','check_set_ext_rule') order by 1;   -- 7 行
-- 6 md5（24 本）
select proname, left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where pronamespace='public'::regnamespace
   and proname in ('check_group_due','pricing_resolve_core','set_pricing_rule','check_open','check_time_charge_apply','check_set_people','set_store_profile','report_can_close','daily_report_reclose','cash_diff_approve','daily_report_close','kiosk_login','kiosk_operator_list','staff_pin_status','set_staff_pin','daily_report_aggregate','bottle_keep_register','check_line_set_customer','check_close','check_void','customer_summary','check_pay','cast_sales_aggregate','check_set_ext_rule') order by 1;
  -- check_group_due 5c667792
  -- pricing_resolve_core 4779acc3
  -- set_pricing_rule d41e22d9
  -- check_open 82dfd091
  -- check_time_charge_apply 8305089f
  -- check_set_people 1f6b9fd8
  -- set_store_profile 45012c75
  -- report_can_close 12b4ad7a
  -- daily_report_reclose a140f36c
  -- cash_diff_approve 12810b5f
  -- daily_report_close f599bd09
  -- kiosk_login 90ab95a4
  -- kiosk_operator_list e9c868bf
  -- staff_pin_status c70866bf
  -- set_staff_pin bda3b520
  -- daily_report_aggregate ca2dd22d
  -- bottle_keep_register 579efaff
  -- check_line_set_customer 644cd7ba
  -- check_close f94dc8c3
  -- check_void 4eb77409
  -- customer_summary c83aa2af
  -- check_pay c11691b8
  -- cast_sales_aggregate 34a0bf1e
  -- check_set_ext_rule 02b145a6
-- 7 proacl（公開 RPC は authenticated／service_role のみ・anon なし・内部専用は null）
select proname, proacl::text from pg_proc where pronamespace='public'::regnamespace
   and proname in ('check_group_due','pricing_resolve_core','set_pricing_rule','check_open','check_time_charge_apply','check_set_people','set_store_profile','report_can_close','daily_report_reclose','cash_diff_approve','daily_report_close','kiosk_login','kiosk_operator_list','staff_pin_status','set_staff_pin','daily_report_aggregate','bottle_keep_register','check_line_set_customer','check_close','check_void','customer_summary','check_pay','cast_sales_aggregate','check_set_ext_rule') order by 1;                                            -- 24 行
-- 8 既存データ不変
select status, count(*) from public.bottle_keeps group by 1;                                                                                   -- active だけ（既存行）
select count(*) from public.pricing_rules where is_default_ext;                                                                                -- 0
select count(*) from public.checks where set_frozen;                                                                                           -- 0
-- 9 名簿
select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions,
       (select count(*) from pg_tables where schemaname='public') tables,
       (select count(*) from pg_proc where pronamespace='public'::regnamespace and prosrc like '%billing locked%') gated;                       -- 312／87／160
```

返すもの: 上の結果（値は形どおりか）＋ Success 時刻。CC が live 照合→md5 pin 24 本の張替え・名簿（関数 312・表 87・'billing locked' 160）・anon-guard／grants／rls の段→client→f0 2 連→push。

**Success 表示は適用の証明にならない（恒久注意28）＝上の検証クエリの返り値（値の形）を貼ってから次便を出す。1 行でも形が違えば未適用として CC が停止する。**

## 4. 適用記録
- （未適用・2026-10-16 起草）
