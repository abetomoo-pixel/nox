# NOX 本番手貼りリスト

> 本番 Supabase への適用は SQL Editor 手貼り（Run 前に URL の ref＝本番プロジェクト ID を目視確認・
> 検証クエリ先頭に貼り先証明 `select 'nox-project-proof', count(*) from public.orgs;`）。
> 適用順＝連番どおり 0001 から欠番なく。ここには**特記事項のある mig のみ**注記を残す
> （無印の mig は通常適用＝単一トランザクション・検証クエリで確認）。
> 起票 2026-07-17（E1 mig0051 の注記を残すため新設。以後の特記もここへ追記）。

## 適用範囲

**0001 〜 0051**（2026-07-17 現在）

## 特記事項

| mig | 注記 |
|---|---|
| 0049_p40_product_costs_split | **再実行厳禁**（backfill と drop column が1回きり＝非idempotent） |
| 0050_p40_product_costs_grant_fix | 再適用可構成だが手貼りは1回（0049 の grant 補正） |
| 0051_e1_store_pricing | 再適用可構成だが手貼りは1回。**検証 G の期待値が dev と本番で異なる**：dev は settings_json に該当キー不在＝G=0 が正常。本番は settings_json に service_rate/round_unit/round_mode/card_tax_rate キーが居れば **G>0 が正常**（backfill が列へ移送する・json 旧値は残置）。json に不正値が居た場合は列 CHECK が UPDATE を落とし全体 rollback＝手貼りが失敗するのでその場で値を修正してから再貼り |

## 恒久注意

- 適用後は "Success" 表示だけを信用せず、検証バンドル（Downloads 残置・repo 収載禁止）で
  prosrc / 制約 / ACL を実測する。
- 手貼り後は `notify pgrst, 'reload schema';`（列追加・関数変更の PostgREST 反映）。
