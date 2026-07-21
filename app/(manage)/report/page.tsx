import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import ReportBoard from "./report-board";

export const dynamic = "force-dynamic";

// 日報（staff=閲覧・manager 以上=締め/再締め）。
// プレビュー集計はクライアント TS＋biz-date 純関数（daily_report_aggregate は内部専用のまま＝呼ばない）。
export default async function ReportPage() {
  const supabase = await createClient();
  const { role } = await getSessionRole();
  // cutoff は settings_json（E1 対象外）／card_tax_rate は stores 列（E1 mig0051 で移行）。
  const { data: stores } = await supabase.from("stores").select("id, name, settings_json, card_tax_rate").order("name").limit(1);
  const store = stores?.[0];
  const settings = (store?.settings_json ?? {}) as Record<string, unknown>;
  return (
    <ReportBoard
      storeId={store?.id ?? ""}
      cutoff={typeof settings.biz_cutoff_hm === "string" && settings.biz_cutoff_hm ? (settings.biz_cutoff_hm as string) : "06:00"}
      cardTaxRate={Number(store?.card_tax_rate ?? 5)}
      isManagerUp={role === "owner" || role === "manager"}
    />
  );
}
