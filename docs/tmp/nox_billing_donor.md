# NOX 課金 app レーン — BANZEN donor 逐語採取（BIL-1）

採取日: 2026-08-20 / 採取元: `C:\Users\abet\Dropbox\cloude\makanai-shift`（読み取りのみ）
★本ファイルは**参照専用の採取物**。NOX への直接コピーはせず、設計書起草→移植の底本として使う。
★BANZEN の DB / .env / .git には接触していない（env は**キー名のみ**を NOX 側 docs 記述と突合して列挙）。

## 索引

### (1) lib/billing の実ファイル（★実測 8本＝NOX 設計書 v1.2 §7 の「7本」と不一致）

| # | ファイル | 行数 | bytes | NOX での扱い |
|---|---|---|---|---|
| 1 | `amount.ts` | 54 | 3016 | （未言及＝移植可否を裁定） |
| 2 | `gate.ts` | 21 | 1525 | ★NOX billingGate の型（設計 v1.2 §4 route 側・唯一 docs に名指しされた2本目） |
| 3 | `plans.ts` | 40 | 1713 | ★★プラン軸の本体＝NOX では大半が消える（単一プラン×周期のみ） |
| 4 | `quantity.ts` | 38 | 1627 | ★NOX では stores count へ置換（設計 v1.2 §7・docs 名指し1本目） |
| 5 | `reminders.ts` | 24 | 1508 | BT-4 純関数 [14,7,3,2,1,0]＝NOX は lib ごと移植（設計 v1.2 §5） |
| 6 | `status.ts` | 10 | 627 | （未言及＝移植可否を裁定） |
| 7 | `sync.ts` | 123 | 6412 | ★org_billing 書込の本体＝NOX に現状ゼロの経路（webhook から呼ぶ） |
| 8 | `trial.ts` | 13 | 767 | （未言及＝移植可否を裁定） |

★**「7本」との差**: 実測は 8本。docs で名指しされているのは `quantity.ts`（stores count へ）と
`gate.ts`（route 側 billingGate の型）の2本のみ。残り6本のうち `plans.ts` はプラン軸の本体で、
NOX の「単一プラン×周期のみ」裁定により**大半が消える**＝実質移植は7本、という読みが自然だが
**どれを7本と数えたかは docs に無い**＝起草時に確定が要る（申告事項）。

### (2) webhook の event 集合（`app/api/stripe/webhook/route.ts` の逐語）

```ts
const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);
```

分岐の逐語（event.type を見ている全行）:

```ts
L36: if (!HANDLED.has(event.type)) return NextResponse.json({ received: true });
L42: if (event.type.startsWith("customer.subscription")) subscriptionId = obj.id as string;
L86: if (event.type === "invoice.paid") {
L115: if (event.type === "invoice.paid") {
L131: } else if (event.type === "checkout.session.completed" || event.type.startsWith("customer.subscription")) {
```

### (3) cron のパス・頻度・処理（BANZEN `vercel.json` の billing 関連）

| path | schedule (UTC) | JST 換算 | 課金関連 |
|---|---|---|---|
| `/api/cron/expire-trials` | `0 18 * * *` | 3:00 | ★課金 |
| `/api/cron/submit-expired-drafts` | `0 16 * * *` | 1:00 | （他レーン） |
| `/api/cron/apply-staff-transfers` | `0 17 * * *` | 2:00 | （他レーン） |
| `/api/cron/google-sync` | `0 19 * * *` | 4:00 | （他レーン） |
| `/api/cron/billing-reminders` | `0 20 * * *` | 5:00 | ★課金 |
| `/api/cron/unclosed-punches` | `0 21 * * *` | 6:00 | （他レーン） |

★**NOX には vercel.json 自体が無い**（cron の器ごと新設）。課金で要るのは上記2本のうち
`expire-trials` 相当（NOX は「表示用 status 整備＝判定非依存」）と、BT を採るなら `billing-reminders`。

### (4) env キー名（BANZEN 実測・値は一切採取していない）

| BANZEN | NOX 設計 v1.2 §6 の新設予定 | 備考 |
|---|---|---|
| `STRIPE_SECRET_KEY` | `STRIPE_SECRET_KEY` | 同名 |
| `STRIPE_WEBHOOK_SECRET` | `STRIPE_WEBHOOK_SECRET` | 同名 |
| `STRIPE_PRICE_SHIFT_MONTHLY` / `STRIPE_PRICE_SHIFT_YEARLY` | `STRIPE_PRICE_NOX_MONTHLY` / `STRIPE_PRICE_NOX_YEARLY` | ★製品名部分を NOX へ |
| `STRIPE_PRICE_POS_MONTHLY` / `STRIPE_PRICE_POS_YEARLY` | **不要** | ★★機能軸プラン（POS）＝NOX は単一プランのため消える |
| `STRIPE_PRICE_ID` | **不要** | 旧単一 Price（BANZEN の移行残渣と推定） |

---

## A. lib/billing（8本・逐語）

### `lib/billing/amount.ts`

- 行数: 54 / bytes: 3016

```ts
// 契約金額（税込・per_unit × 数量）の算出/整形。Stripe Price を真実とする（BT-6・運営者コンソール）。
//  Stripe の unit_amount は tax_behavior='inclusive'（税込）・per_unit（quantity=有効店舗数）。
//  合計 = unit_amount × quantity。表示は「合計/月（単価 × N店舗）」。純関数（Stripe SDK 非依存＝テスト可能）。
//  ※ hq billing-view.tsx の金額はハードコード定数のまま（別スコープ・現状値一致）。将来 Stripe 直取りへ一本化する
//    別タスクの申し送りあり（ドリフトリスク）。BT-6 では運営者コンソールのみ Stripe を真実にする。

export type ContractAmount = {
  total: number; // unit_amount × quantity（円・税込）
  unitAmount: number; // 1店舗あたり（円・税込）
  quantity: number;
  interval: "month" | "year";
};

// sub 無し（契約前）／取得失敗・算出不能（degrade）の表示ラベル（単一ソース）。
export const CONTRACT_AMOUNT_NONE = "—（契約前）";
export const CONTRACT_AMOUNT_UNKNOWN = "—";

// Stripe subscription item から契約金額を算出。unit_amount / quantity(整数≥1) / interval(month|year) が
// 揃わなければ null（＝呼び出し側は degrade 表示）。SDK 型に依存しない構造型で受ける（純関数・テスト容易）。
export function contractAmountFromItem(
  item:
    | {
        quantity?: number | null;
        price?: { unit_amount?: number | null; recurring?: { interval?: string | null } | null } | null;
      }
    | null
    | undefined,
): ContractAmount | null {
  const unitAmount = item?.price?.unit_amount;
  const quantity = item?.quantity;
  const interval = item?.price?.recurring?.interval;
  if (typeof unitAmount !== "number" || !Number.isFinite(unitAmount) || unitAmount < 0) return null;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) return null;
  if (interval !== "month" && interval !== "year") return null;
  return { total: unitAmount * quantity, unitAmount, quantity, interval };
}

const yen = (n: number) => "¥" + n.toLocaleString("ja-JP");

// 例: "¥46,800/月（¥7,800 × 6店舗）"。unit_amount は税込（tax_behavior=inclusive）＝そのまま税込表示。
export function formatContractAmount(a: ContractAmount): string {
  const per = a.interval === "month" ? "月" : "年";
  return `${yen(a.total)}/${per}（${yen(a.unitAmount)} × ${a.quantity}店舗）`;
}

// 表示ラベルの単一判定（純関数）。
//  - sub 無し（契約前）→ CONTRACT_AMOUNT_NONE
//  - sub 有り & 算出可 → 合計/内訳
//  - sub 有り & 算出不能（retrieve 失敗 or unit_amount 欠落）→ CONTRACT_AMOUNT_UNKNOWN（degrade "—"）
export function contractAmountLabel(hasSub: boolean, amount: ContractAmount | null): string {
  if (!hasSub) return CONTRACT_AMOUNT_NONE;
  return amount ? formatContractAmount(amount) : CONTRACT_AMOUNT_UNKNOWN;
}
```

### `lib/billing/gate.ts`

- 行数: 21 / bytes: 1525
- ★NOX billingGate の型（設計 v1.2 §4 route 側・唯一 docs に名指しされた2本目）

```ts
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// 管理系書込の billing ゲート（案1・APIルート用）。
// RLS と同じ SQL 関数 public.auth_billing_writable() を RPC で呼ぶ＝writable 集合が完全一致（ドリフト防止）。
// writable なら null（続行）、そうでなければ 402 を返す。
// ※ 打刻(/api/punch)・受諾(/api/invite/accept)・LINE(/api/line/*)・請求(/api/billing/*)・webhook には噛ませない。
export async function billingGate(supabase: SupabaseClient): Promise<NextResponse | null> {
  const { data, error } = await supabase.rpc("auth_billing_writable");
  if (error) return NextResponse.json({ error: "ご契約状態を確認できませんでした" }, { status: 500 });
  if (data === true) return null;
  // ★「請求設定をご確認ください」は使わない＝/billing は hq 専用で、manager には
  //   「本部にご確認ください」のスタブしか出ない（billing/page.tsx:32-41）。押せない場所へ誘導しない。
  //   このゲートは /api/staff・/api/stores・/api/shift/auto-assign・/api/wage/confirm 等
  //   manager が普通に踏む経路に噛んでいる＝client 直 RPC 側（menu/seats/wage）と同一文言にする。
  return NextResponse.json(
    { error: "現在この操作はご利用いただけません。詳しくは管理者にご確認ください。", code: "billing_read_only" },
    { status: 402 },
  );
}
```

### `lib/billing/plans.ts`

- 行数: 40 / bytes: 1713
- ★★プラン軸の本体＝NOX では大半が消える（単一プラン×周期のみ）

```ts
// 料金プランの単一ソース（⑯）。「プランと契約」（billing-view）と LP（app/page.tsx）が同一定数を import する。
//  価格・機能リストの変更はこのファイルのみで行う（Stripe 側 Price（env 4本）との一致は運用で担保）。
//  純データ＝client/server どちらからも import 可能（"use client" 不要・副作用なし）。
import type { BanzenPlan } from "@/lib/billing/sync";

export type Cycle = "monthly" | "yearly";

export const PLAN_LABEL: Record<string, string> = { shift: "シフト", pos: "POS" };

export type PlanDef = {
  key: BanzenPlan;
  name: string;
  forWho: string;
  monthly: number; // 月払い（円・税込・1店舗あたり）
  yearly: number; // 年払い（円・税込・1店舗あたり＝2ヶ月分お得）
  reco?: boolean;
  feats: string[];
};

export const PLANS: PlanDef[] = [
  {
    key: "shift",
    name: "シフト",
    forWho: "シフト管理から始めたいお店に",
    monthly: 3800,
    yearly: 38000,
    feats: ["シフト希望の収集と自動下書き", "スマホ・キオスクからの打刻", "深夜割増つき給与見込み", "スタッフ人数 無制限"],
  },
  {
    key: "pos",
    name: "POS",
    forWho: "注文・会計までまとめて1つに",
    monthly: 7800,
    yearly: 78000,
    reco: true,
    // ★「客席セルフ注文」の実体は QR注文（お客様のスマホ）＝キオスクは店の共用端末なので取り違えない。
    feats: ["注文・会計（テーブル/持ち帰り）", "QR注文（お客様のスマホからセルフ注文）", "レシートプリンタ連携", "売上分析・税率別集計"],
  },
];
```

### `lib/billing/quantity.ts`

- 行数: 38 / bytes: 1627
- ★NOX では stores count へ置換（設計 v1.2 §7・docs 名指し1本目）

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { isWritableStatus } from "@/lib/billing/status";

// 有効店舗数 → Stripe subscription quantity を同期（堅牢化③）。
//  - 数量はサーバが有効店舗数から算出（min1・クライアント不信任）。
//  - 未開始/canceled/unpaid はスキップ。失敗してもローカル status は保持（webhook で整合）。
//  - 日割りは Stripe 既定（create_prorations）。
export async function syncStripeQuantity(tenantId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("tenant_billing")
    .select("status, stripe_subscription_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!billing?.stripe_subscription_id || !isWritableStatus(billing.status)) return;

  const { count } = await admin
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  const quantity = Math.max(1, count ?? 0);

  try {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(billing.stripe_subscription_id);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) return;
    await stripe.subscriptions.update(billing.stripe_subscription_id, {
      items: [{ id: itemId, quantity }],
      proration_behavior: "create_prorations", // Stripe既定の日割り
    });
  } catch {
    // 失敗は握りつぶす：ローカル status は保持し、次回トグル/webhook で整合（堅牢化③）。
  }
}
```

### `lib/billing/reminders.ts`

- 行数: 24 / bytes: 1508
- BT-4 純関数 [14,7,3,2,1,0]＝NOX は lib ごと移植（設計 v1.2 §5）

```ts
// BTレーン（銀行振込・send_invoice）リマインドの残日数/閾値ロジック（純関数・Stripe SDK 非依存＝テスト可能）。
//  billing-reminders cron（BT-4）から抽出。日次実行 × 残日数が閾値に一致した日だけ送る＝1テナント1閾値で
//  1日1通に自然収束（送信履歴テーブル不要）。JST 暦日ベース（時刻を切り捨て「あと何日」の直感と一致）。

// 送信する残日数の閾値（発行〜期日 days_until_due:14 前提）。0=当日・負値=期日超過（対象外＝停止は BT-5 に委ねる）。
export const REMINDER_DAYS = [14, 7, 3, 2, 1, 0];

// JST 暦日 "YYYY-MM-DD"
const jstYmd = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// 支払期日までの残日数（JST 暦日ベース）。負値＝期日超過。
export function daysUntilDueJst(dueEpochSec: number, now: Date): number {
  const due = Date.parse(`${jstYmd(new Date(dueEpochSec * 1000))}T00:00:00Z`);
  const today = Date.parse(`${jstYmd(now)}T00:00:00Z`);
  return Math.round((due - today) / 86400000);
}

// 送信対象の閾値（一致すればその残日数・非該当は null）。route の `REMINDER_DAYS.includes(days)` と同値。
export function reminderDayFor(dueEpochSec: number, now: Date): number | null {
  const days = daysUntilDueJst(dueEpochSec, now);
  return REMINDER_DAYS.includes(days) ? days : null;
}
```

### `lib/billing/status.ts`

- 行数: 10 / bytes: 627

```ts
// 書込可（writable）の status 集合の単一定義。
// ⚠ SQL の public.auth_billing_writable()（0014）と必ず一致させること（ドリフト防止）。
//   - RLS と API ゲートは SQL 関数 auth_billing_writable() を直接/RPC で使う（同一集合）。
//   - この JS 定数は「ユーザー文脈の無い admin 処理（数量同期）」専用。
export const WRITABLE_STATUSES = ["trialing", "active", "past_due"] as const;

export function isWritableStatus(status: string | null | undefined): boolean {
  return !!status && (WRITABLE_STATUSES as readonly string[]).includes(status);
}
```

### `lib/billing/sync.ts`

- 行数: 123 / bytes: 6412
- ★org_billing 書込の本体＝NOX に現状ゼロの経路（webhook から呼ぶ）

```ts
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe の subscription.status を tenant_billing の許容値（7値）へ正規化。
const ALLOWED = ["inactive", "incomplete", "trialing", "active", "past_due", "canceled", "unpaid"];
export function normalizeStatus(s: string): string {
  if (ALLOWED.includes(s)) return s;
  if (s === "incomplete_expired") return "canceled";
  if (s === "paused") return "past_due";
  return "canceled"; // 未知は安全側（読取専用）
}

export type BillingFields = {
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  quantity: number;
  trial_ends_at: null; // Stripe 由来の upsert は常に null＝DBトライアル（0070）の残置期限をクリア
  collection_method: "charge_automatically" | "send_invoice"; // BT-3：レーン種別（0104）を Stripe に追随
};

// tenant_billing を upsert（webhook 専用・最新勝ち）。PK=tenant_id なので冪等。
// trial_ends_at=null 固定：Stripe 契約が立った時点で DBトライアルの期限管理は Stripe 側へ移る
// （「Stripe trialing なのに writable=false」の構造的防止・expire_trials(0071) の対象からも自然に外れる）。
export async function upsertBilling(tenantId: string, f: BillingFields): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("tenant_billing").upsert({
    tenant_id: tenantId,
    stripe_customer_id: f.stripe_customer_id,
    stripe_subscription_id: f.stripe_subscription_id,
    status: f.status,
    current_period_end: f.current_period_end,
    cancel_at_period_end: f.cancel_at_period_end,
    quantity: f.quantity,
    trial_ends_at: f.trial_ends_at,
    collection_method: f.collection_method,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`tenant_billing upsert 失敗: ${error.message}`);
}

// ── 入金実績（billing_payments・0118）：webhook invoice.paid から記録 ──

// paid_at（timestamptz）から入金確定月を JST の月初 date 文字列 "YYYY-MM-01" へ導出（純関数・DB非依存）。
//   billing_payments.settled_month の check（月初 date）を満たす。
//   ★JST 固定：月末深夜の UTC→JST 日付繰り上がりで月がずれないよう Asia/Tokyo で年月を取る。
export function jstMonthStart(paidAt: Date | string): string {
  const d = typeof paidAt === "string" ? new Date(paidAt) : paidAt;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}-01`;
}

export type PaymentRecord = {
  stripeInvoiceId: string; // Stripe invoice id（in_...）＝冪等キー（billing_payments.stripe_invoice_id unique）
  amount: number; // 入金額・円整数（invoice.amount_paid・JPY ゼロデシマル）
  paidAt: Date; // 入金確定時刻（status_transitions.paid_at 由来）
};

// 入金実績を billing_payments に記録（webhook 専用・service key）。
//   ★冪等：stripe_invoice_id が unique＝Stripe 再送時は on conflict do nothing で無視（重複行を作らない）。
//   settled_month は paid_at から JST 月初へ導出（DB の check 制約＝月初 date を満たす）。
//   失敗は throw（upsertBilling と同流儀）＝呼び出し元 webhook は 500 で Stripe 再送に委ねる（冪等ゆえ再送安全）。
export async function recordPayment(tenantId: string, p: PaymentRecord): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("billing_payments").upsert(
    {
      tenant_id: tenantId,
      stripe_invoice_id: p.stripeInvoiceId,
      amount: p.amount,
      paid_at: p.paidAt.toISOString(),
      settled_month: jstMonthStart(p.paidAt),
    },
    { onConflict: "stripe_invoice_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`billing_payments 記録 失敗: ${error.message}`);
}

// ── 3プラン課金（plan-select）：price → プラン判定＋機能フラグ上書き ──

export type BanzenPlan = "shift" | "pos";

// price → プラン判定。lookup_key 第一（banzen_shift_monthly 等）・metadata.banzen_plan 予備。
// どちらでも判定できない price（旧 graduated 契約等）は null＝grandfather（フラグを触らない）。
export function resolvePlan(price: { lookup_key?: string | null; metadata?: Record<string, string> } | null | undefined): BanzenPlan | null {
  const lk = price?.lookup_key ?? "";
  if (lk === "banzen_shift_monthly" || lk === "banzen_shift_yearly") return "shift";
  if (lk === "banzen_pos_monthly" || lk === "banzen_pos_yearly") return "pos";
  const md = price?.metadata?.banzen_plan;
  if (md === "shift" || md === "pos") return md;
  return null;
}

// テナント機能フラグ（0041）をプラン契約に合わせて上書き（webhook 専用・service key）。
//   alive=契約が生きている（status∈trialing/active/past_due）→ shift=pos:false／pos=pos:true。multi は常に false
//   （マルチ店舗プランはお問い合わせ＝手動運用・セルフサーブの写像対象外）。
//   alive=false（canceled/unpaid/incomplete/inactive）→ 両方 false（機能停止）。
export async function applyPlanFlags(tenantId: string, plan: BanzenPlan, alive: boolean): Promise<void> {
  const admin = createAdminClient();
  const flags = alive
    ? { pos_enabled: plan === "pos", multi_store_enabled: false }
    : { pos_enabled: false, multi_store_enabled: false };
  const { error } = await admin.from("tenants").update(flags).eq("id", tenantId);
  if (error) throw new Error(`tenants フラグ更新 失敗: ${error.message}`);
}

// stripe_customer_id からテナントをローカル解決（無ければ null → webhook が customer.metadata で補完）。
export async function localTenantByCustomer(customerId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tenant_billing")
    .select("tenant_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return (data?.tenant_id as string) ?? null;
}
```

### `lib/billing/trial.ts`

- 行数: 13 / bytes: 767

```ts
// DBトライアル（0070・tenant_billing.trial_ends_at）の Stripe Checkout への持ち越し（純関数）。
// Stripe 制約：Checkout の subscription_data.trial_end は「現在から48時間以上先」が必須
// → 残りが48時間未満のときは持ち越さない（＝トライアルなし・即課金）。過去/null も同様。
export const MIN_TRIAL_CARRYOVER_MS = 48 * 60 * 60 * 1000;

export function computeTrialEnd(trialEndsAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!trialEndsAt) return null;
  const t = new Date(trialEndsAt).getTime();
  if (!Number.isFinite(t)) return null;
  if (t - now.getTime() < MIN_TRIAL_CARRYOVER_MS) return null;
  return Math.floor(t / 1000); // Stripe は epoch 秒
}
```

## B. UI（/billing ページ・banner・逐語）

### `app/(app)/billing/page.tsx`

- 行数: 88 / bytes: 3799

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { resolvePlan, type BanzenPlan } from "@/lib/billing/sync";
import { BillingView } from "./billing-view";

export const dynamic = "force-dynamic";

// プランと契約（plan-select-mock 準拠・hq 専用）。
// 現況＝tenant_billing（DBトライアル trial_ends_at／Stripe 契約 current_period_end）。
// 現プラン名＝Stripe subscription の price を server で解決（lookup_key/metadata・失敗や旧 graduated は null）。
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ switch?: string }>;
}) {
  // 銀行振込→カード切替（switch-to-card）の完了/中断/失敗を UI 通知へ（return route が付与）。
  const sp = await searchParams;
  const switchResult = sp.switch === "done" || sp.switch === "cancel" || sp.switch === "error" ? sp.switch : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  // 非hq には金額/請求の詳細を出さない（汎用文言）。
  if (!profile || profile.role !== "hq") {
    return (
      <div className="mk-card pad" style={{ maxWidth: 560 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 18 }}>プランと契約</h1>
        <p style={{ margin: 0, color: "var(--sub)", fontSize: 13.5, lineHeight: 1.8 }}>
          ご契約・お支払いの確認は本部アカウントで行えます。ご不明な点は管理者にご確認ください。
        </p>
      </div>
    );
  }

  const { data: billing } = await supabase
    .from("tenant_billing")
    .select("status, current_period_end, cancel_at_period_end, quantity, stripe_customer_id, stripe_subscription_id, trial_ends_at, collection_method")
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();

  const status = billing?.status ?? "inactive";
  const alive = ["trialing", "active", "past_due"].includes(status);
  // 銀行振込（send_invoice）テナントは self-serve プラン変更の対象外（運営者代行・A案）＝カードは「お問い合わせ」表示。
  const isBankTransfer = billing?.collection_method === "send_invoice";

  // 現プラン・現周期（Stripe 契約が生きているときのみ・失敗は null＝表示は汎用「現行契約」）。
  //  周期変更（月↔年）self-serve のため現周期も引く（price.recurring.interval）。
  let currentPlan: BanzenPlan | null = null;
  let currentCycle: "monthly" | "yearly" | null = null;
  const hasLiveSub = alive && !!billing?.stripe_subscription_id;
  if (hasLiveSub) {
    try {
      const sub = await getStripe().subscriptions.retrieve(billing!.stripe_subscription_id as string);
      const price = sub.items.data[0]?.price ?? null;
      currentPlan = resolvePlan(price);
      const interval = price?.recurring?.interval;
      currentCycle = interval === "year" ? "yearly" : interval === "month" ? "monthly" : null;
    } catch {
      currentPlan = null;
    }
  }

  return (
    <BillingView
      status={status}
      quantity={billing?.quantity ?? 1}
      currentPeriodEnd={billing?.current_period_end ?? null}
      trialEndsAt={(billing?.trial_ends_at as string | null) ?? null}
      cancelAtPeriodEnd={billing?.cancel_at_period_end ?? false}
      hasCustomer={!!billing?.stripe_customer_id}
      hasLiveSub={hasLiveSub}
      currentPlan={currentPlan}
      currentCycle={currentCycle}
      isBankTransfer={isBankTransfer}
      switchResult={switchResult}
    />
  );
}
```

### `app/(app)/billing/billing-view.tsx`

- 行数: 322 / bytes: 19638
- ★プラン選択 UI を含む＝NOX は周期切替のみへ縮退

```tsx
﻿"use client";

// プランと契約（plan-select-mock (2) 準拠・番膳なし版・価格は仮）。
// 3カード＝シフト／POS（おすすめ）／マルチ店舗（お問い合わせ）。月払い/年払いトグル（年払い=2ヶ月分お得）。
// 「このプランを選ぶ」→ /api/billing/checkout に {plan, cycle} を POST → Stripe Checkout へ。
// Stripe 契約が生きている間は選択 CTA を無効化（二重サブスクリプション防止＝プラン変更のセルフサーブは将来・
// 当面はポータル/問い合わせ）。DBトライアル中（0070）は契約導線＝CTA 有効。
// マルチ店舗カードの文言は調整版＝未実装機能（メニュー・設定コピー／横断ダッシュボード）は載せない。

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CreditCard, ExternalLink, Mail, RefreshCw } from "lucide-react";
import type { BanzenPlan } from "@/lib/billing/sync";
import { PLANS, PLAN_LABEL, type Cycle } from "@/lib/billing/plans";

const yen = (n: number) => "¥" + n.toLocaleString("ja-JP");
// マルチ店舗の相談導線＝アプリ内の問い合わせ（/support）。件名をプリセットして送信の手間を減らす。
//  ★mailto を使わない：メールだと運営者側の一覧（/rexsol/support）に載らず、やりとりが追えなくなる。
const CONTACT_HREF = "/support?subject=" + encodeURIComponent("マルチ店舗について");
// 銀行振込テナントのプラン変更は self-serve 不可＝運営者代行（A案）＝お問い合わせ導線。
const CHANGE_CONTACT_MAILTO = "mailto:support@banzen.work?subject=" + encodeURIComponent("BANZEN プラン変更のお問い合わせ（銀行振込）");

const STATUS_LABEL: Record<string, { label: string; tag: string }> = {
  inactive: { label: "未契約", tag: "" },
  incomplete: { label: "お手続き中", tag: "warn" },
  trialing: { label: "トライアル中", tag: "brand" },
  active: { label: "利用中", tag: "ok" },
  past_due: { label: "お支払い確認中", tag: "warn" },
  canceled: { label: "解約済み", tag: "under" },
  unpaid: { label: "未払い", tag: "under" },
};
// PLANS / PLAN_LABEL / Cycle は lib/billing/plans.ts（価格の単一ソース＝LP と共用）から import。

export function BillingView({
  status,
  quantity,
  currentPeriodEnd,
  trialEndsAt,
  cancelAtPeriodEnd,
  hasCustomer,
  hasLiveSub,
  currentPlan,
  currentCycle,
  isBankTransfer = false,
  switchResult = null,
}: {
  status: string;
  quantity: number;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  hasLiveSub: boolean;
  currentPlan: BanzenPlan | null;
  currentCycle?: Cycle | null; // 現契約の周期（月/年）＝周期変更 self-serve の判定に使う
  isBankTransfer?: boolean; // 銀行振込テナント＝プラン変更は self-serve 不可（運営者代行・A案）だが決済方式のカード切替は可（第2部）
  switchResult?: "done" | "cancel" | "error" | null; // 銀行振込→カード切替（switch-to-card）の完了/中断/失敗（return route 由来）
}) {
  const router = useRouter();
  // 現周期があれば初期選択に合わせる（周期変更 CTA を素直に出すため）。無ければ月払い既定。
  const [cycle, setCycle] = useState<Cycle>(currentCycle ?? "monthly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const s = STATUS_LABEL[status] ?? STATUS_LABEL.inactive;
  const isDbTrial = status === "trialing" && !!trialEndsAt && !hasLiveSub;
  const deadline = isDbTrial ? trialEndsAt : currentPeriodEnd;
  const daysLeft = deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)) : null;
  const dateLabel = deadline ? new Date(deadline).toLocaleDateString("ja-JP", { month: "long", day: "numeric" }) : null;

  async function go(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok || !j?.url) throw new Error(j?.error ?? "失敗しました");
      window.location.href = j.url as string;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  // 機能軸プラン変更（シフト↔レジ・cycle 維持）。checkout（新規契約・要 url リダイレクト）と違い url を返さないため go とは分離。
  //  成功後は pos_enabled が webhook（subscription.updated → applyPlanFlags）で追随＝反映まで数秒。現プラン表示は
  //  Stripe 即時更新のため router.refresh() でサーバ再取得（page が subscription を引き直す）。
  async function changePlan(plan: BanzenPlan, cyc: Cycle) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/billing/change-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, cycle: cyc }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? "変更に失敗しました");
      setNotice("プランを変更しました。機能への反映まで数秒かかることがあります。");
      setBusy(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  // 銀行振込→カード切替（第2部・方針Y）：Checkout(mode='setup') で課金せずカードを収集→Stripe 側でカード入力→
  //  return route が collection_method を charge_automatically へ切替。go() は {ok,url} を受けてリダイレクトする
  //  既存ヘルパーをそのまま流用（checkout / portal と同型）。★逆方向（カード→振込）の導線は出さない。
  const switchToCard = () => go("/api/billing/switch-to-card", {});

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ fontSize: 11.5, color: "var(--sub)", marginBottom: 4 }}>設定 / プランと契約</div>
      <div className="mk-h1" style={{ marginBottom: 6 }}>プランと契約</div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--sub)", lineHeight: 1.7 }}>
        お店の使い方に合わせてプランを選べます。すべてのプランに14日間の無料トライアルがつきます。
      </p>

      {/* 現況バー */}
      <div className="mk-card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: ["trialing", "active"].includes(status) ? "var(--ok)" : status === "past_due" ? "var(--warn)" : "var(--short)", flexShrink: 0 }} />
        <span style={{ fontSize: 13.5 }}>
          <b>
            {isDbTrial
              ? "フリートライアル"
              : currentPlan
                ? `${PLAN_LABEL[currentPlan]}プラン`
                : hasLiveSub
                  ? "現行契約（従量）"
                  : s.label}
          </b>
          {(isDbTrial || hasLiveSub) && ` ${s.label}`}
        </span>
        {daysLeft != null && dateLabel && (
          <span style={{ fontSize: 12.5, color: "var(--sub)" }}>
            {isDbTrial || status === "trialing" ? `残り ${daysLeft} 日・${dateLabel}まで` : `次回更新 ${dateLabel}${cancelAtPeriodEnd ? "（期末解約予定）" : ""}`}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {hasCustomer && (
          <>
            <button className="mk-btn ghost sm" disabled={busy} onClick={() => go("/api/billing/portal", {})}>請求履歴</button>
            <button className="mk-btn ghost sm" disabled={busy} onClick={() => go("/api/billing/portal", {})}>支払い方法</button>
          </>
        )}
      </div>

      {status === "past_due" && (
        <div className="mk-banner warn" style={{ marginBottom: 14 }}>お支払いの確認中です。カード情報をご確認ください（ご利用は継続できます）。</div>
      )}
      {["canceled", "unpaid"].includes(status) && (
        <div className="mk-banner err" style={{ marginBottom: 14 }}>ご契約が終了しています。閲覧のみ可能です。再開するにはプランをお選びください。</div>
      )}
      {error && <div className="mk-banner err" style={{ marginBottom: 14 }}>{error}</div>}
      {notice && <div className="mk-banner ok" style={{ marginBottom: 14 }}>{notice}</div>}

      {/* 銀行振込→カード切替（第2部）の完了/中断/失敗の通知（return route からのリダイレクト時） */}
      {switchResult === "done" && (
        <div className="mk-banner ok" style={{ marginBottom: 14 }}>
          カード決済に切り替えました。次回のご請求からカードで自動引き落としされます。発行済みの請求書は従来どおりお振込ください。
        </div>
      )}
      {switchResult === "error" && (
        <div className="mk-banner err" style={{ marginBottom: 14 }}>
          カード決済への切り替えに失敗しました。お手数ですが、もう一度お試しください。解決しない場合はお問い合わせください。
        </div>
      )}
      {switchResult === "cancel" && (
        <div className="mk-banner warn" style={{ marginBottom: 14 }}>カード決済への切り替えを中止しました。</div>
      )}

      {/* 銀行振込テナント＝カード自動引き落としへの切替導線（第2部・方針Y）。逆方向は出さない。 */}
      {isBankTransfer && hasLiveSub && (
        <div className="mk-card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <CreditCard size={18} style={{ color: "var(--acc)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>カード決済に切り替える</div>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--sub)", lineHeight: 1.7 }}>
              現在は銀行振込（請求書払い）でご契約中です。カードを登録すると、次回のご請求からカードで自動引き落としになります。
              発行済みの請求書は従来どおりお振込ください（カードで勝手に引き落とされることはありません）。
            </p>
          </div>
          <button className="mk-btn primary" disabled={busy} onClick={switchToCard} style={{ flexShrink: 0 }}>
            <CreditCard size={15} /> カードを登録して切り替える
          </button>
        </div>
      )}

      {/* 月払い/年払い */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <span className="mk-seg">
          <button className={cycle === "monthly" ? "on" : ""} onClick={() => setCycle("monthly")}>月払い</button>
          <button className={cycle === "yearly" ? "on" : ""} onClick={() => setCycle("yearly")}>
            年払い <span style={{ fontSize: 10.5, color: cycle === "yearly" ? "inherit" : "var(--acc)", fontWeight: 700 }}>2ヶ月分お得</span>
          </button>
        </span>
      </div>

      {/* プランカード */}
      <div className="mk-grid" style={{ marginBottom: 14 }}>
        {PLANS.map((p) => {
          // 現契約＝プラン AND 周期が一致で「ご利用中」（周期だけ違えば変更可＝周期軸 self-serve）。
          const isCurrent = hasLiveSub && currentPlan === p.key && currentCycle === cycle;
          // live sub で別の内容（プラン or 周期）へ＝change-plan（変更）。live sub 無し＝checkout（新規契約）。
          const isChange = hasLiveSub && !isCurrent;
          // ★A案：銀行振込テナントは self-serve 変更不可＝お問い合わせ（運営者代行）。
          const bankBlocked = isChange && isBankTransfer;
          const isDowngrade = isChange && !bankBlocked && currentPlan === "pos" && p.key === "shift"; // レジ→シフト＝機能停止の確認
          const isCycleOnly = isChange && !bankBlocked && currentPlan === p.key; // 同プランで周期だけ変更
          const disabled = busy || isCurrent;
          return (
            <div key={p.key} className="mk-card pad" style={{ position: "relative", display: "flex", flexDirection: "column", ...(p.reco ? { borderColor: "var(--acc)", boxShadow: "0 0 0 1px var(--acc)" } : {}) }}>
              {p.reco && (
                <span className="mk-tag" style={{ position: "absolute", top: -10, left: 14, background: "var(--acc)", color: "var(--card)" }}>おすすめ</span>
              )}
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{p.name}</h2>
              <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2, minHeight: "1.5em" }}>{p.forWho}</div>
              <div style={{ margin: "16px 0 2px", display: "flex", alignItems: "baseline", gap: 4 }}>
                <span className="mk-num" style={{ fontSize: 15, color: "var(--sub)" }}>¥</span>
                <span className="mk-num" style={{ fontSize: 32, fontWeight: 600 }}>{(cycle === "monthly" ? p.monthly : p.yearly).toLocaleString("ja-JP")}</span>
                <span style={{ fontSize: 12, color: "var(--sub)" }}>/{cycle === "monthly" ? "月" : "年"}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--sub)", marginBottom: 12 }}>
                1店舗あたり・税込{cycle === "yearly" && `（月あたり ${yen(Math.round(p.yearly / 12))} 相当）`}
              </div>
              {bankBlocked ? (
                // 銀行振込テナント＝self-serve 変更不可（運営者代行）＝お問い合わせ。マルチ店舗カードと同流儀。
                <a className="mk-btn block" href={CHANGE_CONTACT_MAILTO} style={{ justifyContent: "center" }}>
                  <Mail size={15} /> お問い合わせ
                </a>
              ) : (
                <button
                  className={`mk-btn block ${p.reco ? "primary" : ""}`}
                  disabled={disabled}
                  onClick={() => {
                    if (isChange) {
                      if (isDowngrade && !window.confirm("レジ機能の新規利用を停止します。既存の売上・メニューのデータは引き続き閲覧・エクスポートできます。シフトプランに変更しますか？")) return;
                      changePlan(p.key, cycle);
                    } else {
                      go("/api/billing/checkout", { plan: p.key, cycle });
                    }
                  }}
                >
                  {isChange ? <RefreshCw size={15} /> : <CreditCard size={15} />}{" "}
                  {isCurrent
                    ? "ご利用中のプラン"
                    : isCycleOnly
                      ? cycle === "yearly" ? "年払いに変更" : "月払いに変更"
                      : isChange
                        ? "このプランに変更"
                        : "このプランを選ぶ"}
                </button>
              )}
              <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {p.feats.map((f) => (
                  <li key={f} style={{ fontSize: 12.5, color: "var(--sub)", display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ color: "var(--acc)", fontWeight: 700, flexShrink: 0 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {/* マルチ店舗（お問い合わせ・文言調整版＝未実装機能は載せない） */}
        <div className="mk-card pad" style={{ display: "flex", flexDirection: "column" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>マルチ店舗</h2>
          <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2, minHeight: "1.5em" }}>2店舗以上を1つの本部で</div>
          {/* ★価格は出さない。実装は「選択中プランの単価 × 有効店舗数」の線形課金で、
              2店舗目だけ別単価という仕組みは無い（quantity=有効店舗数・price は per_unit）。
              独自の金額をここに直書きすると、請求額とも LP／特商法の記載とも食い違う。 */}
          <div style={{ fontSize: 12.5, color: "var(--sub)", margin: "16px 0 12px", lineHeight: 1.7 }}>
            店舗を追加すると自動で加算されます（1店舗あたりの料金は選択中のプラン単価）。
          </div>
          <Link className="mk-btn block" href={CONTACT_HREF} style={{ justifyContent: "center" }}>
            <Mail size={15} /> お問い合わせ
          </Link>
          <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {["店舗の追加・本部（HQ）アカウント", "全店舗を1つのアカウントで管理"].map((f) => (
              <li key={f} style={{ fontSize: 12.5, color: "var(--sub)", display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ color: "var(--acc)", fontWeight: 700, flexShrink: 0 }}>✓</span>{f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--sub)", textAlign: "center" }}>
        すべてのプランに <b style={{ color: "var(--ink)" }}>14日間の無料トライアル</b> がつきます。期間中の解約に費用はかかりません。
        現在の対象店舗数：<b className="mk-num">{quantity}</b>（数量は有効店舗数に自動連動）
      </p>

      {/* notes */}
      <div className="mk-grid">
        {[
          ["お支払い方法", "クレジットカード（Visa / Master / JCB / Amex）に対応。年払いは銀行振込もご利用いただけます。"],
          ["プラン変更", "アップグレードは即時反映され、差額は日割りで請求されます。ダウングレード後もデータはそのまま残り、閲覧とエクスポートができます。"],
          ["解約について", "いつでも解約できます。解約後も当月末まで利用でき、データのエクスポートは解約後30日間可能です。"],
        ].map(([h, body]) => (
          <div key={h} className="mk-card pad">
            <h3 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700 }}>{h}</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--sub)", lineHeight: 1.8 }}>{body}</p>
          </div>
        ))}
      </div>

      {hasCustomer && (
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <button className="mk-btn ghost sm" disabled={busy} onClick={() => go("/api/billing/portal", {})}>
            <ExternalLink size={14} /> お支払い情報の管理（カード・解約・請求書）
          </button>
        </div>
      )}
    </div>
  );
}
```

### `app/(app)/_components/billing-banner.tsx`

- 行数: 90 / bytes: 2912
- read-only 失効の告知動線（NOX は app-shell 自動描画）

```tsx
"use client";

import Link from "next/link";

// 非hq に出す汎用文言（支払い詳細＝past_due/unpaid 等の語は出さない＝財務情報の最小開示）。
const GENERIC = "一部の機能を制限しています。詳しくは本部にご確認ください。";

// tenant_billing.status × ロールで出し分ける読取専用バナー（UIのみ）。
// active＝非表示。詳細（残り日数・期末解約）は hq のみ。/billing 導線も hq のみ。
export function BillingBanner({
  role,
  status,
  currentPeriodEnd,
  cancelAtPeriodEnd,
}: {
  role: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}) {
  const isHq = role === "hq";

  if (status === "active") return null;

  if (status === "trialing") {
    if (!isHq || !currentPeriodEnd) return null; // 非hq・日付不明は省略（控えめ）
    const days = Math.max(0, Math.ceil((new Date(currentPeriodEnd).getTime() - Date.now()) / 86400000));
    return (
      <Banner kind="info">
        <span>トライアル中です（残り{days}日{cancelAtPeriodEnd ? "・期末解約予定" : ""}）。</span>
        <BillingLink>お支払い設定</BillingLink>
      </Banner>
    );
  }

  if (status === "past_due") {
    return isHq ? (
      <Banner kind="warn">
        <span>お支払いに失敗しています。お支払い方法を更新してください（ご利用は継続できます）。</span>
        <BillingLink>更新する</BillingLink>
      </Banner>
    ) : (
      <Banner kind="warn">
        <span>一部の機能が制限される可能性があります。本部にご確認ください。</span>
      </Banner>
    );
  }

  if (status === "canceled" || status === "unpaid") {
    return isHq ? (
      <Banner kind="err">
        <span>読み取り専用：サブスクリプションが無効です。お支払いを更新すると再開できます。</span>
        <BillingLink>お支払いを更新</BillingLink>
      </Banner>
    ) : (
      <Banner kind="err">
        <span>{GENERIC}</span>
      </Banner>
    );
  }

  // inactive / incomplete → 契約導線
  return isHq ? (
    <Banner kind="info">
      <span>ご契約を開始すると全機能をご利用いただけます（14日間無料）。</span>
      <BillingLink>契約を開始</BillingLink>
    </Banner>
  ) : (
    <Banner kind="info">
      <span>{GENERIC}</span>
    </Banner>
  );
}

function Banner({ kind, children }: { kind: "info" | "warn" | "err"; children: React.ReactNode }) {
  return (
    <div className={`mk-banner ${kind}`} role="status" style={{ marginBottom: 14, justifyContent: "space-between" }}>
      {children}
    </div>
  );
}

function BillingLink({ children }: { children: React.ReactNode }) {
  return (
    <Link href="/billing" className="mk-btn ghost sm" style={{ flexShrink: 0 }}>
      {children}
    </Link>
  );
}
```

## C. API routes（checkout / portal / change-plan / switch-to-card / webhook / cron・逐語）

### `app/api/billing/checkout/route.ts`

- 行数: 98 / bytes: 4211

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { computeTrialEnd } from "@/lib/billing/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 3プラン課金：body {plan, cycle} → env の4 Price から解決（不正値は 400）。
const PRICE_ENV: Record<string, string | undefined> = {
  "shift:monthly": process.env.STRIPE_PRICE_SHIFT_MONTHLY,
  "shift:yearly": process.env.STRIPE_PRICE_SHIFT_YEARLY,
  "pos:monthly": process.env.STRIPE_PRICE_POS_MONTHLY,
  "pos:yearly": process.env.STRIPE_PRICE_POS_YEARLY,
};

// Checkout(mode=subscription) セッション作成（hq専用）。
// 数量＝有効店舗数（サーバ算出・min1・クライアント不信任）。customer は作成時に即 tenant_billing へ書込（堅牢化①）。
// トライアル：DBトライアル（0070）の残りを subscription_data.trial_end で持ち越し
//   （Stripe 制約＝48時間以上先のみ・それ未満/過去/null はトライアルなし＝即課金）。固定 trial_period_days は廃止。
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id, email")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "hq")
    return NextResponse.json({ error: "請求の操作は本部のみ可能です" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { plan?: unknown; cycle?: unknown };
  const plan = body.plan;
  const cycle = body.cycle;
  if ((plan !== "shift" && plan !== "pos") || (cycle !== "monthly" && cycle !== "yearly"))
    return NextResponse.json({ error: "プランの指定が不正です" }, { status: 400 });
  const priceId = PRICE_ENV[`${plan}:${cycle}`];
  if (!priceId) return NextResponse.json({ error: `Price が未設定です（${plan}/${cycle}）` }, { status: 500 });

  const admin = createAdminClient();
  const tenantId = profile.tenant_id as string;

  // 有効店舗数（min1）をサーバ算出。
  const { count } = await admin
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  const quantity = Math.max(1, count ?? 0);

  const stripe = getStripe();

  // customer を確保（無ければ作成＋ metadata.tenant_id）→ 即 tenant_billing へ書込。
  const { data: billing } = await admin
    .from("tenant_billing")
    .select("stripe_customer_id, status, trial_ends_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  let customerId = billing?.stripe_customer_id ?? null;
  if (!customerId) {
    const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantId).single();
    const customer = await stripe.customers.create({
      name: tenant?.name ?? undefined,
      email: profile.email ?? undefined,
      metadata: { tenant_id: tenantId },
    });
    customerId = customer.id;
    await admin.from("tenant_billing").upsert({
      tenant_id: tenantId,
      stripe_customer_id: customerId,
      status: billing?.status ?? "inactive",
      quantity,
      updated_at: new Date().toISOString(),
    });
  }

  // DBトライアル残の持ち越し（48h 未満/過去/null は即課金）。
  const trialEnd = computeTrialEnd((billing?.trial_ends_at as string | null) ?? null);

  const origin = new URL(req.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity }],
    ...(trialEnd ? { subscription_data: { trial_end: trialEnd } } : {}),
    payment_method_collection: "always", // トライアルでもカード必須
    success_url: `${origin}/billing?status=success`,
    cancel_url: `${origin}/billing?status=cancel`,
  });

  return NextResponse.json({ ok: true, url: session.url });
}
```

### `app/api/billing/portal/route.ts`

- 行数: 42 / bytes: 1520

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Billing Portal セッション作成（hq専用）。カード変更/解約/請求書は Stripe 側。結果は webhook で反映。
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "hq")
    return NextResponse.json({ error: "請求の操作は本部のみ可能です" }, { status: 403 });

  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("tenant_billing")
    .select("stripe_customer_id")
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();
  if (!billing?.stripe_customer_id)
    return NextResponse.json({ error: "まだご契約がありません" }, { status: 400 });

  const origin = new URL(req.url).origin;
  const session = await getStripe().billingPortal.sessions.create({
    customer: billing.stripe_customer_id,
    return_url: `${origin}/billing`,
  });

  return NextResponse.json({ ok: true, url: session.url });
}
```

### `app/api/billing/change-plan/route.ts`

- 行数: 79 / bytes: 4834
- ★プラン切替＝NOX は周期切替のみ

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// F5 案B（方式b・A案）：機能軸（シフト↔レジ）＋周期軸（月↔年）プラン変更のセルフサーブ（hq専用・カード決済のみ）。
//  4Price のどれにでも切替（2軸統合）。既存 subscription の price を差し替え（subscriptions.update・
//  create_prorations＝差額即時比例配分）。★フラグ（pos_enabled）は route で直接更新しない＝webhook の
//  subscription.updated → applyPlanFlags が単一ソース（二重更新回避・既存写像に乗るだけ）。店舗軸（multi_store）は不変。
//  ★A案：銀行振込（collection_method='send_invoice'）テナントは self-serve 対象外＝403（運営者代行）。
//  checkout（新規契約）・BTレーンは別 route・非改変。price 解決は checkout / bank-transfer と同じ env 4Price 方式。
const PRICE_ENV: Record<string, string | undefined> = {
  "shift:monthly": process.env.STRIPE_PRICE_SHIFT_MONTHLY,
  "shift:yearly": process.env.STRIPE_PRICE_SHIFT_YEARLY,
  "pos:monthly": process.env.STRIPE_PRICE_POS_MONTHLY,
  "pos:yearly": process.env.STRIPE_PRICE_POS_YEARLY,
};
const ALIVE = ["trialing", "active", "past_due"]; // 変更可能な生存 status（canceled/unpaid は新規契約へ）

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (!profile || profile.role !== "hq")
    return NextResponse.json({ error: "請求の操作は本部のみ可能です" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { plan?: unknown; cycle?: unknown };
  const plan = body.plan;
  const cycle = body.cycle;
  if ((plan !== "shift" && plan !== "pos") || (cycle !== "monthly" && cycle !== "yearly"))
    return NextResponse.json({ error: "プランの指定が不正です" }, { status: 400 });
  const newPriceId = PRICE_ENV[`${plan}:${cycle}`];
  if (!newPriceId) return NextResponse.json({ error: `Price が未設定です（${plan}/${cycle}）` }, { status: 500 });

  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("tenant_billing")
    .select("stripe_subscription_id, status, collection_method")
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();
  if (!billing?.stripe_subscription_id)
    return NextResponse.json({ error: "変更できるご契約がありません。先にプランをご契約ください。" }, { status: 400 });
  if (!ALIVE.includes(billing.status ?? ""))
    return NextResponse.json({ error: "現在のご契約では変更できません。プランを選び直してください。" }, { status: 400 });
  // ★A案：銀行振込（請求書払い）は self-serve 変更不可＝運営者が代行（お問い合わせ）。
  if (billing.collection_method === "send_invoice")
    return NextResponse.json({ error: "銀行振込でご契約のプラン変更はお問い合わせください（運営者が承ります）。" }, { status: 403 });

  const stripe = getStripe();
  try {
    const sub = await stripe.subscriptions.retrieve(billing.stripe_subscription_id);
    const item = sub.items.data[0];
    if (!item) return NextResponse.json({ error: "ご契約の明細が見つかりません。" }, { status: 400 });

    // 既に同一 price（＝同プラン）なら no-op（冪等・二重変更防止）。
    if (item.price.id === newPriceId) return NextResponse.json({ ok: true, unchanged: true });

    // 数量は現状維持（omit＝Stripe が既存 quantity を保持）＝店舗数は変わらないため再計算しない。
    await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, price: newPriceId }],
      proration_behavior: "create_prorations",
    });
    // pos_enabled は webhook（subscription.updated → applyPlanFlags）で追随＝ここでは触らない。
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Stripe 失敗は 502（他 billing route と同じ degrade 流儀・秘密情報は含めない）。フラグは webhook で整合。
    const msg = e instanceof Error ? e.message : "Stripe API エラー";
    console.error("billing change-plan: Stripe 失敗", msg);
    return NextResponse.json({ error: `プラン変更に失敗しました: ${msg}` }, { status: 502 });
  }
}
```

### `app/api/billing/switch-to-card/route.ts`

- 行数: 61 / bytes: 3532

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// F5 案B 第2部（方針Y）：銀行振込（send_invoice）→ カード自動引き落とし（charge_automatically）への
//  切替セルフサーブ（hq専用・銀行振込テナントのみ）。カードが無いため Checkout mode='setup' で課金せずカードを収集し、
//  完了処理（return route）で collection_method を charge_automatically へ切替える。
//  ★逆方向（カード→銀行振込）は self-serve に出さない＝運営者管理維持（方針Y）。
//  ★フラグ（pos_enabled 等）は一切触らない＝この操作は決済方式の変更のみ。webhook / sync.ts / checkout /
//   bank-transfer(BT-2) は非改変。tenant_billing.collection_method は既存 webhook 同期にそのまま乗る。
const ALIVE = ["trialing", "active", "past_due"]; // 生存 status（webhook の alive 判定と同語彙）

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (!profile || profile.role !== "hq")
    return NextResponse.json({ error: "請求の操作は本部のみ可能です" }, { status: 403 });

  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("tenant_billing")
    .select("stripe_customer_id, stripe_subscription_id, status, collection_method")
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();
  if (!billing?.stripe_customer_id || !billing?.stripe_subscription_id)
    return NextResponse.json({ error: "切り替えできるご契約がありません。" }, { status: 400 });
  if (!ALIVE.includes(billing.status ?? ""))
    return NextResponse.json({ error: "現在のご契約では切り替えできません。" }, { status: 400 });
  // 銀行振込テナントのみが対象＝既にカード決済なら no-op（冪等・400）。
  if (billing.collection_method !== "send_invoice")
    return NextResponse.json({ error: "既にカード決済でご契約中です。", code: "already_card" }, { status: 400 });

  const stripe = getStripe();
  try {
    // Checkout mode='setup'：カードを課金せず保存（SetupIntent）。返り先の return route で切替を実行。
    const origin = new URL(req.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: billing.stripe_customer_id,
      payment_method_types: ["card"],
      success_url: `${origin}/api/billing/switch-to-card/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?switch=cancel`,
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (e) {
    // Stripe 失敗は 502（他 billing route と同じ degrade 流儀・秘密情報は含めない）。DB は不変。
    const msg = e instanceof Error ? e.message : "Stripe API エラー";
    console.error("billing switch-to-card: Stripe 失敗", msg);
    return NextResponse.json({ error: `カード切替の開始に失敗しました: ${msg}` }, { status: 502 });
  }
}
```

### `app/api/billing/switch-to-card/return/route.ts`

- 行数: 80 / bytes: 4403

```ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// F5 案B 第2部（方針Y）：switch-to-card の完了処理。Checkout(mode='setup') 成功後に Stripe が
//  この GET へブラウザをリダイレクトする（success_url・session_id 付き）。ここで保存されたカードを
//  顧客の既定支払方法にセットし、subscription の collection_method を charge_automatically へ切替える。
//  ★冪等：既に charge_automatically なら切替をスキップして done へ。★安全：session の customer が
//   認証中 hq テナントの customer と一致することを検証（他人の session_id 悪用を遮断）。
//  tenant_billing.collection_method は subscriptions.update が発火する subscription.updated webhook が
//  同期するが、UI 即時性のため本 route でも即書込する（BT-2 の customer 即書込と同型・二重でも冪等）。

function back(req: Request, param: string) {
  return NextResponse.redirect(new URL(`/billing?switch=${param}`, req.url));
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (!profile || profile.role !== "hq") return back(req, "error");

  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!sessionId) return back(req, "error");

  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("tenant_billing")
    .select("stripe_customer_id, stripe_subscription_id, collection_method")
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();
  if (!billing?.stripe_customer_id || !billing?.stripe_subscription_id) return back(req, "error");

  // 既にカード決済なら冪等 no-op（return が二重に踏まれた等）。
  if (billing.collection_method !== "send_invoice") return back(req, "done");

  const stripe = getStripe();
  try {
    // Checkout Session を取得（setup_intent を展開）。session の customer が自テナントの customer と一致を検証。
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["setup_intent"] });
    const sessCustomer = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
    if (session.mode !== "setup" || session.status !== "complete" || sessCustomer !== billing.stripe_customer_id)
      return back(req, "error");

    const si = session.setup_intent as Stripe.SetupIntent | null;
    const pm = si && typeof si.payment_method === "string" ? si.payment_method : (si?.payment_method as Stripe.PaymentMethod | null)?.id ?? null;
    if (!pm) return back(req, "error");

    // ① 顧客の既定支払方法にセット（今後の自動請求はこのカードを使う）。
    await stripe.customers.update(billing.stripe_customer_id, { invoice_settings: { default_payment_method: pm } });
    // ② collection_method を charge_automatically へ切替（send_invoice の発行済み open 請求書は据え置き＝
    //    サプライズ課金なし・次回請求からカード自動引き落とし）。
    await stripe.subscriptions.update(billing.stripe_subscription_id, {
      collection_method: "charge_automatically",
      default_payment_method: pm,
    });
    // ③ UI 即時性のため tenant_billing を即書込（webhook でも整合＝二重でも冪等）。
    await admin
      .from("tenant_billing")
      .update({ collection_method: "charge_automatically", updated_at: new Date().toISOString() })
      .eq("tenant_id", profile.tenant_id);

    return back(req, "done");
  } catch (e) {
    // Stripe 失敗は done にせず error（秘密情報は出さない）。DB は不変で一貫（未切替のまま）。
    const msg = e instanceof Error ? e.message : "Stripe API エラー";
    console.error("billing switch-to-card return: Stripe 失敗", msg);
    return back(req, "error");
  }
}
```

### `app/api/stripe/webhook/route.ts`

- 行数: 157 / bytes: 8557
- ★event 集合の正本

```ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { upsertBilling, normalizeStatus, localTenantByCustomer, resolvePlan, applyPlanFlags, recordPayment, jstMonthStart } from "@/lib/billing/sync";
import { contractAmountFromItem } from "@/lib/billing/amount";
import { sendYuibaEvent, mapContractStatus, getTenantIdentity, buildContractStatusPayload } from "@/lib/yuiba";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

// Stripe Webhook（raw body・署名検証必須）。tenant_billing への唯一の書込経路。
// 冪等＋順不同対応：subscription を再取得して現在値を upsert（最新勝ち）。
export async function POST(req: Request) {
  const raw = await req.text(); // 署名検証は raw body で
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return new NextResponse("not configured", { status: 500 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return new NextResponse("invalid signature", { status: 400 });
  }

  if (!HANDLED.has(event.type)) return NextResponse.json({ received: true });

  try {
    const obj = event.data.object as unknown as Record<string, unknown>;
    const customerId = typeof obj.customer === "string" ? obj.customer : null;
    let subscriptionId: string | null = null;
    if (event.type.startsWith("customer.subscription")) subscriptionId = obj.id as string;
    else if (typeof obj.subscription === "string") subscriptionId = obj.subscription; // checkout.session / 旧形状 invoice（後方互換）
    else {
      // BT-3：v22/basil 形状の invoice は top-level subscription を持たず
      // parent.subscription_details.subscription へ移動（実測）。この解決が無いと
      // invoice.paid / invoice.payment_failed が素通り＝入金復帰の invoice 系統が死ぬ。
      const parent = obj.parent as { subscription_details?: { subscription?: unknown } } | null | undefined;
      const pSub = parent?.subscription_details?.subscription;
      if (typeof pSub === "string") subscriptionId = pSub;
    }
    if (!customerId) return NextResponse.json({ received: true });

    // テナント解決：ローカル（Checkout作成時に即書込）→ 無ければ Stripe customer.metadata.tenant_id。
    let tenantId = await localTenantByCustomer(customerId);
    if (!tenantId) {
      const cust = await stripe.customers.retrieve(customerId);
      if (!(cust as Stripe.DeletedCustomer).deleted) {
        const md = (cust as Stripe.Customer).metadata ?? {};
        tenantId = typeof md.tenant_id === "string" ? md.tenant_id : null;
      }
    }
    if (!tenantId || !subscriptionId) return NextResponse.json({ received: true }); // 解決不能は無視（後続イベントで整合）

    // subscription を再取得して現在値で upsert（順不同・再送に強い）。
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const item = sub.items.data[0];
    // Stripe 2025: 課金期間は item 単位（current_period_end は subscription item にある）。
    const periodEnd = item?.current_period_end ?? null;
    const status = normalizeStatus(sub.status);
    await upsertBilling(tenantId, {
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      quantity: item?.quantity ?? 1,
      trial_ends_at: null, // Stripe 契約が立った＝DBトライアル期限をクリア（0071 の対象外へ）
      collection_method: sub.collection_method, // BT-3：レーン種別を Stripe に追随（0104・最新勝ち）
    });

    // 入金実績の記録（invoice.paid のみ・BANZEN 自身の入金履歴＝billing_payments/0118）。
    //   金額=invoice.amount_paid（JPY ゼロデシマル＝円整数）／paid_at=status_transitions.paid_at（第一候補・
    //   欠落時は invoice.created へフォールバック）。★記録失敗は既存の 500 経路に乗せてよい＝Stripe 再送で回復
    //   （stripe_invoice_id 冪等ゆえ再送安全）。※Yuiba 送信（別扱い）は末尾で完全隔離＝500 に乗せない。
    if (event.type === "invoice.paid") {
      const amountPaid = typeof obj.amount_paid === "number" ? obj.amount_paid : null;
      const st = obj.status_transitions as { paid_at?: number | null } | undefined;
      const paidAtUnix = st?.paid_at ?? (typeof obj.created === "number" ? obj.created : null);
      const invoiceId = typeof obj.id === "string" ? obj.id : null;
      if (invoiceId && amountPaid !== null && paidAtUnix) {
        await recordPayment(tenantId, {
          stripeInvoiceId: invoiceId,
          amount: amountPaid,
          paidAt: new Date(paidAtUnix * 1000),
        });
      }
    }

    // 3プラン課金：price → プラン判定 → 機能フラグ（0041）上書き。
    //   生存 status（trialing/active/past_due）＝プランどおり／それ以外（canceled 等・subscription.deleted 含む）＝両方 false。
    //   未知 price（旧 graduated 契約）＝grandfather＝フラグを一切触らない（billing upsert のみ）。
    const plan = resolvePlan(item?.price ?? null);
    if (plan) {
      const alive = ["trialing", "active", "past_due"].includes(status);
      await applyPlanFlags(tenantId, plan, alive);
    } else {
      console.log(`stripe webhook: unknown price → plan flags untouched (grandfather) price=${item?.price?.id ?? "?"} tenant=${tenantId}`);
    }

    // ── Yuiba 連携（Lexor 横断コンソールへ契約/入金を共有）。★完全隔離：送信失敗は既存 webhook を壊さない
    //    （sendYuibaEvent は内部で throw しない＋getTenantIdentity も含め個別 try-catch で 500 経路に乗せない）。──
    try {
      const { tenant, referralCode } = await getTenantIdentity(tenantId);
      if (event.type === "invoice.paid") {
        const amountPaid = typeof obj.amount_paid === "number" ? obj.amount_paid : 0;
        const st = obj.status_transitions as { paid_at?: number | null } | undefined;
        const paidAtUnix = st?.paid_at ?? (typeof obj.created === "number" ? obj.created : null);
        const invoiceId = typeof obj.id === "string" ? obj.id : null;
        if (invoiceId && paidAtUnix) {
          const paidAt = new Date(paidAtUnix * 1000);
          await sendYuibaEvent({
            event_id: `banzen-pay-${invoiceId}`,
            type: "payment_settled",
            tenant,
            amount: amountPaid,
            settled_month: jstMonthStart(paidAt).slice(0, 7), // "YYYY-MM"（JST）
            occurred_at: paidAt.toISOString(),
          });
        }
      } else if (event.type === "checkout.session.completed" || event.type.startsWith("customer.subscription")) {
        // ★実効ステータスで写像。webhook 由来は Stripe sub＝tenant_billing.trial_ends_at は 0070 で null 固定
        //   （期限切れトライアルの誤報告は mapContractStatus 側で防御・verify で固定）。
        //   ★referral_code は buildContractStatusPayload が payload 直下に置く（初回契約時に Yuiba が使用・空は省略）。
        await sendYuibaEvent(
          buildContractStatusPayload({
            eventId: `banzen-cs-${event.id}`,
            tenant,
            status: mapContractStatus(status, null, new Date()),
            amount: contractAmountFromItem(item)?.total ?? 0,
            referralCode,
            occurredAt: new Date(event.created * 1000).toISOString(),
          }),
        );
      }
      // invoice.payment_failed は Yuiba 送信なし（status は customer.subscription.updated で追随）。
    } catch (e) {
      console.error("yuiba send 失敗（隔離・webhook は 200 継続）", (e as Error).message);
    }

    return NextResponse.json({ received: true });
  } catch {
    // 失敗は500でStripe再送（upsertは冪等なので安全）。
    return new NextResponse("error", { status: 500 });
  }
}
```

### `app/api/cron/expire-trials/route.ts`

- 行数: 26 / bytes: 1142
- NOX は「表示用 status 整備」＝判定非依存（設計 v1.2 §7）

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DBトライアル期限切れの機能フラグ降格（0071 expire_trials・service 専用 RPC）。
// 起動＝Vercel Cron（vercel.json・日次）。保護＝Authorization: Bearer CRON_SECRET
//（Vercel は CRON_SECRET env があると同ヘッダを自動付与・SPEC「cron保護」準拠）。
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("not configured", { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("expire_trials");
  if (error) {
    console.error(`cron expire-trials: RPC 失敗 ${error.message}`);
    return new NextResponse("error", { status: 500 });
  }
  console.log(`cron expire-trials: ${data} tenant(s) downgraded`);
  return NextResponse.json({ ok: true, expired: data });
}
```

### `app/api/cron/billing-reminders/route.ts`

- 行数: 150 / bytes: 7072
- BT リマインダ cron（NOX は BT 送りの裁定次第）

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { mailConfigured, sendMail } from "@/lib/mail";
import { resolvePlan } from "@/lib/billing/sync";
import { REMINDER_DAYS, daysUntilDueJst } from "@/lib/billing/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Stripe API をテナント数ぶん呼ぶため既定10sでは不足しうる（google-sync 同型）

// BTレーン BT-4：銀行振込（send_invoice）テナントへのお支払い期日リマインド。
// 起動＝Vercel Cron（vercel.json・日次 20:00 UTC＝JST 5:00＝既存4本と非衝突）。
// 保護＝Authorization: Bearer CRON_SECRET（既存 cron 4本と同型）。
//
// 【重複防止＝新テーブルなし（設計ロック）】日次実行 × 残日数が閾値に一致した日だけ送る
//   ＝1テナント1閾値につき1日1通に自然に収束する（送信履歴を持たない）。
// 【degrade 安全】mailConfigured() false（RESEND env 未設定）なら送信せず skipped に計上して 200 を返す。
// 【1テナントの失敗で全体を落とさない】Stripe/送信の失敗は握りつぶして failed に計上（google-sync 同流儀）。
// REMINDER_DAYS / daysUntilDueJst は lib/billing/reminders へ抽出（純関数＝verify:bt-lane で検証）。挙動不変。
const PLAN_LABEL: Record<string, string> = { shift: "シフト管理プラン", pos: "シフト＋レジプラン" };

const fmtYen = (n: number) => `¥${new Intl.NumberFormat("ja-JP").format(n)}`;
const fmtDateJa = (epochSec: number) =>
  new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" }).format(
    new Date(epochSec * 1000),
  );

function buildMail(a: { tenantName: string; planLabel: string; amount: number; dueEpochSec: number; days: number; url: string | null }) {
  const when = a.days === 0 ? "本日" : `あと${a.days}日`;
  const subject = `【BANZEN】お支払い期日のご案内（${when}）`;
  const text = [
    `${a.tenantName} ご担当者さま`,
    "",
    "いつも BANZEN をご利用いただきありがとうございます。",
    "ご請求のお支払い期日が近づいておりますので、ご案内いたします。",
    "",
    `ご契約プラン: ${a.planLabel}`,
    `ご請求金額: ${fmtYen(a.amount)}`,
    `お支払い期日: ${fmtDateJa(a.dueEpochSec)}（${when}）`,
    "",
    ...(a.url ? ["お振込先は下記のページからご確認いただけます。", a.url, ""] : []),
    "お支払い期日を過ぎますと、シフト作成・給与計算などの編集機能を一時的に停止させていただく場合がございます（記録の閲覧は引き続きご利用いただけます）。ご入金を確認しますと自動的に復帰します。",
    "",
    "行き違いでお振込みが完了している場合は、本メールは破棄してください。",
    "",
    "──────────────",
    "BANZEN サポート",
  ].join("\n");
  return { subject, text };
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("not configured", { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  // 対象＝振込レーン（0104）の全テナント。
  const { data: rows, error } = await admin
    .from("tenant_billing")
    .select("tenant_id, stripe_customer_id, stripe_subscription_id")
    .eq("collection_method", "send_invoice");
  if (error) {
    console.error(`cron billing-reminders: 対象取得失敗 ${error.message}`);
    return new NextResponse("error", { status: 500 });
  }

  const checked = rows?.length ?? 0;
  // getStripe() 遅延化（バッチ2採用）：対象0件なら Stripe を呼ばず return＝STRIPE_SECRET_KEY 未設定環境でも degrade（500 にしない）。
  if (checked === 0) {
    console.log("cron billing-reminders: checked=0 sent=0 skipped=0 failed=0 (send_invoice テナントなし)");
    return NextResponse.json({ ok: true, checked: 0, sent: 0, skipped: 0, failed: 0 });
  }
  const mailEnabled = mailConfigured();
  const now = new Date();
  const stripe = getStripe();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const r of rows ?? []) {
    const tenantId = r.tenant_id as string;
    try {
      const customerId = r.stripe_customer_id as string | null;
      const subscriptionId = r.stripe_subscription_id as string | null;
      if (!customerId || !subscriptionId) {
        skipped++;
        continue;
      }

      // 未払いの請求書（subscription 紐付き・最新1件）。draft/paid/void は対象外。
      const list = await stripe.invoices.list({
        customer: customerId,
        subscription: subscriptionId,
        status: "open",
        limit: 1,
      });
      const inv = list.data[0];
      if (!inv?.due_date) {
        skipped++;
        continue;
      }

      const days = daysUntilDueJst(inv.due_date, now);
      if (!REMINDER_DAYS.includes(days)) {
        skipped++; // 閾値外の日（期日超過の負値もここ＝督促は BT-5 の停止に委ねる）
        continue;
      }
      if (!mailEnabled) {
        skipped++; // degrade：送信手段が無い（env 未設定）
        continue;
      }
      // 宛先＝Stripe customer.email（BT-2 の発行 route が email 必須を保証済み）。
      const to = inv.customer_email;
      if (!to) {
        skipped++;
        continue;
      }

      // プラン名＝subscription の price から解決（webhook の resolvePlan と同一流儀・未知 price は総称）。
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const plan = resolvePlan(sub.items.data[0]?.price ?? null);
      const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();

      const { subject, text } = buildMail({
        tenantName: tenant?.name ?? "ご契約者",
        planLabel: plan ? PLAN_LABEL[plan] : "ご契約プラン",
        amount: inv.amount_due ?? 0,
        dueEpochSec: inv.due_date,
        days,
        url: inv.hosted_invoice_url ?? null,
      });
      const ok = await sendMail({ to: [to], subject, text });
      if (ok) sent++;
      else failed++; // 送信失敗は sendMail 側でログ済み
    } catch (e) {
      failed++;
      console.error(`cron billing-reminders: tenant=${tenantId} 失敗`, (e as Error).message);
    }
  }

  console.log(
    `cron billing-reminders: checked=${checked} sent=${sent} skipped=${skipped} failed=${failed}${mailEnabled ? "" : " (mail 未構成=送信スキップ)"}`,
  );
  return NextResponse.json({ ok: true, checked, sent, skipped, failed, ...(mailEnabled ? {} : { mail_disabled: true }) });
}
```

## D. ★プラン軸削除で消える箇所（NOX 裁定7/§1・単一プラン×周期のみ）

| 箇所 | 消えるもの | 根拠（NOX docs） |
|---|---|---|
| `lib/billing/plans.ts` | **機能軸プランの定義集合そのもの**（プラン一覧・機能フラグ写像） | 設計 v1.2 :13「機能軸なし」・:148「0041–0043 2フラグ・プラン軸は写さない」 |
| `lib/billing/quantity.ts` | プラン別の数量算出 → **stores count の min 1 へ置換** | 設計 v1.2 :12・:153 |
| `app/api/billing/change-plan/route.ts` | **プラン変更の意味論** → 周期切替（month/year）のみへ縮退 | 設計 v1.2 :138 |
| `billing-view.tsx` のプラン選択 UI | プランカード/比較表 → **周期トグルのみ** | 設計 v1.2 :138 |
| env `STRIPE_PRICE_POS_*` | 機能軸 Price 2本 | 設計 v1.2 :139-140（NOX は monthly/yearly の2本のみ） |
| 2フラグ（`pos_enabled`/`multi_store_enabled`）参照 | プラン軸ゲート | 設計 v1.2 :148・流用マップ :60 |
| `orgs.plan` / `orgs.status` 相当の参照 | **死列・不参照**（課金正本は org_billing 一本） | 設計 v1.2 :16-17（裁定7） |

★逐語本文中の該当行は、各ファイルの見出し直下の注記で示した（`★`／`★★` 付き）。

## E. 採取時の観察（起草の材料・CC 所見）

- BANZEN の `sync.ts` が **Stripe → DB の写像の本体**。NOX には org_billing への書込経路が
  現状ゼロ（`billing_writable_of` の読取1本のみ）＝**このファイルの移植が app レーンの核**。
- `webhook/route.ts` は `HANDLED` の集合で受理イベントを絞り、`sync.ts` へ流す形。
  NOX 設計書に event 集合の記述が無いため、**この HANDLED がそのまま裁定の底本になる**。
- `gate.ts` は route 側の一次ゲート（user client で述語を呼ぶ）＝NOX の billingGate の型。
  NOX は書込の大半が client 直 RPC のため、**適用範囲（どの route に併設するか）は要裁定**。
- cron は BANZEN で 6本中2本が課金関連。NOX は vercel.json ごと新設になる。

