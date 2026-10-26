import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import { mineSettingsOf } from "@/lib/nox/store/mine-settings";
import { opsProfileOf } from "@/lib/nox/store/ops-profile"; // ★0164（便 W5-2a）
import SetupWizard from "./setup-wizard";

export const dynamic = "force-dynamic";

// 初期設定ウィザード（裁定270-1／271 → 331 v5・便 W5-1）。owner のみ。対象店＝settings_json.setup_done !== true の先頭店（無ければ先頭店＝再実行）。
//   server は現値（料金の現値マージ用・領収書の表記 4 項目・キャスト画面の 8 キー・setup 済み判定・冪等ガード用の件数・feature_flags の org 既定行）を読むだけ＝書込は client の計画実行。
export default async function SetupPage() {
  const { role } = await getSessionRole();
  if (role !== "owner") redirect(role === "cast" ? "/mine" : "/dashboard");
  const supabase = await createClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("id, name, settings_json, card_tax_rate, round_unit, round_mode, time_mode, time_per, invoice_registered_on, pay_day, tax_inclusive_display, use_vip, use_counter, payment_methods, punch_methods, business_tax_status, price_display, invoice_status, invoice_reg_no, tax_rounding, card_surcharge_rate") /* ★OB 便: 税設定の現値 */ // ★0164（便 W5-2a）: 会計と運用の現値
    .order("name");
  const rows = (stores ?? []) as Array<{ id: string; name: string; settings_json: Record<string, unknown> | null; card_tax_rate: number; round_unit: number; round_mode: string; time_mode: string; time_per: string; business_tax_status?: string | null; price_display?: string | null; invoice_status?: string | null; invoice_reg_no?: string | null; tax_rounding?: string | null; card_surcharge_rate?: number | null }>; // ★OB 便: 税設定の 6 列
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
  const sj = target.settings_json ?? {};
  const str = (k: string) => (typeof sj[k] === "string" ? (sj[k] as string) : "");
  return (
    <SetupWizard
      store={{ id: target.id, name: target.name, setupDone: target.settings_json?.setup_done === true,
        current: {
          card_tax_rate: target.card_tax_rate, round_unit: target.round_unit, round_mode: target.round_mode, time_mode: target.time_mode, time_per: target.time_per,
          receipt: { address: str("receipt_address"), tel: str("receipt_tel"), reg_no: str("invoice_reg_no"), footer: str("receipt_footer") }, // set_store_receipt_profile の 4 引数明示送信（原則7）
          mine: mineSettingsOf(sj), // set_store_mine_settings の差分元（326 の 8 キー）
          ops: opsProfileOf(target as unknown as Record<string, unknown>), // ★0164（便 W5-2a）: 会計と運用（STEP 5）の初期値＝現値
          tax: { business_tax_status: String(target.business_tax_status ?? "taxable"), price_display: String(target.price_display ?? "tax_included"), invoice_status: String(target.invoice_status ?? "unregistered"), invoice_reg_no: (target.invoice_reg_no as string | null) ?? null, tax_rounding: String(target.tax_rounding ?? "floor"), card_surcharge_rate: (target.card_surcharge_rate as number | null) ?? null }, // ★OB 便
          okuriMode: typeof sj.okuri_mode === "string" && sj.okuri_mode ? (sj.okuri_mode as string) : null, // ★OB 便: 未設定＝新しい店の既定（定額徴収）を明示
        } }}
      counts={{ seats: seats ?? 0, products: products ?? 0, plans: plans ?? 0, rules: rules ?? 0 }}
      orgFlags={flagRows}
      isOwner={role === "owner"}
    />
  );
}
