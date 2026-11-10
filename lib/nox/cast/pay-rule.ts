// ★0154 D2／D6（2026-09-24・裁定291 追補1 B／294-5／294-9）: 待遇画面の報酬型・契約区分（純関数・DB を知らない）。
import { payRulesFor, type PayRule } from "../pay";

export type Employment = "委託" | "雇用";
/** 契約区分ごとの報酬型のラベル（雇用＝実働時間払い／シフト時間保証／固定給・委託＝時間報酬／1 稼働固定） */
export function payRuleLabelOf(rule: PayRule, employment: Employment | null | undefined): string {
  if (employment === "雇用") return rule === "actual" ? "実働時間払い" : rule === "shift_guarantee" ? "シフト時間保証" : rule === "fixed" ? "固定給" : "（委託向け）1 稼働固定";
  return rule === "actual" ? "時間報酬" : rule === "per_shift" ? "1 稼働固定" : rule === "shift_guarantee" ? "（雇用向け）シフト時間保証" : "（雇用向け）固定給";
}
/** 選べる報酬型＝set_cast_plan の検査と同じ規則（雇用: actual／shift_guarantee／fixed・委託: actual／per_shift） */
export function payRuleOptionsOf(employment: Employment | null | undefined): { value: PayRule; label: string }[] {
  return payRulesFor(employment).map((r) => ({ value: r, label: payRuleLabelOf(r, employment) }));
}
/** 額の欄を出す報酬型（per_shift＝1 稼働の額・fixed＝期の定額） */
export const amountKeyOf = (rule: PayRule): "per_shift_amount" | "fixed_amount" | null => (rule === "per_shift" ? "per_shift_amount" : rule === "fixed" ? "fixed_amount" : null);

/** set_cast_plan へ渡す overrides＝現在の overrides（白名単 8 キー＋報酬型 3 キーだけを残す）に報酬型を重ねる。
 *  guarantee（0151 の保証行）は set_cast_guarantee だけが書く＝含めない。actual は 3 キーとも外す（欠損＝actual）。 */
export const PLAN_OVERRIDE_KEYS = ["base", "honBack", "jonaiBack", "dohanBack", "honBackMode", "honBackRate", "jonaiBackMode", "jonaiBackRate"] as const;
export function overridesWithRule(current: Record<string, unknown>, rule: PayRule, amount: number | null): { ok: true; overrides: Record<string, unknown> } | { ok: false; err: string } {
  const ov: Record<string, unknown> = {};
  for (const k of PLAN_OVERRIDE_KEYS) if (current[k] !== undefined) ov[k] = current[k];
  if (rule !== "actual") {
    ov.pay_rule = rule;
    const key = amountKeyOf(rule);
    if (key) {
      if (amount === null || !Number.isInteger(amount) || amount < 0) return { ok: false, err: "金額は 0 円以上の整数で入力してください" };
      ov[key] = amount;
    }
  }
  return { ok: true, overrides: ov };
}
/** 現在の overrides から報酬型と額を読む（欠損＝actual） */
export function ruleOfOverrides(ov: Record<string, unknown> | null | undefined): { rule: PayRule; amount: number | null } {
  const r = ov?.pay_rule;
  const rule: PayRule = r === "shift_guarantee" || r === "fixed" || r === "per_shift" ? r : "actual";
  const key = amountKeyOf(rule);
  const a = key ? ov?.[key] : null;
  return { rule, amount: typeof a === "number" ? a : null };
}
/** 契約区分の変更＝給与期の初日（翌月 1 日が既定）。'YYYY-MM-DD' */
export function nextPeriodStartOf(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}
/** 労働者性の注記（委託に精算調整または 1 稼働固定を設定したとき）を出すか */
export const laborNoteNeeded = (employment: Employment | null | undefined, rule: PayRule, hasSettlement: boolean): boolean =>
  employment !== "雇用" && (rule === "per_shift" || hasSettlement);
export const NOTE_EMPLOYMENT = "雇用／委託は契約区分であり法的判定ではありません。";
export const NOTE_LABOR = "委託契約でも、時間や出勤の拘束・精算調整（遅刻等の減額）の運用は労働者性の判断要素になり得ます（弁護士の見解）。";

/** ★M-153（2026-11-10）: 待遇プランの切替で持ち込む overrides＝開いた行（valid_to が null）の値を白名単で絞る。
 *  旧＝「今日を含む行」をそのまま送っていた＝保証時給の期間中は保証行（guarantee:true・保証の base）を送り、set_cast_plan の白名単（guarantee 無し）で 'bad overrides'＝「個別の上書きに不正な値があります」。
 *  白名単＝PLAN_OVERRIDE_KEYS 8 キー＋報酬型 3 キー（pay_rule・per_shift_amount・fixed_amount）＋商品バックの固定額 3 キー。開いた行が無ければ {}。 */
export const PLAN_SWITCH_KEYS = [...PLAN_OVERRIDE_KEYS, "pay_rule", "per_shift_amount", "fixed_amount", "productBackFixedHon", "productBackFixedJonai", "productBackFixedFree"] as const;
export function planSwitchOverridesOf(rows: readonly { valid_to: string | null; overrides_json?: unknown }[] | null | undefined): Record<string, unknown> {
  const open = (rows ?? []).find((r) => r.valid_to === null);
  const cur = (open?.overrides_json ?? {}) as Record<string, unknown>;
  const ov: Record<string, unknown> = {};
  for (const k of PLAN_SWITCH_KEYS) if (cur[k] !== undefined && cur[k] !== null) ov[k] = cur[k];
  return ov;
}

/** ★M-153: 切替の適用開始日の既定＝次の期の初日。ただし開いた行の開始がそれ以降なら、その翌日（set_cast_plan の 'bad valid_from' を避ける）。 */
export function planSwitchFromOf(nextPeriodStart: string, rows: readonly { valid_from: string; valid_to: string | null }[] | null | undefined): string {
  const openFrom = (rows ?? []).find((r) => r.valid_to === null)?.valid_from ?? "";
  if (openFrom && openFrom >= nextPeriodStart) { const d = new Date(openFrom + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
  return nextPeriodStart;
}
