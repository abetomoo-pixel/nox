// ★便 D M-103（2026-11-05・Agoora 確定）: 「その日に選ぶ」（per=day・day_rule=pick）の控除は出勤時に聞く＝/mine の出勤ボタンの下とキオスクの出勤にチェック（既定 off・名称と額）。
//   保存の腕は 0196（cast セルフ腕・kiosk_punch の p_day_deductions）＝mig0196On() が false の間は UI を出さない。DB を知らない純関数。
export type DayDedPickRule = { id: string; name: string; amount: number };
/** チェックの状態 → RPC の行（on の行だけ＝既定 off の pick は off の行を送らない） */
export function dayDedPickRowsOf(rules: readonly DayDedPickRule[], on: Readonly<Record<string, boolean>>): { deduction_id: string; enabled: boolean }[] | null {
  const rows = rules.filter((r) => on[r.id]).map((r) => ({ deduction_id: r.id, enabled: true }));
  return rows.length > 0 ? rows : null;
}
export const dayDedPickLabelOf = (r: DayDedPickRule): string => `${r.name}（¥${r.amount.toLocaleString()}）`;
export const DAY_DED_PICK_HEAD = "今日の控除（使ったものにチェック）";

// ★0198（裁定461・M-120・2026-11-07）: 「その日に選ぶ」「その日だけ外す」は店側だけ（店長以上・staff の本人セッション・今日タブの代行）。
//   本人（キオスク PIN 出勤・/mine）は選べず、店が付けた控除を見るだけ＝cast_day_applied_of（0198）の [{id, name, amount}] を 1 行の文に。
export type DayDedApplied = { id: string; name: string; amount: number };
export const DAY_DED_APPLIED_NONE = "今日の控除＝なし";
export const DAY_DED_APPLIED_BY_STORE = "（店が付けました）";
/** 「今日の控除＝ヘアメ代 ¥500・送迎 ¥1,000（店が付けました）」／無ければ「今日の控除＝なし」 */
export function dayDedAppliedTextOf(list: readonly DayDedApplied[]): string {
  if (list.length === 0) return DAY_DED_APPLIED_NONE;
  return `今日の控除＝${list.map((r) => `${r.name} ¥${r.amount.toLocaleString("en-US")}`).join("・")}${DAY_DED_APPLIED_BY_STORE}`;
}
/** 代行の出勤の直後に出すチェック群の見出しと注記（店の人が本人に聞いて付ける・省略可） */
export const DAY_DED_AFTER_HEAD = "今日の控除（本人に聞いて付ける・省略可）";
export const DAY_DED_AFTER_NOTE = "既定どおりの行は外せます。額はキャスト別の上書きを反映しています。";
