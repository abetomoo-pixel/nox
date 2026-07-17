import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import AuditBoard from "./audit-board";

export const dynamic = "force-dynamic";

// 監査ログ（A1・裁定8 N1-a）。owner 限定（真の防御は audit_logs RLS＝owner 限定 SELECT 1本のみ
// =mig0002・G6 恒久 assert。非 owner が直打ちしても 0行）。読取専用＝書込 RPC なし。
// actor 名の解決は users を owner 可視の範囲で引く（見えない場合は id 断片表示＝fail-closed）。
export default async function AuditPage() {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role !== "owner") redirect("/dashboard");
  const supabase = await createClient();
  const { data: users } = await supabase.from("users").select("id, name");
  const { data: stores } = await supabase.from("stores").select("id, name");
  return (
    <AuditBoard
      users={(users ?? []) as { id: string; name: string }[]}
      stores={(stores ?? []) as { id: string; name: string }[]}
    />
  );
}
