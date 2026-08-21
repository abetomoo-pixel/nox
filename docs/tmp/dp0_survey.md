# DP0 調査（#7.5 デザイン移植レーン・読み取り専用・2026-08-21）

前提（本調査で受領した用語定義・恒久）:

- **本レーン = 「#7.5 デザイン移植」**（2026-08-20 前倒し裁定）。内部段は **DP0/DP1/DP2**（Design Port）。
  repo 既存の **D0（2026-07 ダーク移行）・E レーン（E0〜E8）とは別物**。
- **canonical = `mock/pages-2026-08/`（HTML 14枚）**。v1.2.0 design-master は不使用へ降格済み。
- **「M2待遇」= 待遇オールインワン**（canonical `nox-cast-compensation-all-in-one.html`・
  sha `899e5100…f455`・money-core 級・本レーン対象外）。repo の M2（マイページ段・完了済み）とは別物。
- **DP レーンの目的 = 見た目トークンの統一と画面変換のみ**。機能実装（M2待遇含む）は一切含まない。

**★裁定欄（2026-08-21 追記・確定）**

| 裁定 | 内容 |
|---|---|
| **DP0-1** | 14枚目 = **D型・M2待遇レーン所属・DP 対象外**。トークン多数決母数 = **13枚**（E1 据え置き）。`--card2 #22221e` / `--ink #f3f0e8` は現行値維持 |
| **DP0-2** | アバター色 = I2 据え置き（**恒久対象外**）。DP2 是正 = **分析ビューの内部用語のみ** |
| **DP0-3** | 生 hex 是正対象 = `theme.ts` の旧 `--bg` 削除 ＋ 金暗面3色 ＋ 残り。**意図的3件は据え置き** |
| **DP0-4（改訂）** | **`mock/pages-2026-08` は構造 canonical**。**DP1 で実装の IA・レイアウト・動線をモックへ寄せる**（BANZEN mock v2 と同じ扱い）。※初版の「/master = 実装 IA が正・見た目のみ」は本改訂で**上書き** |
| **DP0-5** | 対応表 = **33ルート基準** |
| **DP0-6** | フォント = モック準拠へ変更。sans = **Inter + Noto Sans JP** ／ serif = **Lora + Noto Serif JP**（旧 Georgia 役＋旧 Yu Mincho 役を一本化）。Outfit / Zen Kaku Gothic New / Cormorant Garamond は canonical から降格 |
| **DP1-①** | `/register` = **モック構造へ追随**。ただし **v3 動線**（卓選択→全画面切替・「← Floor」・会計後自動復帰）は**確定裁定**＝モックと衝突する箇所は **v3 優先** |
| **DP1-②** | `/master` = **モックの3画面分割へ追随＝ルート分割**（business-hours / seat-table / staff-system を個別ルート化） |
| **DP1-③** | `/payroll` = **裁定18 維持・構造も不触** |
| **DP1-④** | `cast-comp` 4ページ = **M2待遇レーン扱い・DP 対象外** |

**★レーン再編（2026-08-21）**: **DP1 = 構造変換** ／ **DP2 = 意匠仕上げ**。
フォント（DP0-6）・生 hex（DP0-3）・spacing は **DP2 へ後送**。
※本ファイルの S2〜S5 の記述は DP0 調査時点のもので、レーン割りの記述のみ本追記が優先する。

本ファイルは **DP0 の調査記録のみ**。実装・トークン起草・commit は行っていない。
本ファイルの作成以外にファイル変更なし。

**★申告（重要）**: 本調査の指示に含まれていた「E7」「v9」「D0 調査の6論点」という記号は
**repo 内に一切存在しない**（`grep -rn "E7|v9" docs/` = 0件）。相談役側の別番号体系と判断し、
**記号ではなく実体（ファイル・行・実測値）で特定**して記録した。S5 と S6 に食い違いがあるため各節に明記した。

---

## S1) 画面対応目録（4象限の原資料）

### S1-1. 判定の定義（本調査で採った運用）

- **A** = 実装あり・モックあり（1:1 で対応・変換対象候補）
- **B** = 実装あり・モックなし → **モック行には原理的に立たない**ため、S1-4 に「実ルート側の一覧」として別掲した
- **C** = 実装なし・モックあり
- **D** = 判定困難（1画面に複数モック／1モックに複数画面）

### S1-2. mock 14枚 → 実装ルート（実測）

| # | mock ファイル | `<title>` | 対応する実装ルート | 型 |
|---|---|---|---|---|
| 1 | nox-analytics-dashboard.html | NOX \| 売上・店舗分析 | `app/(manage)/analytics/page.tsx` | **A** |
| 2 | nox-announcement-management.html | NOX \| お知らせ・LINE通知 | `app/(manage)/notices/page.tsx` | **A** |
| 3 | nox-audit-management.html | NOX \| 監査・操作履歴 | `app/(manage)/audit/page.tsx` | **A** |
| 4 | nox-business-hours-settings.html | NOX \| 営業時間・定休日 | `app/(manage)/master/business-hours-panel.tsx`（`/master` の `hours` ビュー・**独立ルート無し**） | **D** |
| 5 | nox-cast-compensation-all-in-one.html | NOX \| キャスト待遇オールインワン | `app/(manage)/master/cast-comp/{plan,deduction,norma,register}/page.tsx`（**4ページ**） | **D** |
| 6 | nox-cast-management.html | NOX \| キャスト管理 | `app/(manage)/casts/page.tsx` | **A** |
| 7 | nox-customer-management.html | NOX \| 顧客管理 | `app/(manage)/customers/page.tsx` ＋ `customers/[id]/page.tsx` | **A** |
| 8 | nox-daily-report.html | NOX \| 日報・締め管理 | `app/(manage)/report/page.tsx` | **A** |
| 9 | nox-payroll-management.html | NOX \| 給与管理 | `app/(manage)/payroll/page.tsx` | **A** |
| 10 | nox-pricing-settings.html | NOX \| 料金設定 | `app/(manage)/master/pricing/page.tsx` | **A** |
| 11 | nox-register-pos.html | NOX \| レジ | `app/(manage)/register/page.tsx`（従属＝`app/kiosk-register/page.tsx`） | **A** |
| 12 | nox-seat-table-settings.html | NOX \| 席・卓 | `app/(manage)/master/master-board.tsx`（`/master` の `seat` ビュー・**独立ルート無し**） | **D** |
| 13 | nox-shift-management.html | NOX \| シフト管理 | `app/(manage)/shift/page.tsx` | **A** |
| 14 | nox-staff-system-settings.html | NOX \| スタッフ・システム | `app/(manage)/staff/page.tsx` ＋ `/master` の `system` ビュー（kiosk-panel / printer-panel / sensitive-tax-panel） | **D** |

### S1-3. 4象限 集計

| 型 | 枚数 | 内訳 |
|---|---|---|
| **A**（実装あり・モックあり） | **10** | #1 #2 #3 #6 #7 #8 #9 #10 #11 #13 |
| **B**（実装あり・モックなし） | **0**（モック行として） | ※実ルート側では **16ルート**（S1-4） |
| **C**（実装なし・モックあり） | **0** | — |
| **D**（判定困難） | **4** | #4 #5 #12 #14 |

**D の内訳（崩れ方の型）**

- **複数モック → 1画面**: `/master` が **3枚**（#4 営業時間・#12 席卓・#14 スタッフ/システムの一部）の対応先。
  `/master` はハブ＋ビュー切替（`master-board.tsx` の `MasterView` = `seat` / `hours` / `system`）で、
  対応するモックごとの独立ルートが存在しない。
- **1モック → 複数画面**: #5 待遇オールインワンが **4ページ**（`/master/cast-comp/plan|deduction|norma|register`）へ、
  #14 が **2画面**（`/staff` ＋ `/master` system ビュー）へ割れる。
  #5 の 1:4 は **D2 レーンで意図的に IA 分割した結果**（memory `nox-cast-comp-lane` / 2026-08-08 push `e87a135`）。

### S1-4. B＝実装あり・モックなし（実ルート側 16件）

| ルート | 既存ロードマップ上の所属 |
|---|---|
| `/master/products` | マスタ残り（商品マスタ群・純増⑤で実装済み） |
| `/master/categories` | マスタ残り（同上・mig0063） |
| `/master/stock` | マスタ残り（在庫台帳 v1・純増①） |
| `/master`（ハブ本体） | マスタ残り（D 型の受け皿） |
| `/mine` `/mine/notices` `/mine/ranking` `/mine/wishes` | cast 面（別デザイン系統・2026-08 モック無し） |
| `/kiosk` `/kiosk-register` | キオスクレーン（旧モック `mock/nox-kiosk-mock-planB-viewswitch.html` のみ） |
| `/dashboard` | ホーム（UI刷新v2 段H2 で実装・2026-08 モック無し） |
| `/login` | 認証（D0 期に移行済み） |
| `/billing` | **課金 app レーン**（⑥で新設・2026-08-20 `9e9c4a9`。E レーン当時は未作成） |
| `/receipts` | **R2-c 領収書レーン**（mig0099・2026-08-20 `71c134c`。E レーン当時は未作成） |
| `/r/[token]` | **R2-c 匿名公開面**（NOX 初 anon 面・**白地黒字の帳票トーン＝画面パレット対象外の裁定済み**） |
| `app/page.tsx` | F0 公開トップ placeholder（**未移行ライト**＝`.nox-dark` 圏外・D2残差リスト #27 で対象外） |

**★実ルート総数の変化**: E レーン当時のガイド §5 は「実ルート **30**」。
現在は **page ルート 33本**（`(manage)` 24＋その他 9）＝ **+3**（`/billing`・`/receipts`・`/r/[token]`）。
DP レーンの画面対応表は **30 ではなく 33 を母数に引き直す必要がある**。

**★C が 0 である点の申告**: 本調査の指示 S6 は 14枚目を「C・マスタ残りレーン所属」と想定していたが、
**実測では対応する4ページが実在し実装済み**のため C にはならない（詳細は S6-2）。

---

## S2) 現行トークンの実態

### S2-1. 定義箇所（実測）

| 層 | 実体 | 実測値 |
|---|---|---|
| グローバル CSS | `app/globals.css` | **1,930行**・`.nox-*` ルール **630本**・クラス種 **217**・`@media` **69**・`var(--*)` 参照 **394** |
| CSS 変数（ライト） | `app/globals.css:7` `:root` | **2個のみ**（`--ink:#171717` / `--bg:#fafafa`）＝未移行画面用 |
| CSS 変数（ダーク） | `app/globals.css` `.nox-dark` | **変数定義 45個**（canonical 13＋追加＋v2 サブトークン） |
| フォント読込 | `app/globals.css:5` `@import` Google Fonts | **Cormorant Garamond / Outfit / Zen Kaku Gothic New** |
| JS 側プリミティブ | `lib/nox/ui/theme.ts`（252行） | `radius`（7値）・`font`（3値）・CSSProperties プリミティブ群 |
| Tailwind | **不使用** | `tailwind.config.*` / `postcss.config.*` **とも存在しない**（純 CSS＋inline style 構成） |

- `theme.ts` の色は **すべて `var(--x)` 文字列参照**。raw hex の `colors` オブジェクトは
  E3 で削除済み（参照ゼロの死にコードかつ drift 発生源だったため）。
- `theme.ts:27` `radius = { card:11, kpi:11, btn:7, btnSm:7, input:6, pill:999, icon:8 }`
  ＝ **E3 でモック実測値へ整合済み**。
- `theme.ts:29-33` `font = { brand: Cormorant Garamond / num: Outfit / ui: Zen Kaku Gothic New }`。

### S2-2. インライン・リテラルの散在（実測）

`app/` `lib/` `components/` の `.ts/.tsx` 内 6桁 hex リテラル = **38箇所 / 12ファイル**。
うちコメント内（歴史記録）を除いた **live は 14箇所**：

| 値 | live 箇所 | 意味 |
|---|---|---|
| `#1F1B12` | casts-board:404 / customers-board:416 / pricing-board:560 / time-pricing-panel:28 / payroll-board:391 / **theme.ts:231** | 選択状態の「金の暗面」地 |
| `#14120C` | pricing-board:560 / time-pricing-panel:28 | 同グラデの暗端 |
| `#1B1710` | customers-board:621 / customers-board:759 / mine/ranking:54 | 選択行・選択チップの金暗面 |
| `#0B0B0F` | **theme.ts:231**（`logo` のグラデ終端） | **旧 `--bg`** |
| `#080808` | app/layout.tsx:34（`viewport.themeColor`） | 意図的（メタデータは CSS var 不可・`--bg` と同値） |
| `#f4f2ee` `#1a1a1a` | app/r/[token]/page.tsx:38 | 意図的（帳票トーン＝画面パレット対象外の R2-c 裁定） |

**★E レーンの申告との差**: ガイド §11-5 は「**旧パレットのリテラルは残ゼロ**
（意図的リテラルは `viewport.themeColor` のみ）」と記載しているが、実測では
**`theme.ts:231` の `logo` に旧 `--bg` の `#0B0B0F` が live で1件残っている**。
E4 の是正辞書は `#C9A24A / #23232B / #0B0B0F / #B8893A` の4色だったので、
`#1F1B12 / #14120C / #1B1710`（金暗面3色・計10箇所）は**そもそも辞書外＝未計上**。
DP レーンで「トークン層の単一ソース化」を目標にするなら、この
**live 14箇所（意図的3件を除き 11箇所）** が対象母数。

### S2-3. `docs/tmp/design_tokens_draft.md` の内容要約と現状との差分

- **正体**: 「デザイン適用レーン **E0** プリフライト（読み取り専用・2026-08-17）」。
  対象は **13枚**（14枚目は含まれない）。**DP レーンの成果物ではない**。
- 構成: §1 トークン実測と13枚間の不整合／§2 画面対応表（13モック↔実ルート**30**）／
  §3 現 CSS 構成／§4 レジの構造差／§5 段方式の起案 ＋ 後半に「E1 着手前の停止報告」
  （A 確定17値／B 未決＝停止事由／C 対応表／D 影響量）。
- **最重要の所見**（§1-1）＝「モックと現行アプリは**別パレット**」。
- **現状との差分（＝この草案は既に消化済み）**:
  - §1 の確定17値 → **E1 で `.nox-dark` へ適用済み**（`globals.css` の E1 コメント群が出典を逐語で保持）。
  - §2 の画面対応表（母数30） → **現在33ルート**（S1-4 の +3）。**要更新**。
  - §3 の CSS 実測（1,680行・518本・162種） → **現在 1,930行・630本・217種**（E2〜E8 で増加）。**要更新**。
  - §253 の `--v2-ava`（アバター地 `#2A2A36`）＝**未裁定のまま残置**（S5-1 参照）。
- **モック側トークンとの差分の有無**: 色13トークンは E1 で 13枚のモック語彙へ**適用済み＝差分なし**。
  ただし **14枚目を母数に入れると2値が反転する**（S3-2）。フォント・spacing は**未適用＝差分あり**。
- **結論**: `design_tokens_draft.md` は **DP0 の代用にはならない**（13枚前提・母数陳腐化）。
  ただし **抽出手法（多数決＋tiebreaker＋裁定）は再利用可能**。

---

## S3) mock 14枚のトークン抽出

### S3-1. `:root` カラートークン（14枚 実測・全列挙）

| トークン | 最頻値 | 一致数 | 振れ幅（少数派の実測値） |
|---|---|---|---|
| `--bg` | `#080808` | **14/14** | （唯一の全枚一致） |
| `--panel` | `#11110f` | 6/14 | `#141412`(4) `#121210`(3) `#10100f`(1) |
| `--panel2` | `#181815` | 5/14 | `#1a1a17`(3) `#191916`(3) `#171714`(2) `#1b1b18`(1) |
| `--panel3` | **`#20201c`** | **7/14** | `#22221e`(6) `#23231f`(1) |
| `--line` | `#2d2c27` | 6/14 | `#302f2a`(4) `#2e2d28`(2) `#2c2b25`(1) `#2f2e29`(1) |
| `--line2` | `#3b3931` | 5/14 | `#403d34`(3) `#464238`(3) `#454137`(1) `#3a382f`(1) `#403e36`(1) |
| `--gold` | `#d8ad55` | 10/14 | `#d8ac53`(2) `#d8ac52`(1) `#d7aa50`(1) |
| `--gold2` | `#f0cf82` | 7/14 | `#f0ce7e`(3) `#f0ce80`(3) `#f0cd7d`(1) |
| `--goldbg` | `rgba(216,173,85,.1)` | 7/14 | `.10` 表記1（同値・逐語差）／`rgba(216,172,83,.11)`(2) 他 |
| `--text` | **`#f5f1e7`** | **7/14** | `#f4f1e9`(6) `#f3f0e8`(1) |
| `--muted` | `#99978f` | 7/14 | `#99958c`(3) `#96938b`(3) `#99958d`(1) |
| `--green` | `#77ba83` | 7/14 | `#74bd87`(2) `#74be88`(1) `#78bd86`(1) `#79bd86`(1) `#76bd88`(1) `#76bd85`(1) |
| `--red` | `#d86c64` | 7/14 | `#dc746d`(3) `#dc746c`(1) `#dd746d`(1) `#dc756c`(1) `#df756c`(1) |
| `--shadow` | `0 18px 55px rgba(0,0,0,.35)` | 8/14 | `…60px …35`(3) `…55px …34`(2) `0 12px 34px rgba(0,0,0,.28)`(**1＝14枚目のみ**) |
| `--blue` | `#74a6d8` | 4/13 | **14枚目は宣言なし**・ほか `#75a8d3`(2) `#73a6d2` `#74a5d4` `#77a8d6` `#77a9d5` `#75a6d5` |
| `--orange` | `#df9956` | 2/14 | `#df9a55`(1)・宣言は3枚のみ |
| `--purple` | — | 3枚が別値を宣言 | `#ae85c3` `#ba83c6` `#b785c0`（**参照ゼロ＝裁定3で不採用**） |
| `--linegreen` | `#06c755` | 1/14 | announcement のみ（LINE ブランド色） |

### S3-2. ★14枚目の投入が既存裁定を動かす2件（DP レーンの中核論点）

E1 は **13枚の多数決**で確定した。14枚目を投票母数に入れると**2トークンで結論が反転する**：

| トークン | 現行アプリ値（E1 確定） | 13枚での根拠 | **14枚にすると** |
|---|---|---|---|
| `--card2`（モック `--panel3`） | `#22221e` | 同数 **6:6** → register-pos tiebreaker | `#20201c` が **7:6 で単独最多**＝**tiebreaker 消滅・値が変わる** |
| `--ink`（モック `--text`） | `#f3f0e8` | 同数 **6:6** → register-pos tiebreaker（＝register 自身の値・13枚中 **1枚のみ**の値） | `#f5f1e7` が **7:6 で単独最多**＝**tiebreaker 消滅・値が変わる** |

その他のトークンは 14枚目を入れても最頻値が変わらない（一致数が +1 されるのみ）。

**論点**: 14枚目は「M2待遇＝本レーン対象外」と定義されている。
- 選択肢(a) **投票母数から除外**（対象外なので見た目の投票権も持たない）＝現行の `#22221e` / `#f3f0e8` を維持
- 選択肢(b) **投票母数に含める**（canonical は14枚と定義された以上パレットの出典でもある）＝2値を張り替え
- 選択肢(c) **tiebreaker 規則自体を見直す**（register-pos 優先は 13枚時代の便宜。DP では別基準を置く）

### S3-3. 枚数間の不整合（色以外）

| 観点 | 実測 |
|---|---|
| `.card` の `border-radius` | **13枚 = 11px / 14枚目のみ = 10px**（唯一の逸脱）。現行 `theme.ts radius.card = 11` |
| `.btn` の `border-radius` | **14/14 = 7px**（完全一致）。現行 `radius.btn = 7` と一致 |
| `.card` の背景 | 全枚 **リテラルのグラデ**（トークンではない）。値は枚ごとに微差。<br>register `linear-gradient(145deg,rgba(25,25,22,.95),rgba(15,15,14,.98))` / cast-management `rgba(24,24,21,.93)…` / 14枚目 `rgba(24,24,21,.96),rgba(14,14,13,.98)` |
| `border-radius` 全体の頻出値 | `8px` / `7px` / `6px` / `50%`（アバター）/ `20px`（ピル）。**`--radius` トークンは 14枚とも存在せず全てリテラル** |
| `gap` 全体の頻出値（14枚合算） | `7px`(60) `10px`(59) `8px`(48) `11px`(46) `9px`(37) `12px`(35) `16px`(18) `6px`(17) `5px`(13) `4px`(11)<br>＝**4〜12px に密集・spacing スケールは未定義（トークン化されていない）** |
| ファイル整形 | 13枚は minify 寄り（平均行長 **201〜1081**）。**14枚目のみ pretty-print（平均行長 59・665行）**＝別系統の出力 |
| `.cardhead p` の文字サイズ | 14枚目は **8px**（`.cardhead h2` は 12px）＝可読性ルール（最小可読サイズ）との整合は要確認 |

### S3-4. フォント指定（逐語・全14枚）

**mock 側に Web フォント読込は存在しない**（`fonts.googleapis.com` の参照 **0件 / 14枚**）＝端末インストール依存。

| 逐語の指定 | 出現 |
|---|---|
| `font-family:Inter,"Noto Sans JP","Yu Gothic UI",sans-serif` | **14/14枚**（各1回・body 基底） |
| `font-family:Georgia,serif` | **10/14枚**（多くは2回・register-pos のみ3回）※非出現＝analytics / announcement / audit / **14枚目** |
| `font-family:"Yu Mincho","Hiragino Mincho ProN",serif` | **register-pos のみ 1回** |

**NOX canonical との対照**

| 役 | NOX canonical（`globals.css:5` ＋ `theme.ts:29-33`） | mock canonical（14枚実測） | 判定 |
|---|---|---|---|
| ブランド／見出し serif | `'Cormorant Garamond', serif` | `Georgia, serif` | **相違** |
| 数値 | `'Outfit', sans-serif` | （専用指定なし＝body の Inter を継承） | **相違**（mock に数値専用フォントの層が無い） |
| UI 和文 | `'Zen Kaku Gothic New', sans-serif` | `Inter,"Noto Sans JP","Yu Gothic UI"` | **相違** |
| 帳票 明朝 | （該当なし） | `"Yu Mincho","Hiragino Mincho ProN",serif`（register-pos のみ） | **mock 側にのみ存在** |
| 配信方法 | Google Fonts `@import`（3ファミリ） | **読込なし**（端末依存） | **相違** |

→ **フォントは3役すべて不一致・配信方法も不一致**。裁定台帳:391 が既に
「フォント/厳密 hex は **Agoora 裁定点**」と明記しており、**DP レーンでも未裁定のまま**。

選択肢（列挙のみ）:
- (a) **NOX 現行を維持**（Outfit＋Zen Kaku＋Cormorant）＝mock は色・構造のみ採用
- (b) **mock 逐語へ寄せる**（Inter＋Noto Sans JP＋Georgia）＝Web フォント読込を廃し端末依存にする
- (c) **役ごとに分ける**（例: 和文は Zen Kaku 維持・serif のみ Georgia へ・数値は Outfit 維持）
- (d) mock の指定は**フォールバック列の記述に過ぎない**と解釈し、Google Fonts で近い実体を当てる
  （Inter は Google Fonts に存在・**Georgia は存在しない**＝serif の代替選定が別途必要）

---

## S4) E レーン成果物との関係

### S4-1. E レーンの到達点（実測）

E0〜E8 は **13枚を canonical として完走・クローズ済み**（memory `nox-design-e-lane`・2026-08-17 push `4019e08`）。

| 段 | 到達内容 | 現物の痕跡 |
|---|---|---|
| **E1** | `.nox-dark` の**トークン値を13枚のモック語彙へ全面差し替え**＋不足追加 | `globals.css:38-` に出典・多数決・tiebreaker をコメントで逐語保持 |
| **E2** | 共通シェル（サイドバー238px グリッド・topbar・brand 移設・sidefoot） | `app/(manage)/layout.tsx` の E2 コメント＋`.nox-layout` |
| **E3** | 共通部品（`.btn` `.card` `.cardhead` `.field` `.kpi` `.modal*`）＋**radius をモック実測へ**＋`colors` 削除 | `theme.ts:21-27` |
| **E4** | 非金銭ページ群（`/casts` `/customers` `/notices` `/audit` `/analytics` `/shift` `/master` 系）＋`.nox-inset` `.nox-listrow` 新設 | `docs/tmp/e4_gaps.md` |
| **E5** | 金銭画面（`/register` → `/payroll` → `/report`）＋`--champ` 再裁定＋`--bad-*` 3トークン新設 | `docs/tmp/e5_gaps.md` |
| **E6** | キオスク追随（`/kiosk` `/kiosk-register`）＋E1 取り残しリテラルの最終是正 | `kiosk-register:680` の E6 コメント |
| **E8** | 構成差の裁定と実装（`docs/NOX_E8裁定_v1.md`・60件採用）＋T4 集計結線（mig0096） | `docs/tmp/e8_gap_matrix.md` |

### S4-2. 画面単位の残差の大きさ（DP 変換の目安）

指標＝`.nox-*` クラス採用数と `var(--*)` 参照数（E 部品への寄せ具合の代理指標）＋ S1 の型。

| 画面 | nox-class | var() | 型 | **DP 変換の差分** | 根拠 |
|---|---|---|---|---|---|
| `/master`（3ビュー） | **143** | **241** | D | **大** | 3枚のモックが1画面に集約＝IA の割り当てそのものが未確定 |
| `/register` | 64 | 150 | A | **大** | ガイド §7＝**機能差ではなく UI 構成差**（モックは画面内3〜4モード／現行はタブ2値・会計3段 vs 2段）。E5 裁定0 で「追随しない」＝DP で再裁定になる |
| `/shift` | 57 | 53 | A | **中** | E4 適用済み。モック側の月間カレンダ・週間グリッドは「純増起票」で対象外裁定（裁定18） |
| `/analytics` | 47 | 67 | A | **中** | E8-6 で4ビュー化・T4 結線済み。残はプレースホルダ2枠と内部用語（S5-2） |
| `/casts` | 36 | 33 | A | **小〜中** | E4 適用済み |
| `/report` | 32 | 76 | A | **中** | E5 適用済み。締め workflow は構造保持 |
| `/customers` | 30 | 64 | A | **小〜中** | E4 適用済み |
| `app/kiosk-register` | 26 | 64 | B | **中** | 2026-08 モック無し＝register の従属追随（E6 と同じ構造依存） |
| `app/mine` 4頁 | 27 | 60 | B | **中** | cast 面＝別デザイン系統・モック無し |
| `/payroll` | 21 | 78 | A | **小**（ただし**触れない**） | **段D payroll＝対象外裁定**（裁定18）＝印刷 CSS が直下構造に依存・money 表示中枢 |
| `/dashboard` | 21 | 8 | B | **中** | モック無し。`var()` 8 と低く**部品化が最も薄い**画面 |
| `/audit` | 10 | 16 | A | **小** | E4 適用済み・現行 canonical |
| `/notices` | 8 | 7 | A | **小**（ただしモック側過剰） | モックは **LINE 配信 UI を含む＝未実装機能**。見た目のみ移植すると空の器になる |
| `/staff` | 6 | 16 | D | **中** | 1モック↔2画面 |
| `/receipts` | 6 | 9 | B | **小** | R2-c 新設・E レーン後発＝E 部品を最初から使用 |
| `/billing` | 4 | 4 | B | **小** | 課金 app ⑥ 新設・E レーン後発 |
| `app/kiosk` | 4 | 16 | B | **小** | PIN 認証面 |
| `app/login` | 2 | 3 | B | **小** | D0 期の移行のまま |
| `app/r/[token]` | 0 | 0 | B | **対象外** | 白地黒字の帳票トーン＝**画面パレット対象外の裁定済み**（R2-c） |
| `app/page.tsx` | 0 | 0 | B | **対象外** | F0 プレースホルダ・未移行ライト（D2残差 #27） |

### S4-3. E レーンと DP レーンの関係についての所見

- **色トークン層は E1 で既に mock/pages-2026-08 準拠**。DP1（トークン層起草）は
  **ゼロからの起草ではなく**、①14枚目の投票権の裁定（S3-2 の2値）②フォント裁定（S3-4）
  ③spacing/radius をトークン化するか否か（現状 14枚ともリテラル）── の3点が実質的な争点。
- **構造（画面変換）は E4〜E8 で13枚分が消化済み**。DP2 で新規に発生するのは
  **D 型4枚の IA 裁定**と、**E で「追随しない」と裁定した項目の再裁定**（レジ構成差＝ガイド §7・E5 裁定0）。
- **E レーン後に新設された3ルート**（`/billing` `/receipts` `/r/[token]`）は E の検収を受けていない。

---

## S5) 「E7 是正2件」の所在（位置特定のみ）

**★申告**: `grep -rn "E7" docs/` = **0件**。repo に E7 という段は存在しない
（E レーンの実体は E0〜E6 ＋ E8）。以下は**実体で特定**した2件。

### S5-1. アバター色

| 項目 | 実測 |
|---|---|
| **生成ロジック** | `lib/nox/ui/theme.ts:43-48` `avatarBg(name)` |
| **中身** | name のハッシュ → `hue = h % 360` → `linear-gradient(135deg, hsl(hue 42% 58%), hsl((hue+36)%360 38% 42%))` ＝**360色の虹**。パレット外 |
| **頭文字** | `theme.ts:39-42` `avatarInitial(name)` |
| **表示クラス** | `globals.css` の `.nox-ava` / `.nox-ava2` / `.nox-avachip` / `.nox-avarow` |
| **部品** | `components/ui/cast-avatar.tsx` |
| **関連トークン** | `--v2-ava: #2A2A36`（`globals.css` の v2 サブトークン・**非モック由来**・参照 4箇所） |
| **既存の裁定** | `docs/tmp/e5_gaps.md` **I2 節**＝「**是正対象外**（identicon・同名同色の決定性が意匠）・パレット走査から**恒久に外す**」 |
| **未裁定で残る選択肢** | `docs/tmp/design_tokens_draft.md:253`＝「(a) `--card2`(`#22221e`) に寄せる (b) 現行維持」 |
| **モック側の実体** | 14枚に `--v2-ava` 相当の値は**無い**（`#2A2A36` は 14枚のどこにも出現しない） |

**★食い違いの申告**: 本調査の指示は「アバター色は **D レーンへ吸収済み裁定・DP2 で処理予定**」だが、
repo 側の最新裁定は **e5_gaps.md I2 の「恒久に対象外」**。**裁定が反転している**ため、
DP2 着手前に「I2 を上書きする」旨の明示が要る（そうでないと E の記録と DP の実装が矛盾する）。

### S5-2. 分析ビューの内部用語プレースホルダ

対象ファイル＝`app/(manage)/analytics/analytics-board.tsx`（68,779 bytes）。

| 種別 | 行 | 逐語 | 所見 |
|---|---|---|---|
| **プレースホルダ文言（定数）** | **:70** | `const COMING = "集計機能の提供開始後に表示されます。";` | **製品文言＝内部用語なし**。設計意図どおり |
| プレースホルダ適用箇所 | **:1008** / **:1012** | 「延長率」「ドリンク杯数」の2枠 | 同上 |
| **内部用語が画面に出ている見出し** | **:1088** | `<h3>リテンション（初来店月別の再来店・直近6ヶ月…）</h3>` | **「リテンション」＝内部用語**。括弧内に和文の言い換えを併記している状態 |
| 同上 | **:870** | `<h3>曜日×時間帯ヒートマップ（…）</h3>` | **「ヒートマップ」＝内部用語** |
| 同上 | **:1067** | `<h3>顧客セグメント</h3>` | **「セグメント」＝内部用語**（配下ラベル `:505-508` は和文＝「新規（来店1回以下）」「リピート」「離反リスク 中/高」で問題なし） |
| 全店合算トグルの説明文 | **:552** | `全店舗で集計（時間帯・カテゴリ・リテンション）` | 同上「リテンション」 |
| ビュー切替タブ | **:612** | `["summary","サマリー"],["sales","売上"],["casts","キャスト"],["customers","顧客"]` | **表示は全て和文＝問題なし**（キーのみ英語） |

**位置特定の要点**: 「プレースホルダの文言」（:70 / :1008 / :1012）は既に製品文言化されており是正不要。
**是正対象は見出し語**＝`:870` `:1088` `:1067`（＋説明文 `:552`）の**カタカナ内部用語 3語**。
`e8_1b_mokushi_points.md:149` が掲げた原則「**内部用語を画面に出さない**」に対して、
プレースホルダ側は履行済み・**見出し側が未履行**、という非対称になっている。

---

## S6) 14枚目（M2待遇モック）の隔離確認

### S6-1. sha256 実測（2026-08-21）

```
899e51000b21f705bf9d704bcc5e1099830ab5e6b54f63aa3ffc96e76999f455  nox-cast-compensation-all-in-one.html
```

- 先頭8桁 `899e5100` / 末尾4桁 `f455` ＝ **M2 canonical `899e5100…f455` と一致**
- bytes = **39,474** / lines = 665
- git 上は **untracked**（`?? mock/pages-2026-08/nox-cast-compensation-all-in-one.html`）
- **台帳 `mock_pages-2026-08_sha256.txt` は 13行**（ヘッダ「収蔵13枚」）＝14枚目は**未収載**
- `README.md` も「全画面モック**13枚**・2026-08-07 受領／全13枚一致＝来歴クローズ」＝**未追随**
- repo 内から本ファイルを参照している箇所 **0件**（`grep -rn "cast-compensation"` = 0）
- ファイル整形が 13枚と異なる（pretty-print・平均行長 59 vs 201〜1081）＝**別系統の出力**

### S6-2. ★「C・実装なし」の確認 → **確認できなかった**（実測は D・実装あり）

指示は「S1 目録上『**C・マスタ残りレーン所属・DP 対象外**』であることの確認」だったが、実測は異なる：

| 観点 | 実測 |
|---|---|
| 対応ルートの実在 | `/master/cast-comp/plan` `/deduction` `/norma` `/register` の **4ページが実在**（`app/(manage)/master/cast-comp/` 配下 876行） |
| 実装の由来 | **D2 レーンで IA 分割・完了済み**（memory `nox-cast-comp-lane`・2026-08-08 push `e87a135`・mig0086） |
| ハブからの導線 | `master-board.tsx:112-121`「キャスト・報酬」節に4枚のカード（待遇プラン・報酬シミュレーター／控除・送りの設定／ノルマ設定／キャスト会計の許可） |
| モックの節構成（h1/h2/h3 逐語） | 全体構成／採用する待遇方式／基本給・保証／売上歩合・各種バック／ポイント制・ポイントスライド／売上スライド／シミュレーション／ノルマ／サマリー／出力 |
| 節語彙の実装側 有無 | **有**: 保証・バック・ポイントスライド・売上スライド・シミュレーション・ノルマ ／ **無**: 「基本給」「歩合」「待遇方式」（NOX は 保証/バック/スライド の語彙体系） |

→ **型は C ではなく D**（1モック↔4画面）。「実装なし」は成立しない。
成立するのは「**モックが1枚に統合している構成と、実装が4ページに分割している構成が食い違う**」という IA の差。

**論点の再定義（選択肢の列挙のみ・推奨は付さない）**:
- (a) **DP 対象外で確定**（型は D と記録しつつ、DP では触れない）＝IA 差は別レーンへ送る
- (b) **DP 対象に含めるが見た目のみ**（4ページの色・部品を14枚目のトーンへ寄せ、1枚統合はしない）
- (c) **IA 統合まで含める**＝4ページ→1ページの再統合。**D2 レーンの分割裁定を覆すことになる**
- (d) 「M2待遇＝money-core 級・未実装」という前提自体を再確認する
  （**実装済み4ページと、モックが描く待遇方式の全体像との機能差分**を別途棚卸しする）

### S6-3. sha256 台帳への追記文面（案・**追記は未実施**）

現行 `mock_pages-2026-08_sha256.txt` はヘッダ2行＋13行（`ファイル名 / bytes / sha256先頭16桁`・空白揃え）。
同形式を保つなら:

```
# mock/pages-2026-08/ 収蔵14枚の相談役側 sha256（先頭16桁）＋bytes
# CC: README の実測 sha256 表と突き合わせ・全14一致で来歴クローズ
# 14枚目（cast-compensation-all-in-one）は 2026-08-20 追加受領＝DP レーン canonical。
#     用途は「M2待遇」＝待遇オールインワン（money-core 級）・DP の変換対象外。
nox-analytics-dashboard.html           36224  7456e5db19a82c49
nox-announcement-management.html       31116  c9d67b543b07388b
nox-audit-management.html              35704  e3a92792121b5d7b
nox-business-hours-settings.html       21031  13504c7f7e421f95
nox-cast-compensation-all-in-one.html  39474  899e51000b21f705
nox-cast-management.html               34192  99a4fc32b53d6098
nox-customer-management.html           32796  9a4847c57010d911
nox-daily-report.html                  35676  a7513a48148e6fbb
nox-payroll-management.html            30707  d9ed45abfe5ea53d
nox-pricing-settings.html              37702  ec71ac2182253f44
nox-register-pos.html                  69864  d21bdac477e986d9
nox-seat-table-settings.html           25026  5dbbb4cf75335022
nox-shift-management.html              45914  1503c968ed25582f
nox-staff-system-settings.html         29175  9bf1f9d70a07cb78
```

**追記時に同時に必要な追随（未実施・裁定後）**:
1. `mock/pages-2026-08/README.md` の「**13枚**」表記（見出し・本文・照合記述の計3箇所）と
   実測 sha256 表（13行）を **14枚 / 14行** へ更新。
2. README の「照合リスト原本 sha256 `518c9e43…7486`」は**台帳を書き換えると変わる**ため、
   書換後の実測値へ張り替えるか、**原本を不変とし14枚目は別行で追補**するかの選択が要る。
3. `docs/tmp/design_tokens_draft.md`（13枚前提）と `docs/NOX_デザインガイド_v1.md` §5（母数30ルート）は
   **DP レーンの正本ではない**旨を明示するか、DP 用の新正本を立てる。

---

## 申告事項（DP1 着手前に裁定が要るもの）

1. **14枚目の投票権**（S3-2）＝`--card2` と `--ink` の2値が反転する。母数13/14 の確定が要る。
2. **フォント**（S3-4）＝3役すべて不一致・配信方法も不一致。裁定台帳:391 の「Agoora 裁定点」が未消化。
3. **spacing / radius のトークン化**（S3-3）＝14枚とも全てリテラル。トークン層を作るか否か。
4. **D 型4枚の IA**（S1-3）＝`/master` に3枚が集約・`cast-comp` は1枚が4ページに割れる。
5. **アバター色の裁定の反転**（S5-1）＝e5_gaps I2「恒久に対象外」を DP2 で覆すなら明示が要る。
6. **14枚目の型が C ではなく D**（S6-2）＝「実装なし」の前提が実測と食い違う。
7. **母数の陳腐化**（S1-4）＝実ルートは 30→**33**。E レーン後発の3ルートは E 検収を受けていない。
8. **E レーン申告との差**（S2-2）＝「旧パレットのリテラル残ゼロ」に対し `theme.ts:231` に `#0B0B0F` が live。
   金暗面3色（`#1F1B12` `#14120C` `#1B1710`・計10箇所）は E4 の是正辞書外＝未計上。
