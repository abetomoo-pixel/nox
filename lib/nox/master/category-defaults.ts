// ★0201c（M-146・2026-11-12）: 商品カテゴリの既定（product_categories.default_back_rate・default_track_stock）＝新しく足す商品の既定。
//   既定の当て方は client（このファイル）＝新しい商品でカテゴリを選んだらバック率（%）の欄に入れる・登録の後に在庫の管理を既定どおりにする。
//   書く RPC＝set_product_category_defaults(p_category_id, p_back_rate, p_track_stock)。純関数（DB を知らない）。
import { mig0201cOn } from "@/lib/nox/rules-0175/flag";

export const CATEGORY_DEFAULTS_RPC = "set_product_category_defaults";
type CatDefaults = { default_back_rate?: number | null; default_track_stock?: boolean | null } | null | undefined;

/** 新しい商品に当てる既定（backRate null＝バックの既定なし・trackStock＝在庫を管理するか＝null は管理しない） */
export function productDefaultsOfCategory(cat: CatDefaults): { backRate: number | null; trackStock: boolean } {
  if (!mig0201cOn() || !cat) return { backRate: null, trackStock: false };
  const r = cat.default_back_rate;
  return { backRate: typeof r === "number" && Number.isInteger(r) && r >= 0 && r <= 100 ? r : null, trackStock: cat.default_track_stock === true };
}

/** 一覧の 1 行の表示 */
export function categoryDefaultsLabelOf(cat: CatDefaults): string {
  const d = productDefaultsOfCategory(cat);
  const parts = [d.backRate !== null ? `バック ${d.backRate}%` : null, d.trackStock ? "在庫を管理する" : null].filter(Boolean);
  return parts.length ? parts.join("・") : "既定なし";
}

/** set_product_category_defaults の引数（バック率は空欄＝null＝既定なし・0〜100 の整数・在庫は明示の boolean） */
export function categoryDefaultsArgsOf(categoryId: string, form: { backRate: string; trackStock: boolean }):
  { ok: true; args: { p_category_id: string; p_back_rate: number | null; p_track_stock: boolean } } | { ok: false; err: string } {
  const s = form.backRate.trim();
  const n = s === "" ? null : Number(s);
  if (n !== null && (!Number.isInteger(n) || n < 0 || n > 100)) return { ok: false, err: "バック率は 0〜100% の整数で入力してください" };
  return { ok: true, args: { p_category_id: categoryId, p_back_rate: n, p_track_stock: form.trackStock === true } };
}
