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
