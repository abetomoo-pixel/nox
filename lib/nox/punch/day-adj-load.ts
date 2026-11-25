// ★0213／0214（相談役 11/25 の D4・D5）: 日の窓の材料（丸めの履歴 punch_round_rules・休憩 punch_breaks）を読む所を 1 つに（給与の collect・勤怠の表・/mine が同じ読み方）。
//   旗 MIG_0213_APPLIED／MIG_0214_APPLIED が false の間は読まない（query 0・空を返す＝今と 1 バイト同じ）。書込なし。
import type { SupabaseClient } from "@supabase/supabase-js";
import { mig0213On, mig0214On } from "../rules-0175/flag";
import { dayAdjAppliesOf, minOfBizDay, roundingAtOf, type BreakSpan, type DayAdj, type RoundRule } from "./day-window";

export type DayAdjSource = { rules: RoundRule[]; breaks: { castId: string | null; membershipId: string | null; bizDate: string; startedAt: string; endedAt: string | null }[] };
export const EMPTY_DAY_ADJ: DayAdjSource = { rules: [], breaks: [] };

/** 店の丸めの履歴（全部・小さい）と、営業日 [from, to] の休憩を読む */
export async function loadDayAdjSource(client: SupabaseClient, storeId: string, from: string, to: string): Promise<DayAdjSource> {
  const [rR, bR] = await Promise.all([
    mig0213On() ? client.from("punch_round_rules").select("effective_from, unit, mode").eq("store_id", storeId).order("effective_from") : Promise.resolve({ data: [] as unknown[], error: null }),
    mig0214On() ? client.from("punch_breaks").select("cast_id, membership_id, biz_date, started_at, ended_at").eq("store_id", storeId).gte("biz_date", from).lte("biz_date", to) : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);
  if (rR.error) throw new Error(`punch_round_rules: ${rR.error.message}`);
  if (bR.error) throw new Error(`punch_breaks: ${bR.error.message}`);
  return {
    rules: ((rR.data ?? []) as { effective_from: string; unit: number; mode: RoundRule["mode"] }[]).map((r) => ({ effective_from: String(r.effective_from), unit: Number(r.unit), mode: r.mode })),
    breaks: ((bR.data ?? []) as { cast_id: string | null; membership_id: string | null; biz_date: string; started_at: string; ended_at: string | null }[]).map((b) => ({ castId: b.cast_id, membershipId: b.membership_id, bizDate: String(b.biz_date), startedAt: b.started_at, endedAt: b.ended_at })),
  };
}

/** 人（cast_id か membership_id）と営業日 → その日の丸めと休憩。当てない店（確定シフトどおり・打刻しない）・何も無い日は null（今の数え方のまま） */
export function dayAdjOfSource(src: DayAdjSource, store: { payTimeBasis?: string | null; punchMode?: string | null }): (personId: string, bizDate: string) => DayAdj | null {
  if (!dayAdjAppliesOf(store) || (src.rules.length === 0 && src.breaks.length === 0)) return () => null;
  const byKey = new Map<string, BreakSpan[]>();
  for (const b of src.breaks) {
    const pid = b.castId ?? b.membershipId; if (!pid) continue;
    const k = `${pid}|${b.bizDate}`;
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push({ startMin: minOfBizDay(b.startedAt, b.bizDate), endMin: b.endedAt ? minOfBizDay(b.endedAt, b.bizDate) : null });
  }
  return (personId, bizDate) => {
    const rounding = roundingAtOf(src.rules, bizDate);
    const breaks = byKey.get(`${personId}|${bizDate}`) ?? [];
    return rounding || breaks.length ? { rounding, breaks } : null;
  };
}
