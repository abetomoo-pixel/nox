import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import StaffBoard from "./staff-board";

export const dynamic = "force-dynamic";

// スタッフ管理（F3a 束3 UI・owner/manager のみ）。staff は nav 非表示＋直打ちはリダイレクト
// （真の防御は RPC ゲート＝set_staff_perms/staff_* 6本が staff/cast を forbidden・memberships RLS）。
// 一覧は memberships＋users の直接 SELECT（束3-1 の裁定＝read RPC 不採用・既存 memberships_select で
// owner=org 全店/manager=自店が読める）。stores も RLS 同スコープ＝owner は全店 select が配属先候補になる。
export default async function StaffPage() {
  const supabase = await createClient();
  const { role } = await getSessionRole();
  if (role !== "owner" && role !== "manager") redirect("/register");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: stores } = await supabase.from("stores").select("id, name").order("name");
  const { data: myStoreId } = await supabase.rpc("auth_store_id");
  return (
    <StaffBoard
      isOwner={role === "owner"}
      stores={(stores ?? []) as { id: string; name: string }[]}
      myStoreId={(myStoreId as string | null) ?? ""}
      myAuthUserId={user?.id ?? ""}
    />
  );
}
