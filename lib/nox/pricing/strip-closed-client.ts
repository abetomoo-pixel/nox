// ★M-144 ③（2026-11-10）: 営業時間で定休日に変えた曜日を料金ルールの曜日から外す（client・set_pricing_rule を全値明示で呼ぶ＝原則7）。
//   対象＝曜日を指定しているルール（dow_mask が null＝毎日のルールは触らない）。曜日が定休日だけのルールは外さずに名前を返す。
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskBitOfBizDow, stripClosedDowsPlan, stripNoticeOf, type StripRule } from "@/lib/nox/pricing/closed-dows";
import { errJa } from "@/lib/nox/errors";

type RuleRow = StripRule & {
  store_id: string; fee_kind: string; seat_kind: string | null; time_from_min: number | null; time_to_min: number | null;
  rank_id: string | null; amount: number; duration_min: number | null; priority: number; is_active: boolean;
  tax_category: string; category_id: string | null; billing_unit: string | null; is_default_ext: boolean | null;
};

const FEE_JA: Record<string, string> = { set: "セット", extension: "延長", dohan: "同伴", vip_charge: "VIPチャージ", shimei: "指名" };

/** 外した結果の 1 行（外すものが無ければ null）。失敗は errors に積む。 */
/** newlyClosed＝営業時間の曜日（0 日 … 6 土）。中で dow_mask の bit（0 月 … 6 日）に変換する。 */
export async function stripClosedDowsFromPricing(supabase: SupabaseClient, storeId: string, newlyClosed: readonly number[]): Promise<{ notice: string | null; errors: string[] }> {
  if (!newlyClosed.length) return { notice: null, errors: [] };
  const { data, error } = await supabase.from("pricing_rules").select("*").eq("store_id", storeId);
  if (error) return { notice: null, errors: [errJa(error.message)] };
  const rows = (data ?? []) as RuleRow[];
  const nameOf = (r: StripRule) => { const x = r as RuleRow; return `${x.name?.trim() || "名前なし"}（${FEE_JA[x.fee_kind] ?? x.fee_kind}）`; };
  const plan = stripClosedDowsPlan(rows, newlyClosed.map(maskBitOfBizDow), nameOf); // ★M-144 直し: 0 日 → bit6
  const errors: string[] = []; const done: string[] = [];
  for (const c of plan.change) {
    const r = rows.find((x) => x.id === c.id)!;
    const { error: e } = await supabase.rpc("set_pricing_rule", {
      p_id: r.id, p_store_id: r.store_id, p_fee_kind: r.fee_kind, p_seat_kind: r.seat_kind,
      p_dow_mask: c.to, p_time_from_min: r.time_from_min, p_time_to_min: r.time_to_min,
      p_rank_id: r.rank_id, p_amount: r.amount, p_duration_min: r.duration_min,
      p_priority: r.priority, p_is_active: r.is_active, p_tax_category: r.tax_category,
      p_category_id: r.category_id, p_billing_unit: r.billing_unit, p_is_default_ext: r.is_default_ext ?? false,
      p_name: r.name,
    });
    if (e) errors.push(`${c.name}: ${errJa(e.message)}`); else done.push(c.name);
  }
  return { notice: stripNoticeOf(done, [], plan.empty), errors };
}
