// Stripe webhook の純関数部（設計書 v1 §3・段57 の単体対象）。
//   ★route ファイル（app/api/stripe/webhook/route.ts）から分離した理由:
//     Next.js の App Router は route.ts の export をハンドラ＋既定 config に限定し、
//     それ以外を export すると **型検査で build が落ちる**
//     （`Property 'resolveSubscriptionId' is incompatible with index signature`）。
//     tsc --noEmit と lint は通るため、**next build まで走らせないと露見しない**種類の欠陥。
//   純関数をここへ置くことで build も通り、Stripe 実呼びなしの単体テストもそのまま書ける。

// 受理する 6 events（donor 実測の HANDLED と同集合＝設計書 §3 写像表）。
export const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

/** event 本体から subscription id を解く純関数（donor の3経路を逐語移植）。
 *   - customer.subscription.* → obj.id
 *   - checkout.session / 旧形状 invoice → obj.subscription
 *   - ★v22/basil の invoice → obj.parent.subscription_details.subscription（donor 実測の後方互換）
 */
export function resolveSubscriptionId(eventType: string, obj: Record<string, unknown>): string | null {
  if (eventType.startsWith("customer.subscription")) return typeof obj.id === "string" ? obj.id : null;
  if (typeof obj.subscription === "string") return obj.subscription;
  const parent = obj.parent as { subscription_details?: { subscription?: unknown } } | null | undefined;
  const pSub = parent?.subscription_details?.subscription;
  return typeof pSub === "string" ? pSub : null;
}
