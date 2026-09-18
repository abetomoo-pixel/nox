# モバイル M1／M2 調査（2026-09-14・読取のみ・HEAD 1e5f408・実装なし）

出典＝相談役ブロック 2026-09-14「M1 横スクロール／M2 その他ドロワー」（裁定247 の課題 M1・M2）。走査の生データ＝`docs/tmp/mobile_m1_scan.txt`（scan_m1.cjs）。

## 2. シェル骨格（app/(manage)/layout.tsx 97-129・globals.css）

```
div.nox-dark[style=t.appBg]            minHeight 100dvh・background のみ（transform/filter なし）
└ div.nox-layout                        globals 1344: display grid; grid-template-columns 238px minmax(0,1fr); min-height 100vh
  ├ aside.nox-side                      1349: position sticky; top 0; height 100vh; overflow-y auto; z-index 20（≤900 は display none＝1391）
  └ div.nox-mainwrap                    1348: min-width 0; display flex; flex-direction column
    ├ header.nox-tb                     1280: position sticky; top 0; z-index 20; height 64px; backdrop-filter blur(12px)
    └ main.nox-mainarea                 1387: padding 24px 28px 50px; max-width 1540px; width 100%; margin 0 auto（≤900 padding 20px・≤641 16px）
nav.nox-tabbar.nox-nav-bottom（TabBar・.nox-layout の外・.nox-dark の中）  202: position fixed（下記 5）
div.nox-modal-overlay（その他シート・sheet=true のときだけ）                    368: position fixed（下記 7）
```

- ≤900: `.nox-layout { grid-template-columns: 1fr }`（1391）。本文列は `minmax(0,1fr)`→`1fr`（`1fr`＝`minmax(auto,1fr)` なので min-content が広ければ列が伸びる）。ただし子 `.nox-mainwrap` に **min-width: 0 あり**（1348）＝フレックス列としては縮める。
- `.nox-mainwrap`／`.nox-mainarea`／`.nox-layout` のいずれにも **overflow: hidden／overflow-x: auto は無い**＝子の幅超過はそのまま body の scrollWidth へ漏れる。
- `.nox-mainarea` は width 100%＋max-width 1540px＋padding（box-sizing border-box＝`* { box-sizing: border-box }` 28 行目）＝自身は超過しない。

## 3. html／body／ルート要素

- `html, body`（31-38）: margin 0・padding 0・color・background・font-family のみ。**overflow-x・width・max-width の指定なし**。
- `#__next` 相当（Next App Router は body 直下に children）＝指定なし。`* { box-sizing: border-box }`（27-29）のみ。
- ⇒ 横方向のクランプは全階層に無い。どこかの子が viewport より広いと、そのままページが横スクロールする。

## 4. 横幅を主張しうる要素（全数走査＝mobile_m1_scan.txt）

- **a. 固定 px 幅 ≥400（width／min-width）**: 実ルール **0 件**（ヒット 2 件は modal.tsx のコメント内の `min-width:901px`）。
- **b. table 51 箇所**: 直前 8 行に横スクロール容器（`overflowX:"auto"`／`overflow:"auto"`／`.nox-ptwrap`／`.nox-barwrap`）が **あり 27・なし 24**。
  - なし 24 の内訳: analytics-board 1142／1214、cast-comp/comp-sections 224／336／392／615／708／762／832／956、plan-editor 72、seats-board 105、payment-panel 106、payroll-board 505／561、register-board 2810／2983、**report-board 699／989／1243**、kiosk-register/page 1037／1096、mine/ranking 49、simulator-panel 395。
  - ★注意: 「あり」に数えた `.nox-ptwrap`（1727）は **overflow: hidden**＝スクロールではなく**切り落とし**（categories／pricing×4／products／stock／receipts の 8 表）。`.nox-barwrap`（900）だけが overflow-x: auto。
  - `.nox-table`（1177）／`.nox-ptable`（1729）はともに `width: 100%`＝親幅に収まろうとして**列が潰れる**型。width 指定の無い表（report-board 989・register-board 2983・kiosk-register 1096・shift-board 1644）は**内容幅で親からはみ出す**型。
- **c. white-space: nowrap**: CSS 34 行＋tsx 53 行。table 内は tsx 20 行（cast-register／kiosk-device／kiosk-pin／printer／payroll-list／drink-claim-queue／register-board 2866・2882／shift-board 1658／report-board 1275／comp-sections 229）＋CSS の `.nox-ptable .col-*` 2 行。非 table は ellipsis 付きの `min-width:0` 型（無害）と `.nox-stpill`／`.nox-stbadge`／`.nox-seg a`／`.nox-histrow .a` 等のバッジ・数値（短文・無害）。**横幅を決める主因になる nowrap は table 内の 20 行**（例: report-board 1275 の締め担当セル）。
- **d. grid-template-columns に固定 px**: **1 件**＝analytics-board 1052 `26px repeat(24, 22px)`（＝602px＋gap 46px＝648px の時間帯ヒートマップ・/analytics のみ）。CSS の `1fr 380px`（1108）は min-width 900 の中だけ。
- **e. 100vw**: **0 件**。`position: fixed` は `.nox-tabbar`（202）・`.nox-modal-overlay`（368）・`.nox-toast`（446）の 3 つ＝いずれも left/right 0 or inset 0 で viewport 基準・幅超過なし。

## 5. 下タブ（モバイルのタブバー）

- 実装: components/ui/nav.tsx 61-72 `<nav className="nox-tabbar nox-nav-bottom">`（4 本＋「その他」button）。描画元＝(manage)/layout.tsx 128 `<TabBar … hideSide />`。
- CSS（globals 202-218）: `position: fixed; left 0; right 0; bottom 0; z-index 30; display flex; justify-content space-around; padding: 9px 2px calc(9px + env(safe-area-inset-bottom)); background rgba(13,13,18,.92); backdrop-filter blur(14px); border-top; max-width: var(--wrap-max, 520px); margin: 0 auto`。`.nox-dark` で `--wrap-max: 1180px`（48）＝モバイルでは実質全幅。
- safe-area: `env(safe-area-inset-bottom)` を padding-bottom に加算・app/layout.tsx 72 `viewportFit: "cover"`。
- ★本文側の逃げ余白: `.nox-main`（198）は `padding-bottom calc(96px + safe-area)` だが、(manage) シェルの `.nox-mainarea` は ≤900 で `padding: 20px`（1393）＝**下タブ分の逃げが無い**（M7 の領域・本調査の対象外だが記録）。

## 6. 日報プレビュー表（/report 日報タブ「プレビュー（クライアント集計…）」）

- 実装: app/(manage)/report/report-board.tsx **989-1000**。`<table style={{ borderCollapse: "collapse", fontSize: 13 }}>` の **1 行 10 セル**（伝票／組客数／同伴／未会計／現金／カード／カード手数料（日報集計用）／売掛／その他／ドリンク/シャンパン売上）。各 td は `padding: 4px 12px; borderRight` で **幅指定なし・width:100% なし・親 `.nox-panel`（1100・overflow 指定なし）に横スクロール容器なし**。
- ⇒ 内容幅（ラベル最長「カード手数料（日報集計用）」「ドリンク/シャンパン売上」を含め約 700〜850px）で確定し、iPhone 幅（375〜430px）では**panel からはみ出して body の scrollWidth を広げる**。
- 同ページの締め済み一覧表（**1243-1280**）は `width: 100%` で **18 列**（営業日／伝票／客数／現金／回収現金／カード回収／その他回収／カード／カード手数料／売掛／ドリンク売上／未会計／諸経費／現金支払／実査差異／再締め回数／締め担当／操作）。th は `t.th`（220・nowrap なし・padding 6px 10px）。
- **IMG_3092（列見出しが 1 文字ずつ縦）の原因候補**: この 18 列表が `width:100%` で約 340px の panel 幅に収まろうとし、`table-layout: auto` のもと各列が min-content（CJK は 1 文字）まで潰れる＝見出しが 1 文字／行に折り返される。nowrap を付けると今度は表が親をはみ出す（→ b の「内容幅型」へ転じる）ので、**横スクロール容器で包むのが正**。

## 7. 「その他」ドロワー（M2）

- 実装: components/ui/nav.tsx **75-98**。`TabBar` 内の `sheet` state。ルート＝`<div className="nox-modal-overlay" onClick={close}>` ＞ `<div className="nox-modal-card nox-cardtop nox-navsheet" onClick={stopPropagation}>`（ハンドル・h2「メニュー」・群ごとの Link 一覧）。
- ルート `.nox-modal-overlay`（368-379）: `position fixed; inset 0; z-index 50; background rgba(0,0,0,.62); backdrop-filter blur(4px); display flex; align-items center; justify-content center; padding 18px`。≤900（389-393）: `align-items flex-end; padding 0`。
- カード `.nox-modal-card`（380-383）: `width 100%; max-width var(--nox-modal-max,430px)`。≤900（394-400）: `max-width none; --nox-modal-radius: 16px 16px 0 0; --nox-modal-pad-b: calc(15px + safe-area); animation nox-sheet-up`。`.nox-navsheet`（1971）: `max-width 520px`。
- **height の指定なし**（dvh／vh とも）・**overflow なし**・**background なし**（下記 10）。

## 8. z-index 全数（同ページで有効になり得るもの）

| 値 | セレクタ／箇所 | position | 備考 |
|---|---|---|---|
| 60 | `.nox-toast`（446） | fixed | pointer-events none（.show 時のみ表示）＝**ドロワー 50 より上**だが常時は不可視 |
| **50** | **`.nox-modal-overlay`（368）＝その他シート** | fixed | |
| 30 | `.nox-tabbar`（207）＝下タブ | fixed | |
| 30 | stock-board 93／register-board 2125（inline） | absolute | 別ページ |
| 20 | `.nox-tb`（1281）topbar・`.nox-side`（1352）・`.nox-topbar`（188・旧）・plan-board 106（inline sticky） | sticky | |
| 5 | `.nox-backbar`（1524） | sticky | register |
| 4 | `.nox-checkview .nox-payrow`（1553・≤641） | sticky | register |
| 1 | `.nox-table.sticky th`（1183）・`.nox-formmodal-foot`（521） | sticky | |

- ドロワー（50）より大きいのは `.nox-toast`（60）のみ＝トースト表示中は重なるが背景透過の原因ではない。**stacking context の罠は無い**（祖先 `.nox-dark`／`.nox-layout` に transform／filter／will-change なし・`.nox-tb` の backdrop-filter は兄弟）。

## 9. 閉じる手段

- 背景タップ: **あり**（overlay onClick → setSheet(false)・カードは stopPropagation）。
- 項目タップ: あり（Link onClick で setSheet(false)）。
- **× ボタン: なし**。**Esc: なし**（keydown リスナ無し）。ドラッグで閉じる: なし（ハンドルは装飾のみ）。

## 10. 背景が透けて見えた原因の候補

1. **★最有力: シートのカードに地色・余白・角丸が一切当たっていない**。`components/ui/modal.tsx` は `t.card`（gradient 地・border・padding 15・overflow hidden）と `--nox-modal-radius`／`--nox-modal-pad-b` を **inline で** 当てるが、nav.tsx のシートは Modal 部品を使わず className（`nox-modal-card nox-cardtop nox-navsheet`）だけを借りている。CSS 側の `.nox-modal-card` は width／max-width／animation と **CSS 変数の定義**しか持たず、変数を消費する inline style が無い＝**background 未指定・padding 0・角丸 0**。結果、rgba(0,0,0,.62)＋blur(4px) の overlay の上に、リンク（`.nox-navsheet-i`＝各自 `var(--v2-panel2)` の地）だけが**素の overlay 越し**に並び、ページ本文が透けて見える。PC でも同じだが、中央配置＋430px 幅で「浮いた一覧」に見えるだけで気づきにくかった。
2. overlay 自体の透過（rgba .62・blur 4px）＝仕様どおり（Modal 部品と同じ）。
3. dvh／height 未指定＝項目数 9 前後なら溢れないが、**将来項目が増えると上に伸びて画面上端を超える**（max-height 未設定）。

## 11. 結論と直し方

### M1（横スクロール／本文が左半分に寄る／IMG_3092 の 1 文字縦見出し）

- **最有力の原因 1 つ**: `/report` 日報タブの **プレビュー表（report-board 989・幅指定なし・10 セル 1 行・横スクロール容器なし）** が内容幅（約 700〜850px）で panel をはみ出し、`html/body`／`.nox-mainarea`／`.nox-mainwrap` のどこにも overflow クランプが無いため body の scrollWidth を広げる。横スクロールすると他の要素（viewport 幅で組まれている）が左に寄って「本文が左半分」に見える。IMG_3092 の 1 文字縦見出しは同ページの **締め済み一覧表（1243・width 100%・18 列）** が親幅に潰れたもの＝同じ「表の実幅」問題の裏面（片方は広がり、片方は潰れる）。
- **直し方の候補（影響範囲つき）**:
  - (A) **表ごとに横スクロール容器で包む**＝共通クラス `.nox-tablewrap { overflow-x: auto; -webkit-overflow-scrolling: touch; max-width: 100% }` を globals.css に 1 本足し、b の「なし 24」（優先＝report-board 989／1243／699・register-board 2810／2983・kiosk-register 1037／1096・payroll-board 505／561・analytics 1142／1214・mine/ranking・simulator・comp-sections 8・plan-editor・seats・payment-panel）を包む。潰れる型（width 100%）には `th { white-space: nowrap }` を併せて付けると列幅が自然幅になり、容器内でスクロールする。**影響＝表の外観のみ・DB／RPC 不触・新トークン 0**。各表 1〜2 行の client 変更（画面数 11）。
  - (B) **安全網**＝`.nox-mainarea { overflow-x: hidden }`（または `html, body { overflow-x: hidden }`）を ≤900 の @media に 1 行（裁定247 で @media 可）。ページの横スクロールは止まるが、はみ出した表は**切れて見えなくなる**＝(A) と併用する前提の保険。影響＝シェル 1 行。★sticky（`.nox-tb`）は overflow の付いた祖先内でも動くが、`.nox-mainarea` に overflow を付けると **中の sticky（.nox-backbar・.nox-payrow・.nox-table.sticky th）の基準が mainarea になる**＝register の sticky 群は要再確認。html/body 側に付ける方が副作用が小さい。
  - (C) `.nox-ptwrap` の `overflow: hidden` を `overflow-x: auto` に変える（8 表・切り落とし→スクロール）。影響＝マスタ系 8 表の外観のみ。
  - (D) analytics のヒートマップ（1052・固定 648px）は (A) の容器で包む（1 箇所）。
  - 推奨順＝**(A) report-board 3 表＋(B) html/body の overflow-x:hidden を M1 レーン 1 本で入れて再撮影** → 残り 21 表と (C)(D) は次レーン。

### M2（「その他」ドロワーが崩れる・背景が透ける）

- **最有力の原因 1 つ**: nav.tsx のシートが **Modal 部品を経由せず className だけを借りている**ため、カードの地色・padding・角丸（Modal が inline で当てる `t.card`＋CSS 変数の消費）が**一つも当たっていない**（§10-1）。
- **直し方の候補（影響範囲つき）**:
  - (A) **nav.tsx のシートを `components/ui/modal.tsx` の `<Modal onClose={…} maxWidth={520} scroll>` に置き換える**＝地色・border・padding 15・角丸（≤900 は上のみ）・safe-area 下余白・高さ上限（scroll＝88vh）・背景タップ閉じが全部そろう。中身（handle／h2／群一覧）はそのまま。影響＝nav.tsx 1 ファイル（TabBar は /mine でも使うため /mine の「その他」も同時に直る＝副作用は良い方向）。**ハンドルは Modal が描くので nav.tsx の `.nox-modal-handle` 行は削る**（二重描画防止）。
  - (B) Modal を使わず CSS で `.nox-navsheet { background: var(--card); border: 1px solid var(--line); padding: 15px; border-radius: var(--nox-modal-radius,16px); padding-bottom: var(--nox-modal-pad-b,15px); max-height: 88dvh; overflow: auto }` を足す＝globals.css 1 ブロック・nav.tsx 不触。影響最小だが Modal と二重の実装になる。
  - (C) 併せて **× ボタン（`.nox-formmodal-x`＝既存）と Esc（keydown）** を足す＝閉じる手段の欠落（§9）の解消。影響＝nav.tsx のみ。
  - 推奨＝**(A)＋(C)** を M2 レーン 1 本で。dvh は Modal の scroll オプション（`max-height: 88vh`）で足りる（裁定247 で必要なら `88dvh` へ 1 行）。

### 共通の注記

- html/body・シェル 3 層に横方向クランプが無いのは設計上の空白（モックにも無い）。(B) の 1 行は「はみ出しを見えなくする」だけで根治ではない＝(A) の表包みが根治。
- 新トークン 0・ui-tokens baseline 56 不変で収まる見込み（色・余白は既存トークンのみ）。
- 244／247 との整合: 表の横スクロール容器は「切替・固定バー」ではないので 244 の対象外。@media の追加は 247 で可。
