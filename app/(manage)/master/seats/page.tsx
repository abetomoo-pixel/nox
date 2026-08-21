import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import SeatsBoard from "./seats-board";

export const dynamic = "force-dynamic";

// 席・卓マスター（DP1 P1・裁定 DP1-②/⑥）。master-board.tsx の view === "seat" を移設した実ページ。
// URL はモック名準拠（nox-seat-table-settings ↔ /master/seats）。
//
// ★ページレベルでも isManagerUp を要求（master/layout.tsx の入口ガードと二重）。
//   真の防御は従来どおり set_seat の RPC 側（owner ∨ manager 自店）と seats の SELECT RLS。
//
// 取得は「このページが描くのに要る分だけ」（裁定B・重複許容）:
//   seats（KPI4・一覧・編集フォーム）＋ storeId（set_seat の p_store_id）。
//   ★products / product_categories / stock_logs はこのページが描かないので取らない
//     （旧 master-board は同じ load() で4系統をまとめて取っていた＝ハブ側に残す）。
export default async function MasterSeatsPage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");

  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id").order("name").limit(1);
  const storeId = (stores?.[0]?.id as string | undefined) ?? "";
  const { data: seats } = await supabase
    .from("seats")
    .select("id, name, kind, sort_order, is_active")
    .order("sort_order");

  return (
    <SeatsBoard
      storeId={storeId}
      isManagerUp={isManagerUp}
      initial={(seats ?? []) as { id: string; name: string; kind: string | null; sort_order: number; is_active: boolean }[]}
    />
  );
}
