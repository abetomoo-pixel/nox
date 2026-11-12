// ★M-182（2026-11-12 Agoora＝案 A）: 分析の主要客リストのキャスト別の表＝行を押して選ぶ・見出しで並べ替え・検索欄は表の絞り込み。DB を知らない純関数。
//   売上＝按分後（castSalesRankingOf＝給与と同じ sumCastSales）・報酬＝確定した給与の総支給（labor-cost の byCast＝確定前の月は null＝「—」）・報酬率＝報酬 ÷ 按分売上（castLaborRatePct と同じ式）。
import { castLaborRatePct, type LaborState } from "@/lib/nox/payroll/labor-cost";

export type CastTableRow = { castId: string; name: string; sales: number; share: number | null; pay: number | null; rate: number | null; hon: number; jonai: number; dohan: number };
export type CastSortKey = "name" | "sales" | "share" | "pay" | "rate" | "hon" | "jonai" | "dohan";

/** 在籍のキャスト全員の行（売上の無い人も 0 で出す）。並びは呼び出し側で sortCastRows */
export function castTableRowsOf(
  casts: readonly { id: string; name: string }[],
  ranking: readonly { castId: string; name: string; sales: number; hon: number; jonai: number; dohan: number }[],
  laborState: LaborState,
  castGross: ReadonlyMap<string, number>,
): CastTableRow[] {
  const byId = new Map(ranking.map((r) => [r.castId, r]));
  const total = ranking.reduce((a, r) => a + r.sales, 0);
  const ids = new Set<string>([...casts.map((c) => c.id), ...ranking.map((r) => r.castId)]);
  const nameOf = new Map<string, string>([...ranking.map((r) => [r.castId, r.name] as const), ...casts.map((c) => [c.id, c.name] as const)]);
  return [...ids].map((id) => {
    const r = byId.get(id);
    const sales = r?.sales ?? 0;
    const g = castGross.get(id);
    return {
      castId: id, name: nameOf.get(id) ?? "", sales,
      share: total > 0 ? Math.round((sales / total) * 1000) / 10 : null,
      pay: laborState === "final" && g !== undefined ? g : null,
      rate: castLaborRatePct(laborState, castGross, id, sales),
      hon: r?.hon ?? 0, jonai: r?.jonai ?? 0, dohan: r?.dohan ?? 0,
    };
  });
}

/** 見出しで並べ替え（null は常に最後・同じ値は名前順） */
export function sortCastRows(rows: readonly CastTableRow[], key: CastSortKey, dir: "asc" | "desc"): CastTableRow[] {
  const sgn = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") return sgn * a.name.localeCompare(b.name, "ja");
    const x = a[key], y = b[key];
    if (x === null && y === null) return a.name.localeCompare(b.name, "ja");
    if (x === null) return 1;
    if (y === null) return -1;
    return x !== y ? sgn * (x - y) : a.name.localeCompare(b.name, "ja");
  });
}

/** 検索欄＝名前の絞り込み（空白は無視・部分一致） */
export function filterCastRows(rows: readonly CastTableRow[], q: string): CastTableRow[] {
  const k = q.replace(/\s+/g, "");
  return k ? rows.filter((r) => r.name.replace(/\s+/g, "").includes(k)) : [...rows];
}
