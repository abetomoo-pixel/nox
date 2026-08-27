# NOX 課金ゲート対象 v1（正式収蔵版・2026-08-17）

正本規約: 本書が **段47（verify:nox-billing）の照合正本**。課金設計 v1.2 §4.5 と一対一で対応し、
mig0088（ゲート挿入87本）の適用範囲を定義する。作業台帳（docs/tmp/billing_gate_list_draft.md）から
昇格・内容は同一（下記 v1.2 表記は作業版の版番号を保持したもの）。

- 実装状況: mig0087（org_billing＋述語2本）・mig0088（対象87本へゲート挿入）とも dev 適用済み。
  live 実測＝`prosrc like '%billing locked%'` が **87**・`'%billing_writable_of%'` が **88**
  （87 ＋ `auth_org_billing_writable` 自身の本文1本）。
- ★**mig0089 追随（2026-08-18）**: `check_extension_add` 新設（manual 店の延長行＝金銭記録の作成・
  kiosk 腕あり・規則A形でゲート内蔵）→ **対象 88 本**へ改訂。live 実測＝'billing locked' **88**・
  'billing_writable_of' **89**。全数 = A 88 ＋ B 83 ＝ **171**（live pg_proc 171 定義と一致）。
- ★**mig0090 追随（2026-08-18）**: `check_set_people` 新設（開卓後の人数修正＝金銭記録の改変・
  kiosk 腕あり・規則A形でゲート内蔵）→ **対象 89 本**へ改訂。live 実測＝'billing locked' **89**・
  'billing_writable_of' **90**。全数 = A 89 ＋ B 83 ＝ **172**（live pg_proc 172 定義と一致）。
- ★**mig0091 追随（2026-08-18）**: `check_line_set_group` 新設（明細の会計分け付け替え＝金銭記録の
  改変・kiosk 腕あり・規則A形でゲート内蔵・グループは '^[A-F]$'）→ **対象 90 本**へ改訂。
  live 実測＝'billing locked' **90**・'billing_writable_of' **91**。全数 = A 90 ＋ B 83 ＝ **173**。
- ★**mig0095 追随（2026-08-19）**: `staffing_need_remove` 新設（バンド削除＝set_staffing_need と対称の
  設定系書込・kiosk 腕なし・ゲート内蔵）→ **対象 91 本**へ改訂。live 実測＝'billing locked' **91**・
  'billing_writable_of' **92**。全数 = A 91 ＋ B 83 ＝ **174**。
- ★**mig0096 追随（2026-08-19）**: `store_sales_target_set` 新設（月間売上目標の書込＝設定系・
  kiosk 腕なし・ゲート内蔵・null=削除）→ **対象 92 本**へ改訂。live 実測＝'billing locked' **92**・
  'billing_writable_of' **93**。全数 = A 92 ＋ B 83 ＝ **175**。★同 mig の読取集計3本
  （store_hourly_aggregate / store_category_aggregate / store_cohort_aggregate）は裁定 E8-6-7 で
  **非ゲート**（B(f) 相当）だが名簿への追補は未裁定＝下記 E 節の注記参照。
- ★**E8-6c 追補（2026-08-19・裁定 E8-6-9）**: 教訓20 の残差10本を B 名簿へ収載＝
  B(f) 39本化（mig0096 読取3本＋課金述語 billing_writable_of／zero-arg ラッパ auth_org_billing_writable）
  ＋B(k) 新設5本（0093 receivable_set_due・0094 の4本）→ **B 93 本**へ改訂。
  全数 = A 92 ＋ B 93 ＝ **185** ＝ live pg_proc 実列挙と一致。以後は verify:nox-billing の
  「live 全数 = 正本 A∪B」機械 assert が silent drift を赤にする（教訓21＝手動追補の腐りを構造排除）。
- ★**mig0099 追随（2026-08-20・R2-c）**: `receipt_issue`／`receipt_issue_void` 新設（領収書＝金銭受領証の
  発行・取消＝A4 へ・kiosk 腕なし・ゲート内蔵）→ **対象 94 本**へ改訂。live 実測＝'billing locked' **94**・
  'billing_writable_of' **95**。同 mig の `nox_receipt_public` は**非ゲート読取（anon 白名単1号・
  裁定 R2-11 改訂）＝B(f) へ同時追補**（裁定 E8-6-9 の運用どおり）→ B **94 本**。
  全数 = A 94 ＋ B 94 ＝ **188** ＝ live pg_proc 実列挙と一致（機械 assert が係留）。
- ★**mig0101/0102 追随（2026-08-21・SD シフト深部）**: 新 RPC **7本**を A5 へ収載＝
  `shift_period_set`／`shift_period_remove`／`shift_propose`／`shift_cast_confirm`／
  `shift_auto_apply`／`shift_auto_clear`／`shift_rules_set`（全て規則A形でゲート内蔵・kiosk 腕なし・
  `shift_set` は status 3値化の改修のみで**既収載**）→ **対象 101 本**へ改訂。
  ★設計書 §6 は「新6」だが**実測は新7**（period_remove を含む）＝実測を正とする（SD-2 の流儀）。
  live 実測＝'billing locked' **101**・'billing_writable_of' **102**。
  全数 = A 101 ＋ B 94 ＝ **195** ＝ live pg_proc 実列挙と一致（機械 assert が係留）。
- ★**mig0106 追随（2026-08-27・M-9 A1）**: 新 RPC **1本**を A8 へ収載＝`set_store_biz_cutoff`
  （営業日切替時刻・`billing_writable_of` ゲートあり）。対象 **103→104**・全数 **197→198**。
- ★**mig0103 追随（2026-08-24・SC シフト作成 v3）**: 新 RPC **2本**を A5 へ収載＝
  `shift_bulk_set`（複数日一括 planned/manual）／`shift_remove`（個別削除・confirmed は attendance
  無しのみ・wish は pending 復元）。**ともに規則A形でゲート内蔵・kiosk 腕なし**→ **対象 103 本**へ改訂。
  改修5本（period_set/set/wish_submit/wish_decide/auto_apply）は**既収載 or B(i) 据え置き**＝
  wish_submit は 0103 後もゲート無し（事実記録＝B(i) のまま・open 期間ガードは課金と無関係）。
  全数 = A 103 ＋ B 94 ＝ **197** ＝ live pg_proc 実列挙と一致（機械 assert が係留）。

## 作業版ヘッダ（v1.2・履歴として保持）

★**live 突合 完了（2026-08-17 02:22 UTC 採取・SUPABASE_DB_URL 直結）**
- orgs / stores の DDL・制約・index・RLS・grants ＝ **backup 2026-07-27 と差分ゼロ**（機械 diff）。
- pg_proc 実列挙 = **170 定義／170 名（overload ゼロ）**。v1.1 母集団 169 との差分2件を本 v1.2 で是正:
  1. **set_cast_photo_updated_at（mig0065）が母集団から欠落**していた（0065 は backup 採取 2026-07-27 より後に適用＝
     補完を 0066 起点にしたための取りこぼし）→ B(j) へ仕分け。
  2. product_stock_totals の「(x2) overload」注記は誤り＝**live は1定義**（0079 は同一シグネチャの
     CREATE OR REPLACE＝role parity supersede であって overload ではない）→ B(f) の注記を訂正。
- 是正後の全数 = **A 87 ＋ B 83 ＝ 170**（live と一致・保留ゼロ）。

★**判定原理（裁定固定・迷ったらこの2行に還元する）**
- **除外** = 清算・事実記録・セキュリティ・給与前提
- **対象** = 新規営業・拡大・金銭記録の作成改変

- 母集団 = docs/tmp/rpc_inventory.txt（**live pg_proc 直読・2026-08-17 採取・170 定義**）。
  v1.1 までの backup ベース暫定母集団（169）は本 v1.2 で live 実体に置き換え済み。
- 挿入仕様 = 課金設計 v1.1 §4（read-only 失効／入口 RPC 冒頭・v_org 確定直後・auth ガードの後）。
- 補助基準（v1 起案時・裁定で維持）: B-補1=専用縮退 RPC（*_deactivate）は除外（セキュリティ）／B-補2=kiosk_login/logout は除外（打刻導線）／A-補1=汎用 set_*（is_active トグル内包）は対象。
- ★付随裁定: **open のまま失効を跨いだ伝票の check_pay / check_close もゲート対象**（read-only の徹底＝失効中は決済・是正とも不能・閲覧のみ。writable 復帰後に処理する）。

## A. 対象（104本）— 冒頭に `if not public.billing_writable_of(v_org) then raise exception 'billing locked'`

### A1. レジ・会計（20本・[K]=kiosk 腕あり＝v_org 直渡しで挿入）
check_open[K] / check_add_line[K] / check_remove_line[K] / check_add_seat[K] / check_remove_seat[K] /
check_move_seat[K] / check_set_nominations[K] / check_time_charge_apply[K] / check_shimei_add[K] /
check_dohan_add[K] / check_pay[K] / check_close[K] / **check_void**（裁定D1＝金銭記録の改変） /
approval_request / approval_direct / approval_decide / bottle_keep_register[K] /
**check_extension_add[K]**（mig0089 新設＝manual 店の延長行の作成・ゲートは mig 本文に内蔵） /
**check_set_people[K]**（mig0090 新設＝開卓後の人数修正・ゲートは mig 本文に内蔵） /
**check_line_set_group[K]**（mig0091 新設＝会計分けの付け替え・ゲートは mig 本文に内蔵）

### A2. ドリンク申告（4本）
drink_claim_submit / drink_claim_submit_proxy / drink_claim_decide /
**drink_claim_void**（裁定D2＝金銭記録（バック申告）の改変）

### A3. 予約（4本）
reservation_create / reservation_update / reservation_set_status / reservation_to_check

### A4. 金銭発行・取消（8本）
adv_issue / transport_issue / incentive_publish /
**adv_cancel / transport_cancel / incentive_cancel**（裁定D3＝金銭記録の改変。BANZEN de-escalation 前例より判定原理を優先）/
**receipt_issue / receipt_issue_void**（mig0099＝領収書の発行・取消＝金銭受領証の作成/改変・R2-9/R2-10・E8-6）

### A5. シフト（11本・owner/manager の確定系＋SD 深部＝設計 v1.1 §4 文言修正・SD 設計書 §3）
shift_set / shift_wish_decide / set_staffing_need /
**staffing_need_remove**（mig0095 新設＝バンド削除・ゲートは mig 本文に内蔵）/
**shift_period_set / shift_period_remove / shift_propose / shift_auto_apply / shift_auto_clear /
shift_rules_set**（mig0102 新設＝SD 深部の owner/manager 系6本・ゲート内蔵）/
**shift_cast_confirm**（mig0102 新設＝★cast 本人の proposed→confirmed 一方向・cast 初の shifts 書込 RPC）/
**shift_bulk_set / shift_remove**（mig0103 新設＝SC シフト作成 v3・一括作成と個別削除・ゲート内蔵・kiosk 腕なし）
※shift_cast_confirm は書込ゆえゲート対象＝失効中は確認も止まる。希望提出（B(i) の事実記録2本）とは性質が異なる。

### A6. 商品・料金マスタ（13本）
set_product / set_product_active / set_product_category / product_category_reorder / product_bulk_insert /
product_reorder / product_stock_add / set_seat / set_pricing_rule / delete_pricing_rule /
pricing_rule_reorder / set_store_pricing / set_store_time_pricing

### A7. 待遇・報酬マスタ（11本）
set_cast_rank / set_cast_rank_of / cast_rank_reorder / delete_cast_rank / set_comp_plan / set_cast_plan /
set_cast_norm / set_custom_back_def / set_deduction / set_penalty_config / set_store_norm_config

### A8. 店設定（11本）
set_store_okuri_base / set_store_okuri_mode / set_store_business_hours / set_store_receipt_profile /
set_store_cast_register / set_cast_register / set_printer_config / set_cast_pin / set_staff_pin /
**store_sales_target_set**（mig0096＝月間売上目標・null=削除・E8-6） /
**set_store_biz_cutoff**（mig0106＝営業日切替時刻・owner 限定・裁定82／起票#14）

### A9. 顧客・告知（6本）
customer_register / customer_update / customer_assign_cast / notice_create / notice_update / notice_delete

### A10. スタッフ・キャスト管理（13本）
staff_create / staff_change_role / staff_update_profile / staff_transfer_store / staff_reactivate /
set_staff_perms / cast_create / cast_invite / **cast_rejoin**（裁定D8＝復帰は拡大操作。leave とは割る） /
trial_register / trial_update / trial_hire / trial_reject
（cast_create は [R] 判定だが実体は cast_create_apply（service）へ委譲する書込入口＝対象）

### A11. デバイス（1本）
kiosk_provision（新規 kiosk の追加＝拡大操作）

## B. 除外（94本）

### B(a) 構造除外＝authenticated 実行不可（service/内部・23本）→ ゲート不要（B7 回避型(1)）
approval_apply / ar_policy_ok / audit_log_write / audit_log_write_service / cast_create_apply /
cast_sales_aggregate / check_group_due / check_recalc / check_round_amount / comp_plan_slide_check /
consent_ok / daily_report_aggregate / get_cast_mynumber / payroll_finalize / payroll_mark_paid /
payroll_reopen / print_claim / print_result / stock_on_check_line / stock_on_check_void /
pricing_resolve_core / drink_claims_guard_line_update / drink_claims_on_line_delete
＋段47 で「zero-arg ラッパを service 専用 RPC が呼ばない」prosrc 機械検証（設計 §3）

### B(b) トリガ関数（1本）
touch_updated_at

### B(c) 打刻・出欠の事実記録（5本）
punch_self / punch_proxy / kiosk_punch / attendance_set / attendance_set_self

### B(d) 打刻導線（3本・B-補2）
kiosk_login / kiosk_logout / auth_kiosk_operator（operator セッション解決＝kiosk 打刻の前提ヘルパー）

### B(e) payroll 系一式（3本・給与＝過去労働の清算）
payroll_run_create / payment_record_add / withholding_payment_record
（finalize/mark_paid/reopen は B(a) で既に構造除外）

### B(f) 読取 RPC（40本・「見える・出せる」原則＝SELECT/集計/エクスポート源は不触）
auth_cast_can_register / auth_cast_id / auth_kiosk_org_id / auth_kiosk_register_store_id /
auth_kiosk_store_id / auth_org_id / auth_role / auth_staff_can_crm / auth_staff_can_register /
auth_staff_can_shift / auth_staff_can_view_backs / auth_store_id /
cast_open_checks / customer_list_summary / customer_summary / customer_visit_history /
get_cast_customer_ranking / get_cast_mynumber_masked / get_cast_ranking / get_cast_sales /
get_cast_sensitive / get_printer_config / get_store_nom_counts /
kiosk_cast_list / kiosk_check_detail / kiosk_operator_list / kiosk_register_state /
period_bounds / reservation_is_closed_day / shift_is_closed_day / withholding_monthly_summary /
pricing_resolve / biz_minutes_of / product_stock_totals（★live は1定義＝0079 は同一シグネチャの supersede）/
store_hourly_aggregate / store_category_aggregate / store_cohort_aggregate /
billing_writable_of / auth_org_billing_writable / nox_receipt_public
（E8-6c 追補5本 2026-08-19: 3本は mig0096 の T4 集計＝裁定 E8-6-7 で非ゲート・
　2本は 0088 の課金述語とその zero-arg ラッパ＝読取ヘルパー。教訓20 の残差是正。
　nox_receipt_public＝mig0099 2026-08-20 同時追補: ★NOX 初の anon 白名単1号・裁定 R2-11 改訂＝
　token 引数の DEFINER 読取・不在/void/期限切れは空 return・grants G2b の白名単 assert が本数=1 を係留）

### B(g) 印刷（1本・「出せる」原則の明文）
print_enqueue[K]

### B(h) セキュリティ/縮退専用（2本・B-補1）
staff_deactivate / kiosk_deactivate

### B(i) 保留裁定による除外（10本・2026-08-17）
| 関数 | 適用原理 |
|---|---|
| receivable_collect / receivable_mark_deduct | **清算**（売掛の回収＝過去取引の清算。payroll 同型・止めると事故） |
| daily_report_close / daily_report_reclose | **清算・事実記録**（過去営業日の締め＝集計スナップの確定。新規の金銭記録を作らない） |
| shift_wish_submit / shift_wish_withdraw | **事実記録**（cast の希望提出。BANZEN 0014「希望提出除外」前例と一致・設計 v1.1 §4 文言修正で明文化） |
| set_cast_tax_profile / set_cast_sensitive | **給与前提**（税区分・口座＝給与支払いの前提入力。no_tax blocker 解消経路を失効中も塞がない） |
| cast_leave | **事実記録・縮退**（退店の事実。rejoin とは割る＝rejoin は A10 対象） |
| rotate_store_token | **セキュリティ**（kiosk トークンのローテ＝衛生操作。課金で止めるとむしろ危険） |

### B(j) live 突合で追加（1本・2026-08-17）
| 関数 | 適用原理 |
|---|---|
| set_cast_photo_updated_at（mig0065） | **事実記録**（Storage への写真アップロード完了を casts.photo_updated_at に打刻するだけ。金銭・営業・拡大のいずれでもない）。★構造的補強＝**この RPC を塞いでも写真の書込自体は止まらない**（実体の書込は Storage ポリシー cast_photos_insert/update が支配）。ゲートすると「ファイルは差し替わったのに打刻だけ古い」＝キャッシュバスティングが壊れた不整合を作るだけで「書けない」を達成しない。写真の真の遮断は Storage ポリシー側の課題＝v1 スコープ外（post-launch）。**※相談役へ**: 対象（A10 staff_update_profile と同じ「プロフィール改変」と読む）へ反転する余地はある。反転する場合は Storage ポリシー側の同時ゲートが前提。 |

### B(k) 非ゲート新設の追補（5本・2026-08-19・E8-6c＝教訓20 の是正）
| 関数 | 適用原理 |
|---|---|
| receivable_set_due | **事実記録**（mig0093＝売掛の支払期日設定。receivable_collect と同列＝回収業務の周辺・止めると事故） |
| bottle_keep_update / customer_set_grade | **事実記録**（mig0094＝ボトル残量/期限/棚と顧客ランク＝接客記録の更新。金銭・拡大のいずれでもない） |
| customer_note_add / customer_note_remove | **事実記録**（mig0094＝接客メモの追記と論理削除＝append-only 運用） |

## C. kiosk 腕を持つ対象（実装注意・16本）
A1 の check_open / check_add_line / check_remove_line / check_add_seat / check_remove_seat /
check_move_seat / check_set_nominations / check_time_charge_apply / check_shimei_add / check_dohan_add /
check_pay / check_close ＋ bottle_keep_register ＋ check_extension_add（mig0089）＋
check_set_people（mig0090）＋ check_line_set_group（mig0091）。
（check_void は kiosk 腕なし＝manager 経路のみ。挿入は同じく billing_writable_of(v_org)）
挿入は **billing_writable_of(v_org)**（引数版・auth 非依存）＝kiosk 腕でも v_org は 0057(2) で確定済み・罠なし。
段47 (4) で kiosk 腕 locked 拒否を実測。

## D. 保留 — なし（16本全て裁定済み・v1.1 で解消）

## E. 全数照合（live 実体との突合済み・機械 assert 化）
A **94** ＋ B **94** ＝ **188** ＝ live pg_proc 実列挙（mig0099 後）と**完全一致**。
（v1 起草時は A 87＋B 83＝170。0089 extension で 171・0090 set_people で 172・0091 line_set_group で
173・0095 staffing_need_remove で 174・0096 store_sales_target_set で 175・**E8-6c で B 93＝185**・
0099 receipt_issue/void（A+2）＋nox_receipt_public（B+1）で **188** へ）

★**E8-6c（2026-08-19・裁定 E8-6-9）**: 教訓20 で発覚した残差10本（非ゲート新設5本＋mig0096 読取3本＋
課金述語/ラッパ2本）を B(f)/B(k) へ追補して解消。全数一致は以後 **verify:nox-billing の
「live 全数 = 正本 A∪B」機械 assert** が担保（silent drift は f0 が赤にする＝教訓21）。
非ゲート新設 RPC も mig と同一コミットで B 名簿を追補する（ゲート入りの pin 波及と対称の運用）。
