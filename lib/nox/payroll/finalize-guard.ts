// ★裁定316（2026-09-29・便 X-8-13）: 給与確定は「期間終了の翌営業日から」。period_end < 今日の営業日 のときだけ確定できる。
//   純関数＝DB を知らない。API（app/api/payroll/finalize）と給与画面（確定ボタンの無効化・文言）が同じ判定を使う。
//   DB 側（payroll_finalize）のガードは mig 0158。プレビュー・内容確認は期間の途中でも可（本関数は確定だけを止める）。
export const PERIOD_NOT_ENDED = "period not ended";

/** 'YYYY-MM-DD' → 'M/D'（先頭 0 なし） */
export const mdLabelOf = (ymd: string): string => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;

/** 確定できない理由の文言（ボタンの非活性の注記・API の 400・DB の 'period not ended' で同文） */
export const notEndedMessageOf = (periodEnd: string): string => `期間終了（${mdLabelOf(periodEnd)}）の翌日から確定できます`;

export type FinalizeGuard = { ok: true } | { ok: false; code: typeof PERIOD_NOT_ENDED; message: string };

/** periodEnd・bizToday は 'YYYY-MM-DD'（文字列比較＝暦順）。periodEnd < bizToday のときだけ ok */
export function finalizeGuardOf(periodEnd: string, bizToday: string): FinalizeGuard {
  if (periodEnd < bizToday) return { ok: true };
  return { ok: false, code: PERIOD_NOT_ENDED, message: notEndedMessageOf(periodEnd) };
}
