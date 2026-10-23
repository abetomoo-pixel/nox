import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import { rules0175On } from "@/lib/nox/rules-0175/flag"; // ★追補 3 R-8
import StaffBoard from "./staff-board";
import StaffWorkPanel from "./staff-work-panel";
import PageHead from "@/components/ui/page-head";
import * as t from "@/lib/nox/ui/theme";
import { STAFF_TABS, staffTabOf } from "@/lib/nox/staff/tabs";

export const dynamic = "force-dynamic";

// スタッフ管理（F3a 束3 UI・owner/manager のみ）。staff は nav 非表示＋直打ちはリダイレクト
// （真の防御は RPC ゲート＝set_staff_perms/staff_* 6本が staff/cast を forbidden・memberships RLS）。
// 一覧は memberships＋users の直接 SELECT（束3-1 の裁定＝read RPC 不採用・既存 memberships_select で
// owner=org 全店/manager=自店が読める）。stores も RLS 同スコープ＝owner は全店 select が配属先候補になる。
// ★0172（裁定356・便 P172）: ?tab=work＝勤怠・報酬タブ（読取のみ・staff-work-panel）。既定＝一覧（従来どおり StaffBoard）。タブの解決＝lib/nox/staff/tabs.ts（page から export しない）。
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const supabase = await createClient();
  const { role, roleRaw } = await getSessionRole();
  if (role !== "owner" && role !== "manager") redirect("/register");
  const tab = staffTabOf((await searchParams).tab);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: stores } = await supabase.from("stores").select("id, name").order("name");
  const { data: myStoreId } = await supabase.rpc("auth_store_id");
  const tabs = (
    <div role="tablist" aria-label="スタッフ" data-staff-tabs="1" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      {STAFF_TABS.map(([k, label, href]) => (
        <Link key={k} href={href} role="tab" aria-selected={tab === k} data-staff-tab={k}
          style={{ ...(tab === k ? t.btnGold : t.btnGhost), ...t.btnSm, minHeight: 44, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>{label}</Link>
      ))}
    </div>
  );
  if (tab === "work") {
    return (
      <div className="nox-mv1 nox-mv1-m">
        <PageHead eyebrow="STAFF WORK" title="スタッフ › 勤怠・報酬" desc="店の端末で打刻した出勤・退勤と、契約にもとづく報酬の見込み。" />
        {tabs}
        <StaffWorkPanel scope="store" stores={(stores ?? []) as { id: string; name: string }[]} />
      </div>
    );
  }
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
