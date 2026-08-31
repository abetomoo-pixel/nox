// 給与期間の窓解決（'YYYY-MM' → 日付境界＋絶対 timestamptz 窓）。
// 'YYYY-MM'→[月初,月末] date は DB の period_bounds を単一ソースに（裁定F4c・get_cast_ranking と同一写像）。
// cutoff/close は stores.settings_json（既定 06:00 / 25:00）。started_at/punched_at の絶対窓は
//   [periodStart @ cutoff JST, (periodEnd+1) @ cutoff JST)（get_cast_ranking と同式・JST 固定 +09:00）。

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "../biz-date";

export type PayrollWindow = {
  period: string; // 'YYYY-MM'
  periodStart: string; // 'YYYY-MM-DD'（月初 biz_date）
  periodEnd: string; // 'YYYY-MM-DD'（月末 biz_date）
  cutoffHm: string; // 'HH:MM'
  closeHm: string; // 'HH:MM' 0-47 域（punch-match の out 判定用・F2c は表示のみ）
  startTs: string; // ISO（started_at/punched_at 窓の下限）
  endTs: string; // ISO（同上限・排他）
};

// ★裁定98: core の periodDays 写像（'YYYY-MM-DD' 両端含む暦日数・UTC 起点差分＝DST/TZ 非依存）を関数化。
//   当期は core（win の両端）・過去期の平均賃金算定（collect）も同じ写像を通す。
export function periodDaysBetween(periodStart: string, periodEnd: string): number {
  return Math.round((Date.parse(`${periodEnd}T00:00:00Z`) - Date.parse(`${periodStart}T00:00:00Z`)) / 86_400_000) + 1;
}

// 'YYYY-MM' → 暦日数（月初〜月末＝period_bounds と同じ月末写像を UTC で算出・28〜31）。
export function periodCalendarDays(period: string): number {
  const [y, m] = period.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 翌月0日＝当月末日（UTC 純粋）
  return periodDaysBetween(`${period}-01`, `${period}-${String(lastDay).padStart(2, "0")}`);
}

export async function resolvePayrollWindow(
  admin: SupabaseClient,
  storeId: string,
  period: string,
): Promise<PayrollWindow> {
  // 写像単一ソース: period_bounds（authenticated+service_role grant・admin で呼べる）。
  const { data: pb, error } = await admin.rpc("period_bounds", { p_period: period });
  if (error) throw new Error(`period_bounds: ${error.message}`);
  const row = (pb ?? [])[0] as { period_start: string; period_end: string } | undefined;
  if (!row) throw new Error("period_bounds: 行が返らない");
  const periodStart = row.period_start;
  const periodEnd = row.period_end;

  const { data: store, error: eSt } = await admin
    .from("stores")
    .select("settings_json")
    .eq("id", storeId)
    .single();
  if (eSt) throw new Error(`store settings: ${eSt.message}`);
  const settings = (store?.settings_json ?? {}) as Record<string, unknown>;
  const cutoffHm =
    typeof settings.biz_cutoff_hm === "string" && settings.biz_cutoff_hm ? settings.biz_cutoff_hm : "06:00";
  const closeHm = typeof settings.close_hm === "string" && settings.close_hm ? settings.close_hm : "25:00";

  const startTs = `${periodStart}T${cutoffHm}:00+09:00`;
  const endTs = `${addDays(periodEnd, 1)}T${cutoffHm}:00+09:00`;
  return { period, periodStart, periodEnd, cutoffHm, closeHm, startTs, endTs };
}
