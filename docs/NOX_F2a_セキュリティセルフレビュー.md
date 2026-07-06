# NOX F2a セキュリティセルフレビュー報告書（相談役レビュー用）

> 作成: 2026-07-06（F2a グループ締め・F0f/F1f と同じ型）。レビュー通過＋UI チェックリスト（確認⑤）＋verify 全緑の3点で F2a を push する。
> 対象: F2a-1〜F2a-4（mig 0012〜0014・公開 RPC 7本＝マスタ CRUD 6＋集計 get_cast_sales 1・内部 3本＝comp_plan_slide_check/cast_sales_aggregate＋既存再利用 check_group_due・純関数 punch-match/punch-io/sales-alloc・/master 6タブ・verify 560 assertions）。
> 前提設計は精密仕様 §4（打刻突合・台帳 #20）・§7-1（daily.sales・台帳 #21）で確定。台帳は F0 セルフレビュー §5 を継続使用（#20/#21 クローズ・#31/#32 起票済み）。

---

## 1. 成果物と検証状態

| サブ | 成果物 | 検証 |
|---|---|---|
| （論点確定） | 精密仕様 §4.1/§4.2（打刻突合 S1〜S8＋S3 対応表）・§7-1（daily.sales SL1〜SL8）・台帳 #20/#21 クローズ | 逐語ハーネスでモック実測→裁定→ゴールデン化 |
| F2a-1 | mig0012（報酬マスタ6テーブル）・mig0013（CRUD RPC 6本＋内部 comp_plan_slide_check） | anon-guard 公開6＋内部1・rls 成功経路（audit 行増加）・D3a 分岐・D1a 可視性・inactive 拒否 |
| F2a-2 | mig0014（cast_sales_aggregate 内部＋get_cast_sales 公開）・sales-alloc.ts（TS 鏡像） | ゴールデン 32,640/21,760/Σ54,400・3-way 剰余 534/533/533・void 除外・フリー卓非帰属・D6a・TS/DB 同値 |
| F2a-3 | punch-io.ts（DB 生行→matchPunches 持ち上げ・純関数） | IO 段境界（cutoff ちょうど当日側・秒 floor・JST 日跨ぎ・0-47 域）・DB 結線 lateN/absentN |
| F2a-4 | /master 6タブ（comp-master.tsx）・page/master-board 中継 | owner/manager 実ログイン DOM トレース・D3a 出し分け・inactive 除外・原則7 grep |
| **再実行結果** | typecheck ✅・lint ✅・seed→**verify:f0 全緑 560 assertions**（pay 83／shift-time 44／punch-match 75／anon-guard 76／rls 224／grants 36） | 2026-07-06 実施 |

## 2. 二重防御9原則チェックリスト（F2a の全 mig/RPC/テーブル）

| 観点 | 状態 | 根拠 |
|---|---|---|
| RPC 冒頭 null guard（原則1） | ✅ 公開7本すべて | `auth_org_id() is null → forbidden`。get_cast_sales の cast 分岐は `auth_cast_id() is null` も fail-closed raise。prosrc 確認済み |
| 入力検証（DB CHECK と二段） | ✅ | slide 深検証（0〜3段・{at,wage} 2キー・整数・昇順strict）・overrides 4キー限定・cond {metric,min} 2キー・per/basis 値域・rate/sales の %上限・period 正規表現・期間ガード92日 |
| store/cast/plan の org 照合（クロステナント遮断） | ✅ 公開7本 | set_cast_plan は cast・plan 双方の org＋同一 store 照合（クロス店割当遮断）。get_cast_sales は store→org 照合。verify でクロス org 拒否を実測 |
| ロール判定 auth_role() ハードコード（原則3） | ✅ | D3a=set_comp_plan/set_penalty_config は owner 限定・他4本 manager 以上・get_cast_sales は staff 明示 raise（D6a）。capability テーブルなし |
| revoke public,anon＋grant authenticated（原則2） | ✅ 公開7本 | anon-guard 段8/段9 が全数プローブ（get_cast_sales 含む） |
| 内部専用の4ロール revoke（原則2） | ✅ comp_plan_slide_check／cast_sales_aggregate | anon＋authenticated 両ロール BLOCKED を能動 assert。既存 check_group_due（再利用）も4ロール revoke 済み |
| テーブル grant 標準型（TRUNCATE 面） | ✅ 6本（累計28本） | revoke all→grant select のみ。grants G1「スキーマ全体で authenticated=SELECT のみ」が自動回帰（+6テーブルを包含） |
| 書込ポリシーなし・RPC 専任 | ✅ 6テーブル全て | SELECT ポリシーのみ・書込は RPC 経由。authenticated 直書込は grant 面で遮断 |
| 全書込 RPC の audit_log_write（原則6） | ✅ 6本（書込全数） | set_* 6本すべて perform audit_log_write。**読み取り専用 get_cast_sales は対象外**（get_cast_ranking 前例・成功経路 verify で audit 行増加を能動 assert） |
| 内部ヘルパー null guard の要否（原則8） | ✅ 判断記録 | comp_plan_slide_check=「渡された値の検証のみ」型＝guard 不要（check_round_amount 型）。**cast_sales_aggregate=再利用予想の集計ヘルパー＝org 自衛必須**（daily_report_aggregate 型・store→org 解決＋全参照に org 条件） |
| boolean/数値の明示送信（原則7） | ✅ | set_penalty_config は全11値＋norm_on を null 拒否（coalesce リセット経路なし）。is_active 3本は coalesce(_, true)＋UI 明示送信。/master は p_is_active/p_norm_on を常に明示 |
| お金のサーバ再計算・凍結（原則4） | ✅ | 売上按分は DB cast_sales_aggregate が正（D7a）・check_group_due 凍結値を再利用・最大剰余法は整数演算のみ。給与確定時の再計算凍結は F2c |

## 3. cast プライバシーと集計の安全提供

| テーブル/RPC | 分類 | 実測 |
|---|---|---|
| cast_plan | パターン1変形（**staff 0行**） | castA1a 自分行のみ・castA1b 0行・staffA1 0行・退職 cast 0行（賃金条件の原本＝#24/D6a と方向統一） |
| comp_plans | パターン1変形（割当限定） | castA1a 自プランのみ1行・castA1b 0行・manager 全行・退職 cast 0行（exists(cast_plan) 一方向参照＝再帰なし） |
| cast_norms | パターン1 | 自分行のみ |
| deductions/penalty_config/custom_back_defs | パターン3 | 周知情報・cast も可視（労基法91条の周知の筋・F2f シミュレーター入力） |
| get_cast_sales | 集計 RPC（金額込み） | owner/manager 全 cast・cast 本人のみ・**staff 拒否（D6a）**・他 org 拒否。cast 別金額は castMng 領域＝ranking（金額列なし）と役割分離 |
| cast_sales_aggregate | 内部（金額計算の心臓） | 4ロール revoke＝get_cast_sales 経由のみ。按分の正は DB・TS 鏡像 sales-alloc は verify 専用 |

## 4. 純関数層（DB を知らない・payOf と同じ案1）

| 関数 | 役割 | 回帰アンカー |
|---|---|---|
| punch-match.ts | shift×punch×attendance → lateN/absentN＋raw/final/anomalies | 実測21＋S3 対応表5分岐＋IO 統合（75 assert・#20 裁定を係留） |
| punch-io.ts | punches(timestamptz)→0-47 域持ち上げ（bizDateOf/hm2min 再利用・時刻計算を再実装しない） | IO 境界（cutoff ちょうど当日側・秒 floor・JST 日跨ぎ）＋DB 結線 |
| sales-alloc.ts | cast_sales_aggregate の TS 鏡像（verify 専用・金額丸めなし＝money.ts 対象外） | ゴールデン完全一致＋allocDue Σ保存恒等（TS/DB 同値の3例目＝check-calc/biz-date に続く） |

- **DB 時刻計算の逸脱管理**：cast_sales_aggregate の biz_date 算出は「DB で時刻計算する2箇所目」（1箇所目＝daily_report_aggregate）。TS bizDateOf との同値を verify で係留＝黙って動く数字を作らない。

## 5. 指摘事項（F2a 新規）

| # | 指摘 | 対応 |
|---|---|---|
| A | cast_plan の staff 可視性 | レビュー差し戻しで「パターン1＋staff 0行」に強化済み（overrides_json＝個別賃金情報）。認可設計 §2.3 追記済み |
| B | comp_plans のポリシー内 exists サブクエリ（本プロジェクト初） | cast_plan の RLS を通る一方向参照＝users↔memberships 型の相互参照ではなく再帰なし。動作アンカー4種を verify で固定 |
| C | inactive プランへの割当 | レビュー差し戻しで set_cast_plan に 'plan inactive' ガード追加・UI も選択肢除外＝二重。既割当は破壊しない設計 |
| D | early/over/noout の金銭化 | 台帳 #31（実店舗ヒアリング後判断）。現状は anomaly/表示のみ・金銭は不接続 |
| E | 出勤インセンティブ | 台帳 #32（設計ロック済み・実装は F2c 完了後）。payslips.breakdown_json 独立行の前提を #4 に記録 |

## 6. F2c への申し送り

- payOf 結線（#4）：daily.sales は get_cast_sales/cast_sales_aggregate から・lateN/absentN は punch-match/punch-io から・マスタは comp_plans/cast_plan/cast_norms/deductions/penalty_config/custom_back_defs から。payOf 入力 object をサーバが組み、再計算→payslips.breakdown_json 凍結。
- 専門家ゲート（暫定既定・TODO マーカー維持）：#7 源泉日数＝出勤日数（pay.ts）・#10 丸め＝round（money.ts 1箇所差替可能な構造維持）・#11 雇用係数＝1.0。
- service_role 監査経路（#6）は F2c で決定。penalty_config の grace 3列（10/30/90）は punch-match の config へ供給。
