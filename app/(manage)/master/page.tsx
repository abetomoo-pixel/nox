import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import { loadStoreSimData } from "@/lib/nox/payroll/sim-data";
import SimulatorPanel from "@/components/simulator-panel";
import MasterBoard from "./master-board";
import DeductionPanel from "./deduction-panel";
import SensitiveTaxPanel from "./sensitive-tax-panel";
import BusinessHoursPanel from "./business-hours-panel";

export const dynamic = "force-dynamic";

// マスタ管理（manager/owner。staff は nav 非表示・直打ちでも操作 UI 非表示＋RPC 拒否）。
export default async function MasterPage() {
  const supabase = await createClient();
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  const { data: stores } = await supabase.from("stores").select("id, name, settings_json").order("name").limit(1);
  const store = stores?.[0];
  const storeId = store?.id ?? "";
  // 営業時間パネル用の全店リスト（B-5・owner=org 全店で store select・manager=RLS で自店1件）
  const { data: allStores } = await supabase.from("stores").select("id, name").order("name");
  // okuri_mode は settings_json 相乗り（既定 'flat'）。owner のみトグル可（set_store_okuri_mode）。
  const okuriMode = (store?.settings_json as Record<string, unknown> | null)?.okuri_mode === "actual" ? "actual" : "flat";
  // 発行パネル用の cast 一覧（RLS で自店のみ・manager+ 可視）。
  const { data: casts } = await supabase.from("casts").select("id, name").eq("store_id", storeId).eq("is_active", true).order("name");
  // F2f 報酬シミュレーター（店モード・任意プラン試算・天引きなし）用データ（storeId を明示スコープ＝owner の org 全店 RLS 対策）。
  const sim = isManagerUp && storeId ? await loadStoreSimData(supabase, storeId) : null;
  return (
    <>
      <MasterBoard storeId={storeId} isManagerUp={isManagerUp} isOwner={role === "owner"} />
      {isManagerUp && (
        <BusinessHoursPanel stores={(allStores ?? []) as { id: string; name: string }[]} />
      )}
      {isManagerUp && (
        <DeductionPanel
          storeId={storeId}
          casts={(casts ?? []) as { id: string; name: string }[]}
          isOwner={role === "owner"}
          initialOkuriMode={okuriMode}
        />
      )}
      {isManagerUp && (
        <SensitiveTaxPanel casts={(casts ?? []) as { id: string; name: string }[]} isOwner={role === "owner"} />
      )}
      {sim && (
        <SimulatorPanel mode="store" plans={sim.plans} masters={sim.masters} openAdv={0} openOkuri={0} defaultTaxMode="委託" variant="dark" />
      )}
    </>
  );
}
