// ★便 X13-G W-22（2026-10-21）: /mine「出勤予定」と出勤ノルマの不足（DB を知らない純関数・列は足さない）。
//   出勤予定＝今日以降の自分のシフトを「確定」（shifts.status confirmed）と「確認待ち」（planned／proposed＝店の確認待ち・本人確認待ち、
//   と提出済みの希望 shift_wishes pending の kind work＝まだシフトになっていない日）に分けて日付順。募集中（何も無い日）は出さない。
//   出勤ノルマ＝店が出勤日数の軸を採用し、そのキャストに今月（来月）の出勤ノルマがあるときだけ。
//   出勤済み＝今月の in 打刻の営業日数（ノルマ進捗と同じ）・確定＝今日以降の確定シフトのうち出勤済みでない日・確認待ち＝今日以降の確認待ちのうち前 2 つに無い日。
import { fmtWin } from "@/lib/nox/shift-time";

export type ScheduleShift = { id: string; date: string; start_hm: string; end_hm: string; status: string; wish_id?: string | null };
export type ScheduleWish = { id: string; date: string; start_hm: string | null; end_hm: string | null; status: string; kind?: string | null };
export type ScheduleItem = { id: string; date: string; dow: string; time: string; kind: "fixed" | "pending"; source: "shift" | "wish"; proposed: boolean };
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const dowOf = (ymd: string) => DOW[new Date(`${ymd}T00:00:00Z`).getUTCDay()];

/** 月（'YYYY-MM'）の今日以降の出勤予定＝確定／確認待ち（同じ日に確定があれば確認待ちは出さない） */
export function scheduleOf(i: { shifts: readonly ScheduleShift[]; wishes: readonly ScheduleWish[]; month: string; today: string }): { fixed: ScheduleItem[]; pending: ScheduleItem[] } {
  const inMonth = (d: string) => d.slice(0, 7) === i.month && d >= i.today;
  const fixed: ScheduleItem[] = []; const pending: ScheduleItem[] = [];
  const byDate = new Map<string, ScheduleShift>();
  for (const s of i.shifts) { if (!inMonth(s.date)) continue; const cur = byDate.get(s.date); if (!cur || s.status === "confirmed") byDate.set(s.date, s); }
  for (const s of [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    const it: ScheduleItem = { id: s.id, date: s.date, dow: dowOf(s.date), time: fmtWin(s.start_hm, s.end_hm), kind: s.status === "confirmed" ? "fixed" : "pending", source: "shift", proposed: s.status === "proposed" };
    (it.kind === "fixed" ? fixed : pending).push(it);
  }
  for (const w of i.wishes) {
    if (!inMonth(w.date) || w.status !== "pending" || (w.kind ?? "work") !== "work" || byDate.has(w.date)) continue;
    pending.push({ id: w.id, date: w.date, dow: dowOf(w.date), time: w.start_hm && w.end_hm ? fmtWin(w.start_hm, w.end_hm) : "時間未定", kind: "pending", source: "wish", proposed: false });
  }
  pending.sort((a, b) => a.date.localeCompare(b.date));
  return { fixed, pending };
}

export type DaysNormLine = { target: number; worked: number; fixed: number; pending: number; short: number; shortWithPending: number; label: string; pendingLabel: string | null; achieved: boolean };

/** 出勤ノルマの不足の 1 行（target null／0 は null＝出さない） */
export function daysNormLineOf(i: { target: number | null | undefined; worked: number; fixedDays: number; pendingDays: number }): DaysNormLine | null {
  const target = Math.floor(Number(i.target) || 0);
  if (target <= 0) return null;
  const sum = i.worked + i.fixedDays;
  const short = Math.max(0, target - sum);
  const shortWithPending = Math.max(0, target - sum - i.pendingDays);
  const achieved = short === 0;
  const label = `出勤ノルマ ${target} 日｜出勤済み ${i.worked} 日＋確定 ${i.fixedDays} 日＝${sum} 日｜${achieved ? "ノルマ達成見込み" : `あと ${short} 日不足`}`;
  const pendingLabel = !achieved && i.pendingDays > 0 ? `確認待ち ${i.pendingDays} 日を含めると${shortWithPending === 0 ? "ノルマ達成見込み" : ` あと ${shortWithPending} 日`}` : null;
  return { target, worked: i.worked, fixed: i.fixedDays, pending: i.pendingDays, short, shortWithPending, label, pendingLabel, achieved };
}

/** 月の数え方（出勤済み日の集合＋今日以降の確定／確認待ち＝出勤済みと重ならない日） */
export function daysCountOf(i: { workedDates: ReadonlySet<string>; schedule: { fixed: readonly ScheduleItem[]; pending: readonly ScheduleItem[] } }): { worked: number; fixedDays: number; pendingDays: number } {
  const fixedD = new Set(i.schedule.fixed.map((x) => x.date).filter((d) => !i.workedDates.has(d)));
  const pendD = new Set(i.schedule.pending.map((x) => x.date).filter((d) => !i.workedDates.has(d) && !fixedD.has(d)));
  return { worked: i.workedDates.size, fixedDays: fixedD.size, pendingDays: pendD.size };
}
