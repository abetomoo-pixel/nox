// ★裁定501-8（2026-11-16 Agoora 確定）: シフト無し出勤（打刻の in がある営業日で確定シフトが無い日）の時間＝その営業日の最初の出勤〜最後の退勤（純関数・DB を知らない）。
//   確定シフトのある日の実働（punch-io の dayWorkedHours＝最初の in〜最後の out・休憩は引かない）と同じ読み方。退勤の打刻が無い日（または出勤より前の退勤だけ）は時間を付けない（Map に入れない）。
//   旧＝雇用だけ（裁定431 ⑥）→ 委託も同じ（M-10 の「委託は時給なし」を改める）。
import { bizDateOf } from "../biz-date";
export function noShiftHoursOf(punches: readonly { punched_at: string; type: "in" | "out" }[], noShiftDates: readonly string[], cutoffHm: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of noShiftDates) {
    const ps = punches.filter((p) => bizDateOf(p.punched_at, cutoffHm) === d).map((p) => ({ t: new Date(p.punched_at).getTime(), type: p.type })).sort((a, b) => a.t - b.t);
    const firstIn = ps.find((p) => p.type === "in");
    const lastOut = [...ps].reverse().find((p) => p.type === "out" && firstIn && p.t > firstIn.t);
    if (firstIn && lastOut) out.set(d, (lastOut.t - firstIn.t) / 3600_000);
  }
  return out;
}
