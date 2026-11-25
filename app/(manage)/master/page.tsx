import MasterBoard from "./master-board";
import { managePageGate } from "@/lib/nox/nav/page-gate";
import { createClient } from "@/lib/supabase/server";
import { currentStoreIdOf } from "@/lib/nox/store/current-server"; // ★0203（12:00 の ■2-a）
import { mig0202bOn, mig0203On, mig0212On } from "@/lib/nox/rules-0175/flag";
import { inquiryCardShownOf } from "@/lib/nox/inquiry/labels"; // ★0212
import { getSessionRole } from "@/lib/nox/auth";
import { supportCardShownOf } from "@/lib/nox/support/grant-entry"; // ★起票152

export const dynamic = "force-dynamic";

// マスタ管理のハブ（manager/owner。staff は nav 非表示・入口は master/layout.tsx が遮断）。
//
// ★DP1 P1（2026-08-21・裁定 DP1-②）: 残っていた3ビュー（seat / hours / system）を実ルート化した。
//   → /master/seats ・ /master/business-hours ・ /master/system
//   これに伴い、本ページが server で組んで MasterBoard へ渡していた `panels` prop（hours / system）と、
//   そのための取得（stores 先頭・settings_json・allStores・casts）を**新ルートへ移送**した。
//   ★移送であって改変ではない＝各パネルのコンポーネント・props・RPC・権限分岐は1文字も変えていない。
//   ★レーン②/③（products / categories / stock の実ページ化）と同型の3度目。
//
// 本ページに残る責務は**ハブの描画のみ**。ハブが読むデータ（商品・カテゴリ・在庫・席の件数）は
// MasterBoard が client で取得する（従来どおり）＝ここでの取得はゼロになった。
export default async function MasterPage() {
  await managePageGate(); // ★教訓142（2026-11-11）: 柵（キャストの入場・規約・初期設定）はページの先頭で＝画面の移動でも効く
  const storeId = mig0203On() ? await currentStoreIdOf(await createClient()) : null; // ★0203（12:00 の ■2-a）: 今見ている店（旗 false＝今のまま）
  // ★起票152（2026-11-24）: 「店舗・運用」に「サポート許可」のカード＝オーナーだけ・デモの会社には出さない（タブを出す条件と同じ）
  const { role } = await getSessionRole();
  let showSupport = false;
  if (mig0202bOn() && role === "owner") {
    const supabase = await createClient();
    const { data: orgId } = await supabase.rpc("auth_org_id");
    const { data: orgRow } = orgId ? await supabase.from("orgs").select("is_demo").eq("id", orgId as string).maybeSingle() : { data: null };
    showSupport = !!orgId && supportCardShownOf({ flag: true, role, isDemo: orgRow?.is_demo === true });
  }
  const showInquiry = inquiryCardShownOf({ flag: mig0212On(), role }); // ★0212: 運営への問い合わせ（オーナーと店長・旗の後ろ）
  return <MasterBoard storeId={storeId} showSupport={showSupport} showInquiry={showInquiry} />;
}
