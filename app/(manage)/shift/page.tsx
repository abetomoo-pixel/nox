import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import ShiftBoard from "./shift-board";

export const dynamic = "force-dynamic";

// シフト管理（staff=閲覧＋出勤板のみ・manager 以上=採否/確定/必要人数）。
// F1 は先頭店固定（owner のマルチ店舗切替は F4）。
export default async function ShiftPage() {
  const supabase = await createClient();
  const { role } = await getSessionRole();
  const { data: stores } = await supabase.from("stores").select("id, name").order("name").limit(1);
  const { data: casts } = await supabase.from("casts").select("id, name").eq("is_active", true).order("name");
  return (
    <ShiftBoard
      storeId={stores?.[0]?.id ?? ""}
      casts={casts ?? []}
      isManagerUp={role === "owner" || role === "manager"}
    />
  );
}
