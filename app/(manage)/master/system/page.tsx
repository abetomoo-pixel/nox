import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import KioskDevicePanel from "../kiosk-device-panel";
import KioskPinPanel from "../kiosk-pin-panel";
import PrinterPanel from "../printer-panel";
import SensitiveTaxPanel from "../sensitive-tax-panel";
import MasterPageHead from "../master-page-head";
import SystemBoard, { type SystemTab } from "./system-board";

export const dynamic = "force-dynamic";

// スタッフ・システム（DP1 P1・裁定 DP1-②/⑥/⑦）。master-board.tsx の view === "system" を移設した実ページ。
// URL はモック名準拠（nox-staff-system-settings ↔ /master/system）。
//
// ★構成は**モック準拠の4タブ**（端末／PIN／プリンタ／機密）。旧実装は3パネル縦積みで、
//   モックが別タブに置く「キオスク端末」と「操作担当PIN」が kiosk-panel.tsx に同居していた
//   ＝DP1-⑦ の再編で kiosk-device-panel / kiosk-pin-panel の2部品へ分割した（表示のみ・機能不変）。
//
// ★権限の出し分けは**旧 page.tsx の条件を逐語で維持**する:
//     KioskPanel   … role === "owner"
//     PrinterPanel … role === "owner" && storeId
//     SensitiveTax … isManagerUp
//   → 端末/PIN/プリンタは owner のみタブに載り、manager は「機密・税務情報」1タブになる
//     （タブ1件なのでタブ行は出ない＝SystemBoard の退化契約）。
//   真の防御は従来どおり各 RPC / RLS 側（ここは表示制御）。
//
// 取得は「このページが描くのに要る分だけ」:
//   allStores（端末・PIN の店舗列）／stores 先頭（printer の storeId と settings_json）／
//   casts（機密・税務パネルの対象一覧）。
//   ★products / product_categories / stock / seats はこのページが描かないので取らない。
export default async function MasterSystemPage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");
  const isOwner = role === "owner";

  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, settings_json").order("name").limit(1);
  const store = stores?.[0];
  const storeId = (store?.id as string | undefined) ?? "";
  // settings_json は printer プロファイル（レシート・プリンタ タブ）で使用する。
  const sj = store?.settings_json as Record<string, unknown> | null;
  const { data: allStores } = await supabase.from("stores").select("id, name").order("name");
  // 機密・税務パネル用の cast 一覧（RLS で自店のみ・manager+ 可視）。
  const { data: casts } = await supabase
    .from("casts").select("id, name, user_id").eq("store_id", storeId).eq("is_active", true).order("name");

  const tabs: SystemTab[] = [];
  if (isOwner) {
    tabs.push({
      key: "devices", label: "▣ キオスク端末",
      node: <KioskDevicePanel stores={(allStores ?? []) as { id: string; name: string }[]} />,
    });
    tabs.push({
      key: "pins", label: "● 操作担当PIN",
      node: <KioskPinPanel stores={(allStores ?? []) as { id: string; name: string }[]} />,
    });
  }
  if (isOwner && storeId) {
    tabs.push({
      key: "receipts", label: "▤ レシート・プリンタ",
      node: (
        <PrinterPanel
          storeId={storeId}
          initialProfile={{
            address: typeof sj?.receipt_address === "string" ? (sj.receipt_address as string) : "",
            tel: typeof sj?.receipt_tel === "string" ? (sj.receipt_tel as string) : "",
            regNo: typeof sj?.invoice_reg_no === "string" ? (sj.invoice_reg_no as string) : "",
            footer: typeof sj?.receipt_footer === "string" ? (sj.receipt_footer as string) : "",
          }}
        />
      ),
    });
  }
  tabs.push({
    key: "secrets", label: "▰ 機密・税務情報",
    node: <SensitiveTaxPanel casts={(casts ?? []) as { id: string; name: string }[]} isOwner={isOwner} />,
  });

  return (
    <div>
      <MasterPageHead
        title="スタッフ・システム"
        desc="店舗端末、操作権限、印刷、機密情報を管理します。"
      />
      <SystemBoard tabs={tabs} />
    </div>
  );
}
