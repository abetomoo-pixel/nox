import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import CustomerDetail from "./customer-detail";

export const dynamic = "force-dynamic";

// 顧客詳細（F3b-A 塊2-2＋F3b-B-1 担当割当）。集計=customer_summary・履歴=customer_visit_history
// （mig0028）・実体属性=customers 直 SELECT（RLS）・編集=customer_update・
// 担当付け替え=customer_assign_cast（owner/manager のみ・真の防御は RPC 側ゲート）。
// 可視は RPC/RLS が物理保証＝ここの redirect は利便（一覧と同型・staff は can_crm のみ）。
// casts は担当名の解決（is_active で絞らない＝退店 cast が担当のままの客も名前を出す）と
// 付け替え候補（store_id∧is_active でクライアント側絞り）の兼用。
export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) {
    const { data: canCrm } = role === "staff" ? await supabase.rpc("auth_staff_can_crm") : { data: false };
    if (canCrm !== true) redirect("/register");
  }
  const { data: casts } = await supabase.from("casts").select("id, name, store_id, is_active");
  return (
    <CustomerDetail
      customerId={id}
      casts={(casts ?? []) as { id: string; name: string; store_id: string; is_active: boolean }[]}
      canAssign={isManagerUp}
    />
  );
}
