// D3 給与明細CSV の出力（B5 で payroll-board から切り出し＝月次一覧と明細画面の 2 か所から同じ関数を呼ぶ）。
//   確定済み run の payslips を owner/manager 直読み（RLS）して client Blob（BOM UTF-8）で保存。
//   機微（口座/マイナンバー/back 内訳生値）は含めない＝合算のみ。tax-report（支払調書）とは別物。
//   ★列定義・合算式は lib/nox/payroll/csv.ts（verify:nox-payroll-csv 済）のまま＝本ファイルは読取と Blob だけ。
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPayrollCsv, type PayrollCsvRow, type PayrollCsvPay } from "@/lib/nox/payroll/csv";

type BreakdownJson = { pay: PayrollCsvPay; extras?: { amount: number }[]; cast_name?: string };
// 明細に出す名前の解決＝凍結名 → casts の現在名 → "(不明)" の3段。
//   ★確定後に改名しても発行済み明細の表示名は変わらない（凍結名が最優先）。cast_name を持たない旧 payslip は現在名（後方互換）。
export const slipCastName = (bj: unknown, current: string | undefined): string =>
  (bj as { cast_name?: string } | null)?.cast_name ?? current ?? "(不明)";

/** 確定済み run（finalized／paid）の給与明細CSVを保存する。戻り値＝画面へ出すメッセージ。 */
export async function exportPayrollCsvForRun(supabase: SupabaseClient, runId: string, storeName: string, period: string): Promise<string> {
  try {
    const [{ data: ps }, { data: prs }] = await Promise.all([
      supabase.from("payslips").select("cast_id, period, net, breakdown_json").eq("run_id", runId),
      supabase.from("payment_records").select("cast_id, paid_amount").eq("run_id", runId),
    ]);
    const slips = (ps ?? []) as { cast_id: string; period: string; net: number; breakdown_json: BreakdownJson }[];
    if (slips.length === 0) return "この期間に給与明細がありません（確定済みの run が空です）。";
    const castIds = slips.map((s) => s.cast_id);
    const [{ data: cs }, { data: tp }] = await Promise.all([
      supabase.from("casts").select("id, name").in("id", castIds),
      supabase.from("cast_tax_profiles").select("cast_id, mode").in("cast_id", castIds),
    ]);
    const nameOf = new Map((cs ?? []).map((c) => [c.id as string, c.name as string]));
    const modeOf = new Map((tp ?? []).map((r) => [r.cast_id as string, r.mode as string]));
    const paidOf = new Map<string, number>();
    for (const r of (prs ?? []) as { cast_id: string; paid_amount: number }[]) {
      paidOf.set(r.cast_id, (paidOf.get(r.cast_id) ?? 0) + r.paid_amount);
    }
    const csvRows: PayrollCsvRow[] = slips
      .slice()
      .sort((a, b) => (nameOf.get(a.cast_id) ?? "").localeCompare(nameOf.get(b.cast_id) ?? "", "ja"))
      .map((s) => ({
        castName: slipCastName(s.breakdown_json, nameOf.get(s.cast_id)),
        taxMode: modeOf.get(s.cast_id) ?? "—",
        period: s.period,
        pay: s.breakdown_json.pay,
        extrasTotal: (s.breakdown_json.extras ?? []).reduce((sum, e) => sum + (e.amount ?? 0), 0),
        net: s.net,
        paidTotal: paidOf.get(s.cast_id) ?? 0,
      }));
    const csv = buildPayrollCsv(csvRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `給与明細_${storeName}_${period}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    return `給与明細CSVを出力しました（${csvRows.length} 名分）。`;
  } catch (e) {
    return `出力に失敗: ${(e as Error).message}`;
  }
}
