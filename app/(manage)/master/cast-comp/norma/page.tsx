import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import NormaBoard from "./norma-board";
import * as t from "@/lib/nox/ui/theme";

export const dynamic = "force-dynamic";

// ★GV-63（便 P173・2026-10-19）: 上段タブ「ノルマ設定（店）」の実ページ＝店のノルマ設定のみ（採用軸・キャスト別目標・未達の減額）。
//   旧＝U-2（裁定101 §4）で /master/cast-comp/plan#norma へリダイレクト→上段タブが選択されず、中身は待遇プランの基本・保証のまま（GV-63）。
//   プランごとの目標と達成ボーナスは待遇プランの下段タブ「ノルマ目標・ボーナス（プラン）」。読みは plan/page.tsx と同じ（settings_json の採用軸フラグ）。
export default async function CastCompNormaPage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, settings_json").order("name").limit(1);
  const store = stores?.[0];
  const storeId = (store?.id as string | undefined) ?? "";
  if (!storeId) redirect("/master");
  const sj = store?.settings_json as Record<string, unknown> | null;
  const shimeiScope: "hon" | "hon_jonai" =
    (typeof sj?.shimei_norm_scope === "string" ? (sj.shimei_norm_scope as string).trim() : "") === "hon_jonai" ? "hon_jonai" : "hon";
  return (
    <div data-page="norma-store">
      {/* 店共通の注記（旧＝待遇プランの「ノルマ・ボーナス」タブ下段の「店共通（全プラン）」カード） */}
      <div className="nox-cardtop" style={{ ...t.card, marginBottom: 10 }}>
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 2px" }}>雇用キャスト: 懲戒減給の法定上限（労基法91条）は給与計算側で自動制約されます（罰金の自動計算はありません）。</p>
        <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>委託キャスト: 未達処理には契約上の根拠が必要です（法定上限の自動適用はありません）。プランごとの目標と達成ボーナスは待遇プランの「ノルマ目標・ボーナス（プラン）」で設定します。</p>
      </div>
      <NormaBoard storeId={storeId} isManagerUp={isManagerUp} isOwner={role === "owner"} settings={sj}
        flags={{ salesEnabled: sj?.sales_norm_enabled === true, shimeiEnabled: sj?.shimei_norm_enabled === true, shimeiScope }} />
    </div>
  );
}
