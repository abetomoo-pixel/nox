/* 打刻突合の DB 入力持ち上げ（F2a-3・台帳 #20）。
 *
 * DB を知らない純関数。punches（timestamptz イベント列）・shifts・attendance の生行を、
 * matchPunches（punch-match.ts）が食える 0-47 域・分粒度の入力へ変換する。
 * 意味論の正本は分散させない＝営業日境界は biz-date.ts・0-47 域は shift-time.ts を import して使う
 * （本ファイルで時刻計算を再実装しない）。
 *
 * 責務3点:
 *  (1) 営業日帰属＝bizDateOf(punched_at, cutoff)（biz-date.ts が正本）。
 *  (2) 分 floor（#20 S6）＝JST の時:分だけを採り秒以下を切り捨て（19:59:59→"19:59"）。
 *  (3) 0-47 域化（#20 S4）＝帰属営業日の cutoff 起点で「cutoff 未満の時刻」に +24h。
 *      例: cutoff 06:00 の営業日で 01:30 着＝25:30（shift start との比較を単調にする）。
 *      hm2min/min2hm（shift-time.ts）で mmを 'HH:MM' へ戻す。
 *
 * shifts/attendance の start/end/status は既に 'HH:MM' 0-47 域・text 値域（mig0008）なのでそのまま渡す。
 * 出力は matchPunches の入力型（ShiftDay/AttendanceDay/PunchEvent の bizDate 別マップ）。 */

import { bizDateOf } from "./biz-date";
import { hm2min, min2hm } from "./shift-time";
import type {
  PunchEvent,
  ShiftDay,
  AttendanceDay,
  AttendanceStatus,
  DayResolution,
} from "./punch-match";

// DB 生行（RPC/SELECT の素の形。punches はイベント型＝mig0008）
export type PunchRow = { punched_at: string; type: "in" | "out" }; // punched_at: timestamptz ISO
export type ShiftRow = { date: string; start_hm: string; end_hm: string }; // date: 'YYYY-MM-DD'
export type AttendanceRow = { date: string; status: AttendanceStatus };

/** timestamptz を営業日帰属し、その営業日の cutoff 起点 0-47 域の 'HH:MM'（分 floor）へ。 */
export function liftPunchAt(atIso: string, cutoffHm: string): { bizDate: string; hm: string } {
  const bizDate = bizDateOf(atIso, cutoffHm); // (1) 帰属（正本 biz-date.ts）
  // (2) 分 floor: JST の時:分を取り出す（秒以下切り捨て）。UTC+9 を明示適用して Date 依存を避ける。
  const shifted = new Date(new Date(atIso).getTime() + 9 * 3600_000);
  const jh = shifted.getUTCHours();
  const jm = shifted.getUTCMinutes();
  let mm = jh * 60 + jm;
  // (3) 0-47 域化: cutoff 未満は翌日側＝+1440（cutoff ちょうどは当日側＝据え置き）。
  const cutoffMin = hm2min(cutoffHm);
  if (mm < cutoffMin) mm += 1440;
  return { bizDate, hm: min2hm(mm) };
}

/** 実働時間（時間・小数可）。raw の in/out（0-47 域 'HH:MM'）の差から算出。
 *  in 無し or out 欠損（noout）は 0（#20 S8: noout は非金銭化＝時給も付けない・論点3 承認）。
 *  final でなく raw を使う（final は罰金分類・実働は実打刻の時刻差）。 */
export function dayWorkedHours(day: DayResolution): number {
  const inAt =
    day.raw.in.type === "ok" || day.raw.in.type === "late" ? day.raw.in.act : null;
  const outAt =
    day.raw.out.type === "ok" || day.raw.out.type === "early" || day.raw.out.type === "over"
      ? day.raw.out.out
      : null;
  if (!inAt || !outAt) return 0;
  const mins = hm2min(outAt) - hm2min(inAt);
  return mins > 0 ? mins / 60 : 0;
}

/** punches/shifts/attendance 生行 → matchPunches 入力（cutoff は店設定・既定 06:00）。 */
export function buildMatchInput(input: {
  punches: PunchRow[];
  shifts: ShiftRow[];
  attendance: AttendanceRow[];
  cutoffHm: string;
}): {
  shifts: ShiftDay[];
  punches: Record<string, PunchEvent[]>;
  attendance: AttendanceDay[];
} {
  const shifts: ShiftDay[] = input.shifts.map((s) => ({
    bizDate: s.date,
    start: s.start_hm,
    end: s.end_hm,
  }));
  const attendance: AttendanceDay[] = input.attendance.map((a) => ({
    bizDate: a.date,
    status: a.status,
  }));
  const punches: Record<string, PunchEvent[]> = {};
  for (const p of input.punches) {
    const { bizDate, hm } = liftPunchAt(p.punched_at, input.cutoffHm);
    (punches[bizDate] ??= []).push({ kind: p.type, at: hm });
  }
  return { shifts, punches, attendance };
}
