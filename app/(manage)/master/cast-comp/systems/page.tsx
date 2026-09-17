import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import { systemUsageOf } from "@/lib/nox/store-systems";
import SystemsBoard from "./systems-board";

export const dynamic = "force-dynamic";

// マスタ「報酬制度」（裁定269-7／270-2）: 店舗の「使う制度」9 フラグ（stores.settings_json.sys_*・mig0147）を切り替える実ページ。
//   器は register/page.tsx（キャスト会計の許可）の写経＝role ガード → 先頭店 → settings_json → client board。
//   269-3 用の使用数は cast_plan（overrides_json）と cast_norms を読んで純関数 systemUsageOf で数える（新しい判定式なし）。
//   manager は閲覧のみ（店舗設定と同じ権限＝真の防御は set_store_profile の owner 限定）。
export default async function CastCompSystemsPage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, name, settings_json").order("name").limit(1);
  const store = stores?.[0];
  const storeId = (store?.id as string | undefined) ?? "";
  if (!storeId) redirect("/master");
  const settings = (store?.settings_json ?? {}) as Record<string, unknown>;
  const [{ data: castPlans }, { data: castNorms }] = await Promise.all([
    supabase.from("cast_plan").select("cast_id, overrides_json").eq("store_id", storeId),
    supabase.from("cast_norms").select("cast_id, days_target, dohan_target, sales_target, shimei_target").eq("store_id", storeId),
  ]);
  const usage = systemUsageOf({
    castPlans: (castPlans ?? []) as { cast_id: string; overrides_json: unknown }[],
    castNorms: (castNorms ?? []) as { cast_id: string; days_target: number | null; dohan_target: number | null; sales_target: number | null; shimei_target: number | null }[],
  });
  return (
    <SystemsBoard
      storeId={storeId}
      storeName={(store?.name as string | undefined) ?? ""}
      isOwner={role === "owner"}
      initialSettings={settings}
      usage={usage}
    />
  );
}
