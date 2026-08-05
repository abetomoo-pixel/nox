/* ⑤商品一括登録の CSV/表ペースト パーサ（純関数・DB 非依存）＝裁定J。
 *   翻訳元: BANZEN lib/menu-bulk.ts（項目2-B）。NOX 向けの差分は下記3点。
 *
 *  カラム順（lock・5列固定）: 表示カテゴリ,商品名,会計区分,価格,原価（5列目は省略可）。
 *  区切りはカンマ／タブ両対応（行ごと判定＝タブを含む行はタブ区切り）。
 *  ヘッダ行は任意（1行目の先頭セルが「カテゴリ」系なら読み飛ばす）。
 *
 *  ★NOX 固有①: 会計区分（products.type）は3値トークン 'drink'/'champ'/'bottle' が DB の CHECK。
 *    CSV には日本語で来る前提なので、ここでラベル→トークン変換する（未知の語は行エラー）。
 *    ★RPC は3値しか受けない＝サーバが enum 権威。ここは入力の親切さのためだけの層。
 *  ★NOX 固有②: product_categories に unique (store_id, lower(name)) があるため、
 *    「停止中の同名カテゴリ」があると RPC が 'duplicate name' で落ちる。
 *    保存前に UI 側で照合して案内する（checkInactiveCategoryConflicts）。
 *  ★NOX 固有③: バック設定（back_mode/back_value/hon_pt/unit4）は CSV に持たせない。
 *    RPC が rate/0/0 の既定値で入れる＝金に効く設定は店が後から明示設定する（裁定4）。
 *
 *  既定値（lock）: 原価 空欄=null（product_costs 行を作らない）。
 *  同名商品は許容（DB に unique なし）＝警告のみ（duplicateWarnings）。
 *  件数上限（カテゴリ30/商品300）の最終判定は RPC product_bulk_insert（0080）＝サーバ権威。
 *  ここでも同値を errors で先出しして保存前にブロックする。
 */

export const PRODUCT_BULK_MAX_CATEGORIES = 30;
export const PRODUCT_BULK_MAX_ITEMS = 300;

export type ProductType = "drink" | "champ" | "bottle";

export type ProductBulkItem = {
  /** 空文字なら未分類（RPC 側で category_id null） */
  category: string;
  name: string;
  type: ProductType;
  price: number;
  /** null=原価なし（product_costs 行を作らない） */
  cost: number | null;
};
export type ParsedProducts = {
  items: ProductBulkItem[];
  /** カテゴリ先出現順（未分類は含まない） */
  categories: string[];
  errors: string[];
};

/** 会計区分ラベル→3値トークン。日本語表記ゆれと英字トークンの両方を受ける。 */
const TYPE_TOKENS: Record<string, ProductType> = {
  drink: "drink", ドリンク: "drink", どりんく: "drink",
  champ: "champ", champagne: "champ", シャンパン: "champ", シャンパーニュ: "champ",
  bottle: "bottle", ボトル: "bottle",
};
/** 表示用の逆引き（プレビューの件数サマリで使う） */
export const TYPE_LABEL_JA: Record<ProductType, string> = {
  drink: "ドリンク", champ: "シャンパン", bottle: "ボトル",
};

// 価格セルの正規化（タブ区切り由来の「¥1,480」「1 480」等を許容）。
const normPrice = (s: string) => s.replace(/[¥￥,，\s]/g, "");
const isIntStr = (s: string) => /^\d+$/.test(s);

// 1行をセルへ分割（タブを含む行はタブ区切り・それ以外はカンマ区切り。全セル trim）。
function splitCells(line: string): string[] {
  const cells = line.includes("\t") ? line.split("\t") : line.split(/[,，]/);
  return cells.map((c) => c.trim());
}

export function parseProductBulk(text: string): ParsedProducts {
  const errors: string[] = [];
  const items: ProductBulkItem[] = [];
  const catOrder: string[] = [];
  const seenCat = new Set<string>(); // lower 比較（DB の unique が lower(name) のため）

  const rawLines = text.split(/\r?\n/);
  let seenData = false;
  for (let idx = 0; idx < rawLines.length; idx++) {
    const line = rawLines[idx];
    if (line.trim() === "") continue;
    const lineNo = idx + 1;
    const cells = splitCells(line);

    // ヘッダ行（最初の非空行のみ・先頭セルが「カテゴリ」系）は読み飛ばす。
    if (!seenData && /^(表示)?カテゴリ(名)?$/.test(cells[0] ?? "")) continue;
    seenData = true;

    const [cat = "", name = "", typeRaw = "", priceRaw = "", costRaw = ""] = cells;

    if (cat.length > 80) { errors.push(`${lineNo}行目: カテゴリ名が80文字を超えています。`); continue; }
    if (name.length === 0) { errors.push(`${lineNo}行目: 商品名が空です。`); continue; }
    if (name.length > 80) { errors.push(`${lineNo}行目: 商品名が80文字を超えています。`); continue; }

    const typeKey = typeRaw.toLowerCase();
    const type = TYPE_TOKENS[typeKey] ?? TYPE_TOKENS[typeRaw];
    if (!type) {
      errors.push(`${lineNo}行目: 会計区分は「ドリンク・シャンパン・ボトル」のいずれかです（「${typeRaw}」は不明）。`);
      continue;
    }

    const priceStr = normPrice(priceRaw);
    if (!isIntStr(priceStr)) { errors.push(`${lineNo}行目: 価格が不正です（0以上の整数・円）。`); continue; }
    const price = Number(priceStr);

    let cost: number | null = null;
    if (costRaw !== "") {
      const c = normPrice(costRaw);
      if (!isIntStr(c)) { errors.push(`${lineNo}行目: 原価が不正です（0以上の整数・空欄=未設定）。`); continue; }
      cost = Number(c);
    }

    if (cat !== "" && !seenCat.has(cat.toLowerCase())) {
      seenCat.add(cat.toLowerCase());
      catOrder.push(cat);
    }
    items.push({ category: cat, name, type, price, cost });
  }

  if (catOrder.length > PRODUCT_BULK_MAX_CATEGORIES) {
    errors.push(`カテゴリは${PRODUCT_BULK_MAX_CATEGORIES}件までです（現在 ${catOrder.length} 件）。`);
  }
  if (items.length > PRODUCT_BULK_MAX_ITEMS) {
    errors.push(`商品は合計${PRODUCT_BULK_MAX_ITEMS}件までです（現在 ${items.length} 件）。`);
  }

  return { items, categories: catOrder, errors };
}

/**
 * ★停止中カテゴリとの同名衝突（保存前ブロック）。
 * DB は unique (store_id, lower(name)) なので、停止中の同名があると RPC が 'duplicate name' で落ちる。
 * サーバに投げる前に UI で案内するための事前照合（判定は lower 比較＝DB の unique と同じ土俵）。
 */
export function checkInactiveCategoryConflicts(
  categories: string[],
  existing: { name: string; is_active: boolean }[],
): string[] {
  const inactive = new Map(existing.filter((c) => !c.is_active).map((c) => [c.name.toLowerCase(), c.name]));
  const hits: string[] = [];
  for (const c of categories) {
    const hit = inactive.get(c.toLowerCase());
    if (hit) hits.push(hit);
  }
  return hits;
}

/** 新規作成されるカテゴリ（既存 active と lower 一致しないもの）＝プレビューの「新規」バッジ用。 */
export function newCategories(categories: string[], existing: { name: string; is_active: boolean }[]): Set<string> {
  const active = new Set(existing.filter((c) => c.is_active).map((c) => c.name.toLowerCase()));
  return new Set(categories.filter((c) => !active.has(c.toLowerCase())));
}

/** 会計区分ごとの件数（裁定J: プレビューに出す）。 */
export function countByType(items: ProductBulkItem[]): Record<ProductType, number> {
  const out: Record<ProductType, number> = { drink: 0, champ: 0, bottle: 0 };
  for (const i of items) out[i.type] += 1;
  return out;
}

/** 同名商品の警告（lock: ブロックしない）。CSV 内の重複＋既存商品との重複を名前ごとに集計。 */
export function duplicateWarnings(items: ProductBulkItem[], existingNames: string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.name, (counts.get(i.name) ?? 0) + 1);
  const existing = new Map<string, number>();
  for (const n of existingNames) existing.set(n, (existing.get(n) ?? 0) + 1);
  const out: { name: string; count: number }[] = [];
  for (const [name, n] of counts) {
    const total = n + (existing.get(name) ?? 0);
    if (total > 1) out.push({ name, count: total });
  }
  return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
}
