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

## E5a 検収の制約（データ都合・構造確認で代替）

- 予約タブ: 当日 booked 0件＝ステータスピル・来店/編集 inset の実描画は未確認
  （変更は const 色値と className のみ・logic check OK で代替）。
- ボトルキープ行・ドリンク申告表: 0件表示（行・表とも非描画）。検収データを作ると
  bottle_keeps/drink_claims に痕が残るため見送り＝同一部品クラスの実描画は
  他画面（E4 実機確認済み）と共通。
