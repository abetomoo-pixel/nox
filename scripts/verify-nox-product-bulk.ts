/*
 * verify:nox-product-bulk — 商品一括登録 CSV パーサ（純関数・DB 不要）。
 *   npm run verify:nox-product-bulk
 *
 * ★DB を触らないのは verify:nox-pay と同型（純関数の入出力だけを固定する）。
 *   サーバ側の権威（3値 CHECK・上限・duplicate name）は段41 の runtime 検証が見る。
 *   ここが守るのは「client が RPC に渡す直前の形」＝ラベル変換・区切り・既定値・事前照合。
 *
 * 構成:
 *  T1 区切りとヘッダ（カンマ/タブ・ヘッダ自動スキップ・空行無視）
 *  T2 会計区分ラベル→3値トークン（日本語/英字/未知）
 *  T3 価格・原価の正規化（¥/カンマ/空白・空欄=null・不正）
 *  T4 カテゴリ（空欄=未分類・lower 重複の集約・先出現順）
 *  T5 上限（300商品・30カテゴリ）
 *  T6 事前照合（停止中同名の衝突・新規カテゴリ判定・type 別件数・同名警告）
 */
import {
  parseProductBulk,
  checkInactiveCategoryConflicts,
  newCategories,
  countByType,
  duplicateWarnings,
  PRODUCT_BULK_MAX_ITEMS,
  PRODUCT_BULK_MAX_CATEGORIES,
} from "../lib/nox/product-bulk";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

// ── T1 区切りとヘッダ ──────────────────────────────────────────────
{
  const csv = "表示カテゴリ,商品名,会計区分,価格,原価\nボトル,山崎,ボトル,12000,4000\n\nグラス,ハイボール,ドリンク,800,";
  const r = parseProductBulk(csv);
  check("T1 ヘッダ行を自動スキップ・空行を無視して2件", r.items.length === 2 && r.errors.length === 0,
    JSON.stringify({ n: r.items.length, e: r.errors }));
  check("T1 1件目の値が入力どおり",
    r.items[0].name === "山崎" && r.items[0].type === "bottle" && r.items[0].price === 12000 && r.items[0].cost === 4000,
    JSON.stringify(r.items[0]));
  const tsv = "グラス\tハイボール\tドリンク\t800\t200";
  const rt = parseProductBulk(tsv);
  check("T1 タブ区切りも解釈できる（表からの貼り付け）",
    rt.items.length === 1 && rt.items[0].price === 800 && rt.items[0].cost === 200, JSON.stringify(rt.items));
  const noHeader = parseProductBulk("ボトル,山崎,ボトル,12000");
  check("T1 ヘッダなしでも1行目をデータとして読む", noHeader.items.length === 1, JSON.stringify(noHeader));
  check("T1 全角カンマ区切りも解釈できる",
    parseProductBulk("ボトル，山崎，ボトル，12000").items.length === 1);
}

// ── T2 会計区分ラベル → 3値トークン ────────────────────────────────
{
  const cases: Array<[string, string]> = [
    ["ドリンク", "drink"], ["シャンパン", "champ"], ["シャンパーニュ", "champ"],
    ["ボトル", "bottle"], ["drink", "drink"], ["CHAMP", "champ"], ["Bottle", "bottle"],
  ];
  for (const [label, want] of cases) {
    const r = parseProductBulk(`c,商品,${label},100`);
    check(`T2 「${label}」→ ${want}`, r.items[0]?.type === want, JSON.stringify(r.items[0] ?? r.errors));
  }
  const bad = parseProductBulk("c,商品,フード,100");
  check("T2 ★未知の会計区分は行エラー（RPC に投げない）",
    bad.items.length === 0 && bad.errors.length === 1 && bad.errors[0].includes("フード"), JSON.stringify(bad.errors));
}

// ── T3 価格・原価 ─────────────────────────────────────────────────
{
  const r = parseProductBulk("c,商品,ドリンク,¥1‚480,");
  const r2 = parseProductBulk("c,商品,ドリンク,\"1,480\",300");
  check("T3 ¥ とカンマを除去して整数化", parseProductBulk("c,商品,ドリンク,¥1480,").items[0]?.price === 1480);
  check("T3 全角￥と全角カンマも除去", parseProductBulk("c,商品,ドリンク,￥1480,").items[0]?.price === 1480);
  check("T3 原価 空欄＝null（product_costs 行を作らせない）",
    parseProductBulk("c,商品,ドリンク,800,").items[0]?.cost === null);
  check("T3 原価 0 は null ではなく 0（明示ゼロ原価）",
    parseProductBulk("c,商品,ドリンク,800,0").items[0]?.cost === 0);
  check("T3 5列目そのものが無い行でも原価 null",
    parseProductBulk("c,商品,ドリンク,800").items[0]?.cost === null);
  check("T3 負価格は行エラー", parseProductBulk("c,商品,ドリンク,-1").errors.length === 1);
  check("T3 小数価格は行エラー", parseProductBulk("c,商品,ドリンク,10.5").errors.length === 1);
  check("T3 非数値の原価は行エラー", parseProductBulk("c,商品,ドリンク,800,abc").errors.length === 1);
  check("T3 商品名が空なら行エラー", parseProductBulk("c,,ドリンク,800").errors.length === 1);
  check("T3 商品名81文字は行エラー", parseProductBulk(`c,${"あ".repeat(81)},ドリンク,800`).errors.length === 1);
  void r; void r2;
}

// ── T4 カテゴリ ───────────────────────────────────────────────────
{
  const r = parseProductBulk([
    "ボトル,山崎,ボトル,12000",
    "グラス,ハイボール,ドリンク,800",
    "ボトル,白州,ボトル,13000",
    ",チャージ,ドリンク,3000",
  ].join("\n"));
  check("T4 カテゴリは先出現順で重複排除", JSON.stringify(r.categories) === JSON.stringify(["ボトル", "グラス"]),
    JSON.stringify(r.categories));
  check("T4 ★カテゴリ空欄＝未分類（categories に含めない・item の category は空文字）",
    r.items[3].category === "" && !r.categories.includes(""), JSON.stringify(r.items[3]));
  const lc = parseProductBulk("Bottle,a,ボトル,100\nbottle,b,ボトル,200");
  check("T4 ★lower 一致は同一カテゴリとして1件に集約（DB の unique(store_id,lower(name)) と同じ土俵）",
    lc.categories.length === 1 && lc.categories[0] === "Bottle", JSON.stringify(lc.categories));
}

// ── T5 上限 ───────────────────────────────────────────────────────
{
  const many = Array.from({ length: PRODUCT_BULK_MAX_ITEMS + 1 }, (_, i) => `c,商品${i},ドリンク,100`).join("\n");
  const r = parseProductBulk(many);
  check("T5 301商品で上限エラー（RPC 到達前にブロック）",
    r.errors.some((e) => e.includes(`${PRODUCT_BULK_MAX_ITEMS}件`)), JSON.stringify(r.errors));
  const cats = Array.from({ length: PRODUCT_BULK_MAX_CATEGORIES + 1 }, (_, i) => `cat${i},商品${i},ドリンク,100`).join("\n");
  const rc = parseProductBulk(cats);
  check("T5 31カテゴリで上限エラー",
    rc.errors.some((e) => e.includes(`${PRODUCT_BULK_MAX_CATEGORIES}件`)), JSON.stringify(rc.errors));
  const ok = Array.from({ length: PRODUCT_BULK_MAX_ITEMS }, (_, i) => `c,商品${i},ドリンク,100`).join("\n");
  check("T5 ちょうど300商品はエラーなし（境界）", parseProductBulk(ok).errors.length === 0);
}

// ── T6 事前照合・集計 ─────────────────────────────────────────────
{
  const existing = [
    { name: "ボトル", is_active: true },
    { name: "停止中カテゴリ", is_active: false },
    { name: "Champagne", is_active: false },
  ];
  check("T6 ★停止中と同名は衝突として検出（保存前ブロックの材料）",
    JSON.stringify(checkInactiveCategoryConflicts(["停止中カテゴリ"], existing)) === JSON.stringify(["停止中カテゴリ"]));
  check("T6 ★衝突判定は lower 比較（DB の unique と同じ土俵）",
    checkInactiveCategoryConflicts(["champagne"], existing).length === 1,
    JSON.stringify(checkInactiveCategoryConflicts(["champagne"], existing)));
  check("T6 有効カテゴリとの同名は衝突ではない（再利用される）",
    checkInactiveCategoryConflicts(["ボトル"], existing).length === 0);

  const nw = newCategories(["ボトル", "グラス"], existing);
  check("T6 新規カテゴリ判定＝既存 active と lower 一致しないもの",
    !nw.has("ボトル") && nw.has("グラス"), JSON.stringify([...nw]));

  const items = parseProductBulk([
    "c,a,ドリンク,100", "c,b,ドリンク,100", "c,c,シャンパン,30000", "c,d,ボトル,12000",
  ].join("\n")).items;
  const bt = countByType(items);
  check("T6 会計区分ごとの件数（プレビュー サマリ＝裁定J）",
    bt.drink === 2 && bt.champ === 1 && bt.bottle === 1, JSON.stringify(bt));

  const dup = duplicateWarnings(items, ["a", "既存だけの名前"]);
  check("T6 同名警告＝CSV 内＋既存との合計で2件以上（ブロックはしない）",
    dup.length === 1 && dup[0].name === "a" && dup[0].count === 2, JSON.stringify(dup));
}

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-product-bulk ALL PASS (${pass} assertions)`);
