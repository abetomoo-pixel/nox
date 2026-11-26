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

/** ★裁定512-12（#240・#241・2026-11-26 Agoora）: 確定（/api/payroll/finalize）が減給の上限（RPC 'sanction cap'）で止まったときの画面の文。
 *  route の文＝「ノルマ未達の減額を精算調整に入れられませんでした（名前）: sanction cap」（route と比べ方は変えない＝表示だけ）。
 *  額は画面の提案の額（プレビューの normProposal.proposed）＝確定時の最新の額と違うことがある。route が名前を返さない形なら名前なしの文。該当しなければ null */
export const FINALIZE_SANCTION_CAP_RE = /^ノルマ未達の減額を精算調整に入れられませんでした（(.+)）: sanction cap$/;
export function finalizeSanctionCapMsgOf(error: string | null | undefined, rows: readonly { castName: string; normProposal?: { proposed: number } | null }[]): string | null {
  const e = error ?? "";
  const cap = NOTE_SANCTION_CAP.replace(/。$/, "");
  const m = FINALIZE_SANCTION_CAP_RE.exec(e);
  if (!m) return /sanction cap/.test(e) ? `確定を止めました: 減給の上限（${cap}）を超える人がいます。給与の画面の「ノルマ未達の提案」と懲戒減給の行を見直してから、もう一度確定してください。` : null;
  const name = m[1];
  const amt = rows.find((r) => r.castName === name)?.normProposal?.proposed;
  return `確定を止めました: ${name} のノルマ未達の懲戒減給${typeof amt === "number" && amt > 0 ? `（画面の提案の額 ¥${amt.toLocaleString("ja-JP")}）` : ""}が減給の上限（${cap}）を超えます。「ノルマ未達の提案」で額を下げるか「除外」にしてから、もう一度確定してください。`;
}
