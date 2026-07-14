import { getSessionRole } from "@/lib/nox/auth";
import NoticesBoard from "./notices-board";

export const dynamic = "force-dynamic";

// お知らせ（F3e・mig0034）。owner/manager 投稿・編集・削除／staff 閲覧のみ。
// 可視範囲は notices RLS（P3・store_id=auth_store_id() かつ cast は all/cast のみ）が物理保証。
// 投稿権限の真の防御は notice_* RPC（owner/manager のみ）＝ここは表示制御（利便）。cast は layout で /mine へ。
export default async function NoticesPage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  return <NoticesBoard isManagerUp={isManagerUp} />;
}
