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
  // ★X-13-21（便 X-13d-1）: プラン側の値（comp_plans／comp_plan_components）も渡す＝割当だけのキャストを「使用中」に数える
  const [{ data: castPlans }, { data: castNorms }, { data: plans }, { data: comps }] = await Promise.all([
    supabase.from("cast_plan").select("cast_id, plan_id, overrides_json").eq("store_id", storeId),
    supabase.from("cast_norms").select("cast_id, days_target, dohan_target, sales_target, shimei_target").eq("store_id", storeId),
    supabase.from("comp_plans").select("id, base, hon_back, jonai_back, dohan_back, hon_back_mode, jonai_back_mode, dohan_back_mode, sales_slide, point_slide").eq("store_id", storeId),
    supabase.from("comp_plan_components").select("plan_id, kind, is_active").eq("store_id", storeId),
  ]);
  const usage = systemUsageOf({
    castPlans: (castPlans ?? []) as { cast_id: string; plan_id: string | null; overrides_json: unknown }[],
    castNorms: (castNorms ?? []) as { cast_id: string; days_target: number | null; dohan_target: number | null; sales_target: number | null; shimei_target: number | null }[],
    plans: (plans ?? []) as { id: string; base: number | null; hon_back: number | null; jonai_back: number | null; dohan_back: number | null; hon_back_mode: string | null; jonai_back_mode: string | null; dohan_back_mode: string | null; sales_slide: unknown; point_slide: unknown }[],
    components: (comps ?? []) as { plan_id: string; kind: string; is_active: boolean | null }[],
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
