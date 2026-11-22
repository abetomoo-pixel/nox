import { redirect } from "next/navigation";
import { mig0203On } from "@/lib/nox/rules-0175/flag"; // ★0203
import { currentStoreRowsOf } from "@/lib/nox/store/current-server"; // ★0203
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import SeatsBoard from "./seats-board";
import { managePageGate } from "@/lib/nox/nav/page-gate";
import { hiddenKindsOf } from "@/lib/nox/floor-kinds"; // ★0164（便 W5-2a）

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
  await managePageGate(); // ★教訓142（2026-11-11）: 柵（キャストの入場・規約・初期設定）はページの先頭で＝画面の移動でも効く
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");

  const supabase = await createClient();
  const { data: stores } = await currentStoreRowsOf(supabase, "id, use_vip, use_counter") /* ★0203（■2-e）: 今見ている店（旗 false＝今のまま＝店名順の先頭） */; // ★0164（裁定334・便 W5-2a）: 種別の表示切替
  const storeId = (stores?.[0]?.id as string | undefined) ?? "";
  const hiddenKinds = hiddenKindsOf({ use_vip: stores?.[0]?.use_vip !== false, use_counter: stores?.[0]?.use_counter !== false });
  const { data: seats0 } = await supabase
    .from("seats")
    .select("id, name, kind, sort_order, is_active")
    .order("sort_order");
  // ★0203（■2-e）: オーナーの今見ている店の席だけ（旗 false＝今のまま）
  const seatIds = mig0203On() && storeId ? new Set((((await supabase.from("seats").select("id").eq("store_id", storeId)).data ?? []) as { id: string }[]).map((r) => r.id)) : null;
  const seats = seatIds ? (seats0 ?? []).filter((x) => seatIds.has(x.id as string)) : seats0;

  return (
    <SeatsBoard
      storeId={storeId}
      isManagerUp={isManagerUp}
      hiddenKinds={hiddenKinds}
      initial={(seats ?? []) as { id: string; name: string; kind: string | null; sort_order: number; is_active: boolean }[]}
    />
  );
}
