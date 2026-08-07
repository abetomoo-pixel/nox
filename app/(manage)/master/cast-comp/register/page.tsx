import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import CastRegisterPanel from "../../cast-register-panel";

export const dynamic = "force-dynamic";

// キャスト会計の許可（D2-1・カード1:1 の実ページ化）。castRegRows の組み立ては
// master/page.tsx の旧 panels.cast 実装を逐語移設（F3g 2段ゲート＝店フラグ＋個別 can_register）。
export default async function CastCompRegisterPage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, settings_json").order("name").limit(1);
  const store = stores?.[0];
  const storeId = (store?.id as string | undefined) ?? "";
  if (!storeId) redirect("/master");
  const castRegEnabled = (store?.settings_json as Record<string, unknown> | null)?.cast_register_enabled === true;
  const { data: casts } = await supabase.from("casts").select("id, name, user_id")
    .eq("store_id", storeId).eq("is_active", true).order("name");
  const castUserIds = (casts ?? []).map((c) => c.user_id).filter(Boolean) as string[];
  const { data: castMems } = castUserIds.length
    ? await supabase.from("memberships").select("id, user_id, can_register")
        .eq("store_id", storeId).eq("role", "cast").in("user_id", castUserIds)
    : { data: [] as { id: string; user_id: string; can_register: boolean }[] };
  const memByUser = new Map((castMems ?? []).map((m) => [m.user_id, m]));
  const castRegRows = (casts ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    membershipId: (memByUser.get(c.user_id)?.id as string | undefined) ?? null,
    canRegister: (memByUser.get(c.user_id)?.can_register as boolean | undefined) ?? false,
  }));
  return (
    <CastRegisterPanel
      storeId={storeId}
      isOwner={role === "owner"}
      initialEnabled={castRegEnabled}
      casts={castRegRows}
    />
  );
}
