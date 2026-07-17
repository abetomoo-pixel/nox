import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import { loadStoreSimData } from "@/lib/nox/payroll/sim-data";
import SimulatorPanel from "@/components/simulator-panel";
import MasterBoard from "./master-board";
import DeductionPanel from "./deduction-panel";
import SensitiveTaxPanel from "./sensitive-tax-panel";
import BusinessHoursPanel from "./business-hours-panel";
import CastRegisterPanel from "./cast-register-panel";
import NormConfigPanel from "./norm-config-panel";
import KioskPanel from "./kiosk-panel";
import PrinterPanel from "./printer-panel";

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
  const sj = store?.settings_json as Record<string, unknown> | null;
  const okuriMode = sj?.okuri_mode === "actual" ? "actual" : "flat";
  // mig0042: 送りベース額（発行プリフィル専用）＋ノルマ採用フラグ（fail-closed＝明示 true のみ有効）。
  const okuriBase = typeof sj?.okuri_base_amount === "number" && sj.okuri_base_amount > 0 ? (sj.okuri_base_amount as number) : 0;
  const salesNormEnabled = sj?.sales_norm_enabled === true;
  const shimeiNormEnabled = sj?.shimei_norm_enabled === true;
  const shimeiNormScope: "hon" | "hon_jonai" =
    (typeof sj?.shimei_norm_scope === "string" ? (sj.shimei_norm_scope as string).trim() : "") === "hon_jonai" ? "hon_jonai" : "hon";
  // 発行パネル用の cast 一覧（RLS で自店のみ・manager+ 可視）。
  const { data: casts } = await supabase.from("casts").select("id, name, user_id").eq("store_id", storeId).eq("is_active", true).order("name");
  // F3g キャスト会計（mig0039）: 店フラグ（settings_json.cast_register_enabled・owner トグル）＋
  //   cast 別 can_register（membership・owner/manager トグル）。真の防御は会計 RLS/RPC の 2段ゲート。
  const castRegEnabled = (store?.settings_json as Record<string, unknown> | null)?.cast_register_enabled === true;
  const castUserIds = (casts ?? []).map((c) => c.user_id).filter(Boolean) as string[];
  const { data: castMems } = castUserIds.length
    ? await supabase.from("memberships").select("id, user_id, can_register").eq("store_id", storeId).eq("role", "cast").in("user_id", castUserIds)
    : { data: [] as { id: string; user_id: string; can_register: boolean }[] };
  const memByUser = new Map((castMems ?? []).map((m) => [m.user_id, m]));
  const castRegRows = (casts ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    membershipId: (memByUser.get(c.user_id)?.id as string | undefined) ?? null,
    canRegister: (memByUser.get(c.user_id)?.can_register as boolean | undefined) ?? false,
  }));
  // F2f 報酬シミュレーター（店モード・任意プラン試算・天引きなし）用データ（storeId を明示スコープ＝owner の org 全店 RLS 対策）。
  const sim = isManagerUp && storeId ? await loadStoreSimData(supabase, storeId) : null;
  return (
    <>
      <MasterBoard storeId={storeId} isManagerUp={isManagerUp} isOwner={role === "owner"} />
      {isManagerUp && (
        <NormConfigPanel
          storeId={storeId}
          isOwner={role === "owner"}
          initialSalesEnabled={salesNormEnabled}
          initialShimeiEnabled={shimeiNormEnabled}
          initialShimeiScope={shimeiNormScope}
        />
      )}
      {isManagerUp && (
        <BusinessHoursPanel stores={(allStores ?? []) as { id: string; name: string }[]} />
      )}
      {isManagerUp && (
        <DeductionPanel
          storeId={storeId}
          casts={(casts ?? []) as { id: string; name: string }[]}
          isOwner={role === "owner"}
          initialOkuriMode={okuriMode}
          initialOkuriBase={okuriBase}
        />
      )}
      {isManagerUp && (
        <CastRegisterPanel
          storeId={storeId}
          isOwner={role === "owner"}
          initialEnabled={castRegEnabled}
          casts={castRegRows}
        />
      )}
      {isManagerUp && (
        <SensitiveTaxPanel casts={(casts ?? []) as { id: string; name: string }[]} isOwner={role === "owner"} />
      )}
      {role === "owner" && (
        <KioskPanel stores={(allStores ?? []) as { id: string; name: string }[]} />
      )}
      {role === "owner" && storeId && (
        <PrinterPanel
          storeId={storeId}
          initialProfile={{
            address: typeof sj?.receipt_address === "string" ? (sj.receipt_address as string) : "",
            tel: typeof sj?.receipt_tel === "string" ? (sj.receipt_tel as string) : "",
            regNo: typeof sj?.invoice_reg_no === "string" ? (sj.invoice_reg_no as string) : "",
            footer: typeof sj?.receipt_footer === "string" ? (sj.receipt_footer as string) : "",
          }}
        />
      )}
      {sim && (
        <SimulatorPanel mode="store" plans={sim.plans} masters={sim.masters} openAdv={0} openOkuri={0} defaultTaxMode="委託" />
      )}
    </>
  );
}
