// ★便 ON-3（2026-10-26・0176 ★5 (a)）: 期間ごとの曜日別必要人数（shift_period_needs・period × dow・無い曜日は店の staffing_needs）の純関数。
//   保存＝shift_period_needs_set（全置換・空の曜日は行を送らない＝店の既定に従う）。計算＝dayStat が periodNeedRequiredOf を先に見る（行があれば終日 1 バンドで置換）。
export type PeriodNeedRow = { period_id: string; dow: number; required: number };
export type PeriodLike = { id: string; start_date: string; end_date: string };

const dowOf = (ymd: string): number => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

/** その日を含む期間（複数なら開始日の遅い方＝重なりは RPC が拒むので通常 1 件） */
export function periodOfDateOf(ymd: string, periods: readonly PeriodLike[]): PeriodLike | null {
  const hit = periods.filter((p) => p.start_date <= ymd && ymd <= p.end_date).sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  return hit[0] ?? null;
}
/** 期間の行があればその必要人数・無ければ null（＝店の staffing_needs に従う） */
export function periodNeedRequiredOf(ymd: string, periods: readonly PeriodLike[], rows: readonly PeriodNeedRow[]): number | null {
  const p = periodOfDateOf(ymd, periods);
  if (!p) return null;
  const r = rows.find((x) => x.period_id === p.id && x.dow === dowOf(ymd));
  return r ? r.required : null;
}
/** フォーム＝日〜土の 7 欄（'' ＝店の既定） */
export type PeriodNeedsForm = string[];
export const emptyPeriodNeedsForm = (): PeriodNeedsForm => ["", "", "", "", "", "", ""];
export function periodNeedsFormOf(rows: readonly PeriodNeedRow[], periodId: string | null): PeriodNeedsForm {
  const f = emptyPeriodNeedsForm();
  if (!periodId) return f;
  for (const r of rows) if (r.period_id === periodId && r.dow >= 0 && r.dow <= 6) f[r.dow] = String(r.required);
  return f;
}
export function periodNeedsErrorOf(form: PeriodNeedsForm): string | null {
  for (let dow = 0; dow < 7; dow++) {
    const s = (form[dow] ?? "").trim();
    if (s === "") continue;
    if (!/^\d{1,2}$/.test(s) || Number(s) > 99) return "必要人数は 0〜99 の整数で入力してください（空欄＝店の既定）";
  }
  return null;
}
/** RPC の p_rows（空欄は送らない） */
export function periodNeedRowsOf(form: PeriodNeedsForm): { dow: number; required: number }[] {
  const out: { dow: number; required: number }[] = [];
  for (let dow = 0; dow < 7; dow++) { const s = (form[dow] ?? "").trim(); if (s !== "") out.push({ dow, required: Number(s) }); }
  return out;
}
export const PERIOD_NEEDS_NOTE = "この期間だけの必要人数（空欄の曜日は店の既定＝営業時間・定休日の設定）。";
/** 期間カードの短い表示＝「必要 月3・金4・土5」／なし */
export function periodNeedsChipOf(rows: readonly PeriodNeedRow[], periodId: string): string | null {
  const DOW = ["日", "月", "火", "水", "木", "金", "土"];
  const mine = rows.filter((r) => r.period_id === periodId).sort((a, b) => a.dow - b.dow);
  return mine.length === 0 ? null : `必要 ${mine.map((r) => `${DOW[r.dow]}${r.required}`).join("・")}`;
}
