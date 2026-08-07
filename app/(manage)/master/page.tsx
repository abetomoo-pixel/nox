import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import MasterBoard from "./master-board";
import SensitiveTaxPanel from "./sensitive-tax-panel";
import BusinessHoursPanel from "./business-hours-panel";
import KioskPanel from "./kiosk-panel";
import PrinterPanel from "./printer-panel";

export const dynamic = "force-dynamic";

// マスタ管理（manager/owner。staff は nav 非表示・直打ちでも操作 UI 非表示＋RPC 拒否）。
export default async function MasterPage() {
  const supabase = await createClient();
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  const { data: stores } = await supabase.from("stores")
    .select("id, name, settings_json, hon_fee, jonai_fee, dohan_fee, service_rate, card_tax_rate, round_unit, round_mode, set_min, set_fee, ext_min, ext_fee, time_mode, time_per")
    .order("name").limit(1);
  const store = stores?.[0];
  const storeId = store?.id ?? "";
  // 営業時間パネル用の全店リスト（B-5・owner=org 全店で store select・manager=RLS で自店1件）
  const { data: allStores } = await supabase.from("stores").select("id, name").order("name");
  // settings_json は printer プロファイル（system パネル）で使用する。
  const sj = store?.settings_json as Record<string, unknown> | null;
  // 機微・税務パネル（system）用の cast 一覧（RLS で自店のみ・manager+ 可視）。
  const { data: casts } = await supabase.from("casts").select("id, name, user_id").eq("store_id", storeId).eq("is_active", true).order("name");
  return (
    /* 段0R その4: ハブ⇄セクションの「その場で切り替え」。パネルは従来どおりここ（server）で
       props を組んで生成し、表示単位ごとに MasterBoard へ ReactNode で渡す。
       ★コンポーネント・機能・RPC・引数はいずれも1文字も変えていない（Fold ラッパは撤去）。 */
    <MasterBoard
      storeId={storeId}
      isManagerUp={isManagerUp}
      isOwner={role === "owner"}
      panels={{
        hours: (
          <>
      {isManagerUp && (
        <BusinessHoursPanel stores={(allStores ?? []) as { id: string; name: string }[]} />
      )}
          </>
        ),
        system: (
          <>
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
      {isManagerUp && (
        <SensitiveTaxPanel casts={(casts ?? []) as { id: string; name: string }[]} isOwner={role === "owner"} />
      )}
          </>
        ),
      }}
    />
  );
}
