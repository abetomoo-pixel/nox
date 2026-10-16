// ★0172（裁定349・便 P172・2026-10-16・settlement.ts は 0154 の精算調整＝別物）: 店設定 settlement_cycle（精算方式＝源泉の暦日数の単位）・mid_pay（途中払い）の純関数（DB を知らない）。
//   値の集合は 0172 set_store_profile の検証（'bad settlement_cycle'＝monthly／half／weekly／daily・'bad mid_pay'＝none／advance）と同じ。欠損＝既定（monthly／none）。
//   日払いの種別＝daily_pays.kind（settlement＝日次精算・advance＝前払）＝components/nox/daily-pay-form.tsx が選ぶ（既定 advance＝P172 Q-2）。

export type SettlementCycle = "monthly" | "half" | "weekly" | "daily";
export type MidPay = "none" | "advance";
export const SETTLEMENT_CYCLE_OPTIONS: ReadonlyArray<readonly [SettlementCycle, string]> = [
  ["monthly", "月次（暦日数 28〜31）"], ["half", "半月（13〜16）"], ["weekly", "週次（7）"], ["daily", "日次（1）"],
];
export const MID_PAY_OPTIONS: ReadonlyArray<readonly [MidPay, string]> = [["none", "なし"], ["advance", "前払（仮払・控除なし）"]];

export function settlementCycleOf(settings: Record<string, unknown> | null | undefined): SettlementCycle {
  const v = settings?.settlement_cycle;
  return v === "half" || v === "weekly" || v === "daily" ? v : "monthly";
}
export function midPayOf(settings: Record<string, unknown> | null | undefined): MidPay {
  return settings?.mid_pay === "advance" ? "advance" : "none";
}
/** 精算方式ごとの源泉の暦日数（裁定349＝月次 28〜31／半月 13〜16／週次 7／日次 1）。月次・半月は run の期間（period_bounds）で決まる＝ここは表示の注記 */
export function settlementCycleDaysNoteOf(cycle: SettlementCycle): string {
  return cycle === "monthly" ? "暦日数 28〜31 日" : cycle === "half" ? "暦日数 13〜16 日" : cycle === "weekly" ? "7 日" : "1 日";
}

export type DailyPayKind = "settlement" | "advance";
export const DAILY_PAY_KIND_LABEL: Record<DailyPayKind, string> = { settlement: "日払い（日次精算）", advance: "前払（仮払）" };
/** 発行時の控除＝settlement は 1 日分の源泉（RPC と同式）・advance は 0（期の精算で控除） */
export const dailyPayKindDeductsNow = (kind: DailyPayKind): boolean => kind === "settlement";
