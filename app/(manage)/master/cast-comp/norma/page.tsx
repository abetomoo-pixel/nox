import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import NormaBoard from "./norma-board";

export const dynamic = "force-dynamic";

// ノルマ設定（D2-2）。店フラグ（settings_json）の読みは master/page.tsx の旧実装を移設。
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
    <NormaBoard
      storeId={storeId}
      isManagerUp={isManagerUp}
      isOwner={role === "owner"}
      flags={{
        salesEnabled: sj?.sales_norm_enabled === true,
        shimeiEnabled: sj?.shimei_norm_enabled === true,
        shimeiScope,
      }}
    />
  );
}
