import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import NoticesBoard from "./notices-board";

export const dynamic = "force-dynamic";

// お知らせ（F3e・mig0034）。owner/manager 投稿・編集・削除／staff 閲覧のみ。
// 可視範囲は notices RLS（P3・store_id=auth_store_id() かつ cast は all/cast のみ）が物理保証。
// 投稿権限の真の防御は notice_* RPC（owner/manager のみ）＝ここは表示制御（利便）。cast は layout で /mine へ。
//
// ★DP3 P1補（2026-08-21・裁定 DP3-⑤）: 宛先の人数を server で数えて props で渡す。
//   ★`count: "exact", head: true` ＝**行は取らずヘッダの件数だけ**を受け取る（+2 クエリ）。
//     categories / stock ページと同じ `initial` 流儀で、client 側の取得は増やさない。
//   ★可視範囲は RLS 任せ（casts・memberships とも自店スコープ）＝ここに store 条件は書かない。
//   ★数えるのは **is_active のみ**＝退店済み・無効メンバーは宛先に数えない。
//   ★失敗しても画面は開く（null → 画面側が「—」に落とす）＝人数は補助情報で、投稿の可否には関わらない。
export default async function NoticesPage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";

  const supabase = await createClient();
  const [castRes, memRes] = await Promise.all([
    supabase.from("casts").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("memberships").select("id, role", { count: "exact", head: true }).eq("is_active", true).eq("role", "staff"),
  ]);

  return (
    <NoticesBoard
      isManagerUp={isManagerUp}
      audienceCounts={{ cast: castRes.count ?? null, staff: memRes.count ?? null }}
    />
  );
}
