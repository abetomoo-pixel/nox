import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import AnalyticsBoard from "./analytics-board";

export const dynamic = "force-dynamic";

// 分析ダッシュボード（F3b-A 塊3・owner/manager のみ）。売上貢献=get_cast_sales（mig0014・
// staff 一律 forbidden=D6a）＋指名分析=get_cast_ranking（mig0011・金額列なし）を1画面統合。
// staff/cast はナビ非表示＋直打ち redirect（payroll 同型・真の防御は RPC ゲート）。
// 店セレクタ=具体店必須（両 RPC とも p_store_id null 非対応＝store 解決失敗で forbidden。
// 全店合算は RPC 改修が要るためスコープ外）。casts は売上貢献側の名前解決用
// （is_active で絞らない＝退店 cast の過去実績も名前を出す。ranking は RPC が cast_name を返す）
// 兼 section3 主要客リストの cast select 候補（B-2・store_id∧is_active でクライアント絞り）。
export default async function AnalyticsPage() {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role !== "owner" && role !== "manager") redirect("/register");
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, name").order("name");
  const { data: casts } = await supabase.from("casts").select("id, name, store_id, is_active");
  return (
    <AnalyticsBoard
      stores={(stores ?? []) as { id: string; name: string }[]}
      casts={(casts ?? []) as { id: string; name: string; store_id: string; is_active: boolean }[]}
    />
  );
}
