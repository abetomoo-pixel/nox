import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import SetupWizard from "./setup-wizard";

export const dynamic = "force-dynamic";

// 初期設定ウィザード（裁定270-1／271）。owner のみ。対象店＝settings_json.setup_done !== true の先頭店（無ければ先頭店＝再実行）。
//   server は現値（料金の現値マージ用・setup 済み判定・冪等ガード用の件数・feature_flags の org 既定行）を読むだけ＝書込は client の計画実行。
export default async function SetupPage() {
  const { role } = await getSessionRole();
  if (role !== "owner") redirect(role === "cast" ? "/mine" : "/dashboard");
  const supabase = await createClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("id, name, settings_json, card_tax_rate, round_unit, round_mode, time_mode, time_per")
    .order("name");
  const rows = (stores ?? []) as Array<{ id: string; name: string; settings_json: Record<string, unknown> | null; card_tax_rate: number; round_unit: number; round_mode: string; time_mode: string; time_per: string }>;
  const target = rows.find((r) => r.settings_json?.setup_done !== true) ?? rows[0];
  if (!target) redirect("/master");
  const [{ count: seats }, { count: products }, { count: plans }, { count: rules }, { data: flags }] = await Promise.all([
    supabase.from("seats").select("id", { count: "exact", head: true }).eq("store_id", target.id),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", target.id),
    supabase.from("comp_plans").select("id", { count: "exact", head: true }).eq("store_id", target.id),
    supabase.from("pricing_rules").select("id", { count: "exact", head: true }).eq("store_id", target.id),
    supabase.from("feature_flags").select("key, enabled, store_id").is("store_id", null),
  ]);
  const flagRows = ((flags ?? []) as Array<{ key: string; enabled: boolean }>).map((f) => ({ key: f.key, enabled: f.enabled }));
  return (
    <SetupWizard
      store={{ id: target.id, name: target.name, setupDone: target.settings_json?.setup_done === true,
        current: { card_tax_rate: target.card_tax_rate, round_unit: target.round_unit, round_mode: target.round_mode, time_mode: target.time_mode, time_per: target.time_per } }}
      counts={{ seats: seats ?? 0, products: products ?? 0, plans: plans ?? 0, rules: rules ?? 0 }}
      orgFlags={flagRows}
    />
  );
}
