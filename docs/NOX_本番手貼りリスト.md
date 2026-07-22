# NOX 本番手貼りリスト

> 本番 Supabase への適用は SQL Editor 手貼り（Run 前に URL の ref＝本番プロジェクト ID を目視確認・
> 検証クエリ先頭に貼り先証明 `select 'nox-project-proof', count(*) from public.orgs;`）。
> 適用順＝連番どおり 0001 から欠番なく。ここには**特記事項のある mig のみ**注記を残す
> （無印の mig は通常適用＝単一トランザクション・検証クエリで確認）。
> 起票 2026-07-17（E1 mig0051 の注記を残すため新設。以後の特記もここへ追記）。

## 適用範囲

**0001 〜 0059**（2026-07-22 現在）

## 特記事項

| mig | 注記 |
|---|---|
| 0049_p40_product_costs_split | **再実行厳禁**（backfill と drop column が1回きり＝非idempotent） |
| 0050_p40_product_costs_grant_fix | 再適用可構成だが手貼りは1回（0049 の grant 補正） |
| 0051_e1_store_pricing | 再適用可構成だが手貼りは1回。**検証 G の期待値が dev と本番で異なる**：dev は settings_json に該当キー不在＝G=0 が正常。本番は settings_json に service_rate/round_unit/round_mode/card_tax_rate キーが居れば **G>0 が正常**（backfill が列へ移送する・json 旧値は残置）。json に不正値が居た場合は列 CHECK が UPDATE を落とし全体 rollback＝手貼りが失敗するのでその場で値を修正してから再貼り |
| 0052_b4_time_charge | 再適用可構成だが手貼りは1回。**backfill 無し**（stores 時間制6列・checks スナップ5列は本 mig で同時生成し双方 default で自動一致＝dev/本番差なし・0051 のような G 期待値差は生じない）。手貼り後 `notify pgrst, 'reload schema';` で列追加＋新 RPC 2本を反映 |
| 0053_b1b2_check_seats | 再適用可構成だが手貼りは1回。**backfill 無し**（check_seats 新設のみ・既存 open 伝票は追加席ゼロから開始）。既存4関数（check_open/check_close/check_void/reservation_to_check）を create or replace で置換＝**ACL は PostgreSQL 仕様で保持され再 grant 不要**。手貼り後 `notify pgrst, 'reload schema';` で新テーブル＋新 RPC 3本＋関数置換を反映 |
| 0054_a4_store_nom_counts | 再適用可構成だが手貼りは1回。**backfill 無し・新テーブルなし**（読取専用 RPC `get_store_nom_counts` 1本の新設のみ・A4 月報の指名店合計）。会計非改修（checks/check_nominations の SELECT のみ・daily_report_aggregate 非改修）。手貼り後 `notify pgrst, 'reload schema';` で新 RPC を反映 |
| 0055_b6_ar_collections | 再適用可構成だが手貼りは1回（`create table if not exists` / `add column if not exists` / `create or replace` 主体）。**RLS drop/create 含む**（`receivables_select` を置換＝cast 腕除去の案4-A・`ar_collections_select` 新設）＝再貼り時も policy は drop→create で冪等。**backfill は列 default 相当**（`daily_reports.ar_collected` NOT NULL default 0＝既存行は自動 0・dev/本番差なし）。**★会計 write 中核 非改修**（checks/check_lines/payments 不変・発生経路 check_pay 無改修・回収済 void 拒否は既存 check_void ガードが被覆）。改修は report-layer（daily_report_aggregate/close/reclose に ar_collected を加算＝ar_collected=0 で従前 diff 一致の後方互換）。空フック `consent_ok`/`ar_policy_ok` は内部専用（4ロール revoke）。手貼り後 `notify pgrst, 'reload schema';` で新テーブル＋consent 2列＋ar_collected 列＋新 RPC 2本＋フック2本＋関数置換3本を反映。sha256 `01deab05fc937b997f9d11f9ae743ec61e1f2ea90fcfae81e39dd29861c6b63d`（36048 bytes・repo=Downloads 一致） |
| 0056_k_kiosk_register_base | 再適用可構成だが手貼りは1回。**★drop index / drop function を含む＝非idempotent 要素あり**（`kiosk_devices_one_active_per_store_idx` を drop→`_one_active_per_store_purpose_idx` 新設・旧3引数 `kiosk_provision(uuid,uuid,text)` を drop→4引数版 `(uuid,uuid,text,text)` へ置換）。2回貼ると drop 対象不在で無害だが**検証は初回基準**。新テーブル2（`staff_pin`/`kiosk_sessions`・deny-all＝RLS 有効/policy 0本/grant 0）・`kiosk_devices.purpose` 列（NOT NULL default 'punch'・既存行 backfill='punch'）・打刻締め（`kiosk_punch`/`auth_kiosk_store_id` に purpose='punch'）・新ヘルパー2（`auth_kiosk_register_store_id`/`auth_kiosk_operator`）＋新RPC4（`kiosk_login`/`kiosk_logout`/`kiosk_operator_list`/`set_staff_pin`）。**単独適用時は register kiosk が「ログインできるが何も操作できない」不活性状態**（会計 kiosk 腕は 0057）。手貼り後 `notify pgrst, 'reload schema';`。sha256 `278c92ab5b1b69b6d594645c66f0cff3125e1c1baaffdc4afd62e875a24e59be`（34196 bytes・repo=Downloads 一致） |
| 0057_k_kiosk_register_arms | 再適用可構成だが手貼りは1回（`create or replace` 主体）。会計RPC12本＋`audit_log_write` に kiosk 腕を追加（money 写経逐語＝3ゲート pay83/receipt52/payroll112 不変）。**★0058 に supersede される**（下記）＝本 mig 単独では kiosk ゲートが `if not(OR連鎖)` の NULL 伝播で null-auth 呼び手に fail-open。**0058 と必ずセットで適用**（0057→0058 の順）。手貼り後 `notify pgrst, 'reload schema';`。sha256 `9d30f9f5c09cc0e60de4316bbf51cd98ac4129f0c9ad5fc245bf6ef5c930e567`（60590 bytes・repo=Downloads 一致） |
| 0058_k_kiosk_register_gate_nullsafe | 再適用可構成だが手貼りは1回（`create or replace` 主体・**0057 の12関数を再 replace**）。**★0057 を supersede**＝12ゲートの `if not(OR連鎖) then raise` → `if (OR連鎖) is not true then raise`（null-auth 呼び手の fail-open を fail-closed 化・money 計算/kiosk 腕は 0057 と byte 同一＝差分は12ゲート×2行のみ）。**0057 と重複関数を再 replace するが冪等ではないので順序どおり適用し飛ばさない**（必ず 0057→0058）。手貼り後 `notify pgrst, 'reload schema';`。sha256 `9d3b18dd4b52f7c1cdf5aec89dbbbc6a10b9fba6a407cae8e762aa577f48058b`（60686 bytes・repo=Downloads 一致） |
| 0059_k_kiosk_register_read | 再適用可構成だが手貼りは1回（`create or replace` のみ・新規読取 RPC 2本＝`kiosk_register_state`/`kiosk_check_detail`・既存オブジェクト接触ゼロ）。**★0056〜0058 適用済みが前提**（`auth_kiosk_register_store_id`/`auth_kiosk_operator` を参照）。kiosk 専用読取（正ガード先行のみ＝OR連鎖ゲート禁止・F0 §7.1 教訓準拠）・back/customer/by_user_id 系 非開示・**money-core 非接触**（SELECT 集約のみ・書込文ゼロ）。手貼り後 `notify pgrst, 'reload schema';`。sha256 `e6f90283658ce54f952a4f6c88e57bc6e9304cfbb1b3e9cee023e9baac59b0fb`（12842 bytes・repo=Downloads 一致） |

## 恒久注意

- 適用後は "Success" 表示だけを信用せず、検証バンドル（Downloads 残置・repo 収載禁止）で
  prosrc / 制約 / ACL を実測する。
- 手貼り後は `notify pgrst, 'reload schema';`（列追加・関数変更の PostgREST 反映）。
