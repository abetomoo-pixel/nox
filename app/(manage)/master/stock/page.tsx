import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import { fetchProducts, fetchStockTotals } from "@/lib/nox/master/queries";
import StockBoard from "./stock-board";

export const dynamic = "force-dynamic";

// 在庫の入出庫（マスタIA再編 レーン③）。master-board.tsx の view === "products" から
// 「在庫の入出庫（append-only）」を移設した実ページ。
//
// ★移設前はセクション丸ごと isManagerUp ガードだったので、ページレベルで isManagerUp を要求する
//   （master/layout.tsx の入口ガードと二重）。真の防御は product_stock_add の RPC 側
//   （owner ∨ manager 自店）。
//
// 取得は「このページが描くのに要る分だけ」（裁定B・重複許容）:
//   products（商品セレクト）＋ stock_logs（「現在 n」＝Σdelta）。
export default async function MasterStockPage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");

  const supabase = await createClient();
  const [products, stock] = await Promise.all([
    fetchProducts(supabase),
    fetchStockTotals(supabase),
  ]);

  return <StockBoard isManagerUp={isManagerUp} initial={{ products, stock }} />;
}
