// ★裁定432（2026-10-26 確定・Agoora）源泉区分と控除の入れ方＝DB を知らない純関数。器＝0183 ★4（起草のみ・client はフラグ MIG_0183_APPLIED 配下）。
//   区分（人ごと・詳細画面で店長以上が変更）:
//     hostess＝委託キャスト（10.21%・5,000 円×計算期間の暦日数を控除・自動）
//     other_fee＝委託スタッフ（10.21% 定率・控除なし・自動）＝税理士 T11 待ちの仮置き（台帳に記録）
//     manual＝社員（雇用キャスト・雇用スタッフ）＝NOX は税額を計算しない・控除 4 欄を月ごとに手入力
//     none＝源泉なし
//   委託（hostess／other_fee）は自動額の横で「額を指定」＝その期だけ上書き（理由任意・税理士確認済みの印・audit に元額と指定額）。
import { withholding1021Of } from "../money";

export type WithholdingKind = "hostess" | "other_fee" | "manual" | "none";
export const WITHHOLDING_KINDS: readonly WithholdingKind[] = ["hostess", "other_fee", "manual", "none"];
export const WITHHOLDING_KIND_LABEL: Record<WithholdingKind, string> = {
  hostess: "ホステス報酬（10.21%・5,000 円×日数を控除）",
  other_fee: "報酬・料金（10.21% 定率）",
  manual: "社員（控除を手入力）",
  none: "源泉なし",
};
export const WITHHOLDING_KIND_SHORT: Record<WithholdingKind, string> = { hostess: "ホステス報酬", other_fee: "報酬・料金", manual: "社員", none: "なし" };
/** 画面注記（④） */
export const WITHHOLDING_ADVICE_NOTE = "区分と額は顧問税理士・社労士にご確認ください";
/** other_fee の仮置き（台帳） */
export const OTHER_FEE_PROVISIONAL_NOTE = "報酬・料金の 10.21% 定率は税理士確認（T11）待ちの仮置きです";

export const isWithholdingKind = (v: unknown): v is WithholdingKind => typeof v === "string" && (WITHHOLDING_KINDS as readonly string[]).includes(v);
/** 既定の区分＝cast: 委託→hostess・雇用→manual／staff: contractor→other_fee・他→manual（SQL の null の意味と同じ） */
export function defaultWithholdingKindOf(s: { subject: "cast"; taxMode: string | null | undefined } | { subject: "staff"; contractKind: string | null | undefined }): WithholdingKind {
  if (s.subject === "cast") return s.taxMode === "雇用" ? "manual" : "hostess";
  return s.contractKind === "contractor" ? "other_fee" : "manual";
}
/** 保存値（null＝既定）→ 実際の区分 */
export const withholdingKindOf = (stored: string | null | undefined, fallback: WithholdingKind): WithholdingKind => (isWithholdingKind(stored) ? stored : fallback);
/** 委託（自動で計算する区分） */
export const isAutoWithholdingKind = (k: WithholdingKind): boolean => k === "hostess" || k === "other_fee";

/** 自動額＝hostess: floor((課税額 − 5,000×暦日数)×1021÷10000)・other_fee: floor(課税額×1021÷10000)・manual／none: 0 */
export function autoWithholdingOf(kind: WithholdingKind, taxable: number, periodDays: number): number {
  if (kind === "hostess") return withholding1021Of(Math.max(0, taxable - 5000 * Math.max(0, Math.trunc(periodDays))));
  if (kind === "other_fee") return withholding1021Of(Math.max(0, taxable));
  return 0;
}
/** 指定額があればそれ（委託だけ・0 以上の整数）・無ければ自動額 */
export function effectiveWithholdingOf(kind: WithholdingKind, auto: number, override: number | null | undefined): number {
  if (!isAutoWithholdingKind(kind)) return 0;
  return typeof override === "number" && Number.isFinite(override) && override >= 0 ? Math.trunc(override) : auto;
}

// ── 社員の控除（③） ──
export type EmployeeDeductionKind = "social_insurance" | "income_tax" | "resident_tax" | "other";
export const EMPLOYEE_DEDUCTION_KINDS: readonly EmployeeDeductionKind[] = ["social_insurance", "income_tax", "resident_tax", "other"];
export const EMPLOYEE_DEDUCTION_LABEL: Record<EmployeeDeductionKind, string> = { social_insurance: "社会保険料", income_tax: "源泉所得税", resident_tax: "住民税", other: "その他" };
export type EmployeeDeductionRow = { kind: EmployeeDeductionKind; name?: string | null; amount: number };
/** 表示名＝その他は名前（無ければ「その他」） */
export const employeeDeductionLabelOf = (r: EmployeeDeductionRow): string => (r.kind === "other" ? (r.name?.trim() || "その他") : EMPLOYEE_DEDUCTION_LABEL[r.kind]);
/** 入れた分だけ（0 以下・不正は除く）＝明細 PDF・CSV・/mine に出す行 */
export function employeeDeductionLinesOf(rows: readonly EmployeeDeductionRow[] | null | undefined): { label: string; amount: number; kind: EmployeeDeductionKind }[] {
  return (rows ?? []).filter((r) => (EMPLOYEE_DEDUCTION_KINDS as readonly string[]).includes(r.kind) && Number.isFinite(r.amount) && r.amount > 0)
    .map((r) => ({ label: employeeDeductionLabelOf(r), amount: Math.trunc(r.amount), kind: r.kind }));
}
export const employeeDeductionsTotalOf = (rows: readonly EmployeeDeductionRow[] | null | undefined): number => employeeDeductionLinesOf(rows).reduce((s, r) => s + r.amount, 0);
/** 入力欄の初期形＝社会保険料／源泉所得税／住民税（各 1 行・空欄）＋その他（入っている分） */
export function employeeDeductionFormOf(rows: readonly EmployeeDeductionRow[] | null | undefined): { kind: EmployeeDeductionKind; name: string; amount: string }[] {
  const base = (["social_insurance", "income_tax", "resident_tax"] as const).map((k) => {
    const hit = (rows ?? []).find((r) => r.kind === k);
    return { kind: k as EmployeeDeductionKind, name: "", amount: hit && hit.amount > 0 ? String(hit.amount) : "" };
  });
  const others = (rows ?? []).filter((r) => r.kind === "other" && r.amount > 0).map((r) => ({ kind: "other" as EmployeeDeductionKind, name: r.name ?? "", amount: String(r.amount) }));
  return [...base, ...others];
}
/** 入力欄→保存する行（空欄＝0＝保存しない・金額は 0〜999,999,999 の整数・名前は 40 字） */
export function employeeDeductionRowsOfForm(form: readonly { kind: EmployeeDeductionKind; name: string; amount: string }[]): { rows: EmployeeDeductionRow[]; error: string | null } {
  const rows: EmployeeDeductionRow[] = [];
  for (const f of form) {
    const t = f.amount.replace(/[,，\s円¥]/g, "");
    if (t === "") continue;
    if (!/^[0-9]{1,9}$/.test(t)) return { rows: [], error: `${f.kind === "other" ? (f.name || "その他") : EMPLOYEE_DEDUCTION_LABEL[f.kind]}の金額は 0 以上の整数で入力してください` };
    const amount = Number(t);
    if (amount === 0) continue;
    rows.push({ kind: f.kind, name: f.kind === "other" ? f.name.trim().slice(0, 40) || null : null, amount });
  }
  return { rows, error: null };
}
/** 「前月と同じ」＝前期の行をそのまま（金額 0 は除く） */
export const copyPrevDeductionsOf = (prev: readonly EmployeeDeductionRow[] | null | undefined): EmployeeDeductionRow[] => employeeDeductionLinesOf(prev).map((r) => ({ kind: r.kind, name: r.kind === "other" ? r.label : null, amount: r.amount }));
/** 'YYYY-MM' の前月 */
export function prevPeriodOf(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
/** 確定前の確認（止めない）＝社員（manual）で控除が 1 行も無い人の数 */
export function missingEmployeeDeductionsOf(subjects: readonly { kind: WithholdingKind; rows: readonly EmployeeDeductionRow[] | null | undefined }[]): { count: number; message: string | null } {
  const count = subjects.filter((s) => s.kind === "manual" && employeeDeductionLinesOf(s.rows).length === 0).length;
  return { count, message: count > 0 ? `社員 ${count} 名の控除が未入力です` : null };
}
/** 指定額の 1 行（給与画面）＝「自動 ¥12,345 → 指定 ¥10,000（税理士確認済み）」 */
export function overrideLineOf(auto: number, amount: number | null | undefined, confirmed: boolean | null | undefined): string | null {
  if (typeof amount !== "number") return null;
  return `自動 ¥${auto.toLocaleString("en-US")} → 指定 ¥${amount.toLocaleString("en-US")}${confirmed ? "（税理士確認済み）" : ""}`;
}
