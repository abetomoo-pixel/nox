import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import { rules0175On } from "@/lib/nox/rules-0175/flag"; // ★追補 3 R-8
import StaffBoard from "./staff-board";
import { STAFF_WORK_HREF, staffTabOf } from "@/lib/nox/staff/tabs";

export const dynamic = "force-dynamic";

// スタッフ管理（F3a 束3 UI・owner/manager のみ）。staff は nav 非表示＋直打ちはリダイレクト
// （真の防御は RPC ゲート＝set_staff_perms/staff_* 6本が staff/cast を forbidden・memberships RLS）。
// 一覧は memberships＋users の直接 SELECT（束3-1 の裁定＝read RPC 不採用・既存 memberships_select で
// owner=org 全店/manager=自店が読める）。stores も RLS 同スコープ＝owner は全店 select が配属先候補になる。
// ★0172（裁定356・便 P172）: ?tab=work＝勤怠・報酬タブ（読取のみ・staff-work-panel）。既定＝一覧（従来どおり StaffBoard）。タブの解決＝lib/nox/staff/tabs.ts（page から export しない）。
// ★M-64（2026-11-04 Agoora 決定）: 勤怠・報酬のタブは外した。正本＝給与 › 勤怠（スタッフ）（STAFF_WORK_HREF）。古い ?tab=work はそこへ redirect・一覧の上に案内のリンク 1 行。
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const supabase = await createClient();
  const { role, roleRaw } = await getSessionRole();
  if (role !== "owner" && role !== "manager") redirect("/register");
  if (staffTabOf((await searchParams).tab) === "work") redirect(STAFF_WORK_HREF); // ★M-64
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: stores } = await supabase.from("stores").select("id, name").order("name");
  const { data: myStoreId } = await supabase.rpc("auth_store_id");
  // ★M-64: タブの代わりに案内 1 行（勤怠の正本は 給与 › 勤怠（スタッフ））
  const tabs = (
    <p data-staff-work-link="1" style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 12px" }}>勤怠は <Link href={STAFF_WORK_HREF} className="nox-link">給与 › 勤怠（スタッフ）</Link> で見ます（出勤・退勤の修正と月の確定もそこで）。</p>
  );
  return (
    <StaffBoard
      isOwner={role === "owner"}
      roleRaw={rules0175On() ? (roleRaw ?? role ?? "") : (role ?? "")} // ★追補 3 R-8（裁定425 候補）: 本来の役割（admin）＝任命・解除の出し分け
      stores={(stores ?? []) as { id: string; name: string }[]}
      myStoreId={(myStoreId as string | null) ?? ""}
      myAuthUserId={user?.id ?? ""}
      tabs={tabs}
    />
  );
}
