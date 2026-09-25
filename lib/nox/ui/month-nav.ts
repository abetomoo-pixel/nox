// ★裁定306（2026-09-25・306-1／306-2／306-4／306-6・306-10）: 月ナビと月セルの純関数（DB を知らない）。
//   年月見出し「YYYY年M月」・前月／翌月・URL クエリ ?ym=YYYY-MM との同期・募集期間の注記・スタッフ月セルの圧縮表示。
export const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 'YYYY-MM' → 'YYYY年M月'（形が違えばそのまま） */
export function ymLabelOf(ym: string): string {
  if (!YM_RE.test(ym)) return ym;
  return `${Number(ym.slice(0, 4))}年${Number(ym.slice(5, 7))}月`;
}

/** 'YYYY-MM' ± n 月 */
export function ymShift(ym: string, delta: number): string {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** location.search から ?ym（形が正しいときだけ・無ければ null） */
export function ymFromSearch(search: string): string | null {
  const v = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("ym");
  return v && YM_RE.test(v) ? v : null;
}

/** ?ym を差し替えた search（先頭 '?'・他のクエリは保持・空なら ''） */
export function ymSearchOf(search: string, ym: string): string {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  p.set("ym", ym);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export type PeriodLike = { start_date: string; end_date: string; status?: string };

/** 306-2: 募集中（status='open'）の期間の月と表示月が違うときの注記「募集期間: M月」（複数月は「M月・M月」・同じ月なら null） */
export function recruitNoteOf(periods: readonly PeriodLike[], ym: string): string | null {
  const months = new Set<string>();
  for (const p of periods) {
    if (p.status !== "open") continue;
    let cur = p.start_date.slice(0, 7);
    const end = p.end_date.slice(0, 7);
    for (let i = 0; i < 24 && cur <= end; i++) { months.add(cur); cur = ymShift(cur, 1); }
  }
  if (months.size === 0 || months.has(ym)) return null;
  return `募集期間: ${[...months].sort().map((m) => `${Number(m.slice(5, 7))}月`).join("・")}`;
}

/** 306-4: /mine の希望カレンダー＝表示月に提出できる日が 0 のときの注記（移動は可・提出は不可）。periods null＝RPC 未適用＝注記なし */
export function outOfPeriodNoteOf(activeCount: number, periods: readonly PeriodLike[] | null, ym: string): string | null {
  if (periods === null || activeCount > 0) return null;
  if (periods.length === 0) return "募集中の期間がありません（この月は提出できません）";
  const rec = recruitNoteOf(periods.map((p) => ({ ...p, status: "open" })), ym);
  return `この月は提出できる期間の外です（${rec ?? "募集期間の月へ移動してください"}）`;
}

/** 306-10: スタッフ月セルの圧縮表示（≤899px）＝「早 0/0」の 1 行ずつ・最大 max 行・残りは「+n」 */
export function staffCellCompactOf(rows: readonly { name: string; n: number; m: number }[], max = 2): { lines: string[]; more: number } {
  const lines = rows.slice(0, max).map((r) => `${r.name.slice(0, 1)} ${r.n}/${r.m}`);
  return { lines, more: Math.max(0, rows.length - max) };
}
