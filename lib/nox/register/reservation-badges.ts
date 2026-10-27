// ★便 SH-UI-c2 C2-20 ③（2026-10-23）: 予約フォームの担当キャストのバッジ＝「打刻」をやめ、その日の予定を出す（純関数・DB を知らない）。
//   優先＝着卓中（A3）＞出勤予定 20:00（確定シフト）＞休み（attendance off／absent＝薄く）。どれも無い人はバッジなし。
// ★便 M2 M-18（Agoora 確定 10/27）: 状態の色と並び＝待機中（緑）→着卓中（金）→出勤予定（青）→遅刻（赤）→退勤／休み（グレー）。
//   予約の日付が今日のときだけ、今の着卓・打刻（待機中・退勤）・遅刻を使う＝今日以外はその日のシフト（出勤予定）と休みだけ。
import type { PickerBadge } from "@/components/nox/cast-picker";
import { CAST_STATUS_ORDER } from "@/lib/nox/register/cast-picker-order";
export type ReservationBadgeToday = { punchedIn: ReadonlySet<string>; out: ReadonlySet<string>; nowMin: number };
export function castBadgesOf(input: { shifts: readonly { cast_id: string; start_hm: string }[]; attendance: readonly { cast_id: string; status: string }[]; seated: readonly { castId: string; seatName: string | null }[]; today?: ReservationBadgeToday | null }): Map<string, PickerBadge> {
  const m = new Map<string, PickerBadge>();
  const toMin = (hm: string) => { const [h, mm] = hm.split(":").map(Number); return h * 60 + mm; };
  for (const a of input.attendance) if (a.status === "off" || a.status === "absent") m.set(a.cast_id, { label: "休み", tone: "muted", order: CAST_STATUS_ORDER.off });
  for (const s of input.shifts) {
    if (m.has(s.cast_id) && m.get(s.cast_id)!.label !== "休み") continue;
    const late = !!input.today && !input.today.punchedIn.has(s.cast_id) && !input.today.out.has(s.cast_id) && input.today.nowMin > toMin(s.start_hm);
    m.set(s.cast_id, late ? { label: `遅刻（${s.start_hm}〜）`, tone: "bad", order: CAST_STATUS_ORDER.late } : { label: `出勤予定 ${s.start_hm}`, tone: "blue", order: CAST_STATUS_ORDER.planned });
  }
  if (input.today) {
    for (const id of input.today.out) m.set(id, { label: "退勤", tone: "muted", order: CAST_STATUS_ORDER.off });
    for (const id of input.today.punchedIn) m.set(id, { label: "待機中", tone: "ok", order: CAST_STATUS_ORDER.standby });
    for (const x of input.seated) m.set(x.castId, { label: x.seatName ? `着卓中（${x.seatName}）` : "着卓中", tone: "gold2", order: CAST_STATUS_ORDER.seated });
  }
  return m;
}
