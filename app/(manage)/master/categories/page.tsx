import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import { fetchProducts, fetchProductCategories } from "@/lib/nox/master/queries";
import CategoriesBoard from "./categories-board";

export const dynamic = "force-dynamic";

// 商品カテゴリ（マスタIA再編 レーン③）。master-board.tsx の view === "products" から
// 「商品カテゴリ（クリックで編集）」を移設した実ページ。
//
// ★ページレベルでも isManagerUp を要求（master/layout.tsx の入口ガードと二重）。
//   真の防御は従来どおり set_product_category の RPC 側（owner ∨ manager 自店）。
//
// 取得は「このページが描くのに要る分だけ」（裁定B・重複許容）:
//   product_categories（一覧・フォーム）＋ products（カテゴリ表の「商品 n」件数）。
//   ★stock_logs は在庫表示が無いので取らない・product_costs も原価表示が無いので取らない。
export default async function MasterCategoriesPage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");

  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id").order("name").limit(1);
  const storeId = (stores?.[0]?.id as string | undefined) ?? "";

  const [categories, products] = await Promise.all([
    fetchProductCategories(supabase),
    fetchProducts(supabase),
  ]);

  return <CategoriesBoard storeId={storeId} isManagerUp={isManagerUp} initial={{ categories, products }} />;
}
