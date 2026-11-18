// ★裁定323（2026-09-29・便 X-11-7）: 棚卸しの一覧型（純関数・DB を知らない）。
//   行＝在庫管理ありの商品だけ・カテゴリ順（カテゴリの sort_order → 名前・未分類は最後）→ 商品の sort_order → 名前。
//   在庫管理の判定＝products に管理フラグの列が無いため「現在庫の集計（product_stock_totals）に行がある商品」を管理ありとする（在庫数が無い＝管理なし）。
//   記録する行＝実数が整数で、現在庫との差分が 0 でない行だけ。
import { stockUnitOf } from "../inventory/unit";

// ★2026-11-18 夜（相談役 ⑥ C-2）: reorder_point（発注基準）を行に持たせる＝表の該当行に赤い印と基準の本数・「基準を下回っている商品だけ」の絞り込み（判定は下の isLowStock＝今までの警告と同じ式）
export type StocktakeProduct = { id: string; name: string; type: string; is_active: boolean; category_id: string | null; sort_order: number; reorder_point?: number | null };
export type StocktakeCategory = { id: string; name: string; sort_order: number };
export type StocktakeRow = { id: string; name: string; unit: string; current: number; isActive: boolean; categoryName: string; head: boolean; reorderPoint: number | null; low: boolean };
export type StocktakePlanRow = { id: string; name: string; current: number; actual: number; delta: number };

export const UNCATEGORIZED = "未分類";

/** 在庫管理あり＝現在庫の集計に行がある */
export const isStockManaged = (stock: Readonly<Record<string, number>>, productId: string): boolean => stock[productId] !== undefined;

/** 発注基準を下回っている＝基準があり、現在庫が基準以下（★裁定330 の警告と同じ式＝在庫 ≤ reorder_point） */
export const isLowStock = (current: number, reorderPoint: number | null | undefined): boolean => reorderPoint != null && current <= reorderPoint;

export type LowStockItem = { id: string; name: string; unit: string; current: number; reorderPoint: number };
/** ★2026-11-18 夜（相談役 ⑥ C-2）: 上の帯に出す商品＝在庫を管理する商品（track_stock≠false）で基準を下回っているもの（在庫の行が無い商品は 0 本＝今までの件数と同じ）。
 *  並び＝足りない数（現在庫 − 基準）の小さい順 → 名前 */
export function lowStockOf(
  products: readonly { id: string; name: string; type: string; reorder_point?: number | null; track_stock?: boolean }[], stock: Readonly<Record<string, number>>,
): LowStockItem[] {
  return products
    .filter((p) => p.track_stock !== false && isLowStock(stock[p.id] ?? 0, p.reorder_point))
    .map((p) => ({ id: p.id, name: p.name, unit: stockUnitOf(p.type), current: stock[p.id] ?? 0, reorderPoint: p.reorder_point as number }))
    .sort((a, b) => (a.current - a.reorderPoint) - (b.current - b.reorderPoint) || a.name.localeCompare(b.name, "ja"));
}
/** 帯の 1 行＝先頭の max 件を「商品名 現在庫／基準単位」で・残りは「ほか n 件」 */
export function lowStockSummaryOf(items: readonly LowStockItem[], max = 3): { shown: string[]; rest: number } {
  const shown = items.slice(0, Math.max(0, max)).map((i) => `${i.name} ${i.current}／${i.reorderPoint}${i.unit}`);
  return { shown, rest: Math.max(0, items.length - shown.length) };
}

export function stocktakeRowsOf(
  products: readonly StocktakeProduct[], stock: Readonly<Record<string, number>>, categories: readonly StocktakeCategory[],
  opt: { q?: string; showInactive?: boolean; lowOnly?: boolean } = {},
): StocktakeRow[] {
  const needle = (opt.q ?? "").trim().toLowerCase();
  const catOf = new Map(categories.map((c) => [c.id, c]));
  const keyOf = (p: StocktakeProduct) => { const c = p.category_id ? catOf.get(p.category_id) : undefined; return c ? { order: c.sort_order, name: c.name } : { order: Number.MAX_SAFE_INTEGER, name: UNCATEGORIZED }; };
  const rows = products
    .filter((p) => isStockManaged(stock, p.id))
    .filter((p) => opt.showInactive || p.is_active)
    .filter((p) => needle === "" || p.name.toLowerCase().includes(needle))
    .filter((p) => !opt.lowOnly || isLowStock(stock[p.id] ?? 0, p.reorder_point))
    .map((p) => ({ p, k: keyOf(p) }))
    .sort((a, b) => a.k.order - b.k.order || a.k.name.localeCompare(b.k.name, "ja") || a.p.sort_order - b.p.sort_order || a.p.name.localeCompare(b.p.name, "ja"));
  return rows.map(({ p, k }, i) => ({
    id: p.id, name: p.name, unit: stockUnitOf(p.type), current: stock[p.id] ?? 0, isActive: p.is_active,
    categoryName: k.name, head: i === 0 || rows[i - 1].k.name !== k.name,
    reorderPoint: p.reorder_point ?? null, low: isLowStock(stock[p.id] ?? 0, p.reorder_point),
  }));
}

/** 実数の入力（文字列）から、記録する行だけを取り出す（整数・差分 ≠ 0・在庫管理あり） */
export function stocktakePlanOf(products: readonly { id: string; name: string }[], stock: Readonly<Record<string, number>>, actuals: Readonly<Record<string, string>>): StocktakePlanRow[] {
  const out: StocktakePlanRow[] = [];
  for (const p of products) {
    const raw = (actuals[p.id] ?? "").trim();
    if (raw === "" || !isStockManaged(stock, p.id)) continue;
    const n = Number(raw);
    if (!Number.isInteger(n)) continue;
    const current = stock[p.id] ?? 0;
    if (n - current === 0) continue;
    out.push({ id: p.id, name: p.name, current, actual: n, delta: n - current });
  }
  return out;
}

// ★便 SH-UI-c2 C2-8（2026-10-23）: 棚卸しの 390px＝分類はグループ見出し・実数の既定値＝現在庫（差分 0）・−／＋で 1 ずつ・差分の色
export type StocktakeGroup = { categoryName: string; rows: StocktakeRow[] };
/** 行（カテゴリ順）→ 分類ごとのグループ（見出し行の数＝分類の数） */
export function stocktakeGroupsOf(rows: readonly StocktakeRow[]): StocktakeGroup[] {
  const out: StocktakeGroup[] = [];
  for (const r of rows) { const last = out[out.length - 1]; if (last && last.categoryName === r.categoryName) last.rows.push(r); else out.push({ categoryName: r.categoryName, rows: [r] }); }
  return out;
}
/** 実数の値＝未入力（undefined／空）なら現在庫・整数でない入力は null */
export function actualValueOf(raw: string | undefined, current: number): number | null {
  if (raw === undefined || raw.trim() === "") return current;
  const v = Number(raw.trim());
  return Number.isInteger(v) ? v : null;
}
/** 差分＝実数 − 現在庫（整数でない入力は null） */
export function deltaOf(raw: string | undefined, current: number): number | null {
  const v = actualValueOf(raw, current);
  return v === null ? null : v - current;
}
/** −／＋＝今の実数に step を足した文字列（0 未満にしない・不正な入力は現在庫から） */
export function stepActualOf(raw: string | undefined, current: number, step: number): string {
  const v = actualValueOf(raw, current) ?? current;
  return String(Math.max(0, v + step));
}
