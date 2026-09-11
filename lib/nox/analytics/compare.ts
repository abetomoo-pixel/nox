// B6-11 比較（前月比・前年同月比）の差分計算（純関数・DB 非依存・import なし・裁定 B6-11／B6-10 ②・2026-09-11）。
//   diffOf(cur, prev, kind) → { abs, pct }:
//     cur か prev が null → abs／pct とも null（画面は「—」）。
//     kind 'rate'（人件費率・目標進捗＝%）→ abs は pt 差（小数 1 桁へ丸め）・pct は常に null（率の変化率は出さない）。
//     kind 'amount'（円）／'count'（組）→ abs は整数差・pct は prev=0 なら null（分母 0）、それ以外 Math.round(x*1000)/10（小数 1 桁 %）。
//   prevMonthOf／prevYearMonthOf は analytics-board の addMonths と同じ Date 演算（−1／−12）。

export type DiffKind = "amount" | "count" | "rate";
export type Diff = { abs: number | null; pct: number | null };

export function diffOf(cur: number | null, prev: number | null, kind: DiffKind): Diff {
  if (cur === null || prev === null) return { abs: null, pct: null };
  if (kind === "rate") return { abs: Math.round((cur - prev) * 10) / 10, pct: null };
  const abs = cur - prev;
  const pct = prev === 0 ? null : Math.round(((cur - prev) / prev) * 1000) / 10;
  return { abs, pct };
}

function addMonths(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 前月の 'YYYY-MM'（2026-01 → 2025-12）。 */
export function prevMonthOf(period: string): string {
  return addMonths(period, -1);
}

/** 前年同月の 'YYYY-MM'（2026-09 → 2025-09）。 */
export function prevYearMonthOf(period: string): string {
  return addMonths(period, -12);
}
