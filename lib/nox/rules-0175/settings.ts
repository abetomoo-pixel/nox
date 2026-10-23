// ★便 P175-prep P-3（0175 v2 ★3／★11・裁定404／405／409／412 追補／418）: 店設定の新キーと、報酬の軸をプラン単位で読む純関数。
//   フラグ false のとき UI は出ない・読み手は従来値（store の軸・ドリンク本数バック ON・売上小計＝due・月払い）を返す。
import type { StoreSettings } from "@/lib/nox/store-systems";
import { rewardAxisOf, type RewardAxis } from "@/lib/nox/store-systems";

export const STORE_KEYS_0175 = {
  wageCutRule: "sys_wage_cut_rule",
  drinkCountBack: "sys_drink_count_back",
  salesSubtotalMode: "sales_subtotal_mode",
  salesSubtotalIncludesShimei: "sales_subtotal_includes_shimei",
  weekCloseDow: "settlement_week_close_dow",
  payDaysAfter: "settlement_pay_days_after",
  payDiscountRates: "pay_discount_rates",
  bonusTierMode: "bonus_tier_mode",
  salesSplit: "sales_split",
  ptRulesDefault: "pt_rules_default",
  dailyPayCapTiers: "daily_pay_cap_tiers",
} as const;

export const SALES_SUBTOTAL_MODE_LABEL = { due: "会計額（サ料込・手数料除く）＝今まで", pre_tax_service: "税サ前・割引前（セット料金を含む）" } as const;
export const SALES_SPLIT_LABEL = { prorate: "伝票ごとの分配率", equal: "指名した全員で等分" } as const;
export const BONUS_TIER_MODE_LABEL = { max: "到達した最上段のみ", sum: "到達した段をすべて合計" } as const;
export const DOW_LABEL = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** ドリンクバック（本数）＝既定 ON（CANON 型は OFF＝設定項目と「誰のドリンクか」を隠し、ドリンクは小計の一部として指名種別の率で返る） */
export const drinkCountBackOn = (s: StoreSettings): boolean => s?.[STORE_KEYS_0175.drinkCountBack] !== false;
export const salesSubtotalModeOf = (s: StoreSettings): keyof typeof SALES_SUBTOTAL_MODE_LABEL => (s?.[STORE_KEYS_0175.salesSubtotalMode] === "pre_tax_service" ? "pre_tax_service" : "due");
export const salesSubtotalIncludesShimeiOf = (s: StoreSettings): boolean => s?.[STORE_KEYS_0175.salesSubtotalIncludesShimei] !== false;
export const salesSplitOf = (s: StoreSettings): keyof typeof SALES_SPLIT_LABEL => (s?.[STORE_KEYS_0175.salesSplit] === "equal" ? "equal" : "prorate");
export const bonusTierModeOf = (s: StoreSettings): keyof typeof BONUS_TIER_MODE_LABEL => (s?.[STORE_KEYS_0175.bonusTierMode] === "sum" ? "sum" : "max");

/** 支払サイクル（0172 settlement_cycle＋v2 の週払いの締日・支払日）。weekly のとき締日（曜日）と n 日後 */
export type PayCycle = { cycle: "monthly" | "half" | "weekly" | "daily"; weekCloseDow: number | null; payDaysAfter: number | null; payDay: number | null };
export function payCycleOf(s: StoreSettings, payDayColumn: number | null | undefined): PayCycle {
  const c = s?.settlement_cycle; const cycle: PayCycle["cycle"] = c === "half" || c === "weekly" || c === "daily" ? c : "monthly";
  const wcd = s?.[STORE_KEYS_0175.weekCloseDow]; const pda = s?.[STORE_KEYS_0175.payDaysAfter];
  return { cycle, weekCloseDow: typeof wcd === "number" ? wcd : null, payDaysAfter: typeof pda === "number" ? pda : null, payDay: payDayColumn ?? null };
}
/** 週払いの文＝「毎週 日曜締め・3 日後払い」。monthly は「毎月 25 日払い」 */
export function payCycleTextOf(c: PayCycle): string {
  if (c.cycle === "weekly") return `毎週 ${c.weekCloseDow !== null ? DOW_LABEL[c.weekCloseDow] + "曜" : "—"}締め・${c.payDaysAfter !== null ? `${c.payDaysAfter} 日後` : "—"}払い`;
  if (c.cycle === "half") return `半月ごと（1〜15 日／16〜末）・${c.payDay !== null ? `${c.payDay} 日払い` : "—"}`;
  if (c.cycle === "daily") return "日払い（日次精算）";
  return `毎月${c.payDay !== null ? ` ${c.payDay} 日払い` : ""}`;
}

/** ★裁定412 追補（⑱）: 報酬の軸＝プランの reward_axis（sales／pt／pay_rate）が null なら店の軸（従来）＝互換 */
export type PlanRewardAxis = RewardAxis | "pay_rate";
export function planRewardAxisOf(plan: { reward_axis?: string | null } | null | undefined, store: StoreSettings): PlanRewardAxis {
  const a = plan?.reward_axis;
  if (a === "pay_rate") return "pay_rate";
  if (a === "pt") return "pts";
  if (a === "sales") return "sales";
  return rewardAxisOf(store);
}
export const PLAN_REWARD_AXIS_LABEL: Record<PlanRewardAxis, string> = { sales: "売上（円）", pts: "ポイント（pt）", pay_rate: "報酬率（時給分 ÷ 売上小計）" };
/** プランの軸ラジオ→comp_plan_ext_set の patch（店の軸に戻す＝null） */
export const planRewardAxisPatchOf = (axis: PlanRewardAxis | null): { reward_axis: "sales" | "pt" | "pay_rate" | null } => ({ reward_axis: axis === null ? null : axis === "pts" ? "pt" : axis });

/** 新規店の税既定＝外税（0175 v2 で DB の既定も tax_excluded・client の初期値も揃える） */
export const NEW_STORE_PRICE_DISPLAY_0175 = "tax_excluded" as const;
