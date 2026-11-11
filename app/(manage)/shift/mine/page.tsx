import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import ScheduleCard from "@/app/mine/schedule-card";
import { myStaffScheduleOf } from "@/lib/nox/staff/my-shift-server";
import { managePageGate } from "@/lib/nox/nav/page-gate";

export const dynamic = "force-dynamic";

// ★M-160（2026-11-11・Agoora 確定）: スタッフ・店長の「自分のシフト」＝自分の分だけの一覧（今月／来月・確定と申請済みの希望）。
//   シフトの権限（can_shift）が無いスタッフも開ける＝シフトの全体の表は見えないまま（/shift は今までどおり権限で出し分け）。キャストは /mine。
//   置き場は /shift/mine（ナビの「シフト」に当たる＝verify:nox-m2 (15-3) の「全画面がナビのどれかに当たる」）。
export default async function MyShiftPage() {
  await managePageGate(); // ★教訓142（2026-11-11）: 柵（キャストの入場・規約・初期設定）はページの先頭で＝画面の移動でも効く
  const { role } = await getSessionRole();
  if (role !== "staff" && role !== "manager") redirect(role === "cast" ? "/mine" : "/dashboard");
  const supabase = await createClient();
  const { data: st } = await supabase.from("stores").select("settings_json").order("name").limit(1);
  const sj = (st?.[0]?.settings_json ?? {}) as Record<string, unknown>;
  const cutoff = typeof sj.biz_cutoff_hm === "string" && sj.biz_cutoff_hm ? (sj.biz_cutoff_hm as string) : "06:00";
  const my = await myStaffScheduleOf(supabase, cutoff);
  return (
    <div className="nox-mv1" data-my-shift-page="1">
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 10px" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>自分のシフト</h1>
        <Link href="/dashboard" className="nox-link" style={{ marginLeft: "auto", fontSize: 12.5 }}>ホームへ</Link>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 12px" }}>確定したシフトと、提出した希望（申請済み）です。確定前の調整中のシフトは、確定してから出ます。</p>
      {my ? <ScheduleCard tabs={my.tabs} readOnly title="自分のシフト" wishHref={null} emptyText="確定したシフトはまだありません" />
        : <p style={{ fontSize: 13, color: "var(--sub)" }}>シフトを読み込めませんでした</p>}
    </div>
  );
}
