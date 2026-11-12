// ★M-188（2026-11-12 Agoora）: シフトのカレンダーで定休日が分からない＝月を開いたときに、その月の定休日を先に出す。
//   キャストは store_business_hours を RLS で読めない（auth_role() <> 'cast'）＝曜日ごとに 1 日ずつ（7 回まで）shift_is_closed_day を呼び、
//   store_special_days（臨時休業 closed／特別営業 open・キャストも自店の行を読める）を重ねる。DB を知らない純関数。曜日は 0＝日（shift_is_closed_day の extract(dow) と同じ）。

import { daysInMonthOf } from "@/lib/nox/month";

/** 'YYYY-MM' の全日（'YYYY-MM-DD'） */
export function monthDaysOf(month: string): string[] {
  const last = daysInMonthOf(month);
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/** 日付の曜日（0＝日〜6＝土） */
export const dowOfYmd = (ymd: string): number => new Date(`${ymd}T00:00:00Z`).getUTCDay();

/** 曜日の定休を問い合わせる代表の日＝曜日ごとに、特別日でない最初の日（無い曜日は問い合わせない） */
export function probeDaysOf(month: string, specialDays: readonly string[]): Map<number, string> {
  const sp = new Set(specialDays);
  const out = new Map<number, string>();
  for (const d of monthDaysOf(month)) { const w = dowOfYmd(d); if (!out.has(w) && !sp.has(d)) out.set(w, d); }
  return out;
}

/** その月の定休日＝特別日（closed は休み・open は営業）が先・無ければ曜日の定休 */
export function closedDaysOfMonth(month: string, closedDows: ReadonlySet<number>, specials: readonly { day: string; kind: string }[]): Set<string> {
  const sp = new Map(specials.map((s) => [s.day, s.kind]));
  const out = new Set<string>();
  for (const d of monthDaysOf(month)) {
    const k = sp.get(d);
    if (k === "closed" || (k !== "open" && closedDows.has(dowOfYmd(d)))) out.add(d);
  }
  return out;
}
