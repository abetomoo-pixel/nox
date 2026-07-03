import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import RegisterBoard from "./register-board";

export const dynamic = "force-dynamic";

// レジ（staff/manager/owner）。SELECT はパターン2（checks 系・seats）＋パターン3（products）＋casts。
// role は layout と React cache 共有＝auth_role() rpc は1回/リクエストを維持。
export default async function RegisterPage() {
  const supabase = await createClient();
  const { role } = await getSessionRole();
  const { data: seats } = await supabase
    .from("seats")
    .select("id, name, kind")
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
  return (
    <RegisterBoard
      seats={seats ?? []}
      products={products ?? []}
      casts={casts ?? []}
      isManagerUp={role === "owner" || role === "manager"}
    />
  );
}
