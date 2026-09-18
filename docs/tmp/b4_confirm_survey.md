# B4 シフト 段階遷移・キャスト確認・店舗設定・不足人数 調査（2026-09-11 17:05〜 JST・読取のみ・HEAD 4a7f201・ahead 12）

何も変更していない。DB は REST（service key・SELECT）で DEMO の件数だけ読取。

## 2. 段階遷移（申請→承認→仮シフト（キャスト確認）→確定）

shifts.status は 3 値（mig0101 `shifts_status_check`: planned／proposed／confirmed）。shift_wishes.status は pending／accepted／rejected／withdrawn（0008）。

| 段階 | 遷移 | RPC（最新定義） | 引数 | 権限（RPC 本文） | 画面・行 |
|---|---|---|---|---|---|
| 1 申請 | wish pending | shift_wish_submit(p_date, p_start_hm, p_end_hm)／shift_wish_withdraw(p_wish_id) | cast 本人 | auth_cast_id 本人 | /mine/wishes |
| 2 承認 | wish pending→accepted＋shifts planned 生成（wish_id 保持） | shift_wish_decide(p_wish_id, p_accept)（0103） | owner／manager 自店。pending 以外 'already decided'・定休日 'closed day'・重複 'duplicate' | shift-board `:402`（行）・`:420`（まとめて承認 `:416` confirm 文言） |
| 3 仮シフト（キャスト確認へ） | planned→proposed | shift_propose(p_shift_ids uuid[])（0102） | owner／manager 自店。planned 以外は 'bad rows' | shift-board `:508` → 行「確認へ」`:1029`／「キャスト確認へ」`:1421`／「{n}件まとめてキャスト確認へ」`:1290` |
| 3' キャスト確認 | proposed→confirmed | shift_cast_confirm(p_shift_id)（0102） | **cast 本人のみ**（auth_cast_id 一致）。proposed 以外 'bad status'（一方向） | /mine `page.tsx:252` → shift-confirm-button.tsx `:20` |
| 4 確定（店側） | planned／proposed→confirmed | shift_confirm_bulk(p_shift_ids uuid[])（0126・裁定114） | owner／manager 自店。`status not in ('planned','proposed')` は 'bad rows'・上限 62・重複 id 除去 | shift-board `:521` → 「{planned+proposed}件を一括確定」`:1300`（承認待ちタブ・isManagerUp） |
| 4' 個別 | 任意→planned／proposed／confirmed | shift_set(p_id, p_cast_id, p_date, p_start_hm, p_end_hm, p_status, p_override_reason)（0125） | owner／manager 自店。p_status は 3 値どれでも受理 | shift-board `:443`（追加）・`:458`（時間調整＝status 据え置き `:452`）・`:534`（差し戻し） |
| 行操作 差し戻し | proposed→planned | shift_set の status 再送（新 RPC なし・SD V2-2） | 同上 | demoteShift `:532` → 「差し戻す」`:1430` |
| 行操作 再調整（時間を調整） | status 据え置きで時刻更新 | shift_set（`:458`） | 同上 | 「時間を調整」`:1788`（日詳細）。時間調整モーダル |
| 行操作 削除 | 行削除（wish は pending へ戻す） | shift_remove(p_id)（0103） | owner／manager 自店。confirmed かつ attendance あり 'has attendance' | removeShift `:429` → 「削除」`:1423`／`:1431`／`:1798` |
| 期間 | period draft→published 等 | shift_period_set／shift_period_remove（`:472`／`:482`／`:491`） | owner／manager 自店 | 「スタッフに公開して確定」＝period の status 遷移のみ（`:487` コメント） |

**「108件を一括確定」（`:1300`）が呼ぶ RPC＝shift_confirm_bulk**。本文（0126 L22／L28-30）は `status in ('planned','proposed')` を一括で `confirmed` にする＝**planned からも proposed からも段階 3'（キャスト確認）を飛ばして確定できる**。承認待ちタブの母集団は planned＋proposed（`[...planned, ...proposed]`）。verify:nox-shift-confirm (b1) が「planned＋proposed 混在 → 全件 confirmed」を正系として固定している（裁定114 の仕様）。

黒服（staff）側の「この営業日を一括確定（proposed 件）」（staff-shift-manage `:150`）は別器＝staff_shift_confirm を行ごとに順次（C層②）。cast シフトの 108 件とは無関係。

## 3. キャスト確認の実体

- UI: /mine（`app/mine/page.tsx:247-252`）で status=proposed の行に「確認する」（shift-confirm-button.tsx・btnGold）。confirmed／planned は表示のみ（「確定」「予定」）。
- RPC: shift_cast_confirm(p_shift_id) → `v_row.cast_id <> auth_cast_id()` で forbidden・`status <> 'proposed'` で bad status → `update shifts set status='confirmed'`。cast 初の shifts 書込 RPC（SD V2-3）。
- 確認済みを表す列＝**shifts.status='confirmed' だけ**（確認者・確認時刻・店側確定と本人確認の区別は無い）。CHECK は 3 値のみ。
- 確認を経ずに確定した行は、既存 verify で **赤にならない**。verify:nox-shift-confirm (a1)(b1) は planned→confirmed を正系として assert。verify:nox-shift-deep 段59-3 は「planned 行は bad status（proposed のみ確認可）」を cast_confirm 側で固定（店側の一括確定は対象外）。rls F1d-SD は他人の行の cast_confirm 拒否のみ。f0 に「confirmed は必ず proposed を経る」を assert する段は無い。

## 4. 店舗設定の器

- stores.settings_json の現行キー（migrations／app の参照）: biz_cutoff_hm（9）・okuri_mode（5）・cast_register_enabled（4）・shimei_norm_scope／shimei_norm_enabled／sales_norm_enabled（各 2）・receipt_tel／receipt_footer／receipt_address（各 2）・okuri_base_amount（2）・invoice_reg_no（2）・service_rate／round_unit／round_mode／pin_lock_minutes／pin_lock_max_fail／card_tax_rate（各 1）・printer_enabled（app 1）。
- 書込経路＝**setter RPC のみ**（jsonb_set で 1 キーずつ）: set_store_biz_cutoff(p_store_id, p_hm)／set_store_okuri_mode／set_store_okuri_base／set_store_cast_register／set_store_norm_config／set_store_receipt_profile／set_store_pin_policy(p_store_id, p_max_fail, p_lock_minutes)／set_store_pricing／set_store_time_pricing／set_store_business_hours／store_sales_target_set。client から `stores` を update する経路は無い（policy は stores_select のみ・grants は authenticated=SELECT のみ＝verify:nox-grants のスキーマ全体ガード）。
- feature_flags（flag_enabled(p_key, p_store_id)・店行→org 行→false）の key 白名単＝**staff_shift／reopen_flow／qr_order／notify** の 4 つ（0135 CHECK）。読取は feature-flags-panel／staff-shift-panel `:83`／register-board `:356`／report-board `:339`／business-hours page。
- 台帳「店舗設定 setter mig（小）」の本文（逐語・`docs/NOX_裁定台帳.md:3816`）: 「**停止リスト4件の処置（相談役裁定 2026-09-07）**: ①N3 店舗設定「基本情報」タブ（店舗名／表示名／略称の書込 RPC なし）＝**店舗設定 setter mig へ統合**（S9/S11/S12 の `set_store_profile` 系＝C層①の機能フラグ器と同じ設計書で起草）。②N4(b) `ext_shimei_enabled`／`dohan_auto_hon` の設定 UI＝**同じ店舗設定 setter mig へ統合**（対応表 §6 要点10 の単独起票は本 mig に吸収）。③N4(e) 会計後タイムライン（R57）＝**レジ v12.1 レーン送り**（伝票詳細の履歴 UI は v12.1 の写像 R 系と一体で設計・audit_logs の閲覧スコープはそこで裁定）。④N5 docs/tmp 残置39件＝**「レーンD 分類表」を docs 化した後に棚卸し**（分類表なしの削除は行わない）。」
- 対応表 §6 要点 3（`:483`）: 「店舗プロフィール（S9-S14）: `set_store_profile` 新設（name/short＋settings_json.store_code/display_name/show_open_status）。タイムゾーンは固定表示のみ（保存しない）を推奨。」＝setter mig はまだ起草されていない（S9／S11／S12 は「新要件（器あり・書込 RPC なし）」のまま）。

## 5. 不足人数の算出元

- 必要人数＝**staffing_needs**（mig0095・(store_id, dow, from_min) unique・列 dow／required／from_min／to_min）を直 SELECT（shift-board `:353`）。書込＝set_staffing_need／staffing_need_remove（`:554`／`:566`）。
- 配置数＝shifts の client 集計（新規取得なし・`:605-662`）: バンド充足 `assigned`＝当該時間帯に交差するシフト数（**全 status**＝planned／proposed／confirmed を数える・裁定44）÷ required。日単位＝バンドの最悪値（`fillOf`: required 0＝未設定／充足／1 人不足＝やや不足／2 人以上＝不足）、required はピーク max、shortage は最悪バンドの不足数。
- カレンダーの「n/m」＝`st.assigned/st.required`（`:1591`・required>0 のとき）、「手k」＝source='manual' の件数（`:1584-1596`・自k＝auto）。「人員不足日（今後）」＝今日以降で required>0 かつ assigned<required の日数（`:1102-1104`・裁定53'）。
- shift-add-form（`:88-104`）の props＝casts／photoUrls／initialCast／bhRows／initialDate／initialStatus／open／onClose／onSaved。**必要人数・配置数は受け取っていない**（モーダル側で staffing_needs も shifts も読まない）。
- DEMO の staffing_needs（CLUB NOX）: 7 曜日 1 バンドずつ・required 3〜5。

## 6. DEMO の現状（2026-09）

- CLUB NOX の shifts 2026-09＝**108 件・全件 status=proposed・source=manual**（planned 0・confirmed 0・auto 0）。他店の 2026-09 shifts は 0 件。shift_wishes 2026-09 は 0 件（wish 由来ではない手動登録＝shift_bulk_set_daily／shift_set で planned を作って shift_propose 済み、または shift_set(p_status='proposed')）。
- したがって「108件を一括確定」の 108＝**全件がキャスト確認待ち（proposed）**。押すと shift_confirm_bulk で 108 件＞上限 62 のため `'too many'`（UI は 62 件超で事前に「一括確定は62件以内に絞ってください」`:518`）＝現状の DEMO では押しても通らない。

## 7. 裁定が要る点

1. **店側の一括確定が段階 3'（キャスト確認）を飛ばす**（planned／proposed→confirmed）のを仕様として維持するか、proposed のみ（キャスト確認待ちを店が代理確認）に狭めるか、planned は不可にするか。verify:nox-shift-confirm (b1) の期待も連動。
2. **本人確認と店側確定の区別**を持つか（列追加＝confirmed_by（cast／manager）・confirmed_at＝mig）。現状は status=confirmed の 1 値で区別不能。
3. **上限 62 と 108 件**: 承認待ちタブの一括確定は 62 件までなので DEMO の 108 件は通らない。上限の由来（0126）を据え置くか、UI で 62 件ずつ分割するか。
4. **差し戻し（proposed→planned）と時間調整（status 据え置き）**の扱いは現状どおりでよいか（B4 H23「時間調整して承認」＝decide→set の 2 段は shift-add-form のみ）。
5. **店舗設定 setter mig**: S9／S11／S12（set_store_profile）＋ext_shimei_enabled／dohan_auto_hon を 1 本にまとめる台帳の方針は据え置きか。settings_json のキー命名（display_name／store_code／show_open_status）と feature_flags 4 キーとの役割分担（設定値 vs ON/OFF）。
6. **shift-add-form に必要人数・配置数を渡すか**（props 追加＝client のみ・staffing_needs と shifts は親が持っている）。渡す場合の表示（バンド別 n/m か日単位か）。
7. **DEMO データ**: 108 件 proposed のまま置くか、目視用に一部を confirmed／planned に振り分けるか（seed:demo の改修＝dev 専用）。
