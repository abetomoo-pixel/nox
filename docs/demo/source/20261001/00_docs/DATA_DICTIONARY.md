# データ形式

詳しい列一覧は `field_dictionary.csv`、型一覧は `dataset_schemas.json` です。
IDはこのパッケージ内で安定する文字列です。NOX本体のUUID等へは対応表で変換してください。

- `*_yen`：整数円。参考平均額だけ小数を含みます。
- `*_bps`：率の1万分率。1000＝10%、2500＝25%。
- `*_target` / `*_target_yen`：未検証の集計・表示の案。
- `*_arithmetic` / `*_reference`：入力値からの参照計算。本体の確定値ではありません。
- `null`：不明・未定・未適用。0や空文字へ置き換えて計算しないでください。
- 日付：YYYY-MM-DD。日時：ISO 8601、タイムゾーン+09:00。
- 営業日と実カレンダー日は別概念です。深夜のヘッダー案は翌日の日付を保持します。

`stock_tracking=false` の商品の発注点はnullです。
バックなしは `back_mode=none`。固定額は `by_nomination`、率は `percentage` です。
`01_master/products` の会計区分と表示カテゴリは別管理です。
料金・チャージの明細は商品とは別で、伝票では `line_type=fee`、`product_id=null` になります。

店舗別ファイルは同じデータをstore_idで抽出した閲覧・取込用コピーです。
全体版と店舗別版を両方取り込むと重複するため、どちらか一方を使用してください。
