// Stripe SDK クライアント（サーバ専用・遅延生成）。
//   ★env 不在でも import 時には落ちない（フェイルソフト＝設計書ゲート「env 未設定で checkout/portal 実呼び
//     以外がすべて動くこと」）。実際に Stripe を呼ぶ瞬間だけ throw する。
//   ★SECRET は NEXT_PUBLIC_ ではない＝クライアントへ渡さない（admin client と同じ流儀）。
import Stripe from "stripe";

let cached: Stripe | null = null;

/** Stripe が使える状態か（env 4本のうち SECRET の有無）。UI の「Stripe 未接続」表示に使う。 */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Price id（月/年）。未設定は null＝checkout ボタンを出さない。 */
export function stripePrices(): { monthly: string | null; yearly: string | null } {
  return {
    monthly: process.env.STRIPE_PRICE_NOX_MONTHLY ?? null,
    yearly: process.env.STRIPE_PRICE_NOX_YEARLY ?? null,
  };
}

export function getStripe(): Stripe {
  if (typeof window !== "undefined") {
    throw new Error("stripe client はサーバ専用です（クライアントから呼ばないこと）");
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe 未接続: STRIPE_SECRET_KEY が未設定です");
  if (!cached) cached = new Stripe(key);
  return cached;
}

// ★裁定479（2026-11-10）: price は lookup_key（nox_monthly／nox_yearly）で引く＝テストと本番で同じコード。env（STRIPE_PRICE_NOX_*）があれば上書き。
//   引けなければ null（呼び手は「Stripe 未接続」の扱い）。プロセス内で 10 分だけ覚える。
const priceCache = new Map<string, { id: string; at: number }>();
export async function resolveNoxPrice(cycle: "monthly" | "yearly"): Promise<string | null> {
  const { envPriceOf, NOX_LOOKUP_KEYS } = await import("@/lib/billing/nox-stripe");
  const env = envPriceOf(cycle);
  if (env) return env;
  const key = NOX_LOOKUP_KEYS[cycle];
  const hit = priceCache.get(key);
  if (hit && Date.now() - hit.at < 600_000) return hit.id;
  try {
    const list = await getStripe().prices.list({ lookup_keys: [key], active: true, limit: 1 });
    const id = list.data[0]?.id ?? null;
    if (id) priceCache.set(key, { id, at: Date.now() });
    return id;
  } catch {
    return null;
  }
}
