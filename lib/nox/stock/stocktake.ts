// ★裁定323（2026-09-29・便 X-11-7）: 棚卸しの一覧型（純関数・DB を知らない）。
//   行＝在庫管理ありの商品だけ・カテゴリ順（カテゴリの sort_order → 名前・未分類は最後）→ 商品の sort_order → 名前。
//   在庫管理の判定＝products に管理フラグの列が無いため「現在庫の集計（product_stock_totals）に行がある商品」を管理ありとする（在庫数が無い＝管理なし）。
//   記録する行＝実数が整数で、現在庫との差分が 0 でない行だけ。
import { stockUnitOf } from "../inventory/unit";

export type StocktakeProduct = { id: string; name: string; type: string; is_active: boolean; category_id: string | null; sort_order: number };
export type StocktakeCategory = { id: string; name: string; sort_order: number };
export type StocktakeRow = { id: string; name: string; unit: string; current: number; isActive: boolean; categoryName: string; head: boolean };
export type StocktakePlanRow = { id: string; name: string; current: number; actual: number; delta: number };

export const UNCATEGORIZED = "未分類";

/** 在庫管理あり＝現在庫の集計に行がある */
export const isStockManaged = (stock: Readonly<Record<string, number>>, productId: string): boolean => stock[productId] !== undefined;

export function stocktakeRowsOf(
  products: readonly StocktakeProduct[], stock: Readonly<Record<string, number>>, categories: readonly StocktakeCategory[],
  opt: { q?: string; showInactive?: boolean } = {},
): StocktakeRow[] {
  const needle = (opt.q ?? "").trim().toLowerCase();
  const catOf = new Map(categories.map((c) => [c.id, c]));
  const keyOf = (p: StocktakeProduct) => { const c = p.category_id ? catOf.get(p.category_id) : undefined; return c ? { order: c.sort_order, name: c.name } : { order: Number.MAX_SAFE_INTEGER, name: UNCATEGORIZED }; };
  const rows = products
    .filter((p) => isStockManaged(stock, p.id))
    .filter((p) => opt.showInactive || p.is_active)
    .filter((p) => needle === "" || p.name.toLowerCase().includes(needle))
    .map((p) => ({ p, k: keyOf(p) }))
    .sort((a, b) => a.k.order - b.k.order || a.k.name.localeCompare(b.k.name, "ja") || a.p.sort_order - b.p.sort_order || a.p.name.localeCompare(b.p.name, "ja"));
  return rows.map(({ p, k }, i) => ({
    id: p.id, name: p.name, unit: stockUnitOf(p.type), current: stock[p.id] ?? 0, isActive: p.is_active,
    categoryName: k.name, head: i === 0 || rows[i - 1].k.name !== k.name,
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
