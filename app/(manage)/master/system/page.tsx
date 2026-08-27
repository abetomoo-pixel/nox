import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
// ★権限の出し分け:
//     KioskDevicePanel … role === "owner"（旧 page.tsx 逐語）
//     KioskPinPanel    … isManagerUp（★M-11b で manager にも開放＝staff_pin_status が
//                        owner ∨ manager 自店を許可・set_staff_pin も従来から manager 自店可。
//                        ポリシー保存だけ owner 限定＝パネル内で表示制御）
//     PrinterPanel     … role === "owner" && storeId（旧 page.tsx 逐語）
//     SensitiveTax     … isManagerUp
//   → manager は「操作担当PIN」＋「機密・税務情報」の2タブになる。
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
  const { data: stores } = await supabase.from("stores").select("id, org_id, settings_json").order("name").limit(1);
  const store = stores?.[0];
  const storeId = (store?.id as string | undefined) ?? "";
  // settings_json は printer プロファイル（レシート・プリンタ タブ）で使用する。
  const sj = store?.settings_json as Record<string, unknown> | null;
  const { data: allStores } = await supabase.from("stores").select("id, name").order("name");
  // 機密・税務パネル用の cast 一覧（RLS で自店のみ・manager+ 可視）。
  const { data: casts } = await supabase
    .from("casts").select("id, name, user_id").eq("store_id", storeId).eq("is_active", true).order("name");

  // ★DP-R 第3弾（教訓26＝構造照合）: モックの KPI帯4枚。**数えられるものだけ数える**。
  //   ・登録端末: kiosk_devices は **deny-all**（owner でも直 SELECT 不可・管理用の読み口は
  //     /api/kiosk/provision の GET だけ＝mig0043）＝server では数えられない → 「—」。
  //   ・プリンタ: settings_json.printer_enabled が実体（printer-panel と同じキー）。
  //   ・要確認（セキュリティ）: 該当する集計が無い → 「—」＋準備中。
  // ★M-11b（mig0108）: staff_pin も deny-all のまま **staff_pin_status**（読取専用 RPC）で
  //   「設定済み数」を数えられるようになった＝KPI を「PIN設定済み X / 対象 Y名」へ。
  //   対象＝RPC の返す行（owner/manager/staff(can_register)＝set_staff_pin の bad target 条件と同一）。
  //   owner は全店合算・manager は自店のみ（他店は RPC が forbidden＝呼ばない）。
  let pinTargets = 0;
  let pinSet: number | null = null;
  {
    const pinStores = isOwner ? (allStores ?? []) : (allStores ?? []).filter((s2) => s2.id === storeId);
    let setCnt = 0; let ok = true;
    for (const s2 of pinStores) {
      const { data: st, error } = await supabase.rpc("staff_pin_status", { p_store_id: s2.id });
      if (error) { ok = false; continue; }
      const rows = (st ?? []) as Array<{ has_pin: boolean }>;
      pinTargets += rows.length;
      setCnt += rows.filter((r) => r.has_pin === true).length;
    }
    pinSet = ok || pinTargets > 0 ? setCnt : null;
  }
  const printerOn = sj?.printer_enabled === true;

  // ★M-11a B-0（起票#32 の解消）: KPI「登録端末」を実数にする。
  //   kiosk_devices は deny-all＝ユーザーセッションでは読めないため、/api/kiosk/provision GET と同じく
  //   admin（サービスキー・サーバ専用）で org スコープの件数だけを数える。★owner のみ
  //   （端末管理の可視は provision GET の owner 限定に合わせる＝manager へ新しく開示しない）。
  let deviceTotal: number | null = null;
  let deviceInactive = 0;
  if (isOwner) {
    const orgId = (store?.org_id as string | undefined) ?? "";
    if (orgId) {
      try {
        const admin = createAdminClient();
        const { data: devs } = await admin.from("kiosk_devices").select("id, is_active").eq("org_id", orgId);
        deviceTotal = (devs ?? []).length;
        deviceInactive = (devs ?? []).filter((d) => d.is_active !== true).length;
      } catch { /* KPI は補助表示＝失敗しても画面は生きる（現行の「—」へフォールバック） */ }
    }
  }

  const tabs: SystemTab[] = [];
  if (isOwner) {
    tabs.push({
      key: "devices", label: "▣ キオスク端末",
      node: <KioskDevicePanel stores={(allStores ?? []) as { id: string; name: string }[]} />,
    });
  }
  // ★M-11b: PIN タブは manager にも出す（staff_pin_status が owner ∨ manager 自店を許可＝mig0108。
  //   set_staff_pin も従来から manager 自店可。ポリシー保存だけ owner 限定＝パネル内で表示制御）。
  tabs.push({
    key: "pins", label: "● 操作担当PIN",
    node: <KioskPinPanel stores={(allStores ?? []) as { id: string; name: string }[]} isOwner={isOwner} />,
  });
  if (isOwner && storeId) {
    tabs.push({
      key: "receipts", label: "▤ レシート・プリンタ",
      node: (
        <PrinterPanel
          storeId={storeId}
          storeName={(allStores ?? []).find((s2) => s2.id === storeId)?.name ?? ""}
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
    node: <SensitiveTaxPanel casts={(casts ?? []) as { id: string; name: string }[]}
      stores={(allStores ?? []) as { id: string; name: string }[]} isOwner={isOwner} />,
  });

  return (
    <div className="nox-mv1">
      <MasterPageHead
        eyebrow="STAFF & SYSTEM"
        title="スタッフ・システム"
        desc="店舗端末、操作権限、印刷、機密情報を管理します。"
      />
      <div className="nox-kpirow">
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">登録端末</div>
          <div className="nox-kpi2-v num">{deviceTotal === null ? "—" : <>{deviceTotal}<small>台</small></>}</div>
          <div className="nox-kpi2-s">{deviceTotal === null ? "「キオスク端末」タブで確認"
            : deviceInactive === 0 ? "すべて有効" : `${deviceInactive}台 無効`}</div>
        </div>
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">PIN設定済み</div>
          <div className="nox-kpi2-v num">{pinSet === null ? "—" : <>{pinSet}<small>／対象 {pinTargets}名</small></>}</div>
          <div className="nox-kpi2-s">{pinSet === null ? "「操作担当PIN」タブで確認"
            : pinSet >= pinTargets ? "全員 設定済み" : `${pinTargets - pinSet}名 未設定`}</div>
        </div>
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">プリンタ</div>
          <div className="nox-kpi2-v num" style={{ fontSize: 18 }}>{printerOn ? "有効" : "無効"}</div>
          <div className="nox-kpi2-s">{printerOn ? "レシート印刷が使えます" : "レシート印刷は使いません"}</div>
        </div>
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">要確認</div>
          <div className="nox-kpi2-v num">—</div>
          <div className="nox-kpi2-s">準備中</div>
        </div>
      </div>
      <SystemBoard tabs={tabs} />
    </div>
  );
}
