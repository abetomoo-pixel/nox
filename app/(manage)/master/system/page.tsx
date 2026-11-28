import { redirect } from "next/navigation";
import { currentStoreRowsOf } from "@/lib/nox/store/current-server"; // ★0203
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionRole } from "@/lib/nox/auth";
import KioskDevicePanel from "../kiosk-device-panel";
import KioskPinPanel from "../kiosk-pin-panel";
import PrinterPanel from "../printer-panel";
import { mig0194On } from "@/lib/nox/rules-0175/flag"; // ★0194（裁定444 ①②）
const isOwner0194 = (role: string | null | undefined): boolean => role === "owner" || (mig0194On() && role === "manager");
import SensitiveTaxPanel from "../sensitive-tax-panel";
import SupportGrantPanel from "@/components/nox/support-grant-panel"; // ★枝 night1121-ops-v2（0202b 版 4・旗の後ろ）
import { mig0202bOn } from "@/lib/nox/rules-0175/flag";
import { SUPPORT_TAB_KEY, supportMissingNoteOf } from "@/lib/nox/support/grant-entry"; // ★起票152: ?tab=support で開く・無いときの 1 行
import Link from "next/link"; // ★裁定330（便 MC2）: 機能の公開は店舗設定 ＞ 利用機能へ（案内行のリンク）
import MasterPageHead from "../master-page-head";
import SystemBoard, { type SystemTab } from "./system-board";
import { managePageGate } from "@/lib/nox/nav/page-gate";
import { printedRegNoOf } from "@/lib/nox/rules-0175/invoice-receipt"; // ★裁定536（決め 11・食い違い 118）: 登録番号は料金・会計の列と「登録済み」から

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
export default async function MasterSystemPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await managePageGate(); // ★教訓142（2026-11-11）: 柵（キャストの入場・規約・初期設定）はページの先頭で＝画面の移動でも効く
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  const canDevices = isOwner0194(role); // ★0194（裁定444 ①②）: 店長（自店）にも端末の発行・削除とレシートの店情報
  if (!isManagerUp) redirect("/dashboard");
  const isOwner = role === "owner";

  const supabase = await createClient();
  const { data: stores } = await currentStoreRowsOf(supabase, "id, org_id, settings_json, invoice_status, invoice_reg_no") /* ★0203（■2-e）: 今見ている店（旗 false＝今のまま＝店名順の先頭） */;
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
  const { data: orgDemo } = await supabase.from("orgs").select("is_demo").limit(1).maybeSingle(); // ★便 M3 M-28 ③: デモ org は端末を発行できない（403）＝KPI も 0 台（一覧と同じ元）
  if (canDevices && orgDemo?.is_demo === true) { deviceTotal = 0; deviceInactive = 0; }
  else if (canDevices) {
    const orgId = (store?.org_id as string | undefined) ?? "";
    if (orgId) {
      try {
        const admin = createAdminClient();
        const { data: devs } = isOwner ? await admin.from("kiosk_devices").select("id, is_active").eq("org_id", orgId) : await admin.from("kiosk_devices").select("id, is_active").eq("org_id", orgId).eq("store_id", storeId ?? ""); // ★0194: 店長は自店の台数
        deviceTotal = (devs ?? []).length;
        deviceInactive = (devs ?? []).filter((d) => d.is_active !== true).length;
      } catch { /* KPI は補助表示＝失敗しても画面は生きる（現行の「—」へフォールバック） */ }
    }
  }

  const tabs: SystemTab[] = [];
  if (canDevices) {
    tabs.push({
      key: "devices", label: "▣ キオスク端末",
      node: <KioskDevicePanel stores={(isOwner ? (allStores ?? []) : (allStores ?? []).filter((s2) => s2.id === storeId)) as { id: string; name: string }[]} />, // ★0194: 店長は自店だけ（route と RPC も自店で照合）
    });
  }
  // ★M-11b: PIN タブは manager にも出す（staff_pin_status が owner ∨ manager 自店を許可＝mig0108。
  //   set_staff_pin も従来から manager 自店可。ポリシー保存だけ owner 限定＝パネル内で表示制御）。
  tabs.push({
    key: "pins", label: "● 操作担当PIN",
    node: <KioskPinPanel stores={(allStores ?? []) as { id: string; name: string }[]} isOwner={isOwner} />,
  });
  if (canDevices && storeId) { // ★0194（裁定444 ②）: 店長は自店の領収書の店情報（プリンタ設定は 0193 で開いた・発行者＝InvoiceProfileFields は管理者のまま＝isOwner）
    tabs.push({
      key: "receipts", label: "▤ レシート・プリンタ",
      node: (
        <PrinterPanel
          storeId={storeId}
          storeName={(allStores ?? []).find((s2) => s2.id === storeId)?.name ?? ""}
          initialProfile={{
            address: typeof sj?.receipt_address === "string" ? (sj.receipt_address as string) : "",
            tel: typeof sj?.receipt_tel === "string" ? (sj.receipt_tel as string) : "",
            regNo: typeof sj?.invoice_reg_no === "string" ? (sj.invoice_reg_no as string) : "", // ★裁定536（118）: 画面にも印字にも出さない＝住所などの保存のときにそのまま送り返すだけ（今ある値を消さない）
            footer: typeof sj?.receipt_footer === "string" ? (sj.receipt_footer as string) : "",
          }}
          printRegNo={printedRegNoOf(store)} /* ★裁定536（118）: 印字される登録番号＝料金・会計の列・「登録済み」のときだけ（読むだけの表示） */
        />
      ),
    });
  }
  // ★C層①（mig0135・設計書 v1 §4・裁定182）: 機能の公開＝owner のみタブを出す（manager 以下は配列に入れない＝非表示）。
  //   読取は feature_flags（RLS）・切替は flag_set（RPC 側でも owner 限定＝二重）。
  // ★裁定330（便 MC2）: 機能の公開は「店舗設定 ＞ 利用機能」（/master/store-profile?tab=features）へ移した＝ここにはタブを置かない（ページ上部に案内行）。
  tabs.push({
    key: "secrets", label: "▰ 機密・税務情報",
    node: <SensitiveTaxPanel casts={(casts ?? []) as { id: string; name: string }[]}
      stores={(allStores ?? []) as { id: string; name: string }[]} isOwner={isOwner} isManager={role === "manager"} />, // ★F193-4: 店長にも機密の入力欄（0193）
  });
  // ★枝 night1121-ops-v2（0202b 版 4・旗 MIG_0202B_APPLIED の後ろ）: オーナーだけ「サポート許可」（1／3／7 日・取り消し）と「導入完了にする」
  let ownerDemo = false; // ★起票152: デモの会社のオーナーが URL で開いたときの 1 行の出し分け
  if (mig0202bOn() && role === "owner") {
    const { data: orgId } = await supabase.rpc("auth_org_id");
    const { data: orgRow } = orgId ? await supabase.from("orgs").select("is_demo").eq("id", orgId as string).maybeSingle() : { data: null };
    ownerDemo = orgRow?.is_demo === true;
    if (orgId && orgRow?.is_demo !== true) tabs.push(   // デモの会社には出さない（関数も forbidden (demo)・reset で戻らない）
     { key: "support", label: "◇ サポート許可", node: <SupportGrantPanel orgId={orgId as string} /> });
  }

  // ★起票152（2026-11-24）: 直通の URL（/master/system?tab=support）で開いたとき＝サポート許可のタブを最初に開く。オーナー以外（店長）・デモの会社は今の決まりのままタブを出さず 1 行
  const requestedTab = (await searchParams).tab ?? null;
  const supportNote = supportMissingNoteOf({ requestedTab, hasSupportTab: tabs.some((x) => x.key === SUPPORT_TAB_KEY), role: role ?? null, isDemo: ownerDemo });

  return (
    <div className="nox-mv1">
      <MasterPageHead
        eyebrow="STAFF & SYSTEM"
        title="スタッフ・システム"
        desc="店舗端末、操作権限、印刷、機密情報を管理します。"
      />
      {/* ★裁定330（便 MC2）: 機能の公開（feature_flags）は「店舗設定 ＞ 利用機能」へ移した＝旧 URL（#features）で来た人への案内行 */}
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "-6px 0 12px" }}>機能の公開（スタッフシフト・締め解除フロー）は <Link href="/master/store-profile?tab=shift" style={{ color: "var(--primary)", fontWeight: 700 }}>店舗設定 › シフトと打刻</Link> へ移りました。</p>
      <div className="nox-kpirow">
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">登録端末</div>
          <div className="nox-kpi2-v num">{deviceTotal === null ? "—" : <>{deviceTotal}<small>台</small></>}</div>
          <div className="nox-kpi2-s">{deviceTotal === null ? "「キオスク端末」タブで確認"
            : orgDemo?.is_demo === true ? "デモ環境では端末を発行できません" : `${deviceTotal} 台登録・有効 ${deviceTotal - deviceInactive}`}</div>{/* ★便 M3 M-29 ⑥: 有効台数／登録台数 */}
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
      </div>
      {supportNote && <p data-support-note="1" style={{ fontSize: 13, color: "var(--ink)", fontWeight: 700, margin: "0 0 12px", textAlign: "center" }}>{supportNote}</p>}
      <SystemBoard tabs={tabs} initialKey={requestedTab === SUPPORT_TAB_KEY && tabs.some((x) => x.key === SUPPORT_TAB_KEY) ? SUPPORT_TAB_KEY : null} />
    </div>
  );
}
