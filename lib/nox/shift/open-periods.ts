// ★夜間便 N5（裁定287-2・2026-09-18）: キャスト側（/mine）の「募集中の期間」の案内文と日付の可否＝純関数（DB を知らない）。
//   入力は RPC shift_open_periods_mine の返り（自店の status='open' の期間・start_date／end_date／wish_deadline・'YYYY-MM-DD' か null）。
//   DB の真実（0103 裁定43）: 提出可能日＝open 期間内のみ（'period_not_open'）。締切は表示のみ＝過ぎていても DB は拒否しない。
//   ここもそれに合わせ、締切超過は「案内」だけで日付の可否は変えない（表示を変えない側の仮決め・夜間便ログに記録）。
import { mdOf } from "./period";

export type OpenPeriod = { start_date: string; end_date: string; wish_deadline: string | null };
export type PeriodNoticeKind = "open" | "past_deadline" | "none";
export type PeriodNotice = { kind: PeriodNoticeKind; text: string };

/** 締切が today を過ぎているか（締切なし＝過ぎていない・締切当日は受付中） */
export const deadlinePassed = (p: OpenPeriod, today: string): boolean => !!p.wish_deadline && p.wish_deadline < today;

/** 期間ごとの案内文「M/D〜M/D のシフト希望を受付中（締切 M/D）」（締切なしは括弧を省く） */
export function periodLineOf(p: OpenPeriod): string {
  const span = `${mdOf(p.start_date)}〜${mdOf(p.end_date)}`;
  return p.wish_deadline ? `${span} のシフト希望を受付中（締切 ${mdOf(p.wish_deadline)}）` : `${span} のシフト希望を受付中`;
}

/**
 * 案内の出し分け:
 *   募集中の期間なし → none「現在、募集中の期間はありません」
 *   受付中（締切前）の期間が 1 つでもある → open（受付中の期間を start 順に「／」で連ねる）
 *   すべて締切超過 → past_deadline「締切を過ぎています（店舗に相談してください）」
 */
export function periodNoticeOf(periods: readonly OpenPeriod[], today: string): PeriodNotice {
  if (periods.length === 0) return { kind: "none", text: "現在、募集中の期間はありません" };
  const accepting = [...periods].filter((p) => !deadlinePassed(p, today)).sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  if (accepting.length === 0) return { kind: "past_deadline", text: "締切を過ぎています（店舗に相談してください）" };
  return { kind: "open", text: accepting.map(periodLineOf).join(" ／ ") };
}

/** その日が募集中の期間（両端含む）に入っているか。期間が無ければ false（DB の fail-closed と同じ） */
export function isDateSelectable(periods: readonly OpenPeriod[], ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  return periods.some((p) => p.start_date <= ymd && ymd <= p.end_date);
}

/** <input type="date"> の min／max（募集中の期間の最小 start・最大 end）。期間が無ければ null */
export function dateBoundsOf(periods: readonly OpenPeriod[]): { min: string; max: string } | null {
  if (periods.length === 0) return null;
  let min = periods[0].start_date, max = periods[0].end_date;
  for (const p of periods) { if (p.start_date < min) min = p.start_date; if (p.end_date > max) max = p.end_date; }
  return { min, max };
}
