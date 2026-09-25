// ★裁定306-13（2026-09-25）: /casts 詳細「待遇・バック」の待遇プラン切替＝純関数（DB を知らない）。
//   候補＝店の有効な comp_plans・適用開始日の既定＝次の給与期の初日（給与期＝月）・過去日不可・確定済み（finalized／paid）の期は不可・
//   既存 RPC set_cast_plan(p_cast_id, p_plan_id, p_overrides, p_valid_from)＝上書き（overrides_json）はそのまま渡す＝維持。
export const NOTE_PLAN_SWITCH = "上書きは維持されます（個別の上書きは切替後もそのまま効きます）。";

// 適用開始日の既定＝次の給与期の初日は lib/nox/cast/pay-rule.ts の nextPeriodStartOf（0154 D6 と同じ月初）を使う（重複定義しない）

/** 送信前の検査（二層目は RPC）: プラン必須・日付形・過去日不可・確定済みの期は不可（runStatus＝その月の payroll_runs.status・無ければ null） */
export function planSwitchValidate(input: { planId: string | null | undefined; from: string; today: string; runStatus: string | null }): string | null {
  if (!input.planId) return "待遇プランを選んでください";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from)) return "適用開始日が正しくありません（YYYY-MM-DD）";
  if (input.from < input.today) return "過去の日付には適用できません（今日以降を指定してください）";
  if (input.runStatus === "finalized" || input.runStatus === "paid") return "確定済みの給与期には適用できません（次の期の初日を指定してください）";
  return null;
}

/** RPC（set_cast_plan）のエラー語の和文化（裁定281 の型・握り潰さない） */
export function planSwitchErrJa(msg: string | null | undefined): string {
  const m = msg ?? "";
  if (m.includes("bad valid_from")) return "適用開始日は今日以降で、現在の割当の開始日より後にしてください";
  if (m.includes("plan inactive")) return "そのプランは無効です（マスタで有効にしてください）";
  if (m.includes("bad pay_rule for employment")) return "契約区分と報酬型の組み合わせが合いません";
  if (m.includes("bad overrides")) return "個別の上書きに不正な値があります（マスタで確認してください）";
  if (m.includes("billing locked")) return "ご契約の状態により変更できません";
  if (m.includes("forbidden")) return "権限がありません（owner／manager 自店のみ）";
  return `処理できませんでした（コード: ${m || "unknown"}）`;
}
