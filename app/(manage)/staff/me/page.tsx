import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import PageHead from "@/components/ui/page-head";
import StaffWorkPanel from "../staff-work-panel";

export const dynamic = "force-dynamic";

// ★0172（裁定356・便 P172・2026-10-16）: スタッフ本人の勤怠・報酬（/mine 相当・読取のみ）。staff／manager／owner が自分の行を見る
//   （RLS＝staff_contracts／staff_punches は本人の membership 行・memberships_select は自分の行）。cast は /mine へ。
export default async function StaffMePage() {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role === "cast") redirect("/mine");
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, name").order("name");
  return (
    <div className="nox-mv1 nox-mv1-m">
      <PageHead eyebrow="MY WORK" title="自分の勤怠・報酬" desc="店の端末で打刻した出勤・退勤と、契約にもとづく報酬の見込みです（確定は店が行います）。" />
      <StaffWorkPanel scope="me" stores={(stores ?? []) as { id: string; name: string }[]} />
    </div>
  );
}
