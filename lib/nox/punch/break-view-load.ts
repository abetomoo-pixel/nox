// ★起票170（相談役 11/26 の便 M の M2-8）: 休憩の行（punch_breaks）を読む所（勤怠の表・/mine の受け皿）。書込なし。
//   旗 MIG_0214_APPLIED が false の間は読まない（空を返す＝今と同じ）。キャストの行だけ（スタッフの休憩はスタッフの画面）。
import type { SupabaseClient } from "@supabase/supabase-js";
import { mig0214On } from "../rules-0175/flag";
import type { BreakRaw } from "./break-view";

export async function loadCastBreakRaw(client: SupabaseClient, storeId: string, from: string, to: string, castId?: string | null): Promise<BreakRaw[]> {
  if (!mig0214On()) return [];
  let q = client.from("punch_breaks").select("cast_id, membership_id, biz_date, started_at, ended_at").eq("store_id", storeId).gte("biz_date", from).lte("biz_date", to).not("cast_id", "is", null);
  if (castId) q = q.eq("cast_id", castId);
  const { data, error } = await q;
  if (error) throw new Error(`punch_breaks: ${error.message}`);
  return ((data ?? []) as { cast_id: string | null; membership_id: string | null; biz_date: string; started_at: string; ended_at: string | null }[])
    .map((b) => ({ castId: b.cast_id, membershipId: b.membership_id, bizDate: String(b.biz_date), startedAt: b.started_at, endedAt: b.ended_at }));
}
