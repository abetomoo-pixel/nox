# DP1 対応表（33ルート × mock 13枚・構造差基準・2026-08-21）

**#7.5 デザイン移植レーン（DP）** の画面対応の正本。母数は **33ルート**（DP0-5）。
変換規模は **構造差基準**（意匠差ではない）＝**DP1 = 構造変換** ／ **DP2 = 意匠仕上げ**。

調査の裏付け: `docs/tmp/dp0_survey.md`（DP0 調査）＋`docs/tmp/dp1_structure_survey.md`（DP1 構造サーベイ）。

## 0. 適用する確定裁定

| 裁定 | 内容 |
|---|---|
| **DP0-1** | 14枚目 = D型・**M2待遇レーン所属・DP 対象外**。トークン多数決母数 = 13枚（E1 据え置き） |
| **DP0-2** | アバター色 = I2 据え置き（恒久対象外）。DP2 是正 = **分析ビューの内部用語のみ** |
| **DP0-3** | 生 hex 是正 = `theme.ts` 旧 `--bg` 削除＋金暗面3色＋残り。意図的3件は据え置き（**DP2**） |
| **DP0-4（改訂）** | **`mock/pages-2026-08` は構造 canonical**。**DP1 で実装の IA・レイアウト・動線をモックへ寄せる**（BANZEN mock v2 と同じ扱い） |
| **DP0-5** | 対応表 = **33ルート基準** |
| **DP0-6** | フォント = sans **Inter + Noto Sans JP** ／ serif **Lora + Noto Serif JP**（旧 Georgia 役＋旧 Yu Mincho 役を一本化）。Outfit / Zen Kaku Gothic New / Cormorant Garamond は降格（**DP2**） |
| **DP1-①** | `/register` = モック構造へ追随。**v3 動線**（卓選択→全画面切替・「← Floor」・会計後自動復帰）は確定裁定＝衝突箇所は **v3 優先** |
| **DP1-②** | `/master` = モックの3画面分割へ追随＝**ルート分割**（business-hours / seat-table / staff-system を個別ルート化） |
| **DP1-③** | `/payroll` = 裁定18 維持・**構造も不触** |
| **DP1-④** | `cast-comp` 4ページ = **M2待遇レーン扱い・DP 対象外** |
| **DP1-⑤** | **E5 裁定0（レジ構成差は不追随）を上書き**＝追随する（ガイド §11-6-DP1 に明記済み） |
| **DP1-⑥** | 分割ルートの **URL はモック名準拠**（`/master/seats`・`/master/business-hours`・`/master/system`） |
| **DP1-⑦** | `/master/system` は **モック準拠の4タブ再編を含む**（端末／PIN／プリンタ／機密） |
| **DP1-⑧** | `/register` は **b 採用・c 不採用（v3 優先）・d は起票記録のみ** |
| **DP1-⑨** | `casts#9` 登録フロー集約を実施（M級 IA・機能不変・RPC/RLS 非改変） |
| **DP1-⑩** | 文書是正（ガイド §11-6 上書き・`register#1` 解消追記・d 3件の起票記録・本表の訂正） |
| **DP1-⑪** | **支払方法の3択は非追随＝NOX の4値を維持**（`payments_method_check` / `check_pay` の検証 / `daily_report_aggregate` の名指し集計の**3経路に直結**。モックの「併用」は方法ではなく「分けて払う」操作＝`payments` 複数行で機構は実装済み → **導線の可視化で対応**） |

**変換規模の凡例（構造差基準）**: **大** = IA・ルート・動線に踏み込む ／ **中** = 画面内の構成再編 ／
**小** = 構造差なし（意匠のみ＝DP2 で足りる）／ **不触** = 裁定により触らない。

---

## 1. 本表（33ルート）

### 1-1. A型 — 実装あり・モックあり（10ルート）

| # | 実ルート | 対応 mock | DP1 変換規模 | 裁定参照・根拠 |
|---|---|---|---|---|
| 1 | `app/(manage)/register/page.tsx` | nox-register-pos | **中 → ★DP1 P2 で実施済み**（`00bdd15`） | **DP1-①/⑧ の本体**。構造要素 51 のうち **a=41 / b=6 / c=1 / d=3**（★**#46 予約KPI4枚・#48 次の来店予定は実測で既に実装済み**＝サーベイの b 分類は誤りで実体は **a**。`reservation-panel.tsx:392-396` の `.nox-repsum` 4枚と `:405-408` の `upcoming`）。**実装 b 6件**＝タイル列数／伝票取消モーダル化／sectionhead 2段組／商品をクリア／会計3段化（表示段のみ）／併用導線。**c=1 は不採用**（v3 の伝票全面を維持）。**d=3 は純増起票**（ガイド §11-6-DP1 に記録）。#39 は **DP1-⑪ で非追随**。E5 裁定0 は **DP1-⑤ で上書き済み** |
| 2 | `app/(manage)/casts/page.tsx` | nox-cast-management | **中 → ★DP1 P3 で実施済み**（`19e3d18`） | `casts#9` 登録フロー集約＝モック `castDialog` 準拠の**モーダルへ集約**（modalhead＋modalbody＋formgrid＋actions）。★写真・プラン・招待は**送信に含めない**（それぞれ authz と経路が違い `trial_hire` 経路とフォームを共有＝E8-5 のスキップ理由が生きている）＝**「登録した後に設定する項目」4行として同じ面に順序で見せる**ところまで。RPC 6経路と select 列集合は sha 照合で逐語不変。`casts#4` 基本情報編集は**採用だが段未割当＝要確認**（裁定書 §4-5）。`casts#8` は現行維持 |
| 3 | `app/(manage)/shift/page.tsx` | nox-shift-management | **大（対象外）** | 月間出勤実績カレンダ・週間 attendance グリッド・日週月ナビ・AI最適化・打刻照合 = **裁定18 で純増起票＝DP 対象外**。承認4段/計画ライフサイクル = T6 後送り。自動配置 = 独立レーン。時間帯別必要人数＋充足バーは mig0093 で**実装済み**。`shift#11/#12` は現行維持 |
| 4 | `app/(manage)/notices/page.tsx` | nox-announcement-management | **大（他レーン依存）** | **E8 でページごと不触**（T3 LINE 前提）。モックの LINE 配信 UI は**未実装機能**＝当てる component が無い。`notices#8` 検索・`#9` 文字数カウンタのみ LINE 非依存＝**「先に入れる場合は要指示」のまま**。`notices#10` は現行維持 |
| 5 | `app/(manage)/report/page.tsx` | nox-daily-report | **小** | 締めチェック（縮小版）・売掛期日（mig0091）・部分回収（mig0092）は実装済み。`report#7` PIN 再認証 = T5 後送り。`report#14/#15` は現行維持 |
| 6 | `app/(manage)/customers/page.tsx` | nox-customer-management | **小** | ランク（grade）・ボトル詳細・メモ履歴は mig0092 で実装済み。`customers#4` 対応済み保持 = 後送り。`customers#11` は現行維持 |
| 7 | `app/(manage)/customers/[id]/page.tsx` | nox-customer-management（詳細） | **小** | E8-6 で PROFILE グリッド・来店傾向まで実装済み。詳細タブは**実装側が上位** |
| 8 | `app/(manage)/analytics/page.tsx` | nox-analytics-dashboard | **小** | 構造は 4ビュー化＋T4 集計3本の結線（mig0096）で消化済み。残 = `#6` 自動インサイト＝**ペンディング（E8-6 実機後に再裁定）**。**DP2 送り**＝内部用語3語（`analytics-board.tsx:870` ヒートマップ／`:1067` セグメント／`:1088` リテンション＋`:552`）。`#16` は現行維持 |
| 9 | `app/(manage)/audit/page.tsx` | nox-audit-management | **小** | `#7` 詳細（risk/reason/review 列が無い＝作らない）。`#4` 現金照合ビュー・`#6` データ出力 = 後送り。`#3` ハッシュチェーン = **不採用確定**。`#8` は現行維持 |
| 10 | `app/(manage)/master/pricing/page.tsx` | nox-pricing-settings | **小** | [A]6件は E8-5 で消化済み。`#5` 判定時刻 = **裁定0型（恒久記録）**。`#2` 料金項目マスタ = 後送り。`#8` は現行維持 |

### 1-2. D型 — ルート分割の対象（DP1-②・mock 3枚 → 新設3ルート）

| # | 現行 | 対応 mock | DP1 変換規模 | 裁定参照・根拠 |
|---|---|---|---|---|
| 11 | **`/master/seats`（新設済み）** | nox-seat-table-settings | **中 → ★DP1 P1 で実施済み**（`f653639`） | **DP1-②**。席区画は `master-board.tsx` に直書き＝**state 7本（`seats`/`sId`/`sName`/`sKind`/`sSort`/`sActive`/`seatQ`/`seatKind`）と `load()` の切り出しが要る**。KPI4 は実装済み。「席種カテゴリ」カードは `席#3` = **後送り裁定済み**＝作らない |
| 12 | **`/master/business-hours`（新設済み）** | nox-business-hours-settings | **小 → ★DP1 P1 で実施済み**（`f653639`） | **DP1-②**。`{panels?.hours}` を描くだけ＝**共有 state ゼロ**・パネル1本（`business-hours-panel.tsx`）の移送のみ＝**最小リスク**。KPI帯4枚・特別営業日2カードは `営業時間#7/#8` = **後送り/対象外** |
| 13 | **`/master/system`（新設済み）** | nox-staff-system-settings | **中 → ★DP1 P1 で実施済み**（`f653639`） | **DP1-②**。`{panels?.system}` = 共有 state ゼロだがパネル3本＋props 4系統の移送。**★モックは4タブ（端末／PIN／プリンタ／機密）・実装は3パネル縦積み**で、**モックが分ける「端末」と「PIN」は `kiosk-panel.tsx` に同居**＝`staff#1`（M級 IA・E8-5 でスキップ）。**タブ再編は DP1-⑦ で採用＝実施済み**（`kiosk-panel.tsx` を `kiosk-device-panel` / `kiosk-pin-panel` へ分割・表示再編のみで RPC は逐語不変） |
| 14 | `/master`（ハブ本体） | — | **小 → ★DP1 P1 で実施済み**（`f653639`） | 分割後は**ハブ専任**へ。`MasterView` 型・`view` state・`← マスタ概要` backlink・`VIEW_TITLE` を撤去し、HUBS 3枚を `view:` → `href:` へ（**レーン②/③ と同型の後始末**） |

**★ルート分割の前提（実測）**: リダイレクトは**不要**。現行3ビューは URL を持たない（素の `useState`）ため、
**壊れる既存 URL がゼロ**＝純増。`master/layout.tsx` のガード（manager 以上）は `/master/**` に既に効く。
ナビは `lib/nox/master/nav.ts` の `MASTER_NAV` に**群を1行足すだけ**（描画側は不触の契約）。
同じ分割は **レーン②/③ で products / categories / stock に対して2回実施済み**。

### 1-3. B型 — 実装あり・モックなし（19ルート）

構造の変換対象ではない。トークン・部品の波及（DP2）のみ受ける。

| # | 実ルート | 所属レーン | DP1 変換規模 | 裁定参照・根拠 |
|---|---|---|---|---|
| 15 | `app/(manage)/payroll/page.tsx` | 給与 | **不触** | **DP1-③**＝裁定18 維持・**構造も不触**。印刷 CSS が `payroll-board` 直下構造 `> *:not(.nox-print)` に依存・money 表示中枢（数値/計算/丸め/並び/集合を1文字も変えない）。残差（`#2` 出勤日数列・`#4` 状態フィルタ・`#7` 給与調整＝**裁定漏れ**・`#9` ヘッダ集約は縮小）は DP1 では扱わない |
| 16 | `app/(manage)/staff/page.tsx` | スタッフ | **小** | **★DP0 の対応表を訂正**: `nox-staff-system-settings` に**スタッフ名簿の区画は存在しない**（h2 12本＝端末/PIN/プリンタ/機密のみ）。**`/staff` に対応するモックは無い＝B型**（★DP1-⑩ で確定・**分割後は mock 13枚がすべて 1:1 になる**＝1:1 崩れは解消）。段P のスタッフ写真は cast_id 由来で当てられない（裁定18） |
| 17 | `app/r/[token]/page.tsx` | R2-c 匿名公開 | **不触** | 白地黒字の帳票トーン＝**画面パレット対象外**（R2-c 裁定）。生 hex `#f4f2ee`/`#1a1a1a` も意図的据え置き（DP0-3） |
| 18 | `app/page.tsx` | F0 公開トップ | **不触** | 未移行ライト＝`.nox-dark` 圏外（D2残差リスト #27） |
| 19 | `app/(manage)/dashboard/page.tsx` | ホーム | **小** | 2026-08 モック無し（UI刷新v2 段H2 で実装）。`var()` 参照 8 と**部品化が最も薄い**＝DP2 の意匠寄せの主対象。時間帯別不足は `staffing_needs` が store×dow のみ＝作らない（裁定18） |
| 20 | `app/kiosk-register/page.tsx` | キオスク | **中（従属）→ ★DP1 P2 で追随済み**（`00bdd15`） | モック無し。**P2 で #9 タイル列数・#18 sectionhead・#38 会計3段・#39 併用導線を同基準で波及**（#16 は kiosk に void が無く対象外・#22 は明細に一括削除の器が無く見送り）。**`/register` を触ると追随判断が必ず発生**（前例＝UI刷新v2 で register 改修後に kiosk 追随を別コミット・E6 も同型）。低在庫「残N」・着卓キャスト顔は 0059 が返さない＝非改変を優先（裁定18） |
| 21 | `app/kiosk/page.tsx` | キオスク | **小** | PIN 認証面。E6 適用済み |
| 22 | `app/(manage)/master/products/page.tsx` | マスタ残り | **小** | 純増⑤で実装・**レーン② でルート化済み**（分割の前例1） |
| 23 | `app/(manage)/master/categories/page.tsx` | マスタ残り | **小** | mig0063・**レーン③ でルート化済み**（分割の前例2） |
| 24 | `app/(manage)/master/stock/page.tsx` | マスタ残り | **小** | 在庫台帳 v1（純増①）・同上 |
| 25 | `app/(manage)/master/cast-comp/page.tsx` | M2待遇 | **対象外** | **DP1-④** |
| 26 | `app/(manage)/master/cast-comp/plan/page.tsx` | M2待遇 | **対象外** | **DP1-④** |
| 27 | `app/(manage)/master/cast-comp/deduction/page.tsx` | M2待遇 | **対象外** | **DP1-④** |
| 28 | `app/(manage)/master/cast-comp/norma/page.tsx` | M2待遇 | **対象外** | **DP1-④** |
| 29 | `app/(manage)/master/cast-comp/register/page.tsx` | M2待遇 | **対象外** | **DP1-④**。※`M7`（キャスト会計許可のチェックボックス無反応）は**バグではなく仕様の防御**＝`casts.user_id` が null で membership が無いため（裁定書 §4-1）。「未招待」バッジの追加は app のみで可 |
| 30 | `app/mine/page.tsx` | cast 面 | **小** | 別デザイン系統・モック無し。「1位まであと3件」は他人の数字＝作らない（裁定18） |
| 31 | `app/mine/notices/page.tsx` | cast 面 | **小** | 同上 |
| 32 | `app/mine/ranking/page.tsx` | cast 面 | **小** | 同上 |
| 33 | `app/mine/wishes/page.tsx` | cast 面 | **小** | 同上 |
| 34 | `app/login/page.tsx` | 認証 | **小** | D0 期の移行のまま |
| 35 | `app/(manage)/billing/page.tsx` | 課金 app | **小** | ⑥で新設（`9e9c4a9`）。**E レーンの検収を受けていない** |
| 36 | `app/(manage)/receipts/page.tsx` | R2-c | **小** | mig0099 で新設（`71c134c`）。**E レーンの検収を受けていない** |

※ #15〜#36 は 22行だが、`/master`（ハブ）を D型側（#14）に置いたため **B型の実ルートは 19**
（#15〜#24 の10 ＋ #25〜#29 の5 ＋ #30〜#36 の7 = 22 のうち、cast-comp 5本を「対象外」として
別掲すると実質 17）。**集計は下表 1-4 の定義に従う。**

### 1-4. 集計

| 型 | ルート数 | 変換規模の内訳 |
|---|---|---|
| **A**（実装あり・モックあり） | **10** | 大 2（shift=対象外／notices=他レーン依存）／中 2（register・casts）／小 6 |
| **D**（ルート分割対象＋ハブ） | **4** | 中 2（seats・system）／小 2（business-hours・ハブ後始末） |
| **B**（実装あり・モックなし） | **19** | 中 1（kiosk-register＝register 従属）／小 13 ／不触 3（payroll・r/[token]・app/page.tsx）／対象外 5（cast-comp）※対象外は「小」に計上しない |
| **C**（実装なし・モックあり） | **0** | — |
| **合計** | **33** | |

**mock 13枚の帰着**: **10枚が A型10ルートへ**（customer-management のみ一覧＋詳細の2ルートへ）＋
**3枚が D型の新設3ルートへ**。**分割後は 13枚すべてが 1:1 になる**（S1-5 の訂正＝
`nox-staff-system-settings` は `/staff` を含まないため、1:1 崩れが解消する）。

**DP1 の実作業が発生するルート＝6本**: `/register`（中）・`/casts`（中）・
`/master/seats`（中）・`/master/system`（中）・`/master/business-hours`（小）・`/master`（ハブ後始末・小）
＋ 従属で `/kiosk-register`（中・register を触った場合のみ）。

**★E レーン検収の空白**: `/billing`・`/receipts`・`/r/[token]` の3ルートは E 完走（2026-08-17）より後に
新設され、E0〜E8 の検収を通っていない。DP の目視対象に初回として含める必要がある。

---

## 2. 別表：14枚目（M2待遇モック）＝**DP 対象外**

| 項目 | 内容 |
|---|---|
| ファイル | `mock/pages-2026-08/nox-cast-compensation-all-in-one.html` |
| sha256 | `899e51000b21f705bf9d704bcc5e1099830ab5e6b54f63aa3ffc96e76999f455`（39,474 bytes / 665 行） |
| 位置づけ | **M2待遇 canonical**（待遇オールインワン・money-core 級）。**M2待遇レーン所属**（DP0-1 / DP1-④） |
| 型 | **D**（1モック → `/master/cast-comp` 4ページ）。※「C・実装なし」ではない＝4ページは D2 レーンで実装済み（`e87a135`・mig0086） |
| **トークン多数決** | **母数外**（DP0-1）。E1 の 13枚多数決を据え置き＝`--card2 #22221e` / `--ink #f3f0e8` は**現行値維持** |
| 母数外にした影響（実測・記録のみ） | 14枚を母数にすると `--panel3` は `#20201c` が 7:6、`--text` は `#f5f1e7` が 7:6 で**単独最多になり2値が反転する**。DP0-1 はこれを**採らない**という裁定 |
| 14枚目 固有の逸脱（記録のみ） | `.card` の `border-radius` が **10px**（他13枚は 11px・現行 `radius.card=11` は据え置き）／`--shadow` が `0 12px 34px rgba(0,0,0,.28)`（他は 18px 系）／`--blue` 宣言なし／`.cardhead p` が 8px ／整形が pretty-print（平均行長 59・他13枚は 201〜1081） |
| 節構成（h1/h2/h3 逐語） | 全体構成／採用する待遇方式／基本給・保証／売上歩合・各種バック／ポイント制・ポイントスライド／売上スライド／シミュレーション／ノルマ／サマリー／出力 |
| 語彙の実装側 有無 | **有**: 保証・バック・ポイントスライド・売上スライド・シミュレーション・ノルマ ／ **無**: 「基本給」「歩合」「待遇方式」（NOX は 保証/バック/スライド の語彙体系） |
| 台帳 | `mock_pages-2026-08_sha256.txt` への追記は **未実施**（前回 DP1 指示の破棄に伴い revert 済み）。追記文面案は `docs/tmp/dp0_survey.md` §S6-3 |
| DP レーンでの扱い | **構造・意匠とも対象外**。`/master/cast-comp` 4ルートは B型「対象外」＝**1枚統合への IA 変更は行わない**（D2 の分割裁定を覆さない） |

---

## 3. DP1 が前提にしてよいこと / DP2 へ送るもの

**DP1（構造変換）＝完了した作業単位**

| P | 内容 | commit |
|---|---|---|
| **P1** | `/master` の3ルート分割（DP1-②/⑥/⑦）＝`/master/seats`・`/master/business-hours`・`/master/system` 新設＋`system` の4タブ再編＋ハブ後始末。**リダイレクト不要**（旧3ビューは URL を持たなかった） | `f653639` |
| **P2** | `/register` の **b 6件**（DP1-①/⑧/⑪）＋`kiosk-register` への従属波及。**c 1件は不採用**（v3 優先）・**d 3件は起票記録のみ** | `00bdd15` |
| **P3** | `/casts` の `casts#9` 登録フロー集約（DP1-⑨）＝モーダル化＋登録後の項目を同じ面へ | `19e3d18` |
| **P4** | 文書是正（DP1-⑩/⑤/⑪）＝ガイド §11-6-DP1・`register#1` 解消・d 3件の起票記録・本表の訂正 | 本コミット |

**★DP1 で確定した事実（DP2 が前提にしてよいこと）**

1. **mock 13枚は分割後すべて 1:1 対応**（`nox-staff-system-settings` は `/staff` を含まない＝
   `/master/system` のみに対応。`/staff` はモック無しの B型）。
2. **money 経路は逐語不変**＝`check_pay` / `check_close` / `check_remove_line` /
   casts の RPC 6経路は関数本体・呼び出し式の sha256 照合で不変を証明済み。
3. **`/payroll`・`/r/[token]`・`app/page.tsx` は不触**を維持（DP1-③ ほか）。
4. 新規に足した CSS は **`.nox-seatgrid.floor`（3行）と `.nox-field2 > .full`（1行）のみ**＝
   新しい色も新しい部品も作っていない。

**DP2（意匠仕上げ）へ送るもの**

1. フォント（DP0-6）＝`--font-sans` / `--font-serif` の2語彙化
2. 生 hex（DP0-3）＝金暗面3色のトークン化＋`theme.ts` の旧 `--bg` 削除＋`globals.css` の残置
3. spacing（14枚とも全てリテラル・`gap` は 4〜12px に密集）
4. 分析ビューの内部用語3語（DP0-2）
5. `/billing`・`/receipts`・`/r/[token]` の初回検収
