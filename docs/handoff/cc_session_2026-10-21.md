# CC セッション引き継ぎメモ 2026-10-21（便 X13-G）

## 現在地
- HEAD＝**cb58548**＝origin/main（rev-list 0 0）・作業ツリー変更 0。
- DB 恒久変更 0・migration の起草なし（デモ payload の変更のみ）。

## コミット（f4fef1f 以降）
| sha | 内容 |
|---|---|
| 2c7dc3a | fix: 目視 X-13（W-1〜W-19） |
| ed182b4 | fix: 目視 X-13 続き（W-22 /mine の並び・出勤予定・ノルマ不足／W-23 キャストの打刻を使わない店／W-13 差し替え／W-18 ⑦） |
| 6645f18 | fix: 目視 X-13 続き 2（W-24 日報の現金支払・W-25 ① カード手数料込みの入金額・live 修正 4 件＝様様／料金マスタ settings_json／待遇プランの短いタブ名／デモ店設定の ID 写像） |
| 821dbbf | fix: live ㉓（DailyPayForm の Promise.all 受け順が逆＝発行済み一覧が常に空・月末「-31」→翌月 1 日 lt／/mine 指名予約「M様 様」） |
| cb58548 | docs: 便 X13-G 現在地（裁定410・消費税の既定・CC 判断の承認・E-23・x13 #82〜#104・#15／16＝済（328 追補8）） |

## f0 と golden
- 6645f18 前: run22（13:54〜14:01）・run23（14:04〜14:11）＝**125 段 6,147 の 2 連緑**。
- 821dbbf 前: run24 緑 → **run25 赤**（0158(6-9)＝punch_self('out') が空 → transport_issue_self(null)＝invalid_input。時刻依存・単独再走は緑・本便の変更とは無関係）→ run26（14:41〜14:49）・run27（14:53〜15:00）＝**125 段 6,148 の 2 連緑**。
- golden 不変＝pay 130・payroll 233・玲奈 5170／5931・源泉 125802。local build 緑。
- 本日の f0 1 走は実測 7〜8 分（混雑時は 15〜25 分を見込む）。

## live（本番デモ・ACE オーナー／NOIR オーナー／ひなの・390／1,280・E-23）
- 済: ①ログアウト（Chromium で elementFromPoint＝ボタン自身）②お客様シート・NOIR の選択モード ④⑤⑥⑦⑧⑩⑪⑫⑬⑭⑮⑯⑰a〜c ⑱（既定プラン認識＝「本採用（ACE Sales Slide）」）⑲⑳㉑ ㉓（日払い ¥10,000＝源泉 510・手取り 9,490・内訳／現金支払／予定額が同時・キャスト詳細の発行済み）㉔（¥34,092・充当 30,993／手数料 3,099・入金はしていない）。
- **保留**: W-1＝iOS 実機未再現（Chromium の当たり判定で仮 OK・Agoora の実機確認待ち）。③伝票のお客様の行＝reset 後の伝票に顧客が無く suite で係留。㉒＝OFF の店は「使用中 7 名」のガードで live 切替できず。
- **NG→修正済み**: 様様（2 か所）・料金マスタの加算が既定表示・待遇プランのタブ名の切れ・既定プラン未認識・キャスト詳細の日払い一覧が空。
- 6 店 reset＝15:12 が最後（㉓ の日払いを消すため・日払いの取消 RPC は無い）。

## W-0 の読取結果
- ④ 裁定410 の器＝ひな形 settings_json.settlement_presets（set_store_profile）・起票 payroll_adjustment_add（source 'settlement'・target_shift_id）・懲戒減給 sanction（91 条の上限）＝既存経路で足りる。**元の記録の参照列（attendance／punch の id）は無い＝0175**。
- ⑤ 税: デモ 6 店とも外税（tax_excluded）・インボイス未登録（番号 null）。DB の列既定＝stores.price_display 'tax_included'（mig0111）。初期設定 v4 の client は set_store_tax_config を呼ばない（列既定のまま）。
- ⑥ 保存範囲: 税設定の保存はインボイス番号の検証で止まっていた → W-17 で節ごとの保存に分けた（お客様への加算＝pay_fee_rates は set_store_profile）。

## W-25 ②（カード手数料に消費税）の経路＝0175
- check_pay（0173 l.2535）が手数料行を tax_category 'taxable_10' で挿入 → check_group_due の外税分岐で 10% の課税対象（bx10）に入る（サ料の母数からは除外）。
- ACE A1: 30,993＋手数料 3,099＋税 310＝34,402。393 追補3（税込扱い・乗せない）と食い違い。
- client からは直せない（check_group_due は内部専用・受取額は check_pay がサーバで決める）＝**check_pay と check_group_due の両方を 0175 で修正**。

## W-24 のメモの保存先
- 「その他の現金支払」は daily_reports.note の 1 行目「【その他の現金支払 ¥n：メモ】」（新しい列なし・再締めで欄へ戻す）。0175 で列化の候補。

## 未修正の既知バグ
- **「-31」の不正日付**: dashboard-board:104・month-report:97（`lte("biz_date", `${month}-31`)`＝30 日月／2 月で 22008→0 件）。X13-H の H-9。
- **在庫の期首なし**: food 等 track_stock の商品に期首在庫が無く残がマイナス（X13-H の H-10）。

## 0175／0176 行き
- 0175: H-1 の 2 関数（check_pay・check_group_due の手数料の税）・410 の参照列（source_table／source_id）・casts.kind を書く RPC（本採用）・領収書の reissue_of と日付訂正・新規店の税の列既定（外税）・W-24 メモの列化候補・判定タイミングの保存先（H-8 で要る場合）。
- 0176: 初期設定 v4 の器（キャスト画面の設定ほか）。

## H-8 の読取（X13-G 時点）
- 今期の時給の判定文言は固定文字列ではなく生成＝lib/nox/cast/current-wage.ts:31-32（プランの slide_period＋プレビューの slideBasis.apply＝店の slide_apply 由来）。給与計算側がプランと店のどちらを読むかは X13-H で読取。

## 次の便
X13-H → SH-UI → BZ-R → 0175／0176 → OB → 0177 → GV-D

## 注意
- Supabase compute は Small。f0 1 走 15〜25 分を見込む（本日実測 7〜8 分）。
- DB 不通（select 1 が 15 秒超）は即停止（教訓85）。
- live は E-23（主ボタンの中心で document.elementFromPoint がボタン自身）で判定。
- f0 の赤はまず単独走で切り分け（0158(6-9) は時刻依存の単発赤あり・payroll suite の途中失敗は NOX-VERIFY-pay* を残し anon-guard／daily-pay を赤くする→payroll を単独で再走すると掃除される）。
- deploy 到達の判定は文字列リテラルで（minify で変数名は消える）。
- docs/tmp の生成スクリプト: x13g_docs.cjs（{{HEAD}} は全置換が必要だった）。
