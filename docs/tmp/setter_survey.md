# 店舗設定 setter mig（小）着手前調査（2026-09-11 17:25〜 JST・読取のみ・HEAD b4be1ab・ahead 14）

live dump（pg_get_functiondef 逐語・proacl・policy・grant・列・dev のキー集合）＝`docs/tmp/setter_dump.txt`。何も変更していない。

## 2. 台帳・対応表の本文（逐語）

- 台帳 `:3816`「**停止リスト4件の処置（相談役裁定 2026-09-07）**: ①N3 店舗設定「基本情報」タブ（店舗名／表示名／略称の書込 RPC なし）＝**店舗設定 setter mig へ統合**（S9/S11/S12 の `set_store_profile` 系＝C層①の機能フラグ器と同じ設計書で起草）。②N4(b) `ext_shimei_enabled`／`dohan_auto_hon` の設定 UI＝**同じ店舗設定 setter mig へ統合**（対応表 §6 要点10 の単独起票は本 mig に吸収）。③…④…」
- 台帳 `:3808`「**(b) `ext_shimei_enabled`／`dohan_auto_hon` の設定 UI＝停止**（理由: 両列を書く `set_store_*` RPC が存在しない＝RPC 引数追加＝mig 領域＝対応表 §6 要点10「単独起票候補」のまま）。」
- 対応表 §6 要点 10 `:490`「**単独起票候補（管理 UI の欠落）**: `stores.ext_shimei_enabled`（0124）・`stores.dohan_auto_hon`（0118）は列あり・UI ゼロ（verify のみ参照）。」
- 対応表 §6 要点 3 `:483`「**店舗プロフィール（S9-S14）**: `set_store_profile` 新設（name/short＋settings_json.store_code/display_name/show_open_status）。タイムゾーンは**固定表示のみ**（保存しない）を推奨。」
- 対応表 S9 `:61`「店舗名 | 列 `stores.name`（0001）。**編集 UI なし**（読取のみ）… | 新要件（器あり・書込 RPC なし） | **要**（`set_store_profile` 新設・列は既存）」／S11 `:63`「店舗表示名 | 列 `stores.short`（0001:51）は存在するが**参照・編集ゼロ** | 新要件（器あり・UI なし） | **要**（書込 RPC） | v3 は表示名／略称の**2項目**＝short は1本＝片方は settings_json 追加」／S12 `:64`「店舗略称 | 同上」／S10「管理用店舗コード… 器候補＝`settings_json.store_code`」／S14「営業ステータス表示… 要（`settings_json.show_open_status`）」。
- 裁定245-1（9/11）「キャスト確認は店舗設定 settings_json.shift_cast_confirm（boolean・既定 false）。setter は店舗設定 setter mig（小・set_store_profile 群と統合）に同梱し本裁定の client には含めない。」

### 統合対象のキー（案・表）

| 対象 | 器 | 型 | 既定値 | 権限（案） | 出典 |
|---|---|---|---|---|---|
| 店舗名 | stores.name（列・NOT NULL） | text | — | owner のみ（店の同一性＝S9） | 3816 ①・S9 |
| 店舗表示名 | stores.short（列・null 可・参照ゼロ）または settings_json.display_name | text | null | owner のみ | S11（2 項目のうち片方は settings_json） |
| 店舗略称 | 同上（short を略称に当て表示名を settings_json へ、の割当は裁定） | text | null | owner のみ | S12 |
| 管理用店舗コード | settings_json.store_code | text | null | owner のみ | S10（一意が要るなら新列） |
| 営業ステータス表示 | settings_json.show_open_status | boolean | false | owner のみ | S14 |
| 延長指名料 ON/OFF | stores.ext_shimei_enabled（列・0124） | boolean NOT NULL | false | owner のみ（money 境界＝check_extension_add の課金分岐） | 3816 ②・要点10 |
| 同伴時の本指名自動付与 | stores.dohan_auto_hon（列・0118） | boolean NOT NULL | false | owner のみ（money 境界＝nomination 昇格） | 3816 ②・要点10 |
| キャスト確認の任意化 | settings_json.shift_cast_confirm | boolean | false（キー無し＝false） | owner のみ（既存 boolean setter＝cast_register と同格） | 裁定245-1 |

権限の現行水準: settings_json 系 setter は **owner 限定**（cast_register／okuri_mode／okuri_base／norm_config／receipt_profile／pin_policy／biz_cutoff）。料金列 setter（pricing／time_pricing／tax_config）と business_hours・sales_target は **owner ∨ manager 自店**。統合 setter は「店のプロフィール＝owner 限定」に揃えるのが現行と整合（manager に開くなら裁定）。

## 3. live dump（要点・全文は setter_dump.txt）

- 既存 setter 15 本（set_store_biz_cutoff／business_hours／cast_register／norm_config／okuri_base／okuri_mode／pin_policy／pricing／receipt_profile／tax_config／time_pricing・store_sales_target_set・flag_enabled／flag_set）。proacl はすべて `{postgres=X, authenticated=X, service_role=X}`（anon・public なし）。
- boolean 1 キーの型＝**set_store_cast_register(p_store_id, p_enabled)**: auth_org_id null→forbidden／billing_writable_of／p_enabled null→'bad enabled'／店の org 照合→forbidden／`auth_role() <> 'owner'`→forbidden／`update stores set settings_json = jsonb_set(coalesce(settings_json,'{}'), '{cast_register_enabled}', to_jsonb(p_enabled), true)`／`audit_log_write('set_store_cast_register', 'stores:'||id, before, after, store)`。
- 複数キーの型＝**set_store_receipt_profile(p_store_id, p_address, p_tel, p_reg_no, p_footer)**: owner 限定・長さ／書式 CHECK（address 200・tel 50・footer 200・reg_no `^T[0-9]{13}$`）・**jsonb_set の 4 重入れ子**で 4 キーを書く・before/after を jsonb_build_object で audit。
- **共通 helper は無い**（settings_json を jsonb_set で書く関数は set_store_* 以外に 0）。各 setter が自前で `jsonb_set(coalesce(settings_json,'{}'), '{key}', to_jsonb(v), true)` を書く（time_pricing は build_object のみ・tax_config は列直書き）。
- stores の RLS: policy は **stores_select のみ**（`org_id = auth_org_id() and (auth_role()='owner' or id = auth_store_id())`）。grant は authenticated＝SELECT のみ（INSERT／UPDATE は postgres／service_role のみ）＝client から stores を update する経路は無い。RLS enabled（force なし）。
- stores 列（live 30 列）: name／short／open_time／settings_json＋料金・税・時間料金の列＋receivable_policy＋**dohan_auto_hon boolean NOT NULL default false**＋**ext_shimei_enabled boolean NOT NULL default false**。
- dev の settings_json キー集合: CLUB NOX `{biz_cutoff_hm, cast_register_enabled, okuri_mode}`・A1 `{okuri_mode}`・A2／B1 `{}`。shift_cast_confirm はどの店にも無い（＝全店 false）。

## 4. settings_json の読み側（キーと fallback）

| キー | 読み側 | fallback（キー無し） |
|---|---|---|
| biz_cutoff_hm | dashboard/page.tsx `:22-23`・shift/page.tsx（cutoff）・business-hours-panel `:96-97`・register／report 系 | string で非空なら採用・それ以外 "06:00" |
| cast_register_enabled | master/cast-comp/register/page.tsx `:19`・cast-register-panel | `=== true`（無し＝false） |
| okuri_mode／okuri_base_amount | master/cast-comp/deduction/page.tsx・deduction-panel | panel 側の既定（flat／null） |
| sales_norm_enabled／shimei_norm_enabled／shimei_norm_scope | master/cast-comp/{page,plan/page}.tsx・norm-config-panel | 未設定＝false／既定 scope |
| pin_lock_max_fail／pin_lock_minutes | kiosk-pin-panel `:98-99` | 既定 5 回／15 分 |
| receipt_address／tel／footer／invoice_reg_no | printer-panel・領収書 | 空文字 |
| **shift_cast_confirm** | shift/page.tsx `:32` `((stores?.[0]?.settings_json ?? {}) as Record<string, unknown>).shift_cast_confirm === true` | **false**（キー無し・非 true はすべて false）＝確認済み |

読み側はすべて `stores.select("settings_json")` の直読（RLS 越し）で、キー無しは各所で既定値に倒す流儀＝統合 setter で新キーを足しても既存の読み側は壊れない。

## 5. 共通関数の有無

- 無し。各 setter が `jsonb_set(coalesce(settings_json, '{}'::jsonb), '{key}', to_jsonb(v), true)` を直書き（cast_register 型＝1 キー・receipt_profile 型＝入れ子 4 キー）。`settings_json || jsonb_build_object(...)` 型は無い（jsonb_build_object は audit の before/after にのみ使用）。
- 統合 setter で「キーを検証して 1 キーずつ書く」helper（例 `store_setting_set(p_store_id, p_key, p_value jsonb)` 内部専用・白名単 CHECK）を新設するか、receipt_profile 型の入れ子で複数キーを一括で書くかは起草時の裁定。

## 6. verify が固定しているもの

| suite | 段 | 内容 | 新 setter への影響 |
|---|---|---|---|
| verify:nox-anon-guard | 段12a ほか（`:391-404`・`:468-470`・`:542`・`:572-573`・`:621`・`:635`・段25／26 `:3051-3220`） | 各 set_store_* を anon で呼び BLOCKED（"permission denied for function"）を assert。business_hours は owner／manager／crm の role 別 runtime も | **新 setter は名簿（配列）へ 1 行追加が要る**（追加しなくても赤にはならない＝漏れ） |
| verify:nox-grants | `:372`・`:512`・`:574`・`:705-737`・`:789-793` | set_store_okuri_mode／cast_register／receipt_profile／pricing／time_pricing の EXECUTE ロール（authenticated のみ・anon/public 不在）を roleOf で assert | 新 setter は同型の assert を 1 段足す（任意） |
| verify:nox-billing | 段47-1（`:134-160`） | **live pg_proc 全数 ＝ 正本 A∪B**（対象 123 本にゲート・除外 83 本にゲート無し）を機械 assert | **新 RPC は必ず正本 A（ゲート入り）か B（除外）に登録しないと赤**（教訓21）。setter は billing_writable_of を入れて A へ |
| verify:nox-rls | settings_json のキー集合を固定する assert は無し | — | — |

settings_json のキー集合そのものを固定する段は無い（キー追加で赤になる段は無い）。

## 7. /master の呼び出し箇所と置き場

| 画面（節） | 呼ぶ setter | 統合 setter への付け替え対象か |
|---|---|---|
| /master/business-hours（BusinessHoursPanel） | set_store_biz_cutoff `:110`・set_store_business_hours `:133`／`:163` | 対象外（営業時間は別器） |
| /master/cast-comp/register（cast-register-panel） | set_store_cast_register `:35` | 統合 setter に吸収するなら対象（boolean 1 キー型の前例） |
| /master/cast-comp/deduction（deduction-panel） | set_store_okuri_base `:43`（okuri_mode は同 panel） | 対象外（報酬系） |
| /master/cast-comp/norma（norm-config-panel） | set_store_norm_config `:40` | 対象外 |
| /master/system#pins（kiosk-pin-panel） | set_store_pin_policy `:140` | 対象外 |
| /master/system#receipts（printer-panel） | set_store_receipt_profile `:93` | 対象外（レシート） |
| /master/system#features（feature-flags-panel） | flag_set `:60` | 対象外（feature_flags は ON/OFF の器・設定値ではない） |
| /master/pricing（pricing-board／pricing-panel／time-pricing-panel） | set_store_tax_config `:340`・set_store_pricing `:75`・set_store_time_pricing `:54` | 対象外（料金列） |

トグルの置き場（候補）:
- **shift_cast_confirm**: /master/business-hours（BusinessHoursPanel＋StaffShiftPanel の並び＝シフト運用の節）に「キャスト確認を使う」トグル。または /master/system#features の隣（ただし features は feature_flags＝ON/OFF 器で、設定値と混ぜない方が整理しやすい）。
- **ext_shimei_enabled**: /master/pricing の時間料金（time-pricing-panel）の隣（延長課金の分岐＝料金の文脈）。
- **dohan_auto_hon**: /master/pricing の指名料（pricing-panel）の隣、または /master/cast-comp（指名種別の文脈）。
- **店舗名／表示名／略称／店舗コード／営業ステータス表示**: /master に「店舗情報（基本情報）」の節を新設（master-board の「店舗・運用」ハブに card 追加）。

## 8. 裁定が要る点

1. 統合 setter の形: 1 本（set_store_profile に全キー＝引数 8〜9）か、プロフィール（name／short／store_code／display_name／show_open_status）と運用フラグ（ext_shimei_enabled／dohan_auto_hon／shift_cast_confirm）の 2 本か、boolean 1 キー helper（内部専用・白名単）＋薄い公開 setter か。
2. 権限: 全部 owner 限定（現行の settings_json setter と同格）か、shift_cast_confirm だけ manager 自店にも開くか。
3. short の割当（表示名／略称のどちらを列にするか）と store_code の一意性（settings_json のままか新列か）。
4. money 境界の 2 列（ext_shimei_enabled／dohan_auto_hon）を同じ setter に載せる可否（課金分岐に効く値＝audit の before/after 必須・0124／0118 の挙動不変）。
5. 名簿の同期: anon-guard の配列と billing 正本 A への追加を mig と同じコミットで行うか（教訓21）。
6. UI の置き場（§7 の候補）と、master-board の card 追加（「店舗情報」）の要否。
