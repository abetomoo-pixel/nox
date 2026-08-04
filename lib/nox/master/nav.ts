// マスタ第2ナビの単一ソース（マスタIA再編 レーン①・裁定C）。
//
// ★ここが唯一の定義。パンくずの群名ドロップダウン・群内タブの3表示はすべてこの配列だけを見ている。
//   後続レーンでページを増やすときは MASTER_NAV に行を足すだけでナビが増える（描画側は触らない）。
//
// 退化時の描画契約（レーン①時点＝群1・ページ1 の状態を破綻させないための取り決め）:
//   - 群が2つ未満     → 群名はプレーンテキスト（ドロップダウンにしない）
//   - 群内ページが2つ未満 → タブ行そのものを出さない
//   - 現在パスがどのページにも一致しない → resolveMasterNav が null＝パンくずは「マスタ」のみ
export type MasterNavPage = { label: string; href: string };
export type MasterNavGroup = { key: string; label: string; pages: MasterNavPage[] };

export const MASTER_NAV: MasterNavGroup[] = [
  {
    key: "overview",
    label: "概要",
    pages: [{ label: "マスタ概要", href: "/master" }],
  },
  {
    key: "products",
    label: "商品・料金",
    pages: [
      { label: "商品", href: "/master/products" },
      // ── 後続レーンでの追加位置（レーン③でこの下に足す）──
      // { label: "商品カテゴリ", href: "/master/categories" },
      // { label: "在庫の入出庫", href: "/master/stock" },
    ],
  },
];

/**
 * 現在パスに対応する群/ページを最長一致で解決する。
 * /master は全ページの接頭辞なので、最長一致にしないと概要が常に勝ってしまう。
 * 該当なしは null（＝ナビ未登録のパス。パンくずだけ出して破綻させない）。
 */
export function resolveMasterNav(
  pathname: string,
): { group: MasterNavGroup; page: MasterNavPage } | null {
  let best: { group: MasterNavGroup; page: MasterNavPage } | null = null;
  for (const group of MASTER_NAV) {
    for (const page of group.pages) {
      if (pathname === page.href || pathname.startsWith(page.href + "/")) {
        if (!best || page.href.length > best.page.href.length) best = { group, page };
      }
    }
  }
  return best;
}
