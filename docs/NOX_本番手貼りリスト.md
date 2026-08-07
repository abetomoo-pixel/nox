# NOX 本番手貼りリスト

> 本番 Supabase への適用は SQL Editor 手貼り（Run 前に URL の ref＝本番プロジェクト ID を目視確認・
> 検証クエリ先頭に貼り先証明 `select 'nox-project-proof', count(*) from public.orgs;`）。
> 適用順＝連番どおり 0001 から欠番なく。ここには**特記事項のある mig のみ**注記を残す
> （無印の mig は通常適用＝単一トランザクション・検証クエリで確認）。
> 起票 2026-07-17（E1 mig0051 の注記を残すため新設。以後の特記もここへ追記）。

## 適用範囲

**0001 〜 0086**（2026-08-08 現在）

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
| 0060_d1_payroll_reopen | 再適用可構成だが手貼りは1回（`alter table add column if not exists reopen_idem_key uuid` ＋ `create or replace function payroll_reopen`）。**D1 給与確定解除**＝finalized→draft の逆 RPC（service_role 限定）。**★(B) 巻き戻しブロックは payroll_finalize の live prosrc（`pg_get_functiondef`）から機械抽出51行の逐語写経**（migファイル非経由・記憶再構成なし）＝ar/adv/okuri を drift-safe 条件付き UPDATE で `prev_*` へ復元→payslips delete→run を draft 不変量（`period_start/end`・`finalized_at`・`finalize_idem_key` 全 NULL）＋`reopen_idem_key` 記録。**paid は 'run paid' で全面拒否・payment_records 1行でも 'payments exist' 拒否**。監査 `audit_log_write_service` action='payroll_reopen'（before/after 完全記録）。**money-core 非接触**（finalize/mark_paid/payment_record_add は byte 同一・新規関数1＋列1のみ）。ヘッダ検証0〜4（署名4uuid/prosecdef=t・ACL=service_role のみ・列uuid/YES・正ガード prosrc）。手貼り後 `notify pgrst, 'reload schema';`。sha256 `9c19b9315a6f696ac1b8e51991109c69890eed496de85c5ef6124990c7e85651`（9996 bytes・repo=Downloads 一致） |
| 0061_inventory_v1 | 再適用可構成だが手貼りは1回（`add column if not exists reorder_point` ＋ `create or replace function` ×2 ＋ `drop trigger if exists`→`create trigger` ×3）。**純増① 在庫台帳 v1**＝`products.reorder_point`（発注点しきい・null=しきい無し）＋**売上結線トリガ2系統**。★**money-core RPC は byte 非改変**（`check_add_line`/`check_remove_line`/`check_void` に一切触れず、結線は全てトリガ側）＝`check_lines` AFTER INSERT→`stock_logs` に `delta=-qty, reason='sale'`／AFTER DELETE→`+qty, 'sale_remove'`（WHEN `product_id is not null and qty<>0`＝**カスタム明細は非発火**）、`checks` AFTER UPDATE **WHEN `old.status<>'void' and new.status='void'`**→`'void_recredit'` で商品明細を product 別 `sum(qty)` 一括再クレジット（**check_void は明細を残し status のみ変える現物ゆえ DELETE トリガでは拾えない**＝専用経路・`checks_touch_updated_at` が毎 UPDATE で走るため status 遷移 WHEN ガード必須）。`by_user_id` は `product_stock_add` と同型で解決不能なら null（`stock_logs.by_user_id` は NULLABLE・FK なし）＝**kiosk 経路でも会計が落ちない**。トリガ関数は `revoke execute from public, anon, authenticated`（postgres/service_role のみ）。sha256 `cf95bbbdad3f29352869f22c8330941dfb34c3045d44005e2bbf0c45510ae991`（3451 bytes・repo=Downloads 一致）。**reorder_point の編集経路は未実装**＝`set_product` に `p_reorder_point` が無く現状は表示のみ（追加は 0062 で別途） |
| 0062_set_product_reorder_point | 再適用可構成だが手貼りは1回（`drop function if exists`（旧12引数版）→13引数版 `create or replace` ＋ ACL 再適用）。**在庫台帳 v1 の発注点編集経路**＝`set_product` に `p_reorder_point integer DEFAULT NULL` を末尾追加。**★底本は dev live `pg_get_functiondef` 逐語**で、差分は reorder_point の**4点のみ**（引数末尾追加／入力検証 `p_reorder_point < 0` で `'bad reorder_point'`／insert 列／update 列）＝他は一字不変（money/back/unit4/原価分離 #40 の挙動は非改変）。**署名変更のため旧12引数版を drop**（mig0021 前例）＝`revoke execute from public, anon` ＋ `grant execute to authenticated` を13引数版へ再適用（**PostgreSQL は署名が変わると ACL を引き継がないため再 grant 必須**）。null=しきい無し（`products.reorder_point` は NULLABLE）。手貼り後 `notify pgrst, 'reload schema';`（PostgREST の関数署名キャッシュ更新）。sha256 `cec4c683c43738ceb397898a28585d2b4abdd8285ad347c64b41f51ea546fbd1`（5506 bytes・repo=Downloads 一致） |
| 0063_product_categories_and_kiosk_state_v2 | 再適用可構成だが手貼りは1回（`create table if not exists` ＋ `add column if not exists` ＋ `create or replace` ×3 ＋ **`drop function`（旧13引数 set_product）** ＋ ACL 再適用）。**純増⑦ 商品カテゴリマスタ＋kiosk_register_state v2**＝(1) `product_categories` 新設（`unique (store_id, lower(name))`・**RLS は `products_select` 同型＝パターン3で cast も見える**・書込ポリシー無し）＋ **grants 標準型**（`revoke all from public, anon, authenticated` → `grant select to authenticated`＝0055 規範逐語・REFERENCES/TRIGGER 取りこぼし防止の 0049→0050 教訓）(2) `products.category_id uuid FK on delete set null`（**旧 `category` text は据置＝deprecated**・`comment on column` で明示）(3) `set_product_category` 新設（owner∨manager自店・二重防御・**同店重複名は `'duplicate name'` を明示 raise**＋unique index が backstop・audit あり・`revoke from public, anon`＋`grant to authenticated`）(4) **`set_product` を14引数へ**＝`p_category_id uuid DEFAULT NULL` 追加・**★署名変更ゆえ旧13引数版を `drop function` → ACL 再適用が必須**（PostgreSQL は署名が変わると ACL を引き継がない＝0062 と同じ手順）・底本は 0062 逐語で差分は category_id の4点のみ（入力検証 `'bad category'`＝**同 org かつ同一店のカテゴリのみ許可＝クロス店割当遮断**／insert 列／update 列／引数）(5) `kiosk_register_state` **v2（署名不変・`create or replace` のみ）**＝`categories` 配列（active のみ・`order by sort_order, name`）＋`products.category_id`＋**`checks.started_at`**（kiosk floor 滞在タイマー用）を追加。**非開示原則（back/customer/by_user_id）は不変・0059(b) のタイマー契約に非抵触**（値は state 取得時に渡るだけでポーリングを増やさない）。手貼り後 `notify pgrst, 'reload schema';`（新テーブル＋新 RPC＋`set_product` 署名変更の反映）。sha256 `88892cbb6ec10b6d131925af3ca65424ccec5d51e16d9912d0c524efda8a228e`（13538 bytes・repo=Downloads 一致） |
| 0064_cast_photo_updated_at | 通常適用（`add column if not exists` のみ・冪等）。**段P キャスト写真**＝`casts.photo_updated_at timestamptz NULL`（**null=写真なし**の判定 兼 **キャッシュバスター**）。★**URL は保存しない**＝実体パスは規約 `cast-photos/{org_id}/{cast_id}.jpg` から導出する。**Storage 側（バケット＋ポリシー3本）は本 mig に含まれない**＝下の「Storage（段P）」節の手順を別途実施すること。sha256 `b0f398d8a3f626394de1ae8c0de8dfb54b9ed4ec02f315a83bfbfff7ad3605fd`（repo=Downloads 一致） |
| 0065_set_cast_photo_updated_at | 再適用可（`create or replace` のみ）。**写真アップロード完了後の打刻 RPC** `set_cast_photo_updated_at(p_cast_id uuid) returns timestamptz`。★**必要になった理由**＝`casts` は `authenticated` に **SELECT しか grant されておらず UPDATE ポリシーも無い**（書込は RPC 経由のみという全体設計）ため、クライアント直 update は **grant 面と RLS 面の二重で不可**。★**authz は storage の `cast_photos_insert/update` と同一式**（owner ∨ manager∧自店 ∨ cast 本人）＝**片側だけ通る不整合を構造的に作らない**。二重防御（冒頭 `auth_org_id()` null guard・`revoke execute from public, anon`＋`grant to authenticated`）＋`audit_log_write('set_cast_photo', ...)`（原則6）。手貼り後 `notify pgrst, 'reload schema';`。sha256 `06b04afe7e10286a13da55a30e7edcbc48525d5ea74f59c32cd3c370728f8827`（repo=Downloads 一致） |
| 0066_cast_drink_attribution_a | 通常適用（破壊的 DDL は全て if exists＝冪等）。キャストドリンク帰属のスキーマ拡張（products 按分除外フラグ・drink_claims 制約/FK 張り替え・トリガ2本）。**0067/0068 の前提＝0066→0067→0068 の順で適用**。内部トリガ関数へ revoke all from public, anon あり。sha256 `66235ef1…2df0`（5129 bytes・repo=Downloads 一致） |
| 0067_cast_drink_attribution_b | 通常適用（create or replace＝冪等）。ドリンク claim の代理起票/取消 RPC 2本を新設し revoke from public, anon＋grant to authenticated。**0066 必須**。sha256 `bc3dc0b5…b23f`（5510 bytes・repo=Downloads 一致） |
| 0068_cast_drink_attribution_c | 通常適用（冪等）。check_close の按分ループに除外条件（実差分は not exists 2行・他は live 全文の逐語再掲）。**money 経路＝0066/0067 とセットで適用**。sha256 `846b55f9…1937`（6688 bytes・repo=Downloads 一致） |
| 0069_set_product_back_exempt | ★**単独適用厳禁＝0069→0070→0071→0072 の4本を連続で適用し途中で止めない**。set_product 14→15引数化だが **ACL 文の書き忘れ欠陥を含む**＝適用時点で新署名に既定 grant が付き anon/public に EXECUTE が付く（**0072 が是正＝0057→0058 と同じ supersede 型**）。sha256 `2229f2e1…ced4`（6342 bytes・repo=Downloads 一致） |
| 0070_freeze_back_exempt_in_snapshot | 通常適用（冪等）。back_exempt を check_lines.back_snapshot に凍結し check_close と drink_claim_submit_proxy が同一凍結値を参照。backfill なし（裁定どおり）。sha256 `3cb2c4e0…e8ec`（15403 bytes・repo=Downloads 一致） |
| 0071_drop_set_product_v14 | 通常適用（if exists で drop＝冪等・適用後「15引数1本」を assert）。**0069 が生んだ14引数オーバーロードの削除＝飛ばすと呼び出し解決が function is not unique で落ちる**。sha256 `6350bb08…a910`（1638 bytes・repo=Downloads 一致） |
| 0072_set_product_v15_acl | ★**セキュリティ必須＝絶対に飛ばさない**。0069 の ACL 欠落を是正＝set_product v15 へ revoke execute from public, anon＋grant execute to authenticated（verify:nox-anon-guard がこの回帰を検知した実績＝917/918）。手貼り後 notify pgrst, 'reload schema';（0069 の署名変更分を含む）。sha256 `f2786cc7…ecf4`（2225 bytes・repo=Downloads 一致） |
| 0073_f2f_invoice_registration_period | 通常適用（非冪等要素なし・列は if not exists）。インボイス登録の効力期間3列＋期間 CHECK＋set_cast_tax_profile 4→7引数化＝**旧4引数版を drop ＋ ACL 再適用（0062 前例＝署名変更で ACL は引き継がれない）**。依存 0015/0021。手貼り後 notify pgrst, 'reload schema';。sha256 `dd9fdec1…0e55`（5170 bytes・repo=Downloads 一致） |
| 0074_cast_leave_rejoin | 通常適用（`add column if not exists` ＋ `set default` ＋ do-block constraint ＋ `create or replace` ＋ revoke/grant＝**非冪等要素なし・再適用可**）。**#4 入退店**＝`casts.joined_on` / `casts.left_on`（date・NULL 可・**backfill なし**）＋整合 CHECK `casts_active_left_on_chk`（`is_active = (left_on is null)`・既存行 全件通過を実測確認済み）＋ `cast_leave(uuid, date)` / `cast_rejoin(uuid)`（owner 全店 / manager 自店＝`staff_deactivate` 同型・**復活方式A＝履歴なし**・`cast_rejoin` は `casts_one_active_per_user_idx` 抵触を `'already active elsewhere'` で先取り・両者 `audit_log_write` あり）。★**`joined_on` の default は列追加と分離**（`add column` に volatile default を同居させると既存行へ評価値が書き込まれ「backfill なし」に反するため・既存行は null のまま／以後の新規行のみ JST 作成日が入る）。ACL は2本とも `revoke execute from public, anon` ＋ `grant execute to authenticated`。手貼り後 `notify pgrst, 'reload schema';`（列追加＋新 RPC 2本の反映）。sha256 `6c001185…39d9`（4575 bytes・repo=Downloads 一致） |
| 0075_withholding_payment | 通常適用（`create table if not exists` ＋ `create or replace` ×2 ＋ revoke/grant＝**非冪等要素なし・再適用可**）。**納付管理**＝`withholding_payments`（org×対象月×税区分・`unique (org_id, target_month, tax_category)`・実質 append-only＝取消 RPC は post-launch）＋ `withholding_payment_record(text,text,date)` / `withholding_monthly_summary()`（**ともに owner 限定**）。★**要点は新テーブルの権限剥がし**＝Supabase は新規テーブルに authenticated へ ALL を既定 grant するため、`enable row level security` ＋ `revoke all … from public, anon` ＋ **`revoke all … from authenticated`** で全て剥がし、**policy 0本の deny-all**（`staff_pin`/`kiosk_sessions` 同型＝RPC 専任テーブル）にする。★TRUNCATE は RLS が効かないため grant 面で締めるのが必須（0002 検証(4)の教訓）。RPC の ACL は2本とも `revoke execute from public, anon` ＋ `grant execute to authenticated`。集計は **paid run のみ**・税区分は `payslips.breakdown_json->'pay'->>'taxMode'` の**凍結値のみ**（現在値フォールバックなし＝未凍結は `'(未凍結)'` として表面化）。手貼り後 `notify pgrst, 'reload schema';`（新テーブル＋新 RPC 2本の反映）。sha256 `e6667de1…2d57`（5076 bytes・repo=Downloads 一致） |
| 0076_withholding_summary_bigint_fix | 通常適用（`create or replace` のみ＝**非冪等要素なし・再適用可**）。**★0075 とセットで適用**（0075→0076 の順・0057→0058 と同型の supersede 関係）。`withholding_monthly_summary` の**型不一致是正**＝`sum(bigint)` は PostgreSQL では **numeric に昇格**するため、`returns table` の宣言 `gross_total bigint` / `withholding_total bigint` と食い違い、**1行でも返すと `structure of query does not match function result type` で必ず失敗**していた。集計2列に `::bigint` を明示キャスト（宣言・ACL・他ロジックは 0075 と byte 同一）。★**潜伏条件＝paid run がゼロの環境では発火しない**（0行なら行を組み立てないため）。dev では paid run が無く 0075 手貼り時の検証を通過してしまい、F2g runtime 検証で初回検出。**0075 単独適用の状態で paid 給与が発生すると納付管理が全滅する**ため、必ず対で貼る。手貼り後 `notify pgrst, 'reload schema';`。sha256 `9666827f…e690`（2497 bytes・repo=Downloads 一致） |
| 0077_category_reorder_and_product_active | 通常適用（`create or replace` のみ＝**非冪等要素なし・再適用可**）。★ただし**手貼りは1回とする**（再適用しても結果は同じだが、適用回数を増やすと live と収蔵原本の対応が追いにくくなる）。新設2本＝`product_category_reorder(p_store_id uuid, p_ids uuid[])`（配列順を `unnest with ordinality` で `sort_order` 1..N へ正規化）と `set_product_active(p_id uuid, p_store_id uuid, p_is_active boolean)`（`is_active` だけを更新）。**DB スキーマ変更なし＝関数2本のみの additive**。★`product_category_reorder` は件数一致を**両方向**で検証する（①配列の全 id が同 org/store に実在＝`forbidden` ②同 org/store の**全行が配列に含まれる**＝`partial ids`）。②があるため**呼び出し側は常にその店の全カテゴリを渡す**必要がある（部分配列は拒否＝BANZEN `menu_category_reorder` が片方向のみで通してしまう箇所を塞いだ）。audit は1操作1行・`before/after` は `(id, sort_order)` のみで PII なし。★**原本喪失事故あり**＝起草が本文のみで出され Downloads に原本が残らなかった（教訓14）。後日あらためて原本を受領し、live の `prosrc` と**本文 byte 一致**を確認してから収蔵した。手貼り後 `notify pgrst, 'reload schema';`（ファイル末尾に同梱）。sha256 `b7abae39…450c`（6950 bytes・repo=Downloads 一致） |
| 0078_product_stock_totals | 通常適用（`create or replace` のみ＝**非冪等要素なし・再適用可**）。★ただし**手貼りは1回とする**。新設1本＝`product_stock_totals(p_store_id uuid default null)` `returns table(product_id uuid, qty integer)`＝現在庫（`stock_logs` の Σdelta）を DB 側で集約して返す。**DB スキーマ変更なし＝関数1本のみの additive**・`stable`・読み取り専用ゆえ audit は書かない。★**型の昇格に注意**＝`sum(integer)` は Postgres で **bigint に昇格**するため、`returns table` の宣言 `integer` と食い違うと**1行返した瞬間**に `structure of query does not match function result type` で落ちる（**0行では発火しない潜伏バグ**＝0075→0076 と同型）。本 mig は `sum(l.delta)::integer` を明示キャスト済み。スコープは owner=org 全体（`p_store_id` 指定で同 org のその店）／manager=自店のみ（他店指定は `forbidden`）／cast は `forbidden`（`stock_logs_select` の `auth_role() <> 'cast'` と揃える）。在庫ログが1件も無い商品は**行を返さない**（呼び出し側は従来どおり `?? 0` で埋める）。★view ではなく `returns table` の集計 RPC を採った（NOX に view の前例はゼロ＝`pg_views` 0行／集計 RPC は15本あり RLS・grant・検証の型が確立しているため）。★**ロールスコープに欠陥あり＝0079 に supersede される**（else→forbidden が staff を落とす）。**0079 と必ずセットで適用**（0078→0079 の順・0057→0058 と同型）。手貼り後 `notify pgrst, 'reload schema';`（ファイル末尾に同梱）。sha256 `f4cd83ea…f8cb`（4632 bytes・repo=Downloads 一致） |
| 0079_product_stock_totals_role_parity | 通常適用（`create or replace` のみ＝**非冪等要素なし・再適用可**）。★ただし**手貼りは1回とする**。★**0078 を supersede**＝`product_stock_totals` のロールスコープを RLS（`stock_logs_select`・mig0005）と**完全一致**に是正する。0078 は「RLS と揃える」意図の分岐が **else→forbidden で staff を落としており**、レジ（staff 到達可）の低在庫「残N」が消える挙動変化になるため④d-1 の差し替えが不可だった（着手前調査で検出・裁定A）。差分は role 分岐の2点のみ＝(1) **staff を manager と同型の自店スコープで許可**（`v_role in ('manager','staff')`・他店指定は `forbidden`）(2) **cast は forbidden でなく0行 return**（RLS は cast に「エラー」でなく「0行」を返すため。RPC も0行で揃えることで `fetchStockTotals` がエラー握りつぶしゼロの純粋な drop-in になる＝握りつぶしは本物の認証破綻も隠すため採らない）。集計本体・`::integer` キャスト・grant/revoke は 0078 と byte 同一。適用後の live `prosrc` は収蔵原本と**改行正規化後 byte 一致**を実測済み（live は手貼りクリップボード由来の CRLF・内容差ゼロ）。手貼り後 `notify pgrst, 'reload schema';`（ファイル末尾に同梱）。sha256 `b9ecea0e…13bb`（3838 bytes・repo=Downloads 一致） |
| 0080_product_bulk_insert | 通常適用（`create or replace` のみ＝**非冪等要素なし・再適用可**）。★ただし**手貼りは1回とする**。新設1本＝`product_bulk_insert(p_store_id uuid, p_items jsonb) returns jsonb`＝**商品の一括登録**（裁定J・BANZEN `menu_bulk_insert`（0086）同型・SaaS launch 前の「新規テナントが40件手打ち」問題の解消）。**DB スキーマ変更なし＝関数1本のみの additive**・`volatile`（DML あり）。★**収蔵したのは _r2**（初版 `0080_product_bulk_insert.sql` sha256 `2c30f5dd…ae8b`・8672 bytes は**破棄**＝手貼り未実施のまま差し替えた。関数名 grep では両版がヒットするので **sha256/size で判別**すること）。★**新設 RPC ゆえ live 起点が存在しない**ため、手貼り前に CC が live DDL 照合（A1〜A4）を実施し、**A2/A3/A4 の3点を _r2 で改訂**した＝(A2) `product_costs` は `org_id`/`store_id` が **NOT NULL・default なし**のため INSERT 列挙に追加（初版は `(product_id, cost)` のみで NOT NULL 違反になる）(A3) `product_categories` も `org_id` が同様のため追加 (A4) `audit_log_write` の live 署名は **5引数** `(p_action text, p_target text, p_before jsonb, p_after jsonb, p_store_id uuid)` で、初版が想定した2引数 `(action, detail jsonb)` 形は存在しない → **named notation** で `p_action`/`p_after`/`p_store_id` のみ渡す形へ改訂（1操作1行ゆえ単一 target は無く `p_target`/`p_before` は default null）。A1（products の INSERT 列挙11列）は照合一致で不変。**裁定5点**＝(1) CSV 5列（表示カテゴリ・商品名・会計区分・価格・原価）で**日本語ラベル→3値トークン変換は client パーサの仕事**（RPC は `drink`/`champ`/`bottle` のみ受ける＝サーバが enum 権威）(2) 既定値は `back_mode='rate'`・`back_value=0`・`hon_pt=0`・`back_exempt_from_split=false`・`reorder_point=null`（**金に効く設定はゼロで入れて店が後から明示設定**）(3) **無効カテゴリと同名は `duplicate name`**（`set_product_category` の既存挙動と統一。`unique (store_id, lower(name))` があるため BANZEN の「停止中の同名は無視して新規作成」は移植不可）(4) **audit は1操作1行**（`p_after` に product_count／by_type／categories_created／products・PII なし＝300件で300行の肥大を避ける）(5) 上限はカテゴリ30・商品300（client/RPC 二重・**RPC 権威**）。**検証ループと DML を完全分離**＝1件でも不正なら全ロールバック（部分成功なし・自動作成したカテゴリも巻き戻る）。エラーは短い英字トークンのみ（**行番号は client パーサ担当**）。同名商品は重複許容（products に name の unique なし・警告は client バナーのみ）。カテゴリ空欄は `category_id` null（未分類）・未存在カテゴリは自動作成（同 store 末尾 `sort_order` max+1）。手貼り後 `notify pgrst, 'reload schema';`（ファイル末尾に同梱）。sha256 `b9e555f9…09aa`（9151 bytes・repo=Downloads(_r2) 一致） |
| 0081_product_sort_order | ★**非冪等＝再貼り厳禁**（`add column sort_order`（`if not exists` を**敢えて付けない**）＋ backfill UPDATE ＋ `create or replace function` 1本）。**2回目は先頭の add column で明示的に落ちる設計**＝これは事故ではなく設計意図で、**backfill を再実行すると店が UI で調整した並びを created_at 順へ破壊的に巻き戻す**ため、構造的に二度貼れないようにしてある。内容＝(1) `products.sort_order integer not null default 0`（既存3テーブル `check_lines`/`product_categories`/`seats` と同形）(2) **backfill＝カテゴリ内 `created_at` 順**（同時刻は `id` で決定的・`partition by (store_id, category_id)`＝未分類は店ごとに1群）(3) 新設 `product_reorder(p_store_id uuid, p_category_id uuid, p_ids uuid[]) returns void`。**裁定3点**＝(1) **スコープはカテゴリ内**で `category_id null`（未分類）も1スコープ。比較は **`is not distinct from`**（`=` では null 同士が一致しない）・`is_active` 不問で全件要求（0077 同型）(2) backfill は created_at 順＝**CSV 一括登録（mig0080）の行順がそのまま初期並びになる**（プリフライト実測でレジのカテゴリ内順は `.order("type")` のみ＝**実質不定**だった。これを決定的にするのが本 mig の目的）(3) `/master/products` の平坦一覧は `type→name` を維持し、∧∨は**単一カテゴリ絞り込み時のみ**。構造は `product_category_reorder`（0077）同型＝null guard → 配列検証（空 `bad ids`／重複 `duplicate ids`）→ 認可（owner∨manager自店・org 照合）→ カテゴリ実在照合 → **両方向件数検証**（①配列の全 id がスコープに実在＝`forbidden` ②スコープ全行が配列に含まれる＝`partial ids`）→ before 収集 → `unnest with ordinality` 一括 UPDATE → after 収集 → audit（1操作1行・疑似 target `products:store:<uuid>:category:<uuid|null>`・PII なし）。★**kiosk_register_state の `order by` 改稿は 0082 で分離**（live 起点が必要なため）＝0081 単独では**レジ画面は client 側の並べ替えで決定的になるが kiosk は未追随**。手貼り後 `notify pgrst, 'reload schema';`（ファイル末尾に同梱）。適用後の live `prosrc` は収蔵原本と**改行正規化後 byte 一致**を実測済み（CRLF 94個）。sha256 `8bbdbf5f…94b1`（6698 bytes・repo=Downloads 一致） |
| 0082_kiosk_products_sort | 通常適用（`create or replace` のみ＝**非冪等要素なし・再適用可**）。★ただし**手貼りは1回とする**。**0081 の kiosk 側結線**＝`kiosk_register_state()` の `products` サブクエリだけを差し替える。★**底本は live `pg_get_functiondef`**（CC が LF 正規化して供出＝sha256 `c7a85677…c2607`・2087 bytes）で、**変更は products ブロックのみ**（seats/categories/casts/checks・ガード・宣言・ACL はすべて live と同一）。旧 `order by p.type` は**カテゴリ内が実質不定**だったため、`left join public.product_categories pc on pc.id = p.category_id` を足して `order by coalesce(pc.sort_order, 2147483647), p.sort_order, p.name` ＝**カテゴリ順 → 商品 sort_order → name の完全決定順**にする（未分類＝`category_id` null は `coalesce` の番兵値で**必ず末尾**）。返却 JSON に **`sort_order` キーを追加**＝client の `groupProducts` が register と同一経路で並べられる二重保険になり、0081 client 実装の縮退パス（`undefined → 0`）が実値で埋まる。★**署名不変**（`kiosk_register_state()` 引数なし）ゆえ ACL は PostgreSQL 仕様で保持され再 grant 不要（0053 前例）。★底本との diff は3ハンクで、products ブロック以外の2つは**無害な整形差**＝(a) ガード直後の空行1行が削除されている（`prosrc` に1行分の差が出るが挙動は不変）(b) 末尾 `end $function$` に**セミコロンを補っている**（migration ファイルとして文を終端するため必須）。適用後の live `prosrc` は収蔵原本と**改行正規化後 byte 一致**を実測済み（CRLF 42個）。手貼り後 `notify pgrst, 'reload schema';`（ファイル末尾に同梱）。sha256 `e262a32c…faef`（3624 bytes・repo=Downloads 一致） |
| 0083_pricing_foundation | ★**非冪等＝再貼り厳禁**（`create table` ×2＝`cast_ranks`/`pricing_rules` ＋ `casts.rank_id` の `add column`。2回目はいずれも明示的に落ちる）。**料金ルール一般化の基盤**（設計正本＝`docs/NOX_料金ルール一般化_設計書v1_2.md`・裁定4点確定・**B最終形＝指名バックの正本は comp_plan で本 mig はバックを扱わない**）。内容＝(1) `cast_ranks`（店スコープ・`unique (store_id, lower(name))`＝product_categories 同型）(2) `casts.rank_id uuid null` FK（NULL=ランクなし）＋ `casts.kind` へ `comment on column`（在籍区分でありランクではないと確定）(3) `pricing_rules`（fee_kind 5値 × 席種 × 曜日 dow_mask 1..127 × 時間帯 時計分 0..1439 × rank_id〔指名系のみ CHECK〕・amount・duration_min〔set/extension のみ〕・**明示 priority**・組み合わせ CHECK 3本）(4) `biz_minutes_of`（**内部専用ヘルパー**＝public/anon/authenticated すべて revoke・grant なし。cutoff は mig0010:224 の既存イディオム逐語再掲＋形式チェック）(5) `pricing_resolve`（stable・owner∨manager自店・**0行=基本料金フォールバックは呼び出し側**・帯は `from < cutoff / to <= cutoff` の**非対称営業日拡張**＝CC 机上トレースで完全被覆・隙間0・重複0 を検算済み。**from=to=cutoff は「丸一日」として合法**＝UI で警告）(6) CRUD/reorder RPC 6本（set/delete_pricing_rule・pricing_rule_reorder〔(store, fee_kind) スコープ・0077/0081 同型の両方向検証〕・set_cast_rank・cast_rank_reorder・set_cast_rank_of。全て audit あり・revoke public/anon＋grant authenticated）。★**収蔵したのは _r2**（初版 sha256 `a858d06e…b774`・26986 bytes は**破棄**＝手貼り未実施。sha256 で判別）。★**_r2 の経緯＝手貼り前照合 A4 で grants の塞ぎ漏れを検出**：初版の名指し revoke（`revoke insert, update, delete from authenticated`）では Supabase 既定 grant の **TRUNCATE / REFERENCES / TRIGGER が残存**し、**TRUNCATE は RLS 非適用＝authenticated が全消し可能**だった（一時テーブルで実証）。規範形（`revoke all on table … from public, anon, authenticated` → `grant select to authenticated` のみ戻す＝0002 検証(4) 規約・0055/0063 と同型）へ改訂。RLS は select 1本のみ（owner∨manager自店＝**cast/staff には見せない**・料率は経営情報）。適用後の live は**関数8本すべて prosrc byte 一致**（LF 正規化・CRLF は手貼り由来）・テーブル DDL/CHECK/ACL/comment とも収蔵原本と一致を実測済み。手貼り後 `notify pgrst, 'reload schema';`（ファイル末尾に同梱）。sha256 `a3dc43af…0663`（27665 bytes・repo=Downloads(_r2) 一致） |
| 0084_pricing_charge | ★**非冪等＝再貼り厳禁**（`add column` ×3＝`checks.dohan_fee`／`check_lines.fee_kind`／`check_lines.cast_id`。2回目は add column で明示的に落ちる）。**料金ルールの課金経路結線**（設計書 v1.2 §1-3/§3・0083 とセットのレーンだが単独適用可＝0083 必須）。内容＝(A) 列3本＋CHECK＋部分インデックス `check_lines_cast_idx`（cast_id 非null のみ・率バック遡及計算の布石）(B) **`pricing_resolve_core` 新設**＝無ガード内部関数（0083 `pricing_resolve` の解決部を**逐語移設**・CC 照合で字句一致確認済み）。ACL は `biz_minutes_of` 同型＝**authenticated からも EXECUTE 剥奪**（staff/cast/kiosk 文脈の check_open から呼ぶため auth ガードを外す代償を ACL で塞ぐ）(C) `pricing_resolve` 改稿＝auth ブロック逐語維持→core へ委譲（UI 挙動不変・段43 86本不変で実証）(D) **`check_open` 改稿**＝live `7a4b4cd2…`（CC ファイル供出底本）起点の最小差分。**diff は5ハンクちょうど**＝declare 追加／seats select に `s.kind`+`st.dohan_fee`／core 解決3種／スナップ代入の coalesce 化＋`v_dfee`／insert に `dohan_fee`。**ルール0件の店は改稿前と完全同値**（coalesce フォールバック＝golden 構造保証・段44(1) で8値一致を実測）(E) **`check_shimei_add` 新設**（check_lines への**4本目の INSERT 経路**・kind='charge'・fee_kind・cast_id 凍結・0円でも行を立てる＝裁定①・ランクは行追加時の casts.rank_id＝凍結原則の例外はランク軸のみ・ルール0件は stores.hon_fee/jonai_fee へフォールバック・back_snapshot は作らない＝money-core 不触）(F) **`check_dohan_add` 新設**（5本目の INSERT 経路・単価=開栓時凍結 `checks.dohan_fee`×人数＝裁定C・null は stores 現在値へフォールバック＝裁定②・**mig0084 以前の伝票も同経路で動く**）。ゲートは check_add_line の5腕逐語＋payments 拒否（check_time_charge_apply 同型）・audit あり（呼び形は check_add_line と同型＝CC 照合済み）。★`check_time_charge_apply` は**無改稿**＝checks スナップ経由で新料率が自動で効く（段44(3) で実測）。適用後の live は**5関数すべて prosrc byte 一致**（LF 正規化）・検証バンドル21/21緑（手貼り時）。手貼り後 `notify pgrst, 'reload schema';` は**ファイル末尾に無い**＝列追加＋新 RPC 2本があるため**手貼り時に別途実行すること**（検証バンドル側で実施済みなら不要）。sha256 `8a8acc07…7558`（22601 bytes・repo=Downloads 一致） |
| 0085_delete_cast_rank | 通常適用（`create or replace` のみ＝**非冪等要素なし・再適用可**）。★ただし**手貼りは1回とする**。新設1本＝`delete_cast_rank(p_id uuid)`（裁定5・ランクの物理削除）。owner∨manager 自店・**参照ゼロ検証**＝`casts.rank_id`＋`pricing_rules.rank_id` の合計参照が1件でもあれば `'in use'` で拒否（剥がしは UI 側＝`set_cast_rank_of(cast, null)`・ルール編集に委ね、RPC は保守側）。audit あり（before=行全体/after=null）。UI 結線は D2-4（/master/pricing のランク行＝参照数表示・参照ゼロのみ削除可・削除後は `cast_rank_reorder` 全件呼び直しで 1..N 正規化）。★**原本の受領が収蔵より遅れた mig**（教訓14 同型＝dev 手貼り 2026-08-06・検証3/3緑 → 原本 DL は 08-07。live prosrc との LF 正規化後 byte 一致を確認してから収蔵した＝再構成物ではない）。手貼り後 `notify pgrst, 'reload schema';` は**ファイルに無い**＝新設 RPC のため**本番手貼り時に別途実行すること**。sha256 `1bbe086b…8f8f`（1795 bytes・repo=Downloads 一致） |
| 0086_comp_plan_back_mode | ★**非冪等＝再貼り厳禁**（`add column` ×4 ＋ **`drop function`**〔旧10引数 `set_comp_plan`〕）。**指名バック方式切替（円/本｜率）＝率バック設計 v1**（正本 `docs/NOX_率バック設計_v1.md`・裁定 i–vi）。内容＝(A) `comp_plans` に `hon_back_mode`/`hon_back_rate`/`jonai_back_mode`/`jonai_back_rate`（mode は NOT NULL **default 'per_count'＝backfill 兼務**＝既存全プラン現行同値・玲奈 golden の per_count 経路不動が構造保証。排他 CHECK `(mode='rate')=(rate is not null)` ×2 含む6本）(B) `set_comp_plan` **10→14引数**（末尾4引数は DEFAULT 付き＝旧形式呼び出しは互換動作。**旧シグネチャは drop**＝PostgREST の曖昧ディスパッチ回避・**署名変更ゆえ ACL 再適用**〔0062 前例〕。★既知挙動: rate プランを旧10引数で update すると mode が per_count に戻る〔値は消えない〕＝D3 で UI を同時更新して経路を閉じた）(C) `set_cast_plan` の overrides を**8キー化**（+honBackMode/honBackRate/jonaiBackMode/jonaiBackRate・mode=文字列2値・rate=0..100・**原子性検証**＝mode だけ上書きして値が plan 側から来る合成を RPC 権威で拒否）。適用後の live は**関数2本とも prosrc byte 一致**（LF 正規化）・旧 overload 残骸なしを実測済み。手貼り後 `notify pgrst, 'reload schema';` は**ファイルに無い**＝列追加＋署名変更のため**本番手貼り時に別途実行すること**。sha256 `bf0ca174…4606`（12506 bytes・repo=Downloads 一致） |

## Storage（段P・キャスト写真）

> **mig には含まれない**（`storage.buckets` / `storage.objects` は Supabase 管理スキーマで、
> バケット作成は Dashboard、ポリシーは SQL Editor で貼る）。**0064 と対で必ず実施**。
> 貼らないと写真は「アップロードできない／見えない」だけで、**会計・給与には一切影響しない**
> （`photo_updated_at` が null のまま＝全キャストが頭文字アバター表示にフォールバックする）。

### (1) バケット作成（Dashboard → Storage → New bucket）

| 項目 | 値 | 理由 |
|---|---|---|
| Name | `cast-photos` | パス規約 `cast-photos/{org_id}/{cast_id}.jpg` の前提 |
| Public bucket | **OFF（private）** | ★キャスト写真は個人情報。public だと URL を知る誰でも閲覧可になる。**閲覧は署名 URL（有効期限つき）経由のみ** |
| File size limit | `2 MB`（= 2097152 bytes） | クライアント側で 512px/JPEG q0.85 に縮小して送るため実際は数十 KB。**上限はサーバ側の最後の砦** |
| Allowed MIME types | `image/jpeg` | 単一形式に固定（SVG 等の混入＝XSS 面を断つ）。クライアントも canvas から `image/jpeg` で出す |

作成後に確認:
```sql
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'cast-photos';
-- 期待: public=false / 2097152 / {image/jpeg}
```

### (2) ポリシー3本（SQL Editor に手貼り・下記を逐語）

★**下は dev live（`pg_get_expr`）からの逐語**。**delete ポリシーは意図的に作らない**
（写真の消去は上書き＝`upsert` で足り、削除経路を持たない方が事故が少ない）。
★**authz は mig0065 の `set_cast_photo_updated_at` と同一式**（owner ∨ manager∧自店 ∨ cast 本人）＝
**片方だけ通る不整合（ファイルは置けたが打刻できない／その逆）を構造的に作らない**。

```sql
-- 閲覧: 同 org のキャスト写真は org 内の authenticated 全員が見える（署名 URL 発行の前提）。
-- 店をまたいだ閲覧を許すのは、シフト/顧客画面が owner 視点で全店を出すため（org 境界は厳守）。
create policy cast_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cast-photos'
    and (storage.foldername(name))[1] = auth_org_id()::text
  );

-- 新規アップロード: owner ∨ manager(自店の cast) ∨ cast 本人（自分のファイル名のみ）
create policy cast_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cast-photos'
    and (storage.foldername(name))[1] = auth_org_id()::text
    and (
      exists (
        select 1 from public.casts c
        where c.id::text || '.jpg' = storage.filename(objects.name)
          and c.org_id = auth_org_id()
          and (auth_role() = 'owner' or (auth_role() = 'manager' and c.store_id = auth_store_id()))
      )
      or (auth_cast_id() is not null and storage.filename(name) = auth_cast_id()::text || '.jpg')
    )
  );

-- 上書き（upsert の実体）: using と with check の両方に同じ式が要る
--   （using だけだと「既存行が見えない」で落ち、with check だけだと他人の行を書き換えられる）
create policy cast_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'cast-photos'
    and (storage.foldername(name))[1] = auth_org_id()::text
    and (
      exists (
        select 1 from public.casts c
        where c.id::text || '.jpg' = storage.filename(objects.name)
          and c.org_id = auth_org_id()
          and (auth_role() = 'owner' or (auth_role() = 'manager' and c.store_id = auth_store_id()))
      )
      or (auth_cast_id() is not null and storage.filename(name) = auth_cast_id()::text || '.jpg')
    )
  )
  with check (
    bucket_id = 'cast-photos'
    and (storage.foldername(name))[1] = auth_org_id()::text
    and (
      exists (
        select 1 from public.casts c
        where c.id::text || '.jpg' = storage.filename(objects.name)
          and c.org_id = auth_org_id()
          and (auth_role() = 'owner' or (auth_role() = 'manager' and c.store_id = auth_store_id()))
      )
      or (auth_cast_id() is not null and storage.filename(name) = auth_cast_id()::text || '.jpg')
    )
  );
```

### (3) 検証クエリ

```sql
select 'nox-project-proof', count(*) from public.orgs;  -- 貼り先証明（先頭に必ず）

select polname,
  case polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' end cmd,
  (select array_agg(x.rolname) from pg_roles x where x.oid = any(p.polroles)) roles
from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'storage' and c.relname = 'objects' and polname like 'cast_photos%'
order by polname;
-- 期待: 3行ちょうど（insert / select / update）・roles は全て {authenticated}・delete は無い
```

### 注意

- **`storage.objects` の所有者は `supabase_storage_admin`**。SQL Editor は権限を持つ接続で走るため
  上記の `create policy` はそのまま通るが、**`psql` の `postgres` 直結では権限不足で失敗しうる**
  （dev では SQL Editor 手貼りで成功を実測）。失敗したら Dashboard の Storage → Policies から
  同じ式を貼る。
- **RLS は Supabase 既定で `storage.objects` に有効**（別途 `enable row level security` は不要）。
- ポリシーが片方でも欠けると症状が分かれる: **select 欠落＝写真が出ない**／
  **insert・update 欠落＝アップロード時に `new row violates row-level security policy`**。


## 恒久注意

- 適用後は "Success" 表示だけを信用せず、検証バンドル（Downloads 残置・repo 収載禁止）で
  prosrc / 制約 / ACL を実測する。
- 手貼り後は `notify pgrst, 'reload schema';`（列追加・関数変更の PostgREST 反映）。
