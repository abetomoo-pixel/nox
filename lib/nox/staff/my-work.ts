// ★0201e ★7（2026-11-12）: スタッフ本人の勤怠と日計＝RPC staff_my_work(p_from, p_to) の返り（jsonb）を画面の形に。純関数（DB を知らない）。
//   本人の契約は staff の RLS では読めない＝RPC が本人の分だけ返す。店の端末の本人セッション中は金額を返さない（amounts_hidden）＝画面も金額を出さない。
//   金額は既存の計算（lib/nox/staff/pay.ts の staffPayOf・kintai.ts の staffDayPayOf）をそのまま使う＝お金の式は変えない。
import type { AttendanceDayRow } from "../payroll/attendance-sheet";
import { STAFF_DAY_STATUS_LABEL, isStaffDayStatus, staffDayPayOf, staffDayRowsOf, staffPayHeadOf, type StaffDayStatus } from "./kintai";
import { attachStaffAllowances, hmOf, staffHoursOf, staffPayOf, type StaffAllowanceRow, type StaffContract, type StaffPunch } from "./pay";
import { STAFF_PAY_METHOD_LABEL, type StaffPayMethod } from "./labor-payment";

export const STAFF_MY_WORK_RPC = "staff_my_work";
export const STAFF_MY_WORK_HIDDEN_NOTE = "店の端末では金額を表示しません（自分のスマホで開くと見られます）。";

type Raw = {
  membership_id?: string; amounts_hidden?: boolean;
  contract?: Record<string, unknown> | null;
  punches?: { biz_date: string; kind: "in" | "out"; punched_at: string }[];
  attendance?: { biz_date: string; status: string }[];
  allowances?: { name: string; amount: number }[];
  confirmed?: { period: string; minutes?: number; days?: number; amount?: number; confirmed_at?: string }[];
  paid_periods?: { period: string; paid_on: string | null; method: string | null }[];
};

export type StaffMyWorkDay = AttendanceDayRow & { statusLabel: string | null; dayPay: number | null };
export type StaffMyWorkView = {
  hidden: boolean;
  payHead: string | null;      // 給与の形（金額を隠すときは null）
  rows: StaffMyWorkDay[];
  days: number; minutesLabel: string;
  gross: number | null;        // 見込み（総支給・確定は店）＝金額を隠す・契約なしは null
  confirmed: { days: number; minutesLabel: string; amount: number | null } | null;
  paid: { paidOn: string | null; method: string | null } | null;
};

/** staff_my_work の返り → 画面の形（month＝'YYYY-MM'・todayBiz＝営業日の今日） */
export function staffMyWorkViewOf(raw: unknown, month: string, todayBiz: string): StaffMyWorkView {
  const r = (raw && typeof raw === "object" ? raw : {}) as Raw;
  const mid = typeof r.membership_id === "string" ? r.membership_id : "";
  const hidden = r.amounts_hidden === true;
  const punches: StaffPunch[] = (r.punches ?? []).map((p) => ({ membership_id: mid, biz_date: p.biz_date, kind: p.kind, punched_at: p.punched_at }));
  const status: Record<string, StaffDayStatus> = {};
  for (const a of r.attendance ?? []) if (isStaffDayStatus(a.status) && a.biz_date.startsWith(month)) status[a.biz_date] = a.status;
  const monthPunches = punches.filter((p) => p.biz_date.startsWith(month));
  const contractRaw = !hidden && r.contract && typeof r.contract === "object" ? ({ ...r.contract, membership_id: mid } as unknown as StaffContract) : null;
  const contract = contractRaw ? attachStaffAllowances([contractRaw], (r.allowances ?? []).map((a) => ({ membership_id: mid, name: a.name, amount: a.amount })) as StaffAllowanceRow[])[0] : null;
  const rows = staffDayRowsOf(monthPunches, todayBiz, status).map((d) => ({ ...d, statusLabel: status[d.bizDate] ? STAFF_DAY_STATUS_LABEL[status[d.bizDate]] : null, dayPay: contract ? staffDayPayOf(contract, d) : null }));
  const hours = staffHoursOf(monthPunches);
  const minutes = hours.reduce((s, d) => s + d.minutes, 0);
  const gross = contract ? staffPayOf(contract, hours).gross : null;
  const cf = (r.confirmed ?? []).find((c) => c.period === month) ?? null;
  const pd = (r.paid_periods ?? []).find((p) => p.period === month) ?? null;
  return {
    hidden, payHead: contract ? staffPayHeadOf(contract) : null, rows, days: hours.length, minutesLabel: hmOf(minutes), gross,
    confirmed: cf ? { days: cf.days ?? 0, minutesLabel: hmOf(cf.minutes ?? 0), amount: hidden || typeof cf.amount !== "number" ? null : cf.amount } : null,
    paid: pd && !hidden ? { paidOn: pd.paid_on, method: pd.method ? STAFF_PAY_METHOD_LABEL[pd.method as StaffPayMethod] ?? null : null } : null,
  };
}
