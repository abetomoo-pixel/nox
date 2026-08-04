import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import {
  fetchProducts, fetchProductCategories, fetchProductCosts, fetchStockTotals,
} from "@/lib/nox/master/queries";
import ProductsBoard from "./products-board";

export const dynamic = "force-dynamic";

// 商品マスタ（マスタIA再編 レーン②）。master-board.tsx の view === "products" から
// 商品ハブ／商品リスト／商品フォームを移設した実ページ。
//
// ★ページレベルでも isManagerUp を要求する。master/layout.tsx の入口ガードと二重＝
//   移設前の master/page.tsx が持っていた出し分け粒度（パネル単位の isManagerUp）を落とさない。
//   真の防御は従来どおり set_product の RPC 側（owner ∨ manager 自店）。
//
// 取得は「このページが描くのに要る分だけ」（裁定B・重複許容）:
//   products / product_categories / product_costs / stock_logs の4本。
//   ★stock_logs は商品行の在庫バー（stockCell＝Σdelta と reorder_point）が使うため必要。
//     seats は商品の描画に一切出てこないので取らない（移設前は同じ load() が巻き込んでいた）。
export default async function MasterProductsPage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");

  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id").order("name").limit(1);
  const storeId = (stores?.[0]?.id as string | undefined) ?? "";

  const [products, categories, costs, stock] = await Promise.all([
    fetchProducts(supabase),
    fetchProductCategories(supabase),
    fetchProductCosts(supabase),
    fetchStockTotals(supabase),
  ]);

  return (
    <ProductsBoard
      storeId={storeId}
      isManagerUp={isManagerUp}
      initial={{ products, categories, costs: costs.costs, costsError: costs.failed, stock }}
    />
  );
}
