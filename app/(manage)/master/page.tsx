import MasterBoard from "./master-board";

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
export default function MasterPage() {
  return <MasterBoard />;
}
