import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import CustomersBoard from "./customers-board";

export const dynamic = "force-dynamic";

// 顧客一覧（F3b-A 塊1）。データ源は customer_list_summary（mig0023・definer 集計）＝
// owner=org 全店（p_store_id 絞り任意）/manager=自店/staff=自店∧can_crm/cast=担当客のみ。
// ここの redirect は利便＝真の防御は RPC 内の可視ガード（staff can_crm なしは 0行）。
// casts は担当名の解決用（is_active で絞らない＝退店 cast が担当のままの客も名前を出す）。
export default async function CustomersPage() {
  const supabase = await createClient();
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) {
    const { data: canCrm } = role === "staff" ? await supabase.rpc("auth_staff_can_crm") : { data: false };
    if (canCrm !== true) redirect("/register");
  }
  const { data: stores } = await supabase.from("stores").select("id, name").order("name");
  const { data: casts } = await supabase.from("casts").select("id, name, store_id, is_active");
  const { data: myStoreId } = await supabase.rpc("auth_store_id");
  return (
    <CustomersBoard
      isOwner={role === "owner"}
      isManagerUp={isManagerUp}
      stores={(stores ?? []) as { id: string; name: string }[]}
      casts={(casts ?? []) as { id: string; name: string; store_id: string; is_active: boolean }[]}
      myStoreId={(myStoreId as string | null) ?? ""}
    />
  );
}
