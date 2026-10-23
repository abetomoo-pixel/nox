// ★追補 2（裁定421 候補・0175 v2 ★24）: スタッフの割引・手数料カット＝店設定 sys_staff_discount（0 承認制＝既定／1 上限内は即時／2 不可）＋staff_discount_cap（円）。
//   即時適用も audit に staff（membership）・理由必須（RPC approval_direct）。上限超えと確定後は承認に回す（approval_request）。キャストは常に不可（裁定420）。
//   RULES_0175_APPLIED=false の間は従来（店長・オーナー＝適用／スタッフ＝申請・手数料の方式は店長・オーナーだけ 3 択）。
import type { PayFeeMode } from "./pay-fee";

export type StaffDiscountLevel = 0 | 1 | 2;
export const STAFF_DISCOUNT_LABEL: Record<StaffDiscountLevel, string> = { 0: "承認制（申請→承認）", 1: "上限内は即時", 2: "不可" };
export function staffDiscountLevelOf(settings: Record<string, unknown> | null | undefined): StaffDiscountLevel {
  const v = settings?.sys_staff_discount;
  return v === 1 || v === 2 ? v : 0;
}
export function staffDiscountCapOf(settings: Record<string, unknown> | null | undefined): number {
  const v = settings?.staff_discount_cap;
  return typeof v === "number" && v > 0 ? Math.trunc(v) : 0;
}
export type DiscountAction = "direct" | "request" | "none";
/** 割引・無料のボタンの出方＝店長・オーナーは常に direct・キャストは常に none・スタッフは段階と上限で（amount＝割引額・無料は小計） */
export function discountActionOf(i: { role: "owner" | "manager" | "staff" | "cast" | string; level: StaffDiscountLevel; amount: number; cap: number; closed?: boolean }): DiscountAction {
  if (i.role === "owner" || i.role === "manager") return "direct";
  if (i.role !== "staff") return "none";
  if (i.level === 2) return "none";
  if (i.level === 1 && !i.closed && i.amount > 0 && i.amount <= i.cap) return "direct";
  return "request";
}
/** 手数料の方式＝店長・オーナー 3 択・スタッフは「上限内は即時」のときだけ 3 択（上限は RPC が見る）・キャストは店の率だけ */
export function feeModesForRoleOf(role: string, level: StaffDiscountLevel): readonly PayFeeMode[] {
  if (role === "owner" || role === "manager") return ["auto", "none", "manual"];
  if (role === "staff" && level === 1) return ["auto", "none", "manual"];
  return ["auto"];
}
/** 日報の内訳行「割引（スタッフ即時）」＝approvals.staff_direct の合計 */
export const staffDirectDiscountOf = (rows: readonly { amount: number; staff_direct?: boolean | null; status?: string | null }[]): number =>
  rows.filter((r) => r.staff_direct === true && (r.status ?? "approved") === "approved").reduce((a, r) => a + r.amount, 0);
