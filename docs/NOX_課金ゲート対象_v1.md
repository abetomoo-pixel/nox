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
- ★**mig0131 追随（2026-09-03・#54/#55/#56）**: 新 RPC **1本**を B(f) へ収載＝
  `pricing_categories_for_register`（STABLE 読取・非ゲート・kiosk 腕あり）。reorder/set_pricing_rule は
  再作成のみ＝本数不動。対象 **113 不変**・除外 **99→100**・全数 **212→213**。
  ★f0 実走の教訓21 assert が名簿漏れとして検知→収載した実例（6例目・0131 手貼りと f0 並走で検知）。
- ★**mig0132 追随（2026-09-04・裁定113）**: 新関数 **1本**を B(f) へ収載＝`biz_date_of`（営業日 date ヘルパー・
  STABLE definer・**クライアント grant なし＝内部呼び専用**・非ゲート・`biz_minutes_of` の鏡像）。check_close は
  再作成のみ＝本数不動。対象 **113 不変**・除外 **100→101**・全数 **213→214**。
  ★「grant なしの内部関数は名簿対象外」の想定は誤り＝assert は live pg_proc 全数と A∪B の照合（教訓21・**7例目**）。
- ★**mig0148 追随（2026-09-18・裁定272）**: 新 RPC **4本**＝ゲート内蔵 3 本を A へ（`check_add_referral`→A1[K]・`set_cast_norm_self`→A7・
  `set_store_receivable_policy`→A8）・非ゲート 1 本を B(e) へ（`payroll_carryover_sync`＝前期 payslip の adjustOverflow を carryover 行へ upsert／削除する繰越消費＝給与の清算・
  owner∨manager 自店・draft のみ）。`set_product`／`product_bulk_insert`（白名単 +food/other）／`check_group_due`（referral 除外・内部専用）は CREATE OR REPLACE のみ＝名前不変で本数不動。
  対象 **125→128**・除外 **116→117**・全数 **241→245**。★教訓21 トリップワイヤの先回り収載（mig 手貼りと同一レーンで名簿＋pin を同時更新・dev 適用済み 9/18 11:1x JST）。
- ★**mig0151 追随（2026-09-24・裁定287／289）**: 新 RPC **3本**＝ゲート内蔵 2 本を A へ（`set_cast_guarantee`→A7・`staff_shift_cancel`→A8）・非ゲート読取 1 本を B(f) へ
  （`shift_open_periods_mine`＝cast 本人の自店 open 期間 3 列・書込なし・名簿 B(f)＝裁定287-2）。`set_store_profile`（白名単 +slide_apply）は CREATE OR REPLACE のみ＝名前不変で本数不動。
  対象 **128→130**・除外 **118→119**・全数 **246→249**（live 実測 2026-09-24 14:00＝総数 249・'billing locked' 130）。
- ★**mig0154 追随（2026-09-24・裁定294／295）**: 新関数 **5本**＝ゲート内蔵 4 本を A へ（`punch_correction_request`／`punch_correction_decide`／`punch_correction_ack`→A5・`set_cast_employment`→A10）・
  内部専用 1 本を B(a) へ（`punch_correction_apply`＝承認済み申請を punches へ写すヘルパー・4 ロール revoke）。`set_cast_plan`（白名単 +3）・`payroll_adjustment_add`（8→11 引数・旧署名 DROP）・
  `set_store_profile`（白名単 +settlement_presets）・`payroll_finalize`（calc_period_* を写す）は CREATE OR REPLACE のみ＝名前不変で本数不動。
  対象 **130→134**・除外 **119→120**・全数 **249→254**（live 実測 2026-09-24 18:35＝総数 254・'billing locked' 134）。
- ★**mig0152 追随（2026-09-25・裁定298／299）**: 新関数 **7本**＝ゲート内蔵 6 本を A へ（`check_referral_set`[K]／`check_referral_remove`[K]→A1・`set_referrer`→A8・
  `referral_payout_pay`／`referral_payouts_pay_bulk`／`referral_payouts_unpaid`→A4）・内部専用 1 本を B(a) へ（`referral_recalc`＝紹介料の現在値を更新するヘルパー・4 ロール revoke）。
  `check_add_referral`（0148）は **drop**＝A1 から除去。改稿 7 本（会計の group due／recalc／close／void／merge・日報 close・デモ reset）は CREATE OR REPLACE のみ＝名前不変で本数不動。
  対象 **134→139**・除外 **120→121**・全数 **254→260**（live 実測 2026-09-25 12:2x＝総数 260・'billing locked' 139）。
- ★**mig0157 追随（2026-09-25・裁定302／304）**: 新関数 **2本**＝`adv_issue_bulk`／`transport_issue_bulk` を A4 へ（adv_issue／transport_issue の検査部を写経＝'billing locked' を持つ・件ごと idem・1 tx）。
  列追加 2（advances.idem_key／transport.idem_key）＋ partial unique 2 は本数非関与。既存 4 本（adv_issue／adv_cancel／transport_issue／transport_cancel）は不触＝md5 不変。
  対象 **139→141**・除外 **121 不変**・全数 **260→262**（live 実測 2026-09-25 16:46＝A-0／A 検証 ALL OK）。
- ★**mig0153 追随（2026-09-25・裁定305／307）**: 新関数 **6本**＝ゲート内蔵 4 本を A1 へ（`check_customer_add`／`check_customer_remove`／`check_line_set_customer`・`bottle_keep_out`[K]）・読取 2 本を B(f) へ（`check_customer_names`／`customer_sales_summary`＝ゲート行なし・裁定307-1）。
  改稿 9 本（check_open／check_merge／check_close／set_comp_plan／set_cast_plan／set_store_profile／demo_org_reset／bottle_keep_register／bottle_keep_update）は名前不変で本数不動（register 7→9 引数・update 6→7 引数・set_comp_plan 19→22 引数＝旧署名 drop）。
  新表 check_customers（authenticated=SELECT のみ）・列追加 10・kind CHECK +'keep_out' は本数非関与。
  対象 **141→145**・除外 **121→123**・全数 **262→268**（live 実測 2026-09-25 18:5x＝A-0／A 検証 ALL OK・'billing locked' 145）。
- ★**mig0155 追随（2026-09-28・裁定309-1〜5・10／309 追補1）**: 新関数 **6本**＝全て非ゲート＝`audit_purge`（service_role 専用・7 年保持の削除＋記録）を B(a) へ・
  `kiosk_check_keeps`／`cast_mynumber_discard_candidates`／`customer_anonymize_candidates`（STABLE 読取）を B(f) へ・`cast_mynumber_discard`／`customer_anonymize`（法定履行の書込・ゲート行なし）を
  **新区分 B(m)「非ゲート書込・法定履行」**へ（309 追補1 (b)）。`referral_payouts_unpaid` はゲート行 1 行を除去して **A4→B(f)**（307-1／309-5）。
  改稿 3 本（`check_pay`＝ar_policy_ok 結線・`set_store_profile`＝白名単 +ar_enabled・`ar_policy_ok`＝本体差替）は名前不変で本数不動。列追加 3（cast_sensitive）・stores.settings_json.ar_enabled 全店 true は本数非関与。
  対象 **145→144**・除外 **123→130**・全数 **268→274**（live 実測 2026-09-28 13:38＝総数 274・'billing locked' 144・md5 12 本一致）。
- ★**mig0156 追随（2026-09-28・裁定309-6〜9／309 追補2・起票84／85）**: 新関数 **9本**＝ゲート内蔵 1 本を A4 へ（`daily_pay_issue`＝日払いの支払＝金銭発行・'billing locked' あり）・
  非ゲート書込 2 本を B(e) へ（`payroll_run_deduction_override_set`／`payroll_run_deduction_override_clear`＝run 別控除上書き＝給与の清算・payroll_adjustment 同型）・
  読取 5 本を B(f) へ（`daily_pays_of_run`／`payroll_run_deduction_overrides_of`／`okuri_today_summary`／`advances_open_balance`／`cast_mynumber_discard_status`＝STABLE・非ゲート）・
  内部 1 本を B(a) へ（`okuri_default_of`＝送り既定の純ヘルパー・4 ロール revoke）。改稿 4 本（`punch_self`／`punch_proxy`／`kiosk_punch`＝+p_okuri・旧 3 引数署名 drop／`kiosk_register_state`＝'ar_enabled'）は名前不変で本数不動。
  新表 2（daily_pays 12 列／payroll_run_deduction_overrides 10 列・authenticated=SELECT のみ）・punches.okuri は本数非関与。`get_cast_mynumber_masked` は不触（309 追補2 (f)）。
  対象 **144→145**・除外 **130→138**・全数 **274→283**（live 実測 2026-09-28 15:54＝総数 283・'billing locked' 145・md5 13 本一致）。
- ★**mig0158 追随（2026-09-29・裁定312／315／316／317／319＋追補1・起票87）**: 新関数 **5本**＝ゲート内蔵 3 本を A へ（`transport_issue_self`／`kiosk_transport_issue`＝送り実費の発行＝金銭発行＝A4・
  `payroll_attention_resolve`＝確定後の打刻修正の要対応を解決済みにする運用の書込＝A8・いずれも 'billing locked' あり）・読取 2 本を B(f) へ（`payroll_attentions_of`／`kiosk_punch_state`＝STABLE・非ゲート）。
  改稿 11 本（`adv_issue`／`adv_issue_bulk`／`daily_pay_issue`／`daily_pays_of_run`／`punch_correction_request`／`punch_correction_decide`／`punch_correction_apply`／`payroll_finalize`／`set_store_profile`／`kiosk_register_state`／`bottle_keep_register`）は名前不変で本数不動。
  新表 1（payroll_attentions 10 列・authenticated=SELECT のみ・policy 1）・列 3（daily_pays.settle_period／bottle_keeps.check_line_id／transport.created_by の null 可）は本数非関与。
  ★`kiosk_transport_issue` のゲート行は引数が端末の org（v_device.org_id）＝verify:nox-billing の「挿入行の形」（v_org／auth_org_id() の 2 種）に当たらない＝形の pin は 147・ゲート済み 148（起票91＝0159 で v_org 形へ）。
  md5 控え（先頭 8 桁・docs/tmp/0158_post_full.json＝live 読取 2026-09-29T09:32:12.796Z から機械生成）: payroll_attentions_of 04d88b37・payroll_attention_resolve 01b27881・transport_issue_self 2eebb64f・kiosk_transport_issue 76412c7e・kiosk_punch_state 48300293。
  対象 **145→148**・除外 **138→140**・全数 **283→288**（live 実測 2026-09-29＝総数 288・'billing locked' 148・md5 16 本一致）。
- ★**mig0159 追随（2026-09-30・裁定324＋追補1〜3・起票89／91／92）**: 新関数 **2本**＝ゲート内蔵 1 本を A8 へ（`set_store_pay_time_basis`＝勤務時間の計算基準の店設定・owner／manager 自店・'billing locked' あり）・
  非ゲート 1 本を B(e) へ（`payroll_shortfall_sync`＝不就労控除の同期＝給与は過去労働の清算・payroll_carryover_sync と同列＝324 追補3-1）。
  改稿 3 本（`customer_register`＝staff 分岐に can_register／`kiosk_transport_issue`＝ゲート行を v_org 形（起票91 解消）／`demo_org_reset`＝c_wipe／c_load に 3 表）は名前不変で本数不動。
  表 79 不変（payroll_adjustments +biz_date・source_ck +'shortfall'・shortfall_ck・部分 unique shortfall_uidx）。'billing locked' 148→149・挿入行の形 147→149（規約外 0 本）・述語参照 149→150。
  md5 控え（先頭 8 桁・docs/tmp/0159_post_live.json＝live 読取 2026-09-30T04:54:05.478Z から機械生成）: set_store_pay_time_basis 7b8e7fb1・payroll_shortfall_sync 0cc27ae4・customer_register e165599a・kiosk_transport_issue 08c5dbc3・demo_org_reset 7b6070a6。
  対象 **148→149**・除外 **140→141**・全数 **288→290**（live 実測 2026-09-30＝総数 290・'billing locked' 149・md5 5 本一致）。
- ★**mig0160 追随（2026-09-30・裁定326＋追補1・2・起票95／96）**: 新関数 **7本**＝ゲート内蔵 6 本を A へ（`set_cast_quota`／`set_store_mine_settings`／`staff_pattern_disable`／`staff_pattern_enable`＝A8 店設定・`reservation_request`／`reservation_decide`＝A3 予約）・
  非ゲート 1 本を B(f) へ（`notice_mark_read`＝cast セルフの既読・書込は自分の既読行だけ＝326 追補1-6）。削除 1 本＝A7 の `set_cast_norm_self`（cast の自己設定は 326-3 で廃止＝drop）。
  改稿 5 本（`shift_wish_submit`＝4 引数（p_kind default 'work'・旧 3 引数は drop）／`shift_wish_decide`／`shift_auto_apply`＝'off' の wish を拒否／`staff_pattern_effective`＝disabled_from／`demo_org_reset`＝c_wipe／c_load +2 表）は名前不変で本数不動。
  新表 2（cast_quotas 11 列／cast_notice_reads 5 列・authenticated=SELECT のみ・policy 1）・列 +6（reservations +4／shift_wishes +kind／staff_shift_patterns +disabled_from）は本数非関与。
  md5 控え（先頭 8 桁・docs/tmp/0160_post_live.json＝live 読取 2026-09-30T07:15:51.139Z から機械生成）: set_cast_quota 1987d03d・set_store_mine_settings 5aaecb0f・staff_pattern_disable cb1d4a34・staff_pattern_enable e768f710・reservation_request f0c51a0a・reservation_decide a0088416・notice_mark_read b1329e24。
  対象 **149→154**・除外 **141→142**・全数 **290→296**（live 実測 2026-09-30＝総数 296・'billing locked' 154・md5 12 本一致）。
- ★**mig0161 追随（2026-09-30・裁定327＋追補1）**: 新関数 **1本**＝内部専用を B(a) へ（`punch_seq_check`＝打刻の順序検査（'already in'／'already out'／'no open punch'）と前営業日以前の未閉鎖 in の注意行 'open_punch'・4 ロール revoke で authenticated／service_role とも実行不可）。
  改稿 4 本（`punch_self`／`punch_proxy`／`kiosk_punch`＝insert 直前に順序検査 1 行・`payroll_attentions_of`＝run 未作成時に積んだ open_punch を期間で拾う）は名前不変で本数不動。payroll_attentions の run_id null 可・kind CHECK 2 値・部分 unique は本数非関与。
  md5 控え（先頭 8 桁・docs/tmp/0161_post_live.json＝live 読取 2026-09-30T08:26:03Z から機械生成）: punch_seq_check f5fd8b84・punch_self 952f18a4・punch_proxy a760e1a4・kiosk_punch 5a1d5f10・payroll_attentions_of 3721bf4e。
  対象 **154 不変**・除外 **142→143**・全数 **296→297**（live 実測 2026-09-30＝総数 297・'billing locked' 154・md5 5 本一致）。
- ★**mig0162 追随（2026-10-01・裁定329／326 追補7-6・329 追補1）**: 新関数 **5本**＝全て非ゲートを B(a) へ（写真 3 本＝`set_user_photo_updated_at`（スタッフ写真の打刻・owner∨manager 自店∨本人）／`clear_cast_photo`／`clear_user_photo`（photo_updated_at の null 戻し・実体削除は client から delete policy 経由）＝写真は課金ゲート外（0065 の set_cast_photo_updated_at と同区分）・契約確認 2 本＝`cast_contract_ack_needed`／`cast_contract_ack_self`（cast セルフ・店の contract_ack ON と contract_ack_rev が有るときだけ・冪等））。
  改稿 2 本（`set_store_mine_settings`＝contract_ack の OFF→ON で contract_ack_rev＝clock_timestamp() を併せて保存・白名単 8 不変／`demo_org_reset`＝c_wipe／c_load に cast_contract_acks）は名前不変で本数不動。新表 1（cast_contract_acks 5 列・authenticated=SELECT のみ・policy 1）・users.photo_updated_at・storage policy 4 本（delete 新設）は本数非関与。
  md5 控え（先頭 8 桁・docs/tmp/0162_post_live.json＝live 読取 2026-10-01T05:54:02Z から機械生成）: set_user_photo_updated_at 97a3da84・clear_cast_photo 22c0d2b2・clear_user_photo 372b28e5・cast_contract_ack_needed a7b2ca2f・cast_contract_ack_self e9dc61dd・set_store_mine_settings 09595c7e・demo_org_reset a4bd6a18。
  対象 **154 不変**・除外 **143→148**・全数 **297→302**（live 実測 2026-10-01＝総数 302・'billing locked' 154・md5 7 本一致）。
- ★**mig0163 追随（2026-10-08・裁定328 追補1・便 D1-6・便 P163 で収載）**: 新関数 **1本**＝非ゲートを B(a) へ（`demo_entries_purge`＝デモ入場ログ demo_entries の 30 日 purge・service_role 専用の grant 型＝audit_purge 0155 と同型・pg_cron 'nox-demo-entries-purge' から呼ぶ）。
  改稿なし（demo_org_reset a4bd6a18／audit_purge f2946b95 不触）。新表 1（demo_entries 7 列・RLS 有効・policy 0・anon／authenticated grant 0・service_role の INSERT／SELECT のみ）・拡張 2（pg_cron／pg_net）・cron.job 8 本（Vault 参照）は本数非関与。
  md5 控え（先頭 8 桁・docs/tmp/0163_0164_post_live.json＝live 読取 2026-10-08T02:20:44Z から機械生成）: demo_entries_purge fdc33bb7・demo_org_reset a4bd6a18・audit_purge f2946b95。
  対象 **154 不変**・除外 **148→149**・全数 **302→303**（live 実測 2026-10-08＝総数 303・'billing locked' 154・述語参照 155・md5 3 本一致）。
- ★**mig0164 追随（2026-10-08・裁定331 C 5 項目＋裁定334・334 追補1・便 P163 で収載）**: 新関数 **0本**。改稿 1 本（`set_store_profile`＝白名単 +7 列側＝invoice_registered_on／pay_day／tax_inclusive_display／use_vip／use_counter／payment_methods／punch_methods・型検査・cash は常に true・打刻は 1 つ以上・before/after 監査・owner 限定と課金ゲートは不変）は名前不変で本数不動。stores +7 列（既定付き・CHECK 3 本）は本数非関与。
  md5 控え（同上）: set_store_profile 4f2e9f82→**2e7b4963**・demo_org_reset a4bd6a18。
  対象 **154 不変**・除外 **149 不変**・全数 **303 不変**（live 実測 2026-10-08＝総数 303・'billing locked' 154・述語参照 155）。
- ★**mig0146 追随（2026-09-15・裁定258）**: 新 RPC **2本**を B(e) へ収載＝`payroll_adjustment_add`／`payroll_adjustment_delete`（run 別調整控除の入力・owner∨manager 自店・
  ゲート行（'billing locked'）を持たない＝給与は過去労働の清算で非ゲート。A に載せると対象→live assert が赤になる・dev 適用済み 9/15 14:4x）。
  対象 **125 不変**・除外 **114→116**・全数 **239→241**。★教訓21 トリップワイヤが f0 実走（本日 2 走目・段47-1 liveOnly=2）で検知→収載（8例目）。
- ★**mig0145 追随（2026-09-14・裁定255）**: 新 RPC **1本**を A6 へ収載＝`seat_reorder`（席の並べ替え 1..N 再採番＝既存 reorder 4 本と同契約・
  owner∨manager 自店・規則A形でゲート内蔵（`billing_writable_of(public.auth_org_id())`）・kiosk 腕なし・dev 適用済み 9/14 18:09）。
  対象 **124→125**・除外 **114 不変**・全数 **238→239**。★教訓21 トリップワイヤの先回り収載（mig 収蔵と同一レーンで名簿＋pin を同時更新）。
- ★**mig0144 追随（2026-09-14・店舗設定 setter mig（小））**: 新 RPC **1本**を A8 へ収載＝`set_store_profile`
  （店舗設定の統合 setter＝白名単 8 キーの patch 型・owner 限定・規則A形でゲート内蔵（`billing_writable_of(v_org)`）・
  kiosk 腕なし・dev 適用済み＝本文一字一致を 9/14 に機械照合）。対象 **123→124**・除外 **114 不変**・全数 **237→238**。
  ★教訓21 トリップワイヤの先回り収載（mig 収蔵と同一レーンで名簿＋verify:nox-billing の 4 pin を同時更新）。
- ★**mig0127 追随（2026-09-02・裁定116-1）**: 新 RPC **1本**を A6 へ収載＝`set_pricing_category`
  （料金区分の upsert・唯一の書込経路・規則A形でゲート内蔵・kiosk 腕なし）。対象 **112→113**・
  全数 **211→212**（pricing_categories 器＋pricing_rules.category_id 列は本数非関与）。
  ★教訓21 トリップワイヤの**先回り収載**（v23 恒久注意#2＝f0 実走検知を待たず名簿と pin を同時更新）。
- ★**mig0126 追随（2026-09-02・裁定114）**: 新 RPC **1本**を A5 へ収載＝`shift_confirm_bulk`
  （planned/proposed→confirmed 一括・shift_propose 相似の raise 型・上限62・規則A形でゲート内蔵・
  kiosk 腕なし）。対象 **111→112**・全数 **210→211**。★この +1 も f0 実走の教訓21 assert
  （live 全数=A∪B）が名簿漏れとして検知→収載した実例（5例目）。
- ★**mig0125 追随（2026-09-02・裁定112）**: 新 RPC **3本**を A5 へ収載＝`cast_unavailable_set`／
  `cast_unavailable_remove`（出勤不可の事前宣言＝shift_set 同型の owner/manager 書込・ゲート内蔵）／
  `shift_bulk_set_daily`（日別時刻の一括・スキップ返却型・ゲート内蔵・kiosk 腕なし）。
  読取 `cast_unavailable_list`（STABLE・非ゲート）は **B(f) へ同時追補**（E8-6-9 運用）。
  `shift_set` は 6→7引数化（p_override_reason・名前不変＝本数不動・旧署名 DROP 済み）。
  対象 **108→111**・除外 **98→99**・全数 **206→210**。
- ★**mig0122 追随（2026-09-01・裁定109）**: 新 RPC **1本**を A10 へ収載＝`set_cast_profile`
  （源氏名・入店日の更新・`billing_writable_of` ゲート内蔵・owner=org 全店/manager=自店）。
  対象 **107→108**・全数 **205→206**。
- ★**mig0115 追随（2026-08-28・C1 §6-3）**: 新 RPC **1本**を A7 へ収載＝`set_comp_component`
  （ゲート内蔵）。`set_comp_plan` は 14→16引数化（名前不変＝本数不動・旧署名 DROP 済み）。
  対象 **106→107**・全数 **202→203**。
- ★**mig0113 追随（2026-08-28・C3/C4 挙動段）**: 新設 `check_tax_round`（内部ヘルパー・非ゲート）を
  B の内部関数群へ収載。除外 **95→96**・全数 **201→202**。★この漏れは f0 の教訓21 assert
  （live 全数=A∪B）が実走で検知した＝仕組みが機能した実例。
- ★**mig0112 追随（2026-08-28・C3/C4 §6-3）**: 新 RPC **1本**を A8 へ収載＝`set_store_tax_config`
  （税設定4分離＋card_surcharge・ゲート内蔵・裁定90）。`set_pricing_rule` は 13→14引数化（名前不変＝
  本数不動・旧署名 DROP 済み）。対象 **105→106**・全数 **200→201**。
- ★**mig0108 追随（2026-08-27・M-11b）**: `set_store_pin_policy` を A8（ゲート済み）へ、
  `staff_pin_status` を B(f)（読取・非ゲート）へ収載。対象 **104→105**・全数 **198→200**。
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

### A1. レジ・会計（26本・[K]=kiosk 腕あり＝v_org 直渡しで挿入）
**check_merge**（mig0138＋0139＝open 伝票 2 枚→1 枚の統合・owner∨manager 自店・課金ゲート＋flag reopen_flow＋理由必須・kiosk 腕なし・C層③＝裁定 C③-6〜8） /
check_open[K] / check_add_line[K] / check_remove_line[K] / check_add_seat[K] / check_remove_seat[K] /
check_move_seat[K] / check_set_nominations[K] / check_time_charge_apply[K] / check_shimei_add[K] /
check_dohan_add[K] / check_pay[K] / check_close[K] / **check_void**（裁定D1＝金銭記録の改変） /
approval_request / approval_direct / approval_decide / bottle_keep_register[K] /
**check_customer_add / check_customer_remove / check_line_set_customer**（mig0153＝伝票の顧客の付け外し（position・remove は行の注文者を null に戻し checks.customer_id を追従）・注文行の顧客（'not on check'）・check_open と同じ腕・kiosk 腕なし・裁定305-1〜3／307-3） /
**bottle_keep_out[K]**（mig0153＝キープ出し＝kind 'keep_out'・¥0・バック 0・在庫不変・冪等（check_lines.idem_key）・last_used_at 更新・kiosk 腕あり・裁定305-5／305-7） /
**check_extension_add[K]**（mig0089 新設＝manual 店の延長行の作成・ゲートは mig 本文に内蔵） /
**check_set_people[K]**（mig0090 新設＝開卓後の人数修正・ゲートは mig 本文に内蔵） /
**check_line_set_group[K]**（mig0091 新設＝会計分けの付け替え・ゲートは mig 本文に内蔵） /
**check_referral_set[K]**（mig0152 新設＝伝票への紹介の付与（1 伝票 1 紹介・method 4 値・value＝bp／円・burden 2 値）・会計行追加の冒頭〜role 判定を逐語＝kiosk 腕あり・
ゲート内蔵・idem＝同キー再送は既存行を返す・'exists'／'bad referrer'／'inactive referrer'／'no people'・裁定298-3／299-1） /
**check_referral_remove[K]**（mig0152 新設＝伝票の紹介の取消・会計行削除の骨格を逐語（'has payments'・'not open'）＋ 'frozen'・裁定298-3／299-4）
（0148 の check_add_referral は mig0152 で drop＝裁定280-1・298-2）

### A2. ドリンク申告（4本）
drink_claim_submit / drink_claim_submit_proxy / drink_claim_decide /
**drink_claim_void**（裁定D2＝金銭記録（バック申告）の改変）

### A3. 予約（6本）
reservation_create / reservation_update / reservation_set_status / reservation_to_check /
**reservation_request**（mig0160＝cast 本人の指名・同伴の予約申請＝自店・自分の担当客のみ・status 'pending'・ゲート内蔵（reservation_create と同区分）・裁定326-4／追補1-1・5／追補2-3） /
**reservation_decide**（mig0160＝申請の承認（'booked'）／却下（'rejected'＋理由）・owner∨manager 自店∨staff can_crm・pending 以外 'not pending'・ゲート内蔵・裁定326-4）

### A4. 金銭発行・取消（15本）
adv_issue / transport_issue / incentive_publish /
**adv_issue_bulk / transport_issue_bulk**（mig0157＝一括発行・p_items jsonb・件ごと idem＝md5(p_idem_key‖cast_id)・同キー再送は既存 id・'duplicate cast'（裁定304-1）・1 tx で部分成功なし・owner∨manager 自店・裁定302／304・写経で 'billing locked' を持つ） /
**adv_cancel / transport_cancel / incentive_cancel**（裁定D3＝金銭記録の改変。BANZEN de-escalation 前例より判定原理を優先）/
**receipt_issue / receipt_issue_void**（mig0099＝領収書の発行・取消＝金銭受領証の作成/改変・R2-9/R2-10・E8-6） /
**referral_payout_pay**（mig0152＝紹介料の支払確定 1 件・paid_via 2 値・源泉は支払時に確定（外交員報酬＝支払月の累計で差分計上）・冪等・owner∨manager 自店・裁定298-6／7） /
**referral_payouts_pay_bulk**（mig0152＝同 一括・1 tx で部分成功なし・派生 idem・裁定298-6／299-5） /
**daily_pay_issue**（mig0156＝日払いの支払＝金銭発行・owner∨manager 自店・源泉は月次と同式を日数 1 で（委託 floor(max(0, 額−5,000)×10.21%)・雇用 0＋warn）・paid period・冪等・ゲート内蔵・裁定309-6／309 追補2 (c)）
**transport_issue_self**（mig0158＝退勤直後の送り実費の本人発行＝金額は店設定の送りベース額（サーバ側で決定）・打刻 1 件につき 1 回（idem は打刻 id から派生）・cast 本人のみ・ゲート内蔵・裁定317／319） /
**kiosk_transport_issue**（mig0158＝同 打刻端末から・端末の腕のみ・端末で打った退勤打刻のみ・打刻から 10 分以内（'punch expired'）・created_by は cast の user（無ければ null）・ゲート内蔵（引数は端末の org）・裁定317／319 追補1）
（未払一覧の読取 RPC は mig0152 で A4 に載っていたが 0152 の写経の名残＝裁定307-1／309-5・mig0155 でゲート行を除去し B(f) へ移動）

### A5. シフト（17本＋0154 の 3 本・owner/manager の確定系＋SD 深部＝設計 v1.1 §4 文言修正・SD 設計書 §3）
shift_set / shift_wish_decide / set_staffing_need /
**staffing_need_remove**（mig0095 新設＝バンド削除・ゲートは mig 本文に内蔵）/
**shift_period_set / shift_period_remove / shift_propose / shift_auto_apply / shift_auto_clear /
shift_rules_set**（mig0102 新設＝SD 深部の owner/manager 系6本・ゲート内蔵）/
**shift_cast_confirm**（mig0102 新設＝★cast 本人の proposed→confirmed 一方向・cast 初の shifts 書込 RPC）/
**shift_bulk_set / shift_remove**（mig0103 新設＝SC シフト作成 v3・一括作成と個別削除・ゲート内蔵・kiosk 腕なし）/
**cast_unavailable_set / cast_unavailable_remove / shift_bulk_set_daily**（mig0125 新設＝裁定112・
出勤不可の事前宣言2本と日別時刻一括＝いずれも規則A形でゲート内蔵・kiosk 腕なし・shift_set は
7引数化のみで既収載）/
**shift_confirm_bulk**（mig0126 新設＝裁定114・planned/proposed→confirmed 一括・上限62・ゲート内蔵・kiosk 腕なし）
※shift_cast_confirm は書込ゆえゲート対象＝失効中は確認も止まる。希望提出（B(i) の事実記録2本）とは性質が異なる。

**punch_correction_request** / **punch_correction_decide** / **punch_correction_ack**（mig0154＝打刻の修正申請・決裁・本人確認＝cast 本人／staff 本人／owner∨manager 自店。owner／manager の申請は同 tx で approved・
確定は punches の update／insert／delete（B(a) の内部ヘルパー経由）・'period finalized'／'reason required'・ack は本人のみ（decided 行）・ゲート内蔵・監査 6 引数形・裁定294-1〜4／295）

### A6. 商品・料金マスタ（15本）
set_product / set_product_active / set_product_category / product_category_reorder / product_bulk_insert /
**seat_reorder**（mig0145＝席の並べ替え 1..N 再採番・owner∨manager 自店・課金ゲート・監査 seat_reorder・kiosk 腕なし・裁定255） /
product_reorder / product_stock_add / set_seat / set_pricing_rule / delete_pricing_rule /
pricing_rule_reorder / set_store_pricing / set_store_time_pricing /
**set_pricing_category**（mig0127 新設＝裁定116-1・料金区分の upsert＝唯一の書込経路・停止=is_active false・ゲート内蔵・kiosk 腕なし）

### A7. 待遇・報酬マスタ（12本）
set_cast_rank / set_cast_rank_of / cast_rank_reorder / delete_cast_rank / set_comp_plan / set_cast_plan /
set_cast_norm / set_custom_back_def / set_deduction / set_penalty_config / set_store_norm_config /
**set_comp_component**（mig0115＝comp_plan_components の唯一の書き手・owner のみ・ゲート内蔵・裁定86） /
（set_cast_norm_self＝mig0148 の cast 自己設定は mig0160（裁定326-3／追補1-2）で drop＝名簿から除去・cast_norms 表と set_cast_norm は不変）
**set_cast_guarantee**（mig0151＝期限つきの保証時給＝cast_plan の現在行 C を割って保証行（overrides_json に base／guarantee=true）と戻し行を作る・owner∨manager 自店・
ゲート内蔵・監査 set_cast_guarantee・'guarantee exists' は重なり OR 後続の予定＝裁定287-3／289-6）

### A8. 店設定・日報運用（31本）
**report_reopen**（mig0138＝日報の締め解除・owner∨manager 自店∨staff∧can_reopen・理由必須・監査 report_reopen・C層③＝裁定 C③-1） /
**cash_diff_approve**（mig0138＝現金差異の承認・owner∨manager∨staff∧can_close・理由必須・監査 cash_diff_approve・C層③＝裁定 C③-4／18） /
set_store_okuri_base / set_store_okuri_mode / set_store_business_hours / set_store_receipt_profile /
set_store_cast_register / set_cast_register / set_printer_config / set_cast_pin / set_staff_pin /
**set_store_profile**（mig0144＝店舗設定の統合 setter・白名単 8 キー（name／short／ext_shimei_enabled／dohan_auto_hon／store_code／display_name／show_open_status／shift_cast_confirm）の patch 型・owner 限定・課金ゲート・監査 set_store_profile・kiosk 腕なし・裁定245-1／N3／N4(b) の setter） /
**store_sales_target_set**（mig0096＝月間売上目標・null=削除・E8-6） /
**set_store_biz_cutoff**（mig0106＝営業日切替時刻・owner 限定・裁定82／起票#14） /
**set_store_pin_policy**（mig0108＝PIN ロック閾値・owner 限定・起票#31） /
**set_store_tax_config**（mig0112＝税設定4分離＋card_surcharge・owner∨manager 自店・裁定90） /
**flag_set**（mig0135＝機能フラグの upsert・org 既定と店舗上書きの二層・owner 限定・課金ゲート・監査 action flag_toggle・理由は任意・C層①＝裁定182） /
**staff_pattern_set** / **staff_pattern_delete** / **staff_deadline_set**（mig0136＋0137＝黒服の勤務パターン枠と締切＝effective_from 型の店設定・owner∨manager 自店・flag gate の直後に課金ゲート＝裁定233） /
**staff_shift_propose** / **staff_shift_override** / **staff_shift_confirm**（mig0136＋0137＝黒服シフト行の作成・時刻上書き・確定・owner∨manager 自店・課金ゲート＝裁定233。cast の A5 と同列だが店設定と同じ mig のため A8 に置く） /
**set_referrer**（mig0152＝紹介者マスタの upsert・external／staff・withholding_category 3 値（none／salesperson／employee）・is_active・同名重複は許す・owner∨manager 自店・ゲート内蔵・裁定280-2／292-3／298-5） /
**set_store_receivable_policy**（mig0148＝stores.receivable_policy 実列の setter・CHECK 3 値（disabled／customer_only／cast_liability_allowed）・
okuri_mode setter の骨格逐語・owner 限定・ゲート内蔵・監査 set_store_receivable_policy・裁定272-5） /
**staff_shift_cancel**（mig0151＝黒服シフト行の取消＝delete・proposed は理由不要・confirmed は 'reason required'・過去日 'biz_date_past'・不在 'not_found'・
owner∨manager 自店判定（0137 のヘルパー）・flag gate の直後に課金ゲート・監査 before 行全体／after null＝裁定287-1／289-1・教訓90＝説明文に他の関数名を裸で書かない）
**payroll_attention_resolve**（mig0158＝確定済み・支払済み期の打刻修正で立った要対応を解決済みにする・理由必須・owner∨manager 自店・凍結給与は動かさない・ゲート内蔵・監査あり・裁定315）
**set_store_pay_time_basis**（mig0159＝勤務時間の計算基準（'punch'＝実打刻／'shift'＝確定シフトどおり）の店設定・'next'＝次の暦月の 1 日から・'now'＝給与 run が無い店だけ即時・owner∨manager 自店・ゲート内蔵・裁定324-1／324-5／追補2-1・追補3-1）
**set_cast_quota**（mig0160＝キャスト別・月別のノルマ 4 項目（本指名・場内・同伴・売上・NULL 可）の upsert・owner∨manager 自店・'bad cast'／'bad month'／'bad quota'・ゲート内蔵・裁定326-3／追補1-2） /
**set_store_mine_settings**（mig0160＝/mine の店設定 8 キー（payslip_visibility／drink_claim／punch_correction_request／ranking／ranking_show_others／reservation_request／shift_request_mode／contract_ack）の白名単＋enum 検証＝settings_json に merge・owner∨manager 自店・ゲート内蔵・裁定326-1／326-7／追補1-4・起票96） /
**staff_pattern_disable / staff_pattern_enable**（mig0160＝スタッフの枠マスタの無効化（disabled_from）と解除・owner∨manager 自店（スタッフシフトの管理権限ヘルパー＝0137 で判定）・過去日 'effective_from_past'・ゲート内蔵・起票95／裁定326 追補2-2・5）

### A9. 顧客・告知（6本）
customer_register / customer_update / customer_assign_cast / notice_create / notice_update / notice_delete

### A10. スタッフ・キャスト管理（13本＋0154 の 1 本）
staff_create / staff_change_role / staff_update_profile / staff_transfer_store / staff_reactivate /
set_staff_perms / cast_create / cast_invite / **cast_rejoin**（裁定D8＝復帰は拡大操作。leave とは割る） /
trial_register / trial_update / trial_hire / trial_reject /
**set_cast_profile**（mig0122＝源氏名・入店日の更新・ゲート内蔵・裁定109）
（cast_create は [R] 判定だが実体は cast_create_apply（service）へ委譲する書込入口＝対象）

**set_cast_employment**（mig0154＝雇用区分（委託／雇用）の変更＝owner のみ・p_valid_from は給与期の初日（月初）かつ最後に確定した期の翌日以降（'period finalized'）・casts.employment_valid_from・過去分は付け替えない・ゲート内蔵・監査 5 引数・裁定294-9／295-6）

### A11. デバイス（1本）
kiosk_provision（新規 kiosk の追加＝拡大操作）

## B. 除外（99本）

### B(a) 構造除外＝authenticated 実行不可（service/内部・28本）→ ゲート不要（B7 回避型(1)）
approval_apply / ar_policy_ok / audit_log_write / audit_log_write_service / cast_create_apply /
cast_sales_aggregate / check_group_due / check_recalc / check_round_amount / **nom_unit4_key** / **nom_type_summary**（mig0119＝R-2b 補助・IMMUTABLE/STABLE の純ヘルパー・4者 revoke＝呼び出し元の公開 RPC が二重防御済み＝原則8 の check_round_amount 型） / **check_tax_round**（mig0113＝税丸め・IMMUTABLE・4者 revoke 済＝教訓43） / comp_plan_slide_check /
consent_ok / daily_report_aggregate / get_cast_mynumber / payroll_finalize / payroll_mark_paid /
payroll_reopen / print_claim / print_result / stock_on_check_line / stock_on_check_void /
pricing_resolve_core / drink_claims_guard_line_update / drink_claims_on_line_delete /
demo_org_reset（mig0149＝裁定273／276〜279・公開デモ org の録画再生リセット＝wipe→load・service_role 専用の revoke 型で authenticated 実行不可・is_demo=true の org 以外は raise・2026-09-18）
＋段47 で「zero-arg ラッパを service 専用 RPC が呼ばない」prosrc 機械検証（設計 §3）

referral_recalc（mig0152＝伝票の紹介料の現在値（method 4 値の式・frozen は触らない）を更新する内部ヘルパー＝会計の recalc と紹介の付与からのみ・4 ロール revoke・裁定286／298-1）

punch_correction_apply（mig0154＝承認済み punch_corrections 行を punches へ写す内部ヘルパー＝request の owner／manager 経路と decide の approve からのみ・4 ロール revoke で authenticated／service_role とも実行不可・原則8＝呼び出し元が二重防御済み・裁定295-5）

audit_purge（mig0155＝audit_logs の 7 年保持＝at < now()-7年 を org ごとに削除し action 'audit_purge' の行に件数・最古・最新・cutoff を残す・service_role 専用の grant 型（authenticated／anon／PUBLIC 不在）＋テナント JWT 遮断・実行は手動＝cron は Vercel Pro 後・裁定309-2／309 追補1 (a)・2026-09-28）

okuri_default_of（mig0156＝送り利用の既定を返す純ヘルパー＝p_okuri 明示があればそれ・無ければ out かつ okuri_mode='actual' の店で false・他は null。打刻 3 本の本文からのみ・4 ロール revoke・裁定309-9／309 追補2 (a)・2026-09-28）

punch_seq_check（mig0161＝打刻の順序検査＝当日営業日の最終打刻で 'already in'／'already out'／'no open punch' を raise し、前営業日以前の未閉鎖 in は塞がずに注意行 'open_punch' を積む内部ヘルパー。打刻 3 本の本文からのみ・4 ロール revoke で authenticated／service_role とも実行不可・原則8＝呼び出し元が二重防御済み・裁定327＋追補1・2026-09-30）

set_user_photo_updated_at（mig0162＝スタッフ写真の打刻＝users.photo_updated_at を now() に・authz は storage cast_photos_* の users 腕と同一式（owner∨manager 自店∨本人）・非ゲート＝写真は課金ゲート外・裁定329）

clear_cast_photo（mig0162＝キャスト写真の null 戻し＝casts.photo_updated_at を null に・authz は 0065 の打刻と同一式・Storage の実体削除は client から delete policy 経由・非ゲート・裁定329 追補1）

clear_user_photo（mig0162＝スタッフ写真の null 戻し＝users.photo_updated_at を null に・authz は users 腕と同一式・非ゲート・裁定329 追補1）

cast_contract_ack_needed（mig0162＝cast セルフの読取＝店の contract_ack が ON かつ contract_ack_rev が有り、その rev の記録が無ければ true・非ゲート・326 追補7-6）

cast_contract_ack_self（mig0162＝cast セルフの確認記録＝cast_contract_acks へ (cast_id, contract_rev) を冪等 insert・店が ON でなければ 'not required'・audit は 1 回目だけ・非ゲート・326 追補7-6）

demo_entries_purge（mig0163＝デモ入場ログ demo_entries の 30 日より前の行を org ごとに削除し audit 'demo.entries.purged'（audit_log_write_service）に件数を残す・service_role 専用の grant 型（4 ロール明示 revoke→service_role grant・テナント JWT からの呼出は 'forbidden'＝audit_purge 0155 と同型）・pg_cron 'nox-demo-entries-purge'（UTC 20:15＝JST 05:15）から呼ぶ・非ゲート・裁定328 追補1・293-7・本番適用 2026-10-08）

### B(b) トリガ関数（1本）
touch_updated_at

### B(c) 打刻・出欠の事実記録（5本）
punch_self / punch_proxy / kiosk_punch / attendance_set / attendance_set_self

### B(d) 打刻導線（3本・B-補2）
kiosk_login / kiosk_logout / auth_kiosk_operator（operator セッション解決＝kiosk 打刻の前提ヘルパー）

### B(e) payroll 系一式（9本・給与＝過去労働の清算）
payroll_run_create / payment_record_add / withholding_payment_record / payroll_adjustment_add / payroll_adjustment_delete / payroll_carryover_sync /
**payroll_run_deduction_override_set / payroll_run_deduction_override_clear**（mig0156＝run 別・cast 別の固定控除の上書き（enabled／amount_override）＝draft の run のみ・owner∨manager 自店・
  ゲート行なし＝給与の清算（payroll_adjustment 同型）・裁定309-8＝300 追補1／309 追補2 (d)・2026-09-28）
（finalize/mark_paid/reopen は B(a) で既に構造除外）
（payroll_adjustment_add／_delete＝mig0146・裁定258: ゲート行（'billing locked'）を持たない＝給与は過去労働の清算で非ゲート。A に載せると対象→live assert が赤になる）
**payroll_shortfall_sync**（mig0159＝不就労控除（遅刻・早上がり）の行を draft run へ冪等 upsert／delete（金額は pay.ts 側・p_rows で受ける）・owner∨manager 自店・ゲート行なし＝給与は過去労働の清算（carryover_sync 同型）・裁定324-4／追補2-2／追補3-1・2026-09-30）
（payroll_carryover_sync＝mig0148・裁定272-1: 前期 payslip の adjustOverflow>0 を当 draft run の carryover 行（source='carryover'・部分 unique）へ upsert／0 は削除＝冪等。
  調整控除 add の actor／org／manager 自店／draft 判定を逐語＝同じく非ゲート。A に載せると対象→live assert が赤になる）

### B(f) 読取 RPC（50本・「見える・出せる」原則＝SELECT/集計/エクスポート源は不触）
**staff_pin_status**（mig0108＝PIN 状態の読取・owner∨manager自店・hash 非返却） /
**cast_unavailable_list**（mig0125＝出勤不可の読取・STABLE・owner∨manager自店・裁定112） /
auth_cast_can_register / auth_cast_id / auth_kiosk_org_id / auth_kiosk_register_store_id /
auth_kiosk_store_id / auth_org_id / auth_role / auth_staff_can_crm / auth_staff_can_register /
auth_staff_can_shift / auth_staff_can_view_backs / auth_store_id /
cast_open_checks / customer_list_summary / customer_summary / customer_visit_history /
**check_customer_names**（mig0153＝伝票の顧客名＋active キープのボトル名のみ・can_register の cast にも開放・ゲート行なし＝裁定307-1） / **customer_sales_summary**（mig0153＝顧客別売上・owner∨manager 自店・均等割り＝端数は position 0・ゲート行なし＝裁定307-1） /
get_cast_customer_ranking / get_cast_mynumber_masked / get_cast_ranking / get_cast_sales /
get_cast_sensitive / get_printer_config / get_store_nom_counts /
kiosk_cast_list / kiosk_check_detail / kiosk_operator_list / kiosk_register_state /
period_bounds / reservation_is_closed_day / shift_is_closed_day / withholding_monthly_summary /
pricing_resolve / biz_minutes_of / **biz_date_of**（mig0132 新設＝営業日 date ヘルパー・直前の分ヘルパーの鏡像・
クライアント grant なし＝会計締め RPC の内部呼び専用・教訓21 の7例目で収載。★注記に他 RPC の生名は書かない＝パーサ罠）/ product_stock_totals（★live は1定義＝0079 は同一シグネチャの supersede）/
store_hourly_aggregate / store_category_aggregate / store_cohort_aggregate /
billing_writable_of / auth_org_billing_writable / nox_receipt_public /
**pricing_categories_for_register**（mig0131 新設＝#54 裁定済・STABLE 読取・非ゲート・開栓 RPC と同腕
〔kiosk 腕あり・authenticated grant のみ〕・active 区分の id/name/sort のみ返却＝「開栓できる者は区分を
選べる」の同値性。★起票#55 の「A6 先回り」は起草時に**読み取り専用＝B(f)** へ是正。
★注記に他 RPC の生名を書くと docNames パーサが名簿へ誤計上する＝言い換えで回避）
（E8-6c 追補5本 2026-08-19: 3本は mig0096 の T4 集計＝裁定 E8-6-7 で非ゲート・
　2本は 0088 の課金述語とその zero-arg ラッパ＝読取ヘルパー。教訓20 の残差是正。
　nox_receipt_public＝mig0099 2026-08-20 同時追補: ★NOX 初の anon 白名単1号・裁定 R2-11 改訂＝
　token 引数の DEFINER 読取・不在/void/期限切れは空 return・grants G2b の白名単 assert が本数=1 を係留）
**flag_enabled**（mig0135＝機能フラグの解決・店舗行→org 行→false の fail-closed・STABLE 読取・非ゲート・authenticated 実行可・C層①＝裁定182） /
**shift_open_periods_mine**（mig0151＝cast 本人の自店 shift_periods（status='open'）の start_date／end_date／wish_deadline 3 列のみ・cast 以外は 0 行・書込なし・非ゲート＝裁定287-2／289-2）

**referral_payouts_unpaid**（mig0152 新設・mig0155 でゲート行を除去＝店×期間の未払一覧の読取・owner∨manager 自店・裁定261 の「読取は課金停止中も通す」＝裁定307-1／309-5・A4 から移動・2026-09-28） /
**kiosk_check_keeps**（mig0155＝伝票の顧客名＋active キープのボトル名のみ・305-4 と同一露出・kiosk 腕あり＝裁定11 顧客系非開示の例外を本 RPC に限定・STABLE・ゲート行なし・裁定309-10／309 追補1） /
**cast_mynumber_discard_candidates**（mig0155＝マイナンバー廃棄候補＝退店日の翌年 1/1 起算 7 年経過＋暗号文あり・owner のみ・STABLE 読取・裁定309-3） /
**customer_anonymize_candidates**（mig0155＝顧客匿名化候補＝retention_until 到来＋未匿名化・owner のみ・STABLE 読取・裁定309-4）

**daily_pays_of_run**（mig0156＝run 期間内の日払いの cast 別合計（支払済額・源泉既徴収額・件数）＝collect が「日払い済み」控除行に写す・owner∨manager 自店・STABLE・裁定309-6／309 追補2 (b)） /
**payroll_run_deduction_overrides_of**（mig0156＝run 別控除上書きの読取・owner∨manager 自店・STABLE・裁定309-8） /
**okuri_today_summary**（mig0156＝okuri=true の退勤打刻のうち未発行のもの（punch 単位・base_amount＝店設定の送りベース額）・owner∨manager 自店・STABLE・裁定309-9／309 追補2 (e)） /
**advances_open_balance**（mig0156＝前借りの open 残高の cast 別合計・件数・最古日＝年末の貸付残高一覧・owner∨manager 自店・STABLE・裁定309-7） /
**cast_mynumber_discard_status**（mig0156＝マイナンバー廃棄記録（deleted_at／method／登録の有無）の読取のみ＝値は返さない・audit なし・owner／manager 自店／cast 本人・STABLE・起票85／309 追補2 (f)）
**payroll_attentions_of**（mig0158＝run の要対応（確定後の打刻修正）の一覧・cast 名つき・owner∨manager 自店・STABLE・裁定315） /
**kiosk_punch_state**（mig0158＝打刻端末が読む店設定 2 キー（送りの方式・送りベース額）・打刻端末の腕のみ・STABLE・裁定319 追補1）
**notice_mark_read**（mig0160＝cast 本人のお知らせ既読（cast_notice_reads へ冪等 upsert）・自店・audience all|cast のみ・書込は自分の既読行だけ＝非ゲート・裁定326-6／追補1-6）

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
| staff_wish_set | **事実記録**（mig0136＝黒服本人の希望◯×・締切前のみ。cast の shift_wish_submit と同型＝裁定233・2026-09-09） |

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

### B(l) C層② 黒服シフトのヘルパー（6本・2026-09-09・mig0136／0137）
公開 RPC 7 本のうち書込 6 本は 0137 で課金ゲートを内蔵し **A8 へ移動**（裁定233）。staff_wish_set は **B(i)**（事実記録）。ここに残るのはヘルパー 6 本。
| 関数 | 適用原理 |
|---|---|
| auth_membership_id | **ヘルパー**（本人 membership.id・authenticated 可・裁定 C②-9） |
| staff_shift_can_manage | **ヘルパー**（owner∨manager 自店判定。policy から呼ぶため 0137 で authenticated に execute＝教訓66・裁定231） |
| auth_staff_can_close / auth_staff_can_reopen | **ヘルパー**（mig0138＝memberships.can_close／can_reopen の読取・auth_staff_can_shift 同型・authenticated 可・C③-11）※B(f) 相当だが黒服系ヘルパーとして本節に置く |
| report_can_close / report_can_reopen / assert_day_open | **内部ヘルパー**（mig0138＝締め／解除の権限判定と締め済み営業日の関所・4 ロール明示 revoke・authenticated 実行不可＝B(a) 同型・C③-2／11） |
| staff_shift_biz_today / staff_shift_gate / staff_pattern_effective / staff_shift_deadline_at | **内部ヘルパー**（4 ロール明示 revoke・authenticated 実行不可＝B(a) 同型。biz_today は 0137 で biz_date_of へ委譲＝裁定232） |

### B(m) 非ゲート書込・法定履行（2本・2026-09-28・mig0155・裁定309 追補1 (b)）
法定の廃棄・保持期限の履行は課金停止中も止めない＝裁定261 の「読取は課金停止中も通す」を廃棄系の書込に拡張した新区分。ゲート行（'billing locked'）を持たない書込 RPC はここに置く（A に載せると「対象→live」assert が赤になる）。
| 関数 | 適用原理 |
|---|---|
| cast_mynumber_discard | **法定履行**（マイナンバーの廃棄＝暗号文を null 上書き・廃棄日時／実行者／方法の 3 列＋audit reason・owner のみ・平文は触らない・裁定309-3／309 追補1 (e)） |
| customer_anonymize | **法定履行**（顧客の匿名化＝name '削除済み顧客'・6 欄 null／false・anonymized_at・customer_notes 同時削除＝件数のみ audit・FK は残す・owner のみ・裁定309-4／309 追補1 (c)(d)） |

## C. kiosk 腕を持つ対象（実装注意・18本）
A1 の check_open / check_add_line / check_remove_line / check_add_seat / check_remove_seat /
check_move_seat / check_set_nominations / check_time_charge_apply / check_shimei_add / check_dohan_add /
check_pay / check_close ＋ bottle_keep_register ＋ check_extension_add（mig0089）＋
check_set_people（mig0090）＋ check_line_set_group（mig0091）＋ check_referral_set／check_referral_remove（mig0152・0148 の check_add_referral は drop）。
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

★**現在値（2026-09-18・mig0149 追随後）**: A **128** ＋ B **118** ＝ **246** ＝ live pg_proc 実列挙と一致（前＝mig0148 後 A 128＋B 117＝245・その前 mig0146 後 A 125＋B 116＝241。verify:nox-billing 段47-1 の pin＝対象 128／除外 118／ゲート済み 128／述語参照 129／挿入行の形 128）。

★**現在値（2026-09-28・mig0155 追随後）**: A **144** ＋ B **130** ＝ **274** ＝ live pg_proc 実列挙と一致（前＝mig0153 後 A 145＋B 123＝268。0155＝A4 の未払一覧 1 本を B(f) へ（−1）・非ゲート新設 6 本を B へ（B(a) 1・B(f) 3・B(m) 2）。verify:nox-billing 段47-1 の pin＝対象 144／除外 130／ゲート済み 144／述語参照 145／挿入行の形 144）。

★**現在値（2026-09-28・mig0156 追随後）**: A **145** ＋ B **138** ＝ **283** ＝ live pg_proc 実列挙と一致（0156＝A4 +1（daily_pay_issue）・B(e) +2・B(f) +5・B(a) +1。verify:nox-billing 段47-1 の pin＝対象 145／除外 138／ゲート済み 145／述語参照 146／挿入行の形 145）。

★**現在値（2026-09-29・mig0158 追随後）**: A **148** ＋ B **140** ＝ **288** ＝ live pg_proc 実列挙と一致（0158＝A4 +2・A8 +1・B(f) +2。verify:nox-billing 段47-1 の pin＝対象 148／除外 140／ゲート済み 148／述語参照 149／挿入行の形 147＝起票91）。

★**現在値（2026-09-30・mig0159 追随後）**: A **149** ＋ B **141** ＝ **290** ＝ live pg_proc 実列挙と一致（0159＝A8 +1・B(e) +1。verify:nox-billing 段47-1 の pin＝対象 149／除外 141／ゲート済み 149／述語参照 150／挿入行の形 149＝起票91 解消）。

★**現在値（2026-09-30・mig0160 追随後）**: A **154** ＋ B **142** ＝ **296** ＝ live pg_proc 実列挙と一致（0160＝A3 +2・A8 +4・A7 −1・B(f) +1。verify:nox-billing 段47-1 の pin＝対象 154／除外 142／ゲート済み 154／述語参照 155／挿入行の形 154）。

★**現在値（2026-10-08・mig0163／0164 追随後）**: A **154** ＋ B **149** ＝ **303** ＝ live pg_proc 実列挙と一致（0161＝B(a) +1（punch_seq_check）・0162＝B(a) +5・0163＝B(a) +1（demo_entries_purge）・0164＝本数不動（set_store_profile 改稿）。verify:nox-billing 段47-1 の pin＝対象 154／除外 149／ゲート済み 154／述語参照 155／挿入行の形 154）。
