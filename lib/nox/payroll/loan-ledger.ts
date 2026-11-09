// ★M-123（裁定464 付帯①・2026-11-09・0198 のフラグ便）: 貸付台帳（view cast_loans）と「同意未」の印（comp_plans.advance_loan_agreed=false）・返済済の表示。DB を知らない純関数。
//   同意＝キャストの「現在の待遇プラン」（cast_plan の valid_from ≤ 今日 ≤ valid_to）の advance_loan_agreed。プランが無い・列が無い＝同意未。
export type LoanRow = { id: string; cast_id: string; cast_name: string; biz_date: string; amount: number; repaid: number; remaining: number; status: string; ack_method: string | null; note?: string | null };
export type CastPlanRow = { cast_id: string; plan_id: string; valid_from: string | null; valid_to: string | null };

export const LOAN_STATUS_LABEL: Record<string, string> = { open: "未回収", deducted: "返済済", cancelled: "取消" };
export const LOAN_ACK_LABEL: Record<string, string> = { none: "—", manager: "立会い", pin: "PIN" };
export const LOAN_NOT_AGREED = "同意未";
export const LOAN_NOT_AGREED_NOTE = "待遇プランに「前借り（貸付）の取扱いに同意」がありません（発行は止めません・裁定464 仮置き 5）";
export const LOAN_LEDGER_HEAD = "貸付台帳（直近）";

export const loanStatusLabelOf = (status: string | null | undefined): string => LOAN_STATUS_LABEL[status ?? ""] ?? (status ?? "");
export const loanAckLabelOf = (ack: string | null | undefined): string => LOAN_ACK_LABEL[ack ?? "none"] ?? (ack ?? "—");

/** キャスト別の同意（現在のプラン）＝true／false。プランが無いキャストは false */
export function loanAgreedMapOf(plans: readonly CastPlanRow[], agreedByPlan: Readonly<Record<string, boolean | null | undefined>>, today: string): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const p of plans) {
    const inRange = (!p.valid_from || p.valid_from <= today) && (!p.valid_to || p.valid_to >= today);
    if (!inRange) continue;
    if (agreedByPlan[p.plan_id] === true) out[p.cast_id] = true; else if (out[p.cast_id] !== true) out[p.cast_id] = false;
  }
  return out;
}
export const loanAgreedOf = (map: Readonly<Record<string, boolean>>, castId: string): boolean => map[castId] === true;
