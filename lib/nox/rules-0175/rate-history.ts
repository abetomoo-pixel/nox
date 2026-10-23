// ★便 P175-prep P-1（裁定416・0175 v2 ★16 cast_rate_history）: 時給の変更履歴（段の累積加算・手動・保証の開始／終了）を営業日ごとの時給に反映する純関数。
//   rate(d)＝max(保証（開始〜期限内・履歴 kind guarantee か cast_plan の保証行）, その日に有効な「基本＋段の累積加算（slide_up）」, 手動（manual＝その日からの絶対値）)
//   フラグ false のときは呼ばれない（collect は cast_rate_history を読まない）＝従来の保証 3 行形（assemble.guaranteeInputOf）のまま。
export type RateHistoryRow = { kind: "base" | "slide_up" | "guarantee" | "manual"; rate: number; valid_from: string; valid_to: string | null };

const inRange = (r: RateHistoryRow, ymd: string): boolean => r.valid_from <= ymd && (r.valid_to === null || ymd <= r.valid_to);

/** その日の「基本時給」＝manual／base の最新（valid_from ≤ d の最大）が無ければ plan の base。段の累積加算（slide_up）は有効なものを全部足す */
export function baseRateOnDayOf(history: readonly RateHistoryRow[], ymd: string, planBase: number): { base: number; up: number; manual: boolean } {
  const bases = history.filter((r) => (r.kind === "base" || r.kind === "manual") && inRange(r, ymd)).sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1));
  const base = bases.length ? bases[0].rate : planBase;
  const up = history.filter((r) => r.kind === "slide_up" && inRange(r, ymd)).reduce((a, r) => a + r.rate, 0);
  return { base, up, manual: bases.length > 0 && bases[0].kind === "manual" };
}

/** その日の保証（履歴の guarantee 行＝高い方） */
export function guaranteeOnDayOf(history: readonly RateHistoryRow[], ymd: string): number | null {
  const g = history.filter((r) => r.kind === "guarantee" && inRange(r, ymd)).map((r) => r.rate);
  return g.length ? Math.max(...g) : null;
}

export type DayRate = { ymd: string; rate: number; kind: "保証" | "基本" | "手動" | "段"; base: number; up: number; guarantee: number | null };

/**
 * 営業日ごとの時給（段の判定前の「基本側」）。slide は従来どおり pay.ts の wageDetail が max を取るので、ここでは
 *   基本＋累積加算（＝新しい eplan.base 相当）と保証を日ごとに返す＝assemble が baseByDay／guaranteeByDay に写す。
 */
export function dayRatesOf(history: readonly RateHistoryRow[], dates: readonly string[], planBase: number): DayRate[] {
  return dates.map((ymd) => {
    const b = baseRateOnDayOf(history, ymd, planBase);
    const g = guaranteeOnDayOf(history, ymd);
    const basePlusUp = b.base + b.up;
    const rate = Math.max(basePlusUp, g ?? 0);
    const kind: DayRate["kind"] = g !== null && g >= basePlusUp ? "保証" : b.up > 0 ? "段" : b.manual ? "手動" : "基本";
    return { ymd, rate, kind, base: b.base, up: b.up, guarantee: g };
  });
}

/** assemble の PayInput への写し＝baseByDay（d→基本＋累積加算）と guaranteeByDay（d→保証）。dayNum＝日番号の取り方は呼び出し側 */
export function rateHistoryInputOf(history: readonly RateHistoryRow[], dates: readonly string[], planBase: number, dayNum: (ymd: string) => number): { baseByDay: Record<number, number>; guaranteeByDay: Record<number, number> } {
  const baseByDay: Record<number, number> = {}; const guaranteeByDay: Record<number, number> = {};
  for (const r of dayRatesOf(history, dates, planBase)) {
    if (r.base + r.up !== planBase) baseByDay[dayNum(r.ymd)] = r.base + r.up;
    if (r.guarantee !== null) guaranteeByDay[dayNum(r.ymd)] = r.guarantee;
  }
  return { baseByDay, guaranteeByDay };
}
