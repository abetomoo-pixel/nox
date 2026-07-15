import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/nox/auth";
import { createClient } from "@/lib/supabase/server";
import PayrollBoard from "./payroll-board";

// 給与確定画面（manager+ のみ）。layout は cast を /mine へ redirect 済み。staff はここで弾く。
// 真の防御は payroll_finalize の service_role 限定＋route の manager+ 検証（ここは利便のリダイレクト）。
export default async function PayrollPage() {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role !== "owner" && role !== "manager") redirect("/register");
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, name").order("name");
  return <PayrollBoard stores={(stores ?? []) as { id: string; name: string }[]} isOwner={role === "owner"} />;
}
