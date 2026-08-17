# NOX 課金設計 v1（2026-08-17 起草）

正本規約: 本書ロック後は本書＋repo/live が正。BANZEN billing は型の供給元（対応表 §7）であり
挙動の正本ではない。裁定 1–9 確定済み（推奨採用・相談役チャット 08-17）。

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

- 対象（入口系・確定リストは CC が rpc_inventory から起案→相談役承認で本書 v1.1 に固定）:
  レジ系 check_open/check_add_line/check_shimei_add/check_dohan_add/check_pay 系/
  approval 系・シフト系書込・マスタ書込系（products/categories/pricing/cast_ranks/
  comp_plans/cast_plan/norma/deduction 系）・顧客/告知系書込
- 除外（B7 回避型(1)）: service/内部専用 20本（payroll_finalize/mark_paid/reopen・
  audit_log_write・check_recalc/group_due・stock トリガ関数・get_cast_mynumber 等）＋
  pricing_resolve_core などの内部関数・**打刻系**（BANZEN 前例＝出退勤の事実記録は
  課金で止めない）・payroll 系一式（給与は過去労働の清算＝止めると労務事故）
- kiosk 腕を持つ 18本: ゲートは billing_writable_of(v_org) で挿入（kiosk でも v_org は
  0057(2) で確定済み＝罠なし）
- route 側: billingGate（BANZEN gate.ts 型・user client で auth_org_billing_writable）を
  書込 API に一次ゲートとして併設（二重化・集合一致を verify で固定）

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
2. ゲート対象の確定リスト（CC 起案 → 相談役承認 → 本書 v1.1 追記）
3. mig0087 起草 → CC 照合 → 手貼り → 段47 → app 実装（Fable 5）
4. Stripe 本番物件（Product/Price 2本）は BANZEN Track B 後・dev は sk_test 先行
