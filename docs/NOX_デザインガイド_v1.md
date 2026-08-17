# NOX デザインガイド v1（ロック版・2026-08-17）

正本規約: 本書がデザイン適用レーン（E1〜E6）の**正本**。素材＝`mock/pages-2026-08/` 13枚
（来歴クローズ済み・sha256 照合表同梱）。値の確定は「多数決 → 同数は register-pos tiebreaker →
それでも決まらないものは裁定」の順で行い、裁定5件を反映済み。実測の元データは E0 プリフライト
（docs/tmp/design_tokens_draft.md）。

**全段の共通条件（E1〜E6 で不変）**
- **機能不触**＝RPC 呼び出し・引数・分岐を変えない。差分は styling と JSX 構造のみ。
- **verify:f0 18本 2600 全緑を維持**（pay 83 / shift-time 44 / punch-match 75 / receipt 52 /
  anon-guard 934 / rls 472 / grants 282 / payroll 133 / payroll-csv 25 / inventory 126 /
  product-bulk 35 / pricing 86 / pricing-apply 44 / categories 49 / cast-photo 20 /
  labor-forecast 26 / rate-back 64 / billing 50）。golden 5値（wage 5931・withholding 125802・
  rls F1b 54400・labor-forecast 55233・receipt 52）不変。
- verify は DB/RPC の係留で **UI を見ない**＝デザイン変更は原理的に verify を壊さない。
  **壊れたら「機能に触った」ことの検出器**として働く＝これが「不触」の担保。

---

## 1. 確定パレット（全値表）

### 1-1. 適用トークン（`.nox-dark` の実体）

| アプリ token | 確定値 | ← モック token | 根拠 | 実参照(app) |
|---|---|---|---|---|
| `--bg` | `#080808` | `--bg` | 多数決 **13/13**（唯一の全枚一致） | 9 |
| `--bg2` | `#181815` | `--panel2` | 多数決 5/13 | 18 |
| `--card` | `#11110f` | `--panel` | 多数決 5/13。★**E3 で `.card` グラデ化予定**（§1-3） | 22 |
| `--card2` | `#22221e` | `--panel3` | ★同数 6:6 → **register-pos tiebreaker** | 29 |
| `--line` | `#2d2c27` | `--line` | 多数決 5/13（対 4） | 66 |
| `--line2` | `#3b3931` | `--line2` | 多数決 5/13（対 3）。振れ幅最大（#3a382f〜#464238） | 65 |
| `--gold` | `#d8ad55` | `--gold` | 多数決 9/13 | 63 |
| `--gold2` | `#f0cf82` | `--gold2` | 多数決 6/13（対 3/3） | 38 |
| `--champ` | `#E6D6A8` | **（無）** | ★**非モック由来・暫定・E5 で再裁定**（§1-2） | 65 |
| `--ink` | `#f3f0e8` | `--text` | ★同数 6:6 → **register-pos tiebreaker** | 74 |
| `--sub` | `#99978f` | `--muted` | 多数決 6/13（対 3/3） | 320 |
| `--ok` | `#77ba83` | `--green` | 多数決 6/13（異形6＝最多分裂） | 59 |
| `--bad` | `#d86c64` | `--red` | 多数決 6/13（異形5） | 118 |
| `--v2-ava` | `#2A2A36` | **（無）** | ★非モック由来・現行維持（アバター地 neutral） | 4 |

**別名（値を持たない・自動追随）**：`--v2-text: var(--ink)` / `--v2-muted: var(--sub)` /
`--v2-panel2: var(--card2)` / `--v2-line: var(--line)`。
**色でないトークン**：`--wrap-max: 1180px`（フレーム上限）・`--app-bg`（@media 内のグラデ）＝本レーン対象外。

### 1-2. 追加トークン（モック正本にあり・アプリに無かったもの）

| token | 確定値 | 根拠 | 現時点の参照 |
|---|---|---|---|
| `--goldbg` | `rgba(216,173,85,.1)` | 多数決 9/13（モック内 70参照） | **0**（E2/E3 で参照予定） |
| `--shadow` | `0 18px 55px rgba(0,0,0,.35)` | 多数決 8/13（モック内 26参照） | **0**（E3 の `.card` で参照予定） |
| `--blue` | `#74a6d8` | 多数決 4/11（2枚未定義） | **0**（状態色・E3 で判断） |
| `--orange` | `#df9956` | 多数決 2/3（10枚未定義） | **0**（状態色・E3 で判断） |
| `--linegreen` | `#06c755` | 単一定義（LINE ブランド色・announcement のみ） | **0**（LINE レーン用） |

★**未参照であることを本表に明記する**のは §2 の教訓の適用＝「宣言したが誰も使っていない」状態を
**書かれていない事実にしない**ため。E3 終了時点で参照ゼロのままなら削除を検討する。

### 1-3. 裁定5件の反映内容

| # | 対象 | 裁定 | 実装 |
|---|---|---|---|
| 1 | `--champ`（65参照） | **非モック由来・暫定・E5 で再裁定** | 現行 `#E6D6A8` を維持。モックの金は gold/gold2 の**2段**しか持たず、`--champ` は NOX 独自の**3段目**。金の階調を2段に畳むか3段を残すかは金銭画面（E5）の見え方で決める |
| 2 | `--card`（22参照） | **E3 で `.card` グラデ化予定** | E1 では単色 `#11110f`（`--panel` 多数決）。モックの実体は `linear-gradient(145deg, rgba(25,25,22,.95), rgba(15,15,14,.98))` で**トークンではなく部品側のグラデ**＝E3 で `.card` 部品に移す |
| 3 | `--purple` | **死宣言を持ち込まない** | アプリには元から未定義＝**追加しない**（参照ゼロを再確認済み。§2） |
| 4 | `--bg2`（18参照） | 既定ルール（多数決）で決着 | `--panel2` 多数決 `#181815` |
| 5 | `--v2-ava`（4参照） | 非モック由来＝現行維持 | `#2A2A36` |

---

## 2. ★教訓: 宣言 ≠ 実参照（死にトークン3種の顛末）

E0 で `var(--token)` の**実参照回数**を13枚全数で数えた結果、**宣言されているのに一度も参照されない
トークンが3つ**あった。

| token | 宣言枚数 | モック内 総参照 | 顛末 |
|---|---|---|---|
| `--panel` | 13 | **0** | 面は `.card` のリテラルグラデで描かれていた。値は `--card` の初期値として採用（裁定2） |
| `--panel2` | 13 | **0** | 同上。値は `--bg2` として採用（裁定4） |
| `--purple` | 3 | **0** | 3枚とも別値・アプリも参照ゼロ＝**採用しない**（裁定3） |

**教訓（本レーンの規範）**
1. **トークン表は「宣言」ではなく「実参照」で読む**。宣言値と実際に描かれている色は一致しないことがある
   （モックのカード面は `--panel` ではなくリテラルのグラデだった）。
2. 新しくトークンを足すときは、**参照が無いなら参照が無いと表に書く**（§1-2）。
   書かれていない死にトークンは、次に読む人に「これが正本の色だ」と誤読させる。
3. 同じ事故が repo 側にもあった＝`lib/nox/ui/theme.ts` の `colors` オブジェクトは
   **参照ゼロなのに値を持ち**、`globals.css` と drift していた（card2/line/ink/sub の4件）。
   E1 で同値へ揃えたが、**本質的には削除候補**（E3 で判断）。

---

## 3. モック語彙 ↔ 現行語彙 対応表

| 役割 | モック | 現行アプリ | 備考 |
|---|---|---|---|
| ページ地 | `--bg` | `--bg` | 同名 |
| 面（カード） | `--panel`（死） / `.card` グラデ | `--card` | ★E3 でグラデ化 |
| 面（2段目） | `--panel2`（死） | `--bg2` | |
| 面（浮き） | `--panel3` | `--card2` | |
| 罫（細） | `--line` | `--line` | 同名・別値 |
| 罫（太） | `--line2` | `--line2` | 同名・別値 |
| 金（主） | `--gold` | `--gold` | 同名 |
| 金（明） | `--gold2` | `--gold2` | 同名 |
| 金（淡） | **（無）** | `--champ` | ★NOX 独自の3段目 |
| 文字（主） | `--text` | `--ink` | |
| 文字（副） | `--muted` | `--sub` | |
| 状態（良） | `--green` | `--ok` | |
| 状態（悪） | `--red` | `--bad` | |
| 状態（他） | `--blue` / `--orange` | **（無）** | E3 で採否 |
| 金の地 | `--goldbg` | **（無）** | E1 で追加 |
| 影 | `--shadow` | **（無）** | E1 で追加 |
| LINE | `--linegreen` | **（無）** | LINE レーン用 |

---

## 4. 部品輪郭（共通クラス語彙 17種）

13枚**すべて**で定義される＝共通シェルの骨格：
`app / sidebar / brand / brandmark / nav / navlabel / ico / sidefoot / content / topbar /
card / btn / primary / active / show / small / toast`

準共通（10-12枚）：`cardhead / pagehead / eyebrow / field / formgrid / kpi / kpis /
modalhead / modalbody / ghost / danger / dot / full`

| 部品 | 実形 | 骨格（多数派）・裁定が要る割れ |
|---|---|---|
| `.btn` | 4種/9枚 | `height:37〜38px・1px var(--line2)・radius:7px・padding:0 14〜15px・inline-flex・gap:7px・weight:650` ／★高さ 37 or 38 |
| `.btn.primary` | 4種/9枚 | `linear-gradient(135deg,#e2bd6b,#b48634)`・文字 `#17130c`・`box-shadow:0 6px 18px rgba(216,173,85,.12)` |
| `.card` | 3種/9枚 | `1px var(--line)・radius:11px・linear-gradient(145deg, rgba(24〜26,24〜26,21〜23,.93〜.96), rgba(15,15,14,.98))・box-shadow:var(--shadow)` ／★グラデ3種 |
| `.cardhead` | 5種/6枚 | `min-height:59〜62px・padding:13〜15px 15〜18px・border-bottom:1px var(--line)・flex space-between` |
| `.field` | 4種/9枚 | `flex column・gap:5〜6px` |
| `.kpi` | 4種/6枚 | `padding:14〜15px 15〜17px・box-shadow:none`（card の派生＝影を消す） |
| `.modalhead` | 3種/5枚 | `padding:16〜17px 18〜19px・border-bottom:1px var(--line)` |
| `.toast` | 6種/14枚 | `fixed・right/bottom:26px・#222119・1px rgba(216,173,85,.45)・radius:9px・padding:13px 17px` |
| **テーブル** | **定義なし** | ★`table`/`th`/`td` の共通部品が**モックに存在しない**＝**E3 で新規起草** |
| **入力欄** | `font:inherit` のみ | ★同上＝**E3 で新規起草** |

**地の設定**（13枚一致）：`font-family: Inter, "Noto Sans JP", "Yu Gothic UI", sans-serif` /
`font-size:13px` / `line-height:1.55` / `html{color-scheme:dark}` /
body に `radial-gradient(circle at 80% -10%, gold .1, transparent 28%)` の淡い金グロー /
`.app{display:grid; grid-template-columns:224px minmax(0,1fr)}`（PC は固定 224px サイドバー）。
※現行アプリのフォントは `"Zen Kaku Gothic New"`＝**E2 で font 差し替えの可否を判断**（本 v1 では未確定）。

---

## 5. 画面対応表（13モック ↔ 実ルート30）

**対応あり 11組**：register-pos↔`/register`／shift-management↔`/shift`／daily-report↔`/report`／
payroll-management↔`/payroll`／cast-management↔`/casts`／customer-management↔`/customers`／
analytics-dashboard↔`/analytics`／audit-management↔`/audit`／announcement-management↔`/notices`／
pricing-settings↔`/master/pricing`／seat-table-settings↔`/master`（席ビュー）

**1モック↔複数画面 2組**：business-hours-settings↔`/master` ビュー内（独立ルート無し）／
staff-system-settings↔`/staff` ＋ `/master` システムビュー（既知の 1:1 崩れ）

**★モックが無い実画面 13ルート**：`/master/cast-comp` 4ページ（旧モック `mock/nox-cast-reward/` のみ）／
`/master/products` `/master/categories` `/master/stock`／`/mine` 4ページ／`/kiosk` `/kiosk-register`
（旧モック `nox-kiosk-mock-planB-viewswitch.html`）／`/dashboard` `/login` `/master`／`/billing`（未作成）
→ **E1 のトークン差し替えは全画面に自動波及する**ため、これらもデザインは動く（構造は E4 以降で個別判断）。

**実画面が無いモック**：なし。

---

## 6. 段割りと各段の検収

| 段 | 範囲 | 内容 | 検収 |
|---|---|---|---|
| **E1** | 共通トークン | `.nox-dark` ＋ `theme.ts colors` の**値差し替え・不足追加のみ**。★セレクタ・構造・インライン style 不触 | build/tsc/lint 緑・verify:f0 18本2600・主要5画面 SS（色が動くのが正常） |
| **E2** | 共通シェル | サイドバー224px・topbar・content・brand・nav・toast をモック構造へ。font 差し替えの可否もここ | 全30ルートの到達性・レスポンシブ 375/768/1280・verify:f0 |
| **E3** | 部品 | `.btn`/`.card`（★グラデ化）/`.cardhead`/`.field`/`.kpi`/`.modal*`。★**テーブル・入力欄は新規起草**。§1-2 の未参照トークンの採否もここ | 部品カタログの目視・各画面の回帰目視・verify:f0 |
| **E4** | 非金銭ページ群 | `/casts` `/customers` `/notices` `/audit` `/analytics` `/shift` `/master` 系（products/categories/stock/pricing/cast-comp 4） | 画面ごとに CRUD 1往復（作成→編集→削除で痕跡復元）・verify:f0 |
| **E5** | 金銭画面 | `/register` → `/payroll` → `/report`。★`--champ` の再裁定もここ | **CLUB NOX 実データ検収**（伝票 open→追加→会計→close の1往復・給与はプレビューまで）・verify:f0・**golden 5値の明示確認** |
| **E6** | キオスク追随 | `/kiosk` `/kiosk-register`（2026-08 モック無し＝E5 の結果を反映） | kiosk 操作1往復・verify:f0 |

**段割りの根拠**：E1〜E3 は「1箇所直すと全画面が動く」層＝先に済ませないと後段で二重作業になる。
E4（非金銭）を E5（金銭）より先に置くのは**壊した場合の被害が可逆**だから（金銭は伝票・給与に痕跡が残る）。
E6 が最後なのは、キオスクがレジの従属画面で**モックが無く判断材料が E5 の結果に依存**するため。

---

## 7. レジ（最大モック 69KB）と現画面の構造差＝E5 の予告

| 観点 | モック | 現 `/register`（1,309行） |
|---|---|---|
| ビュー切替 | 「卓席・会計」「指名・席」「割引・調整」等の画面内モード（3〜4相当） | `tab: "tables" \| "reserve"` の2値 |
| フロア | 卓グリッド＋稼働サマリ（7/8卓・14/24名） | 卓一覧あり・稼働サマリなし |
| 伝票 | 分割・均等分配・100%追加・対象キャストへ追加 | **機能は実装済み**（B1/B2・drink 帰属）＝UI 語彙の差 |
| 会計 | 「会計へ進む」→「カード/現金/併用」→「会計を完了」の3段 | check_pay/check_close の2段 |
| 予約・料金 | 予約パネル・「料金を再計算」 | いずれも実装済み（reservation-panel・pricing_resolve） |

**要点**：レジは**機能差ではなく UI 構成差**。ただしレジを触ると**キオスク（`/kiosk-register` 970行）の
追随判断が必ず発生する**（前例＝UI刷新v2 レーンで register 改修後に kiosk 追随を別コミットで実施）。
