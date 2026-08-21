# R2 プルダウン全数走査（2026-08-21・報告のみ／是正実装は裁定後）

## 0. 規約（Agoora 裁定・恒久）

> **選択肢7以下の入力はボタン群（seg／チップ）にする。プルダウンは「選択肢が多く一覧できないもの」
> （キャスト・店舗・顧客・商品・席など件数可変のもの）に限って許可する。**

## 1. 走査方法

`app/**/*.tsx` と `components/**/*.tsx` の **全 `<select>`** を機械抽出（`<select>`〜`</select>` を対で取り、
`<option>` の実テキストを数える）。判定は次の2条件:

- **許可（動的）** … `xxx.map(` で選択肢を生成している、または option テキストに `{…}` 補間がある
  ＝ **件数がデータ次第で可変**（キャスト／店舗／顧客／商品／席／期間／ランク／カテゴリ 等）
- **ボタン化対象** … option がすべて固定リテラルで、その数が **7以下**

## 2. 結果（総数 81本）

| 区分 | 本数 |
|---|---|
| **許可**（動的・件数可変で一覧不能） | **51** |
| **ボタン化対象**（固定 ≤7） | **30** |
| 要確認（固定 >7） | **0** |

★固定リテラルで8個以上のプルダウンは**1本も無い**＝規約に照らすと
「許可されるプルダウン」はすべて動的なものだけになる。

## 3. ボタン化対象 30本（是正候補・裁定待ち）

| # | 箇所 | 選択肢数 | 中身 |
|---|---|---|---|
| 1 | `app/(manage)/master/cast-comp/comp-sections.tsx:175` | 2 | 円/本 ／ 率(%) |
| 2 | `app/(manage)/master/cast-comp/comp-sections.tsx:183` | 2 | 円/本 ／ 率(%) |
| 3 | `app/(manage)/master/cast-comp/comp-sections.tsx:277` | 3 | 既定 ／ 円/本 ／ 率(%) |
| 4 | `app/(manage)/master/cast-comp/comp-sections.tsx:285` | 3 | 既定 ／ 円/本 ／ 率(%) |
| 5 | `app/(manage)/master/cast-comp/comp-sections.tsx:398` | 3 | 日ごと ／ 月ごと ／ 売上% |
| 6 | `app/(manage)/master/kiosk-device-panel.tsx:128` | 2 | 打刻（タイムレコーダー） ／ レジ（会計） |
| 7 | `app/(manage)/master/norm-config-panel.tsx:70` | 2 | 本指名のみ ／ 場内+本指名 |
| 8 | `app/(manage)/master/pricing-panel.tsx:76` | 3 | 切り捨て ／ 切り上げ ／ 四捨五入 |
| 9 | `app/(manage)/master/pricing/pricing-board.tsx:711` | 4 | 卓（既定） ／ 卓 ／ カウンター ／ VIP |
| 10 | `app/(manage)/master/pricing/pricing-board.tsx:728` | 2 | 現金 ／ カード |
| 11 | `app/(manage)/master/pricing/pricing-board.tsx:1105` | 4 | 全席種 ／ 卓 ／ カウンター ／ VIP |
| 12 | `app/(manage)/master/products/products-board.tsx:647` | 3 | ドリンク ／ シャンパン ／ ボトル |
| 13 | `app/(manage)/master/products/products-board.tsx:710` | 2 | 率%（販売価格に対する割合） ／ 指名別単価（4段階） |
| 14 | `app/(manage)/master/seats/seats-board.tsx:131` | 3 | 卓 ／ カウンター ／ VIP |
| 15 | `app/(manage)/master/sensitive-tax-panel.tsx:214` | 2 | 委託 ／ 雇用 |
| 16 | `app/(manage)/master/sensitive-tax-panel.tsx:220` | 3 | 未設定 ／ 課税 ／ 免税 |
| 17 | `app/(manage)/payroll/invoice-panel.tsx:149` | 3 | 未設定 ／ 報酬 ／ 給与 |
| 18 | `app/(manage)/payroll/invoice-panel.tsx:159` | 3 | — ／ 登録 ／ 免税 |
| 19 | `app/(manage)/register/register-board.tsx:1992` | 3 | 料金 ／ 延長 ／ その他 |
| 20 | `app/(manage)/register/register-board.tsx:2014` | 2 | 割引 ／ 無料 |
| 21 | `app/(manage)/register/reservation-panel.tsx:420` | 5 | すべて（取消を除く） ／ 予約済み ／ 来店済 ／ 不来店 ／ 取消のみ |
| 22 | `app/(manage)/shift/incentive-panel.tsx:102` | 2 | 定額/人 ／ プール按分 |
| 23 | `app/(manage)/shift/shift-board.tsx:1658` | 3 | 予定 ／ 確認待ち ／ 確定 |
| 24 | `app/(manage)/staff/staff-board.tsx:317` | 2 | 黒服（staff） ／ 店長（manager） |
| 25 | `components/simulator-panel.tsx:149` | 2 | 委託 ／ 雇用 |
| 26 | `components/simulator-panel.tsx:179` | 2 | 円/本 ／ 率(%) |
| 27 | `components/simulator-panel.tsx:190` | 2 | 円/本 ／ 率(%) |
| 28 | `app/kiosk-register/page.tsx:794` | 4 | 本指名 ／ 場内 ／ 同伴 ／ フリー |
| 29 | `app/kiosk-register/page.tsx:963` | 3 | 料金 ／ 延長 ／ その他 |
| 30 | `app/mine/attendance-form.tsx:38` | 2 | 遅刻 ／ 当欠 |

### 是正時に注意が要るもの（申告）

| 箇所 | 注意点 |
|---|---|
| #24 `staff-board:317`（黒服/店長） | **権限の付与**。ボタン化は誤タップの危険が上がる＝確認を挟むか、ボタン化の対象外にするかの裁定が要る |
| #28 `kiosk-register:794`（指名種別） | **金額に直結**（本指名/場内/同伴/フリーで単価が変わる）。キオスクは触りやすい端末＝同上 |
| #10 `pricing-board:728`（現金/カード） | プレビューの条件切替＝保存はしない。ボタン化は安全 |
| #21 `reservation-panel:420` | 5択の**絞り込み**。横幅が要る（スマホで折り返す）＝チップ折返しの型が要る |
| #6 `kiosk-device-panel:128` | 端末の用途。**発行時に一度だけ**選ぶ＝ボタン化の効果は小さい |

## 4. 許可（動的）51本の内訳

店舗選択 12／キャスト選択 10／顧客・商品・席・ボトル 9／期間・計画 3／
ランク・カテゴリ・プラン 6／テンプレート・定型 3／その他（action・操作系統・曜日・METRICS 等）8。

いずれも **件数がデータ次第で増える**ため、規約どおりプルダウンのまま許可。

## 5. 今回の実装済み（R1）

`app/(manage)/shift/shift-board.tsx` の**出勤記録**（旧「出勤板」）を
プルダウン → **ボタン群5つ**（出勤／遅刻／当欠／同伴／休み）へ置換済み。
`attendance_set` の RPC・引数・値域は不変。**解除（未記録に戻す）は RPC 仕様上できない**ため選択替えのみ。
