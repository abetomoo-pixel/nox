import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import StoreProfilePanel from "../store-profile-panel";
import MineSettingsPanel from "../mine-settings-panel"; // ★裁定326-1（0160・便 M1-2）: キャスト画面の設定（owner／manager）
import MasterPageHead from "../master-page-head";

export const dynamic = "force-dynamic";

// 店舗情報（★起票86・便 V-7・2026-09-28）: business-hours の先頭に置かれていた StoreProfilePanel（mig0144 店舗情報／シフト運用・0155 売掛・記録の保持）を
//   独立ページへ切り出した実ルート。マスタハブの「店舗・運用」節に「店舗情報」カード・nav.ts の店舗・端末群に 1 行。
//   ★移設は器の付け替えのみ＝StoreProfilePanel は 1 文字も変えていない（props も stores／isOwner で同一）。
//   ページレベルでも isManagerUp を要求（master/layout.tsx の入口ガードと二重）。真の防御は set_store_profile の owner 判定と stores の RLS。
export default async function MasterStoreProfilePage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");

  const supabase = await createClient();
  const { data: allStores } = await supabase.from("stores").select("id, name").order("name");

  return (
    <div className="nox-mv1">
      <MasterPageHead
        eyebrow="STORE PROFILE"
        title="店舗情報"
        desc="店舗名・略称・顧客情報の利用目的と保持年数、シフト運用（キャスト確認）、売掛を使うかどうかと操作ログの保持、キャスト画面の設定。オーナー限定の項目は他のロールには表示されません。"
      />
      <StoreProfilePanel stores={(allStores ?? []) as { id: string; name: string }[]} isOwner={role === "owner"} />
      {/* ★裁定326-1／326-8（便 M1-2）: キャスト画面の設定＝店舗情報カードの隣（owner／manager 自店＝RPC set_store_mine_settings の判定と同じ） */}
      <MineSettingsPanel stores={(allStores ?? []) as { id: string; name: string }[]} />
    </div>
  );
}
