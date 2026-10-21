// ★便 X13-G W-14（2026-10-21）: 開卓モーダルの見込み＝セット料金と VIP 料金と、税・サービス料込みの合計見込み。DB を知らない純関数。
//   ルールの当て方は pricing_resolve_core（0173）の鏡像＝店・有効・種別・席種（null は全席）・区分（null は全区分）・曜日 mask・時間帯（cutoff 前は +1440）・
//   並びは priority 昇順 → 区分一致を先 → 作成順。権威はサーバ（check_open）＝ここは表示だけ。合計は check-calc の dueBreakdownOf（groupDueFull と同式）。
import { dueBreakdownOf, type DueBreakdown } from "@/lib/nox/check-calc";

export type EstimateRule = {
  id: string; fee_kind: string; amount: number; duration_min: number | null; seat_kind: string | null;
  dow_mask: number | null; time_from_min: number | null; time_to_min: number | null; category_id: string | null;
  billing_unit: string | null; priority: number; created_at?: string | null; name?: string | null; tax_category?: string | null;
};
export type EstimateStore = {
  set_fee: number; set_min: number; time_per: string; service_rate: number; round_unit: number; round_mode: string;
  business_tax_status?: string | null; price_display?: string | null; tax_rounding?: string | null;
};

const hmToMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

/** 営業日の曜日（0=日）と営業日の分（cutoff 前は前日の 24:00 以降＝+1440） */
export function bizClockOf(now: Date, cutoffHm = "06:00"): { dow: number; min: number } {
  const j = new Date(now.getTime() + 9 * 3600 * 1000);
  let min = j.getUTCHours() * 60 + j.getUTCMinutes();
  let dow = j.getUTCDay();
  if (min < hmToMin(cutoffHm)) { min += 1440; dow = (dow + 6) % 7; }
  return { dow, min };
}

/** pricing_resolve_core の鏡像（1 件・無ければ null） */
export function resolveRuleOf(rules: readonly EstimateRule[], q: { feeKind: string; seatKind: string | null; categoryId: string | null; dow: number; min: number; cutoffHm?: string }): EstimateRule | null {
  const cut = hmToMin(q.cutoffHm ?? "06:00");
  const seat = q.seatKind ?? "卓";
  const hit = rules.filter((r) => r.fee_kind === q.feeKind
    && (r.seat_kind === null || r.seat_kind === seat)
    && (r.category_id === null || r.category_id === q.categoryId)
    && (r.dow_mask === null || ((r.dow_mask >> q.dow) & 1) === 1)
    && (r.time_from_min === null || r.time_to_min === null || (
      (r.time_from_min < cut ? r.time_from_min + 1440 : r.time_from_min) <= q.min
      && q.min < (r.time_to_min <= cut ? r.time_to_min + 1440 : r.time_to_min))));
  hit.sort((a, b) => a.priority - b.priority || Number(b.category_id !== null) - Number(a.category_id !== null) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.id.localeCompare(b.id));
  return hit[0] ?? null;
}

export type OpenEstimate = {
  setUnit: number; setQty: number; setLabel: string;
  vip: { amount: number; per: "person" | "table"; qty: number; name: string } | null;
  breakdown: DueBreakdown;
};

/** 見込み＝セット（選んだルール or 自動）× 人数（人ごと）＋ VIP 料金（VIP 席でルールがあるとき・開卓時に 1 回） */
export function openEstimateOf(i: {
  store: EstimateStore; rules: readonly EstimateRule[]; seatKind: string | null; categoryId: string | null; people: number;
  ruleId: string | null; now: Date; cutoffHm?: string;
}): OpenEstimate {
  const clk = bizClockOf(i.now, i.cutoffHm);
  const q = { seatKind: i.seatKind, categoryId: i.categoryId, dow: clk.dow, min: clk.min, cutoffHm: i.cutoffHm };
  const picked = i.ruleId ? i.rules.find((r) => r.id === i.ruleId && r.fee_kind === "set") ?? null : resolveRuleOf(i.rules, { ...q, feeKind: "set" });
  const setUnit = picked ? picked.amount : i.store.set_fee;
  const setPer = (picked?.billing_unit ?? i.store.time_per) === "person" ? "person" : "table";
  const people = Math.max(1, Math.floor(i.people) || 1);
  const setQty = setPer === "person" ? people : 1;
  const vr = resolveRuleOf(i.rules, { ...q, feeKind: "vip_charge" });
  const vipPer = (vr?.billing_unit ?? i.store.time_per) === "person" ? "person" : "table";
  const vip = vr && vr.amount > 0 ? { amount: vr.amount, per: vipPer as "person" | "table", qty: vipPer === "person" ? people : 1, name: "VIP 料金" } : null;
  const lines = [
    { line_total: setUnit * setQty, kind: "charge", tax_category: picked?.tax_category ?? "taxable_10", fee_kind: "set" },
    ...(vip ? [{ line_total: vip.amount * vip.qty, kind: "charge", tax_category: vr?.tax_category ?? "taxable_10", fee_kind: "vip_charge" }] : []),
  ];
  const breakdown = dueBreakdownOf(lines, i.store);
  return { setUnit, setQty, setLabel: setPer === "person" ? "人ごと" : "卓ごと", vip, breakdown };
}

/** 税の表示語（外税＝「（税抜）」・内税＝「（税込）」） */
export const taxMarkOf = (excluded: boolean): string => (excluded ? "（税抜）" : "（税込）");
