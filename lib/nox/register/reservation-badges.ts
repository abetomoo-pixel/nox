// ★便 SH-UI-c2 C2-20 ③（2026-10-23）: 予約フォームの担当キャストのバッジ＝「打刻」をやめ、その日の予定を出す（純関数・DB を知らない）。
//   優先＝着卓中（A3）＞出勤予定 20:00（確定シフト）＞休み（attendance off／absent＝薄く）。どれも無い人はバッジなし。
import type { PickerBadge } from "@/components/nox/cast-picker";
export function castBadgesOf(input: { shifts: readonly { cast_id: string; start_hm: string }[]; attendance: readonly { cast_id: string; status: string }[]; seated: readonly { castId: string; seatName: string | null }[] }): Map<string, PickerBadge> {
  const m = new Map<string, PickerBadge>();
  for (const a of input.attendance) if (a.status === "off" || a.status === "absent") m.set(a.cast_id, { label: "休み", tone: "muted" });
  for (const s of input.shifts) if (!m.has(s.cast_id) || m.get(s.cast_id)!.label === "休み") m.set(s.cast_id, { label: `出勤予定 ${s.start_hm}`, tone: "gold2" });
  for (const x of input.seated) m.set(x.castId, { label: x.seatName ? `着卓中（${x.seatName}）` : "着卓中", tone: "gold" });
  return m;
}
