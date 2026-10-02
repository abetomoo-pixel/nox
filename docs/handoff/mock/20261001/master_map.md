# マスタ整理 対応表（裁定330・正本モック nox-master-consolidated.html・便 MC0-2・2026-10-01）

読取のみ（HEAD＝M5 の push 後）。モック＝トップ 4 パネル × 9 入口（＋営業メニュー「在庫」）。現行＝マスタトップ 17 カード（app/(manage)/master/master-board.tsx HUBS）＋第 2 ナビ MASTER_NAV 4 群 15 ページ（lib/nox/master/nav.ts）。
裁定330 の不変条件＝設定値／計算／権限／履歴は不変・旧 URL 維持。本表は「どの既存画面（component）をどの入口のどのタブに置くか」と、既存 suite の pin への影響。

## 0. 分類の語

| 分類 | 意味 |
|---|---|
| 移動のみ | 既存の page／panel をそのまま別入口へ（URL 不変・リンク先の付け替え） |
| タブ化 | 複数の既存 page／panel を 1 入口のタブに並べる（既存の 3 タブ構造は維持） |
| 重複除去 | 同じ列を 2 画面で編集していたものを 1 箇所へ（店舗名＝店舗情報のみ） |
| マスタから外す | 在庫＝営業メニューへ（既存 nav の営業群に在庫は既にある＝マスタトップのカードを外すだけ） |
| 新設（器あり） | 入口・タブを新しく置くが、中身は既存 panel（新 RPC・新列なし） |

## 1. パネル A「商品・料金」

| 入口（モック） | タブ（モック） | 現行 route | component | 権限 | 分類 |
|---|---|---|---|---|---|
| 商品管理 | 商品一覧 | /master/products | ProductsBoard（在庫数・発注基準は商品の設定＝不変） | owner／manager | 移動のみ |
| 商品管理 | 商品カテゴリ | /master/categories | CategoriesBoard | owner／manager | タブ化（products と同一入口の 2 タブ・URL は両方維持） |
| 料金・会計 | 料金マスタ | /master/pricing（tab=master） | PricingBoard の 3 タブのうち master | owner／manager | 移動のみ（既存 3 タブ構造を維持＝裁定117） |
| 料金・会計 | 料金適用ルール | /master/pricing（tab=rules） | 同 rules | owner／manager | 移動のみ |
| 料金・会計 | 会計設定 | /master/pricing（tab=checkout） | 同 checkout（サ料・丸め・カード手数料・加盟店契約の確認＝T6・税区分） | owner／manager（契約確認は owner／manager） | 移動のみ |
| （営業メニュー）在庫 | 締め時点の記録／入出庫の履歴／発注推奨 | /master/stock | StockBoard（URL 不変） | owner／manager | **マスタから外す**（master-board の m-stock カードと MASTER_NAV「在庫」を外す・(manage)/layout の営業群「在庫」は既にある） |

## 2. パネル B「キャスト・報酬」

| 入口 | タブ | 現行 route | component | 権限 | 分類 |
|---|---|---|---|---|---|
| 報酬設定 | 待遇プラン（基本時給・スライド・指名バック・シミュレーターはプラン画面内） | /master/cast-comp/plan | PlanBoard（PlanTab／comp-sections／simulator-panel） | owner／manager（保存は owner） | 移動のみ（m-sim カードの「報酬シミュレーター」をトップ見出しから外す＝カード名の変更のみ） |
| 報酬設定 | 控除・送り | /master/cast-comp/deduction | DeductionBoard | owner／manager | タブ化 |
| 報酬設定 | ノルマ | /master/cast-comp/norma → plan#norma（redirect） | NormConfigPanel（plan 内） | owner／manager | タブ化（redirect は維持・ノルマを使うかの切替は店舗設定＞利用機能＝sys_norms へ＝既存 systems の挙動と同じ） |
| 紹介者・紹介料 | 紹介者／紹介料の支払 | /master/referrers | ReferrersBoard（2 節） | owner／manager | 移動のみ（待遇プランに混ぜない＝現状どおり別ページ） |
| （権限へ移動）キャスト会計の許可 | — | /master/cast-comp/register | CastRegisterPanel（set_cast_register） | owner／manager | **移動**＝パネル D「権限・情報管理 ＞ 操作権限」へ（URL 維持・MASTER_NAV の群だけ変える） |
| （店舗設定へ移動）報酬制度 | — | /master/cast-comp/systems | SystemsBoard（sys_* 9 フラグ＝set_store_profile） | owner（manager 閲覧） | **移動**＝パネル C「店舗設定 ＞ 利用機能」へ（URL 維持） |

## 3. パネル C「店舗・運用」

| 入口 | タブ | 現行 route | component | 権限 | 分類 |
|---|---|---|---|---|---|
| 店舗設定 | 利用機能＝報酬制度（sys_* 9）／フロア機能（VIP・カウンター）／売掛利用（ar_enabled）／スタッフシフト・締め解除フロー（feature_flags） | /master/cast-comp/systems（報酬制度）・/master/store-profile（売掛）・/master/system#features（機能の公開） | SystemsBoard・StoreProfilePanel の「売掛・記録の保持」節・FeatureFlagsPanel | owner（manager 閲覧） | **タブ化**（3 画面の節を 1 タブへ）。**フロア機能（VIP・カウンターを使うか）は器なし**＝stores に列なし・seats.kind の有無で代替＝第 2 期（0163 以降の候補・設定だけなら settings_json 白名単 +2 で足りる） |
| 店舗設定 | 店舗情報＝店舗名・略称・店舗コード・表示名／キャスト確認（shift_cast_confirm） | /master/store-profile | StoreProfilePanel の「店舗情報」「シフト運用」節 | owner（manager 閲覧） | **重複除去**＝店舗名の編集はここだけ（現状: business-hours ページは StoreProfilePanel を切り出し済み＝起票86 で重複は既に解消・モックの「営業時間画面で重複して編集しない」は現状と一致）。**M1 の「キャスト画面の設定」（MineSettingsPanel・8 キー）＝「店舗設定 ＞ 利用機能」タブ（330 追補1 で確定・MC2 適用）**／**0159 の「勤務時間の計算基準」（pay_time_basis）＝「利用機能」タブの報酬制度の直下（MC2 適用）** |
| 席・卓 | 席・卓一覧（登録・並び順・稼働） | /master/seats | SeatsBoard | owner／manager | 移動のみ（席種ごとの料金ルールへのリンク＝/master/pricing?tab=rules） |
| 営業時間・定休日 | 営業時間・シフト運用＝曜日別営業時間・定休日／シフト登録（スタッフ枠＝枠マスタ・締切） | /master/business-hours | BusinessHoursPanel＋StaffShiftPanel | owner／manager | 移動のみ（店舗名の注記＝「店舗設定 ＞ 店舗情報に統一」） |

## 4. パネル D「スタッフ・システム」

| 入口 | タブ | 現行 route | component | 権限 | 分類 |
|---|---|---|---|---|---|
| 端末・印刷 | 打刻・レジ端末（発行・失効） | /master/system#devices | KioskDevicePanel（＋KioskPinPanel＝操作担当 PIN） | **owner 限定**（PIN は owner／manager 自店） | タブ化（system-board の既存 4 タブを 2 入口に分ける・URL と # は維持） |
| 端末・印刷 | レシート・プリンタ（レシートの店舗情報・印刷設定） | /master/system#receipts | PrinterPanel（set_store_receipt_profile＝receipt_address／tel／invoice_reg_no／footer） | **owner 限定** | タブ化（「店舗の基本情報との関係」＝レシート表記は store-profile の店舗名とは別列＝注記のみ） |
| 権限・情報管理 | 操作権限＝キャスト会計の許可 | /master/cast-comp/register | CastRegisterPanel | owner／manager | 移動（B から） |
| 権限・情報管理 | データ管理＝顧客情報の利用目的・保持年数／操作ログの保持（7 年固定表示） | /master/store-profile（店舗情報節の 2 項目＋「売掛・記録の保持」節の表示） | StoreProfilePanel の該当 field 2 本＋表示 | owner | **分離**＝StoreProfilePanel から customer_purpose／customer_retention_years／操作ログ表示を別 panel（DataRetentionPanel・新 component・同じ set_store_profile）へ切り出す |
| 権限・情報管理 | 機密・税務情報（保護された導線） | /master/system#secrets | SensitiveTaxPanel | owner（閲覧ログ） | 移動のみ（権限は広げない） |

## 5. 入口の数

モック: トップ 17 → 9 入口（商品管理／料金・会計／報酬設定／紹介者・紹介料／店舗設定／席・卓／営業時間・定休日／端末・印刷／権限・情報管理）＋営業メニューの在庫。
現行 17 カード → 対応: 商品マスター＋商品カテゴリ→商品管理／料金設定→料金・会計／待遇プラン＋控除・送り＋ノルマ→報酬設定／紹介者→紹介者・紹介料／店舗情報＋報酬制度＋機能の公開（＋売掛）→店舗設定／席・卓→席・卓／営業時間→営業時間・定休日／キオスク端末＋レシート・プリンタ→端末・印刷／キャスト会計の許可＋データ管理（新）＋機密・税務情報→権限・情報管理／在庫→営業メニュー。**新 route 0・新 RPC 0・新列 0**（フロア機能だけ器なし＝送り）。

## 6. 既存 suite（pin）への影響

| suite | pin | 変化 |
|---|---|---|
| nav | nv(5-1) MASTER_NAV キャスト・報酬群のタブ列＝概要／待遇プラン／控除・送り／ノルマ／キャスト会計／報酬制度／紹介者 | 群の再編（キャスト会計→権限・報酬制度→店舗設定）で**張替え**。nv(2-2) 営業群の在庫は不変 |
| referral | re(12-3) マスタ「紹介者」ページと nav 行 | nav 行が残れば不変（群名の変更は文言 pin を確認） |
| store-profile（39） | 白名単 20・field・RPC 引数 | DataRetentionPanel へ切り出しても RPC・キーは同じ＝**component 名の pin があれば張替え**（要確認＝suite が panel 名を grep しているか） |
| store-systems（30） | systems-board の配線 | URL 不変＝不変見込み（群名の文言 pin のみ） |
| mine-settings／mine-cast-settings | MineSettingsPanel は store-profile page に | 置き場を変える（同 page 内の節順）なら不変・別 page に移すなら配線 pin 張替え |
| messages ms(2-1)／picker／demo-guard | 全ファイル走査 | 新 component は Message を使う・Picker 増減なし＝不変 |
| ui-tokens | 新トークン 0 | 不変（既存 .nox-* のみで組む） |
| master-board 自体の pin | （無し＝suite は master-board.tsx を読んでいない） | — |

## 7. 便の分割（MC 2 便）

- **MC1**＝トップ（master-board の HUBS を 4 パネル × 9 入口へ・在庫カードを外す・検索は既存 hubHit を維持）＋MASTER_NAV の 4 群再編（商品・料金／キャスト・報酬／店舗・運用／スタッフ・システム＝モックの 4 パネル・キャスト会計を権限へ・報酬制度を店舗設定へ）＋nav 張替え。URL 不変・component 不触。
- **MC2**＝タブ化（商品管理＝products＋categories の 2 タブ・報酬設定＝plan／deduction／norma の 3 タブ・店舗設定＝利用機能／店舗情報の 2 タブ・端末・印刷／権限・情報管理＝system-board の分割）＋DataRetentionPanel の切り出し＋M1 節・0159 節の置き場。pin 張替え（store-profile・mine-settings）。
- migration: **MC では 0**（フロア機能の設定キーは第 2 期・要るなら 0163 以降の settings_json 白名単 +2＝set_store_profile の ★置換）。

## 8. MC2 の適用（2026-10-01）

- 店舗設定（/master/store-profile）＝?tab=features（利用機能＝SystemsBoard（sys_* 9・ノルマを使う）／売掛／機能の公開（owner）／勤務時間の計算基準／キャスト画面の設定）・?tab=info（店舗情報＝店舗名・略称・店舗コード・表示名・送りの基本額・キャスト確認）。住所・電話・インボイス登録番号は端末・印刷 ＞ レシート・プリンタのまま（二重編集を作らない）。
- 権限・情報管理（入口 href /master/cast-comp/register）＝キャスト会計の許可（既存 page）／データ管理（/master/store-profile?tab=data＝利用目的・保持年数・操作ログ保持）／機密情報（/master/system#secrets）。
- 報酬設定＝待遇プラン／控除・送り／ノルマ（MC1 の仮置き 2 タブを外す）。料金・会計＝内側ピル撤去（外側 ?tab の 1 本）。/master/system の「機能の公開」タブは撤去（案内行＋リンク）。
- 旧 href 17 本＝全部有効（/master/cast-comp/systems・/master/system#features は「店舗設定 ＞ 利用機能」の alias として解決・ページは従来どおり描く）。新 route 0・新 RPC 0。
- フロア機能（VIP／カウンター）は器なし＝本便では出さない（W5 の 0164 で裁定）。
