// ★便 X-13a（X-13-12／X-13-14・2026-10-08）: 給与 月次一覧の期間候補と空状態の導線（純関数・DB 不触）。
//   X-13-14: 期間候補＝当月＋過去 12 か月（run の有無に関わらず選択可）＋ run のある期間（それより古いもの）。確定済み（finalized／paid）に印。
//   X-13-12: 空状態＝「先月のプレビューを開く」（期間選択付き・既定＝先月）→ /payroll?store=&period=（明細画面＝プレビュー）。
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 'YYYY-MM' の n か月前（n=1 で先月） */
export function shiftPeriod(ym: string, n: number): string {
  if (!YM.test(ym)) return ym;
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) - n;
  const yy = Math.floor(idx / 12), mm = (idx % 12 + 12) % 12 + 1;
  return `${yy}-${String(mm).padStart(2, "0")}`;
}
export const prevPeriodOf = (ym: string): string => shiftPeriod(ym, 1);

/** 当月＋過去 back か月＋run のある期間（重複除去・降順） */
export function periodCandidatesOf(current: string, runPeriods: readonly string[], back = 12): string[] {
  const s = new Set<string>();
  if (YM.test(current)) for (let i = 0; i <= back; i++) s.add(shiftPeriod(current, i));
  for (const p of runPeriods) if (YM.test(p)) s.add(p);
  return [...s].sort().reverse();
}

/** 確定済み（finalized／paid）の run がある期間の集合（店舗を問わない） */
export function finalizedPeriodsOf(runs: readonly { period: string; status: string }[]): Set<string> {
  return new Set(runs.filter((r) => r.status === "finalized" || r.status === "paid").map((r) => r.period));
}

/** select の表示＝'2026/9' ＋ 確定済みの印 */
export function periodOptionLabelOf(ym: string, finalized: ReadonlySet<string>, fmt: (ym: string) => string): string {
  return finalized.has(ym) ? `${fmt(ym)} ✓確定済` : fmt(ym);
}

/** 空状態の導線＝明細画面（プレビュー）の URL */
export function previewHrefOf(storeId: string, period: string): string {
  return `/payroll?store=${encodeURIComponent(storeId)}&period=${period}`;
}
