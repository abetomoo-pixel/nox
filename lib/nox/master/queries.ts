// マスタ配下ページのデータ取得（マスタIA再編 レーン②）。
//
// 方針（裁定B・重複許容）: 共通 loader は作らず、関数を並べるだけにする。
//   ページごとに必要な関数だけを呼ぶ＝どのページが何を取るかがページ側だけで読み切れる。
//   同じテーブルを2ページが取るのは許容（1リクエスト内での共有より、依存の少なさを取る）。
// 引数は SupabaseClient を受ける＝server（lib/supabase/server）でも
//   client（lib/supabase/client）でも同じ関数が使える。RLS はどちらでも効く。
//
// ★SELECT の内容は master-board.tsx の load() から1文字も変えていない
//   （products は select("*")・並びは type→name 等）。移設で取得結果が変わらないことを優先。
import type { SupabaseClient } from "@supabase/supabase-js";

export type MasterProduct = {
  id: string; type: string; category: string | null; name: string; price: number;
  back_mode: string; back_value: number | null; unit4_json: Record<string, number> | null; hon_pt: number; is_active: boolean;
  // 純増①（mig0061/0062）: 発注点しきい（null=しきい無し）。select("*") で取得。
  reorder_point: number | null;
  // 純増⑦（mig0063）: カテゴリ FK（null=未分類）。旧 category text は deprecated（現値往復のみ）。
  category_id: string | null;
  // キャストドリンク（mig0066/0069）: true=check_close の指名按分から除外し、バックは drink_claims 経路のみ。
  back_exempt_from_split: boolean;
  // mig0081: カテゴリ内の並び順（レジ/kiosk のタイル順）。select("*") で取得。
  sort_order: number;
};

// 純増⑦（mig0063）: 商品カテゴリマスタ（store スコープ・sort_order 順・is_active で有効/無効）
export type MasterCategory = { id: string; name: string; sort_order: number; is_active: boolean };

export async function fetchProducts(sb: SupabaseClient): Promise<MasterProduct[]> {
  const { data } = await sb.from("products").select("*").order("type").order("name");
  return (data ?? []) as MasterProduct[];
}

export async function fetchProductCategories(sb: SupabaseClient): Promise<MasterCategory[]> {
  // 無効も含めて管理表に出す（並びは sort_order→name）
  const { data } = await sb.from("product_categories")
    .select("id, name, sort_order, is_active").order("sort_order").order("name");
  return (data ?? []) as MasterCategory[];
}

/**
 * 原価（台帳#40＝product_costs へ分離。RLS は owner∨manager自店 のみ返す＝cast/staff は空）。
 * ★0行（＝原価なし・RLS で返らない）と 取得失敗 を区別して返す。失敗のときだけ保存を止める＝
 *   原価欄が空のまま p_cost=null を送って cost 行を消す事故を構造的に作らない。
 */
export async function fetchProductCosts(
  sb: SupabaseClient,
): Promise<{ costs: Record<string, number>; failed: boolean }> {
  const { data, error } = await sb.from("product_costs").select("product_id, cost");
  const costs: Record<string, number> = {};
  for (const c of (data ?? []) as { product_id: string; cost: number }[]) costs[c.product_id] = c.cost;
  return { costs, failed: !!error };
}

/**
 * 在庫は台帳（stock_logs）の Σdelta。append-only ゆえ現在庫という列は無い。
 * ④d-1（mig0078/0079）: 全件 select＋JS 畳みを DB 側集約 RPC に置換（月1000件規模で破綻するため）。
 * ★p_store_id は常に null＝スコープは RLS（stock_logs_select）と完全一致
 *   （owner=org全体／manager・staff=自店／cast=0行）。店で絞る呼び出しは現状存在しない。
 * 在庫ログが1件も無い商品は行が返らない＝呼び出し側は従来どおり `?? 0` で埋める。
 */
export async function fetchStockTotals(sb: SupabaseClient): Promise<Record<string, number>> {
  const { data } = await sb.rpc("product_stock_totals", { p_store_id: null });
  const stock: Record<string, number> = {};
  for (const r of (data ?? []) as { product_id: string; qty: number }[]) stock[r.product_id] = r.qty;
  return stock;
}
