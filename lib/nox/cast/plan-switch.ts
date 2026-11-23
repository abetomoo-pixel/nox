import { errJa } from "@/lib/nox/errors"; // ★裁定467（M-126）: 利用者向けの文言は辞書 1 本
import { mig0205On } from "@/lib/nox/rules-0175/flag"; // ★0205 v2
import { monthLastDayOf } from "@/lib/nox/month";
// ★裁定306-13（2026-09-25）: /casts 詳細「待遇・バック」の待遇プラン切替＝純関数（DB を知らない）。
//   候補＝店の有効な comp_plans・適用開始日の既定＝次の給与期の初日（給与期＝月）・過去日不可・確定済み（finalized／paid）の期は不可・
//   既存 RPC set_cast_plan(p_cast_id, p_plan_id, p_overrides, p_valid_from)＝上書き（overrides_json）はそのまま渡す＝維持。
export const NOTE_PLAN_SWITCH = "上書きは維持されます（個別の上書きは切替後もそのまま効きます）。";

// 適用開始日の既定＝次の給与期の初日は lib/nox/cast/pay-rule.ts の nextPeriodStartOf（0154 D6 と同じ月初）を使う（重複定義しない）

/** ★0205 v2（起票147 案 A）: 切替の日付の下限＝最後に確定した期（finalized／paid）の翌日。確定した回が無ければ null（下限なし＝開いた行の開始日より後なら DB が受ける）。
 *  runs＝店の確定した回（period＝YYYY-MM・period_end＝null なら月末＝set_cast_plan の period_bounds と同じ）。 */
export function planSwitchMinOf(runs: { period: string; period_end: string | null }[]): string | null {
  let last: string | null = null;
  for (const r of runs) {
    const end = r.period_end ?? monthLastDayOf(r.period); // 月末＝lib/nox/month（x13h の柵）
    if (last === null || end > last) last = end;
  }
  if (last === null) return null;
  const d = new Date(`${last}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
/** ★0205 v2: 営業日（YYYY-MM-DD）の月の見出し＝「2026 年 11 月」（日付なしで保存したときに効く月） */
export const bizMonthLabelOf = (bizDate: string): string => `${Number(bizDate.slice(0, 4))} 年 ${Number(bizDate.slice(5, 7))} 月`;
/** ★0205 v2（相談役 11/24 4:10 の ■3）: 日付なしで保存したときに効き始める日＝set_cast_plan 版 2 と同じ決まり。
 *  月の 1 日＝営業日の月の 1 日。開いた行がそれ以降に始まる（プランの変更を予約してある人）＝その行の開始日（その場で上書き）。
 *  それより前＝月の 1 日（前の月の末日で閉じる）。開いた行が無い＝月の 1 日（閉じた行が月にかかるときはその翌日）。 */
export function dateLessFromOf(bizTodayYmd: string, openFrom: string | null | undefined, lastClosedTo?: string | null): string {
  const month1 = `${bizTodayYmd.slice(0, 7)}-01`;
  if (openFrom) return openFrom >= month1 ? openFrom : month1;
  if (lastClosedTo) { const d = new Date(`${lastClosedTo}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); const n = d.toISOString().slice(0, 10); return n > month1 ? n : month1; }
  return month1;
}
/** ★0205 v2: 効く月の文＝今月なら「今月（2026 年 11 月）分から」・先の月なら「2026 年 12 月分から」 */
export function dateLessLabelOf(bizTodayYmd: string, openFrom: string | null | undefined, lastClosedTo?: string | null): string {
  const from = dateLessFromOf(bizTodayYmd, openFrom, lastClosedTo);
  return from.slice(0, 7) === bizTodayYmd.slice(0, 7) ? `今月（${bizMonthLabelOf(from)}）分から` : `${bizMonthLabelOf(from)}分から`;
}

/** 送信前の検査（二層目は RPC）: プラン必須・日付形・過去日不可・確定済みの期は不可（runStatus＝その月の payroll_runs.status・無ければ null）。
 *  ★0205 v2: minFrom を渡したとき（旗 mig0205On）は「今日より前」でなく「最後に確定した期の翌日より前」を断る（null＝下限なし）。 */
export function planSwitchValidate(input: { planId: string | null | undefined; from: string; today: string; runStatus: string | null; minFrom?: string | null }): string | null {
  if (!input.planId) return "待遇プランを選んでください";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from)) return "適用開始日が正しくありません（YYYY-MM-DD）";
  if (input.minFrom !== undefined) {
    if (input.minFrom !== null && input.from < input.minFrom) return `確定済みの給与期には適用できません（${input.minFrom} 以降を指定してください）`;
  } else if (input.from < input.today) return "過去の日付には適用できません（今日以降を指定してください）";
  if (input.runStatus === "finalized" || input.runStatus === "paid") return "確定済みの給与期には適用できません（次の期の初日を指定してください）";
  return null;
}

/** RPC（set_cast_plan）のエラー語の和文化（裁定281 の型・握り潰さない） */
export function planSwitchErrJa(msg: string | null | undefined): string {
  const m = msg ?? "";
  if (m.includes("period finalized")) return "確定済みの給与期には適用できません（確定した期の次の日以降を指定してください）"; // ★0205 v2: set_cast_plan の新しい語（今の DB は出さない）
  if (m.includes("bad valid_from")) return mig0205On() ? "適用開始日は、現在の割当の開始日より後にしてください" : "適用開始日は今日以降で、現在の割当の開始日より後にしてください";
  if (m.includes("plan inactive")) return "そのプランは無効です（マスタで有効にしてください）";
  if (m.includes("bad pay_rule for employment")) return "契約区分と報酬型の組み合わせが合いません";
  if (m.includes("bad overrides")) return "個別の上書きに不正な値があります（マスタで確認してください）";
  if (m.includes("billing locked")) return "ご契約の状態により変更できません";
  if (m.includes("forbidden")) return "権限がありません（owner／manager 自店のみ）";
  return errJa(m || "unknown"); // ★裁定467（M-126）
}
