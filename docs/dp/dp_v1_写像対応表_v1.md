# デザインパック v1.0／v1.1／v1.2 写像対応表 v1（10面: 店舗設定 v3／料金 v8.1／報酬 v3.1／レジ v12.1／シフト v4.1／キャスト管理 v3.1／日報・月報・売掛 v2.1／ホーム v2.1／分析 v2.1／お知らせ・通知 v2.1・2026-09-04・CC・読み取り専用・裁定前）

- 正本＝`docs/dp/dp_v1_写像対応表_v1.md`（⑬完了処理で `docs/tmp/dp_v1_写像_draft.md` から昇格・同一内容）。裁定は台帳へ・本書は D調査の実測表。

- 正本モック＝`mock/pages-2026-09/nox-master-store-settings-v3.html`（`5e4c593c…c918`）／`nox-pricing-settings-unified-v8_1.html`（`2815b0d1…9c12`）／
  `nox-compensation-plan-unified-v3_1.html`（`72555ac8…08e1`）＝裁定124 収蔵。共通UIルール＝`NOX_UI_COMMON_RULES_v1.md`（裁定122）。
- 型式＝`docs/116UI_v3写像対応表_v1.md` と同型（v要素→現行→分類→migration→備考）。**本書は draft（裁定前）＝行番号は 2026-09-04 時点の repo（`9de764d`）**。
- 分類語彙: **既存**（実装あり・表現差／移設含む）／**準備中**（PREP バッジ等で明示済み）／**新要件（器なし）**＝UI のみ／器あり・UI なし／器なし（要 mig）の内訳を備考へ。
- 対象外: 報酬 v3.1「歩合・バック」の商品販売バック3択（113 UI レーン＝mig0134 待ち）。色・トークンは対応表に含めない（裁定124 で更新済み）。
- 前提事実（live 実測）: `stores` 実列＝id/org_id/name/short/open_time/settings_json/hon_fee/jonai_fee/dohan_fee/service_rate/card_tax_rate/round_unit/round_mode/
  set_min/set_fee/ext_min/ext_fee/time_mode/time_per/business_tax_status/price_display/invoice_status/invoice_reg_no/tax_rounding/card_surcharge_rate/
  receivable_policy/dohan_auto_hon/ext_shimei_enabled。`settings_json` の live キー＝biz_cutoff_hm／cast_register_enabled／okuri_mode（＋mig 上の
  sales_norm_enabled/shimei_norm_enabled/shimei_norm_scope/receipt_*・pin_*）。店舗機能フラグ用テーブルは**無い**。店設定系 RPC＝set_store_biz_cutoff／
  set_store_business_hours／set_store_cast_register／set_store_norm_config／set_store_okuri_base／set_store_okuri_mode／set_store_pin_policy／
  set_store_pricing／set_store_receipt_profile／set_store_tax_config／set_store_time_pricing／set_printer_config／store_sales_target_set（13本・
  `stores.name/short/open_time` を書く RPC は**無い**）。`payments.method` CHECK＝cash/card/ar/other の4値。

## 分類集計

| 面 | 行数 | 既存 | 準備中 | 新要件 | うち器なし（要 mig） |
|---|---|---|---|---|---|
| 店舗設定 v3（S） | 46 | 18 | 1 | 27 | 24（利用機能フラグ群 S16-S26・店舗運用 S37-S45・店舗プロフィール S9-S14・利用機能カード S4） |
| 料金 v8.1（P） | 62 | 38 | 2 | 22 | 5〜6（説明欄 P24・終了日の扱い P26・支払方法 P51・追加料金 P55/P56・使用中バッジ P2 は派生表示なら不要） |
| 報酬 v3.1（C） | 50 | 33 | 6 | 11 | 1（同伴 割合の解錠 C18＝ガード撤去 mig。C11-C13 は解錠時に要） |
| レジ v12.1（R・⑬追記） | 69 | 28 | 20 | 21 | 約15（伝票統合 R18・顧客紐付け R50-R52・ボトルキープ R35・割引一般化 R47a/b/d・複数按分 R33b・席移動料金切替 R16b・利用機能プリセット R2・明細操作者 R37 ほか） |
| シフト v4.1（H・⑬追記2） | 44 | 19 | 9 | 16 | 約13（黒服シフト H3・公開/確定日時 H11/H26/H38・勤務パターン H15/H16・通知 H17/H28/H35/H36・休み希望 H25・代打 H44） |
| キャスト管理 v3.1（K・⑬完了） | 53 | 22 | 5 | 26 | 約20（在籍ステータス K25・入店時給保証 K33／4段時給 K32・LINE K37・勤務パターン K30/K31・役割 K46・ランク適用開始日 K29・スタッフ待遇/写真/勤務 K51-K53・保証期限 K20） |
| 日報・月報・売掛 v2.1（D・v1.2） | 49 | 21 | 9 | 19 | 約5〜8（締め解除 D23・現金差異承認 D20・再締め記録 D25・月次確定 D30・売掛 OFF D35・手動売掛 D38・諸経費明細 D16・回収ルール D48） |
| ホーム v2.1（M・v1.2） | 28 | 19 | 1 | 8 | 約2〜3（現金差異承認 M19＝D20・LINE M21・F4 店舗切替 M6 本体） |
| 分析 v2.1（A・v1.2） | 60 | 22 | 20 | 18 | 約8（販売実績 cast 別 A11/A40/A42・月内顧客集計 A46/A48/A51・来店間隔 A49・未紐付け A50・過去時点ステータス A56・当月リピート率 A26） |
| お知らせ・通知 v2.1（N・v1.2） | 44 | 15 | 12 | 17 | 約25（通知基盤＝rules/notifications/deliveries・LINE/メール・対象条件・予約/下書き/status・既読/到達・多店舗配信） |
| **計（10面）** | **505** | **235** | **85** | **185** | **約121** |

---

## §1 店舗設定 v3（S）

### 1-A. マスタ一覧（ハブ）

| # | v3 要素 | 現行実装（ファイル:行・RPC/テーブル/列） | 分類 | migration | 備考 |
|---|---|---|---|---|---|
| S1 | 検索「設定名を検索」 | `master-board.tsx:33,117-118,125-126`（hubSearch・title/desc 部分一致） | 既存 | 不要 | placeholder 文言一致 |
| S2 | KPI4枚・低在庫アラート | `master-board.tsx:58-59,128-144` | 既存 | 不要 | 裁定120 の danger 帯 |
| S3 | 群「店舗・運用」 | 現行は群名「店舗・卓」`master-board.tsx:93-102`（席・卓／営業時間の2枚）・ナビ `lib/nox/master/nav.ts:33-40` | 既存（名称差） | 不要 | v3 は群名変更＋カード3枚 |
| S4 | **NEW カード「利用機能」**（18機能中14機能を使用） | 該当なし（HUBS `master-board.tsx:64-116`・nav に `/master/store-settings` なし） | 新要件（器なし） | **要**（S16-S26 の器＋件数集計） | 件数はフラグ集合の数え上げ |
| S5 | 機密・税務／端末／レシートの3カード | `master-board.tsx:105-115`→`/master/system#devices/#receipts/#secrets`（`system-board.tsx:22-74`） | 既存 | 不要 | |

### 1-B. 店舗設定ページの器

| # | v3 要素 | 現行実装 | 分類 | migration | 備考 |
|---|---|---|---|---|---|
| S6 | `/master/store-settings` ページ＋3タブ | ルート・コンポーネントとも不存在 | 新要件（UI） | 不要 | タブ実装は `system-board.tsx:51-74` の SystemTab＋`.nox-seg` 流用 |
| S7 | 「未保存の変更があります」バー／変更を破棄 | dirty 追跡の既存型＝`plan-editor.tsx:140`（節別 dirty） | 既存パターン流用 | 不要 | MD §11 保存状態（未保存=Danger） |
| S8 | OFF 確認モーダル | `Modal` 共通部品（register 等）・マスタ側は `confirm()` 運用 | 既存パターン流用 | 不要 | |

### 1-C. タブ1 基本情報

| # | v3 要素 | 現行実装 | 分類 | migration | 備考 |
|---|---|---|---|---|---|
| S9 | 店舗名 | 列 `stores.name`（0001）。**編集 UI なし**（読取のみ）・表示は領収書 `register-board.tsx:1832`・`receipts.store_name_snap` | 新要件（器あり・書込 RPC なし） | **要**（`set_store_profile` 新設・列は既存） | |
| S10 | 管理用店舗コード（NOX-TOKYO） | 列・UI ともなし | 新要件（器なし） | **要** | 器候補＝`settings_json.store_code`（receipt_* と同型）・一意が要るなら新列 |
| S11 | 店舗表示名 | 列 `stores.short`（0001:51）は存在するが**参照・編集ゼロ** | 新要件（器あり・UI なし） | **要**（書込 RPC） | v3 は表示名／略称の**2項目**＝short は1本＝片方は settings_json 追加 |
| S12 | 店舗略称 | 同上 | 同上 | 同上 | |
| S13 | タイムゾーン（Asia/Tokyo） | **全画面ハードコード**（dashboard/customers/reservation/printer/biz-date.ts） | 新要件（器なし） | 要（保存するなら） | 営業日算定・日報・シフトまで JST 前提が浸透＝**固定表示のみ**が現実的 |
| S14 | 営業ステータス表示（表示する／しない） | 判定は `lib/nox/business-hours.ts businessHoursStatus`（予約 `reservation-panel.tsx:258-259,373`）。常時表示・可否フラグは不在 | 新要件（器なし） | 要（`settings_json.show_open_status`） | ON 時の表示場所（ヘッダ／サイドバー）未定義 |
| S15 | 「住所・登録番号は機密・税務情報へ」注記 | 実体＝`printer-panel.tsx:89-101`→`set_store_receipt_profile`（settings_json.receipt_*・invoice_reg_no）／機密＝`sensitive-tax-panel.tsx` | 既存 | 不要 | ★導線不整合: 住所・電話の実体は**レシート・プリンタ**側（v3 は機密・税務情報へ誘導） |

### 1-D. タブ2 利用機能（トグル10種）

前提: 機能フラグ用テーブル無し。既存の店フラグ流儀＝`stores.settings_json`＋専用 RPC（`set_store_norm_config` 0042／`set_store_cast_register` 0039／`set_store_okuri_mode` 0019）・UI 雛形＝`norm-config-panel.tsx:36-47`。

| # | v3 要素 | 概念の現行実装（OFF 時に隠す対象） | 分類 | migration | 備考 |
|---|---|---|---|---|---|
| S16 | VIP席 | `seats.kind='VIP'`（0005:106）／`seats-board.tsx:81,109,114`／VIPチャージ `pricing-board.tsx:67,447,473`（vip_charge・0130）／ルール `seat_kind`（0083:81） | 新要件（概念既存・フラグ器なし） | **要** | OFF で隠す先＝席種選択・帯4枠目・レジ席タイル |
| S17 | カウンター席 | `seats.kind='カウンター'`（0005:106,304）／`seats-board.tsx:109` | 同上 | **要** | `seats-board.tsx:153-160` に「席種カテゴリ＝準備中」の器あり |
| S18 | 料金区分 | `pricing_categories` CRUD `pricing-board.tsx:378-425`／開栓セレクタ `register-board.tsx:256-274,642,1341-1354`＝**active 0件で自動非表示**／凍結 0128 | **既存（事実上フラグ済み）** | 不要（明示化するなら要） | ★二重管理注意＝OFF は「active 0件」と同値 |
| S19 | キャストランク | `cast_ranks`（0083:30）／`pricing-board.tsx:234,203-225`／`casts-board.tsx:287-293,109-110`（set_cast_rank_of） | 新要件（フラグ器なし） | **要** | |
| S20 | 本指名 | `check_nominations.nom_kind='hon'`／`fee_kind='hon_shimei'`／`stores.hon_fee`（0118/0119） | 同上 | **要** | |
| S21 | 場内指名 | `nom_kind='jonai'`／`fee_kind='jonai_shimei'`／★`stores.ext_shimei_enabled`（0124:16）は**管理 UI ゼロ**（verify のみ参照） | 同上（一部器あり） | 一部不要 | ext_shimei_enabled は「延長時の場内自動課金」＝v3 の機能 ON/OFF と**意味が異なる**（混同注意） |
| S22 | 同伴 | `is_dohan`／`fee_kind='dohan'`／`stores.dohan_fee`／★`stores.dohan_auto_hon`（0118:33）も **UI ゼロ** | 同上 | **要** | dohan_auto_hon は店舗運用寄り＝v3 に該当欄なし（取りこぼし） |
| S23 | ポイント | `products.hon_pt`（`products-board.tsx:222`）／`comp_plans.point_slide`（`plan-editor.tsx:312`）／`pay.ts pointProducts` | 同上 | **要** | 「売上スライド ON ならタブは残す」は `plan-editor.tsx:312` の条件化で可 |
| S24 | 売掛 | `receivables`（0006:158）／`ar_collections`／UI analytics・report・payroll／★`stores.receivable_policy`（0114:254-257・disabled/customer_only/cast_liability_allowed）が**存在・UI ゼロ** | 新要件（**器あり**・UI なし） | **不要**（列既存＝UI 結線＋書込 RPC） | ★最有力の既存器＝OFF は `receivable_policy='disabled'` へ写せる |
| S25 | 前借り | `advances`（0019:77）／`deduction-panel.tsx:113-117`／`payroll-board.tsx:29,316-320` | 新要件（フラグ器なし） | **要** | |
| S26 | キャスト契約区分（雇用のみ／委託のみ／両方） | `cast_tax_profiles.mode`＝**キャスト個別**（`sensitive-tax-panel.tsx:66,105,125,273-275`）。店レベル制限は皆無 | 新要件（器なし） | **要**（`settings_json.contract_types`） | |

### 1-E. タブ2 報酬表示制御（チェックボックス10種）

★現行の「採用方式」は**保存されず値の有無から自動導出**（裁定101・`lib/nox/comp-methods.ts:59-79 adoptedMethodsOf`）。v3 の「保存する表示制御フラグ」は既存裁定と衝突＝裁定要。

| # | v3 要素 | 現行実装 | 分類 | migration | 備考 |
|---|---|---|---|---|---|
| S27 | 固定時給 | `comp_plans.base`→`comp-methods.ts:67`（hourly） | 既存（自動導出） | 要（明示保存化なら） | |
| S28 | 日給保証 | `PREP_ITEMS daily_wage`（`comp-methods.ts:17`）＝準備中を明示 | **準備中** | **要** | |
| S29 | 指名実績バック | `hon/jonai/dohan_back`→`comp-methods.ts:60-64,69` | 既存（自動導出） | 要（同上） | |
| S30 | 商品販売バック | products のバック設定／`check_lines.back_snapshot`／mig0132-0133 | 既存 | 要（同上） | comp-methods の採用判定には未参加 |
| S31 | 売上バック | `*_back_mode='rate'`→`comp-methods.ts:65,70` | 既存（自動導出） | 要 | 同伴の率＝`PREP rate_back`（準備中） |
| S32 | 売上スライド | `comp_plans.sales_slide`→`comp-methods.ts:71` | 既存 | 要 | 粗利基準＝`PREP gross_profit_slide` |
| S33 | ポイントスライド | `comp_plans.point_slide`→`comp-methods.ts:72` | 既存 | 要 | pt 付与ルール＝`PREP point_rules` |
| S34 | ノルマ | **`settings_json.sales_norm_enabled/shimei_norm_enabled/shimei_norm_scope`＋`set_store_norm_config`（0042）／`norm-config-panel.tsx:36-47`** | **既存（完成形）** | **不要** | ★v3 設計をそのまま踏襲すべき唯一の完成事例 |
| S35 | ボーナス | `comp_plan_components.kind='achievement_bonus'`→`comp-methods.ts:52,73` | 既存（自動導出） | 要 | 多段しきい値＝`PREP achievement_params` |
| S36 | ペナルティ | `penalty_config`／`comp-sections.tsx:151-163,786-791`（set_penalty_config・owner） | 既存 | 要（表示フラグ化なら） | 根拠記録＝`PREP penalty_basis_record` |

### 1-F. タブ3 店舗運用

| # | v3 要素 | 現行実装 | 分類 | migration | 備考 |
|---|---|---|---|---|---|
| S37 | 入店時の人数確認（毎回／前回値） | 開卓モーダルで**常に任意入力**（`register-board.tsx:228-231,1331-1338`・`check_open p_people` 空欄 null）・後追い `check_set_people`（0090） | 新要件（入力既存・設定器なし） | **要** | 「前回値」は保持場所が別途必要 |
| S38 | 料金区分の選択（開栓時に確認／既定区分） | 開栓時セレクタ固定・既定＝sort 最小（`register-board.tsx:256-261,642,1341-1354`）・開栓後変更不可（0128） | 新要件（片側既存） | **要** | 「既定区分を使用（確認なし）」分岐が新規 |
| S39 | 席種の初期選択（通常卓／VIP／カウンター） | 該当なし。レジは**席タイル起点**（`register-board.tsx:1325-1327`）＝席が先に決まる＝「初期席種」の概念が成立しない | 新要件（器なし・**要仕様再検討**） | 要 | 近縁＝セット料金ルール手動選択 `:232-236,1357-1371` |
| S40 | 指名キャスト確認（開栓時／注文時／任意） | 現行は**開栓後の指名タブのみ**（`register-board.tsx:639`・保存 `:679-708` check_set_nominations） | 新要件（設定器なし） | **要** | 「開栓時に確認」は開卓モーダルへの指名入力追加を伴う |
| S41 | 同伴確認（開栓時／必要時） | `is_dohan` は指名タブ内トグル（`:110,383-387,506-517`） | 同上 | **要** | |
| S42 | 未入力項目の会計前警告 | 該当なし（check_close 経路に必須項目チェックなし） | 新要件（器なし） | 要（設定値のみ・判定はクライアント） | |
| S43 | 営業時間外の伝票作成警告 | **予約のみ実装**＝`businessHoursStatus`→`reservation-panel.tsx:183,258-259,373`／`store_business_hours`（0032）。開卓には警告なし | 新要件（判定基盤あり） | **要**（設定値のみ） | ★既存関数を開卓モーダルで再利用＝最も低コスト |
| S44 | 重複キャスト配置の警告 | 該当なし（`seat time conflict` は予約枠＝別概念） | 新要件（器なし） | 要 | open 伝票の check_nominations 横断で判定可 |
| S45 | 0円料金の確認表示 | 該当なし（近縁＝割引/無料の申請承認 `register-board.tsx:425,1168-1181,2427-2469`） | 新要件（器なし） | 要 | |
| S46 | 「切替時刻・時間課金・税・丸めは料金設定へ」注記 | 営業日切替＝`business-hours-panel.tsx:62,96-99,110`（set_store_biz_cutoff・0106）／税＝`pricing-board.tsx:301,340`／丸め＝`pricing-panel.tsx:44-73`／時間課金＝`time-pricing-panel.tsx`（0052） | 既存 | 不要 | ★導線不整合: 営業日切替の実体は**営業時間パネル**側（v3/v8.1 は会計設定へ誘導） |

### 1-G. 店舗設定の総括
- そのまま使える器: S24 `receivable_policy`（列あり・UI なし）／S34 ノルマフラグ（完成形）／S18 料金区分（0件＝非表示済み）。
- **列はあるが書込経路ゼロ**: `stores.name/short/open_time`（0001）・`ext_shimei_enabled`（0124）・`dohan_auto_hon`（0118）＝後2者は**管理 UI の欠落として単独起票の価値**。
- migration の塊＝①店舗プロフィール書込 RPC（S9-S12,S14）②利用機能フラグ群 settings_json＋`set_store_features`（S16-S26）③店舗運用 `set_store_operations`（S37-S45）。雛形＝`set_store_norm_config`（0042・owner 限定・全引数明示・audit）。

---

## §2 料金設定 v8.1（P）

凡例: PB=`app/(manage)/master/pricing/pricing-board.tsx`／PP=`pricing-panel.tsx`／TP=`time-pricing-panel.tsx`／RB=`register/register-board.tsx`／M####=migration。

| # | v8.1 要素 | 現行実装 | 分類 | migration | 備考 |
|---|---|---|---|---|---|
| P1 | ヘッダ lead（3責務） | PB:821-830 | 既存 | 不要 | 文言差 |
| P2 | VIP／カウンター／料金区分「店舗設定で使用中」バッジ＋未使用機能の非表示 | 無し（フラグ器なし＝S16/S17/S18） | 新要件（器なし） | 要（S16-S18 と同じ器・派生表示なら不要） | レジ側非表示も連動＝影響大 |
| P3 | タブ3本 | PB:834-840 | 既存 | 不要 | 裁定117 写像済 |
| P4 | ルール一覧（優先／表示名／適用条件／料金の扱い／状態／操作） | PB:941-1020（並び/表示名/区分/時間帯/席種/適用日/セット/延長/同伴/VIPチャージ/状態/操作） | 既存（表現差＝列の畳み込み） | 不要 | |
| P5 | 優先列「1 既定」の**数値表示** | PB:955-985（∧∨＋既定バッジ・priority **非露出**＝裁定115-②） | 既存（方針差） | 不要 | ★**裁定要**: v8.1 は数値露出＝現行方針と正面衝突 |
| P6 | ＋料金ルールを追加 | PB:944 openNewBand | 既存 | 不要 | |
| P7 | 重複警告 | PB:768-790 bandOverlaps／PB:1023-1034 | 既存（現行の方が厚い＝Z7） | 不要 | |
| P8 | 指名料上書き注記（時間帯別の店舗基本指名料） | 注記なし。実体＝`pricing_rules` hon_shimei/jonai_shimei 帯（`check_shimei_add`→`pricing_resolve_core` M0084:330-337） | 新要件（UI のみ） | 不要 | DB は解決済み・UI 導線なし |
| P9 | 料金区分カード | PB:882-939・set_pricing_category（M0127） | 既存 | 不要 | 空状態も実装済 |
| P10 | 適用料金を確認（プレビュー器） | PB:1049-1109・runPreview PB:725-757 | 既存 | 不要 | |
| P11 | 入力 入店日時／席種／人数／同伴／支払方法 | PB:1053-1072 | 既存 | 不要 | |
| P12 | 入力 区分 | 無し（runPreview は p_category_id 未送信 PB:729-732） | 新要件（UI のみ） | **不要** | ★R8=起票#52 は **M0130:137 で消化済**（pricing_resolve 6引数・whitelist 7種）＝UI 追加のみ |
| P13 | 入力 指名キャスト | 無し（`casts.rank_id` 読みの前例 PB:717-722） | 新要件（UI のみ） | 不要 | キャスト個別料金の器なし＝実質「ランクの代理選択」 |
| P14 | 入力 キャストランク | 無し（p_rank_id null 固定 PB:731） | 新要件（UI のみ） | 不要 | pricing_resolve は受理済 |
| P15 | 結果「適用ルール：〜」 | liveNow 側のみ PB:855-865（R9）・プレビュー側未実装 | 新要件（UI のみ） | 不要 | rule_id→手元 rules で name |
| P16 | 結果 セット／セット終了時刻 | 額・分は PB:1078-1084・**終了時刻は未実装** | 一部新要件（UI） | 不要 | 入店+duration_min の表示計算 |
| P17 | 結果 延長 | プレビューは set/dohan のみ（PB:733） | 新要件（UI のみ） | 不要 | call("extension") 追加 |
| P18 | 結果 本指名／場内（出所「エースランク」） | 無し | 新要件（UI のみ） | 不要 | pricing_resolve(hon_shimei, p_rank_id) |
| P19 | 結果 VIPチャージ | 無し | 新要件（UI のみ） | 不要 | vip_charge も whitelist 済 |
| P20 | 解決順の注記 | 無し（PB:1104-1106 は別注記） | 新要件（注記） | 不要 | 「キャスト個別」は器なし＝文言要調整 |
| P21 | modal 表示名 | PB:1629-1640 mName・p_name（M0107） | 既存 | 不要 | 帯全行へ同値配布 |
| P22 | modal 状態 | PB:1740-1748 | 既存 | 不要 | |
| P23 | modal 優先順位「N 番目」＋「○○の上」 | 無し（∧∨のみ・pricing_rule_reorder M0131） | 新要件（UI） | 不要 | P5 の裁定に従属 |
| P24 | modal 説明（任意） | **列なし**（pricing_rules DDL M0083:74-101＋追加列に description 無し） | 新要件（器なし） | **要**（列追加＋set_pricing_rule 17引数化・帯配布） | |
| P25 | modal 開始／終了時刻 | PB:1608-1614 time_from_min/time_to_min | 既存 | 不要 | |
| P26 | modal 終了日の扱い（同一営業日／翌暦日／LAST） | **無し**（営業日区切り跨ぎは `bad time` 拒否 M0130:247・PB:1615-1621） | 新要件（器なし） | **要**（跨ぎ表現列＋set_pricing_rule 検証＋**pricing_resolve_core M0130:122-124 と check_open ext_menu M0130:527-529 の鏡像2点同時改修**） | ★教訓52 型＝最も危険 |
| P27 | modal 曜日 | PB:1685-1692 dow_mask | 既存 | 不要 | |
| P28 | modal 席種 | PB:1655-1660 | 既存 | 不要 | |
| P29 | modal 料金区分 | PB:1663-1683（M0128） | 既存 | 不要 | |
| P30 | modal 時間料金 セット／延長（円＋分） | PB:1697-1712 amount/duration_min | 既存 | 不要 | duration>1440 は bad duration（M0131） |
| P31 | 「基本料金を使用／上書き」select＋「0円＝無料」 | 現行＝**空欄＝行を作らない＝フォールバック**（PB:1697・保存分解 PB:473-505）・0円は amount>=0 で保存可 | 新要件（UI 表現のみ） | 不要 | 行の有無＝上書き有無と等価＝ラベル化 |
| P32 | 課金単位（1名／1卓）セット・延長 | PB:1724-1740 billing_unit（M0130:59） | 既存 | 不要 | null＝stores.time_per |
| P33 | 指名・同伴料金 本指名／場内／同伴の 基本｜上書き | **同伴のみ** PB:1709-1712・本指名/場内の帯上書き UI 無し | 一部新要件（UI） | 不要 | set_pricing_rule は hon/jonai 受理（区分・単位は送らない） |
| P34 | VIP専用料金 使用する／しない | トグル無し＝席種 VIP のセットルールで表現（PB:1119-1122） | 既存（表現差） | 不要 | 方式A＝席種条件／方式B＝vip_charge 併用可 |
| P35 | VIPチャージ 使用／額／単位 | PB:1713-1722・1729・vip_charge（M0130:56）・check_open 行生成 M0130:631-649 | 既存 | 不要 | |
| P36 | right rail「適用内容」「料金の決まり方」 | 無し | 新要件（UI のみ） | 不要 | 入力値ミラー |
| P37 | 基本の指名・同伴料金 | PB:1125-1136・PP:70-74・set_store_pricing | 既存 | 不要 | |
| P38 | ランク別の上書き料金 | PB:1139-1242・saveRankRow PB:565-596（priority 200/100・裁定80） | 既存 | 不要 | 既定（ランクなし）行も実装済 |
| P39 | VIP料金方式カード（専用／チャージ 額＋単位） | 独立カード無し（実体はルール側 P34/P35） | 新要件（カード器） | 不要（読み取り表示なら）／要（店単位既定額列を置くなら） | |
| P40 | 料金ルールの一覧（表示名ごと） | PB:1245-1307（M3・「別マスタではない」逐語） | 既存 | 不要 | |
| P41 | 会計設定のサブタブ4本 | カード縦積み PB:1325-1567 | 新要件（UI のみ） | 不要 | 分割のみ |
| P42 | 営業日の切替時刻 | PB:1336-1343（read-only＋導線）・set_store_biz_cutoff（M0106） | 既存 | 不要 | 二重編集導線は作らない（A1） |
| P43 | 時間課金の確定＝固定 | PB:1344-1354 | 既存 | 不要 | |
| P44 | 自動延長 手動／自動 | PB:1355-1366＋TP:54-57 set_store_time_pricing(p_time_mode) | 既存 | 不要 | |
| P45 | 基本料金（フォールバック）＋課金単位 | PB:1370-1384 TimePricingPanel・stores.set_*/ext_*/time_per | 既存 | 不要 | |
| P46 | サービス料率 | PB:1397-1403 PricingPanel fields="service"・service_rate | 既存 | 不要 | |
| P47 | 価格表示 内税／外税 | PB:1407-1414 price_display・set_store_tax_config（M0112:204） | 既存 | 不要 | |
| P48 | 事業者区分 | PB:1415-1422 business_tax_status | 既存 | 不要 | |
| P49 | インボイス 未登録／登録済み | PB:1423-1440 invoice_status/invoice_reg_no | 既存 | 不要 | 登録番号入力は mock に無い＝残置 |
| P50 | 税額の端数処理＋処理単位 | PB:1441-1448 tax_rounding | 既存 | 不要 | |
| P51 | 支払方法カード（現金／カード 有効） | **無し**。payments.method 4値 CHECK（cash/card/ar/other・M0006:127）・check_pay ハードコード（M0088:629）・日報の名指し集計 | 新要件（器なし） | **要**（stores 列 or settings_json＝表示制御のみ） | ★値域4値は削減不可（RB:1519-1543）＝非表示でも集計経路は残す |
| P52 | カード手数料（日報集計用）% | `stores.card_tax_rate`（M0051:19）・PB:1397-1403 で編集・daily_report_close が列読み | 既存 | 不要 | mock は独立カード＝**移設のみ** |
| P53 | お客さまへ加算 有効／無効＋加算率 | `stores.card_surcharge_rate`（M0111:49-50）・set_store_tax_config（M0112:211）・PB:1451-1483・レジ RB:403-421（check_add_line kind='charge'） | 既存 | 不要 | ★日報用／客加算の分離は**列レベルで完成済み** |
| P54 | 転嫁の契約確認 警告文 | PB:1472-1482（警告＋**有効化時 ack チェック**＝裁定87 第2層 PB:336-338） | 既存 | 不要 | mock に ack 無し＝**残置推奨**（法務） |
| P55 | 追加料金 一覧（深夜チャージ／持込料…） | **器なし**（products.type は drink/champ/bottle・都度 `check_add_line(p_kind='charge', p_name, p_unit_price)` のみ＝RB:415-419 前例） | 新要件（器なし） | **要**（追加料金マスタ新設 or products.type 拡張＋レジ選択導線） | ★最も重い新規レーン・resolve 非関与（pricing_rules と別系統） |
| P56 | 追加料金 計算方式 固定額／率 | 同上（率の前例＝surcharge `round(due×rate/100)` RB:411） | 新要件（器なし） | 要 | 率の母数（group due か小計か）定義要 |
| P57 | 会計確定 丸め単位／方法 | PB:1496-1511 fields="round"・round_unit/round_mode（up/down/round） | 既存（表現差＝select 化） | 不要 | |
| P58 | 確定前の確認＝常に表示 | PB:1531-1540 | 既存 | 不要 | |
| P59 | 締め後の伝票修正＝管理者のみ・準備中 | PB:1541-1552（disabled＋準備中）・実体＝check_void（M0047:82）のみ | **準備中** | 不要（現状維持） | mock も準備中＝一致 |
| P60 | 監査ログ＝全件保存 | PB:1553-1561（/audit 導線）・audit_log_write 全 RPC | 既存 | 不要 | |
| P61 | （mock に無い）値引きを税計算前に適用 | PB:1512-1519 disabled＋準備中 | **準備中**（残置） | 不要 | v8.1 で削除するか要判断 |
| P62 | （mock に無い）「いま開卓したら」バー | PB:844-880 | 既存（残置＝Z1） | 不要 | |

### 2-G. 料金の総括
1. **プレビュー拡張（P12〜P20）は全て mig 不要**＝R8 が待っていた 6引数化は M0130 で消化済み→即着手可（要件書 §4 と一致）。
2. mig が要るのは **P24 説明欄／P26 終了日の扱い（鏡像2点・最危険）／P51 支払方法**＋**P55/P56 追加料金マスタ（独立レーン）**。
3. カード手数料の2系統分離は列レベルで完成（card_tax_rate／card_surcharge_rate）＝カード再編（移設）のみ・ack は残置推奨。

---

## §3 報酬プラン v3.1（C・「歩合・バック」の商品販売バック3択は対象外）

前提3点（先に）: ①**同伴 割合（%）は今も封印中**（`0115:114-115` の `dohan rate requires R-2b`・`0119:12`「0115 のガードは外さない（裁定76）」・0121/0133 も解除なし・UI は per_count 固定 `plan-editor.tsx:157`／`plan-board.tsx:80`）②**キャスト割当の一括保存は無い**（行内「変更」→set_cast_plan 4引数 `comp-sections.tsx:602,509`）③**達成ボーナスは「加算額(円)」**（`plan-editor.tsx:82`・p_mode 'amount' 固定 `:175`）。mock の「加算率 %」は DB 器あり（components.mode 'rate'＋rate 列・0114／set_comp_component 受理 0115:198-202）だが UI 未接続＋`pay.ts:547-553` は amount のみ消化。

| # | v3.1 要素 | 現行実装 | 分類 | migration | 備考 |
|---|---|---|---|---|---|
| C1 | 選択中のプラン select | `plan-board.tsx:107-115`（「編集中プラン」） | 既存 | 不要 | 文言差 |
| C2 | 有効バッジ | `plan-board.tsx:120-124` | 既存 | 不要 | |
| C3 | 適用中 N人 | `plan-board.tsx:125`＋headOf:46（cast_plan valid_to null 件数 `comp-sections.tsx:159`） | 既存 | 不要 | |
| C4 | ＋報酬プランを追加 | `plan-board.tsx:132`「新規」→保存で作成 `plan-editor.tsx:149-168` | 既存 | 不要 | ラベル差 |
| C5 | 複製 | `plan-board.tsx:133`＋duplicate:84-89（set_comp_plan 16引数・components 非複製） | 既存 | 不要 | mock は複製後挙動未定義 |
| C6 | ⋮ メニュー | 無し（無効化/有効化は独立ボタン `plan-board.tsx:134-136`） | 新要件（UI のみ） | 不要 | |
| C7 | 6タブ | `plan-board.tsx:23-30` | 既存 | 不要 | 裁定106 B1 |
| C8 | 保証時給 ¥ | `plan-editor.tsx:247`（comp_plans.base） | 既存 | 不要 | 「基本時給」と「保証」の分離は器なし（裁定106 器調査） |
| C9 | 状態 有効 | `plan-editor.tsx:248` | 既存 | 不要 | |
| C10 | 最低月額保証 checkbox | `plan-editor.tsx:250-256`＋CompRows（guarantee_min・params {period:"month"} `:172`） | 既存 | 不要 | ★mock「将来対応予定・現行計算に反映しない」だが実装は `pay.ts:571-578` で床として**反映済み**＝食い違い（要確認） |
| C11 | 日数の算出方法「暦日ベース」準備中 | 近似＝`Prep guarantee_period`（`plan-editor.tsx:258`・`comp-methods.ts:19`） | **準備中**（PREP あり・ラベル不一致） | 解錠時に要 | |
| C12 | 保証対象時間 96.0h 準備中 | `Prep guarantee_hours`（`comp-methods.ts:18`） | **準備中** | 解錠時に要 | |
| C13 | 保証丸め単位 1円 準備中 | PREP に保証丸めキー無し（近いのは rounding_axes＝歩合の丸め） | 新要件（PREP 未収載） | 解錠時に要 | PREP 追加＝c3 の本数 pin に影響（裁定106 ★） |
| C14 | ⚠「前提条件は保証計算に適用されません」 | 文言なし | 新要件（文言） | 不要 | |
| C15 | （mock に無い）日給制バッジ | `Prep daily_wage`（`plan-editor.tsx:258`） | **準備中**（既存） | — | v3.1 で消える要素＝残置可否 |
| C16 | 本指名バック 固定額｜割合 | `plan-editor.tsx:266-270`（hon_back_mode/hon_back/hon_back_rate） | 既存 | 不要 | 単位 UI の同時切替（MD §4）は要調整 |
| C17 | 場内指名バック | `plan-editor.tsx:271-275` | 既存 | 不要 | |
| C18 | **同伴バック 割合 %** | 値入力は `plan-editor.tsx:276`（円/本のみ）・率は 0115 ガード＋`Prep rate_back`（unlock「R-2b 後」） | **準備中** | **要（ガード撤去 mig）** | R-2b 完了後も 0119 が明示据置＝解錠は別裁定 |
| C19 | ⓘ 指名実績バック／商品販売バックは別系統 | 相当文言なし | 新要件（文言） | 不要 | DB は 0132 で分離済 |
| C20 | 売上スライド 3段（段／判定基準／時給） | SlideInput（`comp-sections.tsx:181-199`）＋`plan-editor.tsx:319`（sales_slide） | 既存（表組み・列見出し差） | 不要 | 3段固定 `:183` |
| C21 | ポイントスライド 3段（pt以上） | `plan-editor.tsx:320`（point_slide） | 既存 | 不要 | 単位「pt以上」表示は未実装 |
| C22 | 判定基準の固定表示 | `plan-editor.tsx:314-317`（生バッジ「判定基準・対象の選択: 準備中」） | **準備中**（生バッジ＝PREP 未収載） | 解錠時に要 | |
| C23 | （mock に無い）pt付与ルール／粗利基準／帯歩合% | Prep 3種 `plan-editor.tsx:323` | **準備中**（既存） | — | v3.1 は準備中列挙を撤去＝表示整理の判断 |
| C24 | 達成ボーナス **加算率 %** | UI＝加算額(円) `plan-editor.tsx:82`／DB は mode 'rate'＋rate 列あり／`pay.ts:547-553` は amount のみ | 新要件（器あり・UI/計算なし） | **不要**（pay.ts の rate 消化＋UI） | ★「20%」の母数（gross か売上か）未定義＝裁定要 |
| C25 | 達成ボーナス 状態 | `plan-editor.tsx:84` | 既存 | 不要 | |
| C26 | ＋ボーナス条件を追加 | CompRows「追加」`plan-editor.tsx:86`（複数行可） | 既存 | 不要 | 多段しきい値＝Prep achievement_params |
| C27 | キャスト別ノルマ目標 table | NormTab（`comp-sections.tsx:664-678`）＝cast_norms 6列・set_cast_norm 6引数・搭載 `norma-board.tsx:39-42` | 既存 | 不要 | ★行内「編集」ボタン無し（下部フォームで上書き）・売上/指名は罰金非接続 `:695` |
| C28 | 当欠罰金 円/回 | PenaltyTab（`comp-sections.tsx:815`）penalty_config.fine_absent・set_penalty_config 12引数 | 既存 | 不要 | |
| C29 | 遅刻罰金 | fine_late | 既存 | 不要 | |
| C30 | 試用月1シフト時間 h | hours_per_shift | 既存 | 不要 | |
| C31 | ペナルティ 状態 | norm_on checkbox `comp-sections.tsx:816` | 既存 | 不要 | |
| C32 | （mock に無い）norm_days/dohan 4値・猶予3値 | `comp-sections.tsx:817-818` | 既存（mock 未掲載） | — | 畳むか要判断 |
| C33 | ⚠ 法務確認前提 | `plan-board.tsx:164-169`（労基法91条注記＋Prep penalty_basis_record） | 既存＋準備中 | 解錠時に要 | 裁定98/mig0117 |
| C34 | sim 報酬プラン select | `components/simulator-panel.tsx:142-149` | 既存 | 不要 | `plan-board.tsx:177` compact |
| C35 | 税区分 委託｜雇用 | `simulator-panel.tsx:152-155` | 既存 | 不要 | |
| C36 | 計算期間／出勤／1日の勤務／総売上 | `simulator-panel.tsx:210-214`（SimInput periodDays/days/hoursPerDay/sales） | 既存 | 不要 | |
| C37 | 本指名／場内／同伴 本 | `simulator-panel.tsx:229-241`（率方式時は指名料額へ差替） | 既存 | 不要 | |
| C38 | ドリンクバック 円 | `simulator-panel.tsx:249`（productBack.drink） | 既存 | 不要 | champ/bottle/pt/遅刻欠勤/ノルマは「詳細」に格納 `:266-290`（mock に無い） |
| C39 | （mock に無い）プラン値編集カード | `simulator-panel.tsx:157-204`（store モード） | 既存（mock 未掲載） | — | 残置可否 |
| C40 | 割当 table キャスト／適用プラン | AssignTab（`comp-sections.tsx:549-570`）・cast_plan | 既存 | 不要 | |
| C41 | 売上進捗 | `comp-sections.tsx:437-458,572-584`（get_cast_sales÷sales_target） | 既存（表現差） | 不要 | mock は実績額のみ |
| C42 | 適用開始日 | `comp-sections.tsx:587-589` date→set_cast_plan p_valid_from（cast_plan.valid_from） | 既存 | 不要 | 現行は「空＝今すぐ」・保存後クリア＝既存値表示は新規 |
| C43 | 上書き ON｜OFF | `comp-sections.tsx:592-599`（「N件 ▸」＋展開パネル・overrides_json 8キー） | 既存（表現差） | 不要 | ON/OFF 二値化は UI 再設計 |
| C44 | 状態（変更なし｜未保存） | 無し（行 draft はあるが状態列未描画） | 新要件（UI state） | 不要 | |
| C45 | 「割当変更を保存」（一括） | 無し（行別「変更」→set_cast_plan） | 新要件（UI 集約） | 不要 | 複数行ループ発行で可 |
| C46 | ⚠ 未保存の変更があります | 無し | 新要件 | 不要 | C44/C45 とセット |
| C47 | 右レール プラン概要 | `plan-board.tsx:193-215`＋compSummaryOf（`comp-methods.ts:36-56`） | 既存 | 不要 | ステータスは名前サフィックス・採用方式ピルは mock に無い |
| C48 | 右レール「商品販売バック 商品別設定」行 | compSummaryOf に無し（DB は product_back_mode 等＝0132/0133・UI 未着手） | 新要件（器あり・表示なし） | 不要 | 113 UI レーン |
| C49 | 右レール 保存状態（6タブ分） | `plan-board.tsx:216-227`＝base/backs/slides の3行のみ（onDirtyCounts `plan-editor.tsx:136-143`） | 既存＋不足（quota/sim/assign 3行） | 不要 | sim=保存対象外・assign は C44/C45 の状態を親へ |
| C50 | 共通UIルール（単位インライン等） | 明文リンクなし。`theme.ts`＋`.nox-numfield`（`comp-sections.tsx:105-115`）・`nox-seg` | 新要件（様式） | 不要 | ★「入力欄内の常時単位表示」は現行未対応＝全入力の様式変更 |

### 3-G. 報酬の総括
- mig が要るのは **C18（同伴 割合の解錠）**と **C11-C13（保証の前提3項目を実データ化する場合）**のみ。他は既存の器で足りる。
- UI で詰める主差分＝C6／C24（pay.ts の rate 消化も）／C27 行内編集／C41-C46 割当の整形＋一括保存／C49 保存状態6行化／C50 単位インライン。
- PREP_ITEMS（`comp-methods.ts:16-29`・12件・c3 assert が本数 pin）: C11 guarantee_period／C12 guarantee_hours／C18 rate_back は収載済み。生バッジ（未収載）＝C22 判定基準・商品売上×率（`plan-editor.tsx:288`）。準備中バッジすら無い＝C13・C14。

---

## §4 レジ v12.1（R）— ⑬追記（`nox-register-integrated-v12_1.html`・`569d7415…52a2`・44,793B・収蔵済み）

前提: 現行レジ＝`app/(manage)/register/register-board.tsx`（上位タブ＝卓席・会計／予約 `:1304`・伝票詳細＝注文／指名・席／会計 `:1966`）＋`reservation-panel.tsx`／`bottle-keep-panel.tsx`／`drink-claim-queue.tsx`。キャスト用レジ＝`app/kiosk-register/page.tsx`（`app/kiosk` は打刻専用）。モックの**卓操作ドロワー・「利用機能：標準／シンプル店」・顧客紐付け・商品検索・注文履歴タイムライン・割引/追加料金フォーム（固定額以外）は現行 UI に存在しない**。

| # | v12.1 要素 | 現行実装 | 分類 | migration | 備考 |
|---|---|---|---|---|---|
| R1 | グローバルナビ | `app/(manage)/layout.tsx:16,48`（顧客タブ＝owner/manager＋staff∧can_crm） | 既存 | 不要 | |
| R2 | ヘッダ **[利用機能：標準][シンプル店を確認]** | 該当コードなし（利用機能／シンプル店／feature_flag／plan_tier＝0 hit） | 新要件（器なし） | **要** | ★下記「利用機能」参照＝店舗設定 v3 のトグル群とも同一機構ではない（どちらも未実装） |
| R3 | タブ [卓席・会計][予約] | `register-board.tsx:1304`・予約可視 `page.tsx:44` | 既存 | 不要 | |
| R4 | フロア「店舗で使う席種だけ表示」 | `page.tsx:16`（active 席全件・席種フィルタ UI なし） | 準備中（kind あり・絞込なし） | 不要 | S16/S17 のフラグと連動 |
| R5 | 席タイル状態・合計・滞在分 | `:214,433-447,120 elapsedMin` | 既存 | 不要 | |
| R6 | 席タイル 着卓キャスト顔 | `:447`・`page.tsx:35` | 既存 | 不要 | kiosk-register 非対応 `:720` |
| R7 | 相席「同一会計」表示 | `:30,219`（check_seats・0053） | 既存 | 不要 | |
| R8 | 低在庫「残N」 | `:604-609,2396` | 既存 | 不要 | |
| R9 | 開卓モーダル（人数） | `:1325-1389`・`:648`→check_open 6引数（0130:659） | 既存 | 不要 | |
| R10 | 開卓 適用ルール表示（額プレビュー） | `:1357` セットルール select・ルール名のみ＝**確定額プレビューなし** | 準備中 | 不要（pricing_resolve 呼び） | |
| R11 | 開卓 料金区分 | `:1341-1353`（0128・開栓時凍結） | 既存 | 不要 | 「VIP切替」への現行回答＝変更不可・void→再開卓 |
| R12 | 開卓時に本指名を同時指定 | なし（p_nom_type free 固定 `:655`・指名は開栓後タブ `:639`） | 新要件（器＝check_set_nominations あり） | 不要 | 予約経由のみ引継（R60） |
| R13 | 卓ヘッダ（人数・滞在・合計） | `:1860,120,1199-1210` | 既存 | 不要 | |
| R14 | **[卓操作] ドロワー**（6操作の集約） | 集約 UI なし（各操作は R15-R20 に散在） | 新要件（UI 集約） | 不要 | |
| R15 | 卓操作① 人数変更 | `:989`→check_set_people（0090）・UI `:1860-1875` | 既存 | 不要 | 0130 で set_unit 追随 |
| R16 | 卓操作② 席移動 | `:1075`→check_move_seat（0053）・UI `:1626` | 既存 | 不要 | |
| R16b | 席移動時 [現在料金を維持][VIP料金へ変更] | なし（check_move_seat に料金切替なし・区分は凍結） | 新要件（器なし） | **要**（引数追加 or check_set_category 新設） | 現行設計＝void→再開卓 `:1351` |
| R17 | 卓操作③ 相席追加（同一会計） | `:1050`→check_add_seat／`:1063` check_remove_seat（0053） | 既存 | 不要 | |
| R17b | 相席「別伝票で開始」 | 専用経路なし（別席を check_open するのみ・伝票間リンクなし） | 新要件（器なし） | 要（伝票グループ列） | |
| R17c | 相席モーダル「追加人数」 | なし（人数は set_people で別操作） | 準備中 | 不要 | |
| R18 | 卓操作④ **伝票を統合** | **check_merge 相当が皆無** | 新要件（器なし） | **要**（新 RPC） | ★最重要ギャップ |
| R19 | 卓操作⑤ 伝票を分割 | 部分＝pay_group A〜F 分割 `:756` check_line_set_group（0091）＋`:1233,1250` | 準備中（同一伝票内のみ・別伝票化不可） | 要（行移送 RPC）※group で足りるなら不要 | 上限6 `:1226` |
| R20 | 卓操作⑥ 閉卓（未会計時警告） | 「閉卓」操作なし＝check_close は全 group 充足時のみ `:1110`・未会計は check_void `:1143` | 準備中（意味論差） | 要（作るなら） | |
| R21 | **[延長確認] モーダル**（次回延長の予定・3択） | 確認モーダルなし＝`:944` addExtension→check_extension_add 即追加（0089/0098）・表示材料 `:1885-1907` | 準備中（RPC あり・確認 UI なし） | 不要 | 「内容を変更して延長」≒延長メニュー `:1911`（ext_menu_snap） |
| R22 | 「このセットで終了」 | なし（自動延長の停止フラグなし） | 新要件（器なし） | 要 | |
| R23 | 手動/自動 延長モード | time_mode・check_time_charge_apply `:928`（0052/0097） | 既存 | 不要 | |
| R24 | 「次回延長まで／次回延長 hh:mm」 | `lib/nox/check-calc.ts:30-46`・`:1885` | 既存 | 不要 | |
| R25 | 料金スナップショット表示 | `:1907`・checks 凍結列（0130 set_unit/ext_unit） | 既存 | 不要 | |
| R26 | 商品カテゴリチップ | `:390,2360-2364`（product_categories 0063/0081） | 既存 | 不要 | |
| R27 | 商品検索入力 | なし | 新要件（表示層） | 不要 | |
| R28 | [よく使う][最近使った] | なし | 新要件 | 要（集計）or client 集計 | |
| R29 | 商品タイル 在庫常時表示 | `:2396`（低在庫のみ） | 準備中 | 不要 | |
| R30 | 数量ステッパー→追加 | `:414` check_add_line（連打束ね 700ms） | 準備中（表現差） | 不要 | |
| R31 | 販売実績：さくら [変更] | `:903` drink_claim_submit_proxy／`:918` drink_claim_void（0066/0067）・UI `:1391` | 既存 | 不要 | back_exempt_from_split（0069） |
| R32 | ⓘ 商品販売バックを使う店舗だけ表示 | 店フラグなし | 準備中 | 要（使うなら） | R2/S16 型のフラグ問題 |
| R33 | 帰属変更 [1名に帰属] | drink_claim_submit_proxy＝1 claim 1 cast | 既存 | 不要 | |
| R33b | **[複数キャストで按分]** | なし（drink_claims は単一 cast） | 新要件（器なし） | **要** | 指名按分（ratio_weight）とは別物 |
| R34 | 帰属モーダルの検索＋[出勤中][担当中] | cast-picker `:1279` | 準備中 | 不要 | |
| R35 | **ボトルキープ「この卓に出す」** | bottle-keep-panel＝登録専用（bottle_keep_register 0023/0094）・bottle_keep_update はあるが**伝票へ出す RPC なし** | 新要件（器なし） | **要**（check×bottle_keeps 結線＋会計時残量更新） | 完全な新フロー |
| R36 | ボトルキープ表示（残量・登録日・前回卓） | bottle_keeps 列あり・register 側では未読 | 準備中 | 不要 | 顧客名＝**PII ゲート待ち**（can_crm） |
| R37 | 注文履歴（時刻・操作者・[取消][詳細]） | 明細カード `:2487-2511`・**check_lines に操作者列なし**（created_at はあるが select 外 `:472`） | 新要件（器なし＝操作者） | **要**（check_lines.created_by or audit 参照） | 取消＝`:857` check_remove_line 既存 |
| R38 | 注文取消モーダル（理由入力） | removeLine は理由なし即削除（理由必須は check_void のみ `:1469`） | 準備中 | 要（p_reason） | |
| R39 | 商品をクリア | `:884` clearItems（drink/champ/bottle） | 既存 | 不要 | |
| R40 | 明細パネル | groupInfo `:1199`＋check-calc.ts:24（check_group_due 鏡像） | 既存 | 不要 | |
| R41 | 指名・同伴カード「ON の種別だけ表示」 | `:1979`・種別 hon/jonai/dohan/free `:132`・店別可視フラグなし | 準備中 | 要（S20-S22 のフラグ） | |
| R42 | 「料金の決まり方を見る」（採用元開示） | 解決＝pricing_resolve_core（0130）・UI の根拠開示なし | 新要件（RPC あり・UI なし） | 不要（RETURNS に採用元があれば） | |
| R43 | キャスト追加（検索＋候補・プルダウン不使用） | cast-picker＋check_set_nominations（0119） | 既存 | 不要 | |
| R44 | （mock に無い）指名の分配率 % | `:2029-2060`（ratio_weight・nom-shares） | 既存（逆ギャップ） | 不要 | 残置 |
| R45 | 同伴（人数ステッパー・自動料金行） | `:383,680`（dohan_count） | 既存 | 不要 | |
| R46 | 請求確認（元明細→調整→サ料税→最終） | groupInfo／groupDueFull／check-calc | 既存 | 不要 | |
| R47 | [＋調整を追加]／割引・追加料金モーダル | `:1169` approval_direct／approval_request（0036/0039）・承認 `:1191`・**p_type は discount/free の2値・固定額のみ** | 準備中 | — | 下記 a-e |
| R47a | 計算方式 割合／数量×単価 | なし（固定額のみ） | 新要件（器なし） | **要** | |
| R47b | 対象 セット料金／指名・同伴／商品／特定明細 | なし（pay_group 単位のみ） | 新要件（器なし） | **要** | |
| R47c | 追加料金（プラス調整） | 汎用なし＝カード手数料のみハードコード `:405-408`（kind='charge'）・カスタム明細手打ち `:2413` | 準備中 | 要 | P55 追加料金マスタと同件 |
| R47d | よく使う設定（プリセット） | マスタなし | 新要件（器なし） | **要** | P55/P56 と同件 |
| R47e | サ料対象／税の対象（調整行） | check_lines.tax_category（0111）あり・調整行の「サ料対象外」フラグなし（check_group_due は discount 一律減算 `:1202`） | 準備中 | 要 | |
| R48 | 算定根拠を見る | なし（snapshot にデータはある） | 新要件（UI） | 不要 | |
| R49 | **顧客カード（代表客・同行者）** | register-board に customer 参照ゼロ（`:208`「顧客 UI 実装時に追加」）・DB は checks.customer_id（0006:62）と check_open 第4引数あり | 新要件（器あり・UI なし） | 不要（UI） | **顧客は PII ゲート待ち**（customers.name/furigana/tel/birthday＝0023:65-79・可視＝owner/manager＋staff∧can_crm・前例＝get_cast_mynumber_masked／read_cast_sensitive の audit） |
| R50 | 顧客を設定モーダル（検索・新規登録） | 検索は customers-board のみ・**レジからの紐付け RPC なし**（開栓時指定のみ） | 新要件（器なし＝会計中/後の付替） | **要**（check_set_customer） | 電話検索＝PII・**顧客は PII ゲート待ち** |
| R51 | 「会計後でも紐付け可能」 | 経路なし | 新要件（器なし） | 要 | |
| R52 | 同行者（複数客） | 概念なし（customer_id は1件） | 新要件（器なし） | **要**（check_guests 等） | |
| R53 | 会計方法 現金／カード／売掛 | `:1094` check_pay・語彙4値 `:121-129` | 既存 | 不要 | モックに「その他」欠落 |
| R54 | [会計を分ける]（顧客ごと／商品選択／金額指定） | pay_group（R19）＋均等割 `:1560-1570`・「顧客ごと」「金額指定」UI なし | 準備中 | 不要（group 近似） | |
| R55 | [会計を確定]＋最終確認 | `:1114` check_close・完了モーダル `:1685`（印刷 `:349`・領収書 `:1723` 0099） | 既存 | 不要 | 領収書は現行の方が厚い |
| R56 | **[会計取消・訂正]**（元伝票保持→訂正版再確定） | `:1143`→check_void（0053:441・理由必須・receivable settled 拒否） | 準備中 | 要（訂正版の再確定を作るなら） | void は取消のみ＝訂正版生成・紐付けなし |
| R57 | 会計後タイムライン | audit_logs にはある・レジ画面の履歴 UI なし | 準備中 | 不要 | |
| R58 | 予約リスト | `reservation-panel.tsx:172`（reservations 列群） | 既存 | 不要 | 電話表示 `:437`＝**PII ゲート待ち** |
| R59 | [＋予約を追加]／編集／取消 | reservation_create／update／set_status（0027/0029） | 既存 | 不要 | 定休日ブロック（0032） |
| R60 | **[来店・開卓] モーダル**（来店人数・卓検索・キャスト検索・料金プレビュー） | `:332` reservation_to_check(p_reservation_id,p_seat_id,p_nom_type)（0053:499・customer_id 引継）・UI `:482-500`＝卓 select＋指名種別のみ | 準備中 | 要（来店人数上書き・キャスト指定を通すなら引数追加） | 席種フィルタ・料金プレビューなし |

**§4-G 「利用機能：標準／シンプル店」**: コード・DB に該当する仕組みは**1つも無い**。現存フラグ＝settings_json（biz_cutoff_hm／cast_register_enabled／okuri_mode／sales_norm_enabled／shimei_norm_enabled／shimei_norm_scope／printer_enabled／receipt_*／pin_*）＋stores 列（dohan_auto_hon／ext_shimei_enabled／receivable_policy）＝**いずれも個別機能の ON/OFF で、束ねるプリセット概念は無い**。モックが示唆するのは (a) 複数フラグを束ねた**プリセット**（標準＝全部入り／シンプル＝指名按分・分割会計・キャストドリンク等を隠す）と (b) レジヘッダからの即時プレビュー切替。**店舗設定 v3「利用機能」トグル群（S16-S26）とは「同一機構であるべき」だが両方とも未実装**＝器（settings_json.feature_* or store_features）を1本で設計し、プリセットは「フラグ集合の名前付き既定値」として上に置くのが整合的（migration 要・裁定要点 1 と同件）。

**§4-K kiosk（キャストレジ）パリティ**: できる＝開卓（3引数＝区分/ルール選択なし）・注文追加/削除・時間料金反映・延長（既定メニューのみ）・相席・席移動・指名・入金・クローズ・印刷。できない（マネージャ専用）＝料金区分 R11／セットルール R10／会計グループ R19／代理起票 R31／割引承認 R47／領収書 R55／取消 R56／予約 R58-R60／ボトルキープ R35／着卓顔 R6／低在庫 R8。ゲート＝cast_register_enabled＋kiosk_login PIN。

**§4 最重要ギャップ（migration 必須）**: R18 伝票統合／R49-R52 顧客紐付け（レジ側・PII ゲート待ち）／R35 ボトルキープを卓に出す／R47a-e 割引・追加料金の一般化＋プリセット（＝P55/P56）／R33b 複数キャスト按分／R16b 席移動時の料金体系切替／R2 利用機能プリセット／R37 明細行の操作者。

## §5 シフト管理 v4.1（H）— ⑬追記2（`nox-shift-management-integrated-v4_1.html`・`60049d01…7e32`・44,817B・収蔵済み）

前提（DDL 実測）: `shifts.cast_id uuid not null references casts`（0008:82）・status planned/proposed/confirmed（0101:39-41）・source manual/auto・period_id・override_reason（0125:54）・wish_id・**1日1枠**（unique＋shift_set の duplicate 判定 0125:186-190）。`shift_wishes`（0008:59-72）＝status pending/accepted/rejected/withdrawn・**種別列なし（休み希望の器なし）**。`shift_periods`（0101:56-70）＝status draft/open/closed/published・`wish_deadline date`（時刻なし）・**published_at／確定日時なし**。`staffing_needs`（0008/0095）＝店×曜日×時間帯（日付・役割なし）。`cast_unavailable_days`（0125）・`attendance`（5値）・`punches`・`shift_rules`。**黒服＝users+memberships・`staff_id` はリポジトリ全体で 0 件**。

| # | v4.1 要素 | 現行実装 | 分類 | migration | 備考 |
|---|---|---|---|---|---|
| H1 | サブナビ5タブ | `shift-board.tsx:687-688`（today/queue/build/calendar/roster） | 既存 | 否 | 語順一致 |
| H2 | 承認待ちバッジ ④ | `:1149`（件数ピル） | 既存 | 否 | タブ側バッジは小差 |
| H3 | **対象切替「キャスト／黒服・スタッフ」** | 無し（shifts.cast_id NOT NULL→casts） | 新要件（器なし） | **要** | 下記 (1) |
| H4 | 期間粒度 月/半月/週＋表示期間切替 | 月のみ（`:945-947`） | 新要件（UI のみ） | 否 | |
| H5 | フロー帯 申請→承認→作成→公開→仮→確定 | 4段版＝承認待ちタブ `:1116-1167` | 既存（語彙差） | 否 | 「公開」は period 側 |
| H6 | 見出し「2026年9月 キャストシフト計画」 | `:1282` | 既存 | 否 | |
| H7 | btn 必要人数を設定 | 仮シフトタブ内カード `:1036-1095`（set_staffing_need／staffing_need_remove `:483,:495`） | 既存（配置差） | 否 | モックはモーダル |
| H8 | btn スタッフへ公開 | `:1294-1296`→shift_period_set(status='published')（`:420`） | 既存 | 否 | |
| H9 | 期間バッジ「作成中」 | PERIOD_ST_LABEL `:65`・`:1289`（draft=下書き） | 既存（語彙差） | 否 | |
| H10 | 希望提出締切 8/25 **23:59** | `shift_periods.wish_deadline date`（0101:62）・`:1285`・ブロックなし `:1341-1343` | 準備中（型不足） | 要（timestamptz 化なら） | |
| H11 | 仮シフト公開予定／確定予定（日時） | 列なし | 新要件（器なし） | **要**（publish_planned_at／confirm_planned_at） | |
| H12 | KPI 配置済み／予想人件費／不足日／未処理希望 | `:1307-1312`・月サマリ `:966-971`・`lib/nox/labor-forecast.ts` | 既存 | 否 | |
| H13 | 月カレンダー＋日クリック→不足と追加候補 | `:1369-1400`／`:975-1000`→日モーダル `:1625/:1777` | 既存 | 否 | 裁定121 経路 |
| H14 | 凡例 🔴🟡🟢＋注記 | `:1008-1015`・`:1653-1655` | 既存 | 否 | 現行は余剰＝灰も |
| H15 | **勤務パターン カード**（休み希望型／出勤希望型・基本時間・固定休・役割） | **器なし**（casts は id/name/kind/employment/joined_on・役割マスタなし・`:1264-1266`「ポジション軸は実体なし」） | 新要件（器なし） | **要**（cast_work_patterns 新表） | |
| H16 | btn スタッフ設定を開く／編集 | 無し（staff-board は権限・異動・役職のみ `:116-275`） | 新要件 | 要 | |
| H17 | 通知設定3種（公開時／変更時／確定時） | **無し**（notify/LINE 実装 0 件） | 新要件（器なし） | **要** | 下記 (5) |
| H18 | 承認待ち KPI（未処理／申請者／希望どおり／要調整） | 4段カウンタ `:1116-1121` のみ | 準備中 | 否 | 希望どおり/要調整＝wish と shift の時刻差で導出可 |
| H19 | btn 選択分を一括承認 | 一括＝「まとめてキャスト確認へ」`:1134-1138`（shift_propose）と「一括確定」`:1141-1148`（shift_confirm_bulk 0126）・**wish の一括 accept RPC は無い**（shift_wish_decide は1件） | 準備中 | 否（ループ発行）/ 要（一括 RPC なら） | |
| H20 | 人ごとグルーピング | 現行は日付順フラット表 `:1184-1244` | 新要件（UI のみ） | 否 | |
| H21 | 差分「本人希望→管理側」 | `:1202-1207`・日詳細 `:1741-1745` | 既存 | 否 | |
| H22 | btn 希望どおり承認 | `:1220`→decide→shift_wish_decide(true)（0103:287-334・planned 自動生成） | 既存 | 否 | 下記 (3) |
| H23 | btn 時間調整（承認時） | wish 段には**意図的に非表示**（`:1109-1110`）・planned 段の時間調整 `:1227`→shift_set 据置 `:387`・ウィザードのみ accept→shift_set の合成（`shift-add-form.tsx:268-278`） | 準備中 | 否（UI 合成）/ 要（shift_wish_decide_with_time 新設なら） | 下記 (3) |
| H24 | btn 見送り | `:1221`→shift_wish_decide(false)（定休日でも可 0103:306-308） | 既存 | 否 | |
| H25 | **休み希望**（休み承認／却下・現在予定との対比） | shift_wishes に種別なし・近縁＝cast_unavailable_days（owner/manager 起票のみ・cast セルフは起票#49） | 新要件（器なし） | **要**（shift_wishes.kind 'work'/'off' or 申請表） | |
| H26 | 仮シフト「公開済み 9/1 18:00」「変更内容を再公開」「公開後変更5件」 | published はあるが**公開日時・再公開・公開後差分の器なし** | 新要件（器なし） | **要**（published_at＋公開スナップショット） | |
| H27 | 未確認／確認済み／変更希望／辞退希望 | 確認＝proposed→confirmed（shift_cast_confirm 0102:187）・**変更希望／辞退希望の器なし**・確認状況一覧 UI なし | 新要件（一部既存） | 要 | |
| H28 | 行操作 詳細／確認／催促／対応 | 無し（催促＝通知手段なし） | 新要件 | 要 | H17 と同根 |
| H29 | 公開状態カード＋「確定シフトへ」 | `:1289`＋setTab("roster") | 既存（部分） | 否 | |
| H30 | 公開後の変更（時間変更／追加／取消） | audit_logs（shift_set 0125:207・bulk_daily 0125:290・wish_decide 0103:330・confirm_bulk 0126:60）・**シフト UI に履歴表示なし**・shift_remove（0103:467）は **UI 未結線** | 準備中（器あり・UI なし） | 否 | 下記 (2) |
| H31 | 今日 KPI（出勤予定／出勤済み／遅刻未着／欠勤） | `:762-794`（確定／未承認／不足／人件費）＋attendance 5値 `:96-98` | 準備中（軸違い） | 否 | attendance 再集計で可 |
| H32 | 本日の勤務「20:01打刻」「未着 20:18現在」 | attendance_set ボタン群 `:851-873`・**shift-board は punches を読まない**（器＝punches／punch_self／punch-io.ts） | 準備中（器あり・UI なし） | 否 | 下記 (5) |
| H33 | btn ＋当日追加配置 | `:809-818`（当日は confirmed 既定＝裁定42） | 既存 | 否 | |
| H34 | 現在の不足（時間帯別）＋追加配置 | BandBars `:908-931`・dayStat `:571-581` | 既存 | 否 | |
| H35 | 本日の通知（遅刻超過／欠勤→代打手配） | 無し | 新要件（器なし） | 要 | H17 と同根 |
| H36 | btn 連絡 | 無し | 新要件 | 要 | |
| H37 | 確定シフト PDF/印刷 | 無し（CSV `:512` のみ） | 新要件（UI のみ） | 否 | |
| H38 | 期間別ステータス「9/1〜9/15 確定済み 確定 8/29 18:20」 | shift_periods 一覧 `:1317-1327`・**確定日時列なし・status に confirmed 値なし** | 準備中 | **要** | 期間単位確定は現行では shift 行単位（confirm_bulk） |
| H39 | 確定後の変更履歴＋「管理者変更を追加」 | audit_logs＋汎用 `audit-board.tsx:114-121`・シフト画面内の履歴 UI／理由付き起票なし（shifts にメモ列なし `:1824`） | 準備中（器あり・UI なし） | 否 | |
| H40 | 日モーダル「9月4日（金）の配置 必要5名／配置2名」 | `:1777-1819`／`:1625-1707`・充足ピル `:1634-1636` | 既存 | 否 | |
| H41 | 候補検索（名前）＋勤務条件を候補カードに反映 | DayAddPanel（`day-add-panel.tsx:126-148`）＝検索なし・条件表示なし（名前昇順 `:113`）・条件の器＝H15 | 新要件（一部既存） | 要（条件表示）/ 否（検索） | |
| H42 | btn 選択した1名を配置 | `day-add-panel.tsx:91-111`（行ごと shift_set(planned)・部分成功維持） | 既存 | 否 | 現行は複数行バッファ＝挙動優位 |
| H43 | 必要人数モーダル（曜日基本＋時間帯上乗せ） | `:1071-1094`＋set_staffing_need(店,dow,required,from_min,to_min)（0095:47） | 既存（形状差） | 否 | 「上乗せ」でなくバンド絶対値 |
| H44 | **代打・交代を手配**（欠勤者→候補・フィルタ4種・依頼通知・承諾後反映・即時確定） | **器なし**（1日1枠制約で欠勤者行を残して代打を足せない・依頼→承諾のワークフロー列なし） | 新要件（器なし） | **要**（shift_substitutions 新表） | 下記 (2) |

**§5 個別回答**
- **(1) 黒服・スタッフのシフト器＝無し（新要件）**: `shifts/shift_wishes/attendance/punches` すべて `cast_id not null`（0008:82/63/103/126）。黒服＝users+memberships・staff-board の RPC は権限・異動・役職・在籍のみ。`shift-board.tsx:251-254`「staff は cast_plan 0行のため人件費を出さない」＝**シフト対象＝キャストのみが設計前提**。器の選択肢＝①`cast_id` nullable 化＋`staff_user_id`（or membership_id）＋`CHECK num_nonnulls=1`＋unique 両軸化＋RLS（0008:178 の auth_cast_id 条件）と shift_set（0125:167-175 の casts 前提）全面改修／②別表 `staff_shifts`（RLS/RPC 新設・集計は UNION）。①は既存 RPC 8本＋RLS＋人件費経路へ波及＝**影響局所化なら②が安全**。いずれも migration 必須。
- **(2) 代打手配／公開状態／変更履歴／必要人数**: 代打＝器なし（`shift_substitutions(shift_id, absent_cast_id, sub_cast_id, status requested/accepted/declined, decided_by)` 相当が必要・1日1枠制約の扱いも裁定）。公開状態＝部分あり（status published・UI `:1291-1296`）だが published_at／再公開／公開後差分／期間確定（confirmed 値・日時）は列なし＝H11/H26/H38 は mig 要。変更履歴＝**器あり・UI なし**（audit_logs before/after・閲覧は汎用 audit-board のみ）。必要人数＝あり（曜日×時間帯）＝日付上書き・役割別は器なし（`staffing_needs_overrides(date,…)` なら mig 要）。
- **(3) 承認3種の写像**: 希望どおり承認＝`shift_wish_decide(true)`（wish accepted＋planned 自動生成 0103:311-327）＝**そのまま存在**（`:1220`）。時間調整して承認＝**単一 RPC なし**＝2段（裁定112-G'）が唯一の経路で実装は**ウィザード側のみ**（`shift-add-form.tsx:268-278`・2段目失敗時「希望時刻のまま登録済み」明示）。承認待ちタブは wish 段の時間調整を**意図的に非表示**（`:1109-1110`）・planned 段になってから `:1227`。モック通り1クリックにするなら UI 合成（RPC 追加不要）or `shift_wish_decide_with_time` 新設。見送り＝`shift_wish_decide(false)`（`:1221`）。
- **(4) 裁定121 との整合**: 日セル→配置モーダル内で候補一覧→選択→配置は DayAddPanel（`day-add-panel.tsx:81-111`）と**構造一致**・割当/配置2面共通（`:1683-1688,1792-1797`）も裁定121-6 どおり・キャスト起点＝「＋ キャスト別にまとめて追加」`:1365`。差分＝①「必要5名/配置2名」「候補の勤務条件」「名前検索」は DayAddPanel に無い（条件は器も無し＝H15）②モックは「選択した1名」単数前提・現行は複数行バッファ（挙動優位・文言整合）③モックの状態語彙は「配置」のみで planned/proposed 中間段が無く**期間の公開**が状態を担う＝現行4段と二重管理の懸念④公開後の追加は差分管理対象＝公開スナップショット（H26）が前提。
- **(5) 通知／打刻／人件費／出勤不可／LAST**: LINE・公開通知・催促・代打依頼通知＝**実装なし**（送信ログ表・宛先から必要）。打刻連携＝器あり（punches／punch_self／punch_proxy／punch-io.ts・UI `app/mine/punch-actions.tsx:18`）だが**シフト画面は punches を読まない**＝UI 結線のみで「20:01打刻／未着」は出せる（mig 不要）。人件費予測＝実装済み（labor-forecast.ts・`:786-792/:968-970/:1310/:1649-1655`）＝モックと一致。出勤不可＝実装済み（cast_unavailable_days＋RPC 3本・ShiftAddForm 側に理由入力・DayAddPanel は案内のみ）＝**モック v4.1 には面が無い＝現行の方が広い**。LAST 表示＝`shift-add-form.tsx:135-139`（表示写像のみ）＝モックに LAST 表記なし。

**§5 総括**: mig 必須＝H3（黒服シフト）／H11・H26・H38（公開・確定の日時＋スナップショット）／H15・H16（勤務パターン・役割）／H17・H28・H35・H36（通知）／H25（休み希望）／H44（代打交代）／H43 の日付・役割別。器あり・UI なし＝H30・H39（監査＝変更履歴）／H32（打刻表示）／H19 の wish 一括／shift_remove。UI のみ＝H4／H18・H20／H23（2段合成）／H31／H37／H41（検索）。

## §6 キャスト・スタッフ管理 v3.1（K）— ⑬完了処理（`nox-cast-staff-management-redesign-v3_1.html`・`f3d4faf7…c8ad`・32,648B・v1.1 収蔵済み）

注: モックの詳細タブは全て JS 生成（抽出テキストは登録モーダルまで）＝生 HTML＋script 文字列（214 本）を全読して写像。

| # | v3.1 要素 | 現行実装 | 分類 | migration | 備考 |
|---|---|---|---|---|---|
| K1 | 左ナビ（キャスト／スタッフ別項目） | `app/(manage)/casts/page.tsx:11`・`staff/page.tsx` | 既存 | 否 | モックは同一画面のセグメント切替 |
| K2 | ヘッダ（CAST MANAGEMENT／lead） | `casts-board.tsx:367-368` | 既存 | 否 | 文言差 |
| K3 | セグメント「キャスト／黒服・スタッフ」1画面統合 | 現行は別ページ（casts-board／staff-board） | 新要件（UI 統合） | 否 | |
| K4 | KPI 在籍 | `casts-board.tsx:355`（is_active） | 既存 | 否 | |
| K5 | KPI 時給保証中 | なし（現行は「体入中」`:374`＝trials） | 新要件（器なし） | 要 | K33 前提 |
| K6 | KPI LINE未連携 | なし | 新要件（器なし） | 要 | K37 前提 |
| K7 | KPI メール未登録 | なし（「未招待」`:356`＝user_id null で近似） | 準備中 | 否〜要 | users.email は一覧未取得 `page.tsx:28` |
| K8 | 名前検索 | `:346 hit()`／`:381` | 既存 | 否 | |
| K9 | フィルタ 在籍／休入／退店済み | `:386` seg＝active／trial（体入）／left | 既存（語彙差） | 否 | 「休入」＝体入相当・現行は is_active＋trials |
| K10 | フィルタ 保証中 | なし | 新要件（器なし） | 要 | |
| K11 | フィルタ LINE未連携 | なし | 新要件（器なし） | 要 | |
| K12 | フィルタ エース（区分） | `casts.kind`（0001:99・cast_create p_kind）はあるが一覧非表示・更新 RPC なし。現行チップは cast_ranks `:396-411` | 準備中 | 否／要（正規化なら） | |
| K13 | カード アバター | `:501` CastAvatar＋photoUrls | 既存 | 否 | |
| K14 | カード 名前 | `:503` | 既存 | 否 | |
| K15 | カード meta「在籍／ログイン済み」 | `:504`（is_active＋user_id） | 既存 | 否 | 逐語一致 |
| K16 | カードバッジ レギュラー／エース／体験入店 | `:506-510`（rank名／plan名の金色行） | 準備中 | 否 | cast_ranks 流用 |
| K17 | カードバッジ 保証中 | なし | 新要件（器なし） | 要 | |
| K18 | カードバッジ LINE 連携済み／未連携 | なし（`--linegreen` トークンのみ） | 新要件（器なし） | 要 | K37 |
| K19 | カードバッジ 設定3/6（初期設定進捗） | なし | 新要件（派生計算） | 否 | K23 |
| K20 | カード統計「現在の時給／保証期限」 | 現行は「今月指名／今月出勤」`:513-516`。時給は comp_plans.base＋overrides_json.base（詳細タブ `:674` にのみ） | 新要件 | 要（保証期限） | |
| K21 | 詳細ヘッダ（写真・名前・meta・閉じる） | `:524-541` | 既存 | 否 | |
| K22 | 詳細タブ4枚（基本／勤務・シフト／待遇・バック／連絡・アカウント） | `:544`＝3枚（基本／待遇・バック／アカウント） | 新要件（「勤務・シフト」タブ） | 否 | K30-K31 |
| K23 | 初期設定チェック 6項目・進捗 | なし | 新要件（派生） | 否 | LINE／保証の2項は器なし |
| K24 | プロフィール写真（アップロード／**トリミング**／**削除**／D&D） | `:866-898` モーダル＝アップロード（上書き）のみ・`lib/nox/cast-photo.ts:15` bucket cast-photos `{org_id}/{cast_id}.jpg`・set_cast_photo_updated_at（0065）・policy 3本は手貼り（手貼りリスト:118-204）・`:865`「削除経路は持たない」・本人側 `app/mine/photo-card.tsx` | 既存（一部新） | 否（トリミングは client）／要 policy（削除＝delete policy なし） | 複数枚不可（1cast1ファイル） |
| K25 | **在籍ステータス フロー**（体験入店→本入店・在籍→休店→退店→再入店）＋タイムライン | 器＝is_active＋left_on＋joined_on のみ・0074 CHECK `is_active=(left_on is null)`＝**2値固定**・status enum なし・体入＝trials 別表・再入店＝cast_rejoin（復活方式A＝履歴なし）・UI `:583-591` | **新要件（器なし）** | **要**（既存 CHECK の再設計） | 休店・履歴タイムラインは器ゼロ（audit のみ） |
| K26 | 基本情報 源氏名／氏名 | `:555-577` set_cast_profile（0122） | 既存 | 否 | ★氏名（本名）並記は **PII ゲート待ち**（owner 限定＋audit 経路） |
| K27 | 基本情報 本入店日 | `:563` joined_on（0074） | 既存 | 否 | |
| K28 | 基本情報 所属店舗 | `:582` 表示のみ・変更 RPC なし＝**起票#44 店移動 RPC 未解決**（裁定109 は store_id 除外） | 準備中（表示のみ） | 要（移動するなら） | |
| K29 | 基本情報 キャストランク（＋適用開始日） | `:626-645` set_cast_rank_of／rank_id（0083）・**適用開始日の器なし**（即時） | 新要件（一部既存） | 要（適用開始日） | |
| K30 | 勤務・シフト: 希望方式（出勤希望型／休み希望型）・基本勤務・固定休 | なし（shift_wishes は日別希望） | 新要件（器なし） | 要 | ＝H15 と同件（cast_work_patterns） |
| K31 | 勤務・シフト: 勤務条件（開始／終了／週上限） | なし | 新要件（器なし） | 要 | ＝H15 |
| K32 | 待遇: 現在時給の決定パス（プラン基本→ランク時給→入店保証→個別） | base＋overrides_json.base の1行のみ（`:674`）・ランク時給／入店保証の器なし・解決ロジックなし（pay.ts は base） | 新要件（器なし） | 要 | ★4段優先解決＝給与計算ロジック改変を伴う（money 直撃） |
| K33 | **入店時給保証**（開始／終了／保証時給／保証方式2択／メモ・残日数） | なし | 新要件（器なし） | **要** | 保証方式（常時適用／下回った時のみ）＝pay ロジック分岐 |
| K34 | 待遇・時給の適用履歴 | 器あり＝cast_plan 期間化（0114・valid_from/valid_to・部分 unique 2本・set_cast_plan p_valid_from）・**読む側は現在行のみ**（`comp-sections.tsx:159`）＝履歴 UI なし・先例＝`deduction-board.tsx:6-7`「変更履歴は実装しない＝裁定6・実体は audit」 | 準備中（器あり・UI なし） | 否 | 在籍履歴（K25）は器ごと無し＝別扱い |
| K35 | 通常の待遇・バック（プラン／通常時給／報酬ルール） | `:649-687` 表示専用・編集は AssignTab（`comp-sections.tsx:428`） | 既存 | 否 | モックは詳細内編集 |
| K36 | 連絡・アカウント: 本人レコード／NOX ログインの分離説明 | `:691-716`（招待状態・PIN）＋`:714` | 既存 | 否 | 分離思想一致 |
| K37 | **LINE 連携カード**（表示名／連携日時／通知 ON/OFF／案内再送／解除） | **器なし**（line_user_id 等ゼロ・`--linegreen` と notices の「準備中」表示のみ） | **新要件（器なし）** | **要** | K6/K11/K18/K23/K39 の前提 |
| K38 | メールアドレスカード（確認状態／ログイン ID／変更／再送） | 部分＝`POST /api/cast/invite`（`:311-320`）・users.email（0001:64）・確認状態／再送／変更 UI なし | 新要件（一部既存） | 否 | |
| K39 | 通知・ログイン設定（優先順位／最終ログイン／提出許可） | ログイン有無のみ `:693-703` | 新要件（器なし） | 要 | |
| K40 | （mock に無い）打刻 PIN | `:704-712` set_cast_pin（0043）・kiosk-pin-panel | 既存（**モック側欠落**） | 否 | 統合時に消さない |
| K41 | （mock に無い）体入 trials 詳細（評価／書類4種／本採用／見送り） | `:723-770` trial_update／hire／reject | 既存（**モック側欠落**） | 否 | モック「体験入店」ステータスと二重管理の論点 |
| K42 | 登録モーダル（名前／店舗／**シフト希望方式**／登録区分／入店日／メール任意） | `:425-464`＋RegisterForm `:916-996`＝配属店／源氏名／本名／**生年月日（必須検証 `:933`）**／区分／体入日・cast_create／trial_register | 新要件（一部既存） | 要（希望方式） | ★モックに生年月日なし＝現行必須と矛盾（**PII ゲート待ち**の整理と同時に裁定） |
| K43 | 「登録のみ／登録して詳細設定」2ボタン | 現行は「登録する」1つ＋案内 `:447-461` | 新要件（UI） | 否 | |
| K44 | スタッフ一覧（役職／在籍／メール／店） | `staff-board.tsx:189-225`（memberships＋users） | 既存 | 否 | 行→カード |
| K45 | スタッフ権限（会計／顧客／シフト／バック） | `:38-43` PERM_DEFS→set_staff_perms（`:116`）＝boolean 4フラグ | 既存 | 否 | ★モック「閲覧のみ／編集可／不可」3値 vs 現行2値＝粒度差 |
| K46 | スタッフ役割（主担当／対応可能役割／配置優先） | なし（memberships.role は owner/manager/staff/cast） | 新要件（器なし） | 要 | ＝H15 スタッフ側 |
| K47 | スタッフ役職変更 | `:258-265` staff_change_role | 既存 | 否 | |
| K48 | スタッフ異動 | `:244-256` staff_transfer_store（0025・owner） | 既存 | 否 | キャスト側は無し（K28） |
| K49 | スタッフ在籍解除／再雇用 | `:266-278` staff_deactivate／reactivate | 既存 | 否 | |
| K50 | スタッフ追加モーダル | `:285-335` POST /api/staff/create | 既存 | 否 | |
| K51 | スタッフ給与・待遇（正社員A／月給／残業・深夜） | なし（comp_plans／cast_plan は cast 専用＝0012:101） | 新要件（器なし） | 要 | |
| K52 | スタッフ写真 | なし（`staff-board.tsx:188`） | 新要件（器なし） | 要 | |
| K53 | スタッフ 勤務・シフト／連絡・アカウント タブ | なし | 新要件（器なし） | 要 | ＝K30/K31/K37/K39 |

**§6 個別回答**
- **(1) 在籍ステータス**: モック＝体験入店／本入店・在籍／休店／退店／再入店の5状態＋日付付きタイムライン。現行＝`is_active`＋`left_on`（＋`joined_on`）のみ・0074 CHECK で**2値固定**・enum なし・体入は trials・再入店は cast_rejoin（履歴なし）。→ **休店・履歴は新要件（器なし・mig 必須・既存 CHECK の再設計）**。
- **(2) 時給保証／適用プラン表示**: 表示は詳細「待遇・バック」`:673-677`（保証時給＝overrides 適用後の実効値）とカード副次行 `:506-510` のみ。**入店時給保証（期間付き別レイヤ・保証方式2択）は器ごと無し**＝pay ロジック分岐を伴う（money 直撃＝Fable）。
- **(3) 適用履歴**: cast_plan は期間化済み（器あり）だが**履歴 UI なし**（現在行のみ読む）＝mig 不要。在籍履歴は器なし。
- **(4) 写真ストレージ**: private bucket `cast-photos`・1cast1ファイル上書き・policy 3本（select/insert/update・手貼り）・**delete policy なし**＝削除は要 policy 追加、トリミングは client、D&D は UI。複数枚不可。
- **(5) LINE 連携**: **全リポジトリで器ゼロ**（`--linegreen`＋notices の「準備中」のみ）＝新要件・mig 必須（送信ログ・宛先 line_user_id・同意）。影響＝K6/K11/K18/K23/K37/K39＋H17/H28/H35/H36。
- **(6) 黒服・スタッフ**: 一覧／権限／役職／在籍／異動／追加は staff-board に全て存在。不足＝役割 K46／給与プラン K51／写真 K52／勤務条件・LINE K53。権限の3値化は粒度差。
- **(7) PII**: モック本文の個人情報は「源氏名／氏名」の並記のみ（電話・住所・生年月日・マイナンバー・緊急連絡先はモックに無し）。現行ゲート＝cast_sensitive（RLS 0本・grant 0）＋get_cast_sensitive（owner のみ）＋masked＋全閲覧 audit。**PII ゲート待ち**＝K26（氏名並記）・K42（登録モーダルの本名・生年月日＝モック欠落と現行必須の矛盾）・K41（trials の real_name/birthday は casts 系ゲートが効かない別系統）。

**§6 総括**: mig 必須＝K25（在籍ステータス enum＋履歴）／K33（入店時給保証）＋K32（4段時給解決＝money）／K37（LINE）／K30-K31・K46（勤務パターン・役割＝H15 と統合）／K29（ランク適用開始日）／K51-K53（スタッフ側の待遇・写真・勤務）／K20（保証期限）。器あり・UI なし＝K34（適用履歴）／K7（メール未登録の近似）。UI のみ＝K3／K19／K22／K23／K43／K24 のトリミング。**モックが現行機能を落としている**＝K40 打刻 PIN・K41 体入 trials（統合時に消さない）。

## §7 裁定要点の候補（優先順の提案）

1. **利用機能フラグの器（S16-S26）**: 推奨＝`stores.settings_json` にキー群＋`set_store_features`（雛形 set_store_norm_config・owner・全引数明示・audit）。料金区分は「active 0件＝非表示」が既にフラグ同値＝**二重管理を避ける**（フラグを置くなら区分 0件と OR にするか、置かない）。売掛は `receivable_policy='disabled'` へ写す（新キー不要）。
2. **報酬表示制御（S27-S36）と裁定101 の衝突**: 現行は「値の有無から自動導出・保存しない」。v3 の保存型フラグを採るか、ノルマ（S34）と同型で settings_json に置くか、自動導出のまま「表示制御のみ」にするか。
3. **店舗プロフィール（S9-S14）**: `set_store_profile` 新設（name/short＋settings_json.store_code/display_name/show_open_status）。タイムゾーンは**固定表示のみ**（保存しない）を推奨。
4. **店舗運用（S37-S45）**: 器＝settings_json `ops_*`＋`set_store_operations`。**S39 席種の初期選択は席タイル起点のレジと矛盾**＝仕様再検討 or 廃止。指名/同伴の「開栓時に確認」は開卓モーダル拡張を伴う＝段階分割。警告4種のうち**営業時間外（S43）は businessHoursStatus 再利用で最安**、重複配置（S44）は open 伝票横断クエリ、未入力（S42）/0円（S45）は判定仕様の定義が先。
5. **料金 v8.1 の衝突と重い件**: **P5 優先順位の数値露出 vs 裁定115-② 非露出**（正面衝突＝要裁定）／**P26 終了日の扱い**（resolve_core と check_open ext_menu の鏡像2点同時改修＝教訓52・最も危険＝別レーン推奨）／P24 説明欄（列追加＋17引数化）／P51 支払方法有効・無効（4値は削減不可＝表示制御のみ）／**P55-P56 追加料金マスタ＝独立の新規レーン**（resolve 非関与）。
6. **料金 v8.1 の即着手可**: プレビュー拡張 P12-P20 は **mig 不要**（要件書 §4・#52 消化済み）／VIP料金方式カード（P39）は読み取り表示なら mig 不要／カード手数料の再編は移設のみ（P52/P53）・ack（P54）は残置。
7. **報酬 v3.1 の裁定点**: C18 同伴 割合の解錠（裁定76 据置 vs R-2b 完了）／C10 最低月額保証の mock 文言「反映しない」と実装「反映済み」の食い違い／C24 達成ボーナス「加算率」の母数定義（pay.ts rate 消化）／C44-C46 割当の一括保存（UI）／C49 保存状態6行化／C50 単位インライン表示（全入力様式＝裁定122 §3・§4 の適用範囲）。
8. **mock に無い既存要素の残置可否**: C15 日給制バッジ／C23 準備中カード列挙／C32 norm 4値・猶予3値／C39 プラン値編集カード／P49 インボイス登録番号入力／P61 値引き税前適用（準備中）／P62 liveNow バー（Z1 残置済）。
9. **導線不整合（文言修正の候補）**: 営業日切替の実体＝営業時間パネル（v3/v8.1 は会計設定へ誘導）／住所・電話の実体＝レシート・プリンタ（v3 は機密・税務情報へ誘導）。
10. **単独起票候補（管理 UI の欠落）**: `stores.ext_shimei_enabled`（0124）・`stores.dohan_auto_hon`（0118）は列あり・UI ゼロ（verify のみ参照）。
11. **利用機能の機構を1本化（R2＝S16-S26）**: レジ v12.1 の「標準／シンプル店」と店舗設定 v3 のトグル群は**同一機構であるべきだが両方未実装**。器（settings_json.feature_* or store_features）を1本で設計し、プリセット＝「フラグ集合の名前付き既定値」として上に置く（要 mig・要点 1 と統合裁定）。
12. **レジ v12.1 の重い新規（器なし）**: 伝票統合 R18（check_merge 新設）／顧客紐付け R49-R52（レジ側 RPC・同行者の器・**PII ゲート待ち**＝can_crm＋masked 前例に揃える）／ボトルキープを卓に出す R35（check×bottle_keeps＋会計時残量更新）／割引・追加料金の一般化とプリセット R47a-e（＝P55/P56 と同件・resolve 非関与）／複数キャスト按分 R33b／席移動時の料金体系切替 R16b（開栓時凍結の原則 0128 と衝突＝要裁定）／明細行の操作者 R37（check_lines.created_by）。即着手可（UI のみ）＝卓操作ドロワー R14・延長確認モーダル R21・商品検索 R27・料金の決まり方 R42・算定根拠 R48。
13. **レジ v12.1 の意味論差**: 閉卓 R20（未会計クローズは現行に無い＝void のみ）／会計取消・訂正 R56（void は取消のみ・訂正版の再確定なし）／注文取消の理由 R38（check_remove_line に p_reason なし）＝いずれも現行設計の明示的判断（裁定47 等）と照合の上で裁定。
14. **シフト v4.1 の重い新規（器なし）**: 黒服・スタッフのシフト H3（推奨＝別表 `staff_shifts`＝影響局所化・①nullable 化は RPC 8本＋RLS＋人件費へ波及）／公開・確定の日時と公開スナップショット H11/H26/H38（差分管理の基準）／勤務パターン・役割 H15/H16（cast_work_patterns）／通知基盤 H17/H28/H35/H36（LINE 未実装＝送信ログ表から）／休み希望 H25（shift_wishes.kind）／代打・交代 H44（shift_substitutions＋1日1枠制約の扱い）／日付・役割別の必要人数 H43。
15. **シフト v4.1 の写像で衝突する既存裁定**: 承認3種のうち「時間調整して承認」は wish 段で**意図的に非表示**（`:1109-1110`）＝モック通り1クリックにするなら UI 合成（accept→shift_set・裁定112-G' 型）で mig 不要／モックの状態語彙「配置＋期間公開」と現行4段（planned→proposed→confirmed）の二重管理懸念／DayAddPanel（裁定121）とは構造一致＝候補検索・条件表示・「必要N名/配置M名」を足す方向で整合。出勤不可・LAST・人件費予測は**現行の方が広い**（モックに面なし）＝残置。
16. **器あり・UI なしで安い追随**: 変更履歴（audit_logs→シフト画面内表示 H30/H39）／打刻表示（punches→本日の勤務 H32）／shift_remove の UI 結線／wish 一括承認（ループ発行 H19）／レジの会計後タイムライン（audit R57）／待遇適用履歴（cast_plan 期間行→一覧 K34）。
17. **在籍ステータスの器（K25）**: 現行 2値（is_active＋left_on・0074 CHECK）→5状態 enum＋履歴表（体験入店／本入店・在籍／休店／退店／再入店・日付付き）。既存 CHECK・trials（体入）・cast_rejoin（履歴なし）との整合を先に裁定（trials の「体験入店」とステータスの二重管理を避ける）。
18. **入店時給保証と時給の4段解決（K32/K33）＝money 直撃**: 器（期間・保証時給・方式2択）＋pay.ts の解決順（プラン基本→ランク時給→入店保証→個別）＝**payOf 改変**を伴う＝設計書→Fable。「保証方式＝下回った時のみ」は guarantee 床（components）と概念が近い＝既存 guarantee_min との関係を裁定。
19. **LINE 連携の器（K37＋H17）**: 全リポジトリで器ゼロ＝line_user_id・同意・送信ログ・通知設定の新設が要る＝独立レーン（外部 API 前提）。それまで K6/K11/K18/K23 は「準備中」表示で先行可。
20. **勤務パターン・役割の器を1本化（K30/K31/K46＝H15/H16）**: cast／staff 共通の `work_patterns`（希望方式・基本勤務・固定休・勤務条件・主担当・対応可能役割）を設計。黒服シフト（H3）と同じ「cast／staff 二軸」の器方針に揃える。
21. **キャスト管理の PII 整理（K26/K42/K41）**: モックは本名を並記し生年月日を落とす＝現行（本名 owner 限定＋audit・登録で生年月日必須）と矛盾＝**PII ゲートの設計裁定を先に**。trials の real_name/birthday が casts 系ゲート外にある点も同時に。
22. **モックが落としている現行機能の残置（K40/K41）**: 打刻 PIN・体入 trials 詳細は統合時に消さない（レジの領収書 R55・指名分配率 R44・出勤不可・LAST と同列）。
23. **締め解除→訂正→再締め（D22-D25）＝D-1 の同族**: `daily_report_reclose` は解除なしの再集計上書き（ロック列・理由・承認者・冪等キーなし）／`payroll_reopen`（0060）が唯一の解除型。日報を payroll 側の形（unlock RPC＋理由＋承認者・reclosed_at/by・reclose 冪等キー・締め済み日の伝票編集 enforcement）へ寄せる設計を **D-1（給与確定取消）と同レーン**で裁定。現金差異の理由入力＋管理者承認（D20＝M19）も同 mig。
24. **月次確定と CSV＝裁定12 の再検討（D29-D31）**: 裁定12①「月次確定テーブルは作らない」・⑥「CSV なし」と v2.1（未締め日があると月次確定不可・閲覧/CSV 仮出力可）が正面衝突。採るなら期間表 or stores フラグ＋母数（store_business_hours）＋「仮出力」の位置づけを裁定。
25. **売掛の設計まとめとの差**: 手動売掛登録（D38）は money-core 非接触（発生＝check_pay(ar) のみ）と衝突＝要検討／売掛 OFF（D35）＝`receivable_policy='disabled'` へ写す（S24 と同件）／回収方法（D45）は RPC 3値受理済みで UI が cash 固定＝select 追加のみ／回収履歴（D47）・oldest-first（D48）は器の要否から。
26. **分析の4定義分離（A10-A15）**: 会計売上（既）／指名実績（**checks.nom_type と check_nominations.nom_kind の2系統併存＝nom_kind へ統一裁定**）／担当顧客（既・未結線）／**販売実績のみ器なし**（check_cast_backs はバック額・product_sales_base は mode 限定）＝cast×期間の販売額を close 時に全 mode で凍結するか集計 RPC で同腕按分を再現するかの裁定（money 隣接）。現行の「売上貢献ランキング（按分）」＝v2.1 が禁じる会計売上のキャスト帰属＝RPC（payroll 使用中）は残し UI 露出のみ外す。
27. **概算人件費（A19/A20/A33）**: `labor-forecast.ts forecastDay`（payOf 経由・予定シフト×時給）を分析へ再結線＝mig 不要。2段（確定月＝payslips gross／未確定月＝forecast Σ）＋「概算＝バック・控除・源泉含まず・予定シフト基準」の注記必須（labor-forecast.ts:4-6 の文言）。日別人件費率は forecastDay のみが実現経路。
28. **顧客按分禁止と check_cast_backs（A52/A53）**: 顧客側 total_spend＝Σchecks.total＝**非按分＝設計衝突なし**。衝突は (a) 分析／顧客画面が顧客に累計金額を出していること（削除対象）(b) キャスト按分売上の表示（A15）。check_cast_backs のキャスト按分は「販売実績」の軸＝定義文で「同腕按分の凍結値」と明記（恒久注意7）。過去時点の顧客ステータス比較（A56）はスナップショット不在＝基準日パラメータ化 or 月次スナップショットが要る。
29. **ホームのフェーズ切替と店舗切替（M5/M6）**: フェーズ判定は既存3点（businessHoursStatus・open checks・daily_reports 当日行）で mig 不要。店舗切替は「owner 閲覧切替（limit(1) を外す・先例5画面）」を先に、「F4 マルチ店舗切替（memberships 部分 unique drop＋auth_store_id 差替）」は別スコープで裁定。当日 KPI は daily_report_aggregate が authenticated 非 grant＝report-board 型 client 集計を流用（当日ライブ vs 前日締め済みの分母差を注記）。
30. **通知基盤（N2-N6/N14-N20/N23-N24/N36-N43）＝LINE レーン（T3）と統合した独立レーン**: 手動 notices と別テーブル群（notification_rules／notifications／notification_deliveries＋line_user_id／同意／送信ログ／read receipts）・トリガー元 RPC（shift_period_set published／shift_confirm_bulk／payroll_finalize）は存在するが通知を発行しない・メール基盤は mail_disabled（Resend 等の採否が先）。裁定要＝N39 配信済み本文の上書き可否（版管理・§12 X5）／N8 多店舗配信（auth_store_id 単一前提）／N24 メール採否。mig 不要で先行可＝テンプレート2件・複製・タブ化。

## §8 日報・月報・売掛 v2.1（D）— ⑬追補 v1.2（`nox-daily-monthly-ar-redesign-v2_1.html`・`6bb6141f…01ee`・23,502B・収蔵済み）

前提: `report-board.tsx`（840行）／`month-report.tsx`／mig 0010（daily_reports 表・aggregate・close・reclose）／0055（ar_collections・receivable_collect・mark_deduct）／0092（部分回収）／0093（due）／0060（payroll_reopen＝D-1）／0106（biz_cutoff）／0032（business_hours）。**daily_reports に status／ロック列なし＝「行の存在＝締め済み」**（0010:9-11 で status 列を明示不採用）。

| # | v2.1 要素 | 現行実装 | 分類 | migration | 備考 |
|---|---|---|---|---|---|
| D1 | 画面ヘッダ「日報・締め管理」 | `report-board.tsx:275-276` | 既存 | 否 | |
| D2 | タブ 日報／月報／売掛 | `:282-290`（ar は isManagerUp） | 既存 | 否 | |
| D3 | 「営業中・未締め」バッジ | `:423-433`（daily_reports 行の有無） | 既存 | 否 | |
| D4 | 「締め確認へ」→締め確認モーダル | 無し（締めは同画面下部フォーム `:726-738`） | 新要件（UI） | 否 | |
| D5 | 営業日表示 | `:566-568` | 既存 | 否 | |
| D6 | 営業時間 19:00〜翌5:00 | `store_business_hours`（0032:41-42）・report 側未読 | 新要件（器あり・UI なし） | 否 | |
| D7 | 営業日切替 翌06:00 | settings_json.biz_cutoff_hm・set_store_biz_cutoff（0106） | 既存 | 否 | |
| D8 | 「現在 9/5 02:14→9/4 営業日」 | bizDateOf（初期値算出のみ `:65`） | 新要件（UI） | 否 | 純関数で計算可 |
| D9 | KPI 確定売上／組数／客単価／現金／カード等 | `:445-479`（5枚・前日比） | 既存 | 否 | 現行は「暫定」表記 |
| D10 | 締めフロー 01〜05 ステップ | 無し（チェック3項目 `:676-703`） | 新要件（UI） | 否 | 既存値の再形 |
| D11 | 未会計伝票 0件 | `:682` preview.open／close ガード `open checks remain`（0055:413） | 既存 | 否 | |
| D12 | 取消・返金（監査ログあり） | audit-board の check_void ビュー・report からは未参照 | 新要件（器あり・UI なし） | 否 | |
| D13 | 実査現金 未入力／入力 | `:684-686,730` | 既存 | 否 | |
| D14 | 売掛 本日発生 2件／¥ | preview.uri（金額のみ `:577`）・件数未集計 | 準備中 | 否 | |
| D15 | 未処理の入出金（日払い・送り代・立替） | advances（0019:77）／transport（0019:102）実在・report 未参照 | 新要件（器あり・UI なし） | 否 | |
| D16 | 諸経費・現金支払「登録済み分」 | 諸経費テーブルなし＝締め時 int 入力のみ（expense／cash_payout 0010:81-82） | 新要件（器なし） | **要**（明細表が要るなら） | |
| D17 | 現金照合 レジ内予定額 | `:631`（cashFloat+cash+arCollectedToday−expense−payout＝DB 式 0055:419-421 と一致） | 既存 | 否 | |
| D18 | 実査現金／釣銭準備金／実査差異 | counted_cash／cash_float／diff（0010:82-85）・UI `:635-652` | 既存 | 否 | |
| D19 | 「実査を入力」 | `:730`＋金種カウンタ `:744-776` | 既存 | 否 | |
| D20 | **差異理由の入力＋管理者承認（承認者・時刻を監査へ）** | 無し（note 自由文のみ・p_force は未会計専用＝差異と無関係 0055:413） | **新要件（器なし）** | **要**（diff_reason／approved_by／approved_at＋close ガード） | |
| D21 | 売上内訳5分類 | `:496-500` kindSums（時間／ドリンク／シャンパン／ボトル／その他） | 既存（分類粒度差） | 否 | 再マップ要 |
| D22 | 締め履歴の説明「締め解除→訂正→再確定」 | `daily_report_reclose`（0055:450）＝**解除なしの直接再集計** | 準備中 | 否 | 下記 (1) |
| D23 | ①管理者が締め解除（理由必須） | **存在しない**（unlock RPC・ロック状態列なし） | **新要件（器なし）** | **要** | payroll_reopen（0060）が唯一の前例 |
| D24 | ②伝票・入出金を訂正（元データ保持） | check_void 等＝audit before/after・**締め済み日の伝票編集ブロックなし** | 準備中 | 否 | enforcement 不在 |
| D25 | ③再締め（再確定日時・担当者） | reclose は reclosed_count++ のみ（0055:497）・reclosed_at/by 列なし | 準備中 | **要**（列で持つなら） | UI `:827` |
| D26 | 締め履歴リスト | `:783-795`（closed_by→users.name） | 既存 | 否 | closed_at 非表示 |
| D27 | 月報 対象月 | `month-report.tsx:159`＋period_bounds | 既存 | 否 | |
| D28 | 前半／後半 | `month-report.tsx:53,61`（裁定12②） | 既存 | 否 | |
| D29 | 月報 CSV出力 | 無し＝**裁定12⑥「表示のみ・CSV なし」** | 新要件（裁定変更要） | 否 | |
| D30 | **月次確定ルール（未締め日があると確定不可）** | 無し＝**裁定12①「月次確定テーブルは作らない」** | **新要件（器なし）** | **要**（確定を持つなら） | 下記 (4) |
| D31 | 前半「確定3日／未確定12日」 | 無し（締め済み日数のみ・母数を知らない） | 新要件 | 否〜要 | 母数＝store_business_hours |
| D32 | 月報 KPI | `month-report.tsx:164-185`＋人件費率 `:143` | 既存（構成差） | 否 | |
| D33 | 月報表（前半／後半／通期） | `month-report.tsx:132-144`（人件費は通期のみ＝台帳:262） | 既存 | 否 | モックも通期のみ＝一致 |
| D34 | 日別確定状況（締め済み／営業中） | `month-report.tsx:66-68,216-236` | 準備中 | 否 | 「営業中」＝行なしの表現 |
| D35 | 店舗設定で売掛 OFF→全非表示 | settings_json に AR トグルなし | **新要件（器なし）** | **要** | ＝S24（receivable_policy='disabled' で写せる） |
| D36 | 売掛 KPI（残高／件数／期限超過／今月回収） | `:296-311`（残高式 0092 準拠） | 既存 | 否 | |
| D37 | KPI 今月発生 | 無し | 準備中 | 否 | created_at 集計 |
| D38 | 「＋売掛を登録」（手動作成） | 手動 RPC なし＝発生は check_pay(ar)→receivables INSERT（0007:362）のみ | 新要件（器なし） | **要** | money-core 非接触方針と衝突＝要検討 |
| D39 | 顧客名・伝票番号検索 | 無し（並び替えのみ `:312-316`） | 新要件 | 否 | **顧客は PII ゲート待ち** |
| D40 | フィルタ 期限超過／今月発生／一部回収 | 無し（判別材料は既存） | 準備中 | 否 | client フィルタ |
| D41 | 未回収行（顧客名・伝票#・担当・残/回収済・期限） | `:321-345`（伝票番号・担当は未表示）・customers.name は owner/manager/staff∧can_register へ開示中（0055:143-150） | 既存 | 否 | **顧客は PII ゲート待ち**（範囲拡大分） |
| D42 | 回収方法／前回／入金日 | ar_collections.method/biz_date 保存済み（0055:94-96）・UI は sum のみ `:189-191` | 新要件（器あり・UI なし） | 否 | |
| D43 | 伝票を見る／履歴 | 無し（receivables.check_id あり） | 新要件（UI） | 否 | |
| D44 | 回収を登録／追加回収（部分） | receivable_collect（0092 6引数）・UI `:379-400` | 既存 | 否 | verify-nox-ar-partial |
| D45 | 回収方法の選択（現金／カード／その他） | RPC は3値受理（0055:96,194）・**UI は "cash" 固定** `:238`・ar_collected は cash のみ（0055:351-353） | 準備中 | 否 | select 追加で開通 |
| D46 | 給与天引き経路 | receivable_mark_deduct（0055:251・同意）・payroll_finalize | 既存 | 否 | モックに天引き記載なし＝現行が上位互換 |
| D47 | 回収履歴リスト | ar_collections に全項目・**一覧 UI なし** | 新要件（器あり・UI なし） | 否 | |
| D48 | 「partial／oldest-first ルールは設定側」 | oldest-first 自動充当なし | 新要件（器なし） | 要（設定を持つなら） | |
| D49 | 締め確認モーダル（3チェック＋不可メッセージ） | ロジックは `:676-703` に存在（位置差） | 準備中 | 否 | 差異承認は D20 依存 |

**§8 重点論点**
- **(1) 締め解除→訂正→再締め**: `daily_report_reclose` は**解除ではなく再集計＋上書き**（凍結 cutoff/税率で aggregate 再呼び・reclosed_count+1・audit before/after）。ロック列・解除 RPC・理由・承認者は皆無・reclose に冪等キーなし（連打で count 増）・金額訂正は再締めからは不可。対する `payroll_reopen`（0060・D-1）＝真の解除（finalized→draft・reopen_idem_key・payments exist 拒否・service_role＋owner route・確認ダイアログ）。**同族だが実装水準は非対称**＝日報を payroll 側の形へ寄せる新規設計＝mig 必須（D-1 と同レーンで裁定するのが整合的）。
- **(2) 営業日境界**: cutoff は settings_json→bizDateRange/bizDateOf・DB 側は close で `biz_cutoff_hm` を行へ凍結し reclose は凍結値再利用（TS/DB 同値保証明記 0010:14-18）。UI は「区切り 06:00」1行のみ＝営業時間表示（0032 器あり）と「現在→営業日」（純関数）は mig 不要。
- **(3) 現金差異**: diff＝counted−(float+cash+ar_collected−expense−payout)。**p_force は未会計専用**。理由・承認・承認時刻の器は皆無（note のみ）＝新列＋close/reclose 改修（＝M19 と同件）。
- **(4) 月次確定**: 月報テーブルも締めロックも無し＝**裁定12①が明示的に「作らない」**。採るなら裁定12①見直し＋新表 or stores フラグ＋母数（store_business_hours）。CSV も裁定12⑥で除外済み＝再裁定。
- **(5) 売掛回収方法**: receivable_collect は cash/card/other 受理・部分回収は 0092 で三者不変量。**UI は cash 固定**＝保存済み method/biz_date を読んでいないだけ。給与天引きは別 RPC（mark_deduct）。回収履歴 UI なし。

## §9 ホーム v2.1（M）— ⑬追補 v1.2（`nox-home-redesign-v2_1.html`・`2f4e7d62…46dd`・16,266B・収蔵済み）

| # | v2.1 要素 | 現行実装 | 分類 | migration | 備考 |
|---|---|---|---|---|---|
| M1 | サイドナビ5群 | `layout.tsx:56-85`＋side-nav | 既存 | 否 | 現行は領収書・ご契約も |
| M2 | ブランド N／NOX／CLUB NOX | `layout.tsx:35-36` | 既存 | 否 | |
| M3 | 見出し「ホーム」＋STORE OVERVIEW | `dashboard-board.tsx:144-146` | 既存 | 否 | |
| M4 | 営業日 | `:60,146` bizDateOf・cutoff `page.tsx:56` | 既存 | 否 | |
| M5 | **フェーズタブ 営業前／中／後** | 概念なし。判定材料は完備＝businessHoursStatus（store_business_hours）＋checks open 件数＋daily_reports 当日行 | 新要件（UI・器あり） | **不要** | 推奨判定＝①当日 daily_reports 行→営業後（締め済）②open>0 or inside→営業中③inside 前→営業前④終了かつ未締め→営業後（要締め） |
| M6 | **店舗セレクタ** | 現行ホームは先頭店固定 `dashboard/page.tsx:18`（limit 1）・RLS は owner=org 全店・他5画面にセレクタ前例（report／analytics／payroll／receipts／casts） | 準備中（owner 閲覧切替）／新要件（F4 認可切替） | 表示は否／F4 本体は要（memberships 部分 unique drop＋auth_store_id 差替＝CLAUDE.md） | 2層で記録 |
| M7 | 本日の売上／組数／客単価 | ホームに無し（今月＝締め済み日報Σ `:75-77`）。当日ライブは `report-board.tsx:93-131` の client 集計 | 新要件（器あり・再利用） | 不要 | daily_report_aggregate は authenticated 非 grant＝呼べない |
| M8 | 本日の出勤 6/8・未着1・欠勤1 | `:73-74,116`（attendance）＋`:124`（confirmed 件数） | 既存（内訳表示差） | 否 | 「未着」明示ステータスなし（late＋eta） |
| M9 | 現在不足 あと1人 20:00–22:00 | `:125-133`（staffing_needs×shifts バンド交差） | 既存 | 否 | 帯ラベル未表示 |
| M10 | 未処理 4件（締め／売掛／シフト） | 集約なし・源は全て既存（daily_reports 当日行／receivables open∧due<today／shift_wishes pending・proposed／drink_claims） | 新要件（集約） | 不要 | head count 4本 |
| M11 | 「今日やること」カード | 相当なし（承認待ちは DrinkClaimQueue 再掲 `:238`） | 新要件（UI） | 不要 | M12-M21 の合成 |
| M12 | 営業前① キャスト不足→追加配置 | M9 同源・導線 /shift | 既存 | 否 | |
| M13 | 営業前② 本日の予約 6件／VIP／同伴 | `reservation-panel.tsx:169-174,231-236`（kpiBooked/kpiVip・dohan＝nom_type） | 既存（再利用可） | 否 | 導線＝/register 予約タブ |
| M14 | 営業前③ 仮シフト未確認 3名 | `shift-board.tsx:61`（proposed）・`:289,314` | 既存 | 否 | 件数カウント追加 |
| M15 | 営業中① 不足／至急→代替を探す | M9＋shift-autoassign／day-add-panel | 既存（導線要確認） | 否 | |
| M16 | 営業中② 未打刻超過→連絡 | 判定器完備（punch-match.ts・punch-io.ts・punches）・ホーム表示なし | 新要件（表示・器あり） | 不要 | **[連絡]の実体（LINE/SMS）は器なし**＝準備中 or tel リンク |
| M17 | 営業中③ 稼働中5卓／空席3卓／VIP1 延長確認 | `register-board.tsx:435,444`（open checks snap）・seats | 既存（再掲） | 否 | |
| M18 | 営業後① 未締め／実査未入力→日報へ | `report-board.tsx:165-167,198`・counted_cash | 既存 | 否 | |
| M19 | 営業後② 現金差異 ¥-3,000／理由入力・管理者承認 | diff／note 列あり・**承認フローなし** | 表示＝既存／承認＝**新要件（器なし）** | **要**（＝D20） | |
| M20 | 営業後③④ 売掛 期限超過／残高 | `report-board.tsx:183,299,45` | 既存 | 否 | 「売掛利用店舗のみ」＝S24/D35 |
| M21 | 営業後⑤ 新人の初期設定未完了（LINE／待遇時給） | 待遇＝casts-board `:655,673-674`・LINE＝器なし | 待遇＝既存／LINE＝新要件 | LINE は要 | 定義を待遇未割当＋PIN 未設定に限れば不要 |
| M22 | 今日のシフト帯（4分割数値） | `:203-235`（atts から算出可） | 既存 | 否 | |
| M23 | 時間帯バー（あと1人／充足） | `:125-133` todayBands（**計算済み・未描画**） | 既存 | 否 | map で展開 |
| M24 | 本日の予約リスト | `reservation-panel.tsx:242-245` upcoming（そのまま移植可） | 既存 | 否 | |
| M25 | クイック操作4枚 | `dashboard/page.tsx:36-50`（現行9枚） | 既存 | 否 | 配列を削る |
| M26 | 営業状況（売上／前営業日比／組数／本指名／同伴） | M7 同源＋cmp（analytics `:427`）＋nom 件数 | 新要件（合成） | 不要 | ★当日ライブ vs 前日締め済み＝分母の性質差を注記 |
| M27 | 本指名ランキング（今月 1〜3位） | `:78-80,93,242-257` get_cast_ranking | 既存 | 否 | 上位5→3 |
| M28 | お知らせ最新2件 | `:86-88,260-272` | 既存 | 否 | 完全一致 |

**§9 総括**: mig 必須＝M19（現金差異の理由＋承認＝D20 と同件）と M21 の LINE 部分のみ。M5 フェーズ判定に新しい器は不要。M6 は「owner 閲覧切替（limit(1) を外すだけ・先例5画面）」と「F4 マルチ店舗切替（memberships 部分 unique＋auth_store_id 差替）」の2層に分けて裁定。

## §10 分析 v2.1（A）— ⑬追補 v1.2（`nox-analysis-redesign-v2_1.html`・`1608b5ed…df34`・21,743B・収蔵済み）

凡例: AB＝`analytics-board.tsx`。4定義＝会計売上／販売実績／指名実績／担当顧客。

| # | v2.1 要素 | 現行実装 | 分類 | migration | 備考 |
|---|---|---|---|---|---|
| A1 | 見出し「売上・店舗分析」 | AB:516-517 | 既存 | 否 | |
| A2 | CSV出力（ヘッダ） | AB:98-106／478-495（各パネル内） | 既存（位置差） | 否 | ランキング CSV の「売上（按分）」列は A15 に従い改訂 |
| A3 | 今月／先月 | AB:521-530 | 既存 | 否 | |
| A4 | 直近30日 | 無し（period は YYYY-MM 固定 AB:167,187）・get_cast_ranking／get_cast_customer_ranking は p_period text＝月固定 | 新要件 | 否（2 RPC が制約点） | |
| A5 | 月 input | AB:531 | 既存 | 否 | |
| A6 | 比較 前月／前年同月／なし | 前月同期のみ AB:401-403,427・前年同月は month-report `:83` 前例 | 準備中 | 否 | |
| A7 | 「締め済み営業日のみ」注記4行 | 常時締め済み固定（daily_reports 直読 AB:192-196・`:552-554`） | 既存 | 否 | 速報導線は Link のみ |
| A8 | 4ビュータブ | AB:607-611 | 既存 | 否 | 完全一致 |
| A9 | （mock に無い）店舗セレクタ／全店合算 | AB:532-551 | 既存 | 否 | |
| A10 | **会計売上**＝確定売上 | daily_reports（0010）＋salesOf（AB:90-91）／明細側 store_category_aggregate（0096:137-192） | 既存 | 否 | 日報（丸め後）と明細Σ（丸め前）非一致は既注記 AB:696-700 |
| A11 | **販売実績**＝商品販売の担当実績（¥） | **器が不完全**: check_cast_backs は**バック額**（販売額ではない）・product_sales_base は plan_rate 行のみ（0132/0133 では plan_fixed も base あり・product_rule は null）・本数は collect.ts:245-260（在席全員満額） | **新要件（器なし）** | **要**（cast×期間の販売額集計 RPC or close 時に全 mode で base 凍結） | ★「¥953,000／さくら ¥312,000」は現状算出不能・店合計は category Σ で近似可 |
| A12 | **指名実績**＝本／場内／同伴 | get_cast_ranking（0016:246-324）は checks.nom_type（伝票代表種別）・cast_sales_aggregate（0124）は名簿行 nom_kind＝**2系統併存**・店合計 get_store_nom_counts（0054）は nom_type 側 | 既存（2系統） | 望ましい（nom_kind へ統一） | 画面は注記で逃げている AB:1032-1034 |
| A13 | **担当顧客**＝CRM 担当 | customers.cast_id（0023:71・customer_assign_cast）・customer_list_summary（0030） | 準備中（分析未結線） | 否 | |
| A14 | 4定義カード | 無し（近い注記 AB:999-1002,1032-1034） | 新要件（UI） | 否 | |
| A15 | 「会計売上をキャストに帰属させません」 | **現行は真逆**＝get_cast_sales→cast_sales_aggregate（ratio_weight 最大剰余按分）を「売上貢献ランキング（按分）」AB:970-1003 で表示・CSV も | 新要件（既存表示の降格） | 否（RPC は payroll 使用中 collect.ts:503-507） | 推奨＝RPC 残置・分析 UI の露出のみ外す |
| A16 | 売上／前月比 | AB:561-567 | 既存 | 否 | |
| A17 | 組数 | AB:568-572（slips） | 既存 | 否 | |
| A18 | 客単価 | AB:573-577「組単価」 | 既存（語彙差） | 否 | 客数基準なら guests |
| A19 | 人件費率（概算）＋前月比 pt | AB:578-584＝**確定給与のみ**（payslips gross）・未確定は「—」・pt 比なし | 準備中 | 否 | 下記 A20 |
| A20 | 概算人件費の算出元 | `lib/nox/labor-forecast.ts:63-121 forecastDay`（shifts×wageDetail/applyOverride＝payOf 経由）・取得前例 shift-board `:258-284,611-622` | **再利用可（新結線）** | 否 | ★予定シフト×時給のみ（バック・控除・源泉含まず・attendance/punches 非基準）＝「概算」注記必須。2段＝確定月 payslips gross／未確定月 forecastDay Σ |
| A21 | 本指名 41本＋前月比 | get_store_nom_counts（0054）未結線 | 準備中 | 否 | |
| A22 | 売上推移（今月／前月重ね） | AB:771-843 | 既存 | 否 | |
| A23 | 見るべき変化・カテゴリ比率 | AB:713-763 は当月のみ | 準備中 | 否 | 前月窓で再呼び |
| A24 | 同・曜日 | heat（AB:453-461）にあり・表なし | 準備中 | 否 | |
| A25 | 同・キャスト集中度 | ranking 再形 | 準備中 | 否 | |
| A26 | 同・顧客リピート率 | cohort（0096:199-270）は初来店月基準＝当月リピート率と別物 | 新要件（定義未確定） | 条件付き要 | |
| A27 | 売上カテゴリ5分類 | store_category_aggregate→category-map.ts→AB:676-703 | 既存 | 否 | 表示順のみ |
| A28 | 曜日別テーブル | 無し（材料＝hourly の dow or daily_reports＋dowOf） | 準備中 | 否 | |
| A29 | 売上ビュー KPI | catSums から導出可 | 準備中 | 否 | |
| A30 | 割引・調整＋前月比 | catSums.discount（注記内 AB:698） | 準備中 | 否 | |
| A31 | 時間帯別（2h バケット・25時以降） | store_hourly_aggregate（1h 刻み）→hourBars AB:442-451 | 既存（再形） | 否 | |
| A32 | 支払方法（現金／カード／その他） | payMix AB:411-417（現行4分類＝売掛独立） | 既存 | 否 | |
| A33 | 日別実績テーブル（人件費率列） | 日別バーあり・表なし・**日別人件費率は器なし**（payslips 月次） | 新要件（日別人件費率） | 否 | forecastDay なら日別概算可 |
| A34 | 「月報へ」 | 無し | 新要件（Link） | 否 | |
| A35 | （mock に無い）曜日×時間帯ヒートマップ | AB:926-963 | 既存（残置判断） | 否 | |
| A36 | 「帰属させない」注記（キャスト） | ＝A15 | 新要件 | 否 | |
| A37 | 本指名／場内／同伴（店合計） | get_store_nom_counts 未結線／ranking 合算 | 準備中 | 否 | |
| A38 | 商品販売実績（店合計） | catSums drink+champ+bottle で近似 | 準備中 | 否 | cast 別（A11）とは母数が別＝定義明記 |
| A39 | 出勤キャスト 7名 | attendance（現行は選択 cast 1名 AB:355-363） | 準備中 | 否 | |
| A40 | キャスト別 TOP（指名内訳＋販売実績） | 指名＝get_cast_ranking・**販売実績列は A11 の器なし** | 新要件 | 要（＝A11） | |
| A41 | 偏り 本指名上位3名 | ranking 再形 | 準備中 | 否 | |
| A42 | 偏り 販売実績上位3名 | A11 依存 | 新要件 | 要 | |
| A43 | 偏り 出勤平均 | attendance 店集計 | 準備中 | 否 | |
| A44 | （mock に無い）主要客リスト | get_cast_customer_ranking（0031）＋AB:1037-1113（件数のみ・金額なし） | 既存（残置推奨＝按分禁止と整合） | 否 | |
| A45 | キャスト詳細4スタット | AB:1051-1074（客単価按分は A15 で削除対象・延長率/杯数 COMING） | 準備中 | 否 | |
| A46 | 来店顧客 57人（当月） | customer_list_summary.visits は全期間（0030:61-62）＝当月 distinct 顧客は取れない | 新要件 | 要（月内 distinct customer 集計） | |
| A47 | 新規 13人 | cohort offset0 流用 | 準備中 | 否 | |
| A48 | リピート 44人 | A46 依存 | 新要件 | 要 | |
| A49 | 平均来店間隔 | 器なし（customer_visit_history は1人・直近20件） | 新要件 | 要 | |
| A50 | 未紐付け来店 4件 | checks.customer_id null の月内カウント（hourly は p_customer_id 絞込のみ） | 新要件 | 要（軽微） | |
| A51 | 来店頻度（月4回以上…） | 器なし（visits は全期間） | 新要件 | 要（A46 と同件） | |
| A52 | 「顧客別売上ランキングは表示しません」 | **現行は金額を出している**（AB:1132-1136 セグメント累計 ¥・customers-board `:532,572-576`）。★total_spend＝Σchecks.total（0030:67-68）＝**按分していない**＝衝突は「顧客に金額を出すこと」自体 | 新要件（既存表示の削除） | 否 | |
| A53 | 按分禁止と check_cast_backs の関係 | 商品バックは close 時に**在席 cast へ数量按分**（0132/0133 最大剰余）＝キャスト按分であり顧客売上按分ではない | 既存（衝突しない） | 否 | 「販売実績＝同腕按分の凍結値」と定義文で明記 |
| A54 | 客層の内訳（新規／リピート／離反リスク） | segs AB:502-511＋churn_tier（0030:79-85） | 既存 | 否 | |
| A55 | アクション候補 30日／60日以上来店なし | churn_tier mid/high | 準備中 | 否 | |
| A56 | 同・**前月列と変化** | churn_tier は current_date 基準＝**過去時点の再現不可** | 新要件 | 要（基準日パラメータ化 or 月次スナップショット） | ★最大の落とし穴 |
| A57 | 今月初回来店 | cohort offset0 | 準備中 | 否 | |
| A58 | 来店履歴あり・担当未設定 | customer_list_summary（cast_id＋visits）client フィルタ | 準備中 | 否 | 前月列は A56 制約 |
| A59 | 「顧客管理へ」 | AB:1141 | 既存 | 否 | |
| A60 | （mock に無い）初来店月ごとの再来店表 | AB:1148-1188＋cohort | 既存 | 否 | |

**§10 総括**: 4定義分離＝会計売上（既）／指名実績（既・2系統併存＝統一裁定）／担当顧客（既・未結線）／**販売実績のみ器が無い**（check_cast_backs はバック額・product_sales_base は mode 限定 nullable）。現行の混同＝「売上貢献ランキング（按分）」＝v2.1 が禁じるもの→RPC 残置・UI 露出のみ外す。概算人件費＝forecastDay 再利用（mig 不要・予定シフト基準・「概算」注記必須）。顧客側は total_spend が非按分＝設計衝突なし・衝突は「顧客に金額を出すこと」と「キャスト按分売上の表示」の2点。過去時点の顧客ステータス比較（A56）だけはスナップショット不在で不可能。

## §11 お知らせ・通知 v2.1（N）— ⑬追補 v1.2（`nox-announcements-redesign-v2_1.html`・`17b1add1…6e18`・24,714B・収蔵済み）

前提: notices は1表（0034:41-54＝title/body/audience all|cast|staff/pinned/until/created_by）・RPC 3本（notice_create/update/delete＝audit あり）・**status／category／予約日時／チャネル／対象条件／既読／送信ログの列ゼロ**。通知基盤（notification／delivery log／channel）テーブル 0 件・LINE 列 0 件・メール基盤なし（`app/api/cron/billing-reminders/route.ts:11-16` が mail_disabled 明記）・push なし（service worker/VAPID 0 件）。既定裁定＝LINE レーン（T3）へ・「器を全構築・実送信のみ無効化・数値は —／準備中」（台帳:1500-1502）。

| # | v2.1 要素 | 現行実装 | 分類 | migration | 備考 |
|---|---|---|---|---|---|
| N1 | 見出し＋リード | `notices-board.tsx:214-216` | 既存 | 否 | |
| N2 | 通知設定ボタン | 無し | 新要件（器なし） | 要 | ＝H17 |
| N3 | KPI 今月配信／予約中 | `:236-240`（掲載＝created_at 集計）・予約中は器なし | 既存＋新要件 | 予約分は要 | 「配信＝掲示」読み替え裁定済（台帳:1388） |
| N4 | KPI LINE 到達率／連携済み | `:231-235`「—」準備中 | 準備中 | 要 | |
| N5 | KPI 既読率 | `:241-245`「—」準備中（notice_reads 不存在） | 準備中 | 要 | |
| N6 | KPI 配信失敗 | 無し | 新要件（器なし） | 要 | |
| N7 | 4タブ（作成／履歴／自動通知／未達） | タブなし（作成＋一覧の縦積み `:257-390,438-528`） | 新要件（UI） | 否（作成・履歴のみ） | 自動通知／未達タブは中身が器ゼロ |
| N8 | 配信店舗（複数／全店舗） | 無し。notices.store_id 単一＋RLS store_id=auth_store_id()（0034:66）＝1 membership 前提 | 新要件（器なし） | 要 | owner 多店舗選択の前例＝casts/page.tsx:20,36 |
| N9 | 「在籍中を対象・休店/退店除外」注記 | `page.tsx:24-27` count＋`:336-339` 注記 | 既存（注記のみ） | 否 | |
| N10 | カテゴリ5種 | `:262-269` opacity 0.35 表示のみ（列なし） | 準備中 | 要（category 列） | |
| N11 | 件名 | `:288-294`（80・0034:90） | 既存 | 否 | |
| N12 | 本文 | `:295-302`（4000・0034:92） | 既存 | 否 | モック 1000 とは差（実装が正） |
| N13 | 対象 全員／キャスト／黒服（人数） | `:306-340` | 既存 | 否 | |
| N14 | 対象 本日出勤 | 無し（shifts と非結合） | 新要件（器なし） | 要 | |
| N15 | 対象 期間内出勤 | 無し | 新要件（器なし） | 要 | |
| N16 | 対象 役割・ランク | 隣接器あり（cast_ranks／memberships.role）・notices 結線ゼロ | 新要件 | 要 | |
| N17 | 対象 個人指定（検索・チップ） | 無し（audience 1値） | 新要件（器なし） | 要（notice_targets） | |
| N18 | 候補行の LINE／メール状態 | 無し（users.email はあり・LINE 列ゼロ） | 新要件 | 要 | |
| N19 | 配信方式 LINE 優先＋メール予備 | `:354-364` disabled | 準備中 | 要（送信ログ） | |
| N20 | 配信方式 全チャネル | 無し | 新要件 | 要 | |
| N21 | 配信方式 アプリ内のみ | 現行の唯一の挙動（掲示のみ） | 既存（既定固定） | 否 | |
| N22 | チャネル アプリ内（マイページ） | `app/mine/notices/page.tsx:22-26` | 既存 | 否 | |
| N23 | チャネル LINE | 器ゼロ | 新要件（器なし） | 要 | 外部 API レーン |
| N24 | チャネル メール | 器ゼロ（mail_disabled） | 新要件（器なし） | 要＋インフラ（Resend 等の採否） | |
| N25 | 掲載期間 | `:23,346-351`（until） | 既存 | 否 | |
| N26 | 配信タイミング 今すぐ／予約 | `:371-380` 予約 disabled | 準備中 | 要（scheduled_at＋cron） | cron 器は app/api/cron にあり |
| N27 | 緊急カテゴリは店長・管理者のみ | RPC は一律 owner/manager（0034:87） | 準備中（部分既存） | 要（category 前提） | |
| N28 | 下書き保存 | `:378` disabled | 準備中 | 要（status） | |
| N29 | 配信対象を確認 | `:381-386→532-557` | 既存 | 否 | |
| N30 | 今すぐ配信 | `:554→post()→notice_create` | 既存 | 否 | |
| N31 | LINE プレビュー | `:394-417`（表示のみ） | 既存 | 否 | |
| N32 | テンプレート5件 | `:34-50` 3件 | 既存（部分） | 否 | 2件追加＝定数 |
| N33 | 履歴検索 | `:452-456` | 既存 | 否 | |
| N34 | 履歴フィルタ（予約／配信済み／下書き） | `:446-451` は公開範囲軸（status 不在＝意図的・台帳:1460） | 準備中 | 要（status） | |
| N35 | 履歴カード（チャネルバッジ） | `:504-513`（チャネルは器なし） | 準備中 | チャネル分は要 | |
| N36 | 到達内訳（アプリ内／LINE／メール／既読） | `:516-519`「—」準備中 | 準備中 | 要（delivery log＋read receipt） | |
| N37 | 詳細／複製して作成／未読者を見る | 現行＝編集／削除のみ `:520-525` | 新要件 | 複製は否／未読者は要 | |
| N38 | 予約カード（編集・取消・変更履歴） | 器なし（audit_logs に update/delete before→after はあり） | 準備中 | 要（予約列） | |
| N39 | 「配信済み本文は上書きしない／訂正版を再配信」 | **現行は上書き編集そのもの**（notice_update＝UPDATE `:132-134`） | **方針衝突** | 要（版管理なら） | ★裁定要点＝§12 X5 |
| N40 | 自動通知ルール4種（ON/OFF・トリガー・方式） | **器ゼロ**。トリガー元は存在（shift_period_set published／shift_confirm_bulk／payroll_finalize）だが**どの RPC も通知を発行しない**・代打は機能自体なし（H44） | 新要件（器なし） | 要（大） | notification_rules＋notifications＋notification_deliveries |
| N41 | 自動通知履歴（送信元操作まで追跡） | audit_logs（actor/action/target/at/before-after）は全 RPC で記録済 | 準備中（別軸） | 要（通知↔操作の紐付け列） | |
| N42 | 未達・失敗リスト | 器ゼロ | 新要件（器なし） | 要 | |
| N43 | 本人設定へ／確認再送／再送 | 器ゼロ（連絡先設定画面もなし） | 新要件（器なし） | 要 | |
| N44 | 「送信失敗してもアプリ内通知は残る」 | 現行は掲示のみ＝結果的に成立 | 既存（副次） | 否 | |

**§11 総括**: mig 不要で追える＝N32（テンプレート2件）・N37 複製（notice_create 再利用）・N7 タブ化。**通知基盤（手動 notices と別テーブル群＝rules／notifications／deliveries＋line_user_id／同意／送信ログ）は器ゼロ**＝LINE レーン（T3）と統合して独立レーン。要裁定＝N39（配信済みの上書き可否＝版管理）／N8（多店舗配信＝auth_store_id 単一前提との衝突）／N24（メール基盤の採否）。

## §12 UI モック設計まとめ（裁定126・`docs/NOX_UI_MOCKS_HANDOFF_20260904.md`）との突合5点＝裁定要点

設計まとめ（設計思想の正本）と現行実装・既存裁定を突き合わせ、**衝突または解釈が要る5点**を裁定要点として挙げる。§16 の8項は台帳 裁定126 で恒久注意へ昇格済み。

| # | 設計まとめの原則 | 現行実装／既存裁定 | 突合結果 | 裁定案（推奨） |
|---|---|---|---|---|
| X1 | §3-2「料金ルールは上から優先・最初に一致」＋モック v8.1 の優先列は**数値露出**（P5/P23） | 裁定115-②＝priority 数値**非露出**（∧∨のみ・「上のルールが優先」注記）・解決順は既存 resolve と一致 | **衝突**（表示方針のみ・意味論は一致） | 推奨＝非露出を維持し「N 番目／○○の上」の**相対表示**（P23）で「上から優先」を可視化（裁定115-② 不変・数値入力は復活させない） |
| X2 | §9-4「締め解除→訂正→再締め」・§14-3 監査（締め解除・現金差異承認）・§9-5 月次確定不可 | `daily_report_reclose`＝**解除なしの再集計上書き**（ロック状態列・解除理由・承認者なし）・`payroll_reopen`（D-1）だけが真の解除型・裁定12①「月次確定テーブルは作らない」・裁定12⑥「CSV なし」 | **衝突**（器の欠落＋裁定12 と正面衝突） | 推奨＝日報を payroll_reopen 同族へ寄せる新設計（unlock RPC＋理由＋承認者・現金差異の理由/承認列）を **D-1 と同レーン**で裁定。月次確定は裁定12① の見直し（stores 側フラグ or 期間表）を要否から裁定・CSV は仮出力の位置づけで裁定12⑥ を再検討 |
| X3 | §8-4／§11-4「顧客ごとへの売上按分はしない」＝顧客別売上ランキングを出さない・§11-3 の4定義分離 | `check_cast_backs`／`get_cast_sales` は**キャストへの按分**（名簿 ratio_weight・裁定100）＝顧客按分とは別軸。`customer_summary`／`get_cast_customer_ranking` の按分有無は A 系で実測（§10） | **整合**（按分の主語が違う＝混同注意） | 推奨＝「顧客按分は行わない」を裁定として明文化し、`checks.customer_id` 1件のまま同行者（R52）を足す場合も**売上は伝票単位・顧客へは非按分**を維持。キャスト按分（check_cast_backs）は「販売実績・バック」の軸として分離表記（恒久注意7） |
| X4 | §2-4／§5-2／§14-4「店舗利用機能の共通定義から表示制御」（OFF＝UI 非表示・データ保持） | 器なし（S16-S26／R2）・部分器＝料金区分 active 0件＝非表示（0128）・売掛 `receivable_policy`・ノルマ settings_json。報酬側は裁定101「採用方式＝値の有無から自動導出・保存しない」 | **衝突**（裁定101 の自動導出 vs 保存型フラグ）＋一本化未了 | 推奨＝`stores.settings_json.features`（or `store_features`）を**共通定義**として新設し、ページごとの判定を禁止（恒久注意5）。報酬表示制御は「自動導出＝既定・フラグは明示 OFF のみ上書き」の二層で裁定101 を保存（S27-S36）。料金区分・売掛は既存器へ写像し二重管理を避ける |
| X5 | §2-3／§14-1「現在値を上書きせず適用期間と履歴を持つ」（料金・時給・待遇・ランク・シフト確定後変更・会計確定後訂正・配信済み通知・売掛回収・在籍状態） | 履歴あり＝cast_plan（期間化 0114）・pricing_rules 凍結（0128/0129/0130）・audit_logs（全 RPC）。**上書き型**＝`notice_update`（N39）・`set_cast_rank_of`（即時・K29）・在籍 2値（0074 CHECK・K25）・shift_set 更新（audit のみ・H30/H39）・売掛回収は ar_collections（履歴あり・D47） | **部分衝突**（上書き型4系統） | 推奨＝「履歴＝audit_logs で足りるもの」と「適用期間列が要るもの」を分ける裁定: 適用期間が要る＝ランク（K29）・在籍状態（K25）・時給保証（K33）・通知の版（N39）／audit で足りる＝shift 確定後変更（H39 は UI 表示のみ）・売掛回収（既存）。恒久注意6・8 の適用範囲を明文化 |

## §13 D調査の限界（申告）
- 行番号は Explore 走査の読み取り値（2026-09-04・repo `9de764d`）。起草時に該当行を再確認すること。
- v8.1 の「13セクション」は mock の見出しでは15区画（一覧／区分／プレビュー／編集モーダル／基本指名／ランク／VIP方式／表示グループ／営業日・時間／基本料金／税・サ料／支払方法／カード手数料／追加料金／会計確定）＝本表は区画単位で P1-P62 に展開。
- 報酬 v3.1 の商品販売バック3択は対象外（113 UI レーン・mig0134 待ち）。
- ⑬差替: レジ v12.1・シフト v4.1・キャスト管理 v3.1 は**デザインパック v1.1**（zip `0dac9f87…9d2f`・台帳 md `NOX_デザインパックv1_1_正本化台帳.md`＝`cb555316…dcc4`）として照合収蔵・コミット済み（`8098c9d`・push 済み）。v1.1 台帳注記: シフト :root 外 HEX 直書き97箇所／キャスト88箇所は未正規化（実装時に共通トークンへ）・ページ固有トークン `--side` は据え置き。
- 行番号・分類は Explore 走査10本（店舗設定／料金／報酬／レジ／シフト／キャスト管理／日報・月報・売掛／ホーム／分析／お知らせ・通知）の読み取り結果を CC が集約したもの＝起草時に該当箇所を再確認すること。キャスト管理の詳細タブは JS 生成＝script 文字列 214 本から写像（v1.2 の4面は静的 DOM）。
- v1.2（最終ラウンド4面）は `nox-design-pack-v1_2.zip`（`5748901c…020c`・台帳 v1_2 `42656de8…7e55`）として照合収蔵（本コミット）。10ページで管理画面デザインは一旦完結（台帳 v1_2）。A 系の行番号は `analytics-board.tsx` を AB と略記。
- 手順1の「⑬追記2モック＋台帳 v1_1 を同コミットへ」は、先行して `8098c9d`（v1.1 パック収蔵・push 済み）で完了していたため本コミット（対応表 v1 昇格）とは別コミットになっている（内容は同一・履歴上は2本）。
