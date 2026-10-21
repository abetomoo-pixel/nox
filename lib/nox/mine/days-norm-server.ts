// ★便 X13-G W-22 ⑤: 出勤ノルマ（今月・来月）の目標をサーバで読む＝/api/mine/norm-progress と同じ解決（cast_norms の当月行（非 0）＞プランの既定 norm_days_target）。
//   店が出勤日数の軸（settings_json.norm_axes.days）を採用していないときは null。プランは cast の RLS で読めない＝admin（本人分の目標だけを返す）。
import { createAdminClient } from "@/lib/supabase/admin";
import { normAxesOf, normTargetsOf, resolveNormTargetsOf } from "@/lib/nox/store/norm-axes";

export async function daysNormTargetsOf(castId: string, storeId: string, months: readonly string[], today: string): Promise<Record<string, number | null>> {
  const admin = createAdminClient();
  const [{ data: st }, { data: cp }, { data: norms }] = await Promise.all([
    admin.from("stores").select("settings_json").eq("id", storeId).maybeSingle(),
    admin.from("cast_plan").select("plan_id, valid_from, valid_to").eq("cast_id", castId).lte("valid_from", today).or(`valid_to.is.null,valid_to.gte.${today}`).order("valid_from", { ascending: false }).limit(1),
    admin.from("cast_norms").select("period, days_target").eq("cast_id", castId).in("period", [...months]),
  ]);
  const axes = normAxesOf(st?.settings_json);
  const out: Record<string, number | null> = Object.fromEntries(months.map((m) => [m, null]));
  if (!axes.days) return out;
  const planId = (cp ?? [])[0]?.plan_id as string | undefined;
  const { data: plan } = planId ? await admin.from("comp_plans").select("norm_days_target, norm_dohan_target, norm_sales_target, norm_shimei_target").eq("id", planId).maybeSingle() : { data: null };
  for (const m of months) {
    const row = ((norms ?? []) as { period: string; days_target: number | null }[]).find((r) => r.period === m);
    const v = resolveNormTargetsOf(normTargetsOf(plan ?? null), { days: row?.days_target ?? 0 }, axes).value.days;
    out[m] = typeof v === "number" && v > 0 ? v : null;
  }
  return out;
}
