# NOX C3/C4 税・会計ルール設計書 v1（ロック済み）

2026-08-28 相談役起草・同日 Agoora 裁定（§8 の5点すべて推奨案で確定）により**ロック**。
根拠: 税理士 T4〜T6 回答（docs/expert/）・docs/dp/survey_c34.md・docs/dp/survey_c34_tax.md・
裁定36/79/82/87。設計変更は本書の版を上げてから（正本は repo 収蔵版）。

**実測が示した現在地**: 実装は既に「値引き後課税・一伝票×税率×1回の端数」に適合しており、
「TAX込み調整＝非課税」はモックのサンプル1行にのみ存在する。本レーンは**新造ではなく
「固定値の設定化（内税固定→切替可）＋税区分の器＋準備中の解錠」**である。

---

## 0. 位置づけ・依存・非目標

- レーン順: C1/C2 の前（v18 §3）。P-2/P-3/P-4 残差は本レーンの後（v17 §5・不変）
- **money 三面鏡レーン**: 挙動段は check-calc.ts / receipt.ts / check_close 系を**同時に**変える。Fable 5
- 非目標: 源泉・給与の丸め（T1/T2 未回答・payroll 側）・retention（RT レーン）・
  複数税率レシートの完全対応（裁定90-②により F5 差し替え点へ）・QR/F5 系

## 1. 設計原則

1. **税区分は取引の性質で決まる**（T4）。店舗が自由に「非課税」を選べる UI にしない。
   通常項目の既定は `taxable_10`・例外は限定選択肢
2. **価格表示方式と事業者区分は別軸**（T5）。「内税/外税/適用しない」の同列3択は解体
3. **端数は伝票×税率ごとに1回**（T5）。現行実装は既に適合＝この性質を assert で固定し、
   以後の変更が壊さないようにする
4. **カード手数料は2種に分離**（T6）: `merchant_fee`（加盟店手数料・非課税・伝票外・日報側）と
   `card_surcharge`（客への転嫁・taxable_10・伝票行）。転嫁可否は加盟店契約次第＝
   **NOX は適法性を保証せず、裁定87 第2層（警告＋確認）を適用**
5. **既定値は現行挙動と同値**にする（内税・floor・taxable_10・card_surcharge なし）＝
   mig 段で golden 6値不変を成立させる

## 2. スキーマ（確定）

### 2-1. 店舗設定の4分離（C4・stores への列追加）

| 列 | 値 | 既定（=現行挙動） |
|---|---|---|
| `business_tax_status` | `taxable` / `exempt` | `taxable` |
| `price_display` | `tax_included` / `tax_excluded` | `tax_included` |
| `invoice_status` | `registered` / `unregistered` | `unregistered` |
| `invoice_reg_no` | text null（T + 13桁の形式チェック） | null |
| `tax_rounding` | `floor` / `round` / `ceil` | `floor`【裁定90-④】 |

- ガード: `invoice_status='registered'` は `business_tax_status='taxable'` のときのみ許可
  （適格請求書発行事業者は課税事業者に限る・RPC で拒否）
- `exempt` 店舗: レシートに税額区分記載を出さない・登録番号欄なし
- 既存 `round_unit` / `round_mode`（店設定丸め＝金額側）は**不変**。`tax_rounding` は税額専用の新設

### 2-2. 料金項目の税区分（C3）【裁定90-①②】

- **line 発生源のマスタに `tax_category` を持たせ、check_lines へスナップショット**する二段構え
  （伝票凍結の既存原則と同型・後からマスタを変えても過去伝票が動かない）【①確定】
- 語彙: `taxable_10` / `taxable_8` / `exempt` / `out_of_scope` の4値（**enum 完備**）
- **UI 露出は v2.0 では `taxable_10` / `exempt` / `out_of_scope` の3値**。`taxable_8` は
  enum に存在するが UI 準備中（複数税率レシートの完全対応と同時に解錠＝F5 差し替え点・
  解錠に mig 不要）【②確定】
- 対象マスタの全数は **mig C3-1 設計の前提実測**で確定（pricing_rules・商品系・サービス料設定。
  「check_lines を作る経路」の全数列挙・教訓42 型で中身まで）
- `calculation_type`: 実装は discount 既存・adjustment は discount の別名運用が現実。
  新 kind の追加は最小限とし、既存 kind 体系との対応表を mig 設計時に固定

### 2-3. card_surcharge（C3・T6-B）【裁定90-⑤＝本レーンで実装】

- 客への転嫁項目。`tax_category='taxable_10'` 固定・percentage 型
- **裁定87 第2層適用**: 有効化時に「加盟店契約でカード手数料の転嫁が禁止・制限されている場合が
  あります。契約上の可否を確認してください」警告＋確認記録。既定=無効
- `merchant_fee` は伝票に入れない。既存の日報側 `card_tax_rate` 系は現状維持（本レーン外）

### 2-4. モック是正（M-10 型・裁定36）

- `nox-pricing-settings.html:166` の「TAX込み調整（非課税）」サンプル行を削除または
  discount 表現へ修正（実装が正・モックを直す）
- 会計ルールタブの「内税/外税/適用しない」3ボタンを「価格表示2値＋事業者区分」の
  2軸表現へ描き直し（§2-1 対応）
- モック正本（rate-settings-redesign vs pages-2026-08）は survey_c34_tax.md 4a の差分材料で
  UI 段冒頭に確定させ、裁定として台帳へ

## 3. 計算順（確定・T5）

```
① 行の金額（内税なら税込・外税なら税抜）
② 値引き・調整（discount / adjustment）
③ 税率別に集計（v2.0 は実質 10% と 非課税/不課税）
④ 税額算出（内税: 込み額×10/110 ／ 外税: 抜き額×10/100）
⑤ 税率ごとに端数処理1回（tax_rounding 設定・既定 floor）
⑥ 請求額
```

- 現行の3層各1回（サ料 roundYen → 店設定丸め → 税 floor）の構造は維持し、
  ④⑤の固定値（内税・floor）を設定参照に置換するのが挙動段の本体【③確定＝内税/外税とも実装】
- **「伝票×税率×1回」を新 assert で固定**（現行適合の性質を将来に対して係留）

## 4. レシート（適格簡易請求書・T5）

- `registered`: 発行者名・登録番号・日付・取引内容・税率ごとの対価・適用税率/税額 の6要件
  （単一税率10%内税なら現行 receipt.ts は既に6要件充足＝差分は登録番号欄と外税表示のみ）
- `unregistered` / `exempt`: 通常レシート（登録番号なし・exempt は税額区分なし）
- 複数税率の同時表示は taxable_8 解錠まで対象外

## 5. golden・verify 計画

- 動くのは **52 のみ**（receipt 系）。**51 は書込 RPC 新設時に課金ゲート名簿の本数として動く＝
  想定内として台帳に予告**。5931/125802/55233/64 は不関与を注記 assert で固定
- 二段構え:
  1. **mig 段**: 列追加＋既定値=現行挙動。**golden 6値不変が受け入れ条件**
  2. **挙動段**: 設定参照への置換＋外税経路＋レシート差分。三面鏡同時変更・52 張り替えは
     ここでのみ・新旧値の差分根拠を台帳に残す
- 逆張り必須・2回連続緑

## 6. 実装順（ロック後）

0. **前提実測**: check_lines を作る経路の全マスタ列挙（tax_category 対象の確定）
1. mig C3-1: stores 4分離列＋マスタ tax_category＋check_lines スナップショット列＋
   card_surcharge 器（全て既定=現行挙動・golden 不変）
2. 読み経路: check-calc.ts / receipt.ts の設定読み出し（既定値なら1バイト同値）
3. 書込 RPC: `set_store_tax_config` 新設（registered⊂taxable ガード込み）・
   `set_pricing_rule` へ tax_category 追加（14引数化・旧署名 DROP 明示）・
   課金ゲート名簿＋billing pin 同時更新（教訓21・51 が動く）
4. 挙動段: 三面鏡同時変更（内税/外税・tax_rounding・税区分別集計・レシート）＝ **Fable 5**
5. UI 段: モック正本確定 → 会計ルールタブの準備中解錠（2軸表現）→ モック是正（M-10 型）
6. card_surcharge 結線（警告＋確認記録・裁定87 第2層）

## 7. 開いている外部点

- T1/T2（源泉 days・丸め方向）: payroll 側・本レーン非依存・催促継続
- taxable_8 の解錠時期: F5 差し替え点として据え置き

## 8. 裁定記録（2026-08-28 確定＝裁定90）

| # | 論点 | 確定 |
|---|---|---|
| ① | tax_category の置き場 | **マスタ＋check_lines スナップショット** |
| ② | taxable_8 | **enum 完備・UI 準備中**（F5 で mig 不要解錠） |
| ③ | 外税対応 | **内税/外税とも挙動段で実装**（既定 tax_included） |
| ④ | tax_rounding 既定 | **floor**（現行同値・mig 段 golden 不変の要） |
| ⑤ | card_surcharge | **本レーンで器＋警告まで実装** |
