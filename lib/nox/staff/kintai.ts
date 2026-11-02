// ★便 M3 M-23（2026-10-29）: スタッフの日ごとの勤怠＝staff_punches（in／out）を営業日ごとの行（AttendanceDayRow＝キャストの勤怠と同じ部品 KintaiRow）に。
//   対の作り方は lib/nox/staff/pay.ts staffHoursOf と同じ（in→out を順に対・out の無い日は open）＝サマリの出勤日数・実働と一致（suite で突合）。
//   店の修正（punch_corrections）・遅刻／当欠・確定シフトはスタッフに器が無い＝null／false（打刻の修正＝0190／0191 へ）。
import type { AttendanceDayRow } from "../payroll/attendance-sheet";
import { staffHoursOf, type StaffContract, type StaffPunch } from "./pay";

const JST = 9 * 3600_000;
/** 営業日に対する時刻（0〜47 域の HH:MM＝翌日は 24+h） */
export function staffPunchHmOf(bizDate: string, punchedAt: string): string {
  const t = new Date(new Date(punchedAt).getTime() + JST);
  const ymd = t.toISOString().slice(0, 10);
  let h = t.getUTCHours(); const m = t.getUTCMinutes();
  if (ymd > bizDate) h += 24;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
/** ★0192 ★1: 店が付ける日の区分（staff_attendance_days.status）＝出勤／当欠／遅刻／早退 */
export type StaffDayStatus = "present" | "absent" | "late" | "early";
export const STAFF_DAY_STATUS_LABEL: Record<StaffDayStatus, string> = { present: "出勤", absent: "当欠", late: "遅刻", early: "早退" };
export const isStaffDayStatus = (v: unknown): v is StaffDayStatus => v === "present" || v === "absent" || v === "late" || v === "early";
/** ★0192 ★1: 営業日 bizDate の時刻 HH:MM（0〜47 域＝24 以上は翌暦日）→ ISO（JST）。形が違えば null */
export function staffHmToIso(bizDate: string, hm: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim()); if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]); if (h > 47 || mi > 59) return null;
  const base = Date.parse(`${bizDate}T00:00:00+09:00`); if (!Number.isFinite(base)) return null;
  return new Date(base + (h * 60 + mi) * 60_000).toISOString();
}
/** 1 人 1 か月の行（打刻のある営業日＋区分だけの日・日付順）。todayBiz＝営業日の今日（out の無い今日＝勤務中・過去＝退勤記録なし）。
 *  ★0192 ★1: status（営業日→区分）があれば 遅刻／当欠／早退 に反映（当欠は打刻が無くても行を出す） */
export function staffDayRowsOf(punches: readonly StaffPunch[], todayBiz: string, status: Readonly<Record<string, StaffDayStatus>> = {}): AttendanceDayRow[] {
  const byDate = new Map<string, StaffPunch[]>();
  for (const p of punches) (byDate.get(p.biz_date) ?? byDate.set(p.biz_date, []).get(p.biz_date)!).push(p);
  for (const d of Object.keys(status)) if (!byDate.has(d)) byDate.set(d, []);
  const hours = new Map(staffHoursOf(punches).map((d) => [d.bizDate, d]));
  const out: AttendanceDayRow[] = [];
  for (const [bizDate, rows] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...rows].sort((a, b) => Date.parse(a.punched_at) - Date.parse(b.punched_at));
    const firstIn = sorted.find((p) => p.kind === "in") ?? null; const lastOut = [...sorted].reverse().find((p) => p.kind === "out") ?? null;
    const h = hours.get(bizDate); const open = h?.open ?? false;
    out.push({ bizDate, shift: null, inHm: firstIn ? staffPunchHmOf(bizDate, firstIn.punched_at) : null, outHm: lastOut && !open ? staffPunchHmOf(bizDate, lastOut.punched_at) : null, corrections: [],
      late: status[bizDate] === "late", absent: status[bizDate] === "absent", early: status[bizDate] === "early", contactAt: null, hours: Math.round(((h?.minutes ?? 0) / 60) * 10) / 10, basis: "punch", okuri: { n: 0, modes: [] }, note: "",
      missingOut: open && bizDate < todayBiz, missingIn: !firstIn && !!lastOut, working: open && bizDate >= todayBiz, future: bizDate > todayBiz, final: firstIn ? "ok" : null,
      inPunchId: null, outPunchId: null, shiftId: null, cancelled: false }); // 修正・取消はスタッフに器が無い（0190／0191 へ）＝null／false
  }
  return out;
}
/** 見出し行の給与の形＝月給は「月給 ¥n（固定）」・時給は「時給 ¥n × 実働」・日給は「日給 ¥n × 日数」 */
export function staffPayHeadOf(c: StaffContract | null): string {
  if (!c) return "契約未登録";
  const yen = (n: number) => "¥" + n.toLocaleString();
  const kind = (c as { pay_kind?: string | null }).pay_kind ?? (c.hourly > 0 ? "hourly" : c.fixed_allowance > 0 ? "monthly" : "hourly");
  if (kind === "monthly" || kind === "monthly_fixed") return `月給 ${yen((c as { monthly?: number | null }).monthly ?? c.fixed_allowance)}（固定）`;
  if (kind === "daily") return `日給 ${yen((c as { daily?: number | null }).daily ?? c.fixed_allowance)} × 日数`;
  return `時給 ${yen(c.hourly)} × 実働`;
}
/** 時給制だけ日計（時給×実働・円未満切捨）・月給／日給は null（—） */
export function staffDayPayOf(c: StaffContract | null, row: AttendanceDayRow): number | null {
  if (!c) return null;
  const kind = (c as { pay_kind?: string | null }).pay_kind ?? (c.hourly > 0 ? "hourly" : "monthly");
  if (kind !== "hourly") return null;
  return Math.floor(c.hourly * row.hours);
}
