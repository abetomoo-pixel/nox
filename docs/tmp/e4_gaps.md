# E4 部品ギャップ記録（相談役裁定待ち・2026-08-17）

E4-3 の規律に従い、**E3 部品で表現できない意匠はその場で発明せず**現状維持のまま記録する。
ガイドへ追記・裁定が済んでから適用する。

---

## G1.〔裁定済・E4 群2b で反映〕商品テーブル `.nox-ptable` を汎用 `.nox-table` に寄せられない（群2a）

- 現物: `app/(manage)/master/products/products-board.tsx` の一覧（`.nox-ptable is-products`）
- `.nox-table`（E3 起草）が持たない要素:
  - **列別の幅・寄せ指定**（`th.col-name/col-kind/col-cat/col-cost/col-margin/col-price/col-stock/col-state/col-act`）
  - **ソート矢印**（`th.sortable` ＋ `.arrow i` の二段矢印・アクティブ側だけ金）
  - **2段セル**（`.nox-ptnamecell` ＝ 商品名／バック設定の縦積み）
  - **行フラッシュ**（`tbody tr.nox-rowflash` のアニメーション・`prefers-reduced-motion` 分岐つき）
  - **在庫バー**（`.nox-stockbar`）をセル内に持つ
- 判断が要る点: `.nox-table` を「素の表」、`.nox-ptable` を「データグリッド」として**2部品体制で残す**か、
  `.nox-table` に修飾クラス（`.sortable` / `.grid`）を足して1本化するか。
- **裁定＝2部品体制で正式採用**。同言語であることを照合し radius 14→11・th 罫線 --line2→--line・字間 .08em を是正（padding は特化の意匠として揃えない）。ガイド §11-1 に収載済み。

## G2.〔裁定済・E4 群2b で反映〕モーダル内の「沈んだ副パネル」に対応部品がない（群2a）

- 現物: `products-board.tsx:691`
  `<div style={{ marginTop:12, padding:"14px 14px 2px", background:"var(--bg2)", borderRadius:11, border:"1px solid var(--line2)" }}>`
  ＝商品モーダルの「▾ 詳細（原価・発注点・バック）」を開いたときの入れ子ブロック。
- モックにも E3 部品にも「カードの中にもう一段沈む面」の定義がない
  （モックの `.card` は入れ子を持たず、`.modalbody` は padding のみ）。
- **裁定＝`.nox-inset` を新設**（地 --bg2 / radius 8＝card11>inset8>btn7 の階 / 枠 1px --line / 影なし・**非モック由来＝実装起草**）。products-board:691 の手組み inline を置換済み。ガイド §11-2 に出典明記で収載。

## G3.〔還流済・E4 群2b でガイド §11-3 へ〕`.nox-field` の命名衝突は E4 群2a で是正済み

- E3 が新部品を `.nox-field` と命名したが、**同名の既存クラスが実在**した
  （レーン④b-3 の縦積みフォーム＝`.lab` 子・`margin-bottom:15px`・products/categories/pricing の 23 箇所）。
  同一詳細度で後勝ちし、既存フォームが `flex-column/gap:5` に化けていた＝**E3 の回帰**。
- 原因: E3 の重複監査スクリプトが **規則直前のコメントを選択子に取り込む**バグを持ち、
  `.nox-field` を別セレクタとして数えて見逃していた。
- 是正: 新部品を **`.nox-formfield`** へ改名（既存 23 箇所は無改変）。
  監査スクリプトは**コメント除去を先に行う**形へ修正し、全数を再監査した。
- 副次的に `.nox-side .group` の重複定義（E2 の積み残し）も1本化した。
- ★**教訓（ガイドへ還流すべき）**: 新しい部品クラスを足す前に、
  **コメントを除去したうえで**同名セレクタの実在を確認する。


---

## 群2b で新たに見つかったギャップ

**なし**。pricing-board（81 inline）・cast-comp 4ページとも、残る inline は
flex/gap/margin/fontSize/色の一回限りレイアウトか、`t.input`/`t.btnGold`/`t.card`（＝E3 部品）の
ローカル調整（`const input = {...t.input, width:"auto", padding:"8px 10px"}` の 36 使用など）で、
**部品の再発明はゼロ**（機械抽出で確認）。部品で表せない意匠は出ていない。

---

## G4.〔裁定済・E4 群3〕値表示チップ（monospace の機密値）に対応部品がない（群2c）

- 現物: `app/(manage)/master/sensitive-tax-panel.tsx:173`
  `<span style={{ marginLeft:10, fontFamily:"monospace", fontSize:14, background:"var(--bg2)",
   color:"var(--champ)", border:"1px solid var(--line2)", padding:"2px 8px", borderRadius:4 }}>`
  ＝「支払調書用にマイナンバーを表示」を押したときに出る**復号値のインライン表示**。
- 既存部品が合わない理由:
  - `.nox-badge` は**金のピル**（radius 20・`--goldbg` 地・`--gold2` 文字）＝ラベル用で、
    可変長の数値を等幅で読ませる用途ではない。
  - `.nox-inset` は**ブロックの副パネル**（radius 8・padding 14）＝行内の小片には大きすぎる。
- **裁定＝意図的 inline 許容（単発・機密表示特化）**。部品化しない。
  理由＝(1) 用途が「支払調書作成時のマイナンバー一時表示」に特化し他画面へ横展開しない
  (2) 部品にすると「等幅の機密値をどこでも気軽に置ける」語彙を作ることになり、
  機密表示は増やさない方針と逆行する。
  → `.nox-value` は**起草しない**。当該 inline は現状維持（機能・表示位置とも不触）。

## 群2c の結果

- **置換した部品**: printer-panel の印刷ジョブ表 → `.nox-table`／master-board の席一覧表 → `.nox-table`／
  business-hours-panel の曜日行（沈み面）→ `.nox-inset`（G2 で新設した部品の2例目）。
- **置換しなかったもの**: deduction-panel・time-pricing-panel・norm-config-panel・sensitive-tax-panel は
  部品の再発明ゼロ（`t.card`/`t.input`/`t.btnGold` 等の E3 部品を既に使用）。残る inline は
  flex/gap/margin/色の一回限りレイアウト。
- **新ギャップ**: G4 の1件のみ。

---

## G5.〔裁定済・E4 群4 で反映〕「区切り線つきリスト行」＝ `.nox-listrow` を新設（群3）

- 現物（同型が全体で **8箇所 / 7ファイル**に分散）:
  `style={{ display:"flex", gap:10, alignItems:"center", padding:"6px 0",
   borderBottom:"1px solid var(--line)", fontSize:13 }}`
  - `shift-board.tsx:464, 528`（希望シフト一覧・確定シフト一覧の行）
  - `customers/[id]/customer-detail.tsx:266`（来店履歴の行）
  - `notices-board.tsx` / `register/bottle-keep-panel.tsx` / `shift/incentive-panel.tsx` /
    `mine/drink-claim-form.tsx` / `mine/wishes/page.tsx` 各1
- 既存部品が合わない理由:
  - `.nox-table` は `<table>` 構造が要る。これらは **div の flex 行**で、
    列が可変（`marginLeft:"auto"` で右寄せする要素がある等）＝表に落とすと構造が変わる。
  - `.nox-inset` は**囲む面**であって行区切りではない。
- **裁定＝`.nox-listrow` を新設**（flex / align-center / gap 10 / `padding:6px 0` /
  `border-bottom:1px var(--line)` / `:last-child` で罫線 0・**非モック由来＝実装起草**）。
  G3 手順（コメント除去先行）で同名セレクタ 0件を確認し、ガイド §11-4 に出典明記で収載。
- **適用 4箇所**（E4 群4）: shift-board:464/528・mine/drink-claim-form:130・mine/wishes:46
  （gap/padding の 1〜2px 差は inline 上書きで保持＝視覚不変・ロジック同一を機械確認）。
- **未適用 2箇所＝形が合わない**: notices-board:165 は flex-column ブロック型・
  customer-detail:266 はブロック直下に複数行を積む型で、部品の輪郭（1行 flex）と合わず inline 維持。
- **E5/E6 送り 2箇所**: register/bottle-keep-panel・shift/incentive-panel（金銭画面圏＝指示どおり不触）。

## 群3 の結果

- **置換した部品**: **なし**。casts 68 / shift 41 / customer-detail 37 / staff 34 / customers 33 の
  計 213 inline を機械走査したが、**部品の再発明はゼロ**・**手組みテーブルもゼロ**だった。
  5ファイルとも既に `.nox-cardtop` / `.nox-kpi2` / `.nox-dot` / `.nox-stpill` / `.nox-ava` /
  `.nox-ptable` 等のクラス部品と `t.card` / `t.input` / `t.btnGold` / `t.num` の theme 部品を使用している。
- **誤検出だった1件**: `casts-board.tsx:673` の `background:"var(--v2-ava)"` は
  `.nox-ava` に background 定義が無いための**正当なローカル追加**（写真プレビューは名前ハッシュの
  グラデを持たないため中立色が要る）＝再発明ではない。
- **shift の特化意匠**: ヒートマップ的なセル描画は**存在しなかった**（`opacity` の一致は
  無効化ボタンの淡色化のみ）。シフト表は `.nox-kpi2` 系と div 行で構成され、特化表は使っていない。
- **新ギャップ**: G5 の1件。

---

## 群4 の結果（notices / audit / mine 系）＋ E1 取り残しの発見

- **G5 反映**: 上記のとおり `.nox-listrow` 新設＋4箇所適用（群3 遡及分 shift×2 含む）。
- **部品の再発明**: 走査の結果**ゼロ**（notices 20 / audit 26 / mine 28 / drink-claim 15 ほかは
  既に `.nox-panel` / `t.*` 部品を使用。残る inline は一回限りレイアウトとローカル調整）。
- **★E1 の取り残しを発見**: tsx 内に**旧パレットのリテラルが 24箇所 / 14ファイル**残存
  （E1 はトークン定義の差し替えのみで、画面側が var() でなくリテラル直書きだった箇所は届かない）。
  - **是正 17箇所**（E4 対象圏）: checkbox `accentColor:"#C9A24A"`→`var(--gold)` ×5／
    ピル地 `#23232B`→`var(--card2)` ×4／金グラデ終端 `#B8893A`→`var(--gold3)` ×4／
    金地の文字 `#0B0B0F`→`var(--on-gold)` ×3／`app/layout.tsx` の `viewport.themeColor`
    `#0B0B0F`→`#080808`（メタデータは CSS var 不可＝リテラル必須・新 --bg と同値）。
  - **残置 7箇所**: register-board ×2・reservation-panel ×3（**E5 送り**）／kiosk-register ×2（**E6 送り**）。
  - ガイド §11-5 に収載。ロジック同一は backup 比較で機械確認
    （style 除去に掛からない const 定義内の色 5ファイルは diff 目視で色値のみと確認）。
- **mine 系の実機確認**: fixture cast（NOX-VERIFY-A1a）でログインし**キャストロールで確認**。
  /mine ピル文字＝`--on-gold` 実値・/mine/wishes の `.nox-listrow` 6行＋最終行罫線 0px を計算済み
  スタイルで確認・横スクロールなし。
- **新ギャップ**: なし。

---

## E4 終了時点の総括（G1〜G5）

| # | 内容 | 裁定 | 反映 |
|---|------|------|------|
| G1 | `.nox-ptable` vs `.nox-table` | 2部品体制で正式採用（radius11/--line/.08em 是正） | 群2b・ガイド §11-1 |
| G2 | 沈んだ副パネル | `.nox-inset` 新設（非モック由来・出典明記） | 群2b・ガイド §11-2 |
| G3 | `.nox-field` 命名衝突 | `.nox-formfield` 改名＋監査手順是正 | 群2a・ガイド §11-3 |
| G4 | 機密値チップ | 意図的 inline 許容（部品化しない） | 群3・裁定のみ |
| G5 | 区切り線つきリスト行 | `.nox-listrow` 新設・4箇所適用・2箇所 E5/E6 送り | 群4・ガイド §11-4 |

