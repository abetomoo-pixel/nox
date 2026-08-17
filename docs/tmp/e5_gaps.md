# E5 部品ギャップ記録（相談役裁定待ち・2026-08-17 起草）

E4-3 と同じ規律: **E3/E4 部品で表現できない意匠はその場で発明せず**現状維持のまま記録する。

---

## 裁定0の記録（E5a 指示によるスコープ確定）

- **レジのビュー構成差は E5 で追随しない**: 現行はタブ2値（卓席・会計/予約）＋伝票内3タブ
  （注文/指名・席/会計）。モック register-pos の3〜4面相当・会計の段の切り方への追随は
  presentation-only を超える構造変更＝別裁定。
- **浮遊 toast の見送り継続**: 部品値の適用は E3 済み・位置（27箇所のレイアウト）は不触のまま。

## H1. register-board の POS 明細表（:1027）は `.nox-table` へ寄せない（現状維持・裁定待ち）

- 現物: 注文タブの明細 `<table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>`
  ＋各セル `padding:6`・行罫線 `--line`。
- `.nox-table` に寄せない理由:
  - **密度が意匠**: 部品は td `padding:11px 12px`（＋外枠 `.nox-tablewrap`）。POS 明細は
    `padding:6` の高密度で、注文しながら明細を一覧する画面。部品化で行高が約2倍になる。
  - **行内に操作 UI を内蔵**: 削除ボタン・「キャストに付ける」セレクト・取消ボタンが
    セル内に埋まる＝`.nox-table` の hover 行変色（`--card2`）と操作の視覚が干渉する。
  - 同ファイルの会計タブ表（:1121）は **`t.th`/`t.td`（E3 theme 部品）を既に使用**＝不触。
- 提案: G1（`.nox-ptable` 2部品体制）と同じ扱いで「POS 特化表」として維持するか、
  `.nox-table` に密度修飾（`.dense` 等）を足すかの裁定。

## E5a で置換したもの（ギャップではない・記録のみ）

- E4 申し送り: `.nox-listrow` 2箇所（bottle-keep:89 は padding 5px 0 を上書き維持・
  incentive:83 は素の部品値）。
- 旧リテラル 6箇所是正（E4 申し送り5＋走査辞書外1）: register-board:1236-1237
  `#C9A24A`→`var(--gold)`・`#23232B`→`var(--card2)`／reservation-panel:33 STATUS_COLOR
  `#C9A24A`→`var(--gold)`・`#9A9AA8`×2→`var(--sub)`・**`#7FC79B`→`var(--ok)`**
  （旧 ok 緑＝E4 走査の12色辞書に無く未計上だった6件目）／:77 `#23232B`→`var(--card2)`。
- 再発明の部品置換 2種:
  - register-board:670 `segBtn`（コメント自認「.seg 相当を inline で」・旧リテラル
    `#1F1B12`/`#14120C` 含み）→ **`.nox-seg` 部品**へ。POS タップ標的の flex:1／
    fontSize 13／padding 9px 10px のみローカル上書き。
  - drink-claim-queue:101 手組みテーブル → **`.nox-tablewrap`/`.nox-table`**
    （元の全列左寄せを `textAlign:"left"` 上書きで維持＝数値列の Outfit は `.num` から）。
  - reservation-panel:361/388 沈み面（bg2/line2/radius11 手組み）→ **`.nox-inset`**
    （padding 10 上書き・G2 部品の3・4例目）。

## I1. errBox（t.alert）の面3値は現状維持（E5b・裁定待ち）

- 現物: `theme.ts alert` = `#2C1B1B`（地）/`#5A2E2E`（枠）/`#F0B9B9`（文字）。使用12箇所
  （payroll-board 確定不可・payment-tax-panel 注意行・casts/staff PW 表示ほか）。
- E4-0 の「白地印刷の都合で E5 送り」は**実態と不一致だった**: t.alert は印刷経路
  （`.nox-print` 配下）に一切登場しない＝印刷都合ではない。
- モック13枚走査: この3値は無い（非モック由来）。モックの警告面は `.card.kpi.warn` 等で
  別意匠。**アプリの状態色は文字色 `--bad` のみで「警告の面（bg/border/text 3値）」の
  トークンが存在しない**。
- 提案: (a) `--bad-bg/--bad-bd/--bad-ink` の3トークン新設（products-board:892 の
  `rgba(220,80,80,.10)` 上書きも吸収候補）か、(b) `.nox-alert` 部品化か、(c) 現状維持。
  新トークン/新部品の起草は裁定事項のため E5b では不触。

## I2. avatar の HSL 生成色は是正対象外（E5b・記録のみ）

- `theme.ts avatarBg()` = name ハッシュ由来の HSL グラデ＝**パレット色ではなく機能色**
  （identicon・同名同色の決定性が意匠）。印刷経路にも不在（payslip にアバター無し）。
- パレット走査の対象から恒久に外す（E4-0 の「E5 送り」リストの3件目はこれで解消）。

## E5b で置換・是正したもの（ギャップではない・記録のみ）

- **--champ 裁定反映**: 値を `#E6D6A8`→`#f0cf82`（--gold2 同値）へ。名前・65箇所参照は
  不触＝別名として存置（ガイド §1-1/§1-3 裁定1 を更新・暫定マーク解消）。
- **slipHd の #0E0E14**（帳票3種の1件目）: 印刷側は `.ps-hd` の**クラス反転**で literal に
  依存しない＝分離可能を確認し、画面側のみ `var(--card)` へ是正（#0E0E14→#11110f・
  E4 の #23232B→--card2 と同規模の旧青み暗色の是正）。**印刷出力不変の証明**:
  (a) 実機 /payroll で 2026-07 paid run のスリップ6枚を読み込み、@media print ルールを
  同一詳細度で一時適用するカスケード実測＝ps-hd 白地黒字/ps-foot 白地黒枠/champ 参照行 黒。
  (b) 実 DOM＋実 CSS のスナップショットを headless Chrome の印刷エンジンで PDF 化
  （window.print() と同一レンダリングパス）＝6ページ・1人1枚・白地・print パレット
  （#e6dcc0 の slipSec 罫のみ有彩）・暗色フィル 0 件。
  (c) slipHd を旧値 #0E0E14 に戻した対照スナップショットの PDF と**描画コンテンツ
  SHA256 完全一致**（メタデータ除く content stream 比較）＝1px どころかバイト同一。
- **t.cardTitle 再発明 6箇所**を本定数へ（D-1 の「D-2 で 35 箇所を本定数へ置換する」の
  payroll 圏分）: payroll-board:471（bad 変奏）/:496/:523・payment-panel:92・
  payment-tax-panel:74（15px 変奏）・invoice-panel:98（同）。margin/fontSize/color は
  ローカル上書きで**算出値は全箇所不変**。
- payroll 圏の旧パレットリテラル: **ゼロ**（hex 走査で該当なし）。表は全て E3 の
  t.th/t.td 使用済み＝部品再発明なし。合計バー（payroll-board:453）は段0R 第3陣の
  裁定済み意匠＝不触。

## E5a 検収の制約（データ都合・構造確認で代替）

- 予約タブ: 当日 booked 0件＝ステータスピル・来店/編集 inset の実描画は未確認
  （変更は const 色値と className のみ・logic check OK で代替）。
- ボトルキープ行・ドリンク申告表: 0件表示（行・表とも非描画）。検収データを作ると
  bottle_keeps/drink_claims に痕が残るため見送り＝同一部品クラスの実描画は
  他画面（E4 実機確認済み）と共通。
