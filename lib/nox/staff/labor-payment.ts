// ★M-130（裁定471・2026-11-10）: スタッフ給与の「支払い済み」と月報の経費一覧の純関数（DB を知らない）。
//   支払い記録＝staff_labor_payments（店×月 1 行＝0200）＝額は確定額（staff_labor_confirmed）の合計のスナップショット・事業主負担の社保は含めない。
//   月報の経費一覧＝日報の諸経費（daily_reports.expense の月合計＝手入力）＋支払い記録「給与（スタッフ）」＝**利益には含めない**（損益の人件費は確定額／見込みの 1 本＝二重計上しない）。
export type StaffPayMethod = "cash" | "transfer";
export const STAFF_PAY_METHOD_LABEL: Record<StaffPayMethod, string> = { cash: "現金", transfer: "振込" };
export type StaffLaborPayment = { period: string; paid_on: string; method: StaffPayMethod; amount: number; headcount: number; note: string | null };

/** 「支払い済みにする」を出すか＝店長以上 ∧ 月が確定済み ∧ まだ支払い記録が無い */
export const staffPayMarkableOf = (i: { managerUp: boolean; locked: boolean; paid: boolean }): boolean => i.managerUp && i.locked && !i.paid;
/** 「確定を解除」を出すか＝支払い済みの間は出さない（先に支払い済みを取り消す＝RPC も 'paid period'） */
export const staffUnlockableOf = (i: { locked: boolean; paid: boolean }): boolean => i.locked && !i.paid;
export const STAFF_PAID_UNLOCK_NOTE = "支払い済みの月は確定を解除できません（先に支払い済みを取り消してください）";

export type ExpenseRow = { kind: "daily" | "staff_payroll"; label: string; amount: number; date: string | null; note: string | null; inProfit: boolean };
/** 月報の経費一覧＝日報の諸経費（月合計・利益に含める）＋給与（スタッフ）の支払い記録（利益に含めない） */
export function monthExpenseRowsOf(i: { dailyExpense: number; payment: StaffLaborPayment | null }): ExpenseRow[] {
  const rows: ExpenseRow[] = [{ kind: "daily", label: "諸経費（日報の合計）", amount: Math.max(0, Math.trunc(i.dailyExpense)), date: null, note: null, inProfit: true }];
  if (i.payment) rows.push({ kind: "staff_payroll", label: "給与（スタッフ）", amount: i.payment.amount, date: i.payment.paid_on, note: `${STAFF_PAY_METHOD_LABEL[i.payment.method]}・${i.payment.headcount}人${i.payment.note ? "・" + i.payment.note : ""}`, inProfit: false });
  return rows;
}
/** 月報の利益（参考）＝売上 −（キャストの人件費＋スタッフの人件費）− 利益に含める経費。支払い記録は足さない（裁定471＝二重計上しない） */
export function monthProfitOf(i: { sales: number; castLabor: number; staffLabor: number; expenses: readonly ExpenseRow[] }): number {
  return i.sales - i.castLabor - i.staffLabor - i.expenses.filter((e) => e.inProfit).reduce((a, e) => a + e.amount, 0);
}
export const NOT_IN_PROFIT_MARK = "利益には含めない";
