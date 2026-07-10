import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import RegisterBoard from "./register-board";

export const dynamic = "force-dynamic";

// レジ（staff/manager/owner）。SELECT はパターン2（checks 系・seats）＋パターン3（products）＋casts。
// role は layout と React cache 共有＝auth_role() rpc は1回/リクエストを維持。
// F3a-3: 予約タブ（canonical の register 3タブ目）。表示は owner/manager/staff(can_crm)＝
// 表示制御は利便・真の防御は reservations RLS と予約 RPC ゲート。cast は layout で /mine へ。
export default async function RegisterPage() {
  const supabase = await createClient();
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  const { data: seats } = await supabase
    .from("seats")
    .select("id, name, kind, store_id")
    .eq("is_active", true)
    .order("sort_order");
  const { data: products } = await supabase
    .from("products")
    .select("id, name, type, price")
    .eq("is_active", true)
    .order("type");
  const { data: casts } = await supabase
    .from("casts")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  // 予約タブの可視判定（staff は can_crm）と予約作成先の店（自分の membership の店）
  const { data: canCrm } = role === "staff" ? await supabase.rpc("auth_staff_can_crm") : { data: false };
  const { data: myStoreId } = await supabase.rpc("auth_store_id");
  return (
    <RegisterBoard
      seats={seats ?? []}
      products={products ?? []}
      casts={casts ?? []}
      isManagerUp={isManagerUp}
      showReserve={isManagerUp || canCrm === true}
      storeId={(myStoreId as string | null) ?? ""}
    />
  );
}
