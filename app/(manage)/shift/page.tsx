import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import ShiftBoard from "./shift-board";

export const dynamic = "force-dynamic";

// シフト管理（staff=閲覧＋出勤板のみ・manager 以上=採否/確定/必要人数）。
// F1 は先頭店固定（owner のマルチ店舗切替は F4）。
export default async function ShiftPage() {
  const supabase = await createClient();
  const { role } = await getSessionRole();
  const { data: stores } = await supabase.from("stores").select("id, name, settings_json").order("name").limit(1);
  // 段P: photo_updated_at を追加（日詳細のアバターを写真にするため。null=写真なし＝頭文字にフォールバック）。
  const { data: casts } = await supabase
    .from("casts")
    .select("id, name, photo_updated_at")
    .eq("is_active", true)
    .order("name");
  return (
    <ShiftBoard
      storeId={stores?.[0]?.id ?? ""}
      casts={casts ?? []}
      isManagerUp={role === "owner" || role === "manager"}
      cutoff={(() => {
        // ★mig0106（起票#14）: 営業日切替時刻は店設定（既定 06:00）＝dashboard/page.tsx と同型。
        const sj = (stores?.[0]?.settings_json ?? {}) as Record<string, unknown>;
        return typeof sj.biz_cutoff_hm === "string" && sj.biz_cutoff_hm ? (sj.biz_cutoff_hm as string) : "06:00";
      })()}
    />
  );
}
