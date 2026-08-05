import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import { fetchProducts, fetchStockTotals } from "@/lib/nox/master/queries";
import StockBoard from "./stock-board";

export const dynamic = "force-dynamic";

// 在庫（棚卸し＋履歴）＝④d-2（裁定N・案X）。旧「在庫の入出庫」フォームを撤去し、
// 棚卸し（実数→差分計算→product_stock_add）と stock_logs の履歴一覧に作り替えた実ページ。
//
// ★ページレベルで isManagerUp を要求（master/layout.tsx の入口ガードと二重）。
//   真の防御は product_stock_add の RPC 側（owner ∨ manager 自店）と stock_logs の SELECT RLS。
//
// 取得は「このページが描くのに要る分だけ」（裁定B・重複許容）:
//   products（棚卸しセレクト・履歴の商品名解決）＋ 現在庫（fetchStockTotals＝④d-1 の RPC）
//   ＋ users（履歴の記録者名解決＝/audit と同型。manager の users RLS は自店メンバー＋本人のみ
//   ＝見えない actor は id 断片表示に落ちるだけ・fail-closed）。
export default async function MasterStockPage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");

  const supabase = await createClient();
  const [products, stock, usersRes] = await Promise.all([
    fetchProducts(supabase),
    fetchStockTotals(supabase),
    supabase.from("users").select("id, name"),
  ]);

  return (
    <StockBoard
      isManagerUp={isManagerUp}
      initial={{ products, stock }}
      users={(usersRes.data ?? []) as { id: string; name: string }[]}
    />
  );
}
