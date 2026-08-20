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
