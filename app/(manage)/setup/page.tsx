import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import { mineSettingsOf } from "@/lib/nox/store/mine-settings";
import type { V5Type } from "@/lib/nox/setup/v5";
import SetupWizard from "./setup-wizard";
import SetupWaiting from "./setup-waiting"; // ★便 SU（M-37 (3)）: manager／staff の案内

export const dynamic = "force-dynamic";

// 初期設定ウィザード v5（★便 OB-2・2026-10-29・9 STEP＝docs/handoff/mock/setup_v5.html が正本）。owner のみ。対象店＝settings_json.setup_done !== true の先頭店（無ければ先頭店＝再実行）。
//   server は現値（料金の丸め・時間課金の方式・領収書の表記・キャスト画面の 8 キー・税設定の現値・冪等ガード用の件数）を読むだけ＝書込は client の計画（lib/nox/setup/v5.ts）。
//   ?step=1〜9（深いリンク）・?type=cabaret（業態が未選択ならその初期値＝suite・actions-center 用）。
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string; type?: string }> }) {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role === "cast") redirect("/mine");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("id, name, settings_json, round_unit, round_mode, time_mode, time_per, business_tax_status, price_display, invoice_status, invoice_reg_no, tax_rounding, card_surcharge_rate")
    .order("name");
  const rows = (stores ?? []) as Array<{ id: string; name: string; settings_json: Record<string, unknown> | null; round_unit: number; round_mode: string; time_mode: string; time_per: string; business_tax_status?: string | null; price_display?: string | null; invoice_status?: string | null; invoice_reg_no?: string | null; tax_rounding?: string | null; card_surcharge_rate?: number | null }>;
  const target = rows.find((r) => r.settings_json?.setup_done !== true) ?? rows[0];
  if (!target) redirect("/master");
  if (role !== "owner") return <SetupWaiting storeName={target.name} />; // ★便 SU（M-37 (3)）: manager／staff は /setup で待つ（layout が他画面を /setup へ戻す＝ループしない）
  const [{ count: seats }, { count: products }, { count: plans }, { count: rules }] = await Promise.all([
    supabase.from("seats").select("id", { count: "exact", head: true }).eq("store_id", target.id),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", target.id),
    supabase.from("comp_plans").select("id", { count: "exact", head: true }).eq("store_id", target.id),
    supabase.from("pricing_rules").select("id", { count: "exact", head: true }).eq("store_id", target.id),
  ]);
  const sj = target.settings_json ?? {};
  const str = (k: string) => (typeof sj[k] === "string" ? (sj[k] as string) : "");
  const stepN = Number(sp.step ?? ""); const initialStep = Number.isInteger(stepN) && stepN >= 1 && stepN <= 9 ? stepN - 1 : undefined;
  const initialType = ["cabaret", "girlsbar", "snack", "lounge", "bar"].includes(sp.type ?? "") ? (sp.type as V5Type) : (typeof sj.biz_type === "string" && ["cabaret", "girlsbar", "snack", "lounge", "bar"].includes(sj.biz_type) && sj.setup_done !== true ? (sj.biz_type as V5Type) : null);
  return (
    <SetupWizard
      store={{ id: target.id, name: target.name, setupDone: target.settings_json?.setup_done === true,
        current: {
          round_unit: target.round_unit, round_mode: target.round_mode, time_mode: target.time_mode, time_per: target.time_per,
          receipt: { address: str("receipt_address"), tel: str("receipt_tel"), reg_no: str("invoice_reg_no"), footer: str("receipt_footer") }, // set_store_receipt_profile の 4 引数明示送信（原則7）
          mine: mineSettingsOf(sj), // set_store_mine_settings の差分元（326 の 8 キー）
          tax: { business_tax_status: String(target.business_tax_status ?? "taxable"), price_display: String(target.price_display ?? "tax_included"), invoice_status: String(target.invoice_status ?? "unregistered"), invoice_reg_no: (target.invoice_reg_no as string | null) ?? null, tax_rounding: String(target.tax_rounding ?? "floor"), card_surcharge_rate: (target.card_surcharge_rate as number | null) ?? null },
        } }}
      counts={{ seats: seats ?? 0, products: products ?? 0, plans: plans ?? 0, rules: rules ?? 0 }}
      isOwner={role === "owner"}
      initialStep={initialStep}
      initialType={initialType}
    />
  );
}
