// ★相談役 11/26 の便 M2-4: 運営の問い合わせの未対応（最後が店の発言で、対応済み・見送りでないもの＝opsInquiryWaitingOf と同じ線）を数える（server 専用・admin で読むだけ）。
//   上の帯（OpsShell）の赤い数・一覧の会社の行の印に使う。旗 MIG_0212_APPLIED が false の間は null（出さない）。読めなかったときも null（画面は止めない）。
//   呼ぶのは requireOperatorPage を通った後の /ops の画面だけ（運営者でない人に数を出さない）。
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { mig0212On } from "@/lib/nox/rules-0175/flag";

export const OPS_WAITING_STATUSES = ["received", "checking"] as const;

/** 全社の未対応の件数 */
export async function opsInquiryWaitingCountOf(admin?: SupabaseClient): Promise<number | null> {
  if (!mig0212On()) return null;
  try {
    const { count, error } = await (admin ?? createAdminClient()).from("ops_inquiries").select("id", { count: "exact", head: true }).eq("last_from", "store").in("status", [...OPS_WAITING_STATUSES]);
    return error ? null : count ?? 0;
  } catch { return null; }
}

/** 会社ごとの未対応の件数（一覧の会社の行の印） */
export async function opsInquiryWaitingByOrgOf(admin?: SupabaseClient): Promise<Record<string, number> | null> {
  if (!mig0212On()) return null;
  try {
    const { data, error } = await (admin ?? createAdminClient()).from("ops_inquiries").select("org_id").eq("last_from", "store").in("status", [...OPS_WAITING_STATUSES]).limit(5000);
    if (error) return null;
    const out: Record<string, number> = {};
    for (const r of (data ?? []) as { org_id: string }[]) out[r.org_id] = (out[r.org_id] ?? 0) + 1;
    return out;
  } catch { return null; }
}
