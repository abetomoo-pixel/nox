# NOX 課金設計 v1.1（2026-08-17 起草・同日 v1.1＝ゲート確定リスト固定）

正本規約: 本書ロック後は本書＋repo/live が正。BANZEN billing は型の供給元（対応表 §7）であり
挙動の正本ではない。裁定 1–9 確定済み（推奨採用・相談役チャット 08-17）。
v1.1 改訂（2026-08-17・保留16本の裁定反映）: §4 シフト系文言修正・§4.5 確定リスト（対象87/除外82）
・open 伝票の付随裁定。原本 v1 の sha256 1453584a…（git 履歴 898f7bc が保持）。

## 1. 商流と課金モデル（裁定1–3）

- 課金主体 = **org 単位**。1 org = Stripe subscription 1本
- 数量 = **quantity = count(stores) の min 1**（裁定8・store 休止概念は作らない＝post-launch）
- プラン = **単一プラン × 周期軸のみ**（月/年）。機能軸なし（レジ→給与の一本商流を割らない）
- Stripe = **Rexsol 共通アカウント・NOX 用 Product 1 + Price 2本**（monthly/yearly・
  licensed × quantity）。dev は sk_test で完結。本番 Price は BANZEN Track B 完了後
- ★orgs.plan('early/standard/premium') / orgs.status は**死列・不触**（裁定7）。
  課金正本は org_billing 一本。死列は台帳記録・post-launch 掃除

## 2. org_billing（BANZEN 0013 型の翻訳）

```
org_billing:
  org_id uuid PK references orgs(id)
  stripe_customer_id text null
  stripe_subscription_id text null
  status text not null default 'trialing'
    CHECK in ('trialing','active','past_due','canceled','inactive')
  interval text null CHECK (null or in ('month','year'))
  collection_method text not null default 'charge_automatically'
    CHECK in ('charge_automatically','send_invoice')   -- BT（裁定4・0104 型）
  trial_ends_at timestamptz not null default (now() + interval '30 days')  -- 裁定5
  current_period_end timestamptz null
  quantity integer not null default 1 CHECK (quantity >= 1)
  created_at / updated_at timestamptz not null default now()
```
- RLS: SELECT = owner（org 一致）のみ。**書込ポリシーなし＝service 専用**（regnorm: 
  revoke all from public, anon, authenticated → grant select to authenticated ＋ RLS で owner 絞り）
- 既存 org への backfill: 挿入時 trial_ends_at = now()+30d（ローンチ時に全 org トライアル開始。
  fixture/DEMO org は verify 都合で 'active' 直指定＝seed 側で吸収・段47 で固定）

## 3. ゲート述語（裁定6・9＋B7 の構造的解決）★本設計の核

```
billing_writable_of(p_org_id uuid) returns boolean   -- 正本・auth 非依存
  = org_billing 行を直読みし
    status in ('trialing','active','past_due')
    and (status <> 'trialing' or trial_ends_at > now())   -- 0070 の期限切れ分岐を述語内で解決
    行なし → false（fail-closed）
auth_org_billing_writable() returns boolean          -- RLS/route 用ラッパ
  = billing_writable_of(auth_org_id())
```
- **引数版が正本**＝kiosk 腕（v_org 直渡し）・service 文脈でも同一述語を安全に呼べる
  （BANZEN 0143 guest_gate_ok の一般化。「silently false」罠を運用でなく構造で消す）
- ACL: billing_writable_of = 内部型（biz_minutes_of 同型・authenticated 剥奪）。
  auth_org_billing_writable = authenticated 可
- ★zero-arg ラッパを service 専用 RPC が呼ばないことは段47 で prosrc 機械検証
  （BANZEN 0139_r2/0145 型）

## 4. ゲート対象（read-only 失効＝裁定5）

原則: **失効後も見える・出せる・書けない**。SELECT/エクスポート/印刷は不触。
挿入点は「顧客操作の入口 RPC」冒頭に `if not public.billing_writable_of(v_org) then
raise exception 'billing locked'; end if;`（v_org 確定直後・auth ガードの後）。

- 対象（入口系・確定リストは §4.5＝v1.1 で固定済み）:
  レジ系 check_open/check_add_line/check_shimei_add/check_dohan_add/check_pay 系/
  approval 系・**シフト系は owner/manager の確定系のみ（shift_set / shift_wish_decide /
  set_staffing_need。cast の希望提出 shift_wish_submit/withdraw は除外＝事実記録・
  BANZEN 0014「希望提出除外」前例）**・マスタ書込系（products/categories/pricing/cast_ranks/
  comp_plans/cast_plan/norma/deduction 系）・顧客/告知系書込
- 除外（B7 回避型(1)）: service/内部専用 20本（payroll_finalize/mark_paid/reopen・
  audit_log_write・check_recalc/group_due・stock トリガ関数・get_cast_mynumber 等）＋
  pricing_resolve_core などの内部関数・**打刻系**（BANZEN 前例＝出退勤の事実記録は
  課金で止めない）・payroll 系一式（給与は過去労働の清算＝止めると労務事故）
- kiosk 腕を持つ 18本: ゲートは billing_writable_of(v_org) で挿入（kiosk でも v_org は
  0057(2) で確定済み＝罠なし）
- route 側: billingGate（BANZEN gate.ts 型・user client で auth_org_billing_writable）を
  書込 API に一次ゲートとして併設（二重化・集合一致を verify で固定）

## 4.5 ゲート確定リスト（v1.1 固定・2026-08-17 裁定）

★判定原理（迷ったらこの2行に還元）:
**除外 = 清算・事実記録・セキュリティ・給与前提／対象 = 新規営業・拡大・金銭記録の作成改変**

母集団 169 関数名（backup 2026-07-27 の 144＋mig0066-0086 補完25・全数照合済み・保留ゼロ）。
全名列挙の作業台帳 = docs/tmp/billing_gate_list_draft.md v1.1（★live 突合後に pg_proc 実列挙と
再照合してから mig0087 起草）。

**対象 87本**:
| 分類 | 本数 | 内訳 |
|---|---|---|
| レジ・会計 | 17 | check_open/add_line/remove_line/add_seat/remove_seat/move_seat/set_nominations/time_charge_apply/shimei_add/dohan_add/pay/close/**void**・approval_request/direct/decide・bottle_keep_register |
| ドリンク申告 | 4 | drink_claim_submit/submit_proxy/decide/**void** |
| 予約 | 4 | reservation_create/update/set_status/to_check |
| 金銭発行・取消 | 6 | adv_issue/**cancel**・transport_issue/**cancel**・incentive_publish/**cancel**（取消も金銭記録の改変＝対象） |
| シフト（確定系） | 3 | shift_set・shift_wish_decide・set_staffing_need |
| 商品・料金マスタ | 13 | set_product/set_product_active/set_product_category/product_category_reorder/product_bulk_insert/product_reorder/product_stock_add/set_seat/set_pricing_rule/delete_pricing_rule/pricing_rule_reorder/set_store_pricing/set_store_time_pricing |
| 待遇・報酬マスタ | 11 | set_cast_rank/set_cast_rank_of/cast_rank_reorder/delete_cast_rank/set_comp_plan/set_cast_plan/set_cast_norm/set_custom_back_def/set_deduction/set_penalty_config/set_store_norm_config |
| 店設定 | 9 | set_store_okuri_base/okuri_mode/business_hours/receipt_profile/cast_register・set_cast_register・set_printer_config・set_cast_pin/set_staff_pin |
| 顧客・告知 | 6 | customer_register/update/assign_cast・notice_create/update/delete |
| スタッフ・キャスト管理 | 13 | staff_create/change_role/update_profile/transfer_store/reactivate・set_staff_perms・cast_create/cast_invite/**cast_rejoin**（復帰=拡大）・trial_register/update/hire/reject |
| デバイス | 1 | kiosk_provision |

**除外 82本**:
| 分類 | 本数 | 代表（全名は作業台帳） |
|---|---|---|
| 構造除外（authenticated 実行不可） | 23 | payroll_finalize/mark_paid/reopen・audit_log_write 系・check_recalc/group_due/round_amount・stock トリガ・pricing_resolve_core 等 |
| トリガ関数 | 1 | touch_updated_at |
| 打刻・出欠の事実記録 | 5 | punch_self/proxy・kiosk_punch・attendance_set/set_self |
| 打刻導線 | 3 | kiosk_login/logout・auth_kiosk_operator（★ゲートすると打刻除外が空文化） |
| payroll 系 | 3 | payroll_run_create・payment_record_add・withholding_payment_record |
| 読取（SELECT/集計/エクスポート源） | 34 | get_* / *_summary / kiosk 読取 / auth_* ヘルパー / pricing_resolve / product_stock_totals 等 |
| 印刷 | 1 | print_enqueue（「出せる」明文） |
| セキュリティ/縮退専用 | 2 | staff_deactivate・kiosk_deactivate |
| 裁定除外（2026-08-17） | 10 | receivable_collect/mark_deduct（清算）・daily_report_close/reclose（清算・事実記録）・shift_wish_submit/withdraw（事実記録）・set_cast_tax_profile/set_cast_sensitive（給与前提）・cast_leave（事実記録・縮退）・rotate_store_token（セキュリティ） |

★付随裁定（open 伝票）: **失効を open のまま跨いだ伝票も check_pay / check_close はゲート対象**
（read-only の徹底＝失効中は決済・是正（void）とも不能・閲覧のみ。writable 復帰後に通常どおり処理）。

## 5. トライアル・失効・BT（裁定4–5）

- 新規 org: provision 時に org_billing 挿入（trialing・30日・カード登録不要）
- 失効: billing_writable_of が trialing 期限を述語内で判定＝**expire バッチ不要が基本**。
  表示用 status の 'inactive' 倒しは webhook/cron の整備側（表示と判定を分離＝判定は述語一本）
- BT: collection_method='send_invoice'。BANZEN BT-1〜7 の写像（§7）。運営者発行
  （rexsol コンソール相当）は NOX 側に運営者面が無いため **v1 は service スクリプト運用**・
  コンソール化は post-launch
- リマインダ: BT-4 純関数 [14,7,3,2,1,0] を lib ごと移植・cron route 同型

## 6. UI / env

- 独立 /billing（owner 限定・BANZEN (app)/billing 翻訳）＋ billing-banner
  （app-shell 自動描画・read-only 失効の告知動線）＋ nav ゲート
- checkout/portal/change-plan（周期切替のみ＝単一プラン）/switch-to-card・webhook・cron
- env 新設: STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / STRIPE_PRICE_NOX_MONTHLY /
  STRIPE_PRICE_NOX_YEARLY（BANZEN 命名系に整列）

## 7. BANZEN→NOX 対応表（実装時の参照）

| BANZEN | NOX |
|---|---|
| 0013 tenant_billing | mig0087 org_billing |
| 0014 auth_billing_writable＋RLS 織込み | mig0087 billing_writable_of＋auth_org_billing_writable。RLS 織込みはせず RPC 冒頭挿入で統一（NOX は書込が RPC 専任のため） |
| 0041–0043 2フラグ・プラン軸 | **写さない**（単一プラン＝プラン軸ゲート不要） |
| 0070 provision＋trialing 期限倒し | provision 系＋述語内期限判定（§3） |
| 0071 expire_trials | 表示用 status 整備 cron（判定非依存） |
| 0104 collection_method | org_billing 同居（§2） |
| 0143 guest_gate_ok | billing_writable_of 引数版そのもの（一般化済み） |
| lib/billing 7本＋routes＋UI | ほぼ全移植（quantity.ts は stores count へ・plan 軸コード削除） |

## 8. 実装レーン構成

- **mig0087**（★live 突合通過後に起草＝Supabase 復旧ゲート）: org_billing＋述語2本＋
  ゲート挿入（対象 RPC 群の CREATE OR REPLACE・live 全文起点・件数次第で 0087/0088 分割）
- app（Fable 5）: lib/billing 移植・routes・/billing UI・banner・billingGate 併設
- 段47: (1) 述語真理値表（5 status×trial 期限×行なし） (2) ゲート対象/除外の集合固定
  ＝prosrc 機械検証（zero-arg を service が呼ばない・対象 RPC が billing_writable_of を呼ぶ）
  (3) read-only 失効の実効（locked org で対象 RPC 全拒否・SELECT/エクスポート可・
  打刻/payroll は通る） (4) kiosk 腕 locked 拒否 (5) trialing 期限境界 (6) 玲奈 golden・
  verify:f0 全緑（既存 2550 不変が既定）

## 9. 未決・順序

1. Supabase 復旧 → 残置スクリプトで live 突合（orgs/stores/RPC 現物が backup と一致）
   ＋ゲートリストの全数照合を pg_proc 実列挙で再実行（未知関数の取りこぼし防止）
2. ~~ゲート対象の確定リスト~~ → **済み（v1.1 §4.5 固定・2026-08-17・対象87/除外82/保留0）**
3. mig0087 起草 → CC 照合 → 手貼り → 段47 → app 実装（Fable 5）
4. Stripe 本番物件（Product/Price 2本）は BANZEN Track B 後・dev は sk_test 先行
