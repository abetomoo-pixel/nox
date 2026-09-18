// ★便 R（2026-09-18）: 在庫数量の単位（表示専用の純関数・DB を知らない）。
//   products.type（lib/nox/product-bulk.ts の ProductType＝drink／champ／bottle／food／other）→ 「本」「個」。
//   未知の type は「個」に倒す（fail-soft＝数字の後ろに何も出さないより読める）。
//   使い方: 数字の直後に半角スペースなしで付ける（`${n}${stockUnitOf(type)}`）。入力欄の中には入れず、右のラベルで出す。
//   レジの商品タイル「在庫n」は対象外（不変）。
export type StockUnit = "本" | "個";

export function stockUnitOf(type: string | null | undefined): StockUnit {
  switch (type) {
    case "bottle":
    case "champ":
    case "drink":
      return "本";
    case "food":
    case "other":
      return "個";
    default:
      return "個";
  }
}
