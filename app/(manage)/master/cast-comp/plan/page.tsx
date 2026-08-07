import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import { loadStoreSimData } from "@/lib/nox/payroll/sim-data";
import PlanBoard from "./plan-board";

export const dynamic = "force-dynamic";

// 待遇プラン・報酬シミュレーター（D2-1）。旧 /master の view "cast" から実ページ化。
// 取得は master/page.tsx の旧 panels.cast 組み立てを移設（sim-data.ts の読み経路は不変）。
export default async function CastCompPlanPage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id").order("name").limit(1);
  const storeId = (stores?.[0]?.id as string | undefined) ?? "";
  if (!storeId) redirect("/master");
  const sim = await loadStoreSimData(supabase, storeId);
  return <PlanBoard storeId={storeId} isManagerUp={isManagerUp} isOwner={role === "owner"} sim={sim} />;
}
