import MasterBoard from "./master-board";
import { managePageGate } from "@/lib/nox/nav/page-gate";
import { createClient } from "@/lib/supabase/server";
import { currentStoreIdOf } from "@/lib/nox/store/current-server"; // ★0203（12:00 の ■2-a）
import { mig0203On } from "@/lib/nox/rules-0175/flag";

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
  return <MasterBoard storeId={storeId} />;
}
