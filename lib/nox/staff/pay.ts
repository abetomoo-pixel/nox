// ★0172（裁定356・便 P172・2026-10-16）: スタッフの勤怠・報酬の純関数（DB を知らない）。
//   器＝staff_contracts（契約区分 employee／parttime／contractor・時給・固定手当・税区分 甲／乙・委託の源泉率＝既定 0）・staff_punches（in／out・営業日）。
//   雇用（employee／parttime）＝時給×実働＋固定手当・源泉＝税額表（器なし＝起票113・第 2 期）＝0。
//   委託（contractor）＝時給×実働（時給 0 なら 固定手当＝日額×出勤日数）・源泉率＝T11（税理士）回答待ち＝既定 0＝contracts.withholding_rate が 0 のまま。
//   staff_payroll_runs への確定は器のみ（第 2 期）。丸め＝円未満切捨（floorYen）。

import { floorYen, withholding1021Of } from "../money"; // ★裁定431 ②
import { monthRangeOf } from "../month"; // ★便 X13-H H-9: 暦月の日付は 1 か所で
import { autoWithholdingOf, effectiveWithholdingOf, employeeDeductionLinesOf, WITHHOLDING_KIND_SHORT, type EmployeeDeductionRow, type WithholdingKind } from "../payroll/withholding-kind"; // ★裁定432

export type StaffContractKind = "employee" | "parttime" | "contractor";
/** ★0195（M-80 追記②・2026-11-05）: 名称つきの固定手当（staff_allowances の 1 行＝月額） */
export type StaffAllowance = { name: string; amount: number };
export type StaffContract = {
  membership_id: string;
  contract_kind: StaffContractKind;
  hourly: number;
  fixed_allowance: number;
  tax_class: "甲" | "乙" | null;
  withholding_rate?: number; // %（委託・既定 0＝T11 待ち）★0188（裁定434）: フラグ true では読まない（列は残るが画面から消す＝源泉は区分 withholding_kind で・委託スタッフの既定 none）
  allowances?: readonly StaffAllowance[]; // ★0195（M-80 追記②）: 名称つきの固定手当（staff_allowances・is_active）＝雇用の月の支給に fixed_allowance と合わせて加える（無ければ従来と同値）
};
/** ★0195: 名称つきの固定手当の合計（行が無ければ 0＝従来と同値） */
export const staffAllowanceSumOf = (c: { allowances?: readonly StaffAllowance[] | null }): number => (c.allowances ?? []).reduce((a, x) => a + (x.amount > 0 ? x.amount : 0), 0);
export type StaffAllowanceRow = { membership_id: string; name: string; amount: number };
/** ★0195: staff_allowances の行（RLS で読めた分）を契約に付ける（純関数） */
export function attachStaffAllowances<T extends { membership_id: string }>(contracts: readonly T[], rows: readonly StaffAllowanceRow[] | null | undefined): (T & { allowances: StaffAllowance[] })[] {
  const by = new Map<string, StaffAllowance[]>();
  for (const r of rows ?? []) (by.get(r.membership_id) ?? by.set(r.membership_id, []).get(r.membership_id)!).push({ name: r.name, amount: r.amount });
  return contracts.map((c) => ({ ...c, allowances: by.get(c.membership_id) ?? [] }));
}
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
  /** ★裁定432（opts.kind を渡したときだけ）: 区分・自動額・社員の控除（入れた行だけ） */
  withholdingKind?: WithholdingKind;
  withholdingAuto?: number;
  withholdingOverride?: number;
  employeeDeductions?: { label: string; amount: number; kind: string }[];
  employeeDeductionTotal?: number;
};
/** ★便 X13-H H-12: 委託の源泉率（報酬・料金＝10.21%） */
export const STAFF_CONTRACTOR_RATE = 10.21;
/** 契約の 1 行表示（雇用で時給 0・手当あり＝月給） */
export function staffContractLineOf(c: StaffContract): string {
  const yen = (n: number) => "¥" + n.toLocaleString();
  const head = STAFF_CONTRACT_LABEL[c.contract_kind];
  if (isStaffEmployment(c.contract_kind) && c.hourly === 0 && c.fixed_allowance > 0) return `${head}・月給 ${yen(c.fixed_allowance)}`;
  const allow = c.fixed_allowance + staffAllowanceSumOf(c); // ★0195: 名称つきの行も合わせて 1 つの額
  return `${head}・時給 ${yen(c.hourly)}${allow ? `・手当 ${yen(allow)}` : ""}`;
}
export function staffPayOf(contract: StaffContract, days: readonly StaffDayHours[], opts?: { kind: WithholdingKind; override?: number | null; deductions?: readonly EmployeeDeductionRow[] }): StaffPayResult {
  const minutes = days.reduce((s, d) => s + d.minutes, 0);
  const workDays = days.length;
  const timePay = floorYen((contract.hourly * minutes) / 60);
  const employment = isStaffEmployment(contract.contract_kind);
  const fixed = employment ? contract.fixed_allowance + staffAllowanceSumOf(contract) : contract.hourly > 0 ? 0 : contract.fixed_allowance * workDays; // ★0195: 雇用＝1 本＋名称つきの行（行が無ければ従来と 1 バイト同値）
  const gross = timePay + fixed;
  // ★便 X13-H H-12 ③: 委託＝源泉 10.21%（率が未設定＝0 の契約も 10.21% で見込み）・雇用＝甲欄／乙欄（見込みは源泉 0＝確定時に計算）
  const rate = employment ? 0 : (contract.withholding_rate ?? 0) > 0 ? (contract.withholding_rate ?? 0) : STAFF_CONTRACTOR_RATE;
  const withholding = employment ? 0 : rate === STAFF_CONTRACTOR_RATE ? withholding1021Of(gross) : floorYen((gross * Math.round(rate * 100)) / 10000); // ★裁定431 ②: 10.21% は整数（1021÷10000）
  const withholdingNote = employment ? `給与所得（${contract.tax_class ?? "乙"}欄・見込みは源泉 0）` : `委託（${rate}%）`;
  if (opts) { // ★裁定432（0183 ★4・フラグ配下）: 区分で計算（other_fee＝10.21% 定率・控除なし／manual＝計算しない・控除を手入力／none＝0）・指定額はその期だけ
    const auto = autoWithholdingOf(opts.kind, gross, 0);
    const wh = effectiveWithholdingOf(opts.kind, auto, opts.override);
    const lines = opts.kind === "manual" ? employeeDeductionLinesOf(opts.deductions) : [];
    const ded = lines.reduce((a, l) => a + l.amount, 0);
    const note = opts.kind === "manual" ? (lines.length ? `社員（控除 ${lines.length} 項目）` : "社員（控除 未入力）") : `${WITHHOLDING_KIND_SHORT[opts.kind]}${wh !== auto ? "・指定額" : ""}`;
    return { kind: contract.contract_kind, days: workDays, minutes, timePay, fixed, gross, withholding: wh, net: gross - wh - ded, withholdingNote: note,
      withholdingKind: opts.kind, withholdingAuto: auto, ...(wh !== auto || typeof opts.override === "number" ? { withholdingOverride: wh } : {}), ...(lines.length ? { employeeDeductions: lines, employeeDeductionTotal: ded } : {}) };
  }
  return { kind: contract.contract_kind, days: workDays, minutes, timePay, fixed, gross, withholding, net: gross - withholding, withholdingNote };
}

/** 'YYYY-MM' → 営業日の範囲（暦月・両端） */
export function staffMonthRangeOf(month: string): { from: string; to: string } {
  const r = monthRangeOf(month);
  return { from: r.from, to: r.to };
}
export const hmOf = (minutes: number): string => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
