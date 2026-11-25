// ★0213（相談役 11/25 の便 E2 の決め）: 丸めが効いた人の明細に注記を 1 行（0 円の extras＝合計に入らない・凍結 breakdown_json に残る）。純関数。
import { PUNCH_ROUND_MODE_OPTIONS } from "../punch/round-form";
export const PUNCH_ROUND_NOTE_KIND = "punch_round_note";
export function punchRoundNoteTextOf(n: { days: number; unit: number; mode: string }): string {
  const dir = PUNCH_ROUND_MODE_OPTIONS.find(([v]) => v === n.mode)?.[1] ?? n.mode;
  return `勤務時間は ${n.unit} 分単位の丸め（${dir}）で数えています（${n.days} 日）`;
}
export const punchRoundNoteExtraOf = (n: { days: number; unit: number; mode: string }): { kind: string; amount: number; label: string } => ({ kind: PUNCH_ROUND_NOTE_KIND, amount: 0, label: punchRoundNoteTextOf(n) });
