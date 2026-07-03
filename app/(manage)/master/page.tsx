import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import MasterBoard from "./master-board";

export const dynamic = "force-dynamic";

// マスタ管理（manager/owner。staff は nav 非表示・直打ちでも操作 UI 非表示＋RPC 拒否）。
export default async function MasterPage() {
  const supabase = await createClient();
  const { role } = await getSessionRole();
  const { data: stores } = await supabase.from("stores").select("id, name").order("name").limit(1);
  return <MasterBoard storeId={stores?.[0]?.id ?? ""} isManagerUp={role === "owner" || role === "manager"} />;
}
