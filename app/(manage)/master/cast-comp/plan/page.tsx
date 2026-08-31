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
  // U-2 ⑦: ノルマ統合のため settings_json（採用軸フラグ）も読む（norma/page.tsx の読みを移設）。
  const { data: stores } = await supabase.from("stores").select("id, settings_json").order("name").limit(1);
  const store = stores?.[0];
  const storeId = (store?.id as string | undefined) ?? "";
  if (!storeId) redirect("/master");
  const sj = store?.settings_json as Record<string, unknown> | null;
  const shimeiScope: "hon" | "hon_jonai" =
    (typeof sj?.shimei_norm_scope === "string" ? (sj.shimei_norm_scope as string).trim() : "") === "hon_jonai" ? "hon_jonai" : "hon";
  const sim = await loadStoreSimData(supabase, storeId);
  return <PlanBoard storeId={storeId} isManagerUp={isManagerUp} isOwner={role === "owner"} sim={sim}
    normFlags={{ salesEnabled: sj?.sales_norm_enabled === true, shimeiEnabled: sj?.shimei_norm_enabled === true, shimeiScope }} />;
}
