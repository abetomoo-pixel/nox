// ★裁定324-3／324-4・追補2-2（0159 client 前倒し・便 L-2-2・2026-09-30）: 不就労控除（shortfall）の行を営業日ごとに作る純関数（DB を知らない）。
//   入力＝確定シフト（開始／終了）と実打刻（in／out・営業日基準 'HH:MM'）・営業日ごとの時給（wageDetail の hourly＝保証時給適用中はその額・slide 込み）・遅刻の猶予（裁定268）。
//   出力＝{biz_date, target_shift_id, minutes_late, minutes_early, amount, basis, reason}[]＝route が payroll_shortfall_sync(p_run_id, p_rows) へ渡す形（0159）。
//   金額＝roundYen(hourly × (late + early) ÷ 60)（既存の給与丸め＝roundYen）。遅刻＝lateMinutesOf（猶予あり・開始からの素値）／早上がり＝earlyLeaveMinutesOf（猶予なし）。
//   出さない行: 無断欠勤（確定シフトあり・in なし＝時給部分 0 で支給なし・控除ではない）・不足 0 分・時給 0・確定シフトなし。
//   名称＝雇用は「不就労控除」・委託は「報酬調整（契約）」（291 追補1＝名称のみ出し分け）。基準の shift は target_shift_id・basis は表示用要約（追補2-2）。
import { roundYen } from "../money";
import { earlyLeaveMinutesOf, lateMinutesOf } from "../shift/late";

export type ShortfallDay = {
  bizDate: string;            // 'YYYY-MM-DD'
  shiftId: string;            // 確定シフト id（target_shift_id）
  startHm: string;            // 確定開始 'HH:MM'（0〜47 時）
  endHm: string;              // 確定終了 'HH:MM'
  inHm: string | null;        // 実打刻 in（営業日基準・無ければ null）
  outHm: string | null;       // 実打刻 out（無ければ null＝早上がりは数えない）
};
export type ShortfallInput = {
  days: readonly ShortfallDay[];
  /** 営業日 → その日の時給（wageDetail の hourly＝保証時給適用中はその額） */
  hourlyByDate: Readonly<Record<string, number>>;
  lateGraceMin: number;
  employment?: "委託" | "雇用" | null;
};
export type ShortfallRow = { biz_date: string; target_shift_id: string; minutes_late: number; minutes_early: number; amount: number; basis: string; reason: string };

/** 「遅刻 N 分」「早上がり N 分」「遅刻 N 分・早上がり M 分」 */
export function shortfallBasisOf(minutesLate: number, minutesEarly: number): string {
  const parts: string[] = [];
  if (minutesLate > 0) parts.push(`遅刻 ${minutesLate} 分`);
  if (minutesEarly > 0) parts.push(`早上がり ${minutesEarly} 分`);
  return parts.join("・");
}
/** 雇用＝不就労控除／委託（null 含む）＝報酬調整（契約） */
export const shortfallLabelOf = (employment: "委託" | "雇用" | null | undefined): string => (employment === "雇用" ? "不就労控除" : "報酬調整（契約）");

export function shortfallRowsOf(input: ShortfallInput): ShortfallRow[] {
  const label = shortfallLabelOf(input.employment);
  const out: ShortfallRow[] = [];
  for (const d of input.days) {
    if (!d.shiftId || !d.inHm) continue;                                   // 無断欠勤（in なし）＝支給なし・控除行は出さない
    const late = lateMinutesOf(d.startHm, d.inHm, input.lateGraceMin) ?? 0;
    const early = d.outHm ? (earlyLeaveMinutesOf(d.endHm, d.outHm) ?? 0) : 0;
    if (late <= 0 && early <= 0) continue;
    const hourly = input.hourlyByDate[d.bizDate] ?? 0;
    const amount = roundYen((hourly * (late + early)) / 60);
    if (amount <= 0) continue;
    const basis = shortfallBasisOf(late, early);
    out.push({ biz_date: d.bizDate, target_shift_id: d.shiftId, minutes_late: late, minutes_early: early, amount, basis, reason: `${label}（${basis}）`.slice(0, 200) });
  }
  return out;
}
