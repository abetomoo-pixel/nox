// ★裁定326-5（便 M2-1・2026-10-01）: /mine の勤怠時刻＝当日の「出勤 HH:MM／退勤 HH:MM」と当月の勤怠一覧（日付・出勤・退勤・実働）。
//   実働は既存の dayWorkedHours（punch-io＝給与の collect と同じ関数・確定シフトのある日の最初の in〜最後の out）＝新規の時間計算は書かない。
//   in／out の表示時刻は buildMatchInput が営業日に帰属した 0-47 域の 'HH:MM'（翌 2:00 は 26:00＝明細と同じ見え方）。
import { buildMatchInput, dayWorkedHours, type PunchRow, type ShiftRow } from "../punch-io";
import { matchPunches } from "../punch-match";
import { hm2min } from "../shift-time";
import { storeModeHoursOf } from "../shift/punch-mode"; // ★0197 フラグ便（裁定456 の 17）

export type AttendanceDayRow = { bizDate: string; inHm: string | null; outHm: string | null; hours: number; statusJa?: string | null }; // ★0197 フラグ便（裁定456 の 17）: 打刻しない店の行は 当欠／休み／遅刻 の状態を添える

/** stores.settings_json.close_hm（既定 '25:00'＝payroll window と同じ） */
export function closeHmOf(settingsJson: unknown): string {
  const sj = settingsJson && typeof settingsJson === "object" ? (settingsJson as Record<string, unknown>) : {};
  return typeof sj.close_hm === "string" && sj.close_hm ? sj.close_hm : "25:00";
}

/** 当月の打刻＋確定シフト → 営業日ごとの行（新しい日が先・打刻のある日だけ）。hours は dayWorkedHours（確定シフトの無い日・退勤なしは 0） */
export function monthAttendanceRowsOf(input: { punches: PunchRow[]; shifts: ShiftRow[]; cutoffHm: string; closeHm: string }): AttendanceDayRow[] {
  const built = buildMatchInput({ punches: input.punches, shifts: input.shifts, attendance: [], cutoffHm: input.cutoffHm });
  const m = matchPunches({ shifts: built.shifts, punches: built.punches, attendance: [], config: { close: input.closeHm } });
  const rows: AttendanceDayRow[] = [];
  for (const d of m.days) {
    const ev = built.punches[d.bizDate] ?? [];
    if (ev.length === 0) continue;
    const sorted = [...ev].sort((a, b) => hm2min(a.at) - hm2min(b.at));
    const ins = sorted.filter((e) => e.kind === "in"), outs = sorted.filter((e) => e.kind === "out");
    rows.push({ bizDate: d.bizDate, inHm: ins[0]?.at ?? null, outHm: outs.length > 0 ? outs[outs.length - 1].at : null, hours: dayWorkedHours(d) });
  }
  return rows.sort((a, b) => (a.bizDate < b.bizDate ? 1 : a.bizDate > b.bizDate ? -1 : 0));
}

/** ★0197 フラグ便（裁定456 の 17）: 打刻しない店（punch_mode='store'）の当月一覧＝確定シフトの日（今日まで）を出す。出＝シフト開始・退＝シフト終了・実働＝給与と同じ式（storeModeHoursOf＝その日の打刻があれば従来の式・無ければ確定シフトの時間）・
 *  当欠／休みは出退「—」と状態（遅刻は時間を出して「遅刻」を添える）。打刻の行（punchRows＝monthAttendanceRowsOf）がある日はその出退を優先。新しい日が先。 */
export const STORE_MODE_STATUS_JA: Record<string, string> = { absent: "当欠", off: "休み", late: "遅刻" };
export function monthAttendanceRowsStoreOf(input: { shifts: ShiftRow[]; attendance: readonly { date: string; status: string }[]; punchRows: readonly AttendanceDayRow[]; todayBiz: string }): AttendanceDayRow[] {
  const attBy = new Map(input.attendance.map((a) => [a.date, a.status]));
  const punchBy = new Map(input.punchRows.map((r) => [r.bizDate, r]));
  const rows: AttendanceDayRow[] = [];
  const seen = new Set<string>();
  for (const s of input.shifts) {
    if (s.date > input.todayBiz || seen.has(s.date)) continue;
    seen.add(s.date);
    const st = attBy.get(s.date) ?? null;
    const p = punchBy.get(s.date);
    const shiftHours = Math.max(0, (hm2min(s.end_hm) - hm2min(s.start_hm)) / 60);
    const hours = storeModeHoursOf({ rawHours: p?.hours ?? 0, shiftHours, attStatus: st, future: false });
    const offDay = st === "absent" || st === "off";
    rows.push({ bizDate: s.date, inHm: offDay ? null : (p?.inHm ?? s.start_hm), outHm: offDay ? null : (p?.outHm ?? s.end_hm), hours, statusJa: st ? (STORE_MODE_STATUS_JA[st] ?? null) : null });
  }
  return rows.sort((a, b) => (a.bizDate < b.bizDate ? 1 : a.bizDate > b.bizDate ? -1 : 0));
}
export const ATTENDANCE_MONTH_NOTE_STORE = "この店は打刻がありません＝確定シフトの日を表示（出＝開始・退＝終了・実働＝給与と同じ計算・当欠／休みは —）";

/** 実働の表示（給与一覧の hoursCellOf と同じ「Nh」・0 は —） */
export const hoursLabelOf = (hours: number): string => (hours > 0 ? `${Math.round(hours * 10) / 10}h` : "—");

/** 当日の「出勤 HH:MM／退勤 HH:MM」（打刻なしは —） */
export function todayInOutLabelOf(row: Pick<AttendanceDayRow, "inHm" | "outHm"> | null | undefined): string {
  return `出勤 ${row?.inHm ?? "—"}／退勤 ${row?.outHm ?? "—"}`;
}

export const ATTENDANCE_MONTH_NOTE = "実働は確定シフトのある日の出勤〜退勤（給与と同じ計算）。退勤なし・シフトのない日は —";
