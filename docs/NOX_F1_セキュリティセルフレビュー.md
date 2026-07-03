# NOX F1 セキュリティセルフレビュー報告書（相談役レビュー用）

> 作成: 2026-07-03（F1f-5・F0f と同じ型）。レビュー通過＋UI チェックリスト完走＋verify 全緑の3点セットで F1 フェーズグループを push する。
> 対象: F1a〜F1f（mig 0005〜0011・公開 RPC 22本・テーブル16本・画面8本・verify 381 assertions）。
> F0 分は `NOX_F0_セキュリティセルフレビュー.md`（push 済み・台帳は同文書 §5 を継続使用）。

---

## 1. 成果物と検証状態（F1f-5 の (1)(2) の結果を含む）

| サブ | 成果物 | 検証 |
|---|---|---|
| F1a | mig0005（方式A＋products/seats/bottle_keeps/stock_logs＋RPC3本） | 退職回帰・audit 実機・unit4 異常系・cast 可視性 |
| F1b/F1c | mig0006/0007（会計6テーブル＋RPC 7本＋内部3本）・allocateQty | 会計ゴールデン 54,400・TS/DB 分配同値・冪等3種・void 連動・check-calc 鏡像 |
| F1d | mig0008/0009（勤怠5テーブル＋RPC 9本）・shift-time.ts | 盲目記録・decide 自動生成・パターン1・時刻純関数44 assert |
| F1e | mig0010（daily_reports＋close/reclose）・biz-date.ts | 日報ゴールデン・境界 TS/DB 帰属一致・p_force・reclose 追随 |
| F1f | mig0011（ranking＋staff 開放）・画面8本（login/mine系3/register/shift/report/master） | 金額キー不在・UI チェックリスト完走（別紙） |
| **(2) 再実行結果** | typecheck ✅・build ✅（6ルート）・seed→**verify:f0 全緑 381 assertions**（pay 83／shift-time 44／anon-guard 59／rls 159／grants 36） | 2026-07-03 実施 |
| **(1) チェックリスト** | `NOX_F1f_UI確認チェックリスト.md`＝**全項目 ✅**（grep 機械確認 G-a/b/c 0件・4ロール×全画面・Agoora 確認①〜④済み） | 同上 |

## 2. BANZEN 教訓チェックリスト対照（F1 の全 mig/RPC/テーブル）

| 観点 | 状態 | 根拠 |
|---|---|---|
| RPC 冒頭 null guard | ✅ 公開22本すべて | `auth_org_id() is null → forbidden`。cast セルフ4本は追加で `auth_cast_id()` 本人チェック・代理系（punch_proxy 等）には**入れない**（request_accept 教訓・prosrc 確認済み） |
| revoke public+anon＋grant authenticated | ✅ 公開22本 | anon-guard 59 assert が全数プローブ |
| 内部専用の4ロール revoke | ✅ 4本（check_recalc/check_group_due/check_round_amount/daily_report_aggregate） | anon＋authenticated 両ロール BLOCKED を能動 assert・G3 型 ACL 検査 |
| テーブル grant 標準型（TRUNCATE 面） | ✅ 16本（累計22本） | grants G1「スキーマ全体で authenticated=SELECT のみ」が自動回帰 |
| 書込ポリシーなし・RPC 専任 | ✅ 全テーブル | authenticated 直 INSERT/UPDATE/DELETE の permission denied を実測 |
| append-only | ✅ punches/stock_logs | ポリシー不在＋grant 遮断＋（punches は盲目記録＝事実の3層モデル） |
| 全書込 RPC の audit_log_write（原則6） | ✅ 19本（書込全数） | 読み取り専用 get_cast_ranking は対象外（閲覧系の初事例・mig0011 ヘッダー明記） |
| お金のサーバ再計算・冪等・スナップショット | ✅ | 単価/バック/サ料丸め設定を open/add_line 時に凍結。pay/close 冪等キー・open 自然冪等。verify で再送プローブ |
| 凍結原則 | ✅ | check_lines スナップショット・daily_reports 凍結＋reclose（監査痕跡付き再確定）・back_snapshot |
| cast プライバシー3パターン | ✅ 新設時から適用 | パターン1×6・パターン2×9・パターン3×1（products）。集計 RPC は金額列なし（Object.keys 検査） |
| 集計ヘルパーの org 自衛（原則8補足） | ✅ | daily_report_aggregate 全サブクエリに org 条件（mig0010 レビュー反映） |
| 冪等キー照合の位置（原則9） | ✅ | org/ロール照合の後（mig0007 レビュー反映）・UI は常に randomUUID 送信 |
| UI 2層＋DB 物理保証 | ✅ | middleware=認証のみ・layout=ロール分岐（auth_role rpc は React cache で1回/リクエスト）・最終防衛は RLS/RPC。void/締め/採否ボタンの非表示＋RPC 拒否の**二重を実測** |

## 3. 指摘事項（F1 新規）

**push をブロックする水準の残指摘なし**。軽微な既知事項は以下（いずれも台帳登録済み・設計判断済み）:

1. **audit_logs の肥大リスク**: check_open/add_line 等の高頻度操作も原則6で全記録。実測で問題化したら間引き再判断（CLAUDE.md 原則6に記載済み・運用観察項目）。
2. **owner のマルチ店舗**: F1 の店側画面は先頭店固定（切替 UI は F4=台帳 #15）。owner の RLS は org 全店可視のため機能上の支障はないが、複数店 org では画面が先頭店しか扱えない制約を引き継ぎに明記。
3. **punch_self の位置情報**: lat/lng は器のみ（UI からの取得は未実装・ジオフェンス #23 と同時に設計）。
4. **preview キャプチャ**: スクリーンショットツールがこの環境で不調＝視覚確認は Agoora 目視で代替（チェックリストに記録）。

## 4. 既知の設計判断（F1 追加分・承認済み）

| 判断 | 承認 |
|---|---|
| punches イベント型（設計書の clock_in/out ペア行から変更）・盲目記録 | F1d |
| wish accept の shifts 自動生成（planned・wish_id 部分ユニーク） | F1d |
| 時刻規約 start 00-23:59／end 00-47:59・意味論の正本 shift-time.ts・DB は形式 CHECK のみ | F1d |
| 日報スナップショット型・reclose 方式・営業日境界（started_at・cutoff 凍結）・biz-date が DB 時刻計算の唯一の例外＝TS/DB 同値保証 | F1e |
| カードTAX は日報集計のみ（請求上乗せは台帳 #25） | F1e |
| ranking 全ロール同一形（金額込みは F2 別 RPC）・読み取り専用は audit 対象外 | F1f-0 |
| staff 開放は attendance_set のみ（punch_proxy は manager 維持） | F1f-0（#24 クローズ） |
| ドリンク申告は F3f へ（#28） | F1f plan |

## 5. 台帳の状態（F0 文書 §5 を更新済み・全件は引き継ぎ文書にスナップショット）

- **F1 分クローズ**: #1（方式A）・#2（middleware）・#3（3パターン＋集計 RPC）・#24（staff 開放）。#5 は運用定着。
- **F2 へ引き継ぎ**: #4（payOf 結線）・#6〜#14b・#20（突合純関数）・#21（daily.sales 定義）・#25〜#27・#29・#30。
- **F3**: #22（fix_requests）・#28（drink_claims）。**F4**: #15〜#17・#23。**設計書整合（任意）**: #18。

## 6. 結論

F1 完了条件（レジで開店→明細→会計が通る・シフト希望→確定→打刻が通る・cast が自分のページだけ見える＝RLS 物理保証・各サブ verify 緑）を充足。
3点セットのうち **(1) チェックリスト完走・(2) verify 全緑は本報告に記録済み**。**(3) 本レビューの通過**をもって main を push し、F1 フェーズグループを確定する。
