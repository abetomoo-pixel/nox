import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import BusinessHoursPanel from "../business-hours-panel";
import MasterPageHead from "../master-page-head";

export const dynamic = "force-dynamic";

// 営業時間・定休日（DP1 P1・裁定 DP1-②/⑥）。master-board.tsx の view === "hours" を移設した実ページ。
// URL はモック名準拠（nox-business-hours-settings ↔ /master/business-hours）。
//
// ★移設は「器の付け替えのみ」＝BusinessHoursPanel は1文字も変えていない（props も stores のみで同一）。
//   旧経路は page.tsx(server) が JSX を組んで MasterBoard へ ReactNode で渡していた＝
//   共有 state はゼロだったため、ここへ移すだけで完結する。
//
// ★ページレベルでも isManagerUp を要求（master/layout.tsx の入口ガードと二重）。
//   真の防御は従来どおり営業時間 RPC 側と stores の RLS。
//
// 取得は「このページが描くのに要る分だけ」:
//   allStores（B-5＝owner は org 全店で store select・manager は RLS で自店1件）のみ。
//
// ★DP-R 第3弾（教訓26＝構造照合・相談役裁定「器を全構築・実体なきものは準備中」）:
//   モックの4ブロック（KPI帯4枚／週間営業時間／特別営業日・臨時休業／特別日を追加）へ追随した。
//   ★KPI帯と3カードはすべて BusinessHoursPanel が返す（forms の state を持つのが panel のため）。
//   ★特別日は実体が無い（mig0032 は「店×曜日」の1テーブルのみ）＝器を置いて disabled＋準備中。
//     旧コメントの「作らない（#7 後送り）」は本裁定で上書き＝器は出す・操作はさせない。
export default async function MasterBusinessHoursPage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");

  const supabase = await createClient();
  const { data: allStores } = await supabase.from("stores").select("id, name").order("name");

  return (
    <div className="nox-mv1">
      <MasterPageHead
        eyebrow="BUSINESS HOURS"
        title="営業時間・定休日"
        desc="曜日ごとの営業時間と定休日。シフト登録の警告・ブロックに使われます。"
      />
      <BusinessHoursPanel stores={(allStores ?? []) as { id: string; name: string }[]} />
    </div>
  );
}
