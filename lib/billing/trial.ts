// DB トライアル（mig0087・org_billing.trial_ends_at）の Stripe Checkout への持ち越し（純関数）。
// Stripe 制約: Checkout の subscription_data.trial_end は「現在から48時間以上先」が必須
// → 残りが48時間未満のときは持ち越さない（＝トライアルなし・即課金）。過去/null も同様。
// donor lib/billing/trial.ts と同値（DB 非依存の純関数＝そのまま移植）。
export const MIN_TRIAL_CARRYOVER_MS = 48 * 60 * 60 * 1000;

export function computeTrialEnd(trialEndsAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!trialEndsAt) return null;
  const t = new Date(trialEndsAt).getTime();
  if (!Number.isFinite(t)) return null;
  if (t - now.getTime() < MIN_TRIAL_CARRYOVER_MS) return null;
  return Math.floor(t / 1000); // Stripe は epoch 秒
}
