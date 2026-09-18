# 0918_K4 — 9/16 残置の suite 商品 3 行（読取のみ・消さない・2026-09-18 12:2x JST）

★本日の f0（11:52／12:03 の 2 走）で同名 3 行が 12:04 に再作成されている＝「9/16 残置」ではなく **suite が毎走で作り直す固定 fixture**（削除しても次の f0 で戻る）。作成元は inventory／rls 系の suite（名前 NOX-VERIFY-指名ドリンク／シャンパン＝A1・原価A2＝A2）。

| id | 店 | 名前 | type | active | 作成(JST) | check_lines 参照 | product_costs | stock_logs |
|---|---|---|---|---|---|---|---|---|
| 3bf28fd6-7312-4fbb-a475-17aef6647f46 | NOX-VERIFY-A1 | NOX-VERIFY-指名ドリンク | drink | true | 2026-09-18 12:04:55 | 3 | 1 | 1 |
| d964efd5-0693-46eb-bb36-952dd2ae7bde | NOX-VERIFY-A2 | NOX-VERIFY-原価A2 | drink | true | 2026-09-18 12:04:55 | 0 | 0 | 0 |
| b9d6ac72-2ad9-4578-9506-9c033e811987 | NOX-VERIFY-A1 | NOX-VERIFY-シャンパン | champ | true | 2026-09-18 12:04:57 | 1 | 1 | 0 |

参照あり（check_lines 3＋1・product_costs 1＋1・stock_logs 1）＝削除すると FK／集計に影響する行がある。処置は Agoora 判断（削除するなら suite の teardown 側を直すのが筋＝相談役へ）。
