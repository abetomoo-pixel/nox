// ★0154 D5（2026-09-24・裁定293-3／294-6／295-2／295-3）: 懲戒減給（雇用のみ・労基法 91 条）の純関数（DB を知らない）。
//   登録＝payroll_adjustment_add(source='sanction'・mode 'fixed'・basis＝就業規則の根拠・当期 draft run)。上限は RPC が検査（'sanction cap'）。
export const NOTE_SANCTION_CAP = "1 件は平均賃金の半額まで・当期の合計は賃金総額の 1/10 まで（労基法 91 条）。";
export const NOTE_SANCTION_LEGAL = "上限内でも適法とは限りません（就業規則の根拠・懲戒事由の相当性・手続が必要です）。";
export const NOTE_ESTIMATED = "（推計基底）";

/** 引数の組み立て＝就業規則根拠のチェック必須・根拠の文 1〜200 字・額は 1 円以上の整数・理由必須。estimated＝当 run の payslip が無い（推計基底）ときは理由に「（推計基底）」を付す */
export function sanctionArgsOf(input: { runId: string; castId: string; amount: number; reason: string; basisChecked: boolean; basis: string; estimated: boolean }): { ok: true; args: Record<string, unknown>; reason: string } | { ok: false; err: string } {
  if (!input.basisChecked) return { ok: false, err: "就業規則の根拠を確認したチェックが必要です" };
  const basis = input.basis.trim();
  if (basis.length === 0 || basis.length > 200) return { ok: false, err: "根拠（就業規則の条項）を 1〜200 字で入力してください" };
  if (!Number.isInteger(input.amount) || input.amount <= 0) return { ok: false, err: "額は 1 円以上の整数で入力してください" };
  const r0 = input.reason.trim();
  if (r0.length === 0) return { ok: false, err: "理由を入力してください" };
  const reason = (input.estimated && !r0.endsWith(NOTE_ESTIMATED) ? r0 + NOTE_ESTIMATED : r0).slice(0, 200);
  return { ok: true, reason, args: {
    p_run_id: input.runId, p_cast_id: input.castId, p_mode: "fixed", p_amount: input.amount, p_rate_bp: null,
    p_before_withholding: true, p_show_detail: true, p_reason: reason,
    p_source: "sanction", p_basis: basis, p_target_shift_id: null,
  } };
}

/** RPC の英語→和文（sanction 専用の 3 語・他は rpcErrJa） */
export function sanctionErrJa(msg: string): string | null {
  if (/^sanction cap$/.test(msg)) return "上限を超えています（" + NOTE_SANCTION_CAP + "）";
  if (/^no basis for average wage$/.test(msg)) return "確定済みの給与が無いため平均賃金を計算できません（懲戒減給は登録できません）";
  if (/^bad source for employment$/.test(msg)) return "懲戒減給は雇用キャストにのみ登録できます";
  return null;
}
