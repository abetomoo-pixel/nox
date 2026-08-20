import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import ReceiptsBoard from "./receipts-board";

export const dynamic = "force-dynamic";

// 領収書 発行台帳（R2-c mig0099・owner/manager のみ）。
//   一覧は receipt_issues 直読（RLS select = owner/manager 自店＝二重防御）・void は receipt_issue_void 結線。
export default async function ReceiptsPage() {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role !== "owner" && role !== "manager") redirect("/register");
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, name").order("name");
  return <ReceiptsBoard stores={(stores ?? []) as { id: string; name: string }[]} />;
}
