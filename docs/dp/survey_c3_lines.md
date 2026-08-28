# mig C3-1 前提実測 — check_lines に行を作る経路の全数

読み取り専用調査（2026-08-28）。**設計はしない**。dev DB = mig0001〜0110。
C34設計書 v1 §6-0 の前提実測（tax_category を持たせるマスタの確定材料）。

## 結論（3行）

1. **check_lines に行を作る経路は DB 関数7本のみ**（`prosrc` の insert 文機械検索・22関数中7本が insert 持ち）。
   app/lib はすべて SELECT（grants=SELECT のみ＋書込ポリシー無しの構造どおり）・seed は削除のみ・
   verify 8箇所の admin 直 insert は service 経路の fixture 工作で運用外。
2. **単価の出所は5系統**＝products／pricing_rules（帯・ランク）／stores の料金列（hon/jonai/dohan/set/ext）／
   checks 上の凍結スナップ／手入力。**tax_category の置き先は「products＋pricing_rules＋stores 由来行の既定」の
   3点で全経路を覆える**（discount は行区分側・T4 回答どおり税区分を持たせない）。
3. **7本の insert は全て列指定**（`insert into check_lines (org_id, …) values`）＝
   **スナップショット列を default 付きで追加しても既存 insert は1本も壊れない**。
   ★ただし NOT NULL・default なしで足すと7本全部＋verify 直 insert 8箇所が即死する＝default 必須。

## a. 全経路の列挙（insert 文の実測・教訓42 型）

| # | 経路 | insert 本数 | insert する列 |
|---|---|---|---|
| 1 | `check_open(uuid,int,text,uuid,uuid)` | 1 | 基本12列＋`time_auto, fee_kind, block_no`（15列） |
| 2 | `check_add_line(uuid,uuid,int,text,text,text,int)` | 1 | 基本12列 |
| 3 | `check_extension_add(uuid,uuid)` | 1 | 基本12列＋`time_auto, fee_kind`（14列） |
| 4 | `check_time_charge_apply(uuid)` | 3 | 基本12列＋`time_auto, fee_kind, block_no`（15列）×3 |
| 5 | `check_dohan_add(uuid,int)` | 1 | 基本12列＋`fee_kind, cast_id`（14列） |
| 6 | `check_shimei_add(uuid,uuid,text)` | 1 | 基本12列＋`fee_kind, cast_id`（14列） |
| 7 | `approval_apply(uuid)` | 1 | 基本12列 |

基本12列 = `org_id, store_id, check_id, product_id, kind, pay_group, name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot, sort_order`

**RPC 以外の経路**:
- **app/lib 直書き: ゼロ**（`from("check_lines")` の実測は register-board/report-board/print poll の SELECT のみ）
- **seed: ゼロ**（seed-f0:90／seed-demo:91 は削除のみ。demo の伝票は「実 RPC の副産物」と明文）
- **verify の admin 直 insert: 8箇所**（analytics-t4:163／anon-guard:3728,5288,5295／payroll:162／
  pricing-apply:218／rate-back:274／set-people:336）＝**service 経路の fixture 工作**。
  列指定 insert なので新列 default があれば無傷だが、**スナップショット値の検証対象からは漏れる**
  （fixture が新列を書かない＝mig C3-1 の verify 設計で意識する点）

## b. 行種（kind）と単価/金額の出所マスタ

| 経路 | kind（実測リテラル） | fee_kind | 単価/金額の出所 |
|---|---|---|---|
| check_open | `set`（time_auto 行・block_no=0）／nom_type=dohan 時 `charge` | `set`／`dohan` | **pricing_rules**（帯解決＝pricing_resolve 系写経・survey_c34 起票#30 の写経箇所）→無帯なら **stores.set_fee**。dohan は **stores.dohan_fee** |
| check_add_line | 商品パス: `v_prod.type`＝**drink/champ/bottle**／カスタムパス: `set/time/charge/custom`（p_kind 検証） | — | 商品パス: **products.price**（back_snapshot も products 由来で凍結）／カスタム: **手入力 p_unit_price** |
| check_extension_add | `time`（ブロック行） | `extension` | **checks 上の凍結スナップ（ext_snap 系）**←起源は stores.ext_fee／pricing_rules 帯 |
| check_time_charge_apply | `time`（set 行＋ext ブロック行） | `set`/`extension` | 同上（checks 凍結スナップ。apply 時に now() 再計算） |
| check_dohan_add | `charge` | `dohan` | **stores.dohan_fee** |
| check_shimei_add | `charge` | `hon`/`jonai` | **pricing_rules**（rank_id 行＝ランク別絶対額・裁定79）→無ければ **stores.hon_fee/jonai_fee** |
| approval_apply | `discount` | — | **手入力**（approval_request の申請額・free は対象 group の全額） |

**tax_category の置き先候補への含意**（列挙のみ・裁定しない）:
- **products**（drink/champ/bottle＝商品パス）と **pricing_rules**（set/extension/hon/jonai/dohan の帯・ランク行）に
  持たせれば、マスタ由来の行は覆える
- **stores の料金列フォールバック**（set_fee/ext_fee/hon_fee/jonai_fee/dohan_fee・dohan_add/shimei_add の無帯経路）と
  **カスタム行（手入力）**はマスタ行が無い＝**「既定 taxable_10」の規定で覆う**形になる
- **discount は税区分を持たない**（T4 回答＝課税売上への値引きとして税額に反映・行区分は kind 側で既に分離済み）

## c. check_lines 現行18列と追加時の安全性

`id / org_id / store_id / check_id / product_id(null可) / kind / pay_group(def) / name_snapshot /
unit_price_snapshot / qty / line_total / back_snapshot(null可) / sort_order(def) / created_at(def) /
time_auto(def) / fee_kind(null可) / cast_id(null可) / block_no(null可)`

- **`select *` 型の insert は존재しない**＝7本すべて列指定 → **列追加そのものは安全**
- 過去2回の列追加前例と同型: `time_auto`（mig0052・default false）・`block_no`（mig0089/0097・null 可）＝
  どちらも default/null 可で既存経路無改修だった
- 読取側の列挙 select（register-board:422 など）は新列を**読まないだけ**＝無傷

## d. 商品系マスタの全列（tax_category 置き先候補）

| テーブル | 列数 | 全列 |
|---|---|---|
| **products** | 18 | id, org_id, store_id, **type**(drink/champ/bottle…), category(deprecated), name, **price**, back_mode, back_value, unit4_json, hon_pt, is_active, created_at, updated_at, reorder_point, category_id, back_exempt_from_split, sort_order |
| product_categories | 7 | id, org_id, store_id, name, sort_order, is_active, created_at |
| product_costs | 6 | product_id, org_id, store_id, cost, created_at, updated_at |
| bottle_keeps | 13 | id, org_id, store_id, customer_id, product_id, opened_at, status, note, …（**価格を持たない**＝ボトルの行は check_add_line 商品パス経由で products.price） |
| （参考）pricing_rules | 16 | survey_c34 実測どおり。fee_kind 行＝set/extension/dohan＋rank_id 行 |

★カテゴリ単位（product_categories）に持たせる案は**経路実測上は不成立**＝check_add_line は
products 行しか読まず category_id を経由しない（凍結の単位が商品）。置くなら products 直。
