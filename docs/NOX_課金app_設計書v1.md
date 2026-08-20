# NOX 課金 app 設計書 v1（2026-08-20・相談役起草）

前提: 裁定 BIL-1〜8 済み・donor = `nox_billing_donor.md`（sha256 ea96e4b4…cd33b・19ファイル逐語）・
DB 受け皿 = mig0087 完成済み（org_billing・billing_writable_of・zero-arg ラッパ）・billing pin 94/188 機械同期。
本レーンは launch ブロッカー（裁定25・「これより後ろに落とさない」）。

## 1. 移植対照表（19ファイル）

| donor | NOX | 扱い |
|---|---|---|
| lib/billing/amount.ts | lib/billing/amount.ts | 移植（表示用金額計算。プラン分岐があれば単一化） |
| lib/billing/gate.ts | lib/billing/gate.ts | 移植（billingGate 型＝BIL-7。auth_org_billing_writable 呼びへ） |
| lib/billing/plans.ts | — | ★削除（プラン軸の本体。resolvePlan/BanzenPlan/applyPlanFlags も同罪） |
| lib/billing/quantity.ts | lib/billing/quantity.ts | 改修移植（quantity = count(stores) min 1・裁定8） |
| lib/billing/reminders.ts | lib/billing/reminders.ts | 移植（BT-4 純関数 [14,7,3,2,1,0]・BIL-8） |
| lib/billing/status.ts | lib/billing/status.ts | 改修移植（NOX 5値へ＝§2-1） |
| lib/billing/sync.ts | lib/billing/sync.ts | ★核。改修移植（§2 の4差分を全適用） |
| lib/billing/trial.ts | lib/billing/trial.ts | 移植（DB トライアル表示補助） |
| app/(app)/billing/page.tsx ほか UI 3本 | app/(manage)/billing/ | 翻訳移植（owner 限定・プラン選択 UI 削除・周期切替のみ） |
| api/billing/checkout | api/billing/checkout | 移植（Price 2本のみ・quantity=stores count） |
| api/billing/portal | api/billing/portal | 移植 |
| api/billing/change-plan | api/billing/interval | ★改名・縮退（周期切替のみ＝月/年） |
| api/billing/switch-to-card（+return） | 同 | 移植（BT→カード切替・BIL-8） |
| api/stripe/webhook | api/stripe/webhook | ★核。移植（§3 写像・§2 適応） |
| api/cron/expire-trials | api/cron/expire-trials | 移植（表示用 status 整備＝trialing 期限切れ→inactive 倒し。判定非依存） |
| api/cron/billing-reminders | api/cron/billing-reminders | 移植（BT リマインダ・BIL-8） |

## 2. NOX 適応差分（donor→NOX の4差分・sync.ts 精読より）

**2-1 status 正規化＝5値へ**: BANZEN ALLOWED は7値（incomplete/unpaid 込み）だが NOX org_billing CHECK は
5値（trialing/active/past_due/canceled/inactive）。normalizeStatus の NOX 写像を確定する:
`incomplete → inactive`／`incomplete_expired → canceled`／`unpaid → canceled`／`paused → past_due`／
`未知 → canceled`（安全側＝read-only 失効）。5値内はそのまま。

**2-2 interval の書込**: BANZEN sync は interval を書かないが NOX org_billing には interval 列（month/year）が
ある。webhook で subscription の price.recurring.interval から書く（BillingFields に interval 追加）。

**2-3 cancel_at_period_end**: donor の BillingFields にあるが NOX org_billing に列が無い。
**mig0100 で列追加**（boolean not null default false・非冪等・小）——UI 翻訳の忠実性（期間末解約予定の表示）
を優先し donor と形を揃える。

**2-4 billing_payments＝作らない（v1 スコープ外）**: donor の recordPayment/jstMonthStart（0118 系）は
移植対象外（★削除）。入金実績の正本は Stripe Dashboard。webhook の invoice.paid は org_billing の
status/current_period_end 更新のみ行う。post-launch で必要になったら別レーン。

共通の機械置換: tenant_billing→org_billing・tenant_id→org_id・createAdminClient は NOX の
service クライアント（SUPABASE_SECRET_KEY）流儀へ。

## 3. webhook 写像表（6 events・BIL-2/BIL-3＝service_role 直 upsert）

| event | org_billing への写像 |
|---|---|
| checkout.session.completed | customer/subscription id 確定→subscription 取得→upsert 全列（§2-1/2-2 適用） |
| customer.subscription.created/updated | 同上（status/interval/current_period_end/quantity/cancel_at_period_end/collection_method・trial_ends_at=null 固定＝DB トライアル終了） |
| customer.subscription.deleted | status='canceled' へ upsert |
| invoice.paid | 該当 org 解決→subscription 再取得→upsert（past_due からの復帰含む） |
| invoice.payment_failed | status は subscription.updated 側に追随（BANZEN 同型＝failed 単独で倒さない） |

org 解決: stripe_customer_id ローカル解決→無ければ customer.metadata（checkout 時に org_id を metadata へ
刻む＝checkout route 側で保証）。署名検証＝STRIPE_WEBHOOK_SECRET・非 HANDLED は 200 素通し・
処理失敗は 500（Stripe 再送・upsert 冪等＝PK org_id）。

## 4. cron（BIL-5）

vercel.json 新設: `/api/cron/expire-trials`＝`0 18 * * *`（JST 3:00）・`/api/cron/billing-reminders`＝
`0 20 * * *`（JST 5:00）。CRON_SECRET ヘッダ検証は BANZEN 同型。expire-trials は表示用 status のみ
（writable 判定は述語一本＝非依存）。

## 5. billingGate（BIL-7）＋文言統一

- gate.ts: user client で auth_org_billing_writable() → false なら 402 系エラー。適用対象＝
  **service_role client を使う書込 route**（現状 app/api の該当系統を実装時に列挙・段57 で
  「適用列挙 = service 書込 route 列挙」の静的 assert）
- 'billing locked' の和訳を共通定数 `BILLING_LOCKED_MSG` へ——既存7箇所（register 3・kiosk 1・
  receipts/analytics/shift 3）を置換・新規は定数参照のみ

## 6. UI（BIL-6）

- /billing（owner 限定）: 現契約表示（status/周期/数量/期末/期間末解約予定）・checkout（未契約時）・
  portal・周期切替・BT⇄カード切替。プラン選択 UI は出さない
- billing-banner: app-shell 自動描画。文言「ご利用プランが失効しています。閲覧・出力は可能ですが、
  更新はできません。」出現条件＝org_billing.status ∈ (canceled, inactive) or（trialing かつ期限切れ）
- nav は隠さない（押せるが弾かれる＋banner 告知）

## 7. env・Stripe 物件

新設4本: STRIPE_SECRET_KEY／STRIPE_WEBHOOK_SECRET／STRIPE_PRICE_NOX_MONTHLY／STRIPE_PRICE_NOX_YEARLY
（＋CRON_SECRET）。★Agoora 宿題: テスト mode で Product 1本＋Price 2本（月/年・quantity 課金）を作成し
price id 2本を .env.local へ。lookup_key は `nox_monthly`/`nox_yearly`（resolvePlan は削除するため参照しないが
命名整列）。webhook はローカル検証時 stripe CLI listen・dev デプロイ時に endpoint 登録。

## 8. mig0100（小・本レーン唯一の DB 変更）

org_billing.cancel_at_period_end boolean not null default false（§2-3）。非冪等・自己検証版で発行。
RPC 変更なし＝billing/grants pin 不変。

## 9. 段57 計画（verify:nox-billing-app・新スイート）

- normalizeStatus の NOX 5値写像（7入力→5出力の全対応表・未知→canceled）
- webhook ハンドラ純関数部の単体（署名検証は Stripe SDK モック・6 events→upsert 呼びの写像・
  非 HANDLED 素通し・org 解決 2経路）——**Stripe 実呼びなし**（donor の verify 流儀踏襲）
- quantity = count(stores) min 1（0店 org 番兵）
- reminders 純関数 [14,7,3,2,1,0]（BANZEN golden があれば数値ごと流用）
- billingGate: writable false org で 402・true で素通し（実 org fixture）
- gate 集合一致の静的 assert（§5）
- banner 出現条件の純関数化＋単体
- 既存 51本（billing 段47）不変・golden 全不変

## 10. 実装順序

①mig0100 手貼り → ②lib/billing 8本（★削除2＋改修3＋素直3）→ ③webhook＋sync 結線 → ④cron 2本＋
vercel.json → ⑤gate＋文言定数化 → ⑥/billing UI＋banner → ⑦段57 → ⑧実機（Stripe テスト checkout 一巡＝
Agoora の test カード操作込み）→ 目視 → push。①〜⑦は Stripe 物件なしで進む（env は checkout 実呼びまで不要）。
