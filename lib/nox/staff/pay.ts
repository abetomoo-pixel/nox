// ★0172（裁定356・便 P172・2026-10-16）: スタッフの勤怠・報酬の純関数（DB を知らない）。
//   器＝staff_contracts（契約区分 employee／parttime／contractor・時給・固定手当・税区分 甲／乙・委託の源泉率＝既定 0）・staff_punches（in／out・営業日）。
//   雇用（employee／parttime）＝時給×実働＋固定手当・源泉＝税額表（器なし＝起票113・第 2 期）＝0。
//   委託（contractor）＝時給×実働（時給 0 なら 固定手当＝日額×出勤日数）・源泉率＝T11（税理士）回答待ち＝既定 0＝contracts.withholding_rate が 0 のまま。
//   staff_payroll_runs への確定は器のみ（第 2 期）。丸め＝円未満切捨（floorYen）。

import { floorYen } from "../money";

export type StaffContractKind = "employee" | "parttime" | "contractor";
export type StaffContract = {
  membership_id: string;
  contract_kind: StaffContractKind;
  hourly: number;
  fixed_allowance: number;
  tax_class: "甲" | "乙" | null;
  withholding_rate: number; // %（委託・既定 0＝T11 待ち）
};
export type StaffPunch = { membership_id: string; biz_date: string; kind: "in" | "out"; punched_at: string };

export const STAFF_CONTRACT_LABEL: Record<StaffContractKind, string> = { employee: "正社員", parttime: "アルバイト", contractor: "業務委託" };
export const isStaffEmployment = (k: StaffContractKind): boolean => k !== "contractor";

export type StaffDayHours = { bizDate: string; minutes: number; open: boolean };
/** 営業日ごとに in→out を順に対にして実働分数（out の無い日は open＝0 分・out が先に来た行は無視） */
export function staffHoursOf(punches: readonly StaffPunch[]): StaffDayHours[] {
  const byDate = new Map<string, StaffPunch[]>();
  for (const p of punches) (byDate.get(p.biz_date) ?? byDate.set(p.biz_date, []).get(p.biz_date)!).push(p);
  const out: StaffDayHours[] = [];
  for (const [bizDate, rows] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...rows].sort((a, b) => Date.parse(a.punched_at) - Date.parse(b.punched_at));
    let minutes = 0; let inAt: number | null = null; let open = false;
    for (const p of sorted) {
      const ts = Date.parse(p.punched_at);
      if (p.kind === "in") { inAt = ts; continue; }
      if (inAt !== null) { minutes += Math.max(0, Math.floor((ts - inAt) / 60_000)); inAt = null; }
    }
    if (inAt !== null) open = true;
    out.push({ bizDate, minutes, open });
  }
  return out;
}

export type StaffPayResult = {
  kind: StaffContractKind;
  days: number;         // 出勤日数（in のある営業日）
  minutes: number;      // 実働分（対になった分だけ）
  timePay: number;      // 時給×実働（時間単位＝分／60・円未満切捨）
  fixed: number;        // 固定手当（雇用＝期の定額・委託で時給 0 なら 日額×日数）
  gross: number;
  withholding: number;  // 雇用＝税額表（器なし＝0）・委託＝gross×率（既定 0）
  net: number;
  withholdingNote: string;
};
export function staffPayOf(contract: StaffContract, days: readonly StaffDayHours[]): StaffPayResult {
  const minutes = days.reduce((s, d) => s + d.minutes, 0);
  const workDays = days.length;
  const timePay = floorYen((contract.hourly * minutes) / 60);
  const employment = isStaffEmployment(contract.contract_kind);
  const fixed = employment ? contract.fixed_allowance : contract.hourly > 0 ? 0 : contract.fixed_allowance * workDays;
  const gross = timePay + fixed;
  const withholding = employment ? 0 : floorYen((gross * contract.withholding_rate) / 100);
  const withholdingNote = employment
    ? `給与所得（${contract.tax_class ?? "乙"}欄・税額表は次のデータ更新＝源泉 0）`
    : contract.withholding_rate > 0 ? `委託（${contract.withholding_rate}%）` : "委託（源泉率は税理士に確認中のため 0）";
  return { kind: contract.contract_kind, days: workDays, minutes, timePay, fixed, gross, withholding, net: gross - withholding, withholdingNote };
}

/** 'YYYY-MM' → 営業日の範囲（暦月・両端） */
export function staffMonthRangeOf(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}
export const hmOf = (minutes: number): string => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
