import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import DashboardBoard from "./dashboard-board";

export const dynamic = "force-dynamic";

// ホーム（E5・裁定8 N1-a）。モック dashboard の翻訳＝KPI/承認待ち/本日の出勤キャスト/ランキング。
// 全カード既存 RPC・既存 RLS の読取のみ（DB 非改変）。staff は RLS/RPC ゲートの範囲で見える分だけ
// 表示される（fail-closed＝0行なら空・drink-claim-queue は 0件で自動非表示）。
// IP 管理カード（モック dashboard 先頭）は E3+E2（N1-d）で追加＝ここでは作らない。
// cast は (manage) layout が /mine へ戻すが、直 render 防止に page でも弾く（防御は二重・真の防御は RLS）。
export default async function DashboardPage() {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role === "cast") redirect("/mine");
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, name, settings_json").order("name").limit(1);
  const store = stores?.[0];
  const settings = (store?.settings_json ?? {}) as Record<string, unknown>;
  const { data: casts } = await supabase.from("casts").select("id, name").eq("is_active", true).order("name");
  return (
    <DashboardBoard
      storeId={store?.id ?? ""}
      storeName={store?.name ?? ""}
      cutoff={typeof settings.biz_cutoff_hm === "string" && settings.biz_cutoff_hm ? (settings.biz_cutoff_hm as string) : "06:00"}
      casts={(casts ?? []) as { id: string; name: string }[]}
    />
  );
}
