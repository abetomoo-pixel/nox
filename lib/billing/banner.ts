// 失効バナーの文言と出現条件（課金 app 設計書 v1 §6・段57 の単体対象）。
//
// ★出現条件は SQL 述語 public.billing_writable_of(mig0087) の**否定と同値**である:
//     述語   = status in (trialing,active,past_due) and (status<>'trialing' or trial_ends_at > now())
//              …行なしは coalesce で false
//     否定   = status in (canceled,inactive) or (trialing かつ期限切れ) or 行なし
//   設計書 §6 の条件（canceled/inactive or trialing かつ期限切れ）に「行なし＝fail-closed」を足したもの＝
//   述語と1文字も食い違わせないため、こちらを正とする。
//
// ★シェル（app/(manage)/layout.tsx）は **auth_org_billing_writable() の RPC 結果**でバナーを出す。
//   org_billing の RLS SELECT は **owner 限定**（mig0087）＝manager/staff/cast は行を読めないため、
//   行を読む実装だと owner にしかバナーが出ない。zero-arg ラッパは authenticated 全員に grant されており
//   boolean しか返さない＝**全ロールに出せて、かつ課金情報は漏れない**。
//   本純関数は「行が読める文脈（/billing＝owner）」の表示判定と、述語との同値を係留する単体のために置く。
export const BILLING_BANNER_MSG =
  "ご利用プランが失効しています。閲覧・出力は可能ですが、更新はできません。";

export type BillingRowForBanner = {
  status?: string | null;
  trial_ends_at?: string | null;
} | null | undefined;

/** バナーを出すか（= writable でないか）。行なし/status 不明は fail-closed で true（出す）。 */
export function shouldShowBillingBanner(row: BillingRowForBanner, now: Date = new Date()): boolean {
  if (!row || !row.status) return true; // 行なし＝述語の coalesce(false) と同じ側へ倒す
  const s = row.status;
  if (s !== "trialing" && s !== "active" && s !== "past_due") return true; // canceled / inactive / 未知
  if (s !== "trialing") return false; // active / past_due は期限を見ない（述語と同じ）
  const t = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : Number.NaN;
  if (!Number.isFinite(t)) return true; // trialing なのに期限不明＝fail-closed
  return !(t > now.getTime()); // 期限切れ（同時刻ちょうども切れ扱い＝SQL の `>` と同じ）
}
