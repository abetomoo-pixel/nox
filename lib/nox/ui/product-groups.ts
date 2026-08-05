// 純増⑦（mig0063）: 商品タイルのグルーピング（register-board / kiosk-register 共有・presentation-only）。
// 契約:
//  - アクティブなカテゴリが1件以上 → カテゴリ別（sort_order→name 順）＋末尾に「未分類」（category_id null／
//    無効・他店カテゴリを指す迷子も未分類へ寄せる＝タイルから商品が消えない）。
//  - カテゴリ0件 → 従来どおり type 別（drink/champ/bottle）フォールバック＝段B の見た目を維持。
//  - 空グループは出さない。並び替え/表示のみで、RPC 引数・権限・数値は一切触らない。
export type GroupableProduct = {
  id: string; name: string; type: string; price: number; category_id?: string | null;
  /** mig0081: カテゴリ内の並び順。未取得（undefined）なら name のみで並べる＝従来挙動に縮退。 */
  sort_order?: number;
};
export type GroupableCategory = { id: string; name: string; sort_order: number; is_active?: boolean };
export type ProductGroup<T> = { key: string; label: string; items: T[] };

const TYPE_LABEL: Record<string, string> = { drink: "ドリンク", champ: "シャンパン", bottle: "ボトル" };
const TYPE_ORDER = ["drink", "champ", "bottle"] as const;
export const UNCATEGORIZED_LABEL = "未分類";

/**
 * mig0081: グループ内の並び＝sort_order → name。
 * ★これを入れる前は「products 配列の到着順」そのままで、取得側が .order("type") しか
 *   指定していなかったため同一 type 内は実質不定だった（プリフライト実測）。
 * sort_order 未取得（undefined）の呼び出し元は 0 とみなす＝全件同値になり name 順へ縮退する。
 */
function bySortThenName<T extends GroupableProduct>(a: T, b: T): number {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "ja");
}

export function groupProducts<T extends GroupableProduct>(
  products: T[],
  categories: GroupableCategory[],
): ProductGroup<T>[] {
  const active = categories
    .filter((c) => c.is_active !== false)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ja"));

  // カテゴリ未登録＝従来の type 別（段B と同一の見た目）
  if (active.length === 0) {
    return TYPE_ORDER
      .map((ty) => ({
        key: ty, label: TYPE_LABEL[ty] ?? ty,
        items: products.filter((p) => p.type === ty).sort(bySortThenName),
      }))
      .filter((g) => g.items.length > 0);
  }

  const known = new Set(active.map((c) => c.id));
  const groups: ProductGroup<T>[] = active
    .map((c) => ({
      key: c.id, label: c.name,
      items: products.filter((p) => p.category_id === c.id).sort(bySortThenName),
    }))
    .filter((g) => g.items.length > 0);

  // 未分類＝category_id null／未知（無効化・他店・削除済み）を指すもの＝取りこぼしゼロ
  //   ★迷子（無効カテゴリ等を指す行）も混ざる群なので sort_order の連番は保証されない。
  //     name を第2キーに置くことで、同値でも並びが揺れないようにする。
  const rest = products.filter((p) => !p.category_id || !known.has(p.category_id)).sort(bySortThenName);
  if (rest.length > 0) groups.push({ key: "__uncategorized", label: UNCATEGORIZED_LABEL, items: rest });
  return groups;
}
