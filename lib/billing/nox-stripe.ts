// ★裁定479（2026-11-10・Stripe は案 A＝株式会社レクソルの 1 アカウントで NOX と BANZEN を扱う）＋裁定475 追補1〜3（税込・日割り・請求日は毎月 1 日・年額）。
//   純関数だけ（Stripe SDK・DB 非依存＝verify:nox-billing479 の単体対象）。
//   ①NOX の目印＝作るもの（customer・checkout session・subscription・setup session）に metadata.service='nox' と org_id。
//   ②NOX のイベントかどうか＝object の metadata.service='nox'・price の lookup_key（nox_monthly／nox_yearly）・price／product の metadata.service='nox'。
//     どれも無いイベントは NOX のものでない（BANZEN の customer／subscription／invoice）＝webhook は 200 で無視（ログ 1 行・例外にしない・何も書かない）。
//   ③price は lookup_key で引く（テストと本番で同じコード）＝env（STRIPE_PRICE_NOX_MONTHLY／YEARLY）があれば上書き。
//   ④請求日＝毎月 1 日（JST）にそろえる＝billing_cycle_anchor（初回は日割り＝Stripe の create_prorations）。

export const NOX_SERVICE = "nox";
export const NOX_LOOKUP_KEYS = { monthly: "nox_monthly", yearly: "nox_yearly" } as const;
export type NoxCycle = keyof typeof NOX_LOOKUP_KEYS;

/** NOX が作る Stripe のものに付ける metadata（org の ID は必須）。 */
export function noxMetadataOf(orgId: string, extra: Record<string, string> = {}): Record<string, string> {
  return { service: NOX_SERVICE, org_id: orgId, ...extra };
}

type Md = { metadata?: Record<string, unknown> | null } | null | undefined;
type PriceLike = { lookup_key?: string | null; metadata?: Record<string, unknown> | null; product?: unknown } | null | undefined;
const isNoxMd = (o: Md): boolean => !!o && !!o.metadata && o.metadata.service === NOX_SERVICE;
const isNoxPrice = (p: PriceLike): boolean => {
  if (!p) return false;
  if (typeof p.lookup_key === "string" && (Object.values(NOX_LOOKUP_KEYS) as string[]).includes(p.lookup_key)) return true;
  if (isNoxMd(p)) return true;
  const prod = p.product as Md | string | undefined;
  return typeof prod === "object" && isNoxMd(prod as Md);
};

/** Stripe のイベントの object が NOX のものか（metadata.service・price の lookup_key・price／product の metadata）。 */
export function isNoxStripeObject(obj: Record<string, unknown> | null | undefined): boolean {
  if (!obj) return false;
  if (isNoxMd(obj as Md)) return true;
  // subscription（items.data[].price）・invoice（lines.data[].price／pricing.price_details）・checkout session（line_items は既定で載らない＝metadata で見る）
  const items = ((obj.items as { data?: unknown[] } | undefined)?.data ?? []) as { price?: PriceLike; metadata?: Record<string, unknown> }[];
  if (items.some((it) => isNoxPrice(it.price) || isNoxMd(it))) return true;
  const lines = ((obj.lines as { data?: unknown[] } | undefined)?.data ?? []) as { price?: PriceLike; metadata?: Record<string, unknown>; pricing?: { price_details?: { price?: unknown } } | null }[];
  if (lines.some((l) => isNoxPrice(l.price) || isNoxMd(l))) return true;
  // invoice の親（subscription_details.metadata）
  const parent = obj.parent as { subscription_details?: { metadata?: Record<string, unknown> | null } | null } | null | undefined;
  if (parent?.subscription_details && isNoxMd(parent.subscription_details as Md)) return true;
  const sd = obj.subscription_details as Md;
  return isNoxMd(sd);
}

/** env の price ID（あれば lookup_key より優先）。 */
export function envPriceOf(cycle: NoxCycle, env: Record<string, string | undefined> = process.env): string | null {
  const v = cycle === "monthly" ? env.STRIPE_PRICE_NOX_MONTHLY : env.STRIPE_PRICE_NOX_YEARLY;
  return v && v.trim() ? v.trim() : null;
}

/** 請求日の起点＝基準の時刻（epoch 秒）より後で最初の「毎月 1 日 0:00（JST）」（epoch 秒）。 */
export function nextMonthFirstJstEpoch(fromEpochSec: number): number {
  const JST = 9 * 3600;
  const d = new Date((fromEpochSec + JST) * 1000); // JST の暦を UTC の部品で読む
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const first = Date.UTC(y, m + 1, 1) / 1000 - JST; // 翌月 1 日 0:00 JST
  return first;
}

/** Checkout の subscription_data（お試しの終了・請求日の起点・metadata）。お試しが無ければ今から翌月 1 日まで日割り。 */
export function checkoutSubscriptionDataOf(orgId: string, trialEndEpoch: number | null, nowEpoch: number): {
  metadata: Record<string, string>; trial_end?: number; billing_cycle_anchor: number; proration_behavior: "create_prorations";
} {
  const base = trialEndEpoch ?? nowEpoch;
  return {
    metadata: noxMetadataOf(orgId),
    ...(trialEndEpoch ? { trial_end: trialEndEpoch } : {}),
    billing_cycle_anchor: nextMonthFirstJstEpoch(base),
    proration_behavior: "create_prorations",
  };
}

/** 割引後の金額（クーポン＝率／額）。percent_off は小数可・amount_off は 1 回の請求から引く額（円）。 */
export function discountedTotalOf(total: number, discounts: ({ coupon?: { percent_off?: number | null; amount_off?: number | null } | null } | null | undefined)[] | null | undefined): number {
  let t = total;
  for (const d of discounts ?? []) {
    const c = d?.coupon; if (!c) continue;
    if (typeof c.percent_off === "number" && c.percent_off > 0) t = Math.round(t * (1 - c.percent_off / 100));
    else if (typeof c.amount_off === "number" && c.amount_off > 0) t = t - c.amount_off;
  }
  return Math.max(0, t);
}
