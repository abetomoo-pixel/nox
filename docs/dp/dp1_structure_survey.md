# DP1 構造サーベイ（#7.5 デザイン移植レーン・読み取り専用・2026-08-21）

**レーン再編後の前提**: **DP1 = 構造変換** ／ **DP2 = 意匠仕上げ**（フォント・生 hex・spacing は DP2 へ後送）。
canonical = `mock/pages-2026-08/` は **構造 canonical**（DP0-4 改訂）＝DP1 で実装の IA・レイアウト・動線をモックへ寄せる。

適用する確定裁定: **DP1-①** `/register` はモック構造へ追随・ただし **v3 動線が優先** ／
**DP1-②** `/master` は3画面へ**ルート分割** ／ **DP1-③** `/payroll` は裁定18 維持・**構造も不触** ／
**DP1-④** `cast-comp` 4ページは **M2待遇レーン扱い・DP 対象外**。

本ファイルは調査記録のみ。**実装・commit はしていない**。作成したのは本ファイルと
`docs/dp/dp1_route_map.md` の2点のみ（`docs/dp/dp0_survey.md` の裁定欄追記を含む）。

---

## S1) `/master` ルート分割の影響調査

### S1-1. 現行の実装構造（実測）

| 層 | 実体 | 実測 |
|---|---|---|
| ルート | `app/(manage)/master/page.tsx`（76行・server） | `stores` / `allStores` / `casts` を取得し、**パネルを server で組んで `panels` prop（ReactNode）として MasterBoard へ渡す** |
| 入口ガード | `app/(manage)/master/layout.tsx`（33行・server） | `role` 解決 → `!role`→`/login` ／ `cast`→`/mine` ／ manager 未満→`/dashboard`。**配下の全ルートに既に効いている** |
| 第2ナビ | `app/(manage)/master/master-subnav.tsx`（client） | パンくず「マスタ ▸ {群名} ▾」＋群内タブ。**定義は `lib/nox/master/nav.ts` の `MASTER_NAV` 1本のみ** |
| ナビ定義 | `lib/nox/master/nav.ts` | 群3（overview / products / cast-comp）＋ `resolveMasterNav()` の**最長一致**解決。退化契約あり（群<2 はプレーン表示・ページ<2 はタブ行を出さない） |
| 本体 | `app/(manage)/master/master-board.tsx`（18,763 bytes・client） | ハブカード群＋**`view` state による3ビュー切替** |
| ビュー | `export type MasterView = "seat" \| "hours" \| "system"` | `useState<MasterView \| null>(null)`。**null = ハブ／非 null = そのセクションだけ表示** |
| パネル実体 | `business-hours-panel.tsx`(8.5KB) / `kiosk-panel.tsx`(16.7KB) / `printer-panel.tsx`(13.5KB) / `sensitive-tax-panel.tsx`(14KB) | **すべて独立コンポーネント**。`hours` = BusinessHoursPanel 1本、`system` = KioskPanel + PrinterPanel + SensitiveTaxPanel の3本 |
| 席 | master-board.tsx 内にインライン | `seat` ビューだけ **board 本体に直書き**（KPI4・検索/種別フィルタ・一覧表・編集フォーム・`set_seat` RPC） |

**★重要な既成事実**: この分割は**既に2度実行されている**。レーン②/③で
`products` / `categories` / `stock` を view から**実ルートへ完全移設済み**（`master-board.tsx:27-28` の
「"products" は実ページ3本へ完全移設したため view から削除した」コメントが残る）。
**DP1-② は3度目の同じ操作**＝手順・器（layout ガード・MASTER_NAV・MasterPageHead・MasterSubnav）が
すべて揃っている。

### S1-2. 共有 state の分離可否（実測）

| ビュー | 依存する state | 分離可否 |
|---|---|---|
| `hours` | **なし**（`{panels?.hours}` を描くだけ） | **完全に分離可**。BusinessHoursPanel は `stores` prop のみ＝page.tsx の `allStores` 取得を新ルートへ移すだけ |
| `system` | **なし**（`{panels?.system}` を描くだけ） | **完全に分離可**。KioskPanel(`allStores`) / PrinterPanel(`storeId` + `settings_json` 4値) / SensitiveTaxPanel(`casts`, `isOwner`) の props をそのまま移送 |
| `seat` | `seats` / `sId` `sName` `sKind` `sSort` `sActive` / `seatQ` `seatKind` / `msg` / `storeId` / `load()` | **分離可だが移送作業あり**。`load()` は `fetchProducts` `fetchProductCategories` `fetchStockTotals` と `seats` を **1つの useCallback にまとめて並列取得**しているため、席ルート側は `seats` 取得だけの `load()` に痩せる（残る側＝ハブは products/categories/stock のみになる） |

→ **hours と system は state 共有がゼロ**＝リスクは実質ない。**seat のみ state の切り出しが要る**。

### S1-3. 3ルート化した場合の影響 全数

| # | 影響先 | 実測 | 要否 |
|---|---|---|---|
| 1 | `lib/nox/master/nav.ts` | `MASTER_NAV` に**群を1つ追加**（例 `key:"store"` 「店舗・端末」／pages 3件）。描画側（MasterSubnav）は**不触**＝配列を足すだけでパンくず・タブが増える契約 | **要** |
| 2 | `app/(manage)/master/page.tsx` | `panels` prop（hours/system の JSX 組み立て）と `allStores` / `casts` / `settings_json` の取得を**新ルートへ移送**。ハブは products/categories/stock/seats 件数のみ残る | **要** |
| 3 | `master-board.tsx` | `MasterView` 型・`view` state・`VIEW_TITLE`・`← マスタ概要` backlink・`{view === "seat"}` 区画（約60行）・`{view === "hours"}` `{view === "system"}` を**撤去**。HUBS の該当3枚を `view:` から `href:` へ（レーン②/③ と同じ変更） | **要** |
| 4 | `app/(manage)/master/layout.tsx` | **不要**。既に `/master/**` 全体に効く（`products`/`categories`/`stock`/`cast-comp` が現にこのガードで動いている） | **不要** |
| 5 | 上位ナビ `(manage)/layout.tsx:78` | `{ href: "/master", label: "マスタ" }` **1件のみ**。ハブは残るので**不触** | **不要** |
| 6 | `app/(manage)/dashboard/page.tsx:47` | `{ href: "/master", label: "マスタ", icon: "✦" }` **1件のみ**。同上**不触** | **不要** |
| 7 | `lib/supabase/middleware.ts:42` | `PROTECTED = [... "/master" ...]` は**前方一致**＝配下も保護済み。**不触** | **不要** |
| 8 | `components/ui/nav-icons.tsx:30` | `"/master"` のアイコン定義1件。**不触** | **不要** |
| 9 | 内部リンク（`/master/**`） | 実測 = pricing 4・cast-comp 系 15・stock 2・products 2・categories 2。**seat/hours/system への直リンクは 0件**（view state 経由のみ＝リンクが存在しない） | **不要**（新設のみ） |
| 10 | リダイレクト | **不要**。旧 URL が存在しない（`?view=seat` のようなクエリも未使用＝`view` は素の useState でブックマーク不能）。**外部から壊れる URL がゼロ** | **不要** |
| 11 | verify:f0 | UI を見ないため**影響なし**（E レーン全段で実証済み） | — |

**★最大の所見**: **リダイレクトが要らない**。現行の3ビューは URL を持たない（`useState` のみ）ため、
**分割は「無かった URL を作る」だけの純増**で、既存 URL は1本も壊れない。

### S1-4. URL 設計案（列挙のみ・裁定は相談役）

| 案 | URL | 長所 | 短所 |
|---|---|---|---|
| **案1（モック名準拠）** | `/master/seats` ／ `/master/business-hours` ／ `/master/system` | モック3枚と1:1・意味が明快 | `seats` と既存 `stock`/`products` の語形（複数形）は揃う |
| 案2（既存語彙準拠） | `/master/seat` ／ `/master/hours` ／ `/master/system` | `MasterView` の型値と逐語一致＝移送時の取り違えが起きない | 単数形で既存3ルート（複数形）と不揃い |
| 案3（群を切る） | `/master/store/seats` ／ `/master/store/hours` ／ `/master/store/system` | 群 `store` を URL に出せる | 階層が深い・既存3ルートは群を URL に出していない＝不統一 |

**MASTER_NAV への追加案**（案1採用時）:
群 `key:"store"` `label:"店舗・端末"` ／ pages = 席・卓(`/master/seats`) ／ 営業時間(`/master/business-hours`) ／
スタッフ・システム(`/master/system`)。※ `resolveMasterNav` は最長一致なので `/master` 概要と衝突しない。

### S1-5. モック3枚 × 現行ビューの構造差分

| モック | 構造要素（実測） | 現行ビュー | 構造差 |
|---|---|---|---|
| **nox-seat-table-settings**（25KB・4見出し） | `pagehead`＋`kpis`（**card kpi ×4**）＋`card`「席一覧」＋`card`「VIP1 を編集」（`formgrid`）＋`card category-card`「席種カテゴリ」 | `view==="seat"`（board 直書き） | KPI4 は**実装済み**（総席数/稼働可能/無効/VIP）。**「席種カテゴリ」カードが実装に無い**＝席#3「席種マスタ化」は**後送り裁定済み**。編集は現行もフォーム＝`formgrid` 化は意匠 |
| **nox-business-hours-settings**（21KB・4見出し） | `pagehead`＋`kpis`（**card kpi ×4**）＋`card`「週間営業時間」＋`card`「特別営業日・臨時休業」＋`card`「特別日を追加」（`formgrid`） | `view==="hours"`（BusinessHoursPanel 1本） | **KPI帯が無い**＋**「特別営業日」2カードが無い**＝営業時間#7 は**後送り裁定済み**・#8 KPI は「分子が存在しない」で対象外記録済み |
| **nox-staff-system-settings**（29KB・15見出し） | `pagehead`＋`kpis`（×4）＋**`nav.tabs` 4タブ**（キオスク端末／操作担当PIN／レシート・プリンタ／機密・税務情報）＋`section.panel` ×4 に **card 12枚**（登録端末/端末アカウント発行/最近の操作 ‖ 操作担当PIN/PINポリシー/セキュリティ状態 ‖ レシートプリンタ/印刷ジョブ/レシートヘッダ ‖ キャスト機密情報/アクセス権限/最近の閲覧履歴） | `view==="system"`（KioskPanel + PrinterPanel + SensitiveTaxPanel の**3本を縦積み**） | **★モック側は4タブ・実装は3パネル縦積み**。モックが分ける「キオスク端末」と「操作担当PIN」は、**実装では `kiosk-panel.tsx` に同居**（`<h3>端末アカウントの発行` と `<h3>操作担当 PIN（レジ端末…`）＝**1パネルを2タブへ割る**必要。これは E8 の **staff#1「1ページ4タブ vs 2画面3パネル」＝スキップ（M級 IA 再編）** そのもの |

**★S1 の重要な訂正（DP0 調査からの更新）**: DP0 は
`nox-staff-system-settings ↔ /staff ＋ /master(system)` としたが、**モックを全数走査した結果、
本モックに「スタッフ名簿」の区画は存在しない**（h2 12本＝端末/PIN/プリンタ/機密のみ・
pagehead の説明文も「店舗端末、操作権限、印刷、機密情報を安全に管理します」）。
→ **正しい対応は `nox-staff-system-settings ↔ /master の system ビューのみ`**。
**`/staff`（スタッフ名簿）に対応するモックは存在しない＝B型**。
これにより D型は「複数モック→1画面」の3枚のみとなり、**1:1 崩れは解消する**（分割後は3枚とも 1:1）。

### S1-6. 実装規模の見積りと分割手順案

| 対象 | 規模 | 根拠 |
|---|---|---|
| `/master/business-hours` | **小** | 共有 state ゼロ・パネル1本の移送のみ。KPI帯4枚と特別営業日2カードは**後送り裁定済み**＝DP1 では作らない |
| `/master/system` | **中** | 共有 state ゼロだがパネル3本＋props 4系統の移送。**加えて 3パネル→4タブ の再編**（kiosk-panel を「端末」と「PIN」へ割る）＝staff#1 の M級 IA。**タブ再編を含めるか否かは要裁定** |
| `/master/seats` | **中** | board 直書きの席区画（KPI4・検索/フィルタ・一覧・フォーム・`set_seat`）と state 7本を切り出す。`load()` の分解が要る |
| ハブ側の後始末 | **小** | `MasterView` 型・`view` state・backlink・`VIEW_TITLE` の撤去＋HUBS 3枚を href 化（レーン②/③ と同型） |
| **全体** | **中** | 新規機能ゼロ・RPC 不触・リダイレクト不要。**前例が2回ある同型作業** |

**分割手順案（レーン②/③ の踏襲）**

1. `MASTER_NAV` に群を追加（ナビが先＝タブが空を指す時間を作らない場合は 2 と同コミット）
2. `/master/business-hours` を新設（**共有 state ゼロ＝最小リスク**）→ HUBS の該当カードを href 化 → `view==="hours"` 撤去
3. `/master/system` を新設（同上・3パネル移送）→ HUBS href 化 → `view==="system"` 撤去
   ※4タブ再編を採るなら**このルート内で完結**（kiosk-panel の分割は移送と同時が安い）
4. `/master/seats` を新設（**state 切り出しがあるので最後**）→ HUBS href 化 → `view==="seat"` 撤去
5. `MasterView` 型・`view` state・`← マスタ概要` backlink・`VIEW_TITLE` を撤去 → `master-board.tsx` はハブ専任へ
6. 各段で `verify:f0` 26本3000 と build を確認（UI 非依存＝機能に触れた場合のみ落ちる検出器）

---

## S2) `/register` 構成差の全数列挙

### S2-0. 仕分けの定義と v3 動線の実体

- **a** = 現行に既にある（意匠のみ）／**b** = 採れる（v3 と非衝突）／
  **c** = v3 と衝突（**v3 優先で不採用候補**）／**d** = データ・機能が要る（**DP 対象外・純増起票候補**）

**v3 動線の実体（実測・`register-board.tsx:1056-1058` の設計コメント逐語）**:
> 動線改修v3（案B・選択駆動ビュー切替）: 正本 nox-register-mock-planB-viewswitch.html。
> ★state は既存の check 1本のみ＝URL 遷移なし・伝票 state も連打束ね 700ms も会計 RPC も不変。
> **未選択＝フロア全幅／選択＝伝票全面（フロアは描画しない）**＝2列を常時確保しない（v2R の grid 教訓）。

実装点: `← フロア` は `nox-backbtn` × **2箇所**（`:1469` backbar sticky ／ `:2146` payrow）で
**いずれも既存 `closeDetail()` の再利用**。会計後の自動復帰も `closeDetail()`（`:439` はサイドバー
「レジ」再クリック＝`nox:nav-reclick` 受け）。

**モック側の該当構造**: `posView` の中に **`section.card.floor` と伝票カードが縦に並ぶ**
（`← フロア` ボタンは billhead に**あるが、フロアは隠れない**）。
→ **ここが唯一の正面衝突**（下表 #11）。それ以外は衝突しない。

### S2-1. モック register-pos（69,864 bytes）の構造要素 全数

**共通シェル**

| # | 要素（モック実測） | 仕分け | 根拠 |
|---|---|---|---|
| 1 | サイドバー `nav` 3群（ホーム/レジ/日報 ‖ シフト/キャスト… ‖ マスタ/お知らせ） | **a** | E2 で実装済み（NOX は段N の5群＝項目集合は実装が正） |
| 2 | topbar `crumb`「営業 / **レジ**」＋ admin | **a** | `.nox-tb` 実装済み |
| 3 | `sidefoot`「レジ端末　オンライン」＋ `dot` | **d** | 端末オンライン状態のデータが無い。`kiosk_devices` に last_seen 系の列なし・`kiosk_sessions.last_seen_at` はレジ端末のみ（E8 staff#5 の判定材料と同一・**裁定待ち**） |
| 4 | `toast` | **a** | `components/ui/toast.tsx` |

**トップレベル ビュー**

| # | 要素 | 仕分け | 根拠 |
|---|---|---|---|
| 5 | `posTab`「卓席・会計」／`reservationTab`「予約」の2値切替 | **a** | `tab: "tables" \| "reserve"`（`register-board.tsx:172`）＝**完全一致** |
| 6 | `assignmentView`（`assignTab` から表示） | **a** | `dtab: "order" \| "nom" \| "pay"` の `nom`（`:176`）＝役割一致 |

**フロア**

| # | 要素 | 仕分け | 根拠 |
|---|---|---|---|
| 7 | `card.floor`「フロア　使用中 6 / 8卓」 | **a** | フロア＋稼働数は実装済み |
| 8 | `＋ 新規伝票`（`newBill`）＝席を選ばず伝票を起こす | **d** | `check_open` は `p_seat_id` 必須＝**席なし伝票は RPC 改稿**。純増起票候補 |
| 9 | `.tables` グリッド（PC 8列／768 4列／641 2列） | **b** | 現行もタイル。列数規約をモック実測へ寄せるだけ・v3 と無関係 |
| 10 | 卓タイルの `capacitybar` / `capacity-top`（定員バー） | **d** | `seats` に **capacity 列が無い**（実列 = id/name/kind/sort_order/is_active/store_id）。純増起票候補 |
| 11 | **伝票を開いてもフロアが残る**（floor と bill の縦並び） | **c** | **v3 と正面衝突**。v3 = 「選択＝伝票全面（フロアは描画しない）」が確定裁定＝**v3 優先で不採用** |

**伝票ヘッダ**

| # | 要素 | 仕分け | 根拠 |
|---|---|---|---|
| 12 | `← フロア`（`.back`） | **a** | `nox-backbtn` ×2（`:1469` `:2146`）＝v3 で実装済み |
| 13 | 卓名 `h1` ＋ `seatbadge`（席種） | **a** | 実装済み |
| 14 | `stay`「20:00入店・滞在1時間55分」 | **a** | `openStarted`（段B floor 滞在）実装済み |
| 15 | `headtotal`「現在の合計」 | **a** | backbar に合計表示あり（`:1467` コメント「卓名・滞在・合計」） |
| 16 | `伝票取消`（danger・ヘッダ常置） | **b** | `check_void` は実装済み（`:896`）。現在は `window.prompt` で理由入力＝**ヘッダ配置＋モーダル化**は採れる |
| 17 | `billtabs` 3（注文／指名・席／会計） | **a** | `dtab` の3値と**逐語一致** |

**注文タブ**

| # | 要素 | 仕分け | 根拠 |
|---|---|---|---|
| 18 | `sectionhead`「注文・セット料金」＋説明文 | **b** | 見出し＋説明の2段組は部品化で採れる |
| 19 | `categoryTabs`（商品カテゴリタブ） | **a** | 純増⑦ `categories`（mig0063）実装済み |
| 20 | `productList` タイル | **a** | 実装済み（`nox-tile-price` 等） |
| 21 | `cartItems` 明細＋`cartempty` | **a** | 実装済み（POS 明細表＝E5 H1 で「密度が意匠」として特化裁定済み） |
| 22 | `商品をクリア`（`clearItems`） | **b** | `remove_line` の反復で実現可。**原子性が無い**（1行ずつ・失敗時に部分削除）ため確認モーダル前提 |
| 23 | セット料金カード（`sumSet`/`setTotal`/`appliedRule`/`ruleSummary`/`roundInfo`） | **a** | R2-a 開卓ルール選択＋`pricing_resolve`（mig0098）実装済み |
| 24 | `autoCharges`（自動加算） | **a** | サービス料・カードTAX 実装済み |
| 25 | `nextExtension`（次の延長） | **a** | R2-a 延長メニュー複数（mig0098）実装済み |
| 26 | `料金を再計算`（`recalc`） | **a** | `check_recalc` 実装済み |
| 27 | `guestCount` の `＋`/`−` カウンタ | **a** | `check_set_people`（mig0090）実装済み |
| 28 | `guestCapacity`（定員に対する人数バー） | **d** | #10 と同じ＝capacity 列が無い |
| 29 | `totalrow` / `subtotal` / `service` / `tax` / `grandTotal` | **a** | 実装済み |
| 30 | `割引・調整`（`discountBtn`） | **a** | discount line（kind='discount'）実装済み |

**指名・席タブ**

| # | 要素 | 仕分け | 根拠 |
|---|---|---|---|
| 31 | 指名の分配率（`shareRows`/`shareBar`/`allocationPreview`/`shareTotal`） | **a** | 按分（B1/B2）実装済み |
| 32 | `均等に分配`（`equalShare`） | **a** | 実装済み（「均等」4箇所） |
| 33 | `100%で追加` | **a** | 実装済み（「100%」8箇所） |
| 34 | 指名種別 select（`shareNominationType`/`nominationType`） | **a** | 本指名/場内/同伴＝実装済み |
| 35 | `分配を保存`（`saveShares`） | **a** | 実装済み |
| 36 | `addShareCast`（対象キャストへ追加） | **a** | `CastPicker` 実装済み |
| 37 | 席の追加・移動 | **a** | `seatPick: "add" \| "move"`（`:236`）実装済み |

**会計**

| # | 要素 | 仕分け | 根拠 |
|---|---|---|---|
| 38 | `会計へ進む` → `会計` モーダル → `会計を完了` の**3段** | **b** | 現行は `check_pay`→`check_close` の**2段**。**v3 と非衝突**（伝票全面のまま段を切れる）。※E5 裁定0 は「別裁定」としていたが **DP1-① で追随側へ更新** |
| 39 | 現金／カード／**併用** の3択 | **b** | `payments` は複数行＝**併用は機構として既にできる**（`METHOD_LABEL` = cash/card/ar/other）。UI 語彙のみ |
| 40 | `checkoutTable`/`checkoutPeople`/`checkoutAmount`/`received`/`change` | **a** | 釣銭計算（`tendered`）実装済み |
| 41 | `完了`（`completeCheckout`） | **a** | `check_close`（`p_idem_key` 必須＝規約9） |
| 42 | `伝票を分ける`（`splitBtn`）＋ `split-preview` 3部品 | **a** | `pay_group` 分割実装済み |
| 43 | 領収書ダイアログ一式（`receiptDialog`/`receiptCountButtons`/`receiptEditors`/`receiptPreviews`/`issuedQrCards`/`qr-fallback`/`紙で印刷する`） | **a** | **R2-c で全実装**（mig0099・発行モーダル＋台帳＋匿名公開ページ＋QR）。E8 の `register#1` は「後送り」裁定だったが **R2-c で解消済み** |
| 44 | キャストドリンク対象モーダル（`castDrinkDialog`/`castDrinkChoices`/`castDrinkPrice`） | **a** | mig0067 drink claims ＋ `CastPicker` 実装済み |

**予約ビュー**

| # | 要素 | 仕分け | 根拠 |
|---|---|---|---|
| 45 | 予約管理 ＋ `dateBar`（`todayBtn`/`resDate`） | **a** | `reservation-panel.tsx`（41KB）実装済み |
| 46 | `res-kpi` ×4「当日の状況」 | **b** | KPI 帯は E8-5 T1 で8ページに入ったが**予約は未**。取得は既存行の client 集計で足りる |
| 47 | `reservationRows` 一覧＋`reservationFilter`/`reservationSearch` | **a** | 実装済み |
| 48 | `nextArrivals`「次の来店予定」 | **b** | 既存の予約行の並べ替え表示＝新規取得なし |
| 49 | 予約登録モーダル（`resCustomer`/`resPhone`/`resCast`/`resSeat`/`resTime`/`resGuests`/`resCompanion`/`resNote`） | **a** | 実装済み |
| 50 | `来店・伝票開始`（`checkin`→伝票へ） | **a** | 実装済み（`to_check` で開いた伝票を反映＝`:1041`） |
| 51 | `予約をキャンセル` | **a** | 実装済み |

### S2-2. 仕分け集計

| 仕分け | 件数 | 内訳（#） |
|---|---|---|
| **a**（現行に既にある） | **39** | 1,2,4,5,6,7,12,13,14,15,17,19,20,21,23,24,25,26,27,29,30,31,32,33,34,35,36,37,40,41,42,43,44,45,47,49,50,51 ＋ 上記に含む |
| **b**（採れる・v3 と非衝突） | **8** | 9, 16, 18, 22, 38, 39, 46, 48 |
| **c**（v3 と衝突・v3 優先で不採用候補） | **1** | 11（伝票表示中もフロアを残す） |
| **d**（データ・機能が要る＝DP 対象外・純増起票候補） | **3** | 3（端末オンライン状態）／8（席なし新規伝票）／10・28（席の**定員**＝同一原因で2箇所） |
| **合計** | **51** | |

**★S2 の要点**: **51要素中 39（76%）は既に実装済み**＝レジの差は「機能差ではなく UI 構成差」という
ガイド §7 の予告どおり。**DP1 の実作業は b の8件に集約**され、そのうち構造として重いのは
**#38 会計3段化**のみ。**v3 との衝突は #11 の1件だけ**で、`← フロア`（#12）を含む v3 の骨格は
**モック側にも同じ形で存在する**（billhead の `.back`）＝v3 とモックは大枠で同じ設計。
**d の3件は原因が2つ**（端末の稼働情報が無い／`seats` に定員列が無い）＝いずれも純増起票。

---

## S3) A型10枚の構造残差

### S3-0. 前提

E4〜E8 で消化済み。原資料 = `docs/dp/e8_gap_matrix.md`（134件）＋
`docs/NOX_E8裁定_v1.md`（裁定書）＋`docs/dp/e8_5_skipped.md`（スキップ記録）。
**「残差」= 裁定の結果として現行とモックの構造が異なるまま残っている項目**（＝未処理の意味ではない）。

E8 裁定の全体集計（転記結果・実測）: 採用 96 ／ 現行維持 14 ／ 後送り 17 ／
ペンディング 1 ／ 不採用 3 ／ 裁定0型 3 ／ 要確認 3 ＝ **134**。

### S3-1. 画面別の構造残差

| # | 画面（モック） | 構造残差 | 規模 | E で「意図的に不追随」と裁定済みか |
|---|---|---|---|---|
| 1 | register-pos ↔ `/register` | **あり**（S2 の b 8件・c 1件・d 3件） | **中**（b のうち #38 会計3段のみ重い） | **一部**。E5 裁定0＝「レジのビュー構成差は E5 で追随しない・**別裁定**」＝**保留であって恒久不追随ではない**。**DP1-① で追随側へ更新済み**。`register#15` は「実装→モック欠落」＝現行維持（恒久） |
| 2 | daily-report ↔ `/report` | **ほぼ無し**。締めチェックは縮小版で実装済み・売掛期日/部分回収は mig0091/0092 で実装済み | **小** | **済**。`report#14/#15` = 実装→モック欠落＝現行維持（恒久）。`report#7` PIN 再認証 = T5 後送り |
| 3 | customer-management ↔ `/customers` | **ほぼ無し**。ランク/ボトル詳細/メモ履歴は mig0092 で実装済み・来店傾向も E8-6 で実装済み | **小** | **済**。`customers#11` = 現行維持（§4-3 の列挙漏れ分）。`customers#4` 対応済み保持 = 後送り |
| 4 | shift-management ↔ `/shift` | **あり**。**月間出勤実績カレンダ・週間 attendance グリッド・日週月ナビ**（裁定18 で純増起票＝対象外）／承認4段・計画ライフサイクル（T6 後送り）／自動配置（独立レーン） | **大** | **済**（恒久）。`shift#11/#12` = 現行維持。時間帯別必要人数＋充足バーは mig0093 で実装済み |
| 5 | cast-management ↔ `/casts` | **あり**。**#9 新規登録の入力項目（写真・プラン・招待のモーダル集約）＝M級 IA・スキップ**／#6 週次推移（定義未裁定でスキップ）／#4 基本情報編集（採用だが**段未割当＝要確認**） | **中** | **一部**。#9 は「誤操作リスク＞見た目の利得」でスキップ＝**理由付きの保留**。#4 は裁定漏れ側 |
| 6 | analytics-dashboard ↔ `/analytics` | **ほぼ無し**（構造は 4ビュー化＋T4 3本結線で消化済み）。残るのは **#6 自動インサイト＝ペンディング（E8-6 実機後に再裁定）** と、DP2 送りの**内部用語3語**（`:870` ヒートマップ／`:1067` セグメント／`:1088` リテンション＋`:552`） | **小** | **一部**。#16 = 現行維持。#6 のみ**再裁定待ち** |
| 7 | announcement-management ↔ `/notices` | **大きい**。**ページごと E8 では触っていない**（T3 LINE 前提）。モックの LINE 配信 UI は**未実装機能**＝当てる component が無い | **大**（ただし **LINE レーン依存**） | **済**（条件付き）。`notices#8` 一覧検索・`#9` 文字数カウンタは LINE 非依存＝「先に入れる場合は要指示」と明記されたまま。`notices#10` = 現行維持 |
| 8 | payroll-management ↔ `/payroll` | **あり**（#2 出勤日数列・#4 状態フィルタ・#7 給与調整モーダル＝**裁定漏れ**・#9 ヘッダ集約は縮小） | — | **★DP1-③ で構造も不触**＝裁定18 維持。**DP1 では触らない**（印刷 CSS が直下構造依存・money 表示中枢） |
| 9 | audit-management ↔ `/audit` | **小さい**。#7 詳細（risk/reason/review 列が無い＝作らない）・#4 現金照合ビュー／#6 データ出力は後送り | **小** | **済**（恒久）。`audit#3` ハッシュチェーン = **不採用確定**。`audit#8` = 現行維持 |
| 10 | pricing-settings ↔ `/master/pricing` | **ほぼ無し**（[A]6件は E8-5 で消化） | **小** | **済**（恒久）。`pricing#5` 判定時刻 = **裁定0型（恒久記録）**。`pricing#2` 料金項目マスタ = 後送り。`pricing#8` = 現行維持 |

### S3-2. 残差ありの画面と、D型3枚（参考）

**A型10枚のうち「構造残差ゼロ」は 0枚**。ただし規模で層別すると:

| 層 | 画面 | 備考 |
|---|---|---|
| **大**（DP1 で扱うなら重い） | shift（純増起票＝**対象外**）／notices（**LINE レーン依存**） | いずれも**恒久裁定または他レーン依存**＝DP1 の作業対象にならない |
| **中** | **register**（DP1-① の本体）／casts（#9 M級 IA・スキップ理由あり） | **DP1 の実作業はここ** |
| **小** | report / customers / analytics / audit / pricing | 意匠寄り＝**DP2 で足りる** |
| **不触** | payroll | **DP1-③** |

**D型3枚（S1 と重複・参考）**: seat-table（席種カテゴリカードが無い＝後送り）／
business-hours（KPI帯・特別営業日2カードが無い＝後送り/対象外）／
staff-system（**4タブ vs 3パネル**＝staff#1・M級 IA・スキップ）。
**DP1-② のルート分割で、この3枚は 1:1 対応になる**（S1-5 の訂正を含む）。

---

## S4) 対応表

`docs/dp/dp1_route_map.md` を別ファイルで新規作成した（33ルート×mock 13枚・
**構造差基準**の変換規模・裁定参照・14枚目は別表）。

---

## 申告事項

1. **DP0 の対応表に誤りが1件あった**（S1-5）＝`nox-staff-system-settings` は `/staff` を含まない。
   モック全数走査（h2 12本・pagehead 説明文）で確認。**`/staff` に対応するモックは無い＝B型**。
2. **`/master` 分割にリダイレクトは要らない**（S1-3 #10）＝現行3ビューは URL を持たない（素の `useState`）。
   壊れる既存 URL がゼロ＝**純増**。
3. **`/master/system` の4タブ再編（staff#1）は M級 IA**＝E8-5 が「夜間バッチでページ統合を発明しない」と
   スキップした項目。**ルート分割に含めるか否かは要裁定**（S1-6）。
4. **レジの v3 衝突は1件のみ**（S2 #11）＝それ以外は v3 とモックが同じ設計（`← フロア` はモックにも実在）。
5. **E5 裁定0（レジ構成差は追随しない）は DP1-① と衝突する**。本サーベイは **DP1-① を優先**として
   仕分けた（#38 会計3段を b に置いた）。ガイド §11-6 の E5 裁定0 は**上書きの明記が要る**。
6. **E8 の `register#1`（領収書ダイアログ＝後送り）は R2-c で解消済み**（mig0099）。
   E8 裁定書は R2-c 以前の文書のため、**後送り台帳から落とす追記が要る**。
7. **裁定漏れ・要確認が3件そのまま残っている**（裁定書 §4-4 payroll#7 ／ §4-5 casts#4 段未割当 ／
   §4-2 staff#5 端末最終アクセス）。うち payroll#7 は **DP1-③ で不触**のため DP1 では影響しない。
