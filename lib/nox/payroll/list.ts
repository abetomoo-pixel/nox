// B5 給与 月次一覧の行整形（純関数・DB 非依存・設計書 B5 v1 §4／裁定 B5-2・B5-8）。
//   入力は DB 型に依存しない最小の形（呼び出し側が payroll_runs／payslips／payment_records／audit_logs の select 結果を写す）。
//   金額は payslips の凍結値（breakdown_json.pay.gross＋Σextras＝CSV と同じ定義・net）を**足すだけ**＝再計算しない（golden 6 値不変）。
//   1 run＝1 行（store×period・裁定 B5-2）。並びは period 降順→store_id 昇順で決定的。

export type ListRun = {
  id: string; store_id: string; period: string; status: string;
  finalized_at: string | null; paid_at: string | null; updated_at?: string | null;
};
/** payslips 1 行の写し。gross は CSV と同じ定義（pay.gross ＋ Σextras.amount）を呼び出し側で作る。 */
export type ListPayslip = { run_id: string; cast_id: string; gross: number; net: number };
export type ListPayment = { run_id: string; cast_id: string; paid_amount: number };
/** audit_logs の写し（owner のみ読める・target は 'payroll_runs:<run id>'）。 */
export type ListAudit = { target: string; action: string; at: string; reason: string | null };

export type ListRow = {
  runId: string; storeId: string; period: string; status: string;
  castCount: number; gross: number; net: number;
  paidCount: number; paidTotal: number;
  finalizedAt: string | null; paidAt: string | null; updatedAt: string | null;
  lastAction: { action: string; at: string; reason: string | null } | null;
  csvEnabled: boolean;
};
/** ★#82: paidRuns＝run.status=paid の件数（サマリー「支払済み N 件」はこれ。paidCount＝payment_records 件数は行の支払状況列用に残す）。 */
export type ListKpi = { runs: number; castCount: number; gross: number; net: number; paidCount: number; paidTotal: number; paidRuns: number };

export const PAYROLL_LIST_ACTIONS = ["payroll_finalize", "payroll_reopen", "payroll_mark_paid"] as const;

/** D3 CSV の活性＝確定済み（finalized／paid）のみ（payroll-board exportPayrollCsv と同じ条件）。 */
export function payrollCsvEnabled(status: string): boolean {
  return status === "finalized" || status === "paid";
}
/** 支払済み化の活性＝owner ∧ finalized（裁定 B5-6・RPC payroll_mark_paid は finalized→paid のみ）。 */
export function markPaidEnabled(role: string | null, status: string): boolean {
  return role === "owner" && status === "finalized";
}

export function buildPayrollListRows(
  runs: ListRun[], payslips: ListPayslip[], payments: ListPayment[], audits: ListAudit[] = [],
): ListRow[] {
  const ps = new Map<string, ListPayslip[]>();
  for (const p of payslips) (ps.get(p.run_id) ?? ps.set(p.run_id, []).get(p.run_id)!).push(p);
  const pm = new Map<string, ListPayment[]>();
  for (const p of payments) (pm.get(p.run_id) ?? pm.set(p.run_id, []).get(p.run_id)!).push(p);
  const last = new Map<string, ListAudit>();
  for (const a of audits) {
    if (!(PAYROLL_LIST_ACTIONS as readonly string[]).includes(a.action)) continue;
    const m = /^payroll_runs:(.+)$/.exec(a.target);
    if (!m) continue;
    const cur = last.get(m[1]);
    if (!cur || a.at > cur.at) last.set(m[1], a);
  }
  const rows = runs.map((r): ListRow => {
    const slips = ps.get(r.id) ?? [];
    const pays = pm.get(r.id) ?? [];
    const la = last.get(r.id) ?? null;
    return {
      runId: r.id, storeId: r.store_id, period: r.period, status: r.status,
      castCount: slips.length,
      gross: slips.reduce((a, s) => a + s.gross, 0),
      net: slips.reduce((a, s) => a + s.net, 0),
      paidCount: pays.length,
      paidTotal: pays.reduce((a, p) => a + p.paid_amount, 0),
      finalizedAt: r.finalized_at, paidAt: r.paid_at, updatedAt: r.updated_at ?? null,
      lastAction: la ? { action: la.action, at: la.at, reason: la.reason } : null,
      csvEnabled: payrollCsvEnabled(r.status),
    };
  });
  return rows.sort((a, b) => (a.period === b.period ? (a.storeId < b.storeId ? -1 : a.storeId > b.storeId ? 1 : 0) : a.period < b.period ? 1 : -1));
}

export function sumListKpi(rows: ListRow[]): ListKpi {
  return rows.reduce<ListKpi>((k, r) => ({
    runs: k.runs + 1, castCount: k.castCount + r.castCount, gross: k.gross + r.gross, net: k.net + r.net,
    paidCount: k.paidCount + r.paidCount, paidTotal: k.paidTotal + r.paidTotal,
    paidRuns: k.paidRuns + (r.status === "paid" ? 1 : 0),
  }), { runs: 0, castCount: 0, gross: 0, net: 0, paidCount: 0, paidTotal: 0, paidRuns: 0 });
}
