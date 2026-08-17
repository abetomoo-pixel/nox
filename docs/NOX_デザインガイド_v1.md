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

---

## 8. 共通シェル（E2 で実装確定・2026-08-17）

モックの base 規則（`@media` を除いた素の値）を13枚から機械抽出し、実装で確定した値。

### 8-1. 骨格

```
.app{min-height:100vh; display:grid; grid-template-columns:238px minmax(0,1fr)}
  aside.sidebar   ← 左列・全高
  （右列）header.topbar + .content
```
★**トップバーはサイドバーの右にだけ架かる**（全幅ヘッダではない）。
NOX 実装は `.nox-layout > (aside.nox-side | div.nox-mainwrap > header.nox-tb + main.nox-mainarea)`。

### 8-2. 確定値（モック実測 → NOX 実装）

| 部位 | モック実測（base） | NOX 実装 | 旧値 |
|---|---|---|---|
| グリッド | `238px minmax(0,1fr)` | 同left | 220px |
| サイドバー | `position:sticky; top:0; height:100vh; background:#0d0d0c; border-right:1px solid var(--line); padding:22px 14px; display:flex; flex-direction:column; z-index:20` | 同left | sticky top:64px・地色は `.nox-layout` の gradient で擬似的に塗っていた |
| ブランド | `.brand{display:flex; align-items:center; gap:12px; padding:0 10px 28px}` ／ `.brandmark{37×37; border:1px solid var(--gold); border-radius:8px; display:grid; place-items:center; color:var(--gold2); font:17px Georgia,serif}` ／ `b{16px}` ／ `small{color:var(--muted); font-size:9px; letter-spacing:.18em}` | 同left（**topbar から サイドバー上部へ移設**） | topbar 内・logo 36px・radius 10・Cormorant Garamond |
| 群見出し | `.navlabel{padding:9px 12px 5px; color:#66635d; font-size:9px; letter-spacing:.16em}` | 同left | 10.5px・#6F6F79・ls .1em |
| ナビ項目 | `.nav button{padding:11px 12px; border-radius:8px; gap:11px; color:#96938b; margin:2px 0}` | 同left（色は `var(--sub)`・NOX は `<a>`） | radius 10・14px・`var(--ink)` |
| 現在地 | `.nav button.active{background:linear-gradient(90deg,rgba(216,173,85,.17),rgba(216,173,85,.03)); color:var(--gold2); box-shadow:inset 2px 0 var(--gold)}` | 同left | `rgba(201,162,74,.14)` 地＋gold 文字（左線なし） |
| hover | （モックに base 定義なし） | `background:#171715; color:var(--ink)` | `var(--card2)` |
| トップバー | `.topbar{height:64px; padding:0 29px; border-bottom:1px solid var(--line); position:sticky; top:0; display:flex; justify-content:space-between}` | 同left（背景 rgba は新 `--bg` 基準 `rgba(8,8,8,.94)`） | 全幅・padding 0 24px・`rgba(11,11,15,.94)` |
| 本文 | `.content{max-width:1540px; margin:auto; padding:24px 28px 50px}` | 同left | max-width 1480px・padding 28px |

### 8-3. ★意図的な非追随（実装が先行発見した差の還流）

1. **SP（≤900）のナビ**：モックはサイドバーを「アイコン列の上部固定バー」に変えるが、
   **NOX は既存のボトムタブ（TabBar）を維持**する。ナビの構造そのものを変えることになり、
   E2 の presentation-only を外れるため。→ ≤900 はサイドバーを隠して1列にするだけ。
2. **`.sidefoot` は実装しない**：モックの中身は**ページ状態行**
   （「最終更新 15:58」「LINE通知 正常」「監査ログ 正常」「設定は正常に同期されています」）で、
   NOX に対応するデータが無い。無いものを埋めると**ナビに新情報を足す**ことになる。
   → 載せる情報が決まった時点で、モック値（`margin-top:auto; padding:14px 10px;
   border-top:1px solid var(--line); color:var(--muted); font-size:9px`）を起こす。
3. **トップバー左（`.crumb`）は空**：モックは「営業 / レジ」のパンくずだが、NOX は各ページが
   自前の見出しを持ち、パンくずに相当するデータを持たない。店名は**サイドバーの brand**
   （モックと同じ「N / NOX / CLUB NOX」）にあるため、topbar には出さない＝同じ情報を2箇所に出さない。

### 8-4. ★E2 で見つかった実装側の欠陥（是正済み）

`globals.css` に **`.nox-side .group` の定義が2箇所**あり（レイアウト節と後方の「視覚調整」節）、
同一詳細度のため**後方が先方を上書き**していた。E2 でモック `.navlabel` 値へ一本化。
→ 教訓: 同じセレクタの再定義は「調整」の名で増えやすく、値の正本が分からなくなる。
   E3 以降で部品値を変えるときは **同名セレクタの重複を先に grep する**。
   → ★**E4 群2a で是正版に更新**（§11-3）。素の grep では足りない＝
   **コメントを除去したソース**で確認すること（規則直前のコメントが選択子に混ざり、
   同名セレクタを別物として数えてしまう）。

### 8-5. E2 の検収実績（2026-08-17）

- build / tsc / lint 緑・**verify:f0 18本 2600 全緑**
- **全29ルート到達**（200 またはロール由来のリダイレクト）・(manage) 配下は
  シェル4要素（`nox-side` / `nox-tb` / `nox-mainwrap` / `nox-mainarea`）が全ページで揃う
- **権限出し分けの現状維持**を demo-manager（店長）で確認＝ナビ11項目・
  **owner 限定の「監査」が出ない**・群見出しは「営業/スタッフ/店舗」（1項目群の見出し抑止も従来どおり）
- レスポンシブ 1280/768/375 で**横スクロールなし**・≤900 でサイドバー非表示＋ボトムタブ表示

---

## 9. 共通部品（E3 で実装確定・2026-08-17）

§4 の「部品輪郭」を実装値として確定し、モックに定義が無かった**テーブル・入力欄を新規起草**した。
★E3 の範囲は**部品を用意するまで**。各ページの構造・インライン style を本部品へ置き換えるのは **E4**。

### 9-1. 確定値（モック実測 → NOX 実装）

| 部品 | モック実測（base・多数派） | NOX 実装 | 旧値 |
|---|---|---|---|
| 角丸スケール | `.card` 11 / `.btn` 7 / `.field input` 6 / `.brandmark` 8 | `radius = {card:11, kpi:11, btn:7, btnSm:7, input:6, pill:999, icon:8}` | card 16 / btn 11 / input 11 / kpi 14 / btnSm 9 |
| `.card`（theme.ts `card`） | `border:1px solid var(--line); border-radius:11px; background:linear-gradient(145deg, rgba(25,25,22,.95), rgba(15,15,14,.98)); box-shadow:var(--shadow)` | 同left（padding 15・marginBottom 13 は NOX の余白規約で据置） | `linear-gradient(180deg,var(--card2),var(--card))`・影なし |
| `.nox-btn` / `btnBase` | `border:1px solid var(--line2); background:#171715; padding:0 15px; border-radius:7px; inline-flex; gap:7px; font-weight:650`（height:38px） | 同left（**地は `--card2`**・高さは padding 10px で作る） | `border:var(--line)`・`--card2`・radius 10・weight 800 |
| `.btn.primary` / `btnGold` | `linear-gradient(135deg,#e2bd6b,#b48634); border-color:#d2a952; color:#17130c; box-shadow:0 6px 18px rgba(216,173,85,.12)` | 同left | 単色 `var(--gold)`・文字 `#15120A`／theme は `linear-gradient(135deg,var(--gold2),#B8893A)`・文字 **`#0B0B0F`（旧 --bg のベタ書き）** |
| `.btn.ghost` / `.danger` / `.small` | `ghost{background:transparent;color:var(--muted)}` ／ `danger{color:var(--red);border-color:rgba(216,108,100,.28);background:rgba(216,108,100,.05)}` ／ `small{height:30px;padding:0 10px}` | 同left（`--muted`→`--sub`・`--red`→`--bad`） | ghost/danger/small とも**未定義**（新規） |
| `.nox-badge` | `padding:3px 8px; border:1px solid rgba(216,173,85,.28); background:var(--goldbg); color:var(--gold2); font-size:10px; border-radius:20px` | 同left（状態クラス ok/warn/ng/none は地を透明にして色で区別） | radius 6・padding 2px 9px・地なし・`--sub` |
| `.nox-toast`（新規） | `position:fixed; right:26px; bottom:26px; background:#222119; border:1px solid rgba(216,173,85,.45); box-shadow:var(--shadow); border-radius:9px; padding:13px 17px` | 同left（**地は `--card2`**）＋`.show` で `opacity/translateY` | **CSS 部品なし**（`components/ui/toast.tsx` は浮遊しない inline `<p>`） |
| `.nox-modalhead/body/foot`（新規） | `head{padding:17px 19px;border-bottom:1px solid var(--line);flex space-between}` ／ `body{padding:18px}` ／ `foot{padding:13px 18px;border-top:1px solid var(--line);flex-end;gap:8px}` | 同left | 未定義（各モーダルが inline で持っていた） |
| アプリ地 | body に `radial-gradient(circle at 80% -10%, rgba(215,170,80,.1), transparent 28%), var(--bg)` | 同left（**金の淡色は `var(--goldbg)` を参照**＝E1 追加トークンが実参照に） | 紫寄り `#15131C` / `#1A1622` の放射グラデ |

### 9-2. ★新規起草（モックに共通部品定義が無い2種）

モックは `table` / `input` の**共通部品を持たない**（各モックが個別セレクタで記述）。
実例から輪郭を抽出して起草した。出典と逸脱は下記のとおり。

**テーブル `.nox-tablewrap` / `.nox-table`**
- 出典: analytics `.data-table th{text-align:left;padding:9px;color:var(--muted);font-size:8px;font-weight:500;border-bottom:1px solid var(--line);white-space:nowrap}` ／
  audit 同型（`padding:9px 12px`）／payroll `.paytable td{padding:11px 12px}`・`th{position:sticky;top:0;background:#161613}` ／
  shift `.table th,.table td{padding:12px 14px}` ／ staff-system `.table{width:100%;border-collapse:collapse}` ／ 共通 `tr:last-child td{border:0}`・`tbody tr:hover{background:#1b1b18〜#1d1d19}`・`.table-wrap{overflow:auto}`
- 実装: `th{padding:10px 12px; font-size:11px; color:var(--sub); letter-spacing:.08em}` ／
  `td{padding:11px 12px; font-size:12.5px; color:var(--ink)}` ／ `tbody tr:hover{background:var(--card2)}` ／
  `.nox-table.sticky th{position:sticky; top:0; background:var(--bg2)}` ／ `.num` で右寄せ＋等幅数字
- **★意図的な逸脱**: モックの `font-size:8〜9px` は**採らない**。13px 地に対する装飾的な縮小で、
  実データ（金額・人数・日付）には小さすぎる。既存 `.nox-ptable` の実績値（th 11 / td 12.5）を採用。

**入力欄 `.nox-field` / `.nox-input`**
- 出典（register-pos 基準）: `.field{display:flex;flex-direction:column;gap:4px}` ／
  `.field input,.field select{height:34px;border:1px solid var(--line2);border-radius:6px;background:#0c0c0b;padding:0 9px;outline:none}` ／
  `.field input:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(216,173,85,.08)}` ／
  `.field textarea{height:112px;padding:10px;resize:vertical}` ／ `.field label{font-size:11px;color:#bbb8ae}`
- 実装: 地 `var(--bg)`・枠 `var(--line2)`・radius 6・padding 9・focus は金枠＋淡い金リング・textarea は min-height 112 / padding 10
- **★トークンに無い地色の扱い**: `#0c0c0b` は `--bg(#080808)` と `--card(#11110f)` の中間で一致トークンが無い。
  入力は「面より沈む」のが要件なので **`--bg`** を採用（旧実装の `--bg2 #181815` はカードより明るく、沈みが逆だった）。
  同様に `.btn` の `#171715` → **`--card2`**、`.toast` の `#222119` → **`--card2`**、
  表 hover の `#1b1b18` → **`--card2`**、sticky th の `#161613` → **`--bg2`** に寄せた（**トークンのみ使用**）。
- **高さの作り方**: モックは `height:34px`（btn は 38px）だが、NOX は **padding で高さを作る**。
  既存のインライン style が width/padding を上書きする箇所があり、`height` を入れると衝突するため。

### 9-3. theme.ts の後始末（E3 で実施）

| 対象 | 処置 |
|---|---|
| `colors`（raw hex 13色） | **削除**。参照ゼロの死にコードで、2026-07-28 に `.nox-dark` だけ更新されて card2/line/ink/sub が drift していた（§2 教訓3 の実例）。色の正本は `.nox-dark` の CSS 変数ただ一つ |
| `rolePill.color` `#0B0B0F` | → `#17130c`（モック `.btn.primary` の文字色） |
| `rolePill.background` の `#B8893A` | → `#b48634`（モック値） |
| `btnGold` の `#0B0B0F` / `#B8893A` | → モック `.btn.primary` 一式へ（`#e2bd6b→#b48634`・文字 `#17130c`・border `#d2a952`・影） |
| `appBg` の `#15131C` / `loginBg` の `#1A1622` | → **`var(--goldbg)` の金グロー**（`globals.css` の `--app-bg` も同時に更新） |
| `slipFoot.color` `#0B0B0F` ほか帳票系リテラル | **未処置**。印刷帳票（`slipHd`/`slipFoot`/`errBox`/`avatar`）は白地印刷の都合で独自色を持つ＝E5（金銭画面）で帳票ごと見直す |

### 9-4. E3 の検収実績（2026-08-17）

- build / tsc / lint 緑・**verify:f0 18本 2600 全緑**
- 部品の計算済みスタイルを実測し**全項目がガイド値で解決**することを確認
  （btn `radius:7px/padding:10px 15px/weight:650`・btnGold グラデと影・badge `radius:20px`＋`--goldbg` 地・
  toast `fixed/right:26px/bottom:26px`＋`--shadow`・modal head/body/foot の padding・
  table `th 10px 12px/11px`・`td 11px 12px/12.5px`・input `--bg`地/radius 6・textarea `min-height:112px`）
- 既存カードへの波及も実測（`linear-gradient(145deg, rgba(25,25,22,.95), rgba(15,15,14,.98))`・`radius:11px`・`--shadow`）
- アプリ地が `rgb(8,8,8)` ＋ `rgba(216,173,85,.1)` の金グローへ（`--goldbg` が**実参照**になった）
- レスポンシブ 1280/768/375 で横スクロールなし
- **重複セレクタ監査**（E2 教訓の適用）: 実装中に自分で作った重複2件
  （`.nox-field textarea` の padding 競合・`.nox-badge` の状態クラス分割）を検出して1本化。
  E3 終了時点で**新規導入の重複ゼロ**（残る5件は E3 以前からの既存＝`.nox-ptable` 列指定と `.nox-seg a`）

---

## 10. E4-0 先行2件（2026-08-17）

### 10-1. 金地トークンの追加（E3 指摘の履行）

E3 ではモック `.btn.primary` の値をリテラルのまま置いていたが、**金地の上に載る値は複数部品で共有**
するため正本を1箇所へ集めた。

| token | 値 | 用途 | 出典 |
|---|---|---|---|
| `--on-gold` | `#17130c` | **金地の上の文字色**（暗褐色）。`--bg` では黒すぎ・`--ink` では白すぎる | モック `.btn.primary{color:#17130c}` |
| `--gold1` | `#e2bd6b` | 金グラデの明端 | モック `.btn.primary` グラデ始点 |
| `--gold3` | `#b48634` | 金グラデの暗端（`--gold` より暗い3段目） | モック `.btn.primary` グラデ終点 |
| `--gold-bd` | `#d2a952` | 金ボタンの枠線 | モック `.btn.primary{border-color}` |

**置換した箇所（旧リテラル → トークン）**

| 箇所 | 旧 | 新 |
|---|---|---|
| `.nox-btn.gold`（globals） | `#e2bd6b/#b48634/#d2a952/#17130c` | `--gold1/--gold3/--gold-bd/--on-gold` |
| `theme.ts btnGold` | 同上 | 同上 |
| `theme.ts rolePill` | `#17130c` / `#b48634` | `--on-gold` / `--gold3` |
| `theme.ts slipFoot` | `#0B0B0F`（旧 `--bg` のベタ書き） | `--on-gold` |
| `.nox-tile-badge` | `#B8893A` / `#0B0B0F` | `--gold3` / `--on-gold` |
| `.nox-medal` | `#0B0B0F` | `--on-gold` |
| `.nox-switch.on` / `.on i` | `#B8893A,#E6D6A8` / `#0B0B0F` | `--gold3,--champ` / `--on-gold` |
| `.nox-stockbar i` | `#B8893A,#E6D6A8` | `--gold3,--champ` |
| `.nox-ava` | `#0B0B0F` | **`--bg`**（地は `avatarBg()` の HSL グラデ＝**金ではない**ので `--on-gold` は使わない） |

★未処置＝**E5 送り**: `slipHd` の `#0E0E14`・`errBox` の `#2C1B1B/#5A2E2E/#F0B9B9`・
`avatar` の `#1F1B12`。いずれも**白地印刷の帳票**で独自色を持つため、帳票ごと E5 で見直す。

### 10-2. 浮遊 toast は見送り（裁定4 の維持）

E3 で CSS 部品 `.nox-toast` は用意済みだが、**移行しない**。
理由＝27箇所のカード内レイアウトが同時に動き、「どの操作の結果か」の対応づけが弱くなる。
E4 は**部品値の適用のみ**とし表示位置は現行維持。採用するなら全27箇所を同時に切り替える
独立レーンが要る（台帳 裁定4 に同旨を追記済み＝post-launch 維持）。

---

## 11. gaps 裁定の反映（E4 群2b・2026-08-17）

`docs/tmp/e4_gaps.md` に記録した3件の裁定を反映した。

### 11-1. G1: `.nox-ptable` は特化表として2部品体制で確定

汎用 `.nox-table`（E3 起草）と併存させる。`.nox-ptable` が持つのは
**列別の幅・寄せ／ソート矢印（`th.sortable` ＋二段矢印）／2段セル（`.nox-ptnamecell`）／
行フラッシュ（`prefers-reduced-motion` 分岐つき）／セル内在庫バー**で、
汎用表に足すと素の表が重くなるため**分けたまま正式部品とする**。

**同じ設計言語であることの照合結果**（E4 群2b で実施・ズレ3点を是正）:

| 観点 | `.nox-table`（汎用） | `.nox-ptable`（特化） | 処置 |
|---|---|---|---|
| 器の radius | 11px | ~~14px~~ → **11px** | ★揃えた |
| th 下罫線 | `--line` | ~~`--line2`~~ → **`--line`** | ★揃えた |
| th 字間 | `.08em` | ~~なし~~ → **`.08em`** | ★揃えた |
| 器の地／枠 | `--card` ／ 1px `--line` | 同左 | 一致 |
| 表 font-size | 12.5px | 12.5px | 一致 |
| th 文字 | 11px / 700 / `--sub` | 同左 | 一致 |
| td 文字 | `--ink` | 同左 | 一致 |
| **td padding** | 11px 12px | **15px 10px** | **揃えない**＝行を厚く見せる特化の意匠 |

### 11-2. G2: 沈み面 `.nox-inset` を新設

```
.nox-inset { background: var(--bg2); border: 1px solid var(--line); border-radius: 8px;
             padding: 14px; box-shadow: none; }
```
- ★**非モック由来・実装起草**。モックには「カードの中にもう一段沈む面」の定義が無い
  （`.card` は入れ子を持たず `.modalbody` は padding のみ）。実装側の必要から起こした。
- 値の根拠＝**階層の言語を既存部品に合わせる**: 地 `--bg2`（card 面より沈み、入力欄 `--bg` ほどは沈まない中間段）／
  radius 8（**card 11 > inset 8 > btn 7** の階に収める）／枠は card と同じ `--line`／影なし（沈む面は浮かせない）。
- 用途: カード・モーダル内の副ブロック（折りたたみ詳細、補足フォーム群）。

### 11-3. G3: 教訓の是正版（E2 版を上書き）

**新しい部品クラスを足す前に、コメントを除去したソースで同名セレクタの実在を確認する。**

- 経緯: E3 が新部品を `.nox-field` と命名したが、**同名の既存クラスが実在**した
  （縦積みフォーム＝`.lab` 子・`margin-bottom:15px`・23箇所使用）。同一詳細度で後勝ちし、
  既存フォームが `flex-column/gap:5` に化けた＝**E3 の回帰**。E4 群2a で `.nox-formfield` へ改名して是正。
- 見逃した原因: 重複監査スクリプトが **規則直前のコメントを選択子に取り込む**バグを持ち、
  `/* … */ .nox-field` を `.nox-field` と別物として数えていた。
- 是正後の監査手順（正本）:
  1. `/* … */` を**先に**全削除する
  2. `@media` ブロックを除いて base 規則だけにする
  3. 選択子をカンマ分割・空白正規化して出現数を数える
  4. `@keyframes` の `from/to` は false positive として除外する
- この手順で全数再監査した結果、**E1〜E4 で導入した重複はゼロ**
  （残る既存6件＝`.nox-ptable` の列指定5件と `.nox-seg a`）。

### 11-4. G5: 区切り線つきリスト行 `.nox-listrow` を新設（E4 群4）

```
.nox-listrow { display:flex; align-items:center; gap:10px;
               padding:6px 0; border-bottom:1px solid var(--line); }
.nox-listrow:last-child { border-bottom:0; }
```
- ★**非モック由来・実装起草**。モックのリストはページ固有クラス（`.split-preview-row` 等）で
  共通部品を持たない。実装側で同型が **8箇所 / 7ファイル**に分散していたため起草した。
- 既存部品が使えない理由: `.nox-table` は `<table>` 構造が要る（対象は div の flex 行で
  `margin-left:auto` の右寄せ要素を含む）／`.nox-inset` は「囲む面」であって行区切りではない。
- 適用済み（E4 群4 時点・4箇所）: shift-board の希望/確定シフト行 ×2・
  mine/drink-claim-form の申告履歴行・mine/wishes の希望行
  （gap/padding の 1〜2px 差は inline 上書きで保持＝視覚不変）。
- **未適用＝E5/E6 送り**: register/bottle-keep-panel・shift/incentive-panel（金銭画面圏）。
  notices-board:165 と customer-detail:266 は **flex 行ではなく縦積みブロック**のため対象外
  （`flex-direction:column` / ブロック直下に複数行＝部品の輪郭と合わない。inline のまま）。
- G4（マイナンバー値チップ）は**裁定＝意図的 inline 許容**（単発・機密表示特化。部品にすると
  「等幅の機密値をどこでも置ける」語彙を作り、機密表示を増やさない方針と逆行するため）。

### 11-5. E1 の取り残し＝旧パレットのリテラル 24箇所（E4 群4 で17箇所是正）

E4 群4 の走査で、**E1 のトークン差し替えが届かなかった旧パレットのリテラル**が
24箇所 / 14ファイルに残存していたことが判明した（`#C9A24A`（旧 gold）×10・`#23232B` ×7・
`#0B0B0F` ×3・`#B8893A` ×4 ほか）。E1 は「トークン定義の差し替え」であり、
**画面側が var() でなくリテラルで書いていた箇所は当然に取り残される**＝機械走査で全数を出した。

- **是正 17箇所**（E4 対象圏）: checkbox の `accentColor` ×5 → `var(--gold)`／
  ピル地 `#23232B` ×4 → `var(--card2)`／金グラデ終端 `#B8893A` ×4 → `var(--gold3)`／
  金地の文字 `#0B0B0F` ×3 → `var(--on-gold)`／`viewport.themeColor` → `#080808`
  （メタデータは CSS var 不可＝リテラル必須・新 `--bg` と同値）。
- **残置 7箇所**: register-board ×2・reservation-panel ×3（**E5 送り**）／
  kiosk-register ×2（**E6 送り**）。

