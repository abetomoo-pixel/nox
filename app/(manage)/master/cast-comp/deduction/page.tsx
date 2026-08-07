import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import DeductionBoard from "./deduction-board";

export const dynamic = "force-dynamic";

// 控除・送りの設定（D2-3）。okuri_mode/okuri_base と casts の読みは master/page.tsx の旧実装を移設。
export default async function CastCompDeductionPage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, settings_json").order("name").limit(1);
  const store = stores?.[0];
  const storeId = (store?.id as string | undefined) ?? "";
  if (!storeId) redirect("/master");
  const sj = store?.settings_json as Record<string, unknown> | null;
  const okuriMode: "flat" | "actual" = sj?.okuri_mode === "actual" ? "actual" : "flat";
  const okuriBase = typeof sj?.okuri_base_amount === "number" && sj.okuri_base_amount > 0 ? (sj.okuri_base_amount as number) : 0;
  const { data: casts } = await supabase.from("casts").select("id, name")
    .eq("store_id", storeId).eq("is_active", true).order("name");
  return (
    <DeductionBoard
      storeId={storeId}
      isManagerUp={isManagerUp}
      isOwner={role === "owner"}
      casts={(casts ?? []) as { id: string; name: string }[]}
      okuriMode={okuriMode}
      okuriBase={okuriBase}
    />
  );
}
