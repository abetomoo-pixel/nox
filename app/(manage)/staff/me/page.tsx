import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import PageHead from "@/components/ui/page-head";
import StaffWorkPanel from "../staff-work-panel";
import { managePageGate } from "@/lib/nox/nav/page-gate";

export const dynamic = "force-dynamic";

// ★0172（裁定356・便 P172・2026-10-16）: スタッフ本人の勤怠・報酬（/mine 相当・読取のみ）。staff／manager／owner が自分の行を見る
//   （RLS＝staff_contracts／staff_punches は本人の membership 行・memberships_select は自分の行）。cast は /mine へ。
export default async function StaffMePage() {
  await managePageGate(); // ★教訓142（2026-11-11）: 柵（キャストの入場・規約・初期設定）はページの先頭で＝画面の移動でも効く
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role === "cast") redirect("/mine");
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, name").order("name");
  return (
    <div className="nox-mv1 nox-mv1-m">
      <PageHead eyebrow="MY WORK" title="自分の勤怠・報酬" desc="店の端末で打刻した出勤・退勤と、契約にもとづく報酬の見込みです（確定は店が行います）。" />
      <p style={{ margin: "0 0 12px", fontSize: 13 }}><a href="/staff/me/profile" className="nox-link" data-staff-me-edit="1">自分の情報を編集（連絡先・住所・緊急連絡先・PIN） ›</a></p>{/* ★M-177 */}
      <StaffWorkPanel scope="me" stores={(stores ?? []) as { id: string; name: string }[]} />
    </div>
  );
}
